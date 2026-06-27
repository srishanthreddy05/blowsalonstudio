"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PiggyBank, Sparkles, User, Calendar, Phone } from "lucide-react";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import type { AdvanceBalance } from "@/types/advanceBalance";

export default function AdvanceTracker() {
  const [advanceBalances, setAdvanceBalances] = useState<AdvanceBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Set up a real-time Firestore listener for advance balances > 0
    const q = query(
      collection(db, "advance_balances"),
      where("balance", ">", 0),
      orderBy("lastUpdated", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const balances: AdvanceBalance[] = [];
        snapshot.forEach((doc) => {
          balances.push({
            id: doc.id,
            ...doc.data(),
          } as any);
        });
        setAdvanceBalances(balances);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to advance balances:", error);
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

  const activeBalancesCount = advanceBalances.length;

  if (loading) {
    return (
      <div className="grid size-11 place-items-center rounded-2xl border border-[#2E2B24] bg-[#131210] text-[#6B6358]">
        <PiggyBank size={18} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative grid size-11 place-items-center rounded-2xl border border-[#2E2B24] bg-[#131210] text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1C1A16] cursor-pointer"
        aria-label="Customer Advance Balances"
        title="Customer Advance Balances"
      >
        <PiggyBank size={18} className={activeBalancesCount > 0 ? "animate-pulse text-[#B8962E]" : ""} />
        {activeBalancesCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#B8962E] text-[10px] font-bold text-[#0E0D0B] shadow-sm ring-2 ring-[#131210] animate-bounce">
            {activeBalancesCount}
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
                  <PiggyBank size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F5F0E8] text-left">Advance Balances</h2>
                  <p className="text-[10px] text-[#6B6358] font-semibold mt-0.5 text-left">Customer prepaid funds</p>
                </div>
              </div>
              {activeBalancesCount > 0 && (
                <span className="inline-flex items-center justify-center bg-[#131210] text-[#B8962E] text-[10px] font-bold px-2 py-0.5 rounded-full select-none shrink-0 border border-[#2E2B24]">
                  {activeBalancesCount} Account{activeBalancesCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {activeBalancesCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[#6B6358]">
                  <Sparkles size={24} className="text-[#B8962E] mb-2 animate-pulse" />
                  <p className="text-xs font-semibold text-[#A89F8C]">No active advances</p>
                  <p className="text-[10px] text-[#6B6358] mt-0.5">Prepaid balances will appear here.</p>
                </div>
              ) : (
                advanceBalances.map((adv) => {
                  const lastUpdatedDate = adv.lastUpdated && typeof adv.lastUpdated.toDate === "function"
                    ? adv.lastUpdated.toDate().toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })
                    : adv.lastUpdated
                      ? new Date(adv.lastUpdated as any).toLocaleDateString()
                      : "";

                  return (
                    <div
                      key={adv.customerId}
                      className="flex items-center justify-between gap-4 p-3 bg-[#131210] border border-[#2E2B24] rounded-2xl text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid size-7 place-items-center rounded-lg bg-[#1C1A16] text-[#B8962E] shrink-0">
                          <User size={13} />
                        </div>
                        <div className="min-w-0 text-left">
                          <span className="font-bold text-[#F5F0E8] truncate block">{adv.customerName}</span>
                          <div className="flex items-center gap-1.5 text-[#A89F8C] mt-0.5 font-medium flex-wrap">
                            <span className="flex items-center gap-0.5 text-[#6B6358]">
                              <Phone size={10} />
                              {adv.customerPhone}
                            </span>
                            {lastUpdatedDate && (
                              <span className="flex items-center gap-0.5 text-[9px] text-[#6B6358]">
                                <Calendar size={10} />
                                {lastUpdatedDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center shrink-0">
                        <span className="font-extrabold text-[#B8962E] text-sm whitespace-nowrap">
                          {formatCurrency(adv.balance)}
                        </span>
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
