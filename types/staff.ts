export interface Staff {
  id?: string;
  name: string;
  phone?: string;
  role: string;
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