"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import * as invoicesService from "@/services/invoices";
import * as expensesService from "@/services/expenses";
import * as staffDrawingsService from "@/services/staffDrawings";
import { getInvoicePayments, getInvoicePaymentRatio, getServiceCommission } from "@/lib/utils/settlements";
import { useAppData } from "@/context/AppDataContext";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { format } from "date-fns";
import { toLocalDateString } from "@/lib/utils/date";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Package,
  PiggyBank,
  TrendingUp,
  Users,
  RefreshCw,
  Receipt,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertCircle,
  Sparkles,
  BarChart3,
  Scissors,
  Trash2,
  Plus,
} from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── Types ──────────────────────────────────────────────────────────────────
interface Invoice {
  id?: string;
  dateKey?: string;
  date: any;
  grandTotal: number;
  subtotal: number;
  paymentMethod?: string;
  paymentSplit?: { cash?: number; upi?: number; card?: number };
  payments?: { cash?: number; upi?: number; card?: number };
  services?: ServiceItem[];
  products?: ProductItem[];
  billDate?: any;
  advanceAdded?: number;
  advanceUsed?: number;
}

interface ServiceItem {
  staffId?: string;
  staffName?: string;
  staffRole?: string;
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

interface DailyStat {
  dateKey: string;
  serviceRevenue?: number;
  productCost?: number;
  stylistShare?: number;
  ownerShare?: number;
  totalMembershipAmount?: number;
  retailProductsRevenue?: number;
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

interface DayDetails {
  ownerDirectRevenue: number;
  staffRevenueContribution: number;
  staffProductReimbursement: number;
  totalMembershipAmount: number;
  retailProductsRevenue: number;
  staffDetails: StaffDetail[];
  collectedCredits: any[];
}

interface StaffSplit {
  id?: string;
  name: string;
  todayShare: number;
  monthlyShare: number;
}

interface Expense {
  date: string;
  type: string;
  amount: number;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function getInvoiceDateKeys(invoice: Invoice) {
  let dateKey = "";
  if (invoice.billDate) {
    dateKey = toLocalDateString(invoice.billDate);
  } else if (invoice.date) {
    dateKey = toLocalDateString(invoice.date);
  } else {
    dateKey = invoice.dateKey || toLocalDateString(new Date());
  }
  return {
    dateKey,
    monthKey: dateKey.slice(0, 7),
  };
}

// ── Sub-Components ─────────────────────────────────────────────────────────

function MetricCard({
  title,
  today,
  monthly,
  icon: Icon,
  variant = "default",
  isHorizontal = false,
}: {
  title: string;
  today: number;
  monthly: number;
  icon: React.ElementType;
  variant?: "default" | "danger" | "owner";
  isHorizontal?: boolean;
}) {
  const variants = {
    default: {
      border: "border-[#2E2B24] hover:border-[#B8962E]/30",
      iconBg: "bg-[#B8962E]/10 text-[#B8962E]",
      todayColor: "text-[#F5F0E8]",
      monthlyColor: "text-[#F5F0E8]",
    },
    danger: {
      border: "border-[#2E2B24] hover:border-[#E57373]/30",
      iconBg: "bg-[#E57373]/10 text-[#E57373]",
      todayColor: "text-[#E57373]",
      monthlyColor: "text-[#E57373]",
    },
    owner: {
      border: "border-[#4A3A10]/50 hover:border-[#B8962E]/40",
      iconBg: "bg-[#B8962E]/10 text-[#B8962E]",
      todayColor: "text-[#D4A935]",
      monthlyColor: "text-[#D4A935]",
    },
  };

  const v = variants[variant];

  if (isHorizontal) {
    return (
      <div
        className={`group relative overflow-hidden rounded-2xl border ${v.border} bg-[#1C1A16] p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(184,150,46,0.06)]`}
      >
        <div className="absolute -right-20 -top-20 size-40 rounded-full blur-[80px] pointer-events-none opacity-10 bg-[#B8962E]" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2.5 shrink-0 ${v.iconBg}`}>
              <Icon size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="font-extrabold text-base tracking-tight text-[#F5F0E8]">
                {title}
              </h4>
              <span className="inline-block rounded-full border border-[#D4A935]/20 bg-[#D4A935]/5 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider mt-1 text-[#D4A935]">
                Owner
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 sm:gap-12 md:mr-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6B6358]">
                Today
              </span>
              <p className={`mt-1 text-2xl font-black ${v.todayColor}`}>
                {formatCurrency(today)}
              </p>
            </div>
            <div className="sm:border-l sm:border-[#2E2B24] sm:pl-12">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6B6358]">
                This Month
              </span>
              <p className={`mt-1 text-2xl font-black ${v.monthlyColor}`}>
                {formatCurrency(monthly)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group rounded-2xl border ${v.border} bg-[#1C1A16] p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(184,150,46,0.06)]`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-lg p-2 ${v.iconBg}`}>
            <Icon size={16} strokeWidth={2.5} />
          </div>
          <h4 className="text-sm font-bold text-[#F5F0E8]">{title}</h4>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6B6358]">
            Today
          </span>
          <p className={`mt-1 text-lg font-black ${v.todayColor}`}>
            {formatCurrency(today)}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6B6358]">
            This Month
          </span>
          <p className={`mt-1 text-lg font-black ${v.monthlyColor}`}>
            {formatCurrency(monthly)}
          </p>
        </div>
      </div>
    </div>
  );
}

function StaffSplitCard({
  member,
  drawings,
  onRefreshDrawings,
}: {
  member: StaffSplit;
  drawings: staffDrawingsService.StaffDrawing[];
  onRefreshDrawings: () => void;
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [isSaving, setIsSaving] = useState(false);

  const totalDrawings = drawings.reduce((sum, d) => sum + (d.amount || 0), 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Please enter a valid positive amount.");
      return;
    }

    setIsSaving(true);
    try {
      if (!member.id) throw new Error("Staff ID is missing");
      const month = date.slice(0, 7);
      await staffDrawingsService.addDrawing({
        staffId: member.id,
        staffName: member.name,
        amount: parsedAmount,
        note: note.trim() || undefined,
        date,
        month,
      });
      setAmount("");
      setNote("");
      setIsFormOpen(false);
      onRefreshDrawings();
    } catch (err) {
      console.error("Failed to save drawing:", err);
      alert("Failed to save drawing.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this drawing?")) return;
    try {
      await staffDrawingsService.deleteDrawing(id);
      onRefreshDrawings();
    } catch (err) {
      console.error("Failed to delete drawing:", err);
      alert("Failed to delete drawing.");
    }
  };

  const monthlyColor = member.monthlyShare < 0 ? "text-[#E57373]" : "text-[#60A5FA]";

  return (
    <div className="group rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-5 shadow-sm transition-all duration-300 hover:border-[#B8962E]/30 hover:shadow-[0_8px_30px_rgba(184,150,46,0.06)] flex flex-col justify-between min-h-[160px]">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[#60A5FA]/10 p-2 text-[#60A5FA]">
              <Scissors size={16} strokeWidth={2.5} />
            </div>
            <h4 className="text-sm font-bold text-[#F5F0E8]">{member.name}</h4>
          </div>
          <button
            onClick={() => {
              setIsFormOpen(!isFormOpen);
              setDate(toLocalDateString(new Date()));
            }}
            className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#B8962E] hover:text-[#D4A935] transition-colors"
          >
            <Plus size={12} strokeWidth={3} />
            Drawing
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6B6358]">
              Today
            </span>
            <p className="mt-1 text-lg font-black text-[#60A5FA]">
              {formatCurrency(member.todayShare)}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#6B6358]">
              This Month
            </span>
            <p className={`mt-1 text-lg font-black ${monthlyColor}`}>
              {formatCurrency(member.monthlyShare)}
            </p>
          </div>
        </div>

        {/* Inline Form */}
        {isFormOpen && (
          <form onSubmit={handleSave} className="mt-4 border-t border-[#2E2B24]/60 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#B8962E]">
                Add New Drawing
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold uppercase text-[#6B6358]">Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount (₹)"
                  required
                  disabled={isSaving}
                  className="w-full rounded-lg border border-[#2E2B24] bg-[#131210] px-3 py-1.5 text-xs text-[#F5F0E8] focus:border-[#B8962E] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase text-[#6B6358]">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={isSaving}
                  className="w-full rounded-lg border border-[#2E2B24] bg-[#131210] px-3 py-1.5 text-xs text-[#F5F0E8] focus:border-[#B8962E] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-[#6B6358]">Note (Optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Cash advance, travel expense"
                disabled={isSaving}
                className="w-full rounded-lg border border-[#2E2B24] bg-[#131210] px-3 py-1.5 text-xs text-[#F5F0E8] focus:border-[#B8962E] focus:outline-none"
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={isSaving}
                className="rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B6358] hover:text-[#F5F0E8] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-[#B8962E] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#0E0D0B] hover:bg-[#D4A935] transition-all disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Collapsible Drawings Section */}
      <div className="mt-4 border-t border-[#2E2B24]/40 pt-3">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B6358] hover:text-[#A89F8C] transition-colors flex items-center gap-1">
            Drawings this month
            {drawings.length > 0 && (
              <span className="rounded-full bg-[#E57373]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#E57373]">
                {drawings.length}
              </span>
            )}
          </span>
          <div className="text-[#6B6358]">
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
        </button>

        {!isCollapsed && (
          <div className="mt-3 space-y-2">
            {drawings.length === 0 ? (
              <p className="text-[11px] text-[#6B6358] italic py-1">No drawings recorded</p>
            ) : (
              <div className="max-h-40 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-[#2E2B24]">
                {drawings.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-start justify-between rounded-lg bg-[#131210]/40 border border-[#2E2B24]/40 p-2 text-[11px]"
                  >
                    <div className="space-y-0.5 flex-1 min-w-0 mr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[#A89F8C] font-semibold">
                          {format(new Date(d.date + "T00:00:00"), "dd MMM")}
                        </span>
                        {d.note && (
                          <span className="text-[#6B6358] truncate max-w-[120px]" title={d.note}>
                            • {d.note}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-extrabold text-[#E57373]">
                        -{formatCurrency(d.amount)}
                      </span>
                      <button
                        onClick={() => d.id && handleDelete(d.id)}
                        className="text-[#6B6358] hover:text-[#E57373] transition-colors"
                        title="Delete drawing"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between border-t border-[#2E2B24]/40 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-[#A89F8C]">
              <span>Total Drawings</span>
              <span className="text-[#E57373]">-{formatCurrency(totalDrawings)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DayHeader({
  day,
  isToday,
  isExpanded,
  hasTransactions,
  onToggle,
}: {
  day: {
    date: string;
    totalServiceRevenue: number;
    totalMembershipAmount: number;
    totalRetailProductsRevenue: number;
    totalProductCost: number;
    totalStaffShare: number;
    totalOwnerShare: number;
  };
  isToday: boolean;
  isExpanded: boolean;
  hasTransactions: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={() => hasTransactions && onToggle()}
      className={`flex items-center justify-between p-5 select-none transition-colors ${hasTransactions
          ? "cursor-pointer hover:bg-[#1F1A0F]/30"
          : "opacity-50"
        }`}
    >
      <div className="flex items-center gap-3">
        {hasTransactions ? (
          <div
            className={`grid size-8 place-items-center rounded-lg border border-[#2E2B24] bg-[#131210] transition-all ${isExpanded ? "border-[#B8962E]/30 text-[#B8962E]" : "text-[#6B6358]"
              }`}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        ) : (
          <div className="size-8" />
        )}
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold text-[#F5F0E8]">
              {format(new Date(day.date + "T00:00:00"), "dd MMM yyyy")}
            </span>
            <span className="text-xs text-[#6B6358] font-medium">
              {format(new Date(day.date + "T00:00:00"), "EEEE")}
            </span>
            {isToday && (
              <span className="rounded-full bg-[#B8962E] px-2.5 py-0.5 text-[10px] font-extrabold text-[#0E0D0B] uppercase tracking-wider">
                Today
              </span>
            )}
          </div>
          {!hasTransactions && (
            <p className="text-[11px] text-[#6B6358] font-medium mt-0.5">
              No operations recorded
            </p>
          )}
        </div>
      </div>

      {hasTransactions && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="hidden md:flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Receipt size={12} className="text-[#6B6358]" />
              <span className="text-[#6B6358]">Service</span>
              <span className="font-bold text-[#F5F0E8]">
                {formatCurrency(day.totalServiceRevenue)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <PiggyBank size={12} className="text-[#6B6358]" />
              <span className="text-[#6B6358]">Membership</span>
              <span className="font-bold text-[#F5F0E8]">
                {formatCurrency(day.totalMembershipAmount)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Package size={12} className="text-[#6B6358]" />
              <span className="text-[#6B6358]">Retail</span>
              <span className="font-bold text-[#F5F0E8]">
                {formatCurrency(day.totalRetailProductsRevenue)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-[#132A3A]/60 border border-[#2B5270]/40 px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#60A5FA]">
                Staff{" "}
                <span className="text-[#60A5FA] font-extrabold ml-1">
                  {formatCurrency(day.totalStaffShare)}
                </span>
              </span>
            </div>
            <div className="rounded-xl bg-[#2E1A47]/60 border border-[#5E3E8C]/40 px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#C084FC]">
                Owner{" "}
                <span className="text-[#C084FC] font-extrabold ml-1">
                  {formatCurrency(day.totalOwnerShare)}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettlementDetailCard({
  title,
  value,
  icon: Icon,
  items,
  variant = "default",
  collectedCredits,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  items: { label: string; value: number; negative?: boolean }[];
  variant?: "default" | "owner";
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
  const isOwner = variant === "owner";
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-12 text-center shadow-sm">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#131210] border border-[#2E2B24] text-[#B8962E] mb-4">
        <BarChart3 size={28} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-bold text-[#F5F0E8]">No Settlement History</p>
      <p className="text-xs text-[#6B6358] mt-1.5 max-w-xs mx-auto">
        There are no invoices or memberships recorded in the selected date range.
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SettlementsPage() {
  const { staff } = useAppData();
  const [loading, setLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<Record<string, DailyStat>>({});
  const [dayInvoicesMap, setDayInvoicesMap] = useState<Record<string, Invoice[]>>({});
  const [monthlyStaffShares, setMonthlyStaffShares] = useState<Record<string, number>>({});
  const [staffDrawings, setStaffDrawings] = useState<Record<string, staffDrawingsService.StaffDrawing[]>>({});

  const fetchDrawings = useCallback(async () => {
    const loadNow = new Date();
    const yyyy = loadNow.getFullYear();
    const mm = String(loadNow.getMonth() + 1).padStart(2, "0");
    const monthKey = `${yyyy}-${mm}`;
    try {
      const q = query(
        collection(db, "staffDrawings"),
        where("month", "==", monthKey)
      );
      const snap = await getDocs(q);
      const map: Record<string, staffDrawingsService.StaffDrawing[]> = {};
      snap.forEach((doc) => {
        const d = { id: doc.id, ...doc.data() } as staffDrawingsService.StaffDrawing;
        const sId = d.staffId;
        if (sId) {
          if (!map[sId]) map[sId] = [];
          map[sId].push(d);
        }
      });
      Object.keys(map).forEach((sId) => {
        map[sId].sort((a, b) => b.date.localeCompare(a.date));
      });
      setStaffDrawings(map);
    } catch (err) {
      console.error("Failed to fetch staff drawings:", err);
    }
  }, []);
  const [monthlyStatsTotals, setMonthlyStatsTotals] = useState({
    ownerShare: 0,
    membershipAmount: 0,
    retailProductsRevenue: 0,
    productsReturned: 0,
  });
  const [loadingDays, setLoadingDays] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<Expense[]>([]);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(
    toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))
  );
  const [dateTo, setDateTo] = useState(toLocalDateString(now));
  const todayStr = useMemo(() => toLocalDateString(new Date()), []);

  // ── Sync Handler ───────────────────────────────────────────────────────

  const handleSyncStats = useCallback(async () => {
    setSyncing(true);
    try {
      const allInvoices = await invoicesService.getAll();
      const monthlyStats: Record<string, any> = {};
      const dailyStats: Record<string, any> = {};
      const staffStats: Record<string, any> = {};

      allInvoices.forEach((inv: any) => {
        const { dateKey, monthKey } = getInvoiceDateKeys(inv);
        const payments = getInvoicePayments(inv);
        const grandTotal = inv.grandTotal || 0;
        const collected = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + (inv.advanceUsed || 0);
        const ratio = getInvoicePaymentRatio(inv);

        if (!monthlyStats[monthKey]) {
          monthlyStats[monthKey] = {
            totalRevenue: 0,
            totalVisits: 0,
            cash: 0,
            upi: 0,
            card: 0,
          };
        }
        monthlyStats[monthKey].totalRevenue += collected;
        monthlyStats[monthKey].totalVisits += 1;
        monthlyStats[monthKey].cash += payments.cash;
        monthlyStats[monthKey].upi += payments.upi;
        monthlyStats[monthKey].card += payments.card;

        if (!dailyStats[dateKey]) {
          dailyStats[dateKey] = {
            dateKey,
            totalRevenue: 0,
            totalVisits: 0,
            cash: 0,
            upi: 0,
            card: 0,
            serviceRevenue: 0,
            productCost: 0,
            stylistShare: 0,
            ownerShare: 0,
            totalMembershipAmount: 0,
            retailProductsRevenue: 0,
          };
        }
        dailyStats[dateKey].totalRevenue += collected;
        dailyStats[dateKey].totalVisits += 1;
        dailyStats[dateKey].cash += payments.cash;
        dailyStats[dateKey].upi += payments.upi;
        dailyStats[dateKey].card += payments.card;

        const discountFactor =
          inv.subtotal > 0 ? inv.grandTotal / inv.subtotal : 1;

        (inv.services || []).forEach((s: any) => {
          const comm = getServiceCommission(s, inv);
          dailyStats[dateKey].serviceRevenue += comm.serviceRevenue * ratio;
          dailyStats[dateKey].productCost += comm.productCost * ratio;
          dailyStats[dateKey].stylistShare += comm.stylistShare * ratio;
          dailyStats[dateKey].ownerShare += comm.ownerShare * ratio;
          if (s.serviceId === "membership_fee") {
            dailyStats[dateKey].totalMembershipAmount += comm.serviceRevenue * ratio;
          }
        });

        (inv.products || []).forEach((p: any) => {
          const productBaseAmount =
            p.amount ??
            Math.max((p.price || 0) * (p.quantity || 1) - (p.discount || 0), 0);
          const amount = productBaseAmount * discountFactor;
          dailyStats[dateKey].ownerShare += amount * ratio;
          dailyStats[dateKey].retailProductsRevenue += amount * ratio;
        });

        const staffInvoiceSummary: Record<string, any> = {};
        (inv.services || []).forEach((s: any) => {
          const staffId = s.staffId || "unassigned";
          if (!staffInvoiceSummary[staffId]) {
            staffInvoiceSummary[staffId] = {
              revenue: 0,
              servicesCount: 0,
              productCost: 0,
            };
          }
          const serviceBaseAmount =
            s.amount ?? Math.max((s.price || 0) - (s.discount || 0), 0);
          const amount = serviceBaseAmount * discountFactor;
          const cost = s.usedProductCost || 0;
          staffInvoiceSummary[staffId].revenue += amount;
          staffInvoiceSummary[staffId].servicesCount += 1;
          staffInvoiceSummary[staffId].productCost += cost;
        });

        Object.entries(staffInvoiceSummary).forEach(([staffId, summary]) => {
          const staffMonthKey = `${staffId}_${monthKey}`;
          if (!staffStats[staffMonthKey]) {
            staffStats[staffMonthKey] = {
              revenue: 0,
              servicesCount: 0,
              visits: 0,
              productCost: 0,
            };
          }
          staffStats[staffMonthKey].revenue += summary.revenue * ratio;
          staffStats[staffMonthKey].servicesCount += summary.servicesCount;
          staffStats[staffMonthKey].productCost += summary.productCost * ratio;
          staffStats[staffMonthKey].visits += 1;
        });
      });

      let currentBatch = writeBatch(db);
      let count = 0;

      const ops: { ref: any; data: any }[] = [];
      Object.entries(monthlyStats).forEach(([monthKey, stats]) => {
        ops.push({ ref: doc(db, "stats", `revenue_${monthKey}`), data: stats });
      });
      Object.entries(dailyStats).forEach(([dateKey, stats]) => {
        ops.push({ ref: doc(db, "stats", `daily_${dateKey}`), data: stats });
      });
      Object.entries(staffStats).forEach(([staffMonthKey, stats]) => {
        const [staffId, monthKey] = staffMonthKey.split("_");
        ops.push({
          ref: doc(db, "stats", `staff_${staffId}_${monthKey}`),
          data: stats,
        });
      });

      for (const op of ops) {
        currentBatch.set(op.ref, op.data, { merge: true });
        count++;
        if (count % 400 === 0) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
        }
      }
      if (count % 400 !== 0) {
        await currentBatch.commit();
      }

      alert("Statistics synchronized successfully!");
      window.location.reload();
    } catch (err) {
      console.error("Failed to sync stats:", err);
      alert("Failed to sync stats. See console for details.");
    } finally {
      setSyncing(false);
    }
  }, []);

  // ── Data Loading ───────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const dailyQuery = query(
          collection(db, "stats"),
          where("dateKey", ">=", dateFrom),
          where("dateKey", "<=", dateTo)
        );
        const dailySnap = await getDocs(dailyQuery);
        const statsMap: Record<string, DailyStat> = {};
        dailySnap.forEach((d) => {
          const data = d.data() as DailyStat;
          if (data.dateKey) statsMap[data.dateKey] = data;
        });
        setDailyStats(statsMap);

        try {
          const todayInvoices = await invoicesService.getByDateKey(todayStr);
          setDayInvoicesMap((prev) => ({ ...prev, [todayStr]: todayInvoices }));
        } catch (err) {
          console.error("Failed to load today's invoices:", err);
        }

        const loadNow = new Date();
        const yyyy = loadNow.getFullYear();
        const mm = String(loadNow.getMonth() + 1).padStart(2, "0");
        const monthKey = `${yyyy}-${mm}`;

        const stylistStaff = staff.filter(
          (st) =>
            st.isOwner !== true && st.id !== "system" && st.name !== "System"
        );

        const sharesMap: Record<string, number> = {};
        await Promise.all(
          stylistStaff.map(async (member) => {
            if (!member.id) return;
            try {
              const staffDocRef = doc(
                db,
                "stats",
                `staff_${member.id}_${monthKey}`
              );
              const snap = await getDoc(staffDocRef);
              if (snap.exists()) {
                const data = snap.data();
                const revenue = data.revenue || 0;
                const productCost = data.productCost || 0;
                const rate = member.commissionRate ?? 50;
                sharesMap[member.id] = (rate / 100) * revenue - productCost;
              } else {
                sharesMap[member.id] = 0;
              }
            } catch (err) {
              console.error(
                `Error loading monthly share for staff ${member.id}:`,
                err
              );
              sharesMap[member.id] = 0;
            }
          })
        );
        setMonthlyStaffShares(sharesMap);
        await fetchDrawings();

        const monthlyDailyQuery = query(
          collection(db, "stats"),
          where("dateKey", ">=", `${monthKey}-01`),
          where("dateKey", "<=", `${monthKey}-31`)
        );
        const monthlyDailySnap = await getDocs(monthlyDailyQuery);
        let mOwnerShare = 0;
        let mMembershipAmount = 0;
        let mRetailProductsRevenue = 0;
        let mProductsReturned = 0;

        monthlyDailySnap.forEach((d) => {
          const data = d.data();
          if (data.dateKey && data.dateKey.startsWith(monthKey)) {
            mOwnerShare += data.ownerShare || 0;
            mMembershipAmount += data.totalMembershipAmount || 0;
            mRetailProductsRevenue += data.retailProductsRevenue || 0;
            mProductsReturned += data.productCost || 0;
          }
        });

        setMonthlyStatsTotals({
          ownerShare: mOwnerShare,
          membershipAmount: mMembershipAmount,
          retailProductsRevenue: mRetailProductsRevenue,
          productsReturned: mProductsReturned,
        });

        try {
          const start = new Date(dateFrom);
          start.setHours(0, 0, 0, 0);
          const end = new Date(dateTo);
          end.setHours(23, 59, 59, 999);
          const expensesData = await expensesService.getByDateRange(start, end);
          setExpenses(expensesData);
        } catch (err) {
          console.error("Failed to load range expenses:", err);
        }

        try {
          const startOfMonth = new Date(
            loadNow.getFullYear(),
            loadNow.getMonth(),
            1
          );
          const endOfMonth = new Date(
            loadNow.getFullYear(),
            loadNow.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
          );
          const monthlyExpensesData = await expensesService.getByDateRange(
            startOfMonth,
            endOfMonth
          );
          setMonthlyExpenses(monthlyExpensesData);
        } catch (err) {
          console.error("Failed to load monthly expenses:", err);
        }
      } catch (err) {
        console.error("Failed to load settlements data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dateFrom, dateTo, staff, todayStr, fetchDrawings]);

  // ── Derived State ────────────────────────────────────────────────────────

  const dailyExpensesMap = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((exp) => {
      if (exp.type === "daily") {
        map[exp.date] = (map[exp.date] || 0) + exp.amount;
      }
    });
    return map;
  }, [expenses]);

  const todayDailyExpenses = useMemo(() => {
    const todayStr = toLocalDateString(new Date());
    return monthlyExpenses
      .filter((e) => e.type === "daily" && e.date === todayStr)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthlyExpenses]);

  const monthDailyExpenses = useMemo(() => {
    return monthlyExpenses
      .filter((e) => e.type === "daily")
      .reduce((sum, e) => sum + e.amount, 0);
  }, [monthlyExpenses]);

  const dateList = useMemo(() => {
    const dates: string[] = [];
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T00:00:00");
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

    const current = new Date(start);
    while (current <= end) {
      dates.push(toLocalDateString(current));
      current.setDate(current.getDate() + 1);
    }
    return dates.reverse();
  }, [dateFrom, dateTo]);

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(
    () => ({
      [todayStr]: true,
    })
  );

  const toggleDayExpand = useCallback(
    async (dateStr: string) => {
      const isExpanded = !!expandedDays[dateStr];

      setExpandedDays((prev) => ({
        ...prev,
        [dateStr]: !prev[dateStr],
      }));

      if (!isExpanded && !dayInvoicesMap[dateStr]) {
        setLoadingDays((prev) => ({ ...prev, [dateStr]: true }));
        try {
          const dayInvoices = await invoicesService.getByDateKey(dateStr);
          setDayInvoicesMap((prev) => ({ ...prev, [dateStr]: dayInvoices }));
        } catch (err) {
          console.error(`Failed to load invoices for date ${dateStr}:`, err);
        } finally {
          setLoadingDays((prev) => ({ ...prev, [dateStr]: false }));
        }
      }
    },
    [expandedDays, dayInvoicesMap]
  );

  const getDayDetails = useCallback(
    (dateStr: string): DayDetails => {
      const dayInvoices = dayInvoicesMap[dateStr] || [];
      let ownerDirectRevenue = 0;
      let staffRevenueContribution = 0;
      let staffProductReimbursement = 0;
      let totalMembershipAmount = 0;
      let retailProductsRevenue = 0;
      const staffDetails: Record<string, StaffDetail> = {};
      const collectedCredits: any[] = [];

      dayInvoices.forEach((inv) => {
        const discountFactor =
          inv.subtotal > 0 ? inv.grandTotal / inv.subtotal : 1;

        const ratio = getInvoicePaymentRatio(inv);

        (inv.products || []).forEach((p: any) => {
          const productBaseAmount =
            p.amount ??
            Math.max((p.price || 0) * (p.quantity || 1) - (p.discount || 0), 0);
          const amount = productBaseAmount * discountFactor;

          if (p.isCreditSettle) {
            collectedCredits.push({
              originalBillDate: p.originalBillDate || "",
              originalInvoiceNumber: p.originalInvoiceNumber || "",
              collectionDate: p.collectionDate || dateStr,
              collectionMethod: p.collectionMethod || inv.paymentMethod || "UPI",
              collectedBy: p.collectedBy || "System",
              amount: amount * ratio,
              staffName: "System",
              staffId: "system",
              serviceOrProductName: p.productName || p.product || "Credit Settle (Product)",
              type: "product",
            });
            ownerDirectRevenue += amount * ratio;
            return;
          }

          retailProductsRevenue += amount * ratio;
        });

        (inv.services || []).forEach((s: any) => {
          const serviceBaseAmount =
            s.amount ?? Math.max((s.price || 0) - (s.discount || 0), 0);
          const amount = serviceBaseAmount * discountFactor;
          const cost = s.usedProductCost || 0;
          const staffId = s.staffId || "unassigned";
          const staffName = s.staffName || "Unassigned";

          const staffMember = staff.find(
            (st) => st.id === staffId || st.name === staffName
          );
          const role = s.staffRole || staffMember?.role || "Stylist";

          if (s.serviceId === "membership_fee") {
            totalMembershipAmount += amount * ratio;
            return;
          }

          if (s.isCreditSettle) {
            collectedCredits.push({
              originalBillDate: s.originalBillDate || "",
              originalInvoiceNumber: s.originalInvoiceNumber || "",
              collectionDate: s.collectionDate || dateStr,
              collectionMethod: s.collectionMethod || inv.paymentMethod || "UPI",
              collectedBy: s.collectedBy || "System",
              amount: amount * ratio,
              staffName,
              staffId,
              serviceOrProductName: s.serviceName || s.service || "Credit Settle",
              type: "service",
            });

            const key = staffId !== "unassigned" ? staffId : staffName;
            if (!staffDetails[key]) {
              staffDetails[key] = {
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
            const sd = staffDetails[key];
            if (!sd.collectedCredits) {
              sd.collectedCredits = [];
              sd.collectedCreditsShare = 0;
            }

            sd.collectedCredits.push({
              originalBillDate: s.originalBillDate || "",
              originalInvoiceNumber: s.originalInvoiceNumber || "",
              collectionDate: s.collectionDate || dateStr,
              collectionMethod: s.collectionMethod || inv.paymentMethod || "UPI",
              collectedBy: s.collectedBy || "System",
              amount: amount * ratio,
              serviceOrProductName: s.serviceName || s.service || "Credit Settle",
              type: "service",
            });

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

            if (isOwner) {
              ownerDirectRevenue += amount * ratio;
              sd.ownerShareContribution += amount * ratio;
            } else {
              staffRevenueContribution += stylistShare * ratio;
              sd.collectedCreditsShare = (sd.collectedCreditsShare || 0) + stylistShare * ratio;
              sd.ownerShareContribution += ownerShare * ratio;
            }
            return;
          }

          const key = staffId !== "unassigned" ? staffId : staffName;
          if (!staffDetails[key]) {
            staffDetails[key] = {
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
          const sd = staffDetails[key];

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

          if (isOwner) {
            ownerDirectRevenue += amount * ratio;
            sd.serviceRevenue += amount * ratio;
            sd.productCost += cost * ratio;
            sd.ownerShareContribution += amount * ratio;
          } else {
            staffRevenueContribution += ((commissionRate / 100) * amount) * ratio;
            staffProductReimbursement += cost * ratio;
            sd.serviceRevenue += amount * ratio;
            sd.productCost += cost * ratio;
            sd.staffShare += stylistShare * ratio;
            sd.ownerShareContribution += ownerShare * ratio;
          }
        });
      });

      return {
        ownerDirectRevenue,
        staffRevenueContribution,
        staffProductReimbursement,
        totalMembershipAmount,
        retailProductsRevenue,
        staffDetails: Object.values(staffDetails),
        collectedCredits,
      };
    },
    [staff, dayInvoicesMap]
  );

  const staffSplits = useMemo((): StaffSplit[] => {
    const stylistStaff = staff.filter(
      (st) =>
        st.isOwner !== true && st.id !== "system" && st.name !== "System"
    );
    const todayInvoices = dayInvoicesMap[todayStr] || [];

    return stylistStaff.map((member) => {
      let todayShare = 0;
      todayInvoices.forEach((inv) => {
        const discountFactor =
          inv.subtotal > 0 ? inv.grandTotal / inv.subtotal : 1;
        const ratio = getInvoicePaymentRatio(inv);

        (inv.services || []).forEach((s: any) => {
          if (s.staffId === member.id || s.staffName === member.name) {
            const commissionRate = member.commissionRate ?? s.commissionRate ?? 50;
            const isOwner = member.isOwner ?? s.isOwner ?? false;
            const isSystemService = s.isSystemService ?? s.serviceId === "membership_fee";

            if (!isSystemService) {
              const serviceBaseAmount =
                s.amount ?? Math.max((s.price || 0) - (s.discount || 0), 0);
              const amount = serviceBaseAmount * discountFactor;
              const cost = s.usedProductCost || 0;

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
        });
      });

      const totalDrawings = (member.id ? staffDrawings[member.id] || [] : []).reduce(
        (sum, d) => sum + (d.amount || 0),
        0
      );
      const monthlyShare = (member.id ? monthlyStaffShares[member.id] || 0 : 0) - totalDrawings;

      return {
        id: member.id,
        name: member.name,
        todayShare,
        monthlyShare,
      };
    });
  }, [dayInvoicesMap, staff, monthlyStaffShares, todayStr, staffDrawings]);

  const todayMetrics = useMemo(() => {
    const details = getDayDetails(todayStr);
    const ownerShare =
      details.ownerDirectRevenue +
      details.staffRevenueContribution +
      details.staffProductReimbursement +
      details.totalMembershipAmount +
      details.retailProductsRevenue;

    return {
      ownerShare,
      membershipAmount: details.totalMembershipAmount,
      retailProductsRevenue: details.retailProductsRevenue,
      productsReturned: details.staffProductReimbursement,
    };
  }, [getDayDetails, todayStr]);

  const visibleSettlements = useMemo(() => {
    return dateList
      .map((d) => {
        const stats = dailyStats[d];
        const dayDailyExpenses = dailyExpensesMap[d] || 0;
        return {
          date: d,
          totalServiceRevenue: stats?.serviceRevenue || 0,
          totalMembershipAmount: stats?.totalMembershipAmount || 0,
          totalProductCost: stats?.productCost || 0,
          totalStaffShare: stats?.stylistShare || 0,
          totalOwnerShare: (stats?.ownerShare || 0) - dayDailyExpenses,
          totalRetailProductsRevenue: stats?.retailProductsRevenue || 0,
        };
      })
      .filter((day) => {
        const hasTransactions =
          day.totalServiceRevenue > 0 || day.totalMembershipAmount > 0;
        const isToday = day.date === todayStr;
        return isToday || hasTransactions;
      });
  }, [dailyStats, dateList, todayStr, dailyExpensesMap]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-spin rounded-full border-4 border-[#B8962E] border-t-transparent" />
          <span className="text-xs font-medium text-[#6B6358] animate-pulse">
            Loading settlements...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-8 pb-12 text-[#F5F0E8]">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#2E2B24] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-[#B8962E]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B8962E]">
              Daily Operations
            </span>
          </div>
          <h1 className="text-[2rem] font-extrabold tracking-[-0.03em] text-[#F5F0E8]">
            Settlements
          </h1>
          <p className="mt-1 text-sm text-[#6B6358]">
            Revenue splits, commissions & daily breakdowns
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date Selector */}
          <div className="flex items-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] px-3 py-2">
            <Calendar size={14} className="text-[#6B6358]" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 rounded-lg border border-[#2E2B24] bg-[#131210] px-2.5 text-xs font-semibold text-[#F5F0E8] outline-none focus:border-[#B8962E] transition"
            />
            <span className="text-[10px] font-bold text-[#6B6358] uppercase tracking-wider">
              to
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 rounded-lg border border-[#2E2B24] bg-[#131210] px-2.5 text-xs font-semibold text-[#F5F0E8] outline-none focus:border-[#B8962E] transition"
            />
          </div>

          <button
            onClick={handleSyncStats}
            disabled={syncing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] px-4 text-xs font-bold text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E] disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={syncing ? "animate-spin" : ""}
            />
            {syncing ? "Syncing..." : "Sync Stats"}
          </button>
        </div>
      </header>

      {/* Owner & Staff Splits */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-[#B8962E]" />
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#A89F8C]">
            Owner & Staff Splits
          </h2>
        </div>
        <div className="flex flex-col gap-4">
          <MetricCard
            title="Owner Settlement"
            today={todayMetrics.ownerShare - todayDailyExpenses}
            monthly={monthlyStatsTotals.ownerShare - monthDailyExpenses}
            icon={ShieldCheck}
            variant="owner"
            isHorizontal={true}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {staffSplits.map((member) => (
              <StaffSplitCard
                key={member.id}
                member={member}
                drawings={member.id ? staffDrawings[member.id] || [] : []}
                onRefreshDrawings={fetchDrawings}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Revenue Metrics */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-[#B8962E]" />
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#A89F8C]">
            Revenue Breakdown
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Membership Revenue"
            today={todayMetrics.membershipAmount}
            monthly={monthlyStatsTotals.membershipAmount}
            icon={PiggyBank}
          />
          <MetricCard
            title="Retail Product Sales"
            today={todayMetrics.retailProductsRevenue}
            monthly={monthlyStatsTotals.retailProductsRevenue}
            icon={Package}
          />
          <MetricCard
            title="Products Returned"
            today={todayMetrics.productsReturned}
            monthly={monthlyStatsTotals.productsReturned}
            icon={Package}
          />
          <MetricCard
            title="Daily Expenses"
            today={todayDailyExpenses}
            monthly={monthDailyExpenses}
            icon={TrendingUp}
            variant="danger"
          />
        </div>
      </section>

      {/* Daily Breakdown */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[#B8962E]" />
            <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[#A89F8C]">
              Daily Breakdown
            </h2>
          </div>
          <span className="text-[10px] font-bold text-[#6B6358] uppercase tracking-wider">
            {visibleSettlements.length} days
          </span>
        </div>

        <div className="space-y-3">
          {visibleSettlements.length === 0 ? (
            <EmptyState />
          ) : (
            visibleSettlements.map((day) => {
              const isToday = day.date === todayStr;
              const hasTransactions =
                day.totalServiceRevenue > 0 || day.totalMembershipAmount > 0;
              const isExpanded = !!expandedDays[day.date];

              return (
                <div
                  key={day.date}
                  className="overflow-hidden rounded-2xl border border-[#2E2B24] bg-[#1C1A16] shadow-sm transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
                >
                  <DayHeader
                    day={day}
                    isToday={isToday}
                    isExpanded={isExpanded}
                    hasTransactions={hasTransactions}
                    onToggle={() => toggleDayExpand(day.date)}
                  />

                  {isExpanded && hasTransactions && (
                    <div className="border-t border-[#2E2B24] bg-[#131210]/40 p-5">
                      {loadingDays[day.date] ? (
                        <div className="flex h-24 items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <div className="size-6 animate-spin rounded-full border-2 border-[#B8962E] border-t-transparent" />
                            <span className="text-[10px] text-[#6B6358] font-medium">
                              Loading details...
                            </span>
                          </div>
                        </div>
                      ) : (
                        (() => {
                          const details = getDayDetails(day.date);
                          return (
                            <div className="flex flex-col gap-6">
                              <SettlementDetailCard
                                title="Owner Settlement"
                                value={day.totalOwnerShare}
                                icon={ShieldCheck}
                                variant="owner"
                                items={[
                                  {
                                    label: "Owner Direct Services",
                                    value: details.ownerDirectRevenue,
                                  },
                                  {
                                    label: "Stylists Share Contribution",
                                    value: details.staffRevenueContribution,
                                  },
                                  {
                                    label: "Stylists Product Costs",
                                    value: details.staffProductReimbursement,
                                  },
                                  {
                                    label: "Membership Invoices",
                                    value: details.totalMembershipAmount,
                                  },
                                  {
                                    label: "Retail Product Sales",
                                    value: details.retailProductsRevenue,
                                  },
                                  {
                                    label: "Gross Share",
                                    value:
                                      details.ownerDirectRevenue +
                                      details.staffRevenueContribution +
                                      details.staffProductReimbursement +
                                      details.totalMembershipAmount +
                                      details.retailProductsRevenue,
                                  },
                                  {
                                    label: "Daily Expenses",
                                    value: dailyExpensesMap[day.date] || 0,
                                    negative: true,
                                  },
                                ]}
                                collectedCredits={(details.collectedCredits || []).map((c: any) => {
                                  let share = 0;
                                  const matchedStaff = staff.find(st => st.id === c.staffId || st.name === c.staffName);
                                  const isOwner = matchedStaff ? (matchedStaff.isOwner === true) : (c.staffName === "System" || c.role === "Owner");
                                  if (c.staffName === "System" || isOwner) {
                                    share = c.amount;
                                  } else {
                                    const rate = matchedStaff ? (matchedStaff.commissionRate ?? 50) : 50;
                                    share = (rate / 100) * c.amount;
                                  }
                                  return {
                                    ...c,
                                    share,
                                  };
                                })}
                              />

                              {/* Stylist Cards (3 Vertical Columns side-by-side) */}
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {details.staffDetails
                                  .filter((sd) => {
                                    const matched = staff.find(st => st.id === sd.staffId || st.name === sd.name);
                                    return matched ? (matched.isOwner !== true) : (sd.role !== "Owner");
                                  })
                                  .map((sd) => {
                                    const collectedCredits = sd.collectedCredits || [];
                                    const collectedCreditsShare = sd.collectedCreditsShare || 0;
                                    const totalShare = sd.staffShare + collectedCreditsShare;

                                    const mappedCollectedCredits = collectedCredits.map((c: any) => {
                                      const matchedStaff = staff.find(st => st.id === sd.staffId || st.name === sd.name);
                                      const rate = matchedStaff ? (matchedStaff.commissionRate ?? 50) : 50;
                                      return {
                                        ...c,
                                        share: (rate / 100) * c.amount,
                                      };
                                    });

                                    return (
                                      <SettlementDetailCard
                                        key={sd.staffId}
                                        title={sd.name}
                                        value={totalShare}
                                        icon={Users}
                                        items={[
                                          {
                                            label: "Service Revenue",
                                            value: sd.serviceRevenue,
                                          },
                                          {
                                            label: "50% Base Share",
                                            value: 0.5 * sd.serviceRevenue,
                                          },
                                          {
                                            label: "Product Cost Used",
                                            value: sd.productCost,
                                            negative: true,
                                          },
                                        ]}
                                        collectedCredits={mappedCollectedCredits}
                                      />
                                    );
                                  })}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}