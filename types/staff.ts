export interface Staff {
  id?: string;
  name: string;
  phone?: string;
  role: string;
  status: "Active" | "Inactive" | string;
  dutyStatus?: "onDuty" | "offDuty" | string;
  clockLogs?: { event: "clockIn" | "clockOut"; timestamp: any }[];
  targets?: {
    revenueMonthly: number;
    memberCountMonthly: number;
  };
  commissionRate?: number;
  isOwner?: boolean;
  createdAt?: string;
}