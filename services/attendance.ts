import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
} from "firebase/firestore";
import type { AttendanceRecord, AttendanceStatus, AttendanceSummary } from "@/types/attendance";
import { normalizeAttendanceStatus } from "@/types/attendance";
import { toLocalDateString } from "@/lib/utils/date";

const COLLECTION_NAME = "attendance";

export function getAttendanceDocId(employeeId: string, dateKey: string): string {
  return `${employeeId}_${dateKey}`;
}

/**
 * Get all attendance records for a specific local date key (e.g., 'YYYY-MM-DD')
 */
export async function getTodayAttendance(dateKey: string): Promise<Record<string, AttendanceRecord>> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("date", "==", dateKey)
    );
    const snap = await getDocs(q);
    const map: Record<string, AttendanceRecord> = {};
    snap.forEach((d) => {
      const data = d.data() as AttendanceRecord;
      map[data.employeeId] = { ...data, id: d.id };
    });
    return map;
  } catch (error) {
    console.error("Error fetching today's attendance:", error);
    return {};
  }
}

/**
 * Get single staff attendance for a given date
 */
export async function getStaffAttendanceForDate(
  employeeId: string,
  dateKey: string
): Promise<AttendanceRecord | null> {
  try {
    const docId = getAttendanceDocId(employeeId, dateKey);
    const docRef = doc(db, COLLECTION_NAME, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { ...snap.data(), id: snap.id } as AttendanceRecord;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching attendance for ${employeeId} on ${dateKey}:`, error);
    return null;
  }
}

/**
 * Mark daily attendance status for an employee.
 * Strictly maintains 1 record per employee per date without time tracking.
 */
export async function markAttendance(
  employeeId: string,
  employeeName: string,
  dateKey: string,
  status: "present" | "absent",
  notes?: string
): Promise<AttendanceRecord> {
  const docId = getAttendanceDocId(employeeId, dateKey);
  const docRef = doc(db, COLLECTION_NAME, docId);
  const now = new Date();

  let createdAt = now.toISOString();
  try {
    const existing = await getDoc(docRef);
    if (existing.exists() && existing.data()?.createdAt) {
      createdAt = existing.data().createdAt;
    }
  } catch {
    // ignore read error
  }

  const record: AttendanceRecord = {
    employeeId,
    employeeName,
    date: dateKey,
    status,
    notes: notes || "",
    createdAt,
    updatedAt: now.toISOString(),
  };

  await setDoc(docRef, record, { merge: true });

  // Sync dutyStatus on staff document if marking for today
  const todayKey = toLocalDateString(new Date());
  if (dateKey === todayKey) {
    const nextDuty = status === "present" ? "onDuty" : "offDuty";
    try {
      await updateDoc(doc(db, "staff", employeeId), { dutyStatus: nextDuty });
    } catch {
      // ignore
    }
  }

  return { ...record, id: docId };
}

/**
 * Backwards compatibility alias for markAttendance
 */
export async function markManualAttendance(
  employeeId: string,
  employeeName: string,
  dateKey: string,
  status: AttendanceStatus,
  _checkInAt: string | null = null,
  _checkOutAt: string | null = null,
  notes?: string
): Promise<AttendanceRecord> {
  const normalized = normalizeAttendanceStatus(status);
  const finalStatus: "present" | "absent" = normalized === "ABSENT" ? "absent" : "present";
  return markAttendance(employeeId, employeeName, dateKey, finalStatus, notes);
}

export interface AttendanceFilterOptions {
  date?: string; // YYYY-MM-DD
  month?: string; // YYYY-MM
  employeeId?: string;
  status?: AttendanceStatus | "All";
  limitCount?: number;
}

/**
 * Query attendance history with efficient queries and in-memory sorting/filtering
 */
export async function getAttendanceHistory(
  filters: AttendanceFilterOptions
): Promise<AttendanceRecord[]> {
  try {
    let q;
    if (filters.date) {
      q = query(collection(db, COLLECTION_NAME), where("date", "==", filters.date));
    } else if (filters.employeeId && filters.employeeId !== "all") {
      q = query(collection(db, COLLECTION_NAME), where("employeeId", "==", filters.employeeId));
    } else if (filters.month) {
      const startOfMonth = `${filters.month}-01`;
      const endOfMonth = `${filters.month}-31`;
      q = query(
        collection(db, COLLECTION_NAME),
        where("date", ">=", startOfMonth),
        where("date", "<=", endOfMonth)
      );
    } else {
      q = query(collection(db, COLLECTION_NAME), limit(filters.limitCount || 100));
    }

    const snap = await getDocs(q);
    let records: AttendanceRecord[] = [];
    snap.forEach((d) => {
      records.push({ ...(d.data() as AttendanceRecord), id: d.id });
    });

    // In-memory filters to prevent needing complex composite indexes
    if (filters.month && !filters.date && filters.employeeId && filters.employeeId !== "all") {
      const startOfMonth = `${filters.month}-01`;
      const endOfMonth = `${filters.month}-31`;
      records = records.filter((r) => r.date >= startOfMonth && r.date <= endOfMonth);
    }

    if (filters.employeeId && filters.employeeId !== "all") {
      records = records.filter((r) => r.employeeId === filters.employeeId);
    }

    if (filters.status && filters.status !== "All") {
      const targetNormalized = normalizeAttendanceStatus(filters.status);
      records = records.filter(
        (r) => normalizeAttendanceStatus(r.status) === targetNormalized
      );
    }

    records.sort((a, b) => b.date.localeCompare(a.date));

    if (filters.limitCount && records.length > filters.limitCount) {
      records = records.slice(0, filters.limitCount);
    }

    return records;
  } catch (error) {
    console.error("Error fetching attendance history:", error);
    return [];
  }
}

/**
 * Compute monthly attendance summary for an employee (Present vs Absent days)
 */
export async function getStaffAttendanceSummary(
  employeeId: string,
  monthKey: string // YYYY-MM
): Promise<AttendanceSummary> {
  try {
    const startOfMonth = `${monthKey}-01`;
    const endOfMonth = `${monthKey}-31`;

    const q = query(
      collection(db, COLLECTION_NAME),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    let presentDays = 0;
    let absentDays = 0;
    let totalRecorded = 0;

    snap.forEach((d) => {
      const data = d.data() as AttendanceRecord;
      if (data.date && data.date >= startOfMonth && data.date <= endOfMonth) {
        totalRecorded += 1;
        const normalized = normalizeAttendanceStatus(data.status);
        if (normalized === "PRESENT") {
          presentDays += 1;
        } else if (normalized === "ABSENT") {
          absentDays += 1;
        }
      }
    });

    const attendanceRate =
      totalRecorded > 0 ? Math.round((presentDays / totalRecorded) * 100) : 0;

    return {
      presentDays,
      absentDays,
      totalRecorded,
      attendanceRate,
    };
  } catch (error) {
    console.error(`Error computing summary for ${employeeId}:`, error);
    return {
      presentDays: 0,
      absentDays: 0,
      totalRecorded: 0,
      attendanceRate: 0,
    };
  }
}

/**
 * Get latest attendance records for a staff member (e.g., for profile modal)
 */
export async function getStaffRecentAttendance(
  employeeId: string,
  limitCount = 5
): Promise<AttendanceRecord[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("employeeId", "==", employeeId)
    );
    const snap = await getDocs(q);
    const list: AttendanceRecord[] = [];
    snap.forEach((d) => list.push({ ...(d.data() as AttendanceRecord), id: d.id }));
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limitCount);
  } catch (error) {
    console.error(`Error fetching recent attendance for ${employeeId}:`, error);
    return [];
  }
}
