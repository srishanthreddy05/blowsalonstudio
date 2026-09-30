"use client";

import React, { useState } from "react";
import {
  X,
  Sparkles,
  Users,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  XCircle,
  Play,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCheck,
} from "lucide-react";
import type { WhatsAppCampaign, WhatsAppCampaignRecipient } from "@/types/whatsapp";
import { statusConfig } from "./CampaignsList";
import { formatDisplayDate } from "@/lib/utils/date";
import { normalizeCount } from "@/lib/utils/firestore";

interface CampaignDetailModalProps {
  campaign: WhatsAppCampaign;
  recipients: WhatsAppCampaignRecipient[];
  loadingRecipients: boolean;
  onClose: () => void;
  onSendCampaign: (campaign: WhatsAppCampaign) => void;
  onCancelCampaign: (campaignId: string) => void;
  onRetryCampaign: (campaignId: string) => void;
  onToggleCustomerOptOut: (customerId: string, optOut: boolean) => Promise<void>;
}

const recipientStatusBadges: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  PENDING: {
    label: "Pending",
    bg: "bg-[#F7F7F4]",
    text: "text-[#747A72]",
    border: "border-[#E0E4DD]",
  },
  SENT: {
    label: "Sent",
    bg: "bg-[#EBF3FB]",
    text: "text-[#2B6CB0]",
    border: "border-[#2B6CB0]/30",
  },
  DELIVERED: {
    label: "Delivered",
    bg: "bg-[#E8ECE5]",
    text: "text-[#5F7A62]",
    border: "border-[#5F7A62]/30",
  },
  READ: {
    label: "Read",
    bg: "bg-[#E8ECE5]",
    text: "text-[#38503B]",
    border: "border-[#38503B]/30",
  },
  FAILED: {
    label: "Failed",
    bg: "bg-[#FBEBEB]",
    text: "text-[#B55B5B]",
    border: "border-[#F8D7D7]",
  },
  EXCLUDED: {
    label: "Excluded",
    bg: "bg-[#FAF4E8]",
    text: "text-[#B18A45]",
    border: "border-[#B18A45]/30",
  },
};

export default function CampaignDetailModal({
  campaign,
  recipients,
  loadingRecipients,
  onClose,
  onSendCampaign,
  onCancelCampaign,
  onRetryCampaign,
  onToggleCustomerOptOut,
}: CampaignDetailModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const pill = statusConfig[campaign.status] || statusConfig.DRAFT;
  const canSend = campaign.status === "DRAFT" || campaign.status === "QUEUED";
  const canCancel = campaign.status === "QUEUED" || campaign.status === "SENDING";
  const canRetry =
    campaign.failedCount > 0 &&
    (campaign.status === "COMPLETED_WITH_ERRORS" || campaign.status === "FAILED");

  const filteredRecipients = recipients.filter((r) => {
    const matchesSearch =
      (r.customerName?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      r.phone.includes(searchTerm) ||
      (r.metaMessageId?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOptOutClick = async (r: WhatsAppCampaignRecipient) => {
    if (!r.customerId) return;
    const isCurrentlyOptedOut = r.status === "EXCLUDED";
    const confirmMsg = isCurrentlyOptedOut
      ? `Re-enable WhatsApp marketing communications for ${r.customerName || r.phone}?`
      : `Opt out ${r.customerName || r.phone} from all future WhatsApp marketing campaigns?`;

    if (!window.confirm(confirmMsg)) return;

    setActionInProgress(r.id);
    try {
      await onToggleCustomerOptOut(r.customerId, !isCurrentlyOptedOut);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2F352F]/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xl overflow-hidden my-8 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E0E4DD] bg-[#FAF4E8]/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-lg font-bold text-[#2F352F]">
                  {campaign.name}
                </h3>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${pill.bg} ${pill.text} ${pill.border}`}
                >
                  <span className={`size-1.5 rounded-full ${pill.dot}`} />
                  {pill.label}
                </span>
              </div>
              <p className="text-xs text-[#747A72]">
                Template: <span className="font-mono text-[#5F7A62]">{campaign.templateName}</span> ({campaign.templateLanguage}) • Created {formatDisplayDate(campaign.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canSend && (
              <button
                type="button"
                onClick={() => onSendCampaign(campaign)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#5F7A62] hover:bg-[#4E6651] text-[#FAF4E8] px-3.5 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Play size={13} />
                <span>Send Campaign</span>
              </button>
            )}

            {canRetry && (
              <button
                type="button"
                onClick={() => onRetryCampaign(campaign.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#FBD38D] bg-[#FFF4E5] hover:bg-[#FEEBC8] text-[#C05621] px-3 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Retry Failed</span>
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() => onCancelCampaign(campaign.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#F8D7D7] bg-[#FBEBEB] hover:bg-[#F9D2D2] text-[#B55B5B] px-3 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <XCircle size={13} />
                <span>Cancel Queue</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#747A72] transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Metrics Overview Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {/* Total Recipients */}
            <div className="p-3.5 rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                Total
              </div>
              <div className="text-xl font-bold text-[#2F352F] mt-1">
                {normalizeCount(campaign.totalRecipients)}
              </div>
              <div className="text-[10px] text-[#8C9389]">Audience pool</div>
            </div>

            {/* Sent */}
            <div className="p-3.5 rounded-2xl border border-[#EBF3FB] bg-[#EBF3FB]/50">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2B6CB0]">
                Sent
              </div>
              <div className="text-xl font-bold text-[#2B6CB0] mt-1">
                {normalizeCount(campaign.sentCount)}
              </div>
              <div className="text-[10px] text-[#2B6CB0]/80">Dispatched to Meta</div>
            </div>

            {/* Delivered */}
            <div className="p-3.5 rounded-2xl border border-[#E8ECE5] bg-[#E8ECE5]/50">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#5F7A62]">
                Delivered
              </div>
              <div className="text-xl font-bold text-[#5F7A62] mt-1">
                {normalizeCount(campaign.deliveredCount)}
              </div>
              <div className="text-[10px] text-[#5F7A62]/80">Device received</div>
            </div>

            {/* Read */}
            <div className="p-3.5 rounded-2xl border border-[#E8ECE5] bg-[#E8ECE5]/80">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#38503B]">
                Read
              </div>
              <div className="text-xl font-bold text-[#38503B] mt-1">
                {normalizeCount(campaign.readCount)}
              </div>
              <div className="text-[10px] text-[#38503B]/80">Opened by user</div>
            </div>

            {/* Failed */}
            <div className="p-3.5 rounded-2xl border border-[#F8D7D7] bg-[#FBEBEB]/50">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#B55B5B]">
                Failed
              </div>
              <div className="text-xl font-bold text-[#B55B5B] mt-1">
                {normalizeCount(campaign.failedCount)}
              </div>
              <div className="text-[10px] text-[#B55B5B]/80">Meta API error</div>
            </div>

            {/* Excluded */}
            <div className="p-3.5 rounded-2xl border border-[#FAF4E8] bg-[#FAF4E8]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#B18A45]">
                Excluded
              </div>
              <div className="text-xl font-bold text-[#B18A45] mt-1">
                {normalizeCount(campaign.excludedCount)}
              </div>
              <div className="text-[10px] text-[#B18A45]/80">Opt-out/invalid</div>
            </div>
          </div>

          {/* Recipient Filter & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div>
              <h4 className="font-serif text-sm font-bold text-[#2F352F]">
                Recipient Delivery Log ({recipients.length})
              </h4>
              <p className="text-[11px] text-[#747A72]">
                Detailed status and delivery audit for every contact in this campaign
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C9389]" />
                <input
                  type="text"
                  placeholder="Filter name or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8.5 w-full rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] pl-8 pr-3 text-xs text-[#2F352F] placeholder:text-[#8C9389] focus:outline-hidden focus:border-[#2F352F]"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] px-2.5 text-xs font-semibold text-[#2F352F] focus:outline-hidden focus:border-[#2F352F] cursor-pointer"
              >
                <option value="ALL">All Recipient Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="SENT">Sent</option>
                <option value="DELIVERED">Delivered</option>
                <option value="READ">Read</option>
                <option value="FAILED">Failed</option>
                <option value="EXCLUDED">Excluded</option>
              </select>
            </div>
          </div>

          {/* Recipient Table */}
          <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] overflow-hidden">
            {loadingRecipients ? (
              <div className="p-8 text-center text-xs text-[#747A72]">
                <div className="inline-block size-5 animate-spin rounded-full border-2 border-[#5F7A62] border-t-transparent mb-2" />
                <p>Loading recipient delivery log...</p>
              </div>
            ) : filteredRecipients.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#747A72]">
                No recipients match the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#FAF4E8]/90 backdrop-blur-xs z-10 border-b border-[#E0E4DD] text-[10px] font-bold uppercase tracking-wider text-[#6F776D]">
                    <tr>
                      <th className="py-2.5 px-3.5">Customer</th>
                      <th className="py-2.5 px-3.5">Phone Number</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5">Meta Message ID</th>
                      <th className="py-2.5 px-3.5">Sent / Delivered At</th>
                      <th className="py-2.5 px-3.5 text-right">Opt-Out Consent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E4DD] text-xs text-[#2F352F]">
                    {filteredRecipients.map((r) => {
                      const badge = recipientStatusBadges[r.status] || recipientStatusBadges.PENDING;
                      return (
                        <tr key={r.id} className="hover:bg-[#FAF4E8]/20 transition">
                          <td className="py-2.5 px-3.5 font-semibold">
                            {r.customerName || "Customer"}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#747A72]">
                            {r.phone}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badge.bg} ${badge.text} ${badge.border}`}
                              >
                                {r.status === "READ" && <CheckCheck size={10} />}
                                {badge.label}
                              </span>
                              {r.errorMessage && (
                                <p className="text-[10px] text-[#B55B5B] mt-0.5 max-w-xs truncate" title={r.errorMessage}>
                                  {r.errorMessage}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-[10px] text-[#747A72]">
                            {r.metaMessageId ? r.metaMessageId.slice(0, 16) + "..." : "—"}
                          </td>
                          <td className="py-2.5 px-3.5 text-[11px] text-[#747A72]">
                            {r.readAt
                              ? `Read: ${formatDisplayDate(r.readAt)}`
                              : r.deliveredAt
                              ? `Delivered: ${formatDisplayDate(r.deliveredAt)}`
                              : r.sentAt
                              ? `Sent: ${formatDisplayDate(r.sentAt)}`
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3.5 text-right">
                            {r.customerId && (
                              <button
                                type="button"
                                disabled={actionInProgress === r.id}
                                onClick={() => handleOptOutClick(r)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[10px] font-semibold text-[#747A72] hover:text-[#B55B5B] transition cursor-pointer disabled:opacity-50"
                              >
                                {r.status === "EXCLUDED" ? (
                                  <>
                                    <ShieldCheck size={11} className="text-[#5F7A62]" />
                                    <span>Re-Opt In</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldAlert size={11} className="text-[#B55B5B]" />
                                    <span>Opt Out</span>
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-[#E0E4DD] bg-[#FAF4E8]/30 px-6 py-3.5 text-xs text-[#747A72]">
          <div>
            Meta Cloud API Provider • Rate-limited batch processing (safe sending)
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
