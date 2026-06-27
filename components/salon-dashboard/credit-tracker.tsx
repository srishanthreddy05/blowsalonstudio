"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wallet, Check, Sparkles, User, Calendar, IndianRupee } from "lucide-react";
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
      (error) => {
        console.error("Error listening to pending credit balances:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
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
      <div className="grid size-11 place-items-center rounded-2xl border border-[#2E2B24] bg-[#131210] text-[#6B6358]">
        <Wallet size={18} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative grid size-11 place-items-center rounded-2xl border border-[#2E2B24] bg-[#131210] text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1C1A16] cursor-pointer"
        aria-label="Credit Customer Tracker"
        title="Credit Customer Tracker"
      >
        <Wallet size={18} className={totalPendingCount > 0 ? "animate-pulse text-[#B8962E]" : ""} />
        {totalPendingCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#B8962E] text-[10px] font-bold text-[#0E0D0B] shadow-sm ring-2 ring-[#131210] animate-bounce">
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
            className="fixed z-[9999] w-80 sm:w-96 rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-4 text-[#A89F8C]"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
          >
            <div className="flex items-center justify-between border-b border-[#2E2B24] pb-3">
              <div className="flex items-center gap-2">
                <div className="grid size-9 place-items-center rounded-xl bg-[#131210] text-[#B8962E] border border-[#2E2B24]">
                  <Wallet size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F5F0E8] text-left">Outstanding Credits</h2>
                  <p className="text-[10px] text-[#6B6358] font-semibold mt-0.5 text-left">Track clients paying later</p>
                </div>
              </div>
              {totalPendingCount > 0 && (
                <span className="inline-flex items-center justify-center bg-[#131210] text-[#B8962E] text-[10px] font-bold px-2 py-0.5 rounded-full select-none shrink-0 border border-[#2E2B24]">
                  {totalPendingCount} Customer{totalPendingCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {totalPendingCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[#6B6358]">
                  <Sparkles size={24} className="text-[#B8962E] mb-2 animate-pulse" />
                  <p className="text-xs font-semibold text-[#A89F8C]">Zero outstanding credit!</p>
                  <p className="text-[10px] text-[#6B6358] mt-0.5">All customer payments are settled.</p>
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
                      className="flex items-center justify-between gap-4 p-3 bg-[#131210] border border-[#2E2B24] rounded-2xl text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid size-7 place-items-center rounded-lg bg-[#1C1A16] text-[#B8962E] shrink-0">
                          <User size={13} />
                        </div>
                        <div className="min-w-0 text-left">
                          <span className="font-bold text-[#F5F0E8] truncate block">{credit.customerName}</span>
                          <div className="flex items-center gap-1.5 text-[#A89F8C] mt-0.5 font-medium">
                            <Calendar size={11} />
                            <span>{creditDate}</span>
                            <span className="text-[10px] bg-[#1C1A16] px-1 rounded font-bold">{credit.invoiceNumber}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-extrabold text-[#B8962E] text-sm whitespace-nowrap">
                          {formatCurrency(credit.remainingAmount !== undefined ? credit.remainingAmount : (credit.amount ?? 0))}
                        </span>
                        <button
                          onClick={() => credit.id && handleSettleCredit(credit.id, credit.customerName)}
                          className="p-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-900/50 transition cursor-pointer"
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
