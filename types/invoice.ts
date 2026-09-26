import type { ProductRow, ServiceRow } from "@/components/salon-dashboard/types";
import type { Timestamp } from "firebase/firestore";

export interface Invoice {
  id?: string;

  // ── Identity ──────────────────────────────────────────────────────────────
  invoiceNumber: string;            // e.g. "INV-2024-1001"  (was also stored as invoiceNo — now single field)
  appointmentId?: string;           // Firestore /appointments/{id} if originated from appointment
  appointmentDate?: string;         // e.g. "2026-09-26"
  appointmentTime?: string;         // e.g. "13:00"

  // ── Date ──────────────────────────────────────────────────────────────────
  // Stored as Firestore Timestamp so date-range queries and orderBy("date") work correctly.
  // Use toDate() when you need a JS Date, or serverTimestamp() on write.
  date: Timestamp;
  billDate?: Timestamp; // user-selected date at midnight

  // ── Customer ──────────────────────────────────────────────────────────────
  customerId: string;               // Firestore /customers/{id}  (was missing)
  customerName: string;
  customerPhone: string;            // single canonical field  (was split into customerMobile + customerPhone)
  customerType: "regular" | "membership" | "new";  // was missing from invoices

  // ── Line items ────────────────────────────────────────────────────────────
  services: ServiceRow[];           // each row must include serviceId, staffId, amount
  products: ProductRow[];           // each row must include productId, amount

  // ── Totals ────────────────────────────────────────────────────────────────
  totalServices: number;            // sum of service line amounts  (was missing)
  totalProducts: number;            // sum of product line amounts  (was missing)
  totalMemberships?: number;        // sum of membership sales
  subtotal: number;                 // totalServices + totalProducts + totalMemberships
  totalDiscount: number;            // was stored as "discount"
  billDiscount?: number;
  billDiscountPercent?: number;
  taxableServiceAmount?: number;    // discounted taxable service amount
  taxRate?: number;                 // tax percentage applied to services (e.g. 5)
  taxAmount?: number;               // calculated tax on services (e.g. 5% of taxableServiceAmount)
  advanceAdded?: number;
  advanceUsed?: number;
  grandTotal: number;

  // ── Offer applied (Phase 4) ─────────────────────────────────────────────
  // Present only if an offer was selected and applied to this bill.
  appliedOffer?: {
    offerId: string;
    code: string;
    name: string;
    discountType: string;
    discountValue: number;
    discountAmount: number;         // actual ₹ amount discounted on this bill
  };

  // ── Payment ───────────────────────────────────────────────────────────────
  paymentSplit: {                   // was stored as "payments"
    upi: number;
    cash: number;
    card: number;
  };
  paymentMethod?: "Cash" | "UPI" | "Card" | "Split";
  paymentStatus: "paid" | "partial" | "unpaid";
  receivedAmount?: number;
  balanceDue?: number;

  // ── Meta ──────────────────────────────────────────────────────────────────
  invoiceDate?: Timestamp;
  dateKey?: string;
  timeKey?: string;
  createdAt: Timestamp;
}