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
    let unsubscribeFallback: (() => void) | null = null;

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
      () => {
        // Fallback while composite index is building
        const fallbackQuery = query(
          collection(db, "advance_balances"),
          where("balance", ">", 0)
        );
        unsubscribeFallback = onSnapshot(fallbackQuery, (snapshot) => {
          const balances: AdvanceBalance[] = [];
          snapshot.forEach((doc) => {
            balances.push({
              id: doc.id,
              ...doc.data(),
            } as any);
          });
          balances.sort((a: any, b: any) => {
            const timeA = a.lastUpdated?.toMillis ? a.lastUpdated.toMillis() : new Date(a.lastUpdated || 0).getTime();
            const timeB = b.lastUpdated?.toMillis ? b.lastUpdated.toMillis() : new Date(b.lastUpdated || 0).getTime();
            return timeB - timeA;
          });
          setAdvanceBalances(balances);
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

  const activeBalancesCount = advanceBalances.length;

  if (loading) {
    return (
      <div className="grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72]">
        <PiggyBank size={17} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] transition hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5] cursor-pointer"
        aria-label="Customer Advance Balances"
        title="Customer Advance Balances"
      >
        <PiggyBank size={17} className={activeBalancesCount > 0 ? "text-[#5F7A62]" : ""} />
        {activeBalancesCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-[#5F7A62] text-[9px] font-bold text-[#FFFFFF] shadow-xs">
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
            className="fixed z-[9999] w-80 sm:w-96 rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-4 text-[#292D29]"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
          >
            <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] text-[#5F7A62]">
                  <PiggyBank size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#292D29] text-left">Advance Balances</h2>
                  <p className="text-[10px] text-[#747A72] font-medium mt-0.5 text-left">Customer prepaid funds</p>
                </div>
              </div>
              {activeBalancesCount > 0 && (
                <span className="inline-flex items-center justify-center bg-[#E8ECE5] text-[#5F7A62] text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none shrink-0">
                  {activeBalancesCount} Account{activeBalancesCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {activeBalancesCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[#747A72]">
                  <Sparkles size={22} className="text-[#6F776D] mb-2" />
                  <p className="text-xs font-semibold text-[#292D29]">No active advances</p>
                  <p className="text-[10px] text-[#747A72] mt-0.5">Prepaid balances will appear here.</p>
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
                      className="flex items-center justify-between gap-4 p-3 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs hover:border-[#6F776D]/40 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="grid size-7 place-items-center rounded-lg bg-[#E8ECE5] text-[#6F776D] shrink-0">
                          <User size={13} />
                        </div>
                        <div className="min-w-0 text-left">
                          <span className="font-bold text-[#292D29] truncate block">{adv.customerName}</span>
                          <div className="flex items-center gap-1.5 text-[#747A72] mt-0.5 font-medium flex-wrap">
                            <span className="flex items-center gap-0.5 text-[#747A72]">
                              <Phone size={10} />
                              {adv.customerPhone}
                            </span>
                            {lastUpdatedDate && (
                              <span className="flex items-center gap-0.5 text-[9px] text-[#747A72]">
                                <Calendar size={10} />
                                {lastUpdatedDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center shrink-0">
                        <span className="font-bold text-[#5F7A62] text-sm whitespace-nowrap">
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
