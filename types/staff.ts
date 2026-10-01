export type StaffRole = "STYLIST" | "MANAGER";

export interface Staff {
  id?: string;
  name: string;
  phone?: string;
  role: StaffRole | string;
  salary?: number; // Base monthly salary
  status: "Active" | "Inactive" | string;
  dutyStatus?: "onDuty" | "offDuty" | string;
  clockLogs?: { event: "clockIn" | "clockOut"; timestamp: string | number | Date }[];
  targets?: {
    revenueMonthly: number;
    servicesMonthly: number;
  };
  createdAt?: string;
}

export function formatStaffRole(role?: string): "Stylist" | "Manager" {
  if (!role) return "Stylist";
  const normalized = role.trim().toUpperCase();
  if (normalized === "MANAGER") return "Manager";
  return "Stylist";
}

export function normalizeStaffRole(role?: string): StaffRole {
  if (!role) return "STYLIST";
  const normalized = role.trim().toUpperCase();
  if (normalized === "MANAGER") return "MANAGER";
  return "STYLIST";
}