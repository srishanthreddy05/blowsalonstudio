import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import type { Appointment, AppointmentStatus } from "@/types/appointment";

const COLLECTION_NAME = "appointments";

// Helper to strip undefined values so Firestore doesn't error
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

// Convert "HH:mm" to minutes from midnight
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export async function create(
  appointment: Omit<Appointment, "id">
): Promise<string> {
  try {
    const timestamp = new Date().toISOString();
    const docRef = await addDoc(
      collection(db, COLLECTION_NAME),
      stripUndefined({
        ...appointment,
        createdAt: appointment.createdAt || timestamp,
        updatedAt: appointment.updatedAt || timestamp,
      })
    );
    return docRef.id;
  } catch (error) {
    console.error("Error creating appointment:", error);
    throw error;
  }
}

export async function getAll(): Promise<Appointment[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy("date", "desc"),
      orderBy("startTime", "asc")
    );
    const querySnapshot = await getDocs(q);
    const appointments: Appointment[] = [];
    querySnapshot.forEach((doc) => {
      appointments.push({
        id: doc.id,
        ...doc.data(),
      } as Appointment);
    });
    return appointments;
  } catch (error) {
    console.warn("Falling back to un-ordered query for all appointments:", error);
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const appointments: Appointment[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Appointment));
      return appointments.sort((a, b) => {
        const dateCompare = (b.date || "").localeCompare(a.date || "");
        if (dateCompare !== 0) return dateCompare;
        return (a.startTime || "").localeCompare(b.startTime || "");
      });
    } catch (err) {
      console.error("Error in fallback getAll appointments:", err);
      return [];
    }
  }
}

export async function getByDate(date: string): Promise<Appointment[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("date", "==", date)
    );
    const querySnapshot = await getDocs(q);
    const appointments: Appointment[] = [];
    querySnapshot.forEach((doc) => {
      appointments.push({
        id: doc.id,
        ...doc.data(),
      } as Appointment);
    });
    return appointments.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  } catch (error) {
    console.error(`Error getting appointments for date (${date}):`, error);
    return [];
  }
}

export function subscribeByDate(
  date: string,
  onUpdate: (appointments: Appointment[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("date", "==", date)
    );
    return onSnapshot(
      q,
      (querySnapshot) => {
        const appointments: Appointment[] = [];
        querySnapshot.forEach((docSnap) => {
          appointments.push({
            id: docSnap.id,
            ...docSnap.data(),
          } as Appointment);
        });
        appointments.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        onUpdate(appointments);
      },
      (error) => {
        console.error(`Error subscribing to appointments for date (${date}):`, error);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.error(`Error creating appointments listener for date (${date}):`, error);
    if (onError) onError(error);
    return () => {};
  }
}

export async function getByDateRange(startDate: string, endDate: string): Promise<Appointment[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );
    const snap = await getDocs(q);
    const appointments: Appointment[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Appointment));
    return appointments.sort((a, b) => {
      const dateCompare = (a.date || "").localeCompare(b.date || "");
      if (dateCompare !== 0) return dateCompare;
      return (a.startTime || "").localeCompare(b.startTime || "");
    });
  } catch (error) {
    console.error(`Error getting appointments between ${startDate} and ${endDate}:`, error);
    return [];
  }
}

export async function getByCustomerId(customerId: string): Promise<Appointment[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("customerId", "==", customerId)
    );
    const snap = await getDocs(q);
    const appointments: Appointment[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Appointment));
    return appointments.sort((a, b) => {
      const dateCompare = (b.date || "").localeCompare(a.date || "");
      if (dateCompare !== 0) return dateCompare;
      return (b.startTime || "").localeCompare(a.startTime || "");
    });
  } catch (error) {
    console.error(`Error getting appointments for customer (${customerId}):`, error);
    return [];
  }
}

export async function getByStaffId(staffId: string): Promise<Appointment[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("staffId", "==", staffId)
    );
    const snap = await getDocs(q);
    const appointments: Appointment[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Appointment));
    return appointments.sort((a, b) => {
      const dateCompare = (b.date || "").localeCompare(a.date || "");
      if (dateCompare !== 0) return dateCompare;
      return (b.startTime || "").localeCompare(a.startTime || "");
    });
  } catch (error) {
    console.error(`Error getting appointments for staff (${staffId}):`, error);
    return [];
  }
}

export async function getById(id: string): Promise<Appointment | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Appointment;
    }
    return null;
  } catch (error) {
    console.error(`Error getting appointment by ID (${id}):`, error);
    return null;
  }
}

export async function update(
  id: string,
  data: Partial<Omit<Appointment, "id">>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const updatePayload = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(docRef, stripUndefined(updatePayload));
  } catch (error) {
    console.error(`Error updating appointment (${id}):`, error);
    throw error;
  }
}

export async function updateStatus(
  id: string,
  status: AppointmentStatus,
  extraData?: Partial<Appointment>
): Promise<void> {
  return update(id, { status, ...(extraData || {}) });
}

export async function reschedule(
  id: string,
  newDate: string,
  newVisitTime: string,
  reason?: string
): Promise<string> {
  try {
    const original = await getById(id);
    if (!original) {
      throw new Error(`Appointment with ID ${id} not found`);
    }

    // Mark original as rescheduled
    const rescheduleNote = reason
      ? `Rescheduled to ${newDate} at ${newVisitTime}. Reason: ${reason}`
      : `Rescheduled to ${newDate} at ${newVisitTime}`;

    await update(id, {
      status: "rescheduled",
      notes: original.notes
        ? `${original.notes}\n[${rescheduleNote}]`
        : `[${rescheduleNote}]`,
    });

    // Create new appointment linking back to original
    const newAppointmentId = await create({
      customerId: original.customerId,
      date: newDate,
      startTime: newVisitTime,
      status: "scheduled",
      notes: original.notes,
      reminderEnabled: original.reminderEnabled,
      reminderMinutesBefore: original.reminderMinutesBefore,
      customerName: original.customerName,
      customerPhone: original.customerPhone,
      rescheduledFromId: id,
    });

    return newAppointmentId;
  } catch (error) {
    console.error(`Error rescheduling appointment (${id}):`, error);
    throw error;
  }
}

async function deleteAppointment(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`Error deleting appointment (${id}):`, error);
    throw error;
  }
}

export { deleteAppointment as delete };
