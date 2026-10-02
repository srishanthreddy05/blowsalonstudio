"use client";

import { useEffect, useState } from "react";
import { X, User, Phone, CheckCircle2, AlertTriangle, ArrowUpRight, ChevronDown, ChevronUp, ShoppingBag, Receipt, Sparkles, CalendarDays } from "lucide-react";
import type { Customer } from "@/types/customer";
import type { Invoice } from "@/types/invoice";
import type { Appointment } from "@/types/appointment";
import * as invoiceService from "@/services/invoices";
import * as appointmentService from "@/services/appointments";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { getBusinessMonth } from "@/lib/utils/businessMonth";

interface CustomerDetailModalProps {
  customer: Customer;
  onClose: () => void;
}

export default function CustomerDetailModal({ customer, onClose }: CustomerDetailModalProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    async function fetchData() {
      if (!customer.id) return;
      try {
        setLoading(true);
        const [invData, apptData] = await Promise.all([
          invoiceService.getByCustomerId(customer.id),
          appointmentService.getByCustomerId(customer.id),
        ]);
        setInvoices(invData);
        setAppointments(apptData);
      } catch (err) {
        console.error("Error fetching customer data:", err);
        setError("Failed to load history.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [customer.id]);

  // Calculations
  const getInvoiceDateString = (inv: Invoice) => {
    const timestamp: any = inv.invoiceDate || inv.date;
    if (!timestamp) return "";
    const dateObj = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const uniqueVisitDates = Array.from(new Set(invoices.map(getInvoiceDateString).filter(Boolean)));
  const visitCount = uniqueVisitDates.length;
  const totalSpend = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  const avgSpend = visitCount > 0 ? totalSpend / visitCount : 0;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const dateObj = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    return dateObj.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const dateObj = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    return dateObj.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const lastVisitDate = visitCount > 0 ? formatDate(invoices[0].invoiceDate || invoices[0].date) : "No visits recorded yet";

  // Group invoices by Business Month
  const getMonthYearKey = (timestamp: any) => {
    if (!timestamp) return "Unknown Date";
    const dateObj = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
    const bm = getBusinessMonth(dateObj);
    return `${bm.label} (${bm.rangeLabel})`;
  };

  const groupedInvoices = invoices.reduce((acc, inv) => {
    const key = getMonthYearKey(inv.invoiceDate || inv.date);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(inv);
    return acc;
  }, {} as Record<string, Invoice[]>);

  // Check membership status
  const isMembershipActive = () => {
    if (customer.customerType !== "membership" || !customer.membershipEnd) return false;
    const end = new Date(customer.membershipEnd);
    return end >= new Date();
  };

  const toggleInvoiceExpand = (id: string) => {
    setExpandedInvoiceId(expandedInvoiceId === id ? null : id);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xl text-[#292D29] my-auto animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E0E4DD] bg-[#FFFFFF] px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD]">
              <User size={20} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold tracking-tight text-[#2F352F]">{customer.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-[#747A72]">
                <span className="flex items-center gap-1">
                  <Phone size={12} />
                  {customer.phone}
                </span>
                <span>•</span>
                <span className="capitalize">{customer.customerType} Profile</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl border border-[#E0E4DD] hover:border-[#6F776D] bg-[#FFFFFF] text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Customer Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#747A72]">Total Visits</span>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#2F352F]">{visitCount}</p>
              <span className="text-xs text-[#747A72] mt-1">Last visit: {lastVisitDate}</span>
            </div>

            <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#747A72]">Total Spend</span>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#2F352F]">{formatCurrency(totalSpend)}</p>
              <span className="text-xs text-[#747A72] mt-1">Average per visit: {formatCurrency(avgSpend)}</span>
            </div>

            <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 shadow-xs flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#747A72]">Membership Status</span>
              {customer.customerType === "membership" ? (
                <div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {isMembershipActive() ? (
                      <>
                        <CheckCircle2 size={16} className="text-[#5F7A62] shrink-0" />
                        <span className="text-xs font-bold text-[#5F7A62]">Active Membership</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={16} className="text-[#B55B5B] shrink-0" />
                        <span className="text-xs font-bold text-[#B55B5B]">Expired Membership</span>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-[#747A72] mt-1">
                    Valid till {customer.membershipEnd ? formatDate(customer.membershipEnd) : "N/A"}
                  </p>
                </div>
              ) : (
                <div>
                  <span className="inline-block mt-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F]">
                    Regular Customer
                  </span>
                  <p className="text-[10px] text-[#747A72] mt-1">No active membership subscription</p>
                </div>
              )}
            </div>
          </div>

          {/* Membership Cost Details */}
          {customer.customerType === "membership" && (
            <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 shadow-xs space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6F776D] flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#6F776D]" />
                Membership Details
              </h3>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 text-xs">
                <div>
                  <p className="text-[10px] font-bold text-[#747A72] uppercase">Amount Paid</p>
                  <p className="font-bold text-[#2F352F] mt-0.5">{customer.membershipAmount ? formatCurrency(customer.membershipAmount) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#747A72] uppercase">Duration</p>
                  <p className="font-bold text-[#2F352F] mt-0.5">{customer.membershipDuration ? `${customer.membershipDuration} Months` : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#747A72] uppercase">Start Date</p>
                  <p className="font-bold text-[#2F352F] mt-0.5">{customer.membershipStart ? formatDate(customer.membershipStart) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#747A72] uppercase">End Date</p>
                  <p className="font-bold text-[#2F352F] mt-0.5">{customer.membershipEnd ? formatDate(customer.membershipEnd) : "—"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Appointments & Booking History Section */}
          <div className="space-y-3">
            <h3 className="font-serif text-base font-bold text-[#2F352F] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={16} className="text-[#6F776D]" />
                Appointment Bookings ({appointments.length})
              </span>
            </h3>

            {appointments.length === 0 ? (
              <div className="text-center py-6 bg-[#F7F7F4] rounded-2xl border border-[#E0E4DD] text-[#747A72] italic text-xs">
                No appointments booked for this client yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="p-3 rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xs text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#2F352F] text-[11px]">
                        {appt.date} • {appt.startTime}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          appt.status === "completed"
                            ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                            : appt.status === "confirmed"
                            ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                            : appt.status === "scheduled"
                            ? "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                            : "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                        }`}
                      >
                        {appt.status}
                      </span>
                    </div>
                    {appt.notes && (
                      <p className="text-[#747A72] text-[11px] truncate">
                        {appt.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Visit History Section */}
          <div className="space-y-4">
            <h3 className="font-serif text-base font-bold text-[#2F352F]">Visit & Invoice History</h3>

            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="size-8 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
              </div>
            ) : error ? (
              <div className="text-center py-6 text-[#B55B5B] bg-[#FBEBEB] border border-[#FBEBEB] rounded-xl text-xs">
                {error}
              </div>
            ) : visitCount === 0 ? (
              <div className="text-center py-10 bg-[#F7F7F4] rounded-2xl border border-[#E0E4DD] text-[#747A72] italic text-xs">
                No visits recorded yet. Invoices will appear here when this customer visits.
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedInvoices).map(([monthYear, monthInvoices]) => {
                  const monthlyTotal = monthInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
                  
                  return (
                    <div key={monthYear} className="space-y-3">
                      {/* Month Header */}
                      <div className="flex items-center justify-between bg-[#F7F7F4] rounded-xl px-4 py-2 border border-[#E0E4DD] shadow-xs">
                        <span className="font-bold text-[#2F352F] text-xs tracking-tight">{monthYear}</span>
                        <div className="flex gap-3 text-xs font-semibold text-[#747A72]">
                          {(() => {
                            const mVisits = Array.from(new Set(monthInvoices.map(getInvoiceDateString).filter(Boolean))).length;
                            return (
                              <span>{mVisits} visit{mVisits !== 1 ? "s" : ""}</span>
                            );
                          })()}
                          <span>•</span>
                          <span className="text-[#2F352F] font-bold">Total Spent: {formatCurrency(monthlyTotal)}</span>
                        </div>
                      </div>

                      {/* Invoices List */}
                      <div className="space-y-2.5">
                        {monthInvoices.map((inv) => {
                          const isExpanded = expandedInvoiceId === inv.id;
                          const hasServices = inv.services && inv.services.length > 0;
                          const hasProducts = inv.products && inv.products.length > 0;
                          const staffSet = new Set(
                            (inv.services || [])
                              .map((s: any) => s.staffName || s.staff)
                              .filter(Boolean)
                          );
                          const staffList = Array.from(staffSet).join(", ");
                          
                          return (
                            <div 
                              key={inv.id} 
                              className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs overflow-hidden hover:border-[#6F776D] transition"
                            >
                              {/* Invoice Header row */}
                              <div 
                                onClick={() => inv.id && toggleInvoiceExpand(inv.id)}
                                className="flex flex-wrap items-center justify-between gap-4 p-4 cursor-pointer select-none"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="grid size-8 place-items-center rounded-xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD]">
                                    <Receipt size={14} />
                                  </div>
                                  <div>
                                    <p className="font-bold text-[#2F352F] text-xs">{inv.invoiceNumber}</p>
                                    <p className="text-[10px] text-[#747A72] font-semibold mt-0.5">
                                      {formatDate(inv.invoiceDate || inv.date)} at {formatTime(inv.invoiceDate || inv.date)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-[10px] text-[#747A72] font-medium">Stylist</p>
                                    <p className="text-xs font-semibold text-[#2F352F] mt-0.5">
                                      {staffList || <span className="italic text-[#747A72]">—</span>}
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    <p className="text-[10px] text-[#747A72] font-medium">Total Amount</p>
                                    <p className="text-xs font-bold text-[#2F352F] mt-0.5">
                                      {formatCurrency(inv.grandTotal)}
                                    </p>
                                  </div>

                                  <div className="text-[#747A72] pl-2">
                                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Invoice details */}
                              {isExpanded && (
                                <div className="border-t border-[#E0E4DD] bg-[#F7F7F4]/60 p-4 space-y-4 text-xs animate-in slide-in-from-top-1 duration-150">
                                  {/* Services & Products breakdown */}
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    {/* Services */}
                                    <div className="space-y-2">
                                      <h4 className="font-bold text-[#6F776D] uppercase tracking-wider text-[10px] border-b border-[#E0E4DD] pb-1 flex items-center gap-1">
                                        <Sparkles size={11} />
                                        Services
                                      </h4>
                                      {hasServices ? (
                                        <div className="space-y-1">
                                          {inv.services.map((s: any, idx: number) => (
                                            <div key={idx} className="flex justify-between py-0.5">
                                              <div>
                                                <p className="font-semibold text-[#2F352F]">{s.serviceName || s.service}</p>
                                                <p className="text-[9px] text-[#747A72]">Stylist: {s.staffName || s.staff}</p>
                                              </div>
                                              <p className="font-bold text-[#2F352F]">
                                                {formatCurrency(s.price * (s.quantity || 1))}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-[#747A72] italic">No services purchased.</p>
                                      )}
                                    </div>

                                    {/* Products */}
                                    <div className="space-y-2">
                                      <h4 className="font-bold text-[#6F776D] uppercase tracking-wider text-[10px] border-b border-[#E0E4DD] pb-1 flex items-center gap-1">
                                        <ShoppingBag size={11} />
                                        Products
                                      </h4>
                                      {hasProducts ? (
                                        <div className="space-y-1">
                                          {inv.products.map((p: any, idx: number) => (
                                            <div key={idx} className="flex justify-between py-0.5">
                                              <div>
                                                <p className="font-semibold text-[#2F352F]">{p.productName || p.product}</p>
                                                <p className="text-[9px] text-[#747A72]">Qty: {p.quantity || 1}</p>
                                              </div>
                                              <p className="font-bold text-[#2F352F]">
                                                {formatCurrency(p.price * (p.quantity || 1))}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-[#747A72] italic">No products purchased.</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Payments split & details */}
                                  <div className="border-t border-[#E0E4DD] pt-3 flex flex-wrap justify-between items-center gap-4 text-xs">
                                    <div className="flex flex-wrap gap-4 text-[#747A72]">
                                      <div>
                                        <span className="font-medium">Payment: </span>
                                        <span className="font-bold capitalize text-[#2F352F]">
                                          {inv.paymentStatus === "paid" ? "Fully Paid" : inv.paymentStatus}
                                        </span>
                                      </div>
                                      
                                      {inv.paymentSplit && (
                                        <div className="flex gap-2">
                                          <span className="font-medium">Split:</span>
                                          {inv.paymentSplit.cash > 0 && <span className="font-bold text-[#2F352F]">Cash ({formatCurrency(inv.paymentSplit.cash)})</span>}
                                          {inv.paymentSplit.upi > 0 && <span className="font-bold text-[#2F352F]">UPI ({formatCurrency(inv.paymentSplit.upi)})</span>}
                                          {inv.paymentSplit.card > 0 && <span className="font-bold text-[#2F352F]">Card ({formatCurrency(inv.paymentSplit.card)})</span>}
                                        </div>
                                      )}
                                    </div>

                                    {/* Link to view invoice */}
                                    <a
                                      href={`/invoices/${inv.id}`}
                                      className="inline-flex items-center gap-1 font-bold text-[#6F776D] hover:text-[#2F352F] hover:underline cursor-pointer"
                                      title="Open Invoice View Page"
                                    >
                                      Open Invoice Page
                                      <ArrowUpRight size={12} />
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#E0E4DD] bg-[#FFFFFF] px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:text-[#2F352F] hover:bg-[#F7F7F4] transition cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
