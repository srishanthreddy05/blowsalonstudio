"use client";

import React, { useState, useEffect } from "react";
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  X,
  Clock,
  Sparkles,
  HelpCircle,
  Loader2,
  ShieldAlert,
  Send,
  AlertCircle,
} from "lucide-react";
import type { WhatsAppCampaign } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { WHATSAPP_APPLICATION_RATES } from "@/lib/whatsapp/pricingConfig";
import { toast } from "react-hot-toast";

interface CampaignRetryModalProps {
  isOpen: boolean;
  campaign: WhatsAppCampaign;
  whatsappEnabled?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CampaignRetryModal({
  isOpen,
  campaign,
  whatsappEnabled = true,
  onClose,
  onSuccess,
}: CampaignRetryModalProps) {
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<{
    totalFailed: number;
    retryEligibleCount: number;
    nonRetryableCount: number;
    coolingCount: number;
    maxCooldownRemainingMinutes: number;
    rate: number;
    estimatedCharge: number;
    breakdown: Record<string, number>;
    recipients: Array<{
      id: string;
      customerName: string;
      phone: string;
      retryCount: number;
      eligible: boolean;
      classification: string;
      reason: string;
      actionAdvice: string;
      isCooling: boolean;
      coolingMinutesRemaining: number;
    }>;
  } | null>(null);

  const [bypassDelay, setBypassDelay] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<{
    retriedCount: number;
    retriedSuccessCount: number;
    retriedFailedCount: number;
    applicationCharges: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setEligibility(null);
      setRetryResult(null);
      setBypassDelay(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    whatsappService
      .getCampaignRetryEligibility(campaign.id)
      .then((data) => {
        if (isMounted) {
          setEligibility(data);
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load retry eligibility";
        toast.error(msg);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, campaign.id]);

  if (!isOpen) return null;

  const handleConfirmRetry = async () => {
    if (!whatsappEnabled) {
      toast.error("WhatsApp messaging is currently paused.");
      return;
    }

    setIsRetrying(true);
    try {
      const res = await whatsappService.retryCampaign(campaign.id, {
        bypassDelay,
      });

      setRetryResult({
        retriedCount: res.retriedCount || 0,
        retriedSuccessCount: res.retriedSuccessCount || 0,
        retriedFailedCount: res.retriedFailedCount || 0,
        applicationCharges: res.applicationCharges || 0,
      });

      toast.success(res.message || "Failed recipients retry completed.");
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to retry campaign recipients";
      toast.error(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#292D29]/50 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl z-10 animate-in zoom-in-95 duration-200 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E0E4DD] pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#FFF4E5] border border-[#FBD38D] text-[#C05621]">
              <RotateCcw size={20} />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#2F352F]">
                Retry Failed Recipients
              </h3>
              <p className="text-xs text-[#747A72]">
                Campaign: <strong className="text-[#2F352F]">{campaign.name}</strong> • Total Pool: {campaign.totalRecipients}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#747A72] transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-12 text-center text-xs text-[#747A72] space-y-2">
            <Loader2 size={24} className="mx-auto animate-spin text-[#C05621]" />
            <p className="font-semibold text-[#2F352F]">Evaluating failure reasons & retry eligibility...</p>
            <p className="text-[11px]">Checking Meta delivery statuses and permanent invalid recipient numbers</p>
          </div>
        )}

        {/* Retry Completed View */}
        {retryResult && (
          <div className="space-y-4 py-2 animate-in fade-in">
            <div className="p-4 rounded-2xl bg-[#E8ECE5]/50 border border-[#5F7A62]/30 flex items-start gap-3">
              <CheckCircle2 size={20} className="text-[#5F7A62] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#2F352F]">Retry Batch Dispatched Successfully</p>
                <p className="text-xs text-[#5F7A62]">
                  Recipients retried: <strong>{retryResult.retriedCount}</strong> • Accepted by Meta:{" "}
                  <strong>{retryResult.retriedSuccessCount}</strong> • Failed:{" "}
                  <strong>{retryResult.retriedFailedCount}</strong>
                </p>
                <p className="text-[11px] text-[#747A72]">
                  Applicable application usage charges: <strong>₹{retryResult.applicationCharges.toFixed(2)}</strong> (₹{WHATSAPP_APPLICATION_RATES.MARKETING.toFixed(2)} / marketing message).
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-[#5F7A62] text-white text-xs font-bold shadow-xs hover:bg-[#4E6651] transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Body (Before execution) */}
        {!loading && !retryResult && eligibility && (
          <div className="space-y-5">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#FBEBEB]/60 border border-[#F8D7D7] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B55B5B]">
                  Confirmed Failed
                </span>
                <div className="font-serif text-xl font-bold text-[#B55B5B]">
                  {eligibility.totalFailed}
                </div>
                <p className="text-[10px] text-[#747A72]">Total failed in campaign</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#E8ECE5]/50 border border-[#5F7A62]/30 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5F7A62]">
                  Eligible for Retry
                </span>
                <div className="font-serif text-xl font-bold text-[#5F7A62]">
                  {eligibility.retryEligibleCount}
                </div>
                <p className="text-[10px] text-[#5F7A62]">Transient / retryable</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FAF4E8] border border-[#EDD98A] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B18A45]">
                  Est. Usage Charge
                </span>
                <div className="font-serif text-xl font-bold text-[#8C6B1B]">
                  ₹{eligibility.estimatedCharge.toFixed(2)}
                </div>
                <p className="text-[10px] text-[#8C6B1B]">₹{WHATSAPP_APPLICATION_RATES.MARKETING.toFixed(2)} / message</p>
              </div>
            </div>

            {/* Non-retryable notice if any */}
            {eligibility.nonRetryableCount > 0 && (
              <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#CCD2C8] flex items-start gap-2.5 text-xs text-[#2F352F]">
                <ShieldAlert size={16} className="text-[#B18A45] shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] space-y-1">
                  <p className="font-bold text-[#2F352F]">
                    {eligibility.nonRetryableCount} recipient(s) are excluded from automatic retry:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[#747A72]">
                    {eligibility.breakdown.invalid_number > 0 && (
                      <li>{eligibility.breakdown.invalid_number} invalid phone number(s) or not on WhatsApp</li>
                    )}
                    {eligibility.breakdown.customer_opt_out > 0 && (
                      <li>{eligibility.breakdown.customer_opt_out} customer(s) opted out of marketing communications</li>
                    )}
                    {eligibility.breakdown.max_retries_exceeded > 0 && (
                      <li>{eligibility.breakdown.max_retries_exceeded} recipient(s) reached maximum automatic retries (2/2)</li>
                    )}
                    {eligibility.breakdown.template_error > 0 && (
                      <li>{eligibility.breakdown.template_error} template parameter mismatch(es)</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {/* 5-minute Cooling Period Notice */}
            {eligibility.coolingCount > 0 && (
              <div className="p-3.5 rounded-2xl bg-[#FFF8E6] border border-[#F3E2B8] flex items-start gap-2.5 text-xs text-[#7A5C0A]">
                <Clock size={16} className="text-[#A67514] shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1 text-[11px]">
                  <p className="font-bold text-[#7A5C0A]">
                    5-Minute Meta Cooling Advisory ({eligibility.maxCooldownRemainingMinutes} min remaining)
                  </p>
                  <p className="text-[#8A6B1A] leading-relaxed">
                    Meta WhatsApp enforces a temporary cooldown for recently rejected messages. Waiting the standard 5 minutes helps ensure successful delivery.
                  </p>
                  <label className="flex items-center gap-2 pt-1 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bypassDelay}
                      onChange={(e) => setBypassDelay(e.target.checked)}
                      className="rounded border-[#CCD2C8] text-[#5F7A62] focus:ring-[#5F7A62]"
                    />
                    <span>Bypass recommended 5-minute delay and retry immediately</span>
                  </label>
                </div>
              </div>
            )}

            {/* Recipient Preview Table */}
            <div className="border border-[#E0E4DD] rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#FAF4E8]/50 text-[10px] font-bold uppercase tracking-wider text-[#6F776D] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Recipient</th>
                    <th className="py-2.5 px-3">Attempts</th>
                    <th className="py-2.5 px-3">Classification</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E4DD]">
                  {eligibility.recipients.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F7F7F4] text-[11px]">
                      <td className="py-2 px-3 font-medium text-[#2F352F]">
                        {r.customerName} <span className="font-mono text-[#747A72]">({r.phone})</span>
                      </td>
                      <td className="py-2 px-3 font-mono">{r.retryCount}/2</td>
                      <td className="py-2 px-3 text-[#747A72] truncate max-w-[200px]" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {r.eligible ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[#E8ECE5] text-[#5F7A62]">
                            Eligible
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[#FBEBEB] text-[#B55B5B]">
                            Excluded
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#E0E4DD]">
              <p className="text-[11px] text-[#747A72]">
                Application charge: <strong>₹{eligibility.estimatedCharge.toFixed(2)}</strong> for {eligibility.retryEligibleCount} message(s)
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isRetrying}
                  onClick={onClose}
                  className="rounded-xl border border-[#CCD2C8] px-4 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    isRetrying ||
                    eligibility.retryEligibleCount === 0 ||
                    !whatsappEnabled ||
                    (eligibility.coolingCount > 0 && !bypassDelay)
                  }
                  onClick={handleConfirmRetry}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#C05621] hover:bg-[#A84517] px-5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Retrying {eligibility.retryEligibleCount}...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw size={13} />
                      <span>Retry Failed ({eligibility.retryEligibleCount})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
