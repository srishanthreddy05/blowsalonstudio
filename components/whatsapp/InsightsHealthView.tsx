"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Send,
  CheckCircle2,
  CheckCheck,
  AlertCircle,
  Clock,
  RefreshCw,
  Gauge,
  Radio,
  ExternalLink,
  ShieldCheck,
  History,
} from "lucide-react";
import type { WhatsAppInsightsData } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { toast } from "react-hot-toast";

export function InsightsHealthView() {
  const [insights, setInsights] = useState<WhatsAppInsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const data = await whatsappService.getInsights();
      setInsights(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load WhatsApp insights";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD]">
        <Clock size={24} className="mx-auto mb-2 animate-spin text-[#747A72]" />
        Analyzing WhatsApp delivery telemetry and webhook health...
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="p-8 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD] space-y-3">
        <AlertCircle size={28} className="mx-auto text-[#B55B5B]" />
        <p className="font-semibold text-[#2F352F]">Unable to load WhatsApp insights</p>
        <button
          type="button"
          onClick={fetchInsights}
          className="px-4 py-2 bg-[#5F7A62] text-white rounded-xl text-xs font-semibold cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const { deliveryBreakdown } = insights;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
            <Activity size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                Insights & Service Health
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30">
                <span className="size-1.5 rounded-full bg-[#5F7A62]" />
                Webhook: {insights.webhookStatus}
              </span>
            </div>
            <p className="text-xs text-[#747A72] mt-0.5">
              Live delivery telemetry, quality rating, and real-time webhook status.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchInsights}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span>Refresh Insights</span>
        </button>
      </div>

      {/* Key Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sent */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
            Recent Dispatches
          </span>
          <div className="font-mono text-2xl font-bold text-[#2F352F]">
            {insights.totalSent30d}
          </div>
          <p className="text-[11px] text-[#747A72]">
            Total logged messages in recent window
          </p>
        </div>

        {/* Delivery Rate */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
            Delivery Rate
          </span>
          <div className="font-mono text-2xl font-bold text-[#5F7A62]">
            {insights.deliveredRate}%
          </div>
          <p className="text-[11px] text-[#747A72]">
            {deliveryBreakdown.delivered + deliveryBreakdown.read} delivered or read
          </p>
        </div>

        {/* Read Rate */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
            Read Rate (Blue Ticks)
          </span>
          <div className="font-mono text-2xl font-bold text-[#2F352F]">
            {insights.readRate}%
          </div>
          <p className="text-[11px] text-[#747A72]">
            {deliveryBreakdown.read} read confirmations from clients
          </p>
        </div>

        {/* Failure Rate */}
        <div className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
            Failure Rate
          </span>
          <div
            className={`font-mono text-2xl font-bold ${
              insights.failedRate > 5 ? "text-[#B55B5B]" : "text-[#2F352F]"
            }`}
          >
            {insights.failedRate}%
          </div>
          <p className="text-[11px] text-[#747A72]">
            {deliveryBreakdown.failed} delivery exceptions logged
          </p>
        </div>
      </div>

      {/* Health & Webhook Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Webhook Status Card */}
        <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
            <h3 className="font-serif text-sm font-bold text-[#2F352F] flex items-center gap-2">
              <Radio size={16} className="text-[#5F7A62]" />
              Meta Webhook Listener
            </h3>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#5F7A62] bg-[#E8ECE5] px-2 py-0.5 rounded-full border border-[#5F7A62]/30">
              <CheckCircle2 size={11} />
              Live Endpoint
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                Subscribed Callback URL
              </span>
              <span className="font-mono text-[11px] text-[#2F352F] select-all block break-all">
                https://blowsalonstudio.vercel.app/api/whatsapp/webhook
              </span>
            </div>

            <div className="flex items-center justify-between text-[#747A72] pt-1">
              <span>Last Delivery Receipt Webhook:</span>
              <span className="font-mono font-bold text-[#2F352F]">
                {insights.lastWebhookEvent
                  ? new Date(insights.lastWebhookEvent).toLocaleTimeString()
                  : "Standby (No recent receipts)"}
              </span>
            </div>
          </div>
        </div>

        {/* Messaging Tier & Quality Card */}
        <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
            <h3 className="font-serif text-sm font-bold text-[#2F352F] flex items-center gap-2">
              <Gauge size={16} className="text-[#5F7A62]" />
              Account Quality & Limit Tier
            </h3>
            <span className="text-xs font-mono font-bold text-[#5F7A62]">
              {insights.phoneQuality} Quality
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-[#E0E4DD]">
              <span className="text-[#747A72]">Current Messaging Tier:</span>
              <span className="font-mono font-bold text-[#2F352F]">
                {insights.messagingLimitTier}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[#E0E4DD]">
              <span className="text-[#747A72]">Unsent Rate:</span>
              <span className="font-mono font-bold text-[#2F352F]">
                {deliveryBreakdown.sent} pending confirmations
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[#747A72]">Meta Graph Status:</span>
              <span className="font-mono font-bold text-[#5F7A62] flex items-center gap-1">
                <ShieldCheck size={13} />
                Operational
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Delivery Events Telemetry Stream */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-4">
        <h3 className="font-serif text-base font-bold text-[#2F352F] flex items-center gap-2 border-b border-[#E0E4DD] pb-3">
          <History size={16} className="text-[#5F7A62]" />
          Recent Delivery Telemetry Events
        </h3>

        {insights.recentEvents.length === 0 ? (
          <p className="text-xs text-[#747A72] text-center py-4">
            No recent message dispatches recorded.
          </p>
        ) : (
          <div className="divide-y divide-[#E0E4DD] text-xs">
            {insights.recentEvents.map((evt) => (
              <div key={evt.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`size-2 rounded-full ${
                      evt.status === "DELIVERED" || evt.status === "READ"
                        ? "bg-[#5F7A62]"
                        : evt.status === "FAILED"
                        ? "bg-[#B55B5B]"
                        : "bg-[#B18A45]"
                    }`}
                  />
                  <div>
                    <span className="font-semibold text-[#2F352F]">{evt.recipient}</span>
                    <span className="text-[10px] text-[#747A72] ml-2 font-mono">
                      {evt.type.replace("_", " ")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      evt.status === "DELIVERED" || evt.status === "READ"
                        ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                        : evt.status === "FAILED"
                        ? "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                        : "bg-[#FAF4E8] text-[#B18A45] border-[#F3E2B8]"
                    }`}
                  >
                    {evt.status}
                  </span>
                  <span className="text-[11px] text-[#747A72] font-mono">
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
