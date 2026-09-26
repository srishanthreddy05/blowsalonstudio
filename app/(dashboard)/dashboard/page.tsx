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
import * as attendanceService from "@/services/attendance";
import type { AttendanceRecord } from "@/types/attendance";
import { normalizeAttendanceStatus } from "@/types/attendance";
import { formatCurrency } from "@/components/salon-dashboard/types";
import type { Staff } from "@/types/staff";
import { useAppData } from "@/context/AppDataContext";
import { toast } from "react-hot-toast";
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
  X,
  Store,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { BillingTerminal } from "@/components/billing/BillingTerminal";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";
import { AddExpenseModal } from "@/components/expenses/AddExpenseModal";
import * as customerService from "@/services/customers";
import * as expensesService from "@/services/expenses";
import { toLocalDateString } from "@/lib/utils/date";
import { getInvoicePayments, getInvoicePaymentRatio, getInvoiceSalesBreakdown } from "@/lib/utils/settlements";
import { TodayAppointmentsSection } from "@/components/dashboard/TodayAppointmentsSection";
import { useRouter } from "next/navigation";

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
}

interface ProductItem {
  price?: number | "";
  quantity?: number | "";
  discount?: number | "";
  amount?: number;
}

interface TodaySettlement {
  serviceSales: number;
  retailSales: number;
  membershipSales: number;
  totalSales: number;
  cash: number;
  upi: number;
  card: number;
  credit: number;
  billsCount: number;
  serviceTxnCount: number;
  retailTxnCount: number;
  membershipTxnCount: number;
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

// ── Sub-Components ─────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = "olive",
  children,
  className = "",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accent?: "olive" | "green" | "amber" | "charcoal";
  children?: React.ReactNode;
  className?: string;
}) {
  const accentColors = {
    olive: "text-[#6F776D] bg-[#E8ECE5]",
    green: "text-[#5F7A62] bg-[#E8ECE5]",
    amber: "text-[#B18A45] bg-[#FAF4E8]",
    charcoal: "text-[#2F352F] bg-[#F7F7F4]",
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs transition-all duration-300 hover:border-[#6F776D] hover:shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            {title}
          </span>
          <p className="text-[1.75rem] font-extrabold tracking-[-0.03em] text-[#2F352F]">
            {value}
          </p>
        </div>
        <div className={`rounded-xl p-2.5 ${accentColors[accent]}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
      </div>
      {subtitle && (
        <p className="mt-3 text-[11px] font-medium text-[#747A72]">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

function PaymentBreakdown({
  cash,
  upi,
  card,
  credit,
  advance,
}: {
  cash: number;
  upi: number;
  card: number;
  credit?: number;
  advance?: number;
}) {
  const advVal = advance || 0;
  const creditVal = credit || 0;
  const total = cash + upi + card + creditVal + advVal || 1;
  const items = [
    { label: "Cash", value: cash, color: "bg-[#5F7A62]" },
    { label: "UPI", value: upi, color: "bg-[#6F776D]" },
    { label: "Card", value: card, color: "bg-[#B18A45]" },
    ...(creditVal > 0 ? [{ label: "Credit", value: creditVal, color: "bg-[#B55B5B]" }] : []),
    ...(advVal > 0 ? [{ label: "Advance", value: advVal, color: "bg-[#2F352F]" }] : []),
  ];

  return (
    <div className="mt-4 space-y-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[#F7F7F4]">
        {items.map((item) => (
          <div
            key={item.label}
            className={`${item.color} transition-all duration-500`}
            style={{ width: `${(item.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className={`grid gap-2 ${items.length >= 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              {item.label}
            </p>
            <p className={`mt-0.5 text-xs font-bold ${item.label === "Credit" ? "text-[#B55B5B]" : "text-[#292D29]"}`}>
              {formatCurrency(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffAttendanceRow({
  member,
  attendance,
  todayServicesCount,
  onToggleAttendance,
  loading,
}: {
  member: Staff;
  attendance?: AttendanceRecord;
  todayServicesCount: number;
  onToggleAttendance: (member: Staff) => void;
  loading?: boolean;
}) {
  const norm = normalizeAttendanceStatus(attendance?.status);
  const isPresent = norm === "PRESENT";
  const isAbsent = norm === "ABSENT";

  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-4 transition-all duration-150 ${
        isPresent
          ? "border-[#CCD2C8] bg-[#F7F9F6] shadow-2xs"
          : isAbsent
          ? "border-[#F8D7D7] bg-[#FDF7F7] shadow-2xs"
          : "border-[#E0E4DD] bg-[#FFFFFF] hover:border-[#CCD2C8]"
      }`}
    >
      {/* 1. Full Staff Name & 2. Current Attendance Status */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#2F352F] truncate" title={member.name}>
          {member.name}
        </span>
        
        {/* Status Badge */}
        {isPresent ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CCD2C8] bg-[#E8ECE5] px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-[#2F352F] shrink-0">
            <span className="size-1.5 rounded-full bg-[#5F7A62]" />
            PRESENT
          </span>
        ) : isAbsent ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F8D7D7] bg-[#FBEBEB] px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-[#B55B5B] shrink-0">
            <span className="size-1.5 rounded-full bg-[#B55B5B]" />
            ABSENT
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E0E4DD] bg-[#F7F7F4] px-2 py-0.5 text-[9px] font-bold tracking-wider text-[#747A72] shrink-0">
            <span className="size-1.5 rounded-full bg-[#CCD2C8]" />
            NOT MARKED
          </span>
        )}
      </div>

      {/* 3. Today's Services count only */}
      <div className="my-2.5 rounded-xl border border-[#E0E4DD]/70 bg-[#F7F7F4] px-3 py-2">
        <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider block">
          Today&apos;s Services
        </span>
        <span className="text-lg font-extrabold tracking-tight text-[#2F352F] mt-0.5 block">
          {todayServicesCount}
        </span>
      </div>

      {/* 4. Single Attendance Toggle Button */}
      <div className="mt-auto pt-1">
        {isPresent ? (
          <button
            type="button"
            onClick={() => onToggleAttendance(member)}
            disabled={loading}
            className="w-full inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F] text-xs font-bold transition-all duration-150 hover:bg-[#5F7A62] hover:text-white hover:border-[#5F7A62] cursor-pointer shadow-2xs active:scale-[0.98] disabled:opacity-50"
            title="Click to mark Absent"
          >
            <span className="size-2 rounded-full bg-[#5F7A62]" />
            <span>Present</span>
          </button>
        ) : isAbsent ? (
          <button
            type="button"
            onClick={() => onToggleAttendance(member)}
            disabled={loading}
            className="w-full inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#FBEBEB] border border-[#F8D7D7] text-[#B55B5B] text-xs font-bold transition-all duration-150 hover:bg-[#B55B5B] hover:text-white hover:border-[#B55B5B] cursor-pointer shadow-2xs active:scale-[0.98] disabled:opacity-50"
            title="Click to mark Present"
          >
            <span className="size-2 rounded-full bg-[#B55B5B]" />
            <span>Absent</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onToggleAttendance(member)}
            disabled={loading}
            className="w-full inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] text-[#747A72] text-xs font-bold transition-all duration-150 hover:bg-[#E8ECE5] hover:text-[#2F352F] hover:border-[#6F776D] cursor-pointer shadow-2xs active:scale-[0.98] disabled:opacity-50"
            title="Click to mark Present"
          >
            <span className="size-2 rounded-full bg-[#CCD2C8]" />
            <span>Not Marked</span>
          </button>
        )}
      </div>
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
      class: "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]",
    },
    regular: {
      label: "Regular",
      class: "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]",
    },
    new: {
      label: "New",
      class: "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30",
    },
  };

  const config = typeConfig[customerType as keyof typeof typeConfig] || typeConfig.regular;

  return (
    <tr className="group transition-colors hover:bg-[#F7F7F4]">
      <td className="px-4 py-3.5">
        <span className="font-mono text-xs font-bold text-[#292D29]">
          #{invoice.invoiceNumber}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-[#292D29]">
            {invoice.customerName}
          </span>
          {invoice.customerPhone && invoice.customerPhone !== "0000000000" && (
            <span className="text-[10px] text-[#747A72]">{invoice.customerPhone}</span>
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
      <td className="px-4 py-3.5 text-sm text-[#747A72]">
        {staffListStr || <span className="italic text-[#747A72]">Unassigned</span>}
      </td>
      <td className="px-4 py-3.5 text-xs font-medium text-[#747A72]">{time}</td>
      <td className="px-4 py-3.5 text-right">
        <span className="text-sm font-bold text-[#292D29]">
          {formatCurrency(invoice.grandTotal)}
        </span>
      </td>
      <td className="px-4 py-3.5 text-right">
        <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Link
            href={`/invoices/${invoice.id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg border border-[#E0E4DD] bg-[#FFFFFF] px-2.5 text-xs font-semibold text-[#292D29] transition hover:border-[#6F776D] hover:bg-[#E8ECE5]"
          >
            View
          </Link>
          <Link
            href={`/billing?edit=${invoice.id}`}
            className="inline-flex h-7 items-center justify-center rounded-lg border border-[#CCD2C8] bg-[#E8ECE5] px-2.5 text-xs font-semibold text-[#2F352F] transition hover:bg-[#6F776D] hover:text-[#FFFFFF]"
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#292D29]/40 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xl animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}



// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { staff, refreshStaff, loadingAppData } = useAppData();
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
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const qInvoices = query(
      collection(db, "invoices"),
      where("date", ">=", Timestamp.fromDate(startOfToday)),
      where("date", "<=", Timestamp.fromDate(endOfToday))
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

  // Today's attendance records from Firestore
  const [todayAttendanceMap, setTodayAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [dashboardActionLoadingId, setDashboardActionLoadingId] = useState<string | null>(null);

  const todayStr = toLocalDateString(new Date());

  const loadDashboardAttendance = useCallback(async () => {
    try {
      const map = await attendanceService.getTodayAttendance(todayStr);
      setTodayAttendanceMap(map);
    } catch (err) {
      console.error("Failed to load dashboard attendance:", err);
    }
  }, [todayStr]);

  useEffect(() => {
    loadDashboardAttendance();
  }, [loadDashboardAttendance]);

  const getInvoiceDateKey = (inv: any): string => {
    if (inv.billDate) {
      return toLocalDateString(inv.billDate);
    }
    if (inv.date) {
      return toLocalDateString(inv.date);
    }
    return inv.dateKey || todayStr;
  };

  const todayInvoices = useMemo(() => {
    return invoices
      .filter((inv) => getInvoiceDateKey(inv) === todayStr)
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

  const staffServicesTodayMap = useMemo(() => {
    const map: Record<string, number> = {};
    staff.forEach((m) => {
      if (m.id) map[m.id] = 0;
    });
    todayInvoices.forEach((inv) => {
      (inv.services || []).forEach((s: any) => {
        if (s.serviceId === "membership_fee" || s.isSystemService === true) return;
        const staffId = s.staffId;
        const staffName = s.staffName || s.staff;
        const matched = staff.find(
          (m) => (staffId && m.id === staffId) || (staffName && m.name === staffName)
        );
        if (matched && matched.id) {
          map[matched.id] = (map[matched.id] || 0) + 1;
        }
      });
    });
    return map;
  }, [todayInvoices, staff]);

  const sortedDashboardStaff = useMemo(() => {
    return [...staff].sort((a, b) => {
      if (a.role === "Owner" && b.role !== "Owner") return -1;
      if (a.role !== "Owner" && b.role === "Owner") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [staff]);

  const todaySettlement = useMemo<TodaySettlement>(() => {
    let serviceSales = 0;
    let retailSales = 0;
    let membershipSales = 0;
    let totalSales = 0;
    let cash = 0;
    let upi = 0;
    let card = 0;
    let credit = 0;
    let serviceTxnCount = 0;
    let retailTxnCount = 0;
    let membershipTxnCount = 0;

    todayInvoices.forEach((inv) => {
      const breakdown = getInvoiceSalesBreakdown(inv);
      const payments = getInvoicePayments(inv);
      const advance = inv.advanceUsed || 0;
      const collected = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + advance;
      const uncollectedCredit = Math.max(0, (inv.grandTotal || breakdown.totalSales || 0) - collected);

      serviceSales += breakdown.serviceSales;
      retailSales += breakdown.retailSales;
      membershipSales += breakdown.membershipSales;
      totalSales += breakdown.totalSales;

      cash += payments.cash;
      upi += payments.upi;
      card += payments.card;
      credit += uncollectedCredit;

      (inv.services || []).forEach((s: any) => {
        if (s.serviceId === "membership_fee" || s.isSystemService) {
          membershipTxnCount += 1;
        } else {
          serviceTxnCount += 1;
        }
      });

      (inv.products || []).forEach(() => {
        retailTxnCount += 1;
      });
    });

    return {
      serviceSales,
      retailSales,
      membershipSales,
      totalSales,
      cash,
      upi,
      card,
      credit,
      billsCount: todayInvoices.length,
      serviceTxnCount,
      retailTxnCount,
      membershipTxnCount,
    };
  }, [todayInvoices]);

  const stats = useMemo(() => {
    let todayCollected = 0;
    let cashToday = 0;
    let upiToday = 0;
    let cardToday = 0;
    let creditToday = 0;
    let advanceToday = 0;
    const uniqueCustomerIds = new Set<string>();

    todayInvoices.forEach((inv) => {
      const breakdown = getInvoiceSalesBreakdown(inv);
      const payments = getInvoicePayments(inv);
      const advance = inv.advanceUsed || 0;
      const collected = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + advance;
      const uncollectedCredit = Math.max(0, (inv.grandTotal || breakdown.totalSales || 0) - collected);

      todayCollected += collected;
      cashToday += payments.cash;
      upiToday += payments.upi;
      cardToday += payments.card;
      creditToday += uncollectedCredit;
      advanceToday += advance;

      const identifier = inv.customerId || inv.customerPhone || inv.customerName || inv.id || Math.random().toString();
      uniqueCustomerIds.add(identifier);
    });

    return {
      todayRevenue: todayCollected,
      monthlyRevenue: monthlyStats?.totalRevenue ?? 0,
      todayVisits: uniqueCustomerIds.size,
      cashToday,
      upiToday,
      cardToday,
      creditToday,
      advanceToday,
      onDutyCount: staff.filter((s) => s.dutyStatus === "onDuty").length,
    };
  }, [todayInvoices, staff, monthlyStats]);

  const todayStylistPerformance = useMemo(() => {
    const stylistMap: Record<string, {
      stylistName: string;
      servicesDone: number;
      serviceRevenue: number;
    }> = {};

    staff.forEach((member) => {
      stylistMap[member.name] = {
        stylistName: member.name,
        servicesDone: 0,
        serviceRevenue: 0,
      };
    });

    todayInvoices.forEach((inv) => {
      (inv.services || []).forEach((s: any) => {
        if (s.serviceId === "membership_fee" || s.isSystemService === true) return;
        const name = s.staffName || s.staff;
        if (!name || name === "System" || name === "unassigned") return;

        const amount = s.amount !== undefined 
          ? Number(s.amount) || 0 
          : Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);

        if (!stylistMap[name]) {
          stylistMap[name] = {
            stylistName: name,
            servicesDone: 0,
            serviceRevenue: 0,
          };
        }

        stylistMap[name].servicesDone += 1;
        stylistMap[name].serviceRevenue += amount;
      });
    });

    return Object.values(stylistMap).filter(
      (st) => st.servicesDone > 0 || st.serviceRevenue > 0
    ).sort((a, b) => b.serviceRevenue - a.serviceRevenue);
  }, [todayInvoices, staff]);


  // ── Handlers ───────────────────────────────────────────────────────────

  const handleDashboardToggleAttendance = useCallback(
    async (member: Staff) => {
      if (!member.id) return;
      const currentNorm = normalizeAttendanceStatus(todayAttendanceMap[member.id]?.status);
      const newStatus: "present" | "absent" = currentNorm === "PRESENT" ? "absent" : "present";
      const previousRecord = todayAttendanceMap[member.id];

      // Optimistic update
      const optimisticRecord: AttendanceRecord = {
        id: previousRecord?.id || `temp-${member.id}`,
        employeeId: member.id,
        employeeName: member.name,
        date: todayStr,
        status: newStatus,
        createdAt: previousRecord?.createdAt ? String(previousRecord.createdAt) : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setTodayAttendanceMap((prev) => ({ ...prev, [member.id!]: optimisticRecord }));
      setDashboardActionLoadingId(member.id);

      try {
        const rec = await attendanceService.markAttendance(member.id, member.name, todayStr, newStatus);
        setTodayAttendanceMap((prev) => ({ ...prev, [member.id!]: rec }));
        await refreshStaff();
      } catch (err: any) {
        console.error("Dashboard toggle attendance failed:", err);
        // Revert optimistic update
        setTodayAttendanceMap((prev) => {
          const updated = { ...prev };
          if (previousRecord) {
            updated[member.id!] = previousRecord;
          } else {
            delete updated[member.id!];
          }
          return updated;
        });
        toast.error(`Failed to update attendance for ${member.name}`);
      } finally {
        setDashboardActionLoadingId(null);
      }
    },
    [todayAttendanceMap, todayStr, refreshStaff]
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
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
          <span className="text-xs font-medium text-[#747A72]">
            Loading dashboard...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8 text-[#292D29]">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E0E4DD] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-[#6F776D]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6F776D]">
              Overview
            </span>
          </div>
          <h1 className="text-[2rem] font-serif font-extrabold tracking-[-0.02em] text-[#2F352F]">
            Salon Dashboard
          </h1>
          <p className="mt-1 text-xs text-[#747A72]">
            {format(new Date(), "EEEE, dd MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3.5 py-2 shadow-2xs">
          <Store size={14} className="text-[#6F776D]" />
          <span className="text-xs font-bold text-[#292D29]">
            {staff.filter((s) => s.id && normalizeAttendanceStatus(todayAttendanceMap[s.id]?.status) === "PRESENT").length} Staff Present
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
              accent="olive"
            >
              <PaymentBreakdown
                cash={stats.cashToday}
                upi={stats.upiToday}
                card={stats.cardToday}
                credit={stats.creditToday}
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
              accent="amber"
            />
          </div>

          {/* Quick Actions */}
          <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight text-[#2F352F]">
                Quick Actions
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                Shortcuts
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                onClick={() => openModal("billing")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl bg-[#6F776D] p-4 text-[12px] font-bold tracking-wide uppercase text-[#FFFFFF] transition-all hover:bg-[#2F352F] shadow-xs active:scale-[0.98] cursor-pointer"
              >
                <Receipt size={22} strokeWidth={2} />
                <span>Open Billing</span>
              </button>

              <button
                onClick={() => openModal("settlements")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 text-[12px] font-semibold tracking-wide text-[#292D29] transition-all hover:border-[#6F776D] hover:bg-[#E8ECE5] active:scale-[0.98] cursor-pointer"
              >
                <BarChart2 size={22} strokeWidth={2} />
                <span>Settlements</span>
              </button>

              <button
                onClick={() => openModal("customer")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 text-[12px] font-semibold tracking-wide text-[#292D29] transition-all hover:border-[#6F776D] hover:bg-[#E8ECE5] active:scale-[0.98] cursor-pointer"
              >
                <UserPlus size={22} strokeWidth={2} />
                <span>Add Customer</span>
              </button>

              <button
                onClick={() => openModal("expense")}
                className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 text-[12px] font-semibold tracking-wide text-[#292D29] transition-all hover:border-[#6F776D] hover:bg-[#E8ECE5] active:scale-[0.98] cursor-pointer"
              >
                <PiggyBank size={22} strokeWidth={2} />
                <span>Add Expense</span>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link
                href="/staff"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] py-2.5 text-xs font-semibold text-[#292D29] transition hover:border-[#6F776D] hover:bg-[#E8ECE5]"
              >
                <UsersRound size={14} />
                Manage Staff
              </Link>
              <Link
                href="/invoices"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] py-2.5 text-xs font-semibold text-[#292D29] transition hover:border-[#6F776D] hover:bg-[#E8ECE5]"
              >
                <Receipt size={14} />
                All Invoices
              </Link>
            </div>
          </section>

          {/* Today's Appointments Section */}
          <TodayAppointmentsSection
            onOpenBilling={(appt) => {
              const params = new URLSearchParams();
              if (appt.customerId) params.set("customerId", appt.customerId);
              if (appt.customerName) params.set("customerName", appt.customerName);
              if (appt.customerPhone) params.set("customerPhone", appt.customerPhone);
              if (appt.serviceId) params.set("serviceId", appt.serviceId);
              if (appt.staffId) params.set("staffId", appt.staffId);
              if (appt.id) params.set("appointmentId", appt.id);
              router.push(`/billing?${params.toString()}`);
            }}
          />

          {/* Today's Invoices */}
          <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E0E4DD] px-6 py-4">
              <div>
                <h2 className="text-base font-bold tracking-tight text-[#2F352F]">
                  Today's Invoices
                </h2>
                <p className="mt-0.5 text-xs text-[#747A72]">
                  {todayInvoices.length} transactions recorded
                </p>
              </div>
              <div className="rounded-lg bg-[#E8ECE5] px-3 py-1 text-xs font-bold text-[#2F352F] border border-[#CCD2C8]">
                {todayStr}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="border-b border-[#E0E4DD] bg-[#F7F7F4]">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                      Invoice
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                      Type
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                      Staff
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                      Time
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E4DD]">
                  {todayInvoices.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-sm text-[#747A72]"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Receipt size={30} className="text-[#CCD2C8]" />
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

        {/* Right Column — Staff Attendance */}
        <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold tracking-tight text-[#2F352F]">
                Staff Attendance
              </h2>
              <p className="mt-0.5 text-xs text-[#747A72]">
                Today&apos;s staff availability
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg bg-[#E8ECE5] px-2.5 py-1 border border-[#CCD2C8]">
                <div className="size-1.5 rounded-full bg-[#5F7A62]" />
                <span className="text-[10px] font-bold text-[#2F352F]">
                  Present Today: {staff.filter((s) => s.id && normalizeAttendanceStatus(todayAttendanceMap[s.id]?.status) === "PRESENT").length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-[#FBEBEB] px-2.5 py-1 border border-[#F8D7D7]">
                <div className="size-1.5 rounded-full bg-[#B55B5B]" />
                <span className="text-[10px] font-bold text-[#B55B5B]">
                  Absent Today: {staff.filter((s) => s.id && normalizeAttendanceStatus(todayAttendanceMap[s.id]?.status) === "ABSENT").length}
                </span>
              </div>
            </div>
          </div>

          {staff.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users size={32} className="text-[#CCD2C8]" />
              <p className="text-sm text-[#747A72] italic">
                No staff added yet
              </p>
              <Link
                href="/staff"
                className="text-xs font-bold text-[#6F776D] hover:underline"
              >
                Register staff members
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortedDashboardStaff.map((member) => (
                <StaffAttendanceRow
                  key={member.id}
                  member={member}
                  attendance={member.id ? todayAttendanceMap[member.id] : undefined}
                  todayServicesCount={member.id ? (staffServicesTodayMap[member.id] || 0) : 0}
                  onToggleAttendance={handleDashboardToggleAttendance}
                  loading={dashboardActionLoadingId === member.id}
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
          <div className="flex items-center justify-between pb-5 border-b border-[#E0E4DD]">
            <div>
              <h3 className="text-xl font-bold text-[#2F352F]">
                Today's Settlements
              </h3>
              <p className="mt-1 text-xs font-medium text-[#747A72]">
                Detailed revenue splits for {format(new Date(), "dd MMM yyyy")}
              </p>
            </div>
            <button
              onClick={() => closeModal("settlements")}
              className="grid size-9 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] transition hover:border-[#6F776D] hover:text-[#2F352F] cursor-pointer"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          {/* Settlements Content */}
          <div className="mt-6 space-y-6">
            {todayInvoices.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 border border-dashed border-[#E0E4DD] rounded-2xl bg-[#F7F7F4]">
                <BarChart2 size={36} className="text-[#CCD2C8]" />
                <p className="text-sm font-semibold text-[#747A72]">
                  No sales or settlements recorded today
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Sales Summary Grid */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3">
                    Sales Summary
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
                      <span className="text-[10px] text-[#747A72] block">Service Sales</span>
                      <span className="text-base font-bold text-[#2F352F]">
                        {formatCurrency(todaySettlement.serviceSales)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
                      <span className="text-[10px] text-[#747A72] block">Retail Product Sales</span>
                      <span className="text-base font-bold text-[#2F352F]">
                        {formatCurrency(todaySettlement.retailSales)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
                      <span className="text-[10px] text-[#747A72] block">Membership Sales</span>
                      <span className="text-base font-bold text-[#2F352F]">
                        {formatCurrency(todaySettlement.membershipSales)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] p-3.5">
                      <span className="text-[10px] font-bold text-[#2F352F] block">Total Sales</span>
                      <span className="text-base font-bold text-[#2F352F]">
                        {formatCurrency(todaySettlement.totalSales)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment Collections Grid */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3">
                    Payment Collection Breakdown
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3.5 shadow-xs">
                      <span className="text-[10px] text-[#747A72] block">Cash</span>
                      <span className="text-base font-bold text-[#2F352F]">
                        {formatCurrency(todaySettlement.cash)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3.5 shadow-xs">
                      <span className="text-[10px] text-[#747A72] block">UPI</span>
                      <span className="text-base font-bold text-[#2F352F]">
                        {formatCurrency(todaySettlement.upi)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3.5 shadow-xs">
                      <span className="text-[10px] text-[#747A72] block">Card</span>
                      <span className="text-base font-bold text-[#2F352F]">
                        {formatCurrency(todaySettlement.card)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3.5 shadow-xs">
                      <span className="text-[10px] text-[#B55B5B] block">Credit (Pending)</span>
                      <span className="text-base font-bold text-[#B55B5B]">
                        {formatCurrency(todaySettlement.credit)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expenses & Net */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-[#FBEBEB] bg-[#FBEBEB] p-4 text-[#B55B5B]">
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">
                      Today's Operational Expenses
                    </span>
                    <span className="text-xl font-serif font-bold">
                      {formatCurrency(todayExpensesTotal)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[#6F776D] bg-[#2F352F] p-4 text-white">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#CCD2C8] block mb-1">
                      Today's Net (Total Sales - Expenses)
                    </span>
                    <span className="text-xl font-serif font-bold text-white">
                      {formatCurrency(todaySettlement.totalSales - todayExpensesTotal)}
                    </span>
                  </div>
                </div>

                {/* Volume Summary */}
                <div className="border-t border-[#E0E4DD] pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3">
                    Transaction Volume
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                      <span className="text-[#747A72] block text-[10px]">Total Invoices</span>
                      <span className="font-bold text-[#2F352F]">{todaySettlement.billsCount}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                      <span className="text-[#747A72] block text-[10px]">Service Items</span>
                      <span className="font-bold text-[#2F352F]">{todaySettlement.serviceTxnCount}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                      <span className="text-[#747A72] block text-[10px]">Retail Products Sold</span>
                      <span className="font-bold text-[#2F352F]">{todaySettlement.retailTxnCount}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                      <span className="text-[#747A72] block text-[10px]">Memberships Sold</span>
                      <span className="font-bold text-[#2F352F]">{todaySettlement.membershipTxnCount}</span>
                    </div>
                  </div>
                </div>

                {/* Stylist Performance */}
                <div className="border-t border-[#E0E4DD] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#747A72]">
                      Stylist Performance
                    </h4>
                    <span className="text-[10px] text-[#747A72] font-semibold">
                      {todayStylistPerformance.length} specialist{todayStylistPerformance.length === 1 ? "" : "s"} active
                    </span>
                  </div>

                  {todayStylistPerformance.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E0E4DD] bg-[#F7F7F4] p-4 text-center text-xs text-[#747A72] italic">
                      No stylist activity recorded today.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs max-h-56 overflow-y-auto">
                      <table className="w-full min-w-[400px] border-collapse text-left text-xs">
                        <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD] sticky top-0 z-10">
                          <tr>
                            <th className="px-3.5 py-2.5 font-bold">Stylist Name</th>
                            <th className="px-3.5 py-2.5 font-bold text-center">Services Done</th>
                            <th className="px-3.5 py-2.5 font-bold text-right">Service Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E0E4DD]">
                          {todayStylistPerformance.map((st) => (
                            <tr key={st.stylistName} className="hover:bg-[#F7F7F4]/60 transition">
                              <td className="px-3.5 py-2.5 font-semibold text-[#2F352F]">
                                {st.stylistName}
                              </td>
                              <td className="px-3.5 py-2.5 text-center font-bold text-[#292D29]">
                                {st.servicesDone}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-bold text-[#5F7A62]">
                                {formatCurrency(st.serviceRevenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalOverlay>

    </div>
  );
}