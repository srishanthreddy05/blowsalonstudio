"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wallet, Check, Sparkles, User, Calendar } from "lucide-react";
import * as creditBalancesService from "@/services/creditBalances";
import type { CreditBalance } from "@/types/creditBalance";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import toast from "react-hot-toast";

export default function CreditTracker() {
  const [pendingCredits, setPendingCredits] = useState<CreditBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Set up a real-time Firestore listener for pending credit balances
    let unsubscribeFallback: (() => void) | null = null;

    const q = query(
      collection(db, "credit_balances"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const credits: CreditBalance[] = [];
        snapshot.forEach((doc) => {
          credits.push({
            id: doc.id,
            ...doc.data(),
          } as CreditBalance);
        });
        setPendingCredits(credits);
        setLoading(false);
      },
      () => {
        // Fallback while composite index is building
        const fallbackQuery = query(
          collection(db, "credit_balances"),
          where("status", "==", "pending")
        );
        unsubscribeFallback = onSnapshot(fallbackQuery, (snapshot) => {
          const credits: CreditBalance[] = [];
          snapshot.forEach((doc) => {
            credits.push({
              id: doc.id,
              ...doc.data(),
            } as CreditBalance);
          });
          credits.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setPendingCredits(credits);
          setLoading(false);
        });
      }
    );

    return () => {
      unsubscribe();
      if (unsubscribeFallback) unsubscribeFallback();
    };
  }, []);

  // Recalculate dropdown position whenever it opens
  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen((prev) => !prev);
  };

  // Close on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  const handleSettleCredit = async (creditId: string, customerName: string) => {
    try {
      await creditBalancesService.settle(creditId);
      toast.success(`Credit for ${customerName} settled successfully!`);
    } catch (error) {
      console.error("Failed to settle credit balance:", error);
      toast.error("Failed to settle credit balance. Please try again.");
    }
  };

  const totalPendingCount = pendingCredits.length;

  if (loading) {
    return (
      <div className="grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72]">
        <Wallet size={17} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] transition hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5] cursor-pointer"
        aria-label="Credit Customer Tracker"
        title="Credit Customer Tracker"
      >
        <Wallet size={17} className={totalPendingCount > 0 ? "text-[#B18A45]" : ""} />
        {totalPendingCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-[#B18A45] text-[9px] font-bold text-[#FFFFFF] shadow-xs">
            {totalPendingCount}
          </span>
        )}
      </button>

      {isOpen && typeof window !== "undefined" && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown panel */}
          <div
            className="fixed z-[9999] w-80 sm:w-96 rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-4 text-[#292D29]"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
          >
            <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-lg bg-[#FAF4E8] text-[#B18A45]">
                  <Wallet size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#292D29] text-left">Outstanding Credits</h2>
                  <p className="text-[10px] text-[#747A72] font-medium mt-0.5 text-left">Track clients paying later</p>
                </div>
              </div>
              {totalPendingCount > 0 && (
                <span className="inline-flex items-center justify-center bg-[#FAF4E8] text-[#B18A45] text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none shrink-0 border border-[#B18A45]/20">
                  {totalPendingCount} Customer{totalPendingCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {totalPendingCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[#747A72]">
                  <Sparkles size={22} className="text-[#5F7A62] mb-2" />
                  <p className="text-xs font-semibold text-[#292D29]">Zero outstanding credit!</p>
                  <p className="text-[10px] text-[#747A72] mt-0.5">All customer payments are settled.</p>
                </div>
              ) : (
                pendingCredits.map((credit) => {
                  const creditDate = new Date(credit.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  });

                  return (
                    <div
                      key={credit.id}
                      className="flex items-center justify-between gap-4 p-3 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs hover:border-[#6F776D]/40 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid size-7 place-items-center rounded-lg bg-[#E8ECE5] text-[#6F776D] shrink-0">
                          <User size={13} />
                        </div>
                        <div className="min-w-0 text-left">
                          <span className="font-bold text-[#292D29] truncate block">{credit.customerName}</span>
                          <div className="flex items-center gap-1.5 text-[#747A72] mt-0.5 font-medium">
                            <Calendar size={11} />
                            <span>{creditDate}</span>
                            <span className="text-[10px] bg-[#E8ECE5] text-[#2F352F] px-1 rounded font-bold">{credit.invoiceNumber}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-[#B18A45] text-sm whitespace-nowrap">
                          {formatCurrency(credit.remainingAmount !== undefined ? credit.remainingAmount : (credit.amount ?? 0))}
                        </span>
                        <button
                          onClick={() => credit.id && handleSettleCredit(credit.id, credit.customerName)}
                          className="p-1.5 rounded-lg bg-[#E8ECE5] hover:bg-[#5F7A62] text-[#5F7A62] hover:text-[#FFFFFF] border border-[#5F7A62]/30 transition cursor-pointer"
                          title="Settle credit payment"
                        >
                          <Check size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
