export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "no-show"
  | "rescheduled"
  | "cancelled";

export interface Appointment {
  id?: string;
  customerId: string;
  date: string; // Format: YYYY-MM-DD
  startTime: string; // Format: HH:mm (Visit Time, e.g. "10:30")
  status: AppointmentStatus;
  notes?: string;
  reminderEnabled?: boolean;
  reminderMinutesBefore?: number; // e.g. 0 (Day of), 60 (1 hr), 30 (30 min)
  customerName?: string;
  customerPhone?: string;
  staffId?: string;
  staffName?: string;
  serviceId?: string;
  serviceName?: string;
  servicePrice?: number;
  duration?: number;
  endTime?: string;
  createdAt?: string;
  updatedAt?: string;
  rescheduledFromId?: string;
  completedInvoiceId?: string;
}
