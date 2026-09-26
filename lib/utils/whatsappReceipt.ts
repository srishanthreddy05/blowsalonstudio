import type { Invoice } from "@/types/invoice";
import { formatDisplayDate, toLocalDateString } from "./date";

/**
 * Formats a clean, readable WhatsApp receipt message from an Invoice object.
 * Guarantees whole rupee values and NEVER includes internal staff/specialist names.
 */
export function generateWhatsAppReceiptText(invoice: Invoice): string {
  const customerName = (invoice.customerName || "Valued Customer").trim();
  const invoiceNumber = invoice.invoiceNumber || (invoice as any).invoiceNo || "INV";
  
  // Format Date
  let dateFormatted = "";
  if (invoice.billDate) {
    dateFormatted = formatDisplayDate(toLocalDateString(invoice.billDate));
  } else if (invoice.date) {
    dateFormatted = formatDisplayDate(toLocalDateString(invoice.date));
  } else {
    dateFormatted = formatDisplayDate(toLocalDateString(new Date()));
  }

  const lines: string[] = [];

  lines.push(`Hello *${customerName}* 👋`);
  lines.push(``);
  lines.push(`Thank you for visiting *BLOW SALON*.`);
  lines.push(``);
  lines.push(`Invoice: *${invoiceNumber}*`);
  lines.push(`Date: ${dateFormatted}`);
  lines.push(`────────────────────────────────`);

  // Line items: Services (NO staff names)
  const services = (invoice.services || []).filter(
    (s: any) => !s.isSystemService && s.serviceId !== "membership_fee"
  );
  if (services.length > 0) {
    lines.push(`*Services:*`);
    services.forEach((s: any) => {
      const name = s.serviceName || s.service || "Service";
      const price = Math.round(s.amount ?? Math.max(0, (Number(s.price) || 0) - (Number(s.discount) || 0)));
      lines.push(`• ${name} — ₹${price.toLocaleString("en-IN")}`);
    });
  }

  // Line items: Products (NO staff names)
  const products = invoice.products || [];
  if (products.length > 0) {
    if (services.length > 0) lines.push(``);
    lines.push(`*Products:*`);
    products.forEach((p: any) => {
      const name = p.productName || p.product || "Product";
      const qty = Number(p.quantity) || 1;
      const qtyStr = qty > 1 ? ` (x${qty})` : "";
      const price = Math.round(p.amount ?? Math.max(0, (Number(p.price) || 0) * qty - (Number(p.discount) || 0)));
      lines.push(`• ${name}${qtyStr} — ₹${price.toLocaleString("en-IN")}`);
    });
  }

  // Line items: Membership Fee
  if (invoice.totalMemberships && invoice.totalMemberships > 0) {
    if (services.length > 0 || products.length > 0) lines.push(``);
    lines.push(`• Membership Enrollment — ₹${Math.round(invoice.totalMemberships).toLocaleString("en-IN")}`);
  }

  lines.push(`────────────────────────────────`);

  // Totals Breakdown - strictly whole rupees matching invoice
  const subtotal = Math.round(invoice.subtotal ?? invoice.grandTotal);
  lines.push(`Subtotal: ₹${subtotal.toLocaleString("en-IN")}`);

  if (invoice.taxAmount && Math.round(invoice.taxAmount) > 0) {
    const rateStr = invoice.taxRate ? ` (${invoice.taxRate}%)` : "";
    lines.push(`Tax${rateStr}: ₹${Math.round(invoice.taxAmount).toLocaleString("en-IN")}`);
  }

  if (invoice.totalDiscount && Math.round(invoice.totalDiscount) > 0) {
    lines.push(`Discount: -₹${Math.round(invoice.totalDiscount).toLocaleString("en-IN")}`);
  }

  if (invoice.advanceUsed && Math.round(invoice.advanceUsed) > 0) {
    lines.push(`Advance Adjusted: -₹${Math.round(invoice.advanceUsed).toLocaleString("en-IN")}`);
  }

  lines.push(`────────────────────────────────`);
  lines.push(`*TOTAL: ₹${Math.round(invoice.grandTotal).toLocaleString("en-IN")}*`);

  // Payment method
  const paymentMethod = invoice.paymentMethod || "Paid";
  lines.push(``);
  lines.push(`Payment: ${paymentMethod}`);

  // Balance Due if credit
  if (invoice.balanceDue && Math.round(invoice.balanceDue) > 0) {
    lines.push(`⚠️ Balance Due: ₹${Math.round(invoice.balanceDue).toLocaleString("en-IN")}`);
  }

  lines.push(``);
  lines.push(`Thank you for choosing *BLOW SALON*. ✨`);

  return lines.join("\n");
}
