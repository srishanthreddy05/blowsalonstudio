"use client";

import React from "react";
import { Receipt, CreditCard } from "lucide-react";
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

  // Advance balance application fields
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

  const grandTotal = totals.grandTotal;
  const taxableServices = totals.taxableServiceAmount ?? Math.max(0, totals.serviceTotal - (totals.serviceDiscount ?? (totals.billDiscount + (totals.offerDiscount || 0))));
  const taxAmount = totals.taxAmount ?? totals.gst ?? 0;
  const serviceDiscountAmount = totals.serviceDiscount ?? (totals.billDiscount + (totals.offerDiscount || 0));

  const amountToCollect = Math.max(0, grandTotal - advanceApplied);

  // Overpayment calculations
  const change = Math.max(0, (Number(amountPaid) || 0) - amountToCollect);
  const isAdvanceSelected = change > 0 && advanceToAdd === change;
  const isChangeSelected = change > 0 && advanceToAdd === 0;

  return (
    <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29]">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-[#E8ECE5] text-[#2F352F]">
          <Receipt size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-[#292D29]">Bill Summary</h2>
          <p className="text-xs text-[#747A72]">Discounts & totals breakdown</p>
        </div>
      </div>

      <div className="space-y-3 border-t border-[#E0E4DD] pt-4">
        {/* 1. Total Services */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#747A72]">Total Services</span>
          <span className="font-semibold text-[#292D29]">
            {formatCurrency(totals.serviceTotal)}
          </span>
        </div>

        {/* 2. Service Discount (interactive inputs and total discount indicator) */}
        <div className="flex flex-col gap-2 py-2 border-y border-[#E0E4DD] my-1">
          <div className="flex items-center justify-between text-xs font-bold text-[#747A72]">
            <span>Service Discount</span>
            {serviceDiscountAmount > 0 && (
              <span className="text-[#5F7A62] font-semibold">
                -{formatCurrency(serviceDiscountAmount)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative rounded-xl border border-[#E0E4DD] focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition bg-[#F7F7F4] px-2 py-1 flex items-center">
              <ClearableNumberInput
                min="0"
                max="100"
                step="0.01"
                placeholder="0%"
                value={billDiscountPercent === 0 ? "" : billDiscountPercent}
                onChange={handlePercentChange}
                className="w-full text-xs text-[#292D29] pr-3 font-semibold"
              />
              <span className="absolute right-2 text-[10px] font-bold text-[#747A72] pointer-events-none">%</span>
            </div>
            <div className="relative rounded-xl border border-[#E0E4DD] focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition bg-[#F7F7F4] px-2 py-1 flex items-center">
              <span className="absolute left-2 text-[10px] font-bold text-[#747A72] pointer-events-none">₹</span>
              <ClearableNumberInput
                min="0"
                max={totals.serviceTotal}
                step="0.01"
                placeholder="0.00"
                value={billDiscount === 0 ? "" : billDiscount}
                onChange={handleValueChange}
                className="w-full text-xs text-[#292D29] pl-3 font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Offer Discount line if active */}
        {totals.offerDiscount > 0 && (
          <div className="flex items-center justify-between text-xs text-[#5F7A62]">
            <div>
              <span>Offer Discount Applied</span>
              {totals.eligibleServiceAmount !== undefined && totals.eligibleServiceAmount > 0 && (
                <span className="text-[10px] text-[#747A72] block">
                  Eligible services: {formatCurrency(totals.eligibleServiceAmount)}
                </span>
              )}
            </div>
            <span className="font-semibold">
              -{formatCurrency(totals.offerDiscount)}
            </span>
          </div>
        )}

        {/* Item-level service line discounts if active */}
        {totals.lineDiscount !== undefined && totals.lineDiscount > 0 && (
          <div className="flex items-center justify-between text-xs text-[#5F7A62]">
            <span>Item Discounts</span>
            <span className="font-semibold">
              -{formatCurrency(totals.lineDiscount)}
            </span>
          </div>
        )}

        {/* 3. Taxable Services */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#747A72]">Taxable Services</span>
          <span className="font-semibold text-[#292D29]">
            {formatCurrency(taxableServices)}
          </span>
        </div>

        {/* 4. Tax (5%) */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[#747A72]">Tax (5%)</span>
            <span className="text-[10px] font-bold rounded-md bg-[#E8ECE5] text-[#5F7A62] px-1.5 py-0.5">5% Service Tax</span>
          </div>
          <span className="font-semibold text-[#292D29]">
            {formatCurrency(taxAmount)}
          </span>
        </div>

        {/* 5. Retail Products (Undiscounted) */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className="text-[#747A72]">Retail Products</span>
            <span className="text-[10px] text-[#747A72] block">0% Tax • Undiscounted</span>
          </div>
          <span className="font-semibold text-[#292D29]">
            {formatCurrency(totals.productTotal)}
          </span>
        </div>

        {/* 6. Memberships (if present) */}
        {totals.membershipTotal !== undefined && totals.membershipTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="text-[#747A72]">Memberships</span>
              <span className="text-[10px] text-[#747A72] block">0% Service Tax</span>
            </div>
            <span className="font-semibold text-[#292D29]">
              {formatCurrency(totals.membershipTotal)}
            </span>
          </div>
        )}

        {/* Advance Used */}
        {advanceApplied > 0 && (
          <div className="flex items-center justify-between text-sm font-semibold text-[#5F7A62]">
            <span>Advance Used</span>
            <span>
              -{formatCurrency(advanceApplied)}
            </span>
          </div>
        )}
      </div>

      {/* 7. Grand Total */}
      <div className="mt-5 rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-[#747A72] font-bold">Grand Total</p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#2F352F]">
          {formatCurrency(grandTotal)}
        </p>
      </div>

      {/* Amount to Collect */}
      {advanceApplied > 0 && (
        <div className="mt-4 rounded-2xl border border-[#CCD2C8] bg-[#E8ECE5] p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-[#2F352F] font-bold">Amount to Collect</p>
          {amountToCollect === 0 ? (
            <p className="mt-2 text-base font-bold text-[#5F7A62]">
              Fully covered by advance
            </p>
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight text-[#2F352F]">
              {formatCurrency(amountToCollect)}
            </p>
          )}
        </div>
      )}

      {/* Amount Paid input */}
      <div className="mt-4 pt-4 border-t border-[#E0E4DD]">
        <label className="block">
          <span className="text-xs uppercase tracking-[0.22em] text-[#747A72] font-bold">Amount Paid</span>
          <div className="mt-2 relative rounded-xl border border-[#E0E4DD] focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition bg-[#F7F7F4] px-3 py-2 flex items-center">
            <span className="text-sm font-bold text-[#747A72] pointer-events-none">₹</span>
            <ClearableNumberInput
              min="0"
              placeholder={amountToCollect > 0 ? amountToCollect.toFixed(2) : "0.00"}
              value={amountPaid}
              onChange={(val) => {
                onChangeAmountPaid?.(val);
              }}
              className="w-full text-sm font-bold text-[#292D29] pl-3"
            />
          </div>
        </label>
      </div>

      {/* Extra Payment Options */}
      {change > 0 && (
        <div className="mt-4 rounded-2xl border border-[#B18A45]/30 bg-[#FAF4E8] p-4 space-y-3 shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between text-xs font-bold text-[#747A72]">
            <div className="flex items-center gap-1.5">
              <CreditCard size={13} className="text-[#B18A45]" />
              <span>Extra Received:</span>
            </div>
            <span className="text-sm font-extrabold text-[#B18A45]">{formatCurrency(change)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onAddAdvance?.(change);
              }}
              className={`py-2 px-1 text-[10px] font-bold uppercase tracking-wider rounded-xl border transition cursor-pointer text-center ${
                isAdvanceSelected
                  ? "bg-[#6F776D] text-[#FFFFFF] border-[#6F776D] shadow-xs"
                  : "bg-[#FFFFFF] text-[#292D29] border-[#E0E4DD] hover:bg-[#F7F7F4]"
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
                  ? "bg-[#2F352F] text-[#FFFFFF] border-[#2F352F] shadow-xs"
                  : "bg-[#FFFFFF] text-[#292D29] border-[#E0E4DD] hover:bg-[#F7F7F4]"
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
