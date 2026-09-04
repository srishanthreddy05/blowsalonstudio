"use client";

import { useEffect, useMemo, useState } from "react";
import * as invoicesService from "@/services/invoices";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { Search, Eye, Calendar, Edit2 } from "lucide-react";
import Link from "next/link";
import { toLocalDateString } from "@/lib/utils/date";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp,
} from "firebase/firestore";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);

  // Date range filters
  const now = new Date();
  const firstDayStr = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const todayStr = toLocalDateString(now);

  const [dateFrom, setDateFrom] = useState(firstDayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  const loadInvoices = async (isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      let q = query(
        collection(db, "invoices"),
        where("date", ">=", Timestamp.fromDate(start)),
        where("date", "<=", Timestamp.fromDate(end)),
        orderBy("date", "desc"),
        limit(10)
      );

      if (isLoadMore && lastDoc) {
        q = query(
          collection(db, "invoices"),
          where("date", ">=", Timestamp.fromDate(start)),
          where("date", "<=", Timestamp.fromDate(end)),
          orderBy("date", "desc"),
          startAfter(lastDoc),
          limit(10)
        );
      }

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      let nextList = [];
      if (isLoadMore) {
        nextList = [...invoices, ...docs];
      } else {
        nextList = docs;
      }

      nextList.sort((a: any, b: any) => {
        const dateA = a.invoiceDate || a.date;
        const dateB = b.invoiceDate || b.date;
        const timeA = dateA && typeof dateA.toMillis === "function" ? dateA.toMillis() : 0;
        const timeB = dateB && typeof dateB.toMillis === "function" ? dateB.toMillis() : 0;
        if (timeB !== timeA) return timeB - timeA;

        const createdA = a.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : 0;
        const createdB = b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : 0;
        return createdB - createdA;
      });

      setInvoices(nextList);

      if (snap.docs.length > 0) {
        setLastDoc(snap.docs[snap.docs.length - 1]);
      } else if (!isLoadMore) {
        setLastDoc(null);
      }
      setHasMore(snap.docs.length === 10);

    } catch (error) {
      console.error("Failed to load invoices:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadInvoices(false);
  }, [dateFrom, dateTo]);

  // Filter & Search Logic (scoping done at Firestore level, filter only search query here)
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;

      const name = (inv.customerName || "").toLowerCase();
      const mobile = (inv.customerPhone || inv.customerMobile || "");
      const invNo = (inv.invoiceNo || inv.invoiceNumber || "").toLowerCase();

      return name.includes(query) || mobile.includes(query) || invNo.includes(query);
    });
  }, [invoices, searchQuery]);

  return (
    <div className="w-full text-[#292D29]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Billing Records
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Invoice History
          </h1>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="mb-5 flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex flex-1 min-w-[280px] max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
          <Search size={16} className="text-[#747A72] mr-2" />
          <input
            type="text"
            placeholder="Search by client name, phone, or invoice no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
          />
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2 flex-wrap bg-[#FFFFFF] p-1.5 rounded-xl border border-[#E0E4DD] shadow-xs">
          <Calendar size={15} className="text-[#747A72] ml-2" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-lg border border-[#E0E4DD] bg-[#F7F7F4] px-2.5 text-xs font-medium text-[#292D29] shadow-xs outline-none focus:border-[#6F776D] transition"
          />
          <span className="text-xs text-[#747A72] font-semibold px-0.5">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-lg border border-[#E0E4DD] bg-[#F7F7F4] px-2.5 text-xs font-medium text-[#292D29] shadow-xs outline-none focus:border-[#6F776D] transition"
          />
        </div>
      </div>

      {loading && invoices.length === 0 ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">No Invoices Found</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            There are no invoices matching your search parameters in the selected date range.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
            <table className="w-full min-w-[1000px] border-collapse text-left text-xs text-[#292D29]">
              <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Invoice Number</th>
                  <th className="px-5 py-3.5 font-bold">Customer Name</th>
                  <th className="px-5 py-3.5 font-bold">Mobile Number</th>
                  <th className="px-5 py-3.5 font-bold">Date</th>
                  <th className="px-5 py-3.5 font-bold">Cash</th>
                  <th className="px-5 py-3.5 font-bold">UPI</th>
                  <th className="px-5 py-3.5 font-bold">Card</th>
                  <th className="px-5 py-3.5 font-bold">Total</th>
                  <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD]">
                {filteredInvoices.map((inv) => {
                  const cash = inv.paymentSplit?.cash ?? inv.payments?.cash ?? (inv.paymentMethod === "Cash" ? (inv.grandTotal || 0) : 0);
                  const upi = inv.paymentSplit?.upi ?? inv.payments?.upi ?? (inv.paymentMethod === "UPI" ? (inv.grandTotal || 0) : 0);
                  const card = inv.paymentSplit?.card ?? inv.payments?.card ?? (inv.paymentMethod === "Card" ? (inv.grandTotal || 0) : 0);

                  const dateObj =
                    inv.date && typeof inv.date.toDate === "function"
                      ? inv.date.toDate()
                      : inv.date
                        ? new Date(inv.date)
                        : null;
                  const dateLabel = dateObj ? dateObj.toLocaleDateString("en-IN") : "—";

                  return (
                    <tr key={inv.id} className="hover:bg-[#F7F7F4]/70 transition bg-transparent">
                      <td className="px-5 py-3.5 font-bold text-[#2F352F]">
                        {inv.invoiceNo || inv.invoiceNumber}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-[#2F352F]">
                        {inv.customerName}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#747A72]">
                        {inv.customerPhone || inv.customerMobile}
                      </td>
                      <td className="px-5 py-3.5 text-[#747A72]">
                        {dateLabel}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#747A72]">
                        {formatCurrency(cash)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#747A72]">
                        {formatCurrency(upi)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#747A72]">
                        {formatCurrency(card)}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-[#2F352F]">
                        {formatCurrency(inv.grandTotal || 0)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#E0E4DD] bg-[#FFFFFF] px-3 text-xs font-semibold text-[#747A72] hover:text-[#2F352F] hover:border-[#6F776D] hover:bg-[#E8ECE5] transition shadow-xs"
                          >
                            <Eye size={13} />
                            View
                          </Link>
                          <Link
                            href={`/billing?edit=${inv.id}`}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#CCD2C8] bg-[#E8ECE5] px-3 text-xs font-semibold text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition shadow-xs"
                          >
                            <Edit2 size={13} />
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                disabled={loadingMore}
                onClick={() => loadInvoices(true)}
                className="w-full sm:w-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] hover:border-[#6F776D] hover:bg-[#E8ECE5] px-6 text-xs font-bold text-[#2F352F] transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {loadingMore && (
                  <div className="size-3.5 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
                )}
                {loadingMore ? "Loading..." : "Load More Invoices"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
