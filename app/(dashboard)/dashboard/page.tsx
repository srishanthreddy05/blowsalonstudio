"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  arrayUnion,
  doc,
  getDoc,
} from "firebase/firestore";
import * as staffService from "@/services/staff";
import { formatCurrency } from "@/components/salon-dashboard/types";
import type { Staff } from "@/types/staff";
import { useAppData } from "@/context/AppDataContext";
import {
  CalendarDays,
  CreditCard,
  TrendingUp,
  ShieldCheck,
  Users,
  Receipt,
  BarChart2,
  UsersRound,
  UserPlus,
  PiggyBank,
  Clock,
  X,
  Store,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { BillingTerminal } from "@/components/billing/BillingTerminal";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";
import { AddExpenseModal } from "@/components/expenses/AddExpenseModal";
import * as customerService from "@/services/customers";
import * as expensesService from "@/services/expenses";
import { toLocalDateString } from "@/lib/utils/date";
import { getInvoicePayments, getInvoicePaymentRatio, getServiceCommission } from "@/lib/utils/settlements";

// ── Types ──────────────────────────────────────────────────────────────────
interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  customerId?: string;
  customerType?: "membership" | "regular" | "new";
  date: Date | Timestamp;
  dateKey?: string;
  grandTotal: number;
  subtotal: number;
  paymentMethod?: string;
  paymentSplit?: { cash?: number; upi?: number; card?: number };
  payments?: { cash?: number; upi?: number; card?: number };
  services?: ServiceItem[];
  products?: ProductItem[];
  createdAt?: Timestamp;
  invoiceDate?: Timestamp;
  billDate?: Timestamp;
  advanceAdded?: number;
  advanceUsed?: number;
}

interface ServiceItem {
  staffId?: string;
  staffName?: string;
  staff?: string;
  serviceId?: string;
  price?: number | "";
  amount?: number;
  discount?: number | "";
  usedProductCost?: number;
}

interface ProductItem {
  price?: number | "";
  quantity?: number | "";
  discount?: number | "";
  amount?: number;
}

interface StaffDetail {
  staffId: string;
  name: string;
  role: string;
  serviceRevenue: number;
  productCost: number;
  staffShare: number;
  ownerShareContribution: number;
  collectedCredits?: any[];
  collectedCreditsShare?: number;
}

interface TodaySettlement {
  totalServiceRevenue: number;
  totalMembershipAmount: number;
  totalProductCost: number;
  totalStaffShare: number;
  totalOwnerShare: number;
  ownerDirectRevenue: number;
  staffRevenueContribution: number;
  staffProductReimbursement: number;
  retailProductsRevenue: number;
  staffDetails: Record<string, StaffDetail>;
  collectedCredits: any[];
}

// ── Utilities ──────────────────────────────────────────────────────────────
function parseTimestamp(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function formatTime(ts: any): string {
  const date = parseTimestamp(ts);
  if (!date || isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Active Time Computation ────────────────────────────────────────────────
function computeTodayActiveTime(clockLogs: any[] = []): string {
  if (!clockLogs?.length) return "0 mins";

  const today = new Date();
  const todayKey = getLocalDateKey(today);

  const parsedLogs = clockLogs
    .map((log) => {
      const date = parseTimestamp(log.timestamp);
      if (!date) return null;
      return {
        event: log.event as "clockIn" | "clockOut",
        date,
        time: date.getTime(),
      };
    })
    .filter((log): log is NonNullable<typeof log> => log !== null)
    .sort((a, b) => a.time - b.time);

  const sessions: { clockIn: (typeof parsedLogs)[0]; clockOut: (typeof parsedLogs)[0] | null }[] = [];
  let currentSessionStart: (typeof parsedLogs)[0] | null = null;

  for (const log of parsedLogs) {
    if (log.event === "clockIn") {
      if (currentSessionStart) sessions.push({ clockIn: currentSessionStart, clockOut: null });
      currentSessionStart = log;
    } else if (log.event === "clockOut" && currentSessionStart) {
      sessions.push({ clockIn: currentSessionStart, clockOut: log });
      currentSessionStart = null;
    }
  }
  if (currentSessionStart) sessions.push({ clockIn: currentSessionStart, clockOut: null });

  const todaySessions = sessions.filter((s) => getLocalDateKey(s.clockIn.date) === todayKey);

  let totalMs = 0;
  for (const session of todaySessions) {
    if (session.clockOut) {
      totalMs += session.clockOut.time - session.clockIn.time;
    } else {
      totalMs += Date.now() - session.clockIn.time;
    }
  }

  const mins = Math.floor(totalMs / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Sub-Components ─────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = "gold",
  children,
  className = "",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accent?: "gold" | "green" | "blue" | "purple";
  children?: React.ReactNode;
  className?: string;
}) {
  const accentColors = {
    gold: "text-[#B8962E] border-[#B8962E]/20 bg-[#B8962E]/5",
    green: "text-[#4ADE80] border-[#4ADE80]/20 bg-[#4ADE80]/5",
    blue: "text-[#60A5FA] border-[#60A5FA]/20 bg-[#60A5FA]/5",
    purple: "text-[#A78BFA] border-[#A78BFA]/20 bg-[#A78BFA]/5",
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-5 shadow-sm transition-all duration-300 hover:border-[#4A4535] hover:shadow-[0_8px_30px_rgba(184,150,46,0.06)] hover:-translate-y-0.5 ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
            {title}
          </span>
          <p className="text-[1.75rem] font-extrabold tracking-[-0.03em] text-[#F5F0E8]">
            {value}
          </p>
        </div>
        <div className={`rounded-xl p-2.5 ${accentColors[accent]}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
      </div>
      {subtitle && (
        <p className="mt-3 text-[11px] font-medium text-[#6B6358]">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function PaymentBreakdown({
  cash,
  upi,
  card,
  advance,
}: {
  cash: number;
  upi: number;
  card: number;
  advance?: number;
}) {
  const advVal = advance || 0;
  const total = cash + upi + card + advVal || 1;
  const items = [
    { label: "Cash", value: cash, color: "bg-[#4ADE80]" },
    { label: "UPI", value: upi, color: "bg-[#60A5FA]" },
    { label: "Card", value: card, color: "bg-[#A78BFA]" },
    ...(advVal > 0 ? [{ label: "Advance", value: advVal, color: "bg-[#059669]" }] : []),
  ];

  return (
    <div className="mt-4 space-y-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[#131210]">
        {items.map((item) => (
          <div
            key={item.label}
            className={`${item.color} transition-all duration-500`}
            style={{ width: `${(item.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className={`grid gap-2 ${advVal > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6358]">
              {item.label}
            </p>
            <p className="mt-0.5 text-xs font-bold text-[#F5F0E8]">
              {formatCurrency(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffCard({
  member,
  activeTime,
  onToggle,
}: {
  member: Staff & { activeTime: string };
  activeTime: string;
  onToggle: (member: Staff) => void;
}) {
  const isOnDuty = member.dutyStatus === "onDuty";

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-[#131210] p-4 transition-all duration-300 hover:-translate-y-0.5 ${isOnDuty
        ? "border-[#B8962E]/30 shadow-[0_4px_20px_rgba(184,150,46,0.08)]"
        : "border-[#2E2B24] hover:border-[#4A4535]"
        }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold text-[#F5F0E8]">
              {member.name}
            </h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.1em] uppercase border ${isOnDuty
                ? "border-[#4A3A10] bg-[#2A2310] text-[#D4A935]"
                : "border-[#2E2B24] bg-[#1C1A16] text-[#6B6358]"
                }`}
            >
              {isOnDuty ? "On Duty" : "Off Duty"}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase text-[#6B6358]">
            {member.role}
          </p>
        </div>
        <div
          className={`size-2 rounded-full shrink-0 mt-1.5 ${isOnDuty ? "bg-[#4ADE80] shadow-[0_0_8px_rgba(74,222,128,0.4)]" : "bg-[#6B6358]"
            }`}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#2E2B24] pt-3">
        <div className="flex items-center gap-1.5 text-[#6B6358]">
          <Clock size={12} strokeWidth={2.5} />
          <span className="text-[11px] font-medium">Active today</span>
        </div>
        <span className="text-xs font-bold text-[#F5F0E8]">{activeTime}</span>
      </div>

      <button
        onClick={() => onToggle(member)}
        className={`mt-3 h-9 w-full rounded-xl text-[11px] font-bold tracking-wide transition-all duration-200 ${isOnDuty
          ? "border border-[#2E2B24] bg-transparent text-[#A89F8C] hover:border-[#B8962E] hover:text-[#B8962E]"
          : "bg-[#B8962E] text-[#0E0D0B] hover:bg-[#D4A935] shadow-[0_2px_12px_rgba(184,150,46,0.2)]"
          }`}
      >
        {isOnDuty ? "Clock Out" : "Clock In"}
      </button>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const staffListStr = Array.from(
    new Set(
      (invoice.services || [])
        .map((s: any) => s.staffName || s.staff)
        .filter(Boolean)
    )
  ).join(", ");

  const time = formatTime(invoice.createdAt || invoice.date);
  const customerType = invoice.customerType || "regular";

  const typeConfig = {
    membership: {
      label: "Membership",
      class: "bg-[#2A2310] text-[#D4A935] border-[#4A3A10]",
    },
    regular: {
      label: "Regular",
      class: "bg-[#1C1A16] text-[#A89F8C] border-[#2E2B24]",
    },
    new: {
      label: "New",
      class: "bg-[#1A1C2A] text-[#818CF8] border-[#2E3154]",
    },
  };

  const config = typeConfig[customerType as keyof typeof typeConfig] || typeConfig.regular;

  return (
    <tr className="group transition-colors hover:bg-[#1F1A0F]/50">
      <td className="px-4 py-3.5">
        <span className="font-mono text-xs font-bold text-[#F5F0E8]">
          #{invoice.invoiceNumber}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#F5F0E8]">
            {invoice.customerName}
          </span>
          {invoice.customerPhone && invoice.customerPhone !== "0000000000" && (
            <span className="text-[10px] text-[#6B6358]">{invoice.customerPhone}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase border ${config.class}`}
        >
          {config.label}
        </span>
      </td>
      <td className="px-4 py-3.5 text-sm text-[#A89F8C]">
        {staffListStr || <span className="italic text-[#6B6358]">Unassigned</span>}
      </td>
      <td className="px-4 py-3.5 text-xs font-medium text-[#6B6358]">{time}</td>
      <td className="px-4 py-3.5 text-right">
        <span className="text-sm font-bold text-[#F5F0E8]">
          {formatCurrency(invoice.grandTotal)}
        </span>
      </td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Link
            href={`/invoices/${invoice.id}`}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-[#2E2B24] bg-[#131210] px-3 text-xs font-semibold text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E]"
          >
            View
          </Link>
          <Link
            href={`/billing?edit=${invoice.id}`}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-[#B8962E]/30 bg-[#B8962E]/10 px-3 text-xs font-semibold text-[#B8962E] transition hover:bg-[#B8962E]/20"
          >
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}

function ModalOverlay({
  isOpen,
  onClose,
  children,
  maxWidth = "max-w-4xl",
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-3xl border border-[#2E2B24] bg-[#1C1A16] shadow-2xl animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function SettlementCard({
  title,
  value,
  icon: Icon,
  items,
  isOwner = false,
  collectedCredits,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  items: { label: string; value: number; negative?: boolean }[];
  isOwner?: boolean;
  collectedCredits?: {
    originalBillDate?: string;
    originalInvoiceNumber?: string;
    collectionDate?: string;
    collectionMethod?: string;
    collectedBy?: string;
    amount: number;
    serviceOrProductName: string;
    type?: string;
    share: number;
  }[];
}) {
  const cardBorder = isOwner
    ? "border-[#4A3A10]/60 hover:border-[#D4A935]/40"
    : "border-[#2E2B24] hover:border-[#60A5FA]/30";
  const cardBg = isOwner
    ? "bg-gradient-to-r from-[#1E1700]/95 via-[#120E01]/98 to-[#0E0B01]/98"
    : "bg-gradient-to-b from-[#181613] to-[#11100E]";
  const shadowEffect = isOwner
    ? "hover:shadow-[0_8px_30px_rgba(212,169,53,0.08)] hover:-translate-y-0.5"
    : "hover:shadow-[0_8px_30px_rgba(96,165,250,0.06)] hover:-translate-y-0.5";
  const iconWrapperBg = isOwner ? "bg-[#D4A935]/10 text-[#D4A935]" : "bg-[#60A5FA]/10 text-[#60A5FA]";
  const heroTextColor = isOwner ? "text-[#D4A935]" : "text-[#F5F0E8]";
  const badgeText = isOwner ? "Owner" : "Stylist";
  const badgeClass = isOwner
    ? "border-[#D4A935]/20 bg-[#D4A935]/5 text-[#D4A935]"
    : "border-[#60A5FA]/20 bg-[#60A5FA]/5 text-[#60A5FA]";

  const hasCredits = collectedCredits && collectedCredits.length > 0;

  if (isOwner) {
    // Horizontal layout for Owner
    return (
      <div
        className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-300 ${cardBorder} ${cardBg} ${shadowEffect}`}
      >
        {/* Subtle background glow */}
        <div
          className="absolute -right-20 -top-20 size-40 rounded-full blur-[80px] pointer-events-none opacity-15 transition-all duration-300 bg-[#D4A935]"
        />

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          {/* Left Section: Info & Net Share */}
          <div className="md:col-span-4 flex flex-col justify-between space-y-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2.5 shrink-0 ${iconWrapperBg}`}>
                <Icon size={18} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h4 className="font-extrabold text-base tracking-tight text-[#F5F0E8] truncate">
                  {title}
                </h4>
                <span
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider mt-1 ${badgeClass}`}
                >
                  {badgeText}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#2E2B24] bg-[#0E0D0B]/80 p-4 flex flex-col justify-center space-y-1.5 shadow-inner">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6358]">
                Today's Net Share
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <p className={`font-black text-2xl tracking-tight ${heroTextColor}`}>
                  {formatCurrency(value)}
                </p>
                <span className="text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#131210] border border-[#4ADE80]/20 text-[#4ADE80]">
                  SURPLUS
                </span>
              </div>
            </div>
          </div>

          {/* Middle Section: Breakdown */}
          <div className="md:col-span-4 border-t md:border-t-0 md:border-l border-[#2E2B24] pt-4 md:pt-0 md:pl-6 flex flex-col justify-between">
            <div className="space-y-3">
              <h5 className="text-[10px] font-bold uppercase tracking-wider text-[#6B6358] border-b border-[#2E2B24] pb-1.5">
                Settlement Breakdown
              </h5>
              <div className="space-y-2">
                {items.map((item, i) => {
                  const isNegative = item.negative;
                  const isTotal = item.label.toLowerCase().includes("gross") || item.label.toLowerCase().includes("total");
                  return (
                    <div 
                      key={i} 
                      className={`flex justify-between items-center text-xs py-0.5 ${
                        isTotal ? "border-t border-[#2E2B24]/60 pt-2 font-bold mt-1" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[#A89F8C]">
                        {!isTotal && (
                          <div 
                            className={`size-1.5 rounded-full shrink-0 ${
                              isNegative ? "bg-[#E57373]" : "bg-[#4ADE80]"
                            }`} 
                          />
                        )}
                        <span className={`${isTotal ? "text-[#F5F0E8] font-semibold" : "font-medium"}`}>{item.label}</span>
                      </div>
                      <span
                        className={`font-mono font-bold ${
                          isTotal 
                            ? "text-[#D4A935]" 
                            : isNegative 
                              ? "text-[#E57373]" 
                              : "text-[#4ADE80]"
                        }`}
                      >
                        {isNegative ? "−" : "+"}
                        {formatCurrency(Math.abs(item.value))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Section: Credit Collections */}
          <div className="md:col-span-4 border-t md:border-t-0 md:border-l border-[#2E2B24] pt-4 md:pt-0 md:pl-6 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-[#B8962E]">
                  Collected Credits
                </h5>
                <span className="text-[8px] font-bold text-[#6B6358] uppercase tracking-wider">Cash Basis</span>
              </div>
              
              {hasCredits ? (
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {collectedCredits.map((c, idx) => {
                    const method = c.collectionMethod?.toUpperCase() || "UPI";
                    let methodBadge = "border-[#60A5FA]/20 bg-[#60A5FA]/5 text-[#60A5FA]";
                    if (method === "UPI") {
                      methodBadge = "border-[#A78BFA]/20 bg-[#A78BFA]/5 text-[#A78BFA]";
                    } else if (method === "CASH") {
                      methodBadge = "border-[#4ADE80]/20 bg-[#4ADE80]/5 text-[#4ADE80]";
                    }

                    return (
                      <div 
                        key={idx} 
                        className="rounded-xl bg-[#0E0D0B]/60 border border-[#2E2B24]/60 p-2.5 space-y-2 text-[11px] transition hover:bg-[#0E0D0B]"
                      >
                        <div className="flex justify-between items-start font-semibold">
                          <span className="text-[#F5F0E8] truncate max-w-[145px] font-medium" title={c.serviceOrProductName}>
                            {c.serviceOrProductName}
                          </span>
                          <span className="text-emerald-500 font-bold font-mono">
                            +{formatCurrency(c.share)}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-[#6B6358]">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider border ${methodBadge}`}>
                              {method}
                            </span>
                            <span>Amt: <span className="font-semibold text-[#A89F8C]">{formatCurrency(c.amount)}</span></span>
                          </div>
                          <span className="font-semibold text-[#D4A935] bg-[#2A2310] px-1.5 py-0.5 rounded text-[8px] border border-[#D4A935]/15">
                            INV #{c.originalInvoiceNumber || "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 border border-dashed border-[#2E2B24] rounded-2xl bg-[#0E0D0B]/20 text-[#6B6358]">
                  <span className="text-[10px] font-semibold italic">No credit collections today</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Vertical layout for Staff card (3 columns side-by-side in grid)
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-5 space-y-4 transition-all duration-300 ${cardBorder} ${cardBg} ${shadowEffect} flex flex-col justify-between h-full`}
    >
      {/* Subtle Glow backdrop */}
      <div
        className="absolute -right-20 -top-20 size-40 rounded-full blur-[80px] pointer-events-none opacity-20 transition-all duration-300 bg-[#60A5FA]"
      />

      <div className="space-y-4">
        {/* Header Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 shrink-0 ${iconWrapperBg}`}>
              <Icon size={16} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <h4 className="font-extrabold text-[14px] tracking-tight text-[#F5F0E8] truncate">
                {title}
              </h4>
              <span
                className={`inline-block rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider mt-0.5 ${badgeClass}`}
              >
                {badgeText}
              </span>
            </div>
          </div>
        </div>

        {/* Hero Wallet Display */}
        <div className="rounded-2xl border border-[#2E2B24] bg-[#0E0D0B]/80 p-4 flex justify-between items-center shadow-inner">
          <div className="space-y-0.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#6B6358]">
              Today's Net Share
            </span>
            <p className={`font-black text-xl tracking-tight ${heroTextColor}`}>
              {formatCurrency(value)}
            </p>
          </div>
          <div className="shrink-0">
            <span className={`text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded-lg bg-[#131210] border ${
              value >= 0 
                ? "border-[#4ADE80]/20 text-[#4ADE80]" 
                : "border-[#E57373]/20 text-[#E57373]"
            }`}>
              {value >= 0 ? "SURPLUS" : "DEFICIT"}
            </span>
          </div>
        </div>

        {/* Itemized Splits */}
        <div className="space-y-2">
          <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#6B6358] border-b border-[#2E2B24] pb-1">
            Settlement Breakdown
          </h5>
          <div className="space-y-1.5">
            {items.map((item, i) => {
              const isNegative = item.negative;
              const isTotal = item.label.toLowerCase().includes("gross") || item.label.toLowerCase().includes("total");
              return (
                <div 
                  key={i} 
                  className="flex justify-between items-center text-xs py-0.5"
                >
                  <div className="flex items-center gap-2 text-[#A89F8C]">
                    <div 
                      className={`size-1.5 rounded-full shrink-0 ${
                        isNegative ? "bg-[#E57373]" : "bg-[#4ADE80]"
                      }`} 
                    />
                    <span className="font-medium text-[11px]">{item.label}</span>
                  </div>
                  <span
                    className={`font-mono font-bold text-[11px] ${
                      isNegative ? "text-[#E57373]" : "text-[#4ADE80]"
                    }`}
                  >
                    {isNegative ? "−" : "+"}
                    {formatCurrency(Math.abs(item.value))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Credit Collections */}
      {hasCredits && (
        <div className="space-y-2 border-t border-[#2E2B24]/80 pt-3 mt-auto">
          <div className="flex items-center justify-between">
            <h5 className="text-[9px] font-bold uppercase tracking-wider text-[#B8962E]">
              Collected Credits ({collectedCredits.length})
            </h5>
          </div>
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
            {collectedCredits.map((c, idx) => {
              const method = c.collectionMethod?.toUpperCase() || "UPI";
              let methodBadge = "border-[#60A5FA]/20 bg-[#60A5FA]/5 text-[#60A5FA]";
              if (method === "UPI") {
                methodBadge = "border-[#A78BFA]/20 bg-[#A78BFA]/5 text-[#A78BFA]";
              } else if (method === "CASH") {
                methodBadge = "border-[#4ADE80]/20 bg-[#4ADE80]/5 text-[#4ADE80]";
              }

              return (
                <div 
                  key={idx} 
                  className="rounded-xl bg-[#0E0D0B]/60 border border-[#2E2B24]/60 p-2 space-y-1.5 text-[10px] transition hover:bg-[#0E0D0B]"
                >
                  <div className="flex justify-between items-start font-semibold px-1">
                    <span className="text-[#F5F0E8] truncate max-w-[120px] font-medium" title={c.serviceOrProductName}>
                      {c.serviceOrProductName}
                    </span>
                    <span className="text-emerald-500 font-bold font-mono">
                      +{formatCurrency(c.share)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between gap-1 text-[9px] text-[#6B6358] px-1 pb-0.5">
                    <span className={`px-1.5 py-0.2 rounded text-[7px] font-bold tracking-wider border ${methodBadge}`}>
                      {method}
                    </span>
                    <span className="font-semibold text-[#D4A935] text-[9px]">
                      INV #{c.originalInvoiceNumber || "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { staff, loadingAppData } = useAppData();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const staffLoaded = !loadingAppData;
  const [tick, setTick] = useState(0);

  const [modals, setModals] = useState({
    billing: false,
    customer: false,
    expense: false,
    settlements: false,
  });

  const [todayExpenses, setTodayExpenses] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<{
    totalRevenue: number;
    totalVisits: number;
  } | null>(null);
  const [staffMonthlyStats, setStaffMonthlyStats] = useState<
    Record<string, { revenue: number; productCost: number }>
  >({});

  // ── Data Fetching ────────────────────────────────────────────────────────

  const loadTodayExpenses = useCallback(async () => {
    try {
      const todayStr = toLocalDateString(new Date());
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const data = await expensesService.getByDateRange(start, end);
      setTodayExpenses(data.filter((e) => e.date === todayStr));
    } catch (err) {
      console.error("Failed to load today's expenses:", err);
    }
  }, []);

  useEffect(() => {
    loadTodayExpenses();
  }, [loadTodayExpenses]);

  const todayExpensesTotal = useMemo(
    () => todayExpenses.reduce((sum, exp) => sum + exp.amount, 0),
    [todayExpenses]
  );

  const fetchMonthlyStats = useCallback(async (force = false) => {
    try {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const cacheKey = `monthlyStats_${monthKey}`;

      if (!force) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { data, expiry } = JSON.parse(cached);
          if (Date.now() < expiry) {
            setMonthlyStats(data);
            return;
          }
        }
      }

      const docRef = doc(db, "stats", `revenue_${monthKey}`);
      const snap = await getDoc(docRef);
      const data = snap.exists()
        ? {
          totalRevenue: snap.data().totalRevenue ?? 0,
          totalVisits: snap.data().totalVisits ?? 0,
        }
        : { totalRevenue: 0, totalVisits: 0 };

      setMonthlyStats(data);
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ data, expiry: Date.now() + 60000 })
      );
    } catch (err) {
      console.error("Failed to fetch monthly stats:", err);
    }
  }, []);

  const fetchStaffMonthlyStats = useCallback(
    async (force = false) => {
      try {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const cacheKey = `staffMonthlyStats_${monthKey}`;

        if (!force) {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const { data, expiry } = JSON.parse(cached);
            if (Date.now() < expiry) {
              setStaffMonthlyStats(data);
              return;
            }
          }
        }

        const map: Record<string, { revenue: number; productCost: number }> = {};
        await Promise.all(
          staff.map(async (member) => {
            if (!member.id) return;
            const ref = doc(db, "stats", `staff_${member.id}_${monthKey}`);
            const snap = await getDoc(ref);
            map[member.id] = snap.exists()
              ? {
                revenue: snap.data().revenue ?? 0,
                productCost: snap.data().productCost ?? 0,
              }
              : { revenue: 0, productCost: 0 };
          })
        );
        setStaffMonthlyStats(map);
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ data: map, expiry: Date.now() + 60000 })
        );
      } catch (err) {
        console.error("Failed to fetch staff monthly stats:", err);
      }
    },
    [staff]
  );

  // ── Real-time Listeners ────────────────────────────────────────────────

  useEffect(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const qInvoices = query(
      collection(db, "invoices"),
      where("billDate", "==", Timestamp.fromDate(startOfToday))
    );

    const unsub = onSnapshot(
      qInvoices,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice);
        setInvoices(list);
        setInvoicesLoaded(true);
      },
      (err) => console.error("Invoices listener error:", err)
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    if (invoicesLoaded && staffLoaded) {
      fetchMonthlyStats();
      fetchStaffMonthlyStats();
    }
  }, [invoicesLoaded, staffLoaded, fetchMonthlyStats, fetchStaffMonthlyStats]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    customerService.checkAndExpireMemberships();
  }, []);

  useEffect(() => {
    const anyOpen = Object.values(modals).some(Boolean);
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modals]);

  // ── Derived State ────────────────────────────────────────────────────────

  const staffWithActiveTimes = useMemo(() => {
    const mapped = staff.map((member) => ({
      ...member,
      activeTime: computeTodayActiveTime(member.clockLogs),
    }));
    return mapped.sort((a, b) => {
      if (a.role === "Owner" && b.role !== "Owner") return -1;
      if (a.role !== "Owner" && b.role === "Owner") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [staff, tick]);

  const stats = useMemo(() => {
    const todayStr = toLocalDateString(new Date());
    let todayRevenue = 0;
    let cashToday = 0;
    let upiToday = 0;
    let cardToday = 0;
    let advanceToday = 0;
    const uniqueCustomerIds = new Set<string>();

    invoices.forEach((inv) => {
      const cash =
        inv.paymentSplit?.cash ??
        inv.payments?.cash ??
        (inv.paymentMethod === "Cash" ? inv.grandTotal || 0 : 0);
      const upi =
        inv.paymentSplit?.upi ??
        inv.payments?.upi ??
        (inv.paymentMethod === "UPI" ? inv.grandTotal || 0 : 0);
      const card =
        inv.paymentSplit?.card ??
        inv.payments?.card ??
        (inv.paymentMethod === "Card" ? inv.grandTotal || 0 : 0);
      const advance = inv.advanceUsed || 0;

      const invDateStr = inv.dateKey || toLocalDateString(inv.date);

      if (invDateStr === todayStr) {
        todayRevenue += cash + upi + card + advance;

        const isGuest =
          inv.customerPhone === "0000000000" || inv.customerName === "Guest";
        const identifier = isGuest
          ? inv.id || inv.invoiceNumber || Math.random().toString()
          : inv.customerId || inv.customerPhone || inv.customerName || inv.id || Math.random().toString();
        uniqueCustomerIds.add(identifier);

        cashToday += cash;
        upiToday += upi;
        cardToday += card;
        advanceToday += advance;
      }
    });

    return {
      todayRevenue,
      monthlyRevenue: monthlyStats?.totalRevenue ?? 0,
      todayVisits: uniqueCustomerIds.size,
      cashToday,
      upiToday,
      cardToday,
      advanceToday,
      onDutyCount: staff.filter((s) => s.dutyStatus === "onDuty").length,
    };
  }, [invoices, staff, monthlyStats]);

  const todayStr = toLocalDateString(new Date());
  const todayInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        const d = inv.dateKey || toLocalDateString(inv.date);
        return d === todayStr;
      })
      .sort((a, b) => {
        const getTime = (x: any) => {
          if (x?.toMillis) return x.toMillis();
          if (x instanceof Date) return x.getTime();
          return 0;
        };
        const primaryDiff = getTime(b.invoiceDate || b.date) - getTime(a.invoiceDate || a.date);
        if (primaryDiff !== 0) return primaryDiff;
        return getTime(b.createdAt) - getTime(a.createdAt);
      });
  }, [invoices, todayStr]);

  const todaySettlement = useMemo<TodaySettlement>(() => {
    const dayObj: TodaySettlement = {
      totalServiceRevenue: 0,
      totalMembershipAmount: 0,
      totalProductCost: 0,
      totalStaffShare: 0,
      totalOwnerShare: 0,
      ownerDirectRevenue: 0,
      staffRevenueContribution: 0,
      staffProductReimbursement: 0,
      retailProductsRevenue: 0,
      staffDetails: {},
      collectedCredits: [],
    };

    todayInvoices.forEach((inv) => {
      const discountFactor = inv.subtotal > 0 ? inv.grandTotal / inv.subtotal : 1;

      const ratio = getInvoicePaymentRatio(inv);

      (inv.products || []).forEach((p: any) => {
        const base = p.amount ?? Math.max((p.price || 0) * (p.quantity || 1) - (p.discount || 0), 0);
        const amount = base * discountFactor;

        if (p.isCreditSettle) {
          dayObj.collectedCredits.push({
            originalBillDate: p.originalBillDate || "",
            originalInvoiceNumber: p.originalInvoiceNumber || "",
            collectionDate: p.collectionDate || todayStr,
            collectionMethod: p.collectionMethod || inv.paymentMethod || "UPI",
            collectedBy: p.collectedBy || "System",
            amount: amount * ratio,
            staffName: "System",
            staffId: "system",
            serviceOrProductName: p.productName || p.product || "Credit Settle (Product)",
            type: "product",
          });
          dayObj.ownerDirectRevenue += amount * ratio;
          dayObj.totalOwnerShare += amount * ratio;
          return;
        }

        dayObj.retailProductsRevenue += amount * ratio;
        dayObj.totalOwnerShare += amount * ratio;
      });

      (inv.services || []).forEach((s: any) => {
        const base = s.amount ?? Math.max((s.price || 0) - (s.discount || 0), 0);
        const amount = base * discountFactor;
        const cost = s.usedProductCost || 0;
        const staffId = s.staffId || "unassigned";
        const staffName = s.staffName || "Unassigned";

        const staffMember = staff.find(
          (st) => st.id === staffId || st.name === staffName
        );
        const role = s.staffRole || staffMember?.role || "Stylist";

        const commissionRate = staffMember ? (staffMember.commissionRate ?? 50) : (s.commissionRate ?? 50);
        const isOwner = staffMember ? (staffMember.isOwner === true) : (s.isOwner === true || role === "Owner");
        const isSystemService = s.isSystemService === true || s.serviceId === "membership_fee";

        const commissionResult = getServiceCommission(
          {
            ...s,
            amount,
            usedProductCost: cost,
            commissionRate,
            isOwner,
            isSystemService,
          },
          null
        );

        const stylistShare = commissionResult.stylistShare;
        const ownerShare = commissionResult.ownerShare;

        if (isSystemService) {
          dayObj.totalMembershipAmount += amount * ratio;
          dayObj.totalOwnerShare += amount * ratio;
          return;
        }

        if (s.isCreditSettle) {
          dayObj.collectedCredits.push({
            originalBillDate: s.originalBillDate || "",
            originalInvoiceNumber: s.originalInvoiceNumber || "",
            collectionDate: s.collectionDate || todayStr,
            collectionMethod: s.collectionMethod || inv.paymentMethod || "UPI",
            collectedBy: s.collectedBy || "System",
            amount: amount * ratio,
            staffName,
            staffId,
            serviceOrProductName: s.serviceName || s.service || "Credit Settle",
            type: "service",
          });

          const key = staffId !== "unassigned" ? staffId : staffName;
          if (!dayObj.staffDetails[key]) {
            dayObj.staffDetails[key] = {
              staffId,
              name: staffName,
              role,
              serviceRevenue: 0,
              productCost: 0,
              staffShare: 0,
              ownerShareContribution: 0,
              collectedCredits: [],
              collectedCreditsShare: 0,
            };
          }
          const sd = dayObj.staffDetails[key];
          if (!sd.collectedCredits) {
            sd.collectedCredits = [];
            sd.collectedCreditsShare = 0;
          }

          sd.collectedCredits.push({
            originalBillDate: s.originalBillDate || "",
            originalInvoiceNumber: s.originalInvoiceNumber || "",
            collectionDate: s.collectionDate || todayStr,
            collectionMethod: s.collectionMethod || inv.paymentMethod || "UPI",
            collectedBy: s.collectedBy || "System",
            amount: amount * ratio,
            serviceOrProductName: s.serviceName || s.service || "Credit Settle",
            type: "service",
          });

          if (isOwner) {
            dayObj.ownerDirectRevenue += amount * ratio;
            dayObj.totalOwnerShare += amount * ratio;
            sd.ownerShareContribution += amount * ratio;
          } else {
            dayObj.totalOwnerShare += ownerShare * ratio;
            dayObj.staffRevenueContribution += stylistShare * ratio;
            sd.collectedCreditsShare = (sd.collectedCreditsShare || 0) + stylistShare * ratio;
            sd.ownerShareContribution += ownerShare * ratio;
          }
          return;
        }

        const key = staffId !== "unassigned" ? staffId : staffName;
        if (!dayObj.staffDetails[key]) {
          dayObj.staffDetails[key] = {
            staffId,
            name: staffName,
            role,
            serviceRevenue: 0,
            productCost: 0,
            staffShare: 0,
            ownerShareContribution: 0,
            collectedCredits: [],
            collectedCreditsShare: 0,
          };
        }
        const sd = dayObj.staffDetails[key];

        if (isOwner) {
          dayObj.ownerDirectRevenue += amount * ratio;
          dayObj.totalServiceRevenue += amount * ratio;
          dayObj.totalOwnerShare += amount * ratio;
          sd.serviceRevenue += amount * ratio;
          sd.productCost += cost * ratio;
          sd.ownerShareContribution += amount * ratio;
        } else {
          dayObj.totalServiceRevenue += amount * ratio;
          dayObj.totalProductCost += cost * ratio;
          dayObj.totalStaffShare += stylistShare * ratio;
          dayObj.totalOwnerShare += ownerShare * ratio;
          dayObj.staffRevenueContribution += ((commissionRate / 100) * amount) * ratio;
          dayObj.staffProductReimbursement += cost * ratio;
          sd.serviceRevenue += amount * ratio;
          sd.productCost += cost * ratio;
          sd.staffShare += stylistShare * ratio;
          sd.ownerShareContribution += ownerShare * ratio;
        }
      });
    });

    return dayObj;
  }, [todayInvoices, staff, todayStr]);

  const staffSplits = useMemo(() => {
    const stylistStaff = staff.filter(
      (st) => st.isOwner !== true && st.id !== "system" && st.name !== "System"
    );

    return stylistStaff.map((member) => {
      let todayShare = 0;
      invoices.forEach((inv) => {
        const dateKeyStr = inv.dateKey || toLocalDateString(inv.date);
        const isToday = dateKeyStr === todayStr;
        const discountFactor = inv.subtotal > 0 ? inv.grandTotal / inv.subtotal : 1;

        const ratio = getInvoicePaymentRatio(inv);

        (inv.services || []).forEach((s: any) => {
          if (s.staffId === member.id || s.staffName === member.name) {
            const commissionRate = member.commissionRate ?? s.commissionRate ?? 50;
            const isOwner = member.isOwner ?? s.isOwner ?? false;
            const isSystemService = s.isSystemService ?? s.serviceId === "membership_fee";

            if (!isSystemService) {
              const base = s.amount ?? Math.max((s.price || 0) - (s.discount || 0), 0);
              const amount = base * discountFactor;
              const cost = s.usedProductCost || 0;
              if (isToday) {
                const commissionResult = getServiceCommission(
                  {
                    ...s,
                    amount,
                    usedProductCost: cost,
                    commissionRate,
                    isOwner,
                    isSystemService,
                  },
                  null
                );
                todayShare += commissionResult.stylistShare * ratio;
              }
            }
          }
        });
      });

      const stStats = member.id ? staffMonthlyStats[member.id] : null;
      const rateMultiplier = (member.commissionRate ?? 50) / 100;
      const monthlyShare = rateMultiplier * (stStats?.revenue ?? 0) - (stStats?.productCost ?? 0);

      return {
        id: member.id,
        name: member.name,
        todayShare,
        monthlyShare,
      };
    });
  }, [invoices, staff, staffMonthlyStats, todayStr]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const toggleDutyStatus = useCallback(
    async (member: Staff) => {
      if (!member.id) return;
      const current = member.dutyStatus || "offDuty";
      const next = current === "onDuty" ? "offDuty" : "onDuty";
      const logEvent = next === "onDuty" ? "clockIn" : "clockOut";

      try {
        await staffService.update(member.id, {
          dutyStatus: next,
          clockLogs: arrayUnion({
            event: logEvent,
            timestamp: Timestamp.now(),
          }) as any,
        });

        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        localStorage.removeItem(`staffMonthlyStats_${monthKey}`);
        await fetchStaffMonthlyStats(true);
      } catch (err) {
        console.error("Failed to update duty status:", err);
      }
    },
    [fetchStaffMonthlyStats]
  );

  const openModal = useCallback((key: keyof typeof modals) => {
    setModals((prev) => ({ ...prev, [key]: true }));
  }, []);

  const closeModal = useCallback((key: keyof typeof modals) => {
    setModals((prev) => ({ ...prev, [key]: false }));
  }, []);

  const handleBillingSuccess = useCallback(async () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    localStorage.removeItem(`monthlyStats_${monthKey}`);
    localStorage.removeItem(`staffMonthlyStats_${monthKey}`);
    await Promise.all([fetchMonthlyStats(true), fetchStaffMonthlyStats(true)]);
  }, [fetchMonthlyStats, fetchStaffMonthlyStats]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!(invoicesLoaded && staffLoaded)) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-spin rounded-full border-4 border-[#B8962E] border-t-transparent" />
          <span className="text-xs font-medium text-[#6B6358] animate-pulse">
            Loading dashboard...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-8 pb-8 text-[#A89F8C]">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#2E2B24] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-[#B8962E]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B8962E]">
              Analytics
            </span>
          </div>
          <h1 className="text-[2rem] font-extrabold tracking-[-0.03em] text-[#F5F0E8]">
            Dashboard Overview
          </h1>
          <p className="mt-1 text-sm text-[#6B6358]">
            {format(new Date(), "EEEE, dd MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] px-4 py-2">
          <Store size={14} className="text-[#B8962E]" />
          <span className="text-xs font-bold text-[#A89F8C]">
            {stats.onDutyCount} Staff On Duty
          </span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Left Column */}
        <div className="space-y-8">
          {/* Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              title="Today's Collection"
              value={formatCurrency(stats.todayRevenue)}
              icon={TrendingUp}
              accent="gold"
            >
              <PaymentBreakdown
                cash={stats.cashToday}
                upi={stats.upiToday}
                card={stats.cardToday}
                advance={stats.advanceToday}
              />
            </StatCard>

            <StatCard
              title="Monthly Revenue"
              value={formatCurrency(stats.monthlyRevenue)}
              subtitle="Total sales in current month"
              icon={CreditCard}
              accent="green"
            />

            <StatCard
              title="Today's Visits"
              value={stats.todayVisits}
              subtitle="Unique customers served today"
              icon={CalendarDays}
              accent="blue"
            />
          </div>

          {/* Quick Actions */}
          <section className="rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-[-0.01em] text-[#F5F0E8]">
                Quick Actions
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6358]">
                Shortcuts
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                onClick={() => openModal("billing")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl bg-[#B8962E] p-4 text-[13px] font-extrabold tracking-wide uppercase text-[#0E0D0B] transition-all hover:bg-[#D4A935] hover:shadow-[0_8px_24px_rgba(184,150,46,0.25)] active:scale-[0.98]"
              >
                <Receipt size={24} strokeWidth={2} />
                <span>Open Billing</span>
              </button>

              <button
                onClick={() => openModal("settlements")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] p-4 text-[12px] font-semibold tracking-wide text-[#A89F8C] transition-all hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1F1A0F] active:scale-[0.98]"
              >
                <BarChart2 size={22} strokeWidth={2} />
                <span>Settlements</span>
              </button>

              <button
                onClick={() => openModal("customer")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] p-4 text-[12px] font-semibold tracking-wide text-[#A89F8C] transition-all hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1F1A0F] active:scale-[0.98]"
              >
                <UserPlus size={22} strokeWidth={2} />
                <span>Add Customer</span>
              </button>

              <button
                onClick={() => openModal("expense")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] p-4 text-[12px] font-semibold tracking-wide text-[#A89F8C] transition-all hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1F1A0F] active:scale-[0.98]"
              >
                <PiggyBank size={22} strokeWidth={2} />
                <span>Add Expense</span>
              </button>
            </div>

            <div className="mt-3 flex gap-3">
              <Link
                href="/staff"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] py-2.5 text-xs font-semibold text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E]"
              >
                <UsersRound size={14} />
                Manage Staff
              </Link>
              <Link
                href="/invoices"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] py-2.5 text-xs font-semibold text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E]"
              >
                <Receipt size={14} />
                All Invoices
              </Link>
            </div>
          </section>

          {/* Today's Invoices */}
          <section className="rounded-2xl border border-[#2E2B24] bg-[#1C1A16] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#2E2B24] px-6 py-4">
              <div>
                <h2 className="text-base font-bold tracking-[-0.01em] text-[#F5F0E8]">
                  Today's Invoices
                </h2>
                <p className="mt-0.5 text-xs text-[#6B6358]">
                  {todayInvoices.length} transactions recorded
                </p>
              </div>
              <div className="rounded-lg bg-[#131210] px-3 py-1.5 text-xs font-bold text-[#B8962E] border border-[#2E2B24]">
                {todayStr}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="border-b border-[#2E2B24] bg-[#131210]/50">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
                      Invoice
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
                      Type
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
                      Staff
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
                      Time
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6358]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#242118]">
                  {todayInvoices.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-[#6B6358]"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Receipt size={32} className="text-[#2E2B24]" />
                          <span className="italic">No bills recorded today</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    todayInvoices.map((inv) => (
                      <InvoiceRow key={inv.id} invoice={inv} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Column — Staff */}
        <section className="rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold tracking-[-0.01em] text-[#F5F0E8]">
                Stylists Floor Board
              </h2>
              <p className="mt-0.5 text-xs text-[#6B6358]">
                Real-time status and floor hours
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-[#131210] px-2.5 py-1.5 border border-[#2E2B24]">
              <div className="size-1.5 rounded-full bg-[#4ADE80]" />
              <span className="text-[10px] font-bold text-[#6B6358]">
                {staff.filter((s) => s.dutyStatus === "onDuty").length} Active
              </span>
            </div>
          </div>

          {staff.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users size={32} className="text-[#2E2B24]" />
              <p className="text-sm text-[#6B6358] italic">
                No registered staff found
              </p>
              <Link
                href="/staff"
                className="text-xs font-bold text-[#B8962E] hover:underline"
              >
                Add staff members
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {staffWithActiveTimes.map((member) => (
                <StaffCard
                  key={member.id}
                  member={member}
                  activeTime={member.activeTime}
                  onToggle={toggleDutyStatus}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      <ModalOverlay
        isOpen={modals.billing}
        onClose={() => closeModal("billing")}
        maxWidth="max-w-7xl"
      >
        <div className="p-6 md:p-8">
          <BillingTerminal
            onClose={() => closeModal("billing")}
            onSuccess={handleBillingSuccess}
          />
        </div>
      </ModalOverlay>

      {modals.customer && (
        <AddCustomerModal
          onClose={() => closeModal("customer")}
          onSuccess={() => closeModal("customer")}
        />
      )}

      {modals.expense && (
        <AddExpenseModal
          onClose={() => closeModal("expense")}
          onSuccess={() => {
            closeModal("expense");
            loadTodayExpenses();
          }}
        />
      )}

      <ModalOverlay
        isOpen={modals.settlements}
        onClose={() => closeModal("settlements")}
        maxWidth="max-w-6xl"
      >
        <div className="p-6 md:p-8">
          {/* Settlements Header */}
          <div className="flex items-center justify-between pb-5 border-b border-[#2E2B24]">
            <div>
              <h3 className="text-xl font-bold text-[#F5F0E8]">
                Today's Settlements
              </h3>
              <p className="mt-1 text-xs font-medium text-[#6B6358]">
                Detailed revenue splits for {format(new Date(), "dd MMM yyyy")}
              </p>
            </div>
            <button
              onClick={() => closeModal("settlements")}
              className="grid size-10 place-items-center rounded-xl border border-[#2E2B24] bg-[#131210] text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E]"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          {/* Settlements Content */}
          <div className="mt-6">
            {todayInvoices.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 border border-dashed border-[#2E2B24] rounded-2xl bg-[#131210]">
                <BarChart2 size={40} className="text-[#2E2B24]" />
                <p className="text-sm font-semibold text-[#6B6358]">
                  No sales or settlements recorded today
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Owner Card (Horizontal Layout) */}
                <SettlementCard
                  title="Owner Settlement"
                  value={todaySettlement.totalOwnerShare - todayExpensesTotal}
                  icon={ShieldCheck}
                  isOwner
                  items={[
                    { label: "Owner Direct Services", value: todaySettlement.ownerDirectRevenue },
                    { label: "Stylists 50% Share", value: todaySettlement.staffRevenueContribution },
                    { label: "Stylists Product Costs", value: todaySettlement.staffProductReimbursement },
                    { label: "Membership Invoices", value: todaySettlement.totalMembershipAmount },
                    { label: "Retail Product Sales", value: todaySettlement.retailProductsRevenue },
                    { label: "Gross Share", value: todaySettlement.totalOwnerShare },
                    { label: "Today's Expenses", value: todayExpensesTotal, negative: true },
                  ]}
                  collectedCredits={(todaySettlement.collectedCredits || []).map((c: any) => {
                    let share = 0;
                    if (c.staffName === "System" || c.role === "Owner") {
                      share = c.amount;
                    } else {
                      share = 0.5 * c.amount;
                    }
                    return {
                      ...c,
                      share,
                    };
                  })}
                />

                {/* Stylist Cards (3 Vertical Columns side-by-side) */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.values(todaySettlement.staffDetails)
                    .filter((sd) => sd.role !== "Owner")
                    .map((sd) => {
                      const collectedCredits = sd.collectedCredits || [];
                      const collectedCreditsShare = sd.collectedCreditsShare || 0;
                      const totalShare = sd.staffShare + collectedCreditsShare;

                      const mappedCollectedCredits = collectedCredits.map((c: any) => ({
                        ...c,
                        share: 0.5 * c.amount,
                      }));

                      return (
                        <SettlementCard
                          key={sd.staffId}
                          title={sd.name}
                          value={totalShare}
                          icon={Users}
                          items={[
                            { label: "Service Revenue", value: sd.serviceRevenue },
                            { label: "50% Base Share", value: 0.5 * sd.serviceRevenue },
                            { label: "Product Cost Used", value: sd.productCost, negative: true },
                          ]}
                          collectedCredits={mappedCollectedCredits}
                        />
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalOverlay>
    </div>
  );
}