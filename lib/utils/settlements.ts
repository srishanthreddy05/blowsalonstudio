/**
 * Centralized business logic calculations for BLOW SALON ERP.
 * 
 * Primary Financial Flow:
 * - Service Sales = Sum of all services sold
 * - Retail Sales = Sum of all retail products sold
 * - Membership Sales = Sum of all membership sales / fees
 * - Total Sales = Service Sales + Retail Sales + Membership Sales
 * - Expenses = Total salon operational expenses
 * - Net = Total Sales - Expenses
 * 
 * Payment Breakdown:
 * - Cash, UPI, Card reconciling to Total Sales
 */

import { toLocalDateString } from "./date";
import type { Staff } from "@/types/staff";

export interface InvoicePayments {
  cash: number;
  upi: number;
  card: number;
}

export interface InvoiceSalesBreakdown {
  serviceSales: number;
  taxableServiceSales?: number;
  taxAmount: number;
  retailSales: number;
  membershipSales: number;
  totalSales: number;
  collectedAmount: number;
}

export interface InvoiceLike {
  grandTotal?: number;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  taxableServiceAmount?: number;
  advanceUsed?: number;
  paymentMethod?: string;
  paymentSplit?: { cash?: number; upi?: number; card?: number };
  payments?: { cash?: number; upi?: number; card?: number };
  services?: Array<{
    amount?: number;
    price?: number | string;
    discount?: number | string;
    serviceId?: string;
    isSystemService?: boolean;
  }>;
  products?: Array<{
    amount?: number;
    price?: number | string;
    quantity?: number | string;
    discount?: number | string;
  }>;
}

/**
 * Extracts individual cash, upi, and card split payments from an invoice document.
 */
export function getInvoicePayments(inv?: InvoiceLike | null): InvoicePayments {
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
export function getInvoicePaymentRatio(inv?: InvoiceLike | null): number {
  if (!inv) return 1;
  const grandTotal = inv.grandTotal || 0;
  if (grandTotal <= 0) return 1;
  const payments = getInvoicePayments(inv);
  const collected = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + (inv.advanceUsed || 0);
  return Math.min(1, Math.max(0, collected / grandTotal));
}

/**
 * Calculates service, retail, membership, and total sales breakdown for an invoice.
 * Retail products NEVER receive offer or bill discounts.
 */
export function getInvoiceSalesBreakdown(inv?: InvoiceLike | null): InvoiceSalesBreakdown {
  if (!inv) {
    return { serviceSales: 0, taxableServiceSales: 0, taxAmount: 0, retailSales: 0, membershipSales: 0, totalSales: 0, collectedAmount: 0 };
  }

  let serviceSales = 0;
  let membershipSales = 0;
  let hasStoredAmounts = false;

  (inv.services || []).forEach((s: any) => {
    const isMembership = s.serviceId === "membership_fee" || s.isSystemService === true;
    if (s.amount !== undefined) {
      hasStoredAmounts = true;
      const amt = Number(s.amount) || 0;
      if (isMembership) {
        membershipSales += amt;
      } else {
        serviceSales += amt;
      }
    } else {
      const baseAmt = Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);
      if (isMembership) {
        membershipSales += baseAmt;
      } else {
        serviceSales += baseAmt;
      }
    }
  });

  // For legacy invoices that did not store pre-calculated net s.amount, deduct total bill discount once
  if (!hasStoredAmounts) {
    const totalBillDiscount = (inv as any).totalDiscount ?? (inv as any).discount ?? 0;
    serviceSales = Math.max(0, serviceSales - totalBillDiscount);
  }

  let retailSales = 0;
  (inv.products || []).forEach((p: any) => {
    const baseAmt = p.amount !== undefined 
      ? Number(p.amount) || 0 
      : Math.max(((Number(p.price) || 0) * (Number(p.quantity) || 1)) - (Number(p.discount) || 0), 0);
    retailSales += baseAmt;
  });

  const taxAmount = inv.taxAmount ?? (inv as any).gst ?? (
    inv.taxRate !== undefined && inv.taxRate > 0
      ? Math.round(((serviceSales * inv.taxRate) / 100) * 100) / 100
      : (inv.grandTotal && inv.grandTotal > (serviceSales + retailSales + membershipSales)
          ? Math.round((inv.grandTotal - (serviceSales + retailSales + membershipSales)) * 100) / 100
          : 0)
  );

  const totalSales = Math.round((serviceSales + retailSales + membershipSales + taxAmount) * 100) / 100;
  const payments = getInvoicePayments(inv);
  const collectedAmount = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + (inv.advanceUsed || 0);

  return {
    serviceSales,
    taxableServiceSales: serviceSales,
    taxAmount,
    retailSales,
    membershipSales,
    totalSales,
    collectedAmount,
  };
}

/**
 * Extracts first clock-in and last clock-out / status for a staff member on a specific date.
 */
export function getStylistAttendanceForDate(
  staffMember?: Staff | null,
  dateKey?: string,
  isToday = false
): { inTime: string; outTime: string } {
  if (!staffMember || !staffMember.clockLogs || staffMember.clockLogs.length === 0 || !dateKey) {
    if (staffMember && isToday && staffMember.dutyStatus === "onDuty") {
      return { inTime: "On Duty", outTime: "Still Working" };
    }
    return { inTime: "—", outTime: "—" };
  }

  const logsForDate = staffMember.clockLogs
    .map((log) => {
      let d: Date | null = null;
      if (log.timestamp && typeof (log.timestamp as any).toDate === "function") {
        d = (log.timestamp as any).toDate();
      } else if (log.timestamp) {
        d = new Date(log.timestamp);
      }
      return { event: log.event, date: d };
    })
    .filter((log): log is { event: "clockIn" | "clockOut"; date: Date } => {
      if (!log.date || isNaN(log.date.getTime())) return false;
      return toLocalDateString(log.date) === dateKey;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (logsForDate.length === 0) {
    if (isToday && staffMember.dutyStatus === "onDuty") {
      return { inTime: "On Duty", outTime: "Still Working" };
    }
    return { inTime: "—", outTime: "—" };
  }

  const firstIn = logsForDate.find((l) => l.event === "clockIn");
  const lastOut = [...logsForDate].reverse().find((l) => l.event === "clockOut");
  const lastEvent = logsForDate[logsForDate.length - 1];

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const inTimeStr = firstIn ? formatTime(firstIn.date) : "—";
  let outTimeStr = "—";

  if (lastEvent.event === "clockIn" || (isToday && staffMember.dutyStatus === "onDuty")) {
    outTimeStr = "Still Working";
  } else if (lastOut) {
    outTimeStr = formatTime(lastOut.date);
  }

  return { inTime: inTimeStr, outTime: outTimeStr };
}
