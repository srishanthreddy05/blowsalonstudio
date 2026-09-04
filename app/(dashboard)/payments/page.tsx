"use client";

import { useEffect, useState } from "react";
import * as invoicesService from "@/services/invoices";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { Search, WalletCards, DollarSign, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, limit, startAfter } from "firebase/firestore";

export default function PaymentsPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Collect Payment Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [collectAmount, setCollectAmount] = useState<number | "">("");
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadDueInvoices = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "invoices"),
        where("balanceDue", ">", 0),
        orderBy("balanceDue", "desc"),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const dues: any[] = [];
      querySnapshot.forEach((doc) => {
        dues.push({ id: doc.id, ...doc.data() });
      });
      setInvoices(dues);

      const last = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastDoc(last || null);
      setHasMore(querySnapshot.docs.length === 10);
    } catch (error) {
      console.error("Failed to load dues:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreDues = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "invoices"),
        where("balanceDue", ">", 0),
        orderBy("balanceDue", "desc"),
        startAfter(lastDoc),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const dues: any[] = [];
      querySnapshot.forEach((doc) => {
        dues.push({ id: doc.id, ...doc.data() });
      });
      setInvoices((prev) => [...prev, ...dues]);

      const last = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastDoc(last || null);
      setHasMore(querySnapshot.docs.length === 10);
    } catch (error) {
      console.error("Failed to load more dues:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadDueInvoices();
  }, []);

  const handleOpenCollect = (inv: any) => {
    setSelectedInvoice(inv);
    setCollectAmount(inv.balanceDue); // Default to full remaining balance
    setModalOpen(true);
    setMessage(null);
  };

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || collectAmount === "" || collectAmount <= 0) return;

    const amount = Number(collectAmount);
    if (amount > selectedInvoice.balanceDue) {
      setMessage({
        type: "error",
        text: `Cannot collect more than the remaining balance of ${formatCurrency(selectedInvoice.balanceDue)}.`,
      });
      return;
    }

    setCollecting(true);
    try {
      const nextReceived = (selectedInvoice.receivedAmount ?? 0) + amount;
      const nextBalance = Math.max(selectedInvoice.balanceDue - amount, 0);
      const nextStatus = nextBalance === 0 ? "paid" : "partial";

      await invoicesService.update(selectedInvoice.id, {
        receivedAmount: nextReceived,
        balanceDue: nextBalance,
        paymentStatus: nextStatus,
      });

      setMessage({
        type: "success",
        text: `Successfully collected ${formatCurrency(amount)} for ${selectedInvoice.invoiceNo || selectedInvoice.invoiceNumber}!`,
      });

      // Reload list
      setTimeout(() => {
        setModalOpen(false);
        loadDueInvoices();
      }, 1500);
    } catch (error) {
      console.error("Failed to collect payment:", error);
      setMessage({ type: "error", text: "Failed to log payment transaction." });
    } finally {
      setCollecting(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const name = (inv.customerName || "").toLowerCase();
    const mobile = (inv.customerPhone || inv.customerMobile || "");
    const invNo = (inv.invoiceNo || inv.invoiceNumber || "").toLowerCase();

    return name.includes(query) || mobile.includes(query) || invNo.includes(query);
  });

  return (
    <div className="w-full text-[#292D29]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Cashier & Receivables
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Pending Dues Collection
          </h1>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-5 flex max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
        <Search size={16} className="text-[#747A72] mr-2" />
        <input
          type="text"
          placeholder="Search by name, phone, or invoice..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
        />
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-4">
            <WalletCards size={28} />
          </div>
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">All Clear! No Pending Dues</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            There are no invoices with active balance dues matching your query.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
            <table className="w-full min-w-[600px] border-collapse text-left text-xs text-[#292D29]">
              <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Customer</th>
                  <th className="px-5 py-3.5 font-bold">Phone</th>
                  <th className="px-5 py-3.5 font-bold">Invoice No</th>
                  <th className="px-5 py-3.5 font-bold">Bill Amount</th>
                  <th className="px-5 py-3.5 font-bold">Received</th>
                  <th className="px-5 py-3.5 font-bold">Balance</th>
                  <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD]">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                    <td className="px-5 py-3.5 font-semibold text-[#2F352F]">{inv.customerName}</td>
                    <td className="px-5 py-3.5 font-medium text-[#747A72]">{inv.customerPhone || inv.customerMobile}</td>
                    <td className="px-5 py-3.5 font-bold text-[#2F352F]">
                      {inv.invoiceNo || inv.invoiceNumber}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-[#2F352F]">{formatCurrency(inv.grandTotal || 0)}</td>
                    <td className="px-5 py-3.5 font-semibold text-[#5F7A62]">
                      {formatCurrency(inv.receivedAmount ?? inv.grandTotal)}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#B55B5B]">
                      {formatCurrency(inv.balanceDue ?? 0)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleOpenCollect(inv)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#6F776D] hover:bg-[#2F352F] px-3.5 text-xs font-bold text-[#FFFFFF] transition shadow-xs cursor-pointer"
                      >
                        <DollarSign size={13} />
                        Collect Payment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                type="button"
                onClick={loadMoreDues}
                disabled={loadingMore}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-6 text-xs font-bold text-[#2F352F] hover:bg-[#E8ECE5] hover:border-[#6F776D] transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? "Loading More..." : "Load More"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collect Payment Modal Dialog */}
      {modalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">Collect Balance Payment</h2>
            
            {message && (
              <div
                className={`mb-4 rounded-xl border p-3 text-xs font-semibold ${
                  message.type === "success"
                    ? "border-[#CCD2C8] bg-[#E8ECE5] text-[#5F7A62]"
                    : "border-[#FBEBEB] bg-[#FBEBEB] text-[#B55B5B]"
                }`}
              >
                {message.text}
              </div>
            )}

            <form onSubmit={handleCollectSubmit} className="space-y-4">
              <div className="space-y-1.5 text-xs bg-[#F7F7F4] border border-[#E0E4DD] p-3.5 rounded-2xl">
                <div className="flex justify-between">
                  <span className="text-[#747A72] font-medium">Customer:</span>
                  <span className="font-bold text-[#2F352F]">{selectedInvoice.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#747A72] font-medium">Invoice:</span>
                  <span className="font-bold text-[#2F352F]">{selectedInvoice.invoiceNo || selectedInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between border-t border-[#E0E4DD] pt-2 mt-2">
                  <span className="text-[#747A72] font-semibold">Total Invoice Amount:</span>
                  <span className="font-bold text-[#2F352F]">{formatCurrency(selectedInvoice.grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#747A72] font-semibold">Already Received:</span>
                  <span className="font-bold text-[#5F7A62]">
                    {formatCurrency(selectedInvoice.receivedAmount ?? selectedInvoice.grandTotal)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E0E4DD] pt-2 mt-2">
                  <span className="text-[#2F352F] font-bold">Remaining Balance Due:</span>
                  <span className="font-extrabold text-[#B55B5B]">{formatCurrency(selectedInvoice.balanceDue)}</span>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Payment Amount Collected (INR)</span>
                <input
                  required
                  type="number"
                  min="1"
                  max={selectedInvoice.balanceDue}
                  value={collectAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCollectAmount(val === "" ? "" : Math.min(Number(val), selectedInvoice.balanceDue));
                  }}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] font-bold outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                />
              </label>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
                  disabled={collecting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-[#6F776D] px-5 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition shadow-xs cursor-pointer"
                  disabled={collecting}
                >
                  {collecting ? "Logging..." : "Confirm Collection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
