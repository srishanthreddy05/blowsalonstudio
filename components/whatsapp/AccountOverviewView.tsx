"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Gauge,
  Activity,
  AlertTriangle,
  Building,
} from "lucide-react";
import type { WhatsAppAccountOverview } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { toast } from "react-hot-toast";

export function AccountOverviewView() {
  const [overview, setOverview] = useState<WhatsAppAccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await whatsappService.getAccountOverview();
      setOverview(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load account overview";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(label);
    toast.success(`Copied ${label}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD]">
        <Clock size={24} className="mx-auto mb-2 animate-spin text-[#747A72]" />
        Loading live WhatsApp account data from Meta Graph API...
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-8 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD] space-y-3">
        <AlertCircle size={28} className="mx-auto text-[#B55B5B]" />
        <p className="font-semibold text-[#2F352F]">Unable to load WhatsApp account overview</p>
        <button
          type="button"
          onClick={fetchOverview}
          className="px-4 py-2 bg-[#5F7A62] text-white rounded-xl text-xs font-semibold cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const isConnected = overview.connected && overview.status === "CONNECTED";
  const qualityRating = overview.qualityRating?.toUpperCase() || "UNKNOWN";
  const limitTier = overview.messagingLimitTier || "TIER_250";

  // Friendly description for messaging limits
  const tierDescriptionMap: Record<string, string> = {
    TIER_250: "250 business-initiated conversations / 24 hrs",
    TIER_1K: "1,000 business-initiated conversations / 24 hrs",
    TIER_10K: "10,000 business-initiated conversations / 24 hrs",
    TIER_100K: "100,000 business-initiated conversations / 24 hrs",
    TIER_UNLIMITED: "Unlimited business-initiated conversations",
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Banner: Connection & Refresh Header */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
            <Smartphone size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                {overview.verifiedName || "BLOW SALON"}
              </h2>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  isConnected
                    ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                    : "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    isConnected ? "bg-[#5F7A62]" : "bg-[#B55B5B]"
                  }`}
                />
                {isConnected ? "Coexistence Active" : "Disconnected"}
              </span>
            </div>
            <p className="font-mono text-xs font-semibold text-[#5F7A62] mt-0.5">
              {overview.businessPhoneNumber || "+91 97049 98026"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase tracking-wider text-[#747A72] block font-semibold">
              Last Synced
            </span>
            <span className="text-[11px] font-mono text-[#2F352F]">
              {overview.lastSync ? new Date(overview.lastSync).toLocaleTimeString() : "Just now"}
            </span>
          </div>

          <button
            type="button"
            onClick={fetchOverview}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync from Meta</span>
          </button>
        </div>
      </div>

      {/* Meta API Diagnostic / Permission Warnings if any */}
      {overview.errors && overview.errors.length > 0 && (
        <div className="p-5 rounded-3xl bg-[#FAF4E8] border border-[#F3E2B8] space-y-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-[#B18A45] shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h3 className="text-xs font-bold text-[#7A5C0A]">
                Meta Graph API Account Diagnostic Notice
              </h3>
              {overview.errors.map((err, idx) => (
                <div
                  key={idx}
                  className="bg-[#FFFDF7] p-3 rounded-2xl border border-[#EDD98A] text-xs space-y-1 text-[#5C4A0A]"
                >
                  <p className="font-semibold flex items-center justify-between">
                    <span>Scope: {err.scope}</span>
                    {err.code && <span className="font-mono text-[10px]">Code: #{err.code}</span>}
                  </p>
                  <p className="text-[11px] text-[#7A5C0A] leading-relaxed">{err.message}</p>
                  <p className="text-[11px] font-medium text-[#2F352F] pt-1 border-t border-[#EDD98A]">
                    👉 <strong>Resolution:</strong> {err.actionableAdvice}
                  </p>
                </div>
              ))}
              <div className="pt-1">
                <a
                  href="https://business.facebook.com/settings/system-users"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7A5C0A] hover:underline"
                >
                  <span>Open Meta Business Manager System Users</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quality Rating */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Account Quality
            </span>
            <Activity size={16} className="text-[#5F7A62]" />
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 rounded-full ${
                qualityRating === "GREEN"
                  ? "bg-[#5F7A62]"
                  : qualityRating === "YELLOW"
                  ? "bg-[#B18A45]"
                  : qualityRating === "RED"
                  ? "bg-[#B55B5B]"
                  : "bg-[#747A72]"
              }`}
            />
            <span className="font-serif text-lg font-bold text-[#2F352F]">
              {qualityRating === "GREEN"
                ? "High (Green)"
                : qualityRating === "YELLOW"
                ? "Medium (Yellow)"
                : qualityRating === "RED"
                ? "Low (Red)"
                : "Active (Standard)"}
            </span>
          </div>
          <p className="text-[11px] text-[#747A72]">
            Based on customer feedback and message opt-out frequency.
          </p>
        </div>

        {/* Messaging Limit Tier */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Messaging Limit Tier
            </span>
            <Gauge size={16} className="text-[#5F7A62]" />
          </div>
          <p className="font-serif text-lg font-bold text-[#2F352F]">
            {limitTier.replace("TIER_", "")} / 24h
          </p>
          <p className="text-[11px] text-[#747A72]">
            {tierDescriptionMap[limitTier] || "250 conversations / 24h"}
          </p>
        </div>

        {/* Code Verification Status */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Coexistence Pairing
            </span>
            <ShieldCheck size={16} className="text-[#5F7A62]" />
          </div>
          <p className="font-serif text-lg font-bold text-[#2F352F] flex items-center gap-1.5">
            <CheckCircle2 size={16} className="text-[#5F7A62]" />
            Active
          </p>
          <p className="text-[11px] text-[#747A72]">
            Synchronized with WhatsApp Business mobile app.
          </p>
        </div>

        {/* Platform Type */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
              Graph API Version
            </span>
            <Layers size={16} className="text-[#5F7A62]" />
          </div>
          <p className="font-serif text-lg font-bold text-[#2F352F]">
            v21.0 Cloud API
          </p>
          <p className="text-[11px] text-[#747A72]">
            Official Meta Cloud Infrastructure.
          </p>
        </div>
      </div>

      {/* Account IDs & WABA Details Card */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-4">
        <h3 className="font-serif text-base font-bold text-[#2F352F] flex items-center gap-2 border-b border-[#E0E4DD] pb-3">
          <Building size={18} className="text-[#5F7A62]" />
          Connected Meta Business Identifiers
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Phone Number ID */}
          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                Phone Number ID (Coexistence)
              </span>
              <button
                type="button"
                onClick={() =>
                  overview.phoneNumberId &&
                  copyToClipboard(overview.phoneNumberId, "Phone Number ID")
                }
                className="text-xs text-[#5F7A62] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedId === "Phone Number ID" ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedId === "Phone Number ID" ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <p className="font-mono text-sm font-bold text-[#2F352F] select-all">
              {overview.phoneNumberId || "Not Available"}
            </p>
            <p className="text-[10px] text-[#747A72]">
              Destination endpoint used for all outbound customer receipts & marketing dispatches.
            </p>
          </div>

          {/* WABA ID */}
          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                WhatsApp Business Account (WABA) ID
              </span>
              <button
                type="button"
                onClick={() => overview.wabaId && copyToClipboard(overview.wabaId, "WABA ID")}
                className="text-xs text-[#5F7A62] hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copiedId === "WABA ID" ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedId === "WABA ID" ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <p className="font-mono text-sm font-bold text-[#2F352F] select-all">
              {overview.wabaId || "Not Available"}
            </p>
            <p className="text-[10px] text-[#747A72]">
              Parent WhatsApp Business Account holding templates and messaging authorizations.
            </p>
          </div>
        </div>

        {/* WABA Extended Properties if available */}
        {overview.waba && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                Billing Currency
              </span>
              <span className="font-mono text-xs font-bold text-[#2F352F]">
                {overview.waba.currency || "INR"}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                Timezone
              </span>
              <span className="font-mono text-xs font-bold text-[#2F352F]">
                {overview.waba.timezoneId || "Asia/Kolkata"}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                Account Review
              </span>
              <span className="font-mono text-xs font-bold text-[#5F7A62] flex items-center gap-1">
                <CheckCircle2 size={13} />
                {overview.waba.accountReviewStatus || "APPROVED"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
