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
  DollarSign,
  Info,
} from "lucide-react";
import type { WhatsAppBillingInfo } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { toast } from "react-hot-toast";

export function BillingUsageView() {
  const [billing, setBilling] = useState<WhatsAppBillingInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    try {
      const data = await whatsappService.getBillingInfo();
      setBilling(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load billing details";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD]">
        <Clock size={24} className="mx-auto mb-2 animate-spin text-[#747A72]" />
        Checking Meta Business billing and payment status...
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="p-8 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD] space-y-3">
        <AlertCircle size={28} className="mx-auto text-[#B55B5B]" />
        <p className="font-semibold text-[#2F352F]">Unable to load billing details</p>
        <button
          type="button"
          onClick={fetchBilling}
          className="px-4 py-2 bg-[#5F7A62] text-white rounded-xl text-xs font-semibold cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
            <CreditCard size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                WhatsApp Billing & Payments
              </h2>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  billing.paymentStatus === "ACTIVE"
                    ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                    : "bg-[#FAF4E8] text-[#B18A45] border-[#F3E2B8]"
                }`}
              >
                <CheckCircle2 size={11} />
                <span>Account Status: {billing.paymentStatus}</span>
              </span>
            </div>
            <p className="text-xs text-[#747A72] mt-0.5">
              WhatsApp Business Account ID:{" "}
              <span className="font-mono font-bold text-[#2F352F]">{billing.wabaId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchBilling}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh Status</span>
          </button>

          <a
            href={billing.directBillingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#5F7A62] hover:bg-[#4E6651] text-xs font-bold text-white shadow-xs transition cursor-pointer"
          >
            <span>Open Meta WhatsApp Billing</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* Primary Balance & Payment Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Prepaid Balance / Ledger */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Prepaid Balance & Credits
            </span>
            <DollarSign size={16} className="text-[#5F7A62]" />
          </div>

          <div className="space-y-1">
            <div className="font-mono text-xl font-bold text-[#2F352F]">
              Managed via Meta
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#B18A45] bg-[#FAF4E8] px-2 py-0.5 rounded-full border border-[#EDD98A]">
              <Info size={11} />
              <span>Not exposed via Graph API</span>
            </span>
          </div>

          <p className="text-xs text-[#747A72] leading-relaxed">
            Meta WhatsApp Cloud API does not expose prepaid balances or wallet ledgers programmatically.
            Top-ups and credit limits are managed directly inside WhatsApp Manager.
          </p>

          <a
            href={billing.directBillingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5F7A62] hover:underline pt-2 block"
          >
            <span>View Balance in Meta WhatsApp Manager</span>
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Card 2: Account Currency & Review Status */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Account Settings
            </span>
            <Receipt size={16} className="text-[#5F7A62]" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs py-1 border-b border-[#E0E4DD]">
              <span className="text-[#747A72]">Currency</span>
              <span className="font-mono font-bold text-[#2F352F]">{billing.currency || "INR (₹)"}</span>
            </div>
            <div className="flex items-center justify-between text-xs py-1 border-b border-[#E0E4DD]">
              <span className="text-[#747A72]">Timezone</span>
              <span className="font-mono font-bold text-[#2F352F]">{billing.timezoneId || "Asia/Kolkata"}</span>
            </div>
            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-[#747A72]">Meta Review Status</span>
              <span className="font-mono font-bold text-[#5F7A62] flex items-center gap-1">
                <CheckCircle2 size={12} />
                {billing.accountReviewStatus || "APPROVED"}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-[#747A72]">
            Currency and billing timezone are tied to your Meta Business Portfolio.
          </p>
        </div>

        {/* Card 3: Security & Card Data Policy */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Security & Compliance
            </span>
            <ShieldCheck size={16} className="text-[#5F7A62]" />
          </div>

          <p className="font-serif text-sm font-bold text-[#2F352F]">
            Direct Meta PCI-DSS Billing
          </p>

          <p className="text-xs text-[#747A72] leading-relaxed">
            BLOW SALON ERP never collects, stores, or transmits credit card numbers or banking secrets.
            All invoices, credit lines, and tax deduction (GST) information are processed on Meta&apos;s
            secure payment infrastructure.
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

      {/* Conversation Pricing Reference Card for India / INR */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-4">
        <h3 className="font-serif text-base font-bold text-[#2F352F] flex items-center gap-2">
          <HelpCircle size={18} className="text-[#5F7A62]" />
          Understanding Meta WhatsApp Cloud API Pricing (India Market)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1">
            <span className="font-bold text-[#5F7A62] block">Utility Conversations</span>
            <p className="text-[11px] text-[#747A72]">
              Dispatched for official invoice receipts, appointment confirmations, and transaction updates.
              (e.g., <code className="font-mono">blow_salon_invoice</code>)
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1">
            <span className="font-bold text-[#B18A45] block">Marketing Conversations</span>
            <p className="text-[11px] text-[#747A72]">
              Promotions, seasonal salon offers, and loyalty announcements.
              (e.g., <code className="font-mono">blow_salon_campaign</code>)
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1">
            <span className="font-bold text-[#2F352F] block">Service (Customer-Initiated)</span>
            <p className="text-[11px] text-[#747A72]">
              Customer queries and support conversations initiated by clients sending a message to your
              WhatsApp Business number.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-[#747A72] border-t border-[#E0E4DD] pt-3">
          Meta provides 1,000 free service (customer-initiated) conversations each month per WhatsApp
          Business Account. Business-initiated templates are billed directly according to Meta WhatsApp
          rates for India (+91).
        </p>
      </div>
    </div>
  );
}
