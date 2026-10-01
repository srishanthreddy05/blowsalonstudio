"use client";

import { useEffect, useState, use } from "react";
import * as invoicesService from "@/services/invoices";
import * as whatsappService from "@/services/whatsapp";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { ChevronLeft, Receipt, Send, Tag, Edit2, CheckCircle2, RotateCcw, MessageSquare, AlertCircle, Calendar } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import type { WhatsAppMessageRecord } from "@/types/whatsapp";
import { formatDisplayDate } from "@/lib/utils/date";
import { parseWhatsAppFailure } from "@/lib/whatsapp/errorClassifier";

function WhatsAppBrandIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c4.56 0 8.25 3.69 8.25 8.24 0 2.2-.86 4.28-2.42 5.84a8.214 8.214 0 0 1-5.83 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.12.82.83-3.04-.19-.31a8.19 8.19 0 0 1-1.26-4.48c0-4.55 3.7-8.24 8.29-8.24m4.54 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6-.1.49-.3 1.47-1.2 1.68-1.77.2-.57.2-1.06.14-1.16-.06-.1-.23-.17-.48-.29" />
    </svg>
  );
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [invoice, setInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [waMessages, setWaMessages] = useState<WhatsAppMessageRecord[]>([]);
  const [waSending, setWaSending] = useState(false);

  useEffect(() => {
    async function loadInvoice() {
      setLoading(true);
      try {
        const [data, messages] = await Promise.all([
          invoicesService.getById(resolvedParams.id),
          whatsappService.getInvoiceMessages(resolvedParams.id),
        ]);
        if (data) {
          setInvoice(data);
          setWaMessages(messages);
        } else {
          alert("Invoice not found!");
          router.push("/invoices");
        }
      } catch (error) {
        console.error("Failed to load invoice details:", error);
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [resolvedParams.id, router]);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
      </div>
    );
  }

  if (!invoice) return null;

  const paymentStatus = invoice.paymentStatus || "paid";

  // ── Schema field reads ───────────────────────────────────────────────────
  const invoiceNumber = invoice.invoiceNumber || invoice.invoiceNo;
  const customerPhone = invoice.customerPhone || invoice.customerMobile;
  const totalDiscount = invoice.totalDiscount ?? invoice.discount ?? 0;
  const paymentSplit = invoice.paymentSplit || invoice.payments || {};
  const appliedOffer = invoice.appliedOffer;
  const customerType = invoice.customerType || "regular";

  // Invoice date may be a Firestore Timestamp or a "YYYY-MM-DD" string
  const invoiceDateObj =
    invoice.date && typeof invoice.date?.toDate === "function"
      ? invoice.date.toDate()
      : invoice.date
        ? new Date(invoice.date)
        : null;
  const invoiceDateLabel = invoiceDateObj
    ? invoiceDateObj.toLocaleDateString()
    : invoice.date || "—";

  const createdAtObj =
    invoice.createdAt && typeof invoice.createdAt?.toDate === "function"
      ? invoice.createdAt.toDate()
      : invoice.createdAt
        ? new Date(invoice.createdAt)
        : invoiceDateObj;

  const invoiceTimeLabel = createdAtObj
    ? createdAtObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
    : "—";

  const cashPaid = paymentSplit.cash ?? (invoice.paymentMethod === "Cash" ? invoice.grandTotal : 0);
  const upiPaid = paymentSplit.upi ?? (invoice.paymentMethod === "UPI" ? invoice.grandTotal : 0);
  const cardPaid = paymentSplit.card ?? (invoice.paymentMethod === "Card" ? invoice.grandTotal : 0);
  const totalPaid = (cashPaid || 0) + (upiPaid || 0) + (cardPaid || 0) || invoice.grandTotal;

  const grandTotal = invoice.grandTotal;
  const totalServices = invoice.totalServices ?? (invoice.services || []).reduce((sum: number, s: any) => sum + (s.isSystemService || s.serviceId === "membership_fee" ? 0 : (s.price || 0)), 0);
  const offerDiscount = appliedOffer?.discountAmount ?? 0;
  const billDiscountVal = invoice.billDiscount || 0;
  const serviceDiscount = (invoice.services || []).reduce((sum: number, s: any) => sum + (s.isSystemService ? 0 : (s.discount || 0)), 0) + billDiscountVal + offerDiscount;
  const taxableServiceAmount = invoice.taxableServiceAmount ?? Math.max(0, totalServices - serviceDiscount);
  const taxAmount = invoice.taxAmount ?? invoice.gst ?? (taxableServiceAmount > 0 ? Math.round((taxableServiceAmount * 0.05) * 100) / 100 : 0);
  const totalProducts = invoice.totalProducts ?? (invoice.products || []).reduce((sum: number, p: any) => sum + ((p.price || 0) * (p.quantity || 1) - (p.discount || 0)), 0);
  const totalMemberships = invoice.totalMemberships ?? (invoice.services || []).reduce((sum: number, s: any) => sum + (s.isSystemService || s.serviceId === "membership_fee" ? (s.price || 0) - (s.discount || 0) : 0), 0);

  const latestWaMessage = waMessages.length > 0 ? waMessages[0] : null;
  const isSentWa = waMessages.some((m) => m.status === "SENT");

  // Automated WhatsApp Send via server
  const handleServerWhatsAppSend = async (isResend = false) => {
    if (!customerPhone) {
      toast.error("This invoice has no customer mobile number on file.");
      return;
    }

    if (isResend && !confirm(`Send WhatsApp receipt again to ${customerPhone}?`)) {
      return;
    }

    setWaSending(true);
    toast.loading("Sending WhatsApp receipt...", { id: "send-wa-invoice" });
    try {
      const res = await whatsappService.sendInvoiceWhatsApp(invoice.id, isResend);
      if (res.success && res.status === "SENT") {
        toast.success("WhatsApp receipt sent successfully!", { id: "send-wa-invoice" });
      } else if (res.status === "NOT_SENT") {
        toast.error(res.error || "Receipt not sent: " + res.error, { id: "send-wa-invoice" });
      } else {
        toast.error(res.error || "Failed to deliver WhatsApp message. Is WhatsApp connected?", { id: "send-wa-invoice" });
      }
      const updatedMessages = await whatsappService.getInvoiceMessages(invoice.id);
      setWaMessages(updatedMessages);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error sending WhatsApp receipt";
      toast.error(msg, { id: "send-wa-invoice" });
    } finally {
      setWaSending(false);
    }
  };

  return (
    <div className="w-full text-[#292D29] max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto space-y-6">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] text-[#747A72] hover:text-[#2F352F] hover:border-[#6F776D] hover:bg-[#E8ECE5] transition shadow-xs"
          >
            <ChevronLeft size={18} />
          </Link>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
              Receipt & Bill
            </span>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2F352F]">
              Invoice Detail View
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link
            href={`/billing?edit=${invoice.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] px-4 text-xs font-bold text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition shadow-xs"
          >
            <Edit2 size={14} />
            Edit Invoice
          </Link>
          <button
            onClick={() => handleServerWhatsAppSend(isSentWa)}
            disabled={waSending}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#5F7A62] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[#2F352F] cursor-pointer disabled:opacity-50"
          >
            <WhatsAppBrandIcon size={14} />
            {isSentWa ? "Resend on WhatsApp" : "Send on WhatsApp"}
          </button>
        </div>
      </div>

      {/* Main Content Layout Grid */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        {/* Left Column: Form Details & Tables */}
        <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 shadow-xs sm:p-5 text-[#292D29] space-y-6">
          {/* Top Form Grid (Invoice metadata) */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Invoice No</span>
              <p className="text-xs font-bold text-[#2F352F] mt-1 font-mono">{invoiceNumber}</p>
            </div>

            <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Bill Date</span>
              <p className="text-xs font-semibold text-[#2F352F] mt-1">{invoiceDateLabel}</p>
            </div>

            <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Created Time</span>
              <p className="text-xs font-semibold text-[#2F352F] mt-1">{invoiceTimeLabel}</p>
            </div>

            <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Customer Name</span>
              <p className="text-xs font-bold text-[#2F352F] mt-1 truncate">{invoice.customerName}</p>
            </div>

            <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Customer Mobile</span>
              <p className="text-xs font-mono font-bold text-[#2F352F] mt-1">{customerPhone || "—"}</p>
            </div>

            <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Client Type</span>
              <p className="text-xs font-bold text-[#2F352F] mt-1 capitalize">{customerType}</p>
            </div>

            {(invoice.appointmentDate || invoice.appointmentTime || invoice.appointmentId) && (
              <div className="rounded-xl border border-[#CCD2C8] bg-[#E8ECE5]/50 p-3 md:col-span-2 lg:col-span-3 xl:col-span-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-[#5F7A62]" />
                  <span className="text-[10px] uppercase font-bold text-[#5F7A62] tracking-wider">
                    Appointment:
                  </span>
                  <span className="text-xs font-bold text-[#2F352F]">
                    {invoice.appointmentDate ? formatDisplayDate(invoice.appointmentDate) : "Linked Appointment"}
                    {invoice.appointmentTime ? ` • ${invoice.appointmentTime}` : ""}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Services Table */}
          <div>
            <h2 className="text-sm font-bold text-[#2F352F] mb-3">Service Details</h2>
            <div className="overflow-x-auto rounded-xl border border-[#E0E4DD]">
              <table className="w-full text-left text-xs text-[#292D29]">
                <thead className="border-b border-[#E0E4DD] bg-[#F7F7F4] text-[10px] uppercase font-bold text-[#747A72] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Service</th>
                    <th className="py-2.5 px-3">Stylist</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Price</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Final Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E4DD]">
                  {(invoice.services || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-[#747A72] italic">
                        No services in this invoice
                      </td>
                    </tr>
                  ) : (
                    (invoice.services || []).map((s: any, idx: number) => {
                      const price = s.price || 0;
                      const disc = s.discount || 0;
                      const finalAmt = s.amount ?? Math.max(price - disc, 0);
                      const name = s.serviceName || s.service || "—";
                      const staff = s.staffName || "Unassigned";

                      return (
                        <tr key={idx} className="hover:bg-[#F7F7F4] transition">
                          <td className="py-2.5 px-3 font-semibold text-[#2F352F]">{name}</td>
                          <td className="py-2.5 px-3 text-[#747A72]">{staff}</td>
                          <td className="py-2.5 px-3 text-[#747A72] capitalize">{s.category || "General"}</td>
                          <td className="py-2.5 px-3 text-right">{formatCurrency(price)}</td>
                          <td className="py-2.5 px-3 text-right text-[#5F7A62]">{disc > 0 ? `-${formatCurrency(disc)}` : "—"}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#2F352F]">{formatCurrency(finalAmt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Products Table */}
          {(invoice.products || []).length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-[#2F352F] mb-3">Retail Products</h2>
              <div className="overflow-x-auto rounded-xl border border-[#E0E4DD]">
                <table className="w-full text-left text-xs text-[#292D29]">
                  <thead className="border-b border-[#E0E4DD] bg-[#F7F7F4] text-[10px] uppercase font-bold text-[#747A72] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Discount</th>
                      <th className="py-2.5 px-3 text-right">Final Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E4DD]">
                    {invoice.products.map((p: any, idx: number) => {
                      const qty = p.quantity || 1;
                      const price = p.price || 0;
                      const disc = p.discount || 0;
                      const finalAmt = p.amount ?? Math.max(price * qty - disc, 0);
                      const name = p.productName || p.product || "—";

                      return (
                        <tr key={idx} className="hover:bg-[#F7F7F4] transition">
                          <td className="py-2.5 px-3 font-semibold text-[#2F352F]">{name}</td>
                          <td className="py-2.5 px-3 text-center font-bold">{qty}</td>
                          <td className="py-2.5 px-3 text-right">{formatCurrency(price)}</td>
                          <td className="py-2.5 px-3 text-right text-[#5F7A62]">{disc > 0 ? `-${formatCurrency(disc)}` : "—"}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#2F352F]">{formatCurrency(finalAmt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Invoice Summary, WhatsApp Status, Payment Info */}
        <aside className="space-y-5">
          {/* WhatsApp Receipt Automation Status Card */}
          <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#2F352F] flex items-center gap-1.5">
                <WhatsAppBrandIcon size={16} className="text-[#5F7A62]" />
                WhatsApp Receipt
              </h2>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                  isSentWa
                    ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                    : latestWaMessage?.status === "FAILED"
                    ? "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                    : "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                }`}
              >
                {isSentWa ? "✓ Sent" : latestWaMessage?.status === "FAILED" ? "⚠ Failed" : "Not Sent"}
              </span>
            </div>

            {latestWaMessage ? (
              <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] text-xs space-y-1 text-[#747A72]">
                <div className="flex justify-between">
                  <span className="font-semibold text-[#2F352F]">Recipient:</span>
                  <span className="font-mono font-bold text-[#2F352F]">{latestWaMessage.phoneNumber}</span>
                </div>
                {latestWaMessage.sentAt && (
                  <div className="flex justify-between text-[11px]">
                    <span>Sent At:</span>
                    <span>{formatDisplayDate(latestWaMessage.sentAt)}</span>
                  </div>
                )}
                {latestWaMessage.errorMessage && (
                  <p
                    className="text-[11px] text-[#B55B5B] mt-1 pt-1 border-t border-[#E0E4DD]"
                    title={latestWaMessage.errorMessage}
                  >
                    <span className="font-bold">Failure Reason: </span>
                    {parseWhatsAppFailure(latestWaMessage.errorMessage, latestWaMessage.errorCode).shortReason}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#747A72] bg-[#F7F7F4] p-3 rounded-xl border border-[#E0E4DD]">
                No automated WhatsApp dispatch record for this invoice yet.
              </p>
            )}

            <button
              type="button"
              disabled={waSending || !customerPhone}
              onClick={() => handleServerWhatsAppSend(isSentWa)}
              className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white text-xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
            >
              <Send size={13} />
              <span>{isSentWa ? "Resend Receipt via WhatsApp" : "Send Receipt via WhatsApp"}</span>
            </button>
          </section>

          {/* Totals Summary */}
          <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29]">
            <h2 className="text-sm font-bold text-[#2F352F] mb-3">Payment Summary</h2>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-[#747A72]">
                <span>Total Services</span>
                <span className="font-semibold text-[#292D29]">{formatCurrency(totalServices)}</span>
              </div>

              {serviceDiscount > 0 && (
                <div className="flex items-center justify-between text-[#5F7A62]">
                  <span>Total Discounts</span>
                  <span className="font-semibold">-{formatCurrency(serviceDiscount)}</span>
                </div>
              )}

              {taxAmount > 0 && (
                <div className="flex items-center justify-between text-[#747A72]">
                  <div>
                    <span>Service Tax (5%)</span>
                    <span className="text-[10px] text-[#747A72] block">Taxable: {formatCurrency(taxableServiceAmount)}</span>
                  </div>
                  <span className="font-semibold text-[#292D29]">+{formatCurrency(taxAmount)}</span>
                </div>
              )}

              {totalProducts > 0 && (
                <div className="flex items-center justify-between text-[#747A72]">
                  <div>
                    <span>Retail Products</span>
                    <span className="text-[10px] text-[#747A72] block">0% Tax</span>
                  </div>
                  <span className="font-semibold text-[#292D29]">{formatCurrency(totalProducts)}</span>
                </div>
              )}

              {totalMemberships > 0 && (
                <div className="flex items-center justify-between text-[#747A72]">
                  <span>Memberships</span>
                  <span className="font-semibold text-[#292D29]">{formatCurrency(totalMemberships)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-[#2F352F] font-bold border-t border-[#E0E4DD] pt-2 text-sm">
                <span>Grand Total</span>
                <span className="text-[#2F352F] font-extrabold">{formatCurrency(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Offer if applied */}
          {appliedOffer && (
            <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29]">
              <h2 className="text-sm font-bold text-[#2F352F] mb-3">Applied Offer</h2>
              <div className="rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] p-3 flex items-start gap-2.5">
                <Tag size={15} className="text-[#6F776D] mt-0.5 shrink-0" />
                <div className="text-xs text-[#2F352F] leading-normal">
                  <span className="font-bold uppercase tracking-wider">{appliedOffer.code}</span>
                  {" "}— <span className="text-[#747A72]">{appliedOffer.name}</span>
                  <p className="mt-1 font-bold text-[#5F7A62]">Discount: -{formatCurrency(appliedOffer.discountAmount)}</p>
                </div>
              </div>
            </section>
          )}

          {/* Payment Method & Split */}
          <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#2F352F]">Payment Information</h2>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                  paymentStatus === "paid"
                    ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                    : paymentStatus === "unpaid"
                      ? "bg-[#FBEBEB] text-[#B55B5B] border-[#FBEBEB]"
                      : "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30"
                }`}
              >
                {paymentStatus === "paid"
                  ? "Paid"
                  : paymentStatus === "unpaid"
                    ? "Unpaid"
                    : "Partially Paid"}
              </span>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3 text-xs">
                <span className="font-semibold text-[#747A72]">Grand Total</span>
                <span className="font-bold text-[#2F352F]">{formatCurrency(invoice.grandTotal)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(["cash", "upi", "card"] as const).map((method) => {
                  const val = method === "cash" ? cashPaid : method === "upi" ? upiPaid : cardPaid;
                  return (
                    <label key={method} className="block">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] capitalize">{method}</span>
                      <input
                        readOnly
                        type="text"
                        value={formatCurrency(val || 0)}
                        className="mt-1 h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 text-xs text-[#2F352F] font-bold outline-none"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="border-t border-[#E0E4DD] pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#747A72]">Total Paid</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#2F352F]">{formatCurrency(totalPaid)}</span>
                    {paymentStatus === "paid" && (
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#E8ECE5] text-[#5F7A62] text-[10px] font-bold border border-[#CCD2C8]">
                        ✓
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-[#747A72] text-right uppercase tracking-wider font-semibold">
                  Method: {invoice.paymentMethod || "Split"}
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}