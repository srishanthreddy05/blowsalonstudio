"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import * as invoicesService from "@/services/invoices";
import * as expensesService from "@/services/expenses";
import { getInvoicePayments, getInvoiceSalesBreakdown, getStylistAttendanceForDate } from "@/lib/utils/settlements";
import { useAppData } from "@/context/AppDataContext";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { toLocalDateString } from "@/lib/utils/date";
import {
  Calendar,
  ChevronDown,
  ShieldCheck,
  TrendingUp,
  Receipt,
  Wallet,
  Clock,
  Sparkles,
  BarChart3,
  Scissors,
  Package,
  PiggyBank,
  CheckCircle2,
  X,
  CreditCard,
  Building,
} from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── Types ──────────────────────────────────────────────────────────────────
interface DateSettlementSummary {
  dateKey: string;
  displayDate: string;
  serviceSales: number;
  retailSales: number;
  membershipSales: number;
  totalSales: number;
  expenses: number;
  net: number;
  cash: number;
  upi: number;
  card: number;
  credit: number;
  advanceUsed: number;
  status: "Settled" | "Pending";
  billsCount: number;
  serviceTxnCount: number;
  retailTxnCount: number;
  membershipTxnCount: number;
  settledAt?: any;
}

export default function SettlementsPage() {
  const { staff } = useAppData();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [settlementDocMap, setSettlementDocMap] = useState<Record<string, any>>({});
  const [selectedDayDetails, setSelectedDayDetails] = useState<DateSettlementSummary | null>(null);
  const [settlingDate, setSettlingDate] = useState<string | null>(null);

  const todayStr = useMemo(() => toLocalDateString(new Date()), []);

  // Fetch all invoices and expenses for the selected month
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [yyyyStr, mmStr] = selectedMonth.split("-");
      const year = parseInt(yyyyStr, 10);
      const monthIndex = parseInt(mmStr, 10) - 1;

      const startDate = startOfMonth(new Date(year, monthIndex, 1));
      const endDate = endOfMonth(new Date(year, monthIndex, 1));
      endDate.setHours(23, 59, 59, 999);

      // 1. Fetch Invoices for Month
      const invRef = collection(db, "invoices");
      const invQuery = query(
        invRef,
        where("date", ">=", startDate),
        where("date", "<=", endDate)
      );
      const invSnap = await getDocs(invQuery);
      const invList: any[] = [];
      invSnap.forEach((d) => {
        invList.push({ id: d.id, ...d.data() });
      });
      setInvoices(invList);

      // 2. Fetch Expenses for Month
      const allExpenses = await expensesService.getByDateRange(
        startDate,
        endDate
      );
      setExpenses(allExpenses);

      // 3. Fetch Settlements status documents for the month
      const settRef = collection(db, "settlements");
      const settQuery = query(
        settRef,
        where("monthKey", "==", selectedMonth)
      );
      const settSnap = await getDocs(settQuery);
      const settMap: Record<string, any> = {};
      settSnap.forEach((d) => {
        settMap[d.id] = d.data();
      });
      setSettlementDocMap(settMap);

    } catch (err) {
      console.error("Failed to load settlements data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate by Date
  const dailySettlements = useMemo(() => {
    const map: Record<string, DateSettlementSummary> = {};

    // Group invoices by dateKey
    invoices.forEach((inv) => {
      let dateKey = "";
      if (inv.billDate) {
        dateKey = toLocalDateString(inv.billDate);
      } else if (inv.date) {
        dateKey = toLocalDateString(inv.date);
      } else {
        dateKey = inv.dateKey || todayStr;
      }

      if (!map[dateKey]) {
        map[dateKey] = {
          dateKey,
          displayDate: dateKey,
          serviceSales: 0,
          retailSales: 0,
          membershipSales: 0,
          totalSales: 0,
          expenses: 0,
          net: 0,
          cash: 0,
          upi: 0,
          card: 0,
          credit: 0,
          advanceUsed: 0,
          status: settlementDocMap[dateKey]?.status === "Settled" ? "Settled" : "Pending",
          billsCount: 0,
          serviceTxnCount: 0,
          retailTxnCount: 0,
          membershipTxnCount: 0,
          settledAt: settlementDocMap[dateKey]?.settledAt,
        };
      }

      const breakdown = getInvoiceSalesBreakdown(inv);
      const payments = getInvoicePayments(inv);
      const advance = inv.advanceUsed || 0;
      const collected = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + advance;
      const uncollectedCredit = Math.max(0, (inv.grandTotal || breakdown.totalSales || 0) - collected);

      map[dateKey].serviceSales += breakdown.serviceSales;
      map[dateKey].retailSales += breakdown.retailSales;
      map[dateKey].membershipSales += breakdown.membershipSales;
      map[dateKey].totalSales += breakdown.totalSales;
      map[dateKey].cash += payments.cash;
      map[dateKey].upi += payments.upi;
      map[dateKey].card += payments.card;
      map[dateKey].credit += uncollectedCredit;
      map[dateKey].advanceUsed += advance;
      map[dateKey].billsCount += 1;

      (inv.services || []).forEach((s: any) => {
        if (s.serviceId === "membership_fee" || s.isSystemService) {
          map[dateKey].membershipTxnCount += 1;
        } else {
          map[dateKey].serviceTxnCount += 1;
        }
      });

      (inv.products || []).forEach(() => {
        map[dateKey].retailTxnCount += 1;
      });
    });

    // Add expenses to each date
    expenses.forEach((exp) => {
      const expDateKey = exp.date;
      if (!map[expDateKey]) {
        map[expDateKey] = {
          dateKey: expDateKey,
          displayDate: expDateKey,
          serviceSales: 0,
          retailSales: 0,
          membershipSales: 0,
          totalSales: 0,
          expenses: 0,
          net: 0,
          cash: 0,
          upi: 0,
          card: 0,
          credit: 0,
          advanceUsed: 0,
          status: settlementDocMap[expDateKey]?.status === "Settled" ? "Settled" : "Pending",
          billsCount: 0,
          serviceTxnCount: 0,
          retailTxnCount: 0,
          membershipTxnCount: 0,
          settledAt: settlementDocMap[expDateKey]?.settledAt,
        };
      }
      map[expDateKey].expenses += (exp.amount || 0);
    });

    // Calculate Net for each date and sort descending by date
    const list = Object.values(map).map((item) => {
      item.net = item.totalSales - item.expenses;
      try {
        const parsed = new Date(item.dateKey + "T00:00:00");
        item.displayDate = format(parsed, "dd MMM yyyy");
      } catch (e) {
        item.displayDate = item.dateKey;
      }
      return item;
    });

    list.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return list;
  }, [invoices, expenses, settlementDocMap, todayStr]);

  // Monthly Grand Totals
  const monthlyTotals = useMemo(() => {
    let serviceSales = 0;
    let retailSales = 0;
    let membershipSales = 0;
    let totalSales = 0;
    let expensesTotal = 0;
    let cash = 0;
    let upi = 0;
    let card = 0;

    dailySettlements.forEach((day) => {
      serviceSales += day.serviceSales;
      retailSales += day.retailSales;
      membershipSales += day.membershipSales;
      totalSales += day.totalSales;
      expensesTotal += day.expenses;
      cash += day.cash;
      upi += day.upi;
      card += day.card;
    });

    const net = totalSales - expensesTotal;
    return {
      serviceSales,
      retailSales,
      membershipSales,
      totalSales,
      expensesTotal,
      net,
      cash,
      upi,
      card,
    };
  }, [dailySettlements]);

  // Stylist Performance breakdown for selected day
  const selectedDayStylistPerformance = useMemo(() => {
    if (!selectedDayDetails) return [];
    const dateKey = selectedDayDetails.dateKey;
    const isToday = dateKey === todayStr;

    const stylistMap: Record<string, {
      stylistName: string;
      servicesDone: number;
      serviceRevenue: number;
      inTime: string;
      outTime: string;
    }> = {};

    staff.forEach((member) => {
      const att = getStylistAttendanceForDate(member, dateKey, isToday);
      stylistMap[member.name] = {
        stylistName: member.name,
        servicesDone: 0,
        serviceRevenue: 0,
        inTime: att.inTime,
        outTime: att.outTime,
      };
    });

    const dayInvoices = invoices.filter((inv) => {
      let invDateKey = "";
      if (inv.billDate) {
        invDateKey = toLocalDateString(inv.billDate);
      } else if (inv.date) {
        invDateKey = toLocalDateString(inv.date);
      } else {
        invDateKey = inv.dateKey || todayStr;
      }
      return invDateKey === dateKey;
    });

    dayInvoices.forEach((inv) => {
      (inv.services || []).forEach((s: any) => {
        if (s.serviceId === "membership_fee" || s.isSystemService === true) return;
        const name = s.staffName || s.staff;
        if (!name || name === "System" || name === "unassigned") return;

        const amount = s.amount !== undefined 
          ? Number(s.amount) || 0 
          : Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);

        if (!stylistMap[name]) {
          const matchedStaff = staff.find((m) => m.name === name || m.id === s.staffId);
          const att = getStylistAttendanceForDate(matchedStaff, dateKey, isToday);
          stylistMap[name] = {
            stylistName: name,
            servicesDone: 0,
            serviceRevenue: 0,
            inTime: att.inTime,
            outTime: att.outTime,
          };
        }

        stylistMap[name].servicesDone += 1;
        stylistMap[name].serviceRevenue += amount;
      });
    });

    return Object.values(stylistMap)
      .filter((st) => st.servicesDone > 0 || st.inTime !== "—" || st.outTime !== "—")
      .sort((a, b) => b.serviceRevenue - a.serviceRevenue);
  }, [selectedDayDetails, invoices, staff, todayStr]);

  // Handle Mark Settled / Settle Day
  const handleToggleSettle = async (day: DateSettlementSummary) => {
    try {
      setSettlingDate(day.dateKey);
      const newStatus = day.status === "Settled" ? "Pending" : "Settled";
      const settDocRef = doc(db, "settlements", day.dateKey);
      
      await setDoc(settDocRef, {
        dateKey: day.dateKey,
        monthKey: day.dateKey.slice(0, 7),
        status: newStatus,
        totalSales: day.totalSales,
        serviceSales: day.serviceSales,
        retailSales: day.retailSales,
        membershipSales: day.membershipSales,
        expenses: day.expenses,
        net: day.net,
        settledAt: newStatus === "Settled" ? serverTimestamp() : null,
      }, { merge: true });

      setSettlementDocMap((prev) => ({
        ...prev,
        [day.dateKey]: {
          ...prev[day.dateKey],
          status: newStatus,
        }
      }));

      if (selectedDayDetails && selectedDayDetails.dateKey === day.dateKey) {
        setSelectedDayDetails({
          ...selectedDayDetails,
          status: newStatus,
        });
      }
    } catch (err) {
      console.error("Failed to toggle settlement status:", err);
    } finally {
      setSettlingDate(null);
    }
  };

  return (
    <div className="w-full text-[#292D29] space-y-8">
      {/* Header & Month Filter */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Daily Financial Closing
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Settlements
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] px-3.5 py-2 shadow-xs">
            <Calendar size={15} className="text-[#6F776D]" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-[#2F352F] outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-2xl border border-[#CCD2C8] bg-[#E8ECE5] p-4 text-[#2F352F] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block mb-1">
            Total Sales
          </span>
          <span className="text-lg font-serif font-bold text-[#2F352F]">
            {formatCurrency(monthlyTotals.totalSales)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 text-[#292D29] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block mb-1">
            Service Sales
          </span>
          <span className="text-lg font-serif font-bold text-[#2F352F]">
            {formatCurrency(monthlyTotals.serviceSales)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 text-[#292D29] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block mb-1">
            Retail Sales
          </span>
          <span className="text-lg font-serif font-bold text-[#2F352F]">
            {formatCurrency(monthlyTotals.retailSales)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 text-[#292D29] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block mb-1">
            Membership Sales
          </span>
          <span className="text-lg font-serif font-bold text-[#2F352F]">
            {formatCurrency(monthlyTotals.membershipSales)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 text-[#292D29] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#B55B5B] block mb-1">
            Total Expenses
          </span>
          <span className="text-lg font-serif font-bold text-[#B55B5B]">
            {formatCurrency(monthlyTotals.expensesTotal)}
          </span>
        </div>

        <div className="rounded-2xl border border-[#6F776D] bg-[#2F352F] p-4 text-white shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#CCD2C8] block mb-1">
            Net Revenue
          </span>
          <span className="text-lg font-serif font-bold text-white">
            {formatCurrency(monthlyTotals.net)}
          </span>
        </div>
      </div>

      {/* Date-wise Settlements Table */}
      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
          <table className="w-full min-w-[980px] border-collapse text-left text-xs text-[#292D29]">
            <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
              <tr>
                <th className="px-5 py-3.5 font-bold">Date</th>
                <th className="px-5 py-3.5 font-bold">Service Sales</th>
                <th className="px-5 py-3.5 font-bold">Retail Sales</th>
                <th className="px-5 py-3.5 font-bold">Membership Sales</th>
                <th className="px-5 py-3.5 font-bold">Total Sales</th>
                <th className="px-5 py-3.5 font-bold text-[#B55B5B]">Expenses</th>
                <th className="px-5 py-3.5 font-bold">Net</th>
                <th className="px-5 py-3.5 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E4DD]">
              {dailySettlements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-[#747A72] italic bg-transparent">
                    No transactions recorded for {selectedMonth}.
                  </td>
                </tr>
              ) : (
                dailySettlements.map((day) => (
                  <tr key={day.dateKey} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                    <td className="px-5 py-3.5 font-bold text-[#2F352F]">
                      {day.displayDate}
                    </td>
                    <td className="px-5 py-3.5 text-[#747A72] font-semibold">
                      {formatCurrency(day.serviceSales)}
                    </td>
                    <td className="px-5 py-3.5 text-[#747A72] font-semibold">
                      {formatCurrency(day.retailSales)}
                    </td>
                    <td className="px-5 py-3.5 text-[#747A72] font-semibold">
                      {formatCurrency(day.membershipSales)}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#2F352F]">
                      {formatCurrency(day.totalSales)}
                    </td>
                    <td className="px-5 py-3.5 text-[#B55B5B] font-semibold">
                      {day.expenses > 0 ? `-${formatCurrency(day.expenses)}` : "₹0"}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#5F7A62]">
                      {formatCurrency(day.net)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedDayDetails(day)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#CCD2C8] bg-[#E8ECE5] px-3 text-[11px] font-bold text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Day Settlement Details Modal */}
      {selectedDayDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs"
            onClick={() => setSelectedDayDetails(null)}
          />
          <div className="relative w-full max-w-2xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] overflow-y-auto max-h-[90vh] z-10 animate-in zoom-in-95 duration-200 space-y-6">
            <div className="flex items-start justify-between border-b border-[#E0E4DD] pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
                  Daily Settlement Overview
                </p>
                <h2 className="font-serif text-xl font-bold text-[#2F352F] mt-0.5">
                  Settlement — {selectedDayDetails.displayDate}
                </h2>
              </div>
              <button
                onClick={() => setSelectedDayDetails(null)}
                className="text-[#747A72] hover:text-[#2F352F] transition cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sales Summary */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3">
                Sales Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
                  <span className="text-[10px] text-[#747A72] block">Service Sales</span>
                  <span className="text-sm font-bold text-[#2F352F]">
                    {formatCurrency(selectedDayDetails.serviceSales)}
                  </span>
                </div>
                <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
                  <span className="text-[10px] text-[#747A72] block">Retail Product Sales</span>
                  <span className="text-sm font-bold text-[#2F352F]">
                    {formatCurrency(selectedDayDetails.retailSales)}
                  </span>
                </div>
                <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
                  <span className="text-[10px] text-[#747A72] block">Membership Sales</span>
                  <span className="text-sm font-bold text-[#2F352F]">
                    {formatCurrency(selectedDayDetails.membershipSales)}
                  </span>
                </div>
                <div className="rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] p-3">
                  <span className="text-[10px] font-bold text-[#2F352F] block">Total Sales</span>
                  <span className="text-sm font-bold text-[#2F352F]">
                    {formatCurrency(selectedDayDetails.totalSales)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Collection Breakdown */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3">
                Payment Collection Methods
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3">
                  <span className="text-[10px] text-[#747A72] block">Cash</span>
                  <span className="text-sm font-bold text-[#2F352F]">
                    {formatCurrency(selectedDayDetails.cash)}
                  </span>
                </div>
                <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3">
                  <span className="text-[10px] text-[#747A72] block">UPI</span>
                  <span className="text-sm font-bold text-[#2F352F]">
                    {formatCurrency(selectedDayDetails.upi)}
                  </span>
                </div>
                <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3">
                  <span className="text-[10px] text-[#747A72] block">Card</span>
                  <span className="text-sm font-bold text-[#2F352F]">
                    {formatCurrency(selectedDayDetails.card)}
                  </span>
                </div>
                <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3">
                  <span className="text-[10px] text-[#B55B5B] block">Credit (Pending)</span>
                  <span className="text-sm font-bold text-[#B55B5B]">
                    {formatCurrency(selectedDayDetails.credit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Expenses & Net */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-2xl border border-[#FBEBEB] bg-[#FBEBEB] p-4 text-[#B55B5B]">
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">
                  Total Operational Expenses
                </span>
                <span className="text-lg font-serif font-bold">
                  {formatCurrency(selectedDayDetails.expenses)}
                </span>
              </div>
              <div className="rounded-2xl border border-[#6F776D] bg-[#2F352F] p-4 text-white">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#CCD2C8] block mb-1">
                  Net (Total Sales - Expenses)
                </span>
                <span className="text-lg font-serif font-bold text-white">
                  {formatCurrency(selectedDayDetails.net)}
                </span>
              </div>
            </div>

            {/* Volume Metrics */}
            <div className="border-t border-[#E0E4DD] pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3">
                Transaction Volume
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                  <span className="text-[#747A72] block text-[10px]">Number of Bills</span>
                  <span className="font-bold text-[#2F352F]">{selectedDayDetails.billsCount}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                  <span className="text-[#747A72] block text-[10px]">Service Items</span>
                  <span className="font-bold text-[#2F352F]">{selectedDayDetails.serviceTxnCount}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                  <span className="text-[#747A72] block text-[10px]">Retail Product Items</span>
                  <span className="font-bold text-[#2F352F]">{selectedDayDetails.retailTxnCount}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD]">
                  <span className="text-[#747A72] block text-[10px]">Memberships Sold</span>
                  <span className="font-bold text-[#2F352F]">{selectedDayDetails.membershipTxnCount}</span>
                </div>
              </div>
            </div>

            {/* Stylist Performance */}
            <div className="border-t border-[#E0E4DD] pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72]">
                  Stylist Performance
                </h3>
                <span className="text-[10px] text-[#747A72] font-semibold">
                  {selectedDayStylistPerformance.length} specialist{selectedDayStylistPerformance.length === 1 ? "" : "s"} active
                </span>
              </div>

              {selectedDayStylistPerformance.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E0E4DD] bg-[#F7F7F4] p-4 text-center text-xs text-[#747A72] italic">
                  No stylist activity recorded on this date.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs max-h-56 overflow-y-auto">
                  <table className="w-full min-w-[480px] border-collapse text-left text-xs">
                    <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD] sticky top-0 z-10">
                      <tr>
                        <th className="px-3.5 py-2.5 font-bold">Stylist Name</th>
                        <th className="px-3.5 py-2.5 font-bold text-center">Services Done</th>
                        <th className="px-3.5 py-2.5 font-bold">Service Revenue</th>
                        <th className="px-3.5 py-2.5 font-bold">In Time</th>
                        <th className="px-3.5 py-2.5 font-bold">Out Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0E4DD]">
                      {selectedDayStylistPerformance.map((st) => (
                        <tr key={st.stylistName} className="hover:bg-[#F7F7F4]/60 transition">
                          <td className="px-3.5 py-2.5 font-semibold text-[#2F352F]">
                            {st.stylistName}
                          </td>
                          <td className="px-3.5 py-2.5 text-center font-bold text-[#292D29]">
                            {st.servicesDone}
                          </td>
                          <td className="px-3.5 py-2.5 font-bold text-[#5F7A62]">
                            {formatCurrency(st.serviceRevenue)}
                          </td>
                          <td className="px-3.5 py-2.5 text-[#747A72] font-medium">
                            {st.inTime}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span
                              className={
                                st.outTime === "Still Working"
                                  ? "inline-block rounded-full bg-[#E8ECE5] px-2 py-0.5 text-[9px] font-bold text-[#2F352F] border border-[#CCD2C8]"
                                  : "text-[#747A72] font-medium"
                              }
                            >
                              {st.outTime}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-[#E0E4DD] pt-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#747A72]">Current Status:</span>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                    selectedDayDetails.status === "Settled"
                      ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                      : "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30"
                  }`}
                >
                  {selectedDayDetails.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDayDetails(null)}
                  className="rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] px-5 py-2 text-xs font-bold text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}