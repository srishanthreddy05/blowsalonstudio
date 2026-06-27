/**
 * Centralized business logic calculations for Salon ERP splits, revenues, and commissions.
 * This utility acts as the single source of truth across the billing, settlements, and backfill layers.
 */

export interface InvoicePayments {
  cash: number;
  upi: number;
  card: number;
}

export interface ServiceCommission {
  serviceRevenue: number;
  productCost: number;
  stylistShare: number;
  ownerShare: number;
}

/**
 * Extracts individual cash, upi, and card split payments from an invoice document.
 */
export function getInvoicePayments(inv: any): InvoicePayments {
  if (!inv) return { cash: 0, upi: 0, card: 0 };
  return {
    cash:
      inv.paymentSplit?.cash ??
      inv.payments?.cash ??
      (inv.paymentMethod === "Cash" ? inv.grandTotal || 0 : 0),
    upi:
      inv.paymentSplit?.upi ??
      inv.payments?.upi ??
      (inv.paymentMethod === "UPI" ? inv.grandTotal || 0 : 0),
    card:
      inv.paymentSplit?.card ??
      inv.payments?.card ??
      (inv.paymentMethod === "Card" ? inv.grandTotal || 0 : 0),
  };
}

/**
 * Calculates the payment ratio (collected / grandTotal) of an invoice.
 * Returns a value between 0.0 and 1.0. If grandTotal is 0 or negative, returns 1.0.
 */
export function getInvoicePaymentRatio(inv: any): number {
  if (!inv) return 1;
  const grandTotal = inv.grandTotal || 0;
  if (grandTotal <= 0) return 1;
  const payments = getInvoicePayments(inv);
  const collected = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + (inv.advanceUsed || 0);
  return Math.min(1, Math.max(0, collected / grandTotal));
}

/**
 * Calculates stylist and owner splits for a single service transaction item.
 */
export function getServiceCommission(s: any, inv: any): ServiceCommission {
  if (!s) return { serviceRevenue: 0, productCost: 0, stylistShare: 0, ownerShare: 0 };
  
  const serviceBaseAmount = s.amount ?? Math.max((s.price || 0) - (s.discount || 0), 0);
  const discountFactor = inv && inv.subtotal > 0 ? (inv.grandTotal / inv.subtotal) : 1;
  const amount = serviceBaseAmount * discountFactor;
  const cost = s.usedProductCost || 0;
  
  const isOwner = s.isOwner === true;
  const isSystemService = s.isSystemService === true || s.serviceId === "membership_fee";
  const commissionRate = typeof s.commissionRate === "number" ? s.commissionRate : 50; // default fallback 50%
  const isCreditSettle = s.isCreditSettle === true;

  let stylistShare = 0;
  let ownerShare = 0;

  if (isOwner || isSystemService) {
    stylistShare = 0;
    ownerShare = amount;
  } else {
    // For credit settlement, do not deduct product cost from stylist's share
    const productCostDeduction = isCreditSettle ? 0 : cost;
    const rateMultiplier = commissionRate / 100;
    
    stylistShare = rateMultiplier * amount - productCostDeduction;
    ownerShare = (1 - rateMultiplier) * amount + productCostDeduction;
  }

  return {
    serviceRevenue: amount,
    productCost: cost,
    stylistShare,
    ownerShare,
  };
}
