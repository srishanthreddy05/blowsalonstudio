export type AttendanceStatus = "present" | "absent" | "Present" | "Absent";

export interface AttendanceRecord {
  id?: string;
  businessId?: string;
  employeeId: string;
  employeeName?: string;
  date: string; // YYYY-MM-DD local date key
  status: AttendanceStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceSummary {
  presentDays: number;
  absentDays: number;
  totalRecorded: number;
  attendanceRate: number; // percentage
}

export function normalizeAttendanceStatus(status?: string | null): "PRESENT" | "ABSENT" | "NOT_MARKED" {
  if (!status) return "NOT_MARKED";
  const s = status.toLowerCase().trim();
  if (s === "present" || s === "currently in" || s === "checked out" || s === "onduty") return "PRESENT";
  if (s === "absent" || s === "on leave" || s === "offduty") return "ABSENT";
  return "NOT_MARKED";
}
