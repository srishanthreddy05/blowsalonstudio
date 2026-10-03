import type { Invoice } from "@/types/invoice";
import { formatDisplayDate, toLocalDateString } from "./date";

/**
 * Sanitizes any string to plain ASCII text.
 * Strips out emojis, Unicode symbols, smart quotes, replacement chars, etc.
 */
function toPlainAscii(str: string): string {
  if (!str) return "";
  return str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u20B9/g, "Rs. ")
    .replace(/\uFFFD/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Formats a clean, readable, plain ASCII WhatsApp invoice message from an Invoice object.
 * Guarantees ONLY plain ASCII text characters without emojis, special Unicode, markdown, or decorative lines.
 */
export function generateWhatsAppReceiptText(invoice: Invoice): string {
  const rawCustomerName = (invoice.customerName || "Valued Customer").trim();
  const customerName = toPlainAscii(rawCustomerName) || "Valued Customer";
  
  const rawInvoiceNumber = invoice.invoiceNumber || (invoice as any).invoiceNo || "INV";
  const invoiceNumber = toPlainAscii(String(rawInvoiceNumber)) || "INV";
  
  // Format Date
  let dateFormatted = "";
  if (invoice.billDate) {
    dateFormatted = formatDisplayDate(toLocalDateString(invoice.billDate));
  } else if (invoice.date) {
    dateFormatted = formatDisplayDate(toLocalDateString(invoice.date));
  } else {
    dateFormatted = formatDisplayDate(toLocalDateString(new Date()));
  }
  dateFormatted = toPlainAscii(dateFormatted);

  const lines: string[] = [];

  lines.push(`Hello ${customerName}`);
  lines.push("");
  lines.push("Thank you for visiting BLOW SALON.");
  lines.push("");
  lines.push(`Invoice: ${invoiceNumber}`);
  lines.push(`Date: ${dateFormatted}`);
  lines.push("");

  // Line items: Services (NO staff names)
  lines.push("Services:");
  const services = (invoice.services || []).filter(
    (s: any) => !s.isSystemService && s.serviceId !== "membership_fee"
  );

  const itemLines: string[] = [];

  services.forEach((s: any) => {
    const rawName = s.serviceName || s.service || "Service";
    const name = toPlainAscii(rawName) || "Service";
    const price = Math.round(s.amount ?? Math.max(0, (Number(s.price) || 0) - (Number(s.discount) || 0)));
    itemLines.push(`- ${name} - Rs. ${price.toLocaleString("en-IN")}`);
  });

  // Products if present
  const products = invoice.products || [];
  products.forEach((p: any) => {
    const rawName = p.productName || p.product || "Product";
    const name = toPlainAscii(rawName) || "Product";
    const qty = Number(p.quantity) || 1;
    const qtyStr = qty > 1 ? ` (x${qty})` : "";
    const price = Math.round(p.amount ?? Math.max(0, (Number(p.price) || 0) * qty - (Number(p.discount) || 0)));
    itemLines.push(`- ${name}${qtyStr} - Rs. ${price.toLocaleString("en-IN")}`);
  });

  // Membership Fee if present
  if (invoice.totalMemberships && invoice.totalMemberships > 0) {
    itemLines.push(`- Membership Enrollment - Rs. ${Math.round(invoice.totalMemberships).toLocaleString("en-IN")}`);
  }

  // Fallback if no line items exist
  if (itemLines.length === 0) {
    const fallbackPrice = Math.round(invoice.subtotal ?? invoice.grandTotal ?? 0);
    itemLines.push(`- Salon Services - Rs. ${fallbackPrice.toLocaleString("en-IN")}`);
  }

  itemLines.forEach((itemLine) => lines.push(itemLine));

  lines.push("");

  // Totals Breakdown - strictly whole rupees matching invoice
  const subtotal = Math.round(invoice.subtotal ?? invoice.grandTotal ?? 0);
  lines.push(`Subtotal: Rs. ${subtotal.toLocaleString("en-IN")}`);

  // Tax calculation
  const taxAmount = Math.round(invoice.taxAmount ?? 0);
  let taxPercentage = invoice.taxRate;
  if (taxPercentage === undefined || taxPercentage === null) {
    if (taxAmount > 0 && subtotal > 0) {
      taxPercentage = Math.round((taxAmount / (invoice.taxableServiceAmount ?? subtotal)) * 100);
    } else {
      taxPercentage = 5;
    }
  }
  lines.push(`Tax (${taxPercentage}%): Rs. ${taxAmount.toLocaleString("en-IN")}`);

  lines.push("");
  const total = Math.round(invoice.grandTotal ?? 0);
  lines.push(`Total: Rs. ${total.toLocaleString("en-IN")}`);

  lines.push("");

  // Payment Breakdown
  const paymentMethod = toPlainAscii(invoice.paymentMethod || "Paid") || "Paid";
  const paid = Math.round(
    Number(
      invoice.receivedAmount ??
      (invoice.balanceDue !== undefined && invoice.balanceDue !== null
        ? invoice.grandTotal - invoice.balanceDue
        : invoice.grandTotal)
    )
  );

  lines.push(`Amount Paid: Rs. ${paid.toLocaleString("en-IN")}`);
  lines.push(`Payment Method: ${paymentMethod}`);

  lines.push("");
  lines.push("Thank you for choosing BLOW SALON!");
  lines.push("");
  lines.push("We look forward to seeing you again.");

  // Guarantee final output has only plain ASCII characters (plus newlines)
  const fullMessage = lines.join("\n");
  return fullMessage.replace(/[^\x0A\x20-\x7E]/g, "");
}
