"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Receipt,
  Sparkles,
  Info,
  Calendar,
  Send,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import type { WhatsAppBillingInfo, MonthlyUsageSummary } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { WHATSAPP_APPLICATION_RATES } from "@/lib/whatsapp/pricingConfig";
import { toast } from "react-hot-toast";

export function BillingUsageView() {
  return <UsageView />;
}

export function UsageView() {
  const [billing, setBilling] = useState<WhatsAppBillingInfo | null>(null);
  const [usage, setUsage] = useState<MonthlyUsageSummary | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);

  // Fetch billing meta details
  const fetchBilling = useCallback(async () => {
    setLoadingBilling(true);
    try {
      const data = await whatsappService.getBillingInfo();
      setBilling(data);
    } catch (err: unknown) {
      console.warn("Could not fetch Meta billing status:", err);
    } finally {
      setLoadingBilling(false);
    }
  }, []);

  // Fetch monthly usage
  const fetchUsage = useCallback(async (monthToFetch?: string) => {
    setLoadingUsage(true);
    try {
      const data = await whatsappService.getMonthlyUsage(monthToFetch);
      setUsage(data);
      if (!selectedMonth && data.month) {
        setSelectedMonth(data.month);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load WhatsApp usage data";
      toast.error(msg);
    } finally {
      setLoadingUsage(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchBilling();
    fetchUsage();
  }, [fetchBilling, fetchUsage]);

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    fetchUsage(newMonth);
  };

  const handleRefreshAll = () => {
    fetchBilling();
    fetchUsage(selectedMonth);
    toast.success("Usage and billing data refreshed.");
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── Top Header Banner ────────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
            <Receipt size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                WhatsApp Usage & Application Charges
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30">
                <CheckCircle2 size={11} />
                <span>Audited Sends</span>
              </span>
            </div>
            <p className="text-xs text-[#747A72] mt-0.5">
              Accurate monthly messaging volume, unique recipient counts, and configured salon application rates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-[#F7F7F4] border border-[#CCD2C8] rounded-xl px-3 py-1.5">
            <Calendar size={14} className="text-[#5F7A62]" />
            <select
              aria-label="Select Billing Month"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              disabled={loadingUsage}
              className="bg-transparent text-xs font-bold text-[#2F352F] focus:outline-none cursor-pointer"
            >
              {usage?.availableMonths && usage.availableMonths.length > 0 ? (
                usage.availableMonths.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))
              ) : (
                <option value={selectedMonth || "2026-10"}>Current Month</option>
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={loadingUsage || loadingBilling}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loadingUsage || loadingBilling ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Summary Cards (7 required metrics) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Total Messages Sent */}
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Sent This Month
            </span>
            <Send size={13} className="text-[#2B6CB0]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#2F352F]">
            {loadingUsage ? "..." : usage?.totalMessagesSent ?? 0}
          </div>
          <p className="text-[10px] text-[#747A72]">Dispatched to Meta</p>
        </div>

        {/* 2. Utility Messages */}
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5F7A62]">
              Utility
            </span>
            <Receipt size={13} className="text-[#5F7A62]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#5F7A62]">
            {loadingUsage ? "..." : usage?.utilitySent ?? 0}
          </div>
          <p className="text-[10px] text-[#747A72]">₹{WHATSAPP_APPLICATION_RATES.UTILITY.toFixed(2)} / message</p>
        </div>

        {/* 3. Marketing Messages */}
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#B18A45]">
              Marketing
            </span>
            <Sparkles size={13} className="text-[#B18A45]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#B18A45]">
            {loadingUsage ? "..." : usage?.marketingSent ?? 0}
          </div>
          <p className="text-[10px] text-[#747A72]">₹{WHATSAPP_APPLICATION_RATES.MARKETING.toFixed(2)} / message</p>
        </div>

        {/* 4. Delivered */}
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5F7A62]">
              Delivered
            </span>
            <CheckCircle2 size={13} className="text-[#5F7A62]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#2F352F]">
            {loadingUsage ? "..." : usage?.deliveredCount ?? 0}
          </div>
          <p className="text-[10px] text-[#747A72]">
            {usage?.readCount ? `${usage.readCount} read` : "Device confirmed"}
          </p>
        </div>

        {/* 5. Failed */}
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#B55B5B]">
              Failed
            </span>
            <AlertTriangle size={13} className="text-[#B55B5B]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#B55B5B]">
            {loadingUsage ? "..." : usage?.failedCount ?? 0}
          </div>
          <p className="text-[10px] text-[#747A72]">Delivery failures</p>
        </div>

        {/* 6. Pending */}
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Pending
            </span>
            <Clock size={13} className="text-[#747A72]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#747A72]">
            {loadingUsage ? "..." : usage?.pendingCount ?? 0}
          </div>
          <p className="text-[10px] text-[#747A72]">Awaiting receipt</p>
        </div>

        {/* 7. Estimated Application Charges */}
        <div className="p-4 rounded-2xl bg-[#FAF4E8] border border-[#EDD98A] shadow-xs space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#B18A45]">
              Est. Charges
            </span>
            <TrendingUp size={13} className="text-[#B18A45]" />
          </div>
          <div className="font-serif text-2xl font-bold text-[#8C6B1B]">
            {loadingUsage ? "..." : `₹${usage?.estimatedCharges.totalCharges.toFixed(2) ?? "0.00"}`}
          </div>
          <p className="text-[10px] text-[#8C6B1B]/80 font-medium">Application usage</p>
        </div>
      </div>

      {/* ── Breakdown Table: Utility vs Marketing ──────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E0E4DD] pb-3">
          <div>
            <h3 className="font-serif text-base font-bold text-[#2F352F]">
              Usage & Charge Breakdown for {usage?.monthLabel || selectedMonth}
            </h3>
            <p className="text-xs text-[#747A72]">
              Configured rates are BLOW SALON application usage charges. Timezone: {usage?.timezone || "Asia/Kolkata"} (IST).
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#747A72] bg-[#F7F7F4] px-2.5 py-1 rounded-lg border border-[#CCD2C8]">
            Unique Recipients: <strong>{usage?.totalUniqueRecipients ?? 0}</strong> • Total Attempts: <strong>{usage?.totalAttempts ?? 0}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E0E4DD] bg-[#FAF4E8]/40 text-[10px] font-bold uppercase tracking-wider text-[#6F776D]">
                <th className="py-3 px-4">Message Category</th>
                <th className="py-3 px-4 text-center">Unique Recipients</th>
                <th className="py-3 px-4 text-center">Messages Sent</th>
                <th className="py-3 px-4 text-center">Delivered</th>
                <th className="py-3 px-4 text-center">Failed</th>
                <th className="py-3 px-4 text-right">Configured Rate</th>
                <th className="py-3 px-4 text-right">Estimated Application Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E4DD] text-xs text-[#2F352F]">
              {/* Utility Row */}
              <tr className="hover:bg-[#F7F7F4]/60 transition">
                <td className="py-3.5 px-4 font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-[#E8ECE5] text-[#5F7A62]">
                      <Receipt size={14} />
                    </span>
                    <div>
                      <span className="font-bold text-[#2F352F] block">Utility Messages</span>
                      <span className="text-[10px] text-[#747A72]">Invoices, appointment confirmations, reminders</span>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-center font-mono">
                  {usage?.breakdown.utility.uniqueRecipients ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono font-bold text-[#2F352F]">
                  {usage?.breakdown.utility.messagesSent ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-[#5F7A62]">
                  {usage?.breakdown.utility.delivered ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-[#B55B5B]">
                  {usage?.breakdown.utility.failed ?? 0}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-[#5F7A62]">
                  ₹{WHATSAPP_APPLICATION_RATES.UTILITY.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-[#2F352F]">
                  ₹{(usage?.breakdown.utility.estimatedCharges ?? 0).toFixed(2)}
                </td>
              </tr>

              {/* Marketing Row */}
              <tr className="hover:bg-[#F7F7F4]/60 transition">
                <td className="py-3.5 px-4 font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-[#FAF4E8] text-[#B18A45]">
                      <Sparkles size={14} />
                    </span>
                    <div>
                      <span className="font-bold text-[#2F352F] block">Marketing Messages</span>
                      <span className="text-[10px] text-[#747A72]">Promotions, seasonal campaigns, custom broadcasts</span>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-center font-mono">
                  {usage?.breakdown.marketing.uniqueRecipients ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono font-bold text-[#2F352F]">
                  {usage?.breakdown.marketing.messagesSent ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-[#5F7A62]">
                  {usage?.breakdown.marketing.delivered ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-[#B55B5B]">
                  {usage?.breakdown.marketing.failed ?? 0}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-[#B18A45]">
                  ₹{WHATSAPP_APPLICATION_RATES.MARKETING.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-[#2F352F]">
                  ₹{(usage?.breakdown.marketing.estimatedCharges ?? 0).toFixed(2)}
                </td>
              </tr>

              {/* Total Row */}
              <tr className="bg-[#FAF4E8]/20 font-bold border-t-2 border-[#E0E4DD]">
                <td className="py-3.5 px-4">
                  <span className="font-serif text-sm text-[#2F352F]">Total Dispatched</span>
                </td>
                <td className="py-3.5 px-4 text-center font-mono">
                  {usage?.totalUniqueRecipients ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-sm text-[#2F352F]">
                  {usage?.totalMessagesSent ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-[#5F7A62]">
                  {usage?.deliveredCount ?? 0}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-[#B55B5B]">
                  {usage?.failedCount ?? 0}
                </td>
                <td className="py-3.5 px-4 text-right text-[11px] text-[#747A72]">
                  Configured rates
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-sm font-bold text-[#8C6B1B]">
                  ₹{(usage?.estimatedCharges.totalCharges ?? 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 pt-2 text-[11px] text-[#747A72]">
          <Info size={13} className="text-[#5F7A62] shrink-0" />
          <span>
            Usage accounting is calculated directly from persisted message delivery records and audited webhook events.
            Retried attempts are tracked distinctly and do not inflate the intended unique recipient count.
          </span>
        </div>
      </div>

      {/* ── Meta WhatsApp Manager Connection & Direct Billing ────────────────── */}
      {billing && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Prepaid Ledger Note */}
          <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                Meta WABA Balance
              </span>
              <CreditCard size={16} className="text-[#5F7A62]" />
            </div>

            <div className="space-y-1">
              <div className="font-mono text-xl font-bold text-[#2F352F]">
                Managed via Meta
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B18A45] bg-[#FAF4E8] px-2 py-0.5 rounded-full border border-[#EDD98A]">
                <Info size={11} />
                <span>External to ERP</span>
              </span>
            </div>

            <p className="text-xs text-[#747A72] leading-relaxed">
              Meta WhatsApp Cloud API does not expose a programmatic prepaid ledger via Graph API.
              Official invoices and tax deduction (GST) receipts are managed in Meta WhatsApp Manager.
            </p>

            <a
              href={billing.directBillingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5F7A62] hover:underline pt-2 block"
            >
              <span>View in Meta WhatsApp Manager</span>
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Card 2: Account Details */}
          <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                Meta Account Config
              </span>
              <Receipt size={16} className="text-[#5F7A62]" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs py-1 border-b border-[#E0E4DD]">
                <span className="text-[#747A72]">WABA ID</span>
                <span className="font-mono font-bold text-[#2F352F]">{billing.wabaId}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-[#E0E4DD]">
                <span className="text-[#747A72]">Currency</span>
                <span className="font-mono font-bold text-[#2F352F]">{billing.currency || "INR (₹)"}</span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-[#747A72]">Timezone</span>
                <span className="font-mono font-bold text-[#2F352F]">{billing.timezoneId || "Asia/Kolkata"}</span>
              </div>
            </div>

            <p className="text-[11px] text-[#747A72]">
              Account status: <strong className="text-[#5F7A62]">{billing.paymentStatus}</strong>
            </p>
          </div>

          {/* Card 3: Security & Card Policy */}
          <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                Security & PCI-DSS
              </span>
              <ShieldCheck size={16} className="text-[#5F7A62]" />
            </div>

            <p className="font-serif text-sm font-bold text-[#2F352F]">
              Direct Meta PCI-DSS Billing
            </p>

            <p className="text-xs text-[#747A72] leading-relaxed">
              BLOW SALON ERP never stores credit card credentials or banking secrets.
              Payment methods are maintained directly with Meta Platforms Ireland / Facebook.
            </p>

            <a
              href="https://business.facebook.com/billing_hub"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5F7A62] hover:underline pt-2 block"
            >
              <span>Open Meta Billing Hub</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* ── Pricing Reference Card ────────────────────────────────────────────── */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-4">
        <h3 className="font-serif text-base font-bold text-[#2F352F] flex items-center gap-2">
          <HelpCircle size={18} className="text-[#5F7A62]" />
          Configured Application Message Rates (India Market)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#5F7A62]">Utility Messages</span>
              <span className="font-mono font-bold text-sm text-[#5F7A62]">₹0.15</span>
            </div>
            <p className="text-[11px] text-[#747A72] leading-relaxed">
              Dispatched automatically for digital invoice receipts, booking confirmations, and appointment reminders.
              (e.g., <code className="font-mono text-[#2F352F]">blow_salon_invoice</code>)
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#B18A45]">Marketing Messages</span>
              <span className="font-mono font-bold text-sm text-[#B18A45]">₹0.90</span>
            </div>
            <p className="text-[11px] text-[#747A72] leading-relaxed">
              Promotional broadcasts, seasonal salon discounts, festival offers, and retention campaigns.
              (e.g., <code className="font-mono text-[#2F352F]">blow_salon_campaign</code>)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
