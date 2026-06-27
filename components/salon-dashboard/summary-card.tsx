"use client";

import React from "react";
import { Receipt, CreditCard, PiggyBank } from "lucide-react";
import type { BillTotals } from "./types";
import { formatCurrency } from "./types";
import { ClearableNumberInput } from "../ui/ClearableNumberInput";

interface SummaryCardProps {
  totals: BillTotals;
  billDiscount: number;
  billDiscountPercent: number;
  onChangeDiscount?: (val: number, percent: number) => void;
  
  // Advance balance fields
  amountPaid: number | "";
  onChangeAmountPaid?: (val: number | "") => void;
  advanceToAdd: number;
  onAddAdvance?: (val: number) => void;

  // Feature 3: Advance balance application fields
  advanceApplied: number;
}

export function SummaryCard({
  totals,
  billDiscount,
  billDiscountPercent,
  onChangeDiscount,
  amountPaid,
  onChangeAmountPaid,
  advanceToAdd,
  onAddAdvance,
  advanceApplied,
}: SummaryCardProps) {
  const handlePercentChange = (val: number | "") => {
    if (val === "") {
      onChangeDiscount?.(0, 0);
      return;
    }
    let percent = Math.min(100, Math.max(0, val));
    let value = (totals.serviceTotal * percent) / 100;
    value = Math.round(value * 100) / 100;
    percent = Math.round(percent * 100) / 100;
    onChangeDiscount?.(value, percent);
  };

  const handleValueChange = (val: number | "") => {
    if (val === "") {
      onChangeDiscount?.(0, 0);
      return;
    }
    let value = Math.min(totals.serviceTotal, Math.max(0, val));
    let percent = totals.serviceTotal > 0 ? (value / totals.serviceTotal) * 100 : 0;
    percent = Math.round(percent * 100) / 100;
    value = Math.round(value * 100) / 100;
    onChangeDiscount?.(value, percent);
  };

  // Grand total formula includes row-level line discounts
  const grandTotal = Math.max(
    totals.serviceTotal - totals.billDiscount - totals.offerDiscount + totals.productTotal - (totals.lineDiscount || 0) + (totals.gst || 0),
    0
  );

  const amountToCollect = Math.max(0, grandTotal - advanceApplied);

  // Overpayment calculations
  const change = Math.max(0, (Number(amountPaid) || 0) - amountToCollect);
  const isAdvanceSelected = change > 0 && advanceToAdd === change;
  const isChangeSelected = change > 0 && advanceToAdd === 0;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-md text-stone-900">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-stone-100 text-stone-900">
          <Receipt size={21} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-stone-900">Bill Summary</h2>
          <p className="text-sm text-stone-500">Discounts applied</p>
        </div>
      </div>

      <div className="space-y-3 border-t border-stone-100 pt-4">
        {/* Total Services */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Total Services</span>
          <span className="font-semibold text-stone-800">
            {formatCurrency(totals.serviceTotal)}
          </span>
        </div>

        {/* Bill Discount (percentage and rupee inputs side by side) */}
        <div className="flex flex-col gap-2 py-1.5 border-y border-stone-100 my-1">
          <div className="flex items-center justify-between text-xs font-bold text-stone-600">
            <span>Bill Discount (Services Only)</span>
            {billDiscount > 0 && (
              <span className="text-emerald-600 font-semibold">
                -{formatCurrency(billDiscount)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative rounded-xl border border-stone-200 focus-within:border-[#B8962E] focus-within:ring-1 focus-within:ring-[#B8962E] transition bg-stone-50 px-2 py-1 flex items-center">
              <ClearableNumberInput
                min="0"
                max="100"
                step="0.01"
                placeholder="0%"
                value={billDiscountPercent === 0 ? "" : billDiscountPercent}
                onChange={handlePercentChange}
                className="w-full text-xs text-stone-900 pr-3"
              />
              <span className="absolute right-2 text-[10px] font-bold text-stone-400 pointer-events-none">%</span>
            </div>
            <div className="relative rounded-xl border border-stone-200 focus-within:border-[#B8962E] focus-within:ring-1 focus-within:ring-[#B8962E] transition bg-stone-50 px-2 py-1 flex items-center">
              <span className="absolute left-2 text-[10px] font-bold text-stone-400 pointer-events-none">₹</span>
              <ClearableNumberInput
                min="0"
                max={totals.serviceTotal}
                step="0.01"
                placeholder="0.00"
                value={billDiscount === 0 ? "" : billDiscount}
                onChange={handleValueChange}
                className="w-full text-xs text-stone-900 pl-3"
              />
            </div>
          </div>
        </div>

        {/* Total Products */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Total Products</span>
          <span className="font-semibold text-stone-800">
            {formatCurrency(totals.productTotal)}
          </span>
        </div>

        {/* Subtotal */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Subtotal</span>
          <span className="font-semibold text-stone-800">
            {formatCurrency(totals.subtotal)}
          </span>
        </div>

        {/* GST Tax */}
        {totals.gst !== undefined && totals.gst > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">GST / Tax</span>
            <span className="font-semibold text-stone-800">
              {formatCurrency(totals.gst)}
            </span>
          </div>
        )}

        {/* Item-level discounts display */}
        {totals.lineDiscount !== undefined && totals.lineDiscount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">Item Discount</span>
            <span className="font-semibold text-emerald-600">
              -{formatCurrency(totals.lineDiscount)}
            </span>
          </div>
        )}

        {/* Offer Discount */}
        {totals.offerDiscount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-500">Offer Discount</span>
            <span className="font-semibold text-emerald-600">
              -{formatCurrency(totals.offerDiscount)}
            </span>
          </div>
        )}

        {/* Advance Used */}
        {advanceApplied > 0 && (
          <div className="flex items-center justify-between text-sm font-semibold text-emerald-600">
            <span className="text-emerald-700">Advance Used</span>
            <span>
              -{formatCurrency(advanceApplied)}
            </span>
          </div>
        )}
      </div>

      {/* Grand Total */}
      <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500 font-bold">Grand Total</p>
        <p className="mt-2 text-4xl font-bold tracking-tight text-stone-900">
          {formatCurrency(grandTotal)}
        </p>
      </div>

      {/* Amount to Collect */}
      {advanceApplied > 0 && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4">
          <p className="text-xs uppercase tracking-[0.28em] text-emerald-700 font-bold">Amount to Collect</p>
          {amountToCollect === 0 ? (
            <p className="mt-2 text-lg font-bold text-emerald-800">
              Fully covered by advance
            </p>
          ) : (
            <p className="mt-2 text-4xl font-bold tracking-tight text-emerald-900">
              {formatCurrency(amountToCollect)}
            </p>
          )}
        </div>
      )}

      {/* Amount Paid input */}
      <div className="mt-4 pt-4 border-t border-stone-150">
        <label className="block">
          <span className="text-xs uppercase tracking-[0.28em] text-stone-500 font-bold">Amount Paid</span>
          <div className="mt-2 relative rounded-xl border border-stone-200 focus-within:border-[#B8962E] focus-within:ring-1 focus-within:ring-[#B8962E] transition bg-stone-50 px-3 py-2 flex items-center shadow-inner">
            <span className="text-sm font-bold text-stone-400 pointer-events-none">₹</span>
            <ClearableNumberInput
              min="0"
              placeholder={amountToCollect > 0 ? amountToCollect.toFixed(2) : "0.00"}
              value={amountPaid}
              onChange={(val) => {
                onChangeAmountPaid?.(val);
              }}
              className="w-full text-sm font-bold text-stone-900 pl-3"
            />
          </div>
        </label>
      </div>

      {/* Extra Payment Options */}
      {change > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between text-xs font-bold text-stone-600">
            <div className="flex items-center gap-1">
              <CreditCard size={13} className="text-amber-600" />
              <span>Extra Received:</span>
            </div>
            <span className="text-sm font-extrabold text-amber-700">{formatCurrency(change)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onAddAdvance?.(change);
              }}
              className={`py-2 px-1 text-[10px] font-bold uppercase tracking-wider rounded-xl border transition cursor-pointer text-center ${
                isAdvanceSelected
                  ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
              }`}
            >
              Add to Advance
            </button>
            <button
              type="button"
              onClick={() => {
                onAddAdvance?.(0);
              }}
              className={`py-2 px-1 text-[10px] font-bold uppercase tracking-wider rounded-xl border transition cursor-pointer text-center ${
                isChangeSelected
                  ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
              }`}
            >
              Give as Change
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
