export interface CreditBalance {
  id?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  
  // Original Invoice References
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  originalBillDate: string; // YYYY-MM-DD
  
  // Original Service Performer References
  originalStaffId: string;
  originalStaffName: string;
  originalStaffRole: string;
  
  // Original Service / Item References
  originalServiceId: string;
  originalServiceName: string;
  originalServiceAmount: number;
  

  // Outstanding Debt Ledgers
  creditAmount: number;
  remainingAmount: number;
  
  // Collection Metadata
  collectionStatus: "pending" | "partial" | "settled";
  collectionDate?: string | null;
  collectionMethod?: string | null;
  collectedBy?: string | null;
  
  createdAt: string;
  updatedAt: string;
  
  // Legacy logic fallbacks
  status?: "pending" | "settled";
  invoiceId?: string;
  invoiceNumber?: string;
  amount?: number;
  settledAt?: string | null;
  notes?: string | null;
  type: "service" | "product";
}
