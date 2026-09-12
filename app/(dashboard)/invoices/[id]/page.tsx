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

    const greeting = `Hello ${invoice.customerName},\n\nThank you for choosing BLOW SALON ✨\n\n`;

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
      `BLOW SALON`;

    const msg = `${greeting}${itemsText}${pricingText}${closing}`;

    const digits = String(customerPhone).trim().replace(/\D/g, "");
    const e164 = digits.startsWith("91") && digits.length === 12 ? digits : `91${digits}`;
    window.open(`https://wa.me/${e164}?text=${encodeURIComponent(msg)}`, "_blank");
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
            onClick={handleWhatsApp}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#5F7A62] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[#2F352F] cursor-pointer"
          >
            <Send size={14} />
            Share on WhatsApp
          </button>
        </div>
      </div>

      {/* Main Content Layout Grid */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        {/* Left Column: Form Details & Tables */}
        <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 shadow-xs sm:p-5 text-[#292D29] space-y-6">
          {/* Top Form Grid (Invoice metadata) */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Invoice Number</span>
              <input
                readOnly
                type="text"
                value={invoiceNumber}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs outline-none font-bold text-[#2F352F]"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Date</span>
              <input
                readOnly
                type="text"
                value={invoiceDateLabel}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Time</span>
              <input
                readOnly
                type="text"
                value={invoiceTimeLabel}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Customer Mobile</span>
              <input
                readOnly
                type="text"
                value={customerPhone || "—"}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Customer Name</span>
              <input
                readOnly
                type="text"
                value={invoice.customerName}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs font-semibold text-[#292D29] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Customer Type</span>
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
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] font-semibold outline-none"
              />
            </label>
          </div>

          {/* Services Rendered Table */}
          {invoice.services && invoice.services.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-bold text-[#2F352F] mb-3">Services</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF]">
                <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                  <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Service</th>
                      <th className="px-4 py-3 font-semibold">Staff</th>
                      <th className="px-4 py-3 font-semibold">Price</th>
                      <th className="px-4 py-3 font-semibold">Discount</th>
                      <th className="px-4 py-3 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E4DD]">
                    {invoice.services.map((item: any, idx: number) => {
                      const name = item.serviceName || item.service;
                      const staffName = item.staffName || item.staff;
                      const amount = item.amount ?? Math.max((item.price || 0) - (item.discount || 0), 0);
                      return (
                        <tr key={idx} className="bg-transparent transition hover:bg-[#F7F7F4]/60">
                          <td className="px-4 py-3 font-semibold text-[#292D29]">{name}</td>
                          <td className="px-4 py-3 text-[#747A72]">{staffName}</td>
                          <td className="px-4 py-3 text-[#747A72]">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-3 text-[#B18A45] font-medium">- {formatCurrency(item.discount || 0)}</td>
                          <td className="px-4 py-3 font-semibold text-[#2F352F] text-right">
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
              <h2 className="text-sm font-bold text-[#2F352F] mb-3">Products</h2>
              <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF]">
                <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                  <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Product</th>
                      <th className="px-4 py-3 font-semibold">Price</th>
                      <th className="px-4 py-3 font-semibold">Quantity</th>
                      <th className="px-4 py-3 font-semibold">Discount</th>
                      <th className="px-4 py-3 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E4DD]">
                    {invoice.products.map((item: any, idx: number) => {
                      const name = item.productName || item.product;
                      const amount = item.amount ?? Math.max((item.price || 0) * (item.quantity || 1) - (item.discount || 0), 0);
                      return (
                        <tr key={idx} className="bg-transparent transition hover:bg-[#F7F7F4]/60">
                          <td className="px-4 py-3 font-semibold text-[#292D29]">{name}</td>
                          <td className="px-4 py-3 text-[#747A72]">{formatCurrency(item.price)}</td>
                          <td className="px-4 py-3 text-[#292D29]">{item.quantity}</td>
                          <td className="px-4 py-3 text-[#B18A45] font-medium">- {formatCurrency(item.discount || 0)}</td>
                          <td className="px-4 py-3 font-semibold text-[#2F352F] text-right">
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
          <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29] space-y-4">
            <div className="flex items-center gap-2 mb-2 text-[#2F352F]">
              <Receipt size={16} className="text-[#6F776D]" />
              <h2 className="text-sm font-bold">Totals Summary</h2>
            </div>

            <div className="space-y-2 border-t border-[#E0E4DD] pt-3 text-xs">
              {invoice.totalServices !== undefined && (
                <div className="flex items-center justify-between text-[#747A72]">
                  <span>Total Services</span>
                  <span className="font-semibold text-[#292D29]">{formatCurrency(invoice.totalServices)}</span>
                </div>
              )}
              {invoice.billDiscount !== undefined && invoice.billDiscount > 0 && (
                <div className="flex items-center justify-between text-[#747A72]">
                  <span>Bill Discount</span>
                  <span className="font-semibold text-[#5F7A62]">- {formatCurrency(invoice.billDiscount)}</span>
                </div>
              )}
              {invoice.totalProducts !== undefined && (
                <div className="flex items-center justify-between text-[#747A72]">
                  <span>Total Products</span>
                  <span className="font-semibold text-[#292D29]">{formatCurrency(invoice.totalProducts)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[#747A72]">
                <span>Subtotal</span>
                <span className="font-semibold text-[#292D29]">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[#747A72]">
                <span>Overall Discount</span>
                <span className="font-semibold text-[#B18A45]">- {formatCurrency(totalDiscount)}</span>
              </div>
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

              {/* Horizontal Payment Inputs */}
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
                        className="mt-1 h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 text-xs text-[#292D29] font-bold outline-none"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="border-t border-[#E0E4DD] pt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#747A72]">Total Paid</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#292D29]">{formatCurrency(totalPaid)}</span>
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