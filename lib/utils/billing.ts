import type { BillTotals, ProductRow, ServiceRow } from "@/components/salon-dashboard/types";
import type { Offer } from "@/types/offer";

export const SERVICE_TAX_RATE = 5; // 5% standard service tax

export interface CalculationInput {
  services: ServiceRow[];
  products: ProductRow[];
  billDiscount?: number;
  selectedOffer?: Offer | null;
  taxRate?: number; // defaults to SERVICE_TAX_RATE (5%)
}

/**
 * Checks if a service row represents a system service (e.g. membership fee)
 */
export function isMembershipRow(row: {
  serviceId?: string;
  service?: string;
  isSystemService?: boolean;
}): boolean {
  if (row.isSystemService === true) return true;
  if (row.serviceId === "membership_fee") return true;
  if (row.service && row.service.trim().toLowerCase() === "membership fee") return true;
  return false;
}

/**
 * Centralized calculation function for BLOW SALON billing system.
 * 
 * Order of calculation:
 * 1. Total Services (excluding memberships)
 * 2. Service Discount (service line discounts + bill discount + offer discount)
 * 3. Taxable Service Amount = Math.max(0, Total Services - Service Discount)
 * 4. Tax (5% of Taxable Service Amount)
 * 5. Retail Product Total (undiscounted by service discounts/offers; only item-level product discounts if any)
 * 6. Membership Total (system service rows / membership fee, not taxed)
 * 7. Grand Total = Taxable Service Amount + Tax + Retail Product Total + Membership Total
 */
export function calculateBillTotals(input: CalculationInput): BillTotals {
  const {
    services = [],
    products = [],
    billDiscount = 0,
    selectedOffer = null,
    taxRate = SERVICE_TAX_RATE,
  } = input;

  let serviceTotal = 0;
  let membershipTotal = 0;
  let serviceLineDiscount = 0;

  for (const s of services) {
    const price = Math.round(Math.max(Number(s.price) || 0, 0));
    const discount = Math.round(Math.max(Number(s.discount) || 0, 0));

    if (isMembershipRow(s)) {
      membershipTotal += Math.round(Math.max(price - discount, 0));
    } else {
      serviceTotal += price;
      serviceLineDiscount += discount;
    }
  }

  let productTotal = 0;
  let productLineDiscount = 0;

  for (const p of products) {
    const price = Math.round(Math.max(Number(p.price) || 0, 0));
    const quantity = Math.max(Number(p.quantity) || 1, 0);
    const itemTotal = Math.round(price * quantity);
    const discount = Math.round(Math.max(Number(p.discount) || 0, 0));

    productTotal += itemTotal;
    productLineDiscount += discount;
  }

  // Calculate Offer Discount (only applicable to standard services)
  let eligibleServiceAmount = 0;
  let offerDiscount = 0;

  if (selectedOffer) {
    const hasServiceScope = !!selectedOffer.applicableServiceIds?.length;
    if (hasServiceScope) {
      eligibleServiceAmount = services.reduce((sum, row) => {
        if (isMembershipRow(row)) return sum;
        if (row.serviceId && selectedOffer.applicableServiceIds!.includes(row.serviceId)) {
          return sum + Math.round(Math.max(Number(row.price) || 0, 0));
        }
        return sum;
      }, 0);
    } else {
      eligibleServiceAmount = serviceTotal;
    }

    if (eligibleServiceAmount > 0) {
      if (selectedOffer.discountType === "percentage") {
        offerDiscount = Math.min(
          eligibleServiceAmount,
          Math.round((eligibleServiceAmount * selectedOffer.discountValue) / 100)
        );
      } else {
        offerDiscount = Math.min(Math.round(selectedOffer.discountValue), eligibleServiceAmount);
      }
    }
  }

  // Total Service Discount = bill discount + service line discount + offer discount
  // Capped at serviceTotal
  const roundedBillDiscount = Math.round(billDiscount);
  const rawServiceDiscount = roundedBillDiscount + serviceLineDiscount + offerDiscount;
  const serviceDiscount = Math.min(serviceTotal, rawServiceDiscount);

  // Taxable Service Amount (whole rupees)
  const taxableServiceAmount = Math.max(0, serviceTotal - serviceDiscount);

  // 5% Tax on Taxable Service Amount rounded to nearest whole rupee
  const taxAmount = taxableServiceAmount > 0
    ? Math.round((taxableServiceAmount * taxRate) / 100)
    : 0;

  // Retail product total (retail products are never discounted by bill discount or offer)
  const discountedProductTotal = Math.max(0, productTotal - productLineDiscount);

  // Overall subtotal before discounts
  const subtotal = serviceTotal + productTotal + membershipTotal;

  // Total discounts applied across the bill
  const totalDiscount = serviceDiscount + productLineDiscount;

  // Grand Total = Taxable Service Amount + Tax (5%) + Retail Products + Memberships
  const grandTotal = taxableServiceAmount + taxAmount + discountedProductTotal + membershipTotal;

  return {
    serviceTotal,
    serviceDiscount,
    taxableServiceAmount,
    taxRate,
    taxAmount,
    gst: taxAmount, // legacy compatibility
    productTotal: discountedProductTotal,
    rawProductTotal: productTotal,
    membershipTotal,
    subtotal,
    totalDiscount,
    billDiscount: roundedBillDiscount,
    lineDiscount: serviceLineDiscount + productLineDiscount,
    offerDiscount,
    eligibleServiceAmount,
    grandTotal,
  };
}
