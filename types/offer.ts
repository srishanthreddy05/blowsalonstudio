export interface Offer {
  id?: string;
  code: string;
  name: string;
  discountType: "percentage" | "flat" | string;
  discountValue: number;
  status: "Active" | "Inactive" | string;
  customerType?: "all" | "regular" | "membership";

  // ── Validity window ──────────────────────────────────────────────────────
  // Stored as "YYYY-MM-DD" strings to match the rest of the app's date handling
  // (e.g. billing page's dateString). An offer is valid when:
  //   startDate <= billDate <= endDate
  // If either is empty/undefined, that bound is treated as open-ended.
  startDate?: string;
  endDate?: string;

  // ── Applicability ────────────────────────────────────────────────────────
  // Offers apply ONLY to service sales.
  // If applicableServiceIds is empty, the offer applies to all services in the bill.
  // If applicableServiceIds has entries, the offer discounts only matching service IDs.
  // Retail products NEVER receive offer discounts.
  applicableServiceIds?: string[];

  // ── Minimum bill amount ──────────────────────────────────────────────────
  // Offer can only be applied if the bill subtotal (before this offer's
  // discount) is >= this amount. 0 or undefined means no minimum.
  minBillAmount?: number;

  createdAt?: string;
}