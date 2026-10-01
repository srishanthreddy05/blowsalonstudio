"use client";

import React, { useEffect, useState } from "react";
import {
  User,
  Phone,
  Calendar,
  Receipt,
  Crown,
  Sparkles,
  ExternalLink,
  Clock,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { WhatsAppConversation } from "@/types/whatsapp";
import type { Customer } from "@/types/customer";
import type { Invoice } from "@/types/invoice";
import type { Appointment } from "@/types/appointment";
import * as customerService from "@/services/customers";
import * as invoiceService from "@/services/invoices";
import * as appointmentService from "@/services/appointments";
import { formatDisplayDate, toLocalDateString } from "@/lib/utils/date";
import Link from "next/link";

interface CustomerDetailsPanelProps {
  conversation: WhatsAppConversation;
  onClose: () => void;
}

export function CustomerDetailsPanel({
  conversation,
  onClose,
}: CustomerDetailsPanelProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCustomerData() {
      setLoading(true);
      try {
        let cust: Customer | null = null;

        // 1. Try fetching by customerId
        if (conversation.customerId) {
          cust = await customerService.getById(conversation.customerId);
        }

        // 2. If not found by ID, try fetching by normalized digits or 10-digit suffix
        if (!cust && conversation.normalizedPhone) {
          cust = await customerService.getByPhone(conversation.normalizedPhone);
          if (!cust && conversation.normalizedPhone.length === 12 && conversation.normalizedPhone.startsWith("91")) {
            cust = await customerService.getByPhone(conversation.normalizedPhone.slice(2));
          }
        }

        setCustomer(cust);

        if (cust?.id) {
          // Load customer invoices
          try {
            const allInvoices = await invoiceService.getAll();
            const customerInvoices = allInvoices
              .filter((inv) => inv.customerId === cust?.id || inv.customerPhone === cust?.phone)
              .slice(0, 5);
            setInvoices(customerInvoices);
          } catch {}

          // Load customer appointments
          try {
            const allAppointments = await appointmentService.getAll();
            const customerAppointments = allAppointments
              .filter((app) => app.customerId === cust?.id || app.customerPhone === cust?.phone)
              .sort((a, b) => ((b.date || "").localeCompare(a.date || "")))
              .slice(0, 5);
            setAppointments(customerAppointments);
          } catch {}
        }
      } catch (err) {
        console.error("Error loading customer details for panel:", err);
      } finally {
        setLoading(false);
      }
    }

    loadCustomerData();
  }, [conversation]);

  const isMembership = customer?.customerType === "membership";

  return (
    <div className="w-80 h-full bg-[#FFFFFF] border-l border-[#E0E4DD] flex flex-col overflow-y-auto [scrollbar-width:thin]">
      {/* Header */}
      <div className="p-4 border-b border-[#E0E4DD] flex items-center justify-between shrink-0">
        <h3 className="font-serif text-sm font-bold text-[#2F352F]">Customer Details</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[#747A72] hover:text-[#2F352F] p-1 rounded-lg"
          title="Close details"
        >
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[#747A72]">
          <Clock size={18} className="mx-auto mb-2 animate-spin" />
          Loading client record...
        </div>
      ) : (
        <div className="p-4 space-y-5">
          {/* Profile Overview Card */}
          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] text-center space-y-2">
            <div className="size-14 rounded-full bg-[#5F7A62] text-white grid place-items-center font-bold text-lg mx-auto">
              {(customer?.name || conversation.customerName || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="font-serif text-sm font-bold text-[#2F352F]">
                {customer?.name || conversation.customerName || "WhatsApp Contact"}
              </h4>
              <p className="text-xs text-[#747A72] font-mono mt-0.5">
                {customer?.phone || conversation.phoneNumber || conversation.normalizedPhone}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isMembership
                    ? "bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30"
                    : "bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]"
                }`}
              >
                {isMembership ? <Crown size={11} /> : <User size={11} />}
                <span>{isMembership ? "Membership Client" : "Regular Client"}</span>
              </span>
            </div>
          </div>

          {/* Membership Details */}
          {isMembership && (
            <div className="p-3.5 rounded-2xl bg-[#FAF4E8]/60 border border-[#B18A45]/30 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#B18A45] uppercase">
                <Crown size={13} />
                <span>Active Membership</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-[#747A72] block">Amount Paid</span>
                  <span className="font-bold text-[#2F352F]">₹{customer?.membershipAmount || 0}</span>
                </div>
                <div>
                  <span className="text-[#747A72] block">Duration</span>
                  <span className="font-bold text-[#2F352F]">{customer?.membershipDuration || 12} Mos</span>
                </div>
                {customer?.membershipEnd && (
                  <div className="col-span-2 pt-1 border-t border-[#B18A45]/20">
                    <span className="text-[#747A72] block">Expires On</span>
                    <span className="font-bold text-[#2F352F] font-mono">
                      {formatDisplayDate(customer.membershipEnd)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WhatsApp Consent Status */}
          <div className="p-3.5 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] space-y-1 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
              WhatsApp Marketing Consent
            </span>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              {customer?.whatsappOptOut ? (
                <>
                  <AlertCircle size={14} className="text-[#B55B5B]" />
                  <span className="text-[#B55B5B]">Opted Out of Marketing</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="text-[#5F7A62]" />
                  <span className="text-[#5F7A62]">Opted In for Updates</span>
                </>
              )}
            </div>
          </div>

          {/* Recent Appointments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F776D] flex items-center gap-1">
                <Calendar size={13} />
                <span>Recent Appointments ({appointments.length})</span>
              </span>
              <Link
                href="/appointments"
                className="text-[11px] font-semibold text-[#5F7A62] hover:underline"
              >
                View all
              </Link>
            </div>

            {appointments.length === 0 ? (
              <p className="text-[11px] text-[#747A72] italic bg-[#F7F7F4] p-2.5 rounded-xl border border-[#E0E4DD]">
                No recorded appointments
              </p>
            ) : (
              <div className="space-y-1.5">
                {appointments.map((app) => (
                  <div
                    key={app.id}
                    className="p-2.5 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between font-semibold text-[#2F352F]">
                      <span>{app.date ? formatDisplayDate(app.date) : "Appointment"}</span>
                      <span className="font-mono text-[#5F7A62]">{app.startTime || ""}</span>
                    </div>
                    <p className="text-[#747A72] truncate">
                      {app.serviceName || "Salon Service"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Invoices */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F776D] flex items-center gap-1">
                <Receipt size={13} />
                <span>Recent Invoices ({invoices.length})</span>
              </span>
              <Link
                href="/invoices"
                className="text-[11px] font-semibold text-[#5F7A62] hover:underline"
              >
                View all
              </Link>
            </div>

            {invoices.length === 0 ? (
              <p className="text-[11px] text-[#747A72] italic bg-[#F7F7F4] p-2.5 rounded-xl border border-[#E0E4DD]">
                No recorded invoices
              </p>
            ) : (
              <div className="space-y-1.5">
                {invoices.map((inv) => {
                  let dateStr = "";
                  try {
                    const rawDate = inv.date ? (inv.date as any).toDate?.() || inv.date : inv.billDate;
                    if (rawDate) {
                      dateStr = formatDisplayDate(toLocalDateString(rawDate));
                    }
                  } catch {}

                  return (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="p-2.5 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] text-[11px] block hover:border-[#5F7A62] transition"
                    >
                      <div className="flex items-center justify-between font-semibold text-[#2F352F]">
                        <span className="font-mono">{inv.invoiceNumber}</span>
                        <span className="font-mono font-bold text-[#2F352F]">
                          ₹{Math.round(inv.grandTotal || 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#747A72] text-[10px] mt-0.5">
                        <span>{dateStr}</span>
                        <span className="uppercase text-[#5F7A62] font-bold">{inv.paymentMethod || "PAID"}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
