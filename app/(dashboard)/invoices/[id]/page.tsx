"use client";

import { useEffect, useState, use } from "react";
import * as invoicesService from "@/services/invoices";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { ChevronLeft, Receipt, Send, Tag, Edit2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [invoice, setInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInvoice() {
      setLoading(true);
      try {
        const data = await invoicesService.getById(resolvedParams.id);
        if (data) {
          setInvoice(data);
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
        <div className="size-10 animate-spin rounded-full border-4 border-black border-t-transparent" />
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

  // ── WhatsApp share ────────────────────────────────────────────────────────
  const handleWhatsApp = () => {
    if (!customerPhone) {
      alert("This invoice has no customer mobile number on file.");
      return;
    }

    const formattedServices = (invoice.services || [])
      .map((s: any) => {
        const name = s.serviceName || s.service;
        const amount = s.amount ?? Math.max((s.price || 0) - (s.discount || 0), 0);
        return `• ${name} - ₹${amount}`;
      })
      .join("\n");

    const formattedProducts = (invoice.products || [])
      .map((p: any) => {
        const name = p.productName || p.product;
        const amount = p.amount ?? Math.max((p.price || 0) * (p.quantity || 1) - (p.discount || 0), 0);
        return `• ${name} (x${p.quantity}) - ₹${amount}`;
      })
      .join("\n");

    const greeting = `Hello ${invoice.customerName},\n\nThank you for choosing Demo Salon ✨\n\n`;

    let itemsText = "";
    if (formattedServices) {
      itemsText += `Services:\n${formattedServices}\n\n`;
    }
    if (formattedProducts) {
      itemsText += `Products:\n${formattedProducts}\n\n`;
    }

    const grandTotal = invoice.grandTotal;
    const discountAmount = totalDiscount;
    const offerDiscount = appliedOffer?.discountAmount ?? 0;
    const billDiscountVal = invoice.billDiscount || 0;
    const lineDiscount = Math.max(discountAmount - offerDiscount - billDiscountVal, 0);
    const subtotal = invoice.subtotal ?? (grandTotal + discountAmount);

    const hasDiscountOrOffer = discountAmount > 0;

    let pricingText = "";
    if (hasDiscountOrOffer) {
      pricingText += `Subtotal: ₹${subtotal}\n`;
      if (lineDiscount > 0) {
        pricingText += `Item Discount: -₹${lineDiscount}\n`;
      }
      if (billDiscountVal > 0) {
        pricingText += `Bill Discount: -₹${billDiscountVal}\n`;
      }
      if (appliedOffer && offerDiscount > 0) {
        pricingText += `Offer Applied: ${appliedOffer.code} (-₹${offerDiscount})\n`;
      }
    }
    pricingText += `Total Amount: ₹${grandTotal}\n\n`;

    const closing =
      `Invoice No: ${invoiceNumber}\n` +
      `We look forward to serving you again.\n\n` +
      `Demo Salon`;

    const msg = `${greeting}${itemsText}${pricingText}${closing}`;

    const digits = String(customerPhone).trim().replace(/\D/g, "");
    const e164 = digits.startsWith("91") && digits.length === 12 ? digits : `91${digits}`;
    window.open(`https://wa.me/${e164}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="w-full text-[#A89F8C] max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto space-y-6">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="grid size-10 place-items-center rounded-xl border border-[#2E2B24] bg-[#131210] text-[#A89F8C] hover:text-[#B8962E] hover:border-[#B8962E] transition"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-[#F5F0E8]">
            Invoice Detail View
          </h1>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link
            href={`/billing?edit=${invoice.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] px-5 text-sm font-semibold text-[#B8962E] hover:text-[#D4A935] hover:border-[#B8962E] transition shadow-md"
          >
            <Edit2 size={16} />
            Edit Invoice
          </Link>
          <button
            onClick={handleWhatsApp}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-emerald-700 cursor-pointer"
          >
            <Send size={16} />
            Share on WhatsApp
          </button>
        </div>
      </div>

      {/* Main Content Layout Grid */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        {/* Left Column: Form Details & Tables (Billing Terminal format) */}
        <section className="rounded-2xl border border-[#2E2B24] bg-[#131210] p-4 shadow-md sm:p-5 text-[#A89F8C] space-y-6">
          {/* Top Form Grid (Invoice metadata) */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Invoice Number</span>
              <input
                readOnly
                type="text"
                value={invoiceNumber}
                className={`mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm outline-none font-bold ${
                  customerType === "membership" ? "text-[#B8962E]" : "text-[#F5F0E8]"
                }`}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Date</span>
              <input
                readOnly
                type="text"
                value={invoiceDateLabel}
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Time</span>
              <input
                readOnly
                type="text"
                value={invoiceTimeLabel}
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Customer Mobile</span>
              <input
                readOnly
                type="text"
                value={customerPhone || "—"}
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Customer Name</span>
              <input
                readOnly
                type="text"
                value={invoice.customerName}
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Customer Type</span>
              <input
                readOnly
                type="text"
                value={
                  customerType === "membership"
                    ? "Membership"
                    : customerType === "new"
                      ? "New"
                      : "Regular"
                }
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] font-semibold outline-none"
              />
            </label>
          </div>

          {/* Services Rendered Table */}
          {invoice.services && invoice.services.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-[#F5F0E8] mb-3">Services</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#2E2B24] bg-[#131210]">
                <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                  <thead className="bg-[#0E0D0B] text-[10px] font-bold uppercase tracking-[0.18em] text-[#A89F8C] border-b border-[#2E2B24]">
                    <tr>
                      <th className="px-4 py-4 font-semibold">Service</th>
                      <th className="px-4 py-4 font-semibold">Staff</th>
                      <th className="px-4 py-4 font-semibold">Price</th>
                      <th className="px-4 py-4 font-semibold">Discount</th>
                      <th className="px-4 py-4 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E2B24]">
                    {invoice.services.map((item: any, idx: number) => {
                      const name = item.serviceName || item.service;
                      const staffName = item.staffName || item.staff;
                      const amount = item.amount ?? Math.max((item.price || 0) - (item.discount || 0), 0);
                      return (
                        <tr key={idx} className="bg-transparent transition hover:bg-[#1C1A16]">
                          <td className="px-4 py-3 font-semibold text-[#F5F0E8]">{name}</td>
                          <td className="px-4 py-3 text-[#F5F0E8]">{staffName}</td>
                          <td className="px-4 py-3 text-[#A89F8C]">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-3 text-[#B8962E] font-medium">- {formatCurrency(item.discount || 0)}</td>
                          <td className="px-4 py-3 font-semibold text-[#F5F0E8] text-right">
                            {formatCurrency(amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Products Purchased Table */}
          {invoice.products && invoice.products.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold text-[#F5F0E8] mb-3">Products</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#2E2B24] bg-[#131210]">
                <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                  <thead className="bg-[#0E0D0B] text-[10px] font-bold uppercase tracking-[0.18em] text-[#A89F8C] border-b border-[#2E2B24]">
                    <tr>
                      <th className="px-4 py-4 font-semibold">Product</th>
                      <th className="px-4 py-4 font-semibold">Price</th>
                      <th className="px-4 py-4 font-semibold">Quantity</th>
                      <th className="px-4 py-4 font-semibold">Discount</th>
                      <th className="px-4 py-4 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E2B24]">
                    {invoice.products.map((item: any, idx: number) => {
                      const name = item.productName || item.product;
                      const amount = item.amount ?? Math.max((item.price || 0) * (item.quantity || 1) - (item.discount || 0), 0);
                      return (
                        <tr key={idx} className="bg-transparent transition hover:bg-[#1C1A16]">
                          <td className="px-4 py-3 font-semibold text-[#F5F0E8]">{name}</td>
                          <td className="px-4 py-3 text-[#A89F8C]">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-3 text-[#F5F0E8]">{item.quantity}</td>
                          <td className="px-4 py-3 text-[#B8962E] font-medium">- {formatCurrency(item.discount || 0)}</td>
                          <td className="px-4 py-3 font-semibold text-[#F5F0E8] text-right">
                            {formatCurrency(amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>

        {/* Right Column: Totals Summary, Offer if applied, Payment split info */}
        <aside className="space-y-5">
          {/* Totals Summary */}
          <div className="rounded-2xl border border-[#2E2B24] bg-[#131210] p-5 shadow-md text-[#A89F8C] space-y-4">
            <div className="flex items-center gap-2 mb-2 text-[#F5F0E8]">
              <Receipt size={18} />
              <h2 className="text-sm font-bold">Totals Summary</h2>
            </div>

            <div className="space-y-2 border-t border-[#2E2B24] pt-3 text-sm">
              {invoice.totalServices !== undefined && (
                <div className="flex items-center justify-between text-[#A89F8C]">
                  <span>Total Services</span>
                  <span className="font-semibold text-[#F5F0E8]">{formatCurrency(invoice.totalServices)}</span>
                </div>
              )}
              {invoice.billDiscount !== undefined && invoice.billDiscount > 0 && (
                <div className="flex items-center justify-between text-[#A89F8C]">
                  <span>Bill Discount</span>
                  <span className="font-semibold text-emerald-600">- {formatCurrency(invoice.billDiscount)}</span>
                </div>
              )}
              {invoice.totalProducts !== undefined && (
                <div className="flex items-center justify-between text-[#A89F8C]">
                  <span>Total Products</span>
                  <span className="font-semibold text-[#F5F0E8]">{formatCurrency(invoice.totalProducts)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[#A89F8C]">
                <span>Subtotal</span>
                <span className="font-semibold text-[#F5F0E8]">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[#A89F8C]">
                <span>Overall Discount</span>
                <span className="font-semibold text-[#B8962E]">- {formatCurrency(totalDiscount)}</span>
              </div>
              <div className="flex items-center justify-between text-[#F5F0E8] font-bold border-t border-[#2E2B24] pt-2 text-base">
                <span>Grand Total</span>
                <span className="text-[#B8962E]">{formatCurrency(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Offer if applied */}
          {appliedOffer && (
            <section className="rounded-2xl border border-[#2E2B24] bg-[#131210] p-5 shadow-md text-[#A89F8C]">
              <h2 className="text-lg font-bold text-[#F5F0E8] mb-3">Applied Offer</h2>
              <div className="rounded-xl border border-[#B8962E]/20 bg-[#1F1A0F] p-3.5 flex items-start gap-2.5">
                <Tag size={16} className="text-[#B8962E] mt-0.5 shrink-0" />
                <div className="text-xs text-[#B8962E] leading-normal">
                  <span className="font-bold uppercase tracking-wider">{appliedOffer.code}</span>
                  {" "}— <span className="text-[#A89F8C]">{appliedOffer.name}</span>
                  <p className="mt-1.5 font-bold text-[#B8962E]">Discount: -{formatCurrency(appliedOffer.discountAmount)}</p>
                </div>
              </div>
            </section>
          )}

          {/* Payment Method & Split */}
          <section className="rounded-2xl border border-[#2E2B24] bg-[#131210] p-5 shadow-md text-[#A89F8C]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#F5F0E8]">Payment Information</h2>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                  paymentStatus === "paid"
                    ? "bg-[#1F1A0F] text-[#B8962E] border-[#B8962E]/20"
                    : paymentStatus === "unpaid"
                      ? "bg-[#1A1814] text-[#E57373] border-[#E57373]/20"
                      : "bg-[#1A1814] text-[#B8962E] border-[#B8962E]/20"
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
              <div className="flex items-center justify-between border-b border-[#2E2B24] pb-3 text-sm">
                <span className="font-semibold text-[#A89F8C]">Grand Total</span>
                <span className="font-bold text-[#B8962E]">{formatCurrency(invoice.grandTotal)}</span>
              </div>

              {/* Horizontal Payment Inputs */}
              <div className="grid grid-cols-3 gap-2.5">
                {(["cash", "upi", "card"] as const).map((method) => {
                  const val = method === "cash" ? cashPaid : method === "upi" ? upiPaid : cardPaid;
                  return (
                    <label key={method} className="block">
                      <span className="text-xs font-semibold text-[#A89F8C] capitalize">{method} Paid</span>
                      <input
                        readOnly
                        type="text"
                        value={formatCurrency(val || 0)}
                        className="mt-1.5 h-10 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-2 text-xs text-[#F5F0E8] font-semibold outline-none"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="border-t border-[#2E2B24] pt-3 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#A89F8C]">Total Paid</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#F5F0E8]">{formatCurrency(totalPaid)}</span>
                    {paymentStatus === "paid" && (
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#1F1A0F] text-[#B8962E] text-[10px] font-bold border border-[#B8962E]/20">
                        ✓
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-[#6B6358] text-right uppercase tracking-wider font-semibold">
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