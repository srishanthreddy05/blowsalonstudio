"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Send,
  Eye,
  RotateCcw,
  XCircle,
  Trash2,
  Copy,
  Users,
  AlertTriangle,
  Plus,
  Play,
  FileText,
  Search,
  Filter,
} from "lucide-react";
import type { WhatsAppCampaign, WhatsAppCampaignStatus } from "@/types/whatsapp";
import { formatDisplayDate } from "@/lib/utils/date";
import { normalizeCount } from "@/lib/utils/firestore";
import * as whatsappService from "@/services/whatsapp";

interface CampaignsListProps {
  campaigns: WhatsAppCampaign[];
  loading: boolean;
  onCreateNew: () => void;
  onSendTest: () => void;
  onViewCampaign: (campaign: WhatsAppCampaign) => void;
  onSendCampaign: (campaign: WhatsAppCampaign) => void;
  onCancelCampaign: (campaignId: string) => void;
  onRetryCampaign: (campaignId: string) => void;
  onDeleteCampaign: (campaignId: string) => void;
  onDuplicateCampaign?: (campaign: WhatsAppCampaign) => void;
}

export const statusConfig: Record<
  WhatsAppCampaignStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  DRAFT: {
    label: "Draft",
    bg: "bg-[#F7F7F4]",
    text: "text-[#747A72]",
    border: "border-[#E0E4DD]",
    dot: "bg-[#CCD2C8]",
  },
  QUEUED: {
    label: "Queued",
    bg: "bg-[#FAF4E8]",
    text: "text-[#B18A45]",
    border: "border-[#B18A45]/30",
    dot: "bg-[#B18A45] animate-pulse",
  },
  SENDING: {
    label: "Sending",
    bg: "bg-[#EBF3FB]",
    text: "text-[#2B6CB0]",
    border: "border-[#2B6CB0]/30",
    dot: "bg-[#2B6CB0] animate-pulse",
  },
  COMPLETED: {
    label: "Completed",
    bg: "bg-[#E8ECE5]",
    text: "text-[#5F7A62]",
    border: "border-[#5F7A62]/30",
    dot: "bg-[#5F7A62]",
  },
  COMPLETED_WITH_ERRORS: {
    label: "Completed w/ Errors",
    bg: "bg-[#FFF4E5]",
    text: "text-[#C05621]",
    border: "border-[#FBD38D]",
    dot: "bg-[#C05621]",
  },
  FAILED: {
    label: "Failed",
    bg: "bg-[#FBEBEB]",
    text: "text-[#B55B5B]",
    border: "border-[#F8D7D7]",
    dot: "bg-[#B55B5B]",
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-[#F7F7F4]",
    text: "text-[#8C9389]",
    border: "border-[#E0E4DD]",
    dot: "bg-[#8C9389]",
  },
};

const audienceLabels: Record<string, string> = {
  ALL: "All Customers",
  REGULAR: "Regular Customers (2+ visits)",
  MEMBERSHIP: "Active Members",
  CUSTOM: "Custom Selection",
};

export default function CampaignsList({
  campaigns,
  loading,
  onCreateNew,
  onSendTest,
  onViewCampaign,
  onSendCampaign,
  onCancelCampaign,
  onRetryCampaign,
  onDeleteCampaign,
  onDuplicateCampaign,
}: CampaignsListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [checkingRetryId, setCheckingRetryId] = useState<string | null>(null);
  const [restrictionConfirmModal, setRestrictionConfirmModal] = useState<{
    campaignId: string;
    count: number;
  } | null>(null);

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.templateName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleTriggerRetry = async (camp: WhatsAppCampaign) => {
    const failedCount = normalizeCount(camp.failedCount);
    if (failedCount <= 0) return;

    setCheckingRetryId(camp.id);
    try {
      // Check if any failed recipient has a Meta 131049 / restriction error
      const res = await whatsappService.getCampaignById(camp.id);
      const failedRecs = (res.recipients || []).filter((r: any) => r.status === "FAILED");
      const hasRestricted = failedRecs.some((r: any) => {
        const msg = (r.errorMessage || "").toLowerCase();
        const code = String(r.errorCode || "");
        return (
          code === "131049" ||
          msg.includes("131049") ||
          msg.includes("healthy ecosystem engagement") ||
          msg.includes("ecosystem engagement") ||
          msg.includes("marketing delivery restricted")
        );
      });

      if (hasRestricted) {
        setRestrictionConfirmModal({
          campaignId: camp.id,
          count: failedCount,
        });
      } else {
        onRetryCampaign(camp.id);
      }
    } catch {
      onRetryCampaign(camp.id);
    } finally {
      setCheckingRetryId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5F7A62]">
            <Sparkles size={14} />
            <span>Meta Approved WhatsApp Campaigns</span>
          </div>
          <h2 className="font-serif text-xl font-bold text-[#2F352F] mt-1">
            WhatsApp Campaigns
          </h2>
          <p className="text-xs text-[#747A72] mt-0.5">
            Create and send targeted WhatsApp campaigns to eligible, opted-in customers using approved templates.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onSendTest}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] px-3.5 text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
          >
            <Send size={13} className="text-[#5F7A62]" />
            <span>Send Test</span>
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2F352F] hover:bg-[#1E221E] text-[#FAF4E8] px-4 text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus size={15} />
            <span>Create Campaign</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C9389]" />
          <input
            type="text"
            placeholder="Search campaigns by name or template..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] pl-9 pr-3.5 text-xs text-[#2F352F] placeholder:text-[#8C9389] focus:outline-hidden focus:border-[#2F352F]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={13} className="text-[#8C9389]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] px-3 text-xs font-semibold text-[#2F352F] focus:outline-hidden focus:border-[#2F352F] cursor-pointer"
          >
            <option value="ALL">All Campaigns ({campaigns.length})</option>
            <option value="DRAFT">Draft</option>
            <option value="QUEUED">Queued</option>
            <option value="SENDING">Sending</option>
            <option value="COMPLETED">Completed</option>
            <option value="COMPLETED_WITH_ERRORS">Completed w/ Errors</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Campaigns Table / Cards */}
      <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-[#747A72]">
            <div className="inline-block size-6 animate-spin rounded-full border-2 border-[#5F7A62] border-t-transparent mb-2" />
            <p>Loading WhatsApp campaigns...</p>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] mx-auto">
              <FileText size={20} />
            </div>
            <div>
              <p className="font-serif text-base font-bold text-[#2F352F]">
                {searchTerm || statusFilter !== "ALL"
                  ? "No matching campaigns found"
                  : "No WhatsApp campaigns yet"}
              </p>
              <p className="text-xs text-[#747A72] mt-1 max-w-sm mx-auto">
                {searchTerm || statusFilter !== "ALL"
                  ? "Try clearing filters or search query to view all campaigns."
                  : "Create your first promotional or reminder campaign using approved Meta WhatsApp templates."}
              </p>
            </div>
            {!searchTerm && statusFilter === "ALL" && (
              <button
                type="button"
                onClick={onCreateNew}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#2F352F] hover:bg-[#1E221E] text-[#FAF4E8] px-3.5 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Plus size={14} />
                <span>Create First Campaign</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E0E4DD] bg-[#FAF4E8]/40 text-[10px] font-bold uppercase tracking-wider text-[#6F776D]">
                  <th className="py-3.5 px-4">Campaign</th>
                  <th className="py-3.5 px-4">Audience</th>
                  <th className="py-3.5 px-4">Template</th>
                  <th className="py-3.5 px-4 text-center font-extrabold" title="Total campaign recipients">
                    Recipients
                  </th>
                  <th className="py-3.5 px-4 text-center font-extrabold" title="Dispatched / accepted by Meta (X/Y)">
                    Sent
                  </th>
                  <th className="py-3.5 px-4 text-center font-extrabold" title="Delivered to customer device (X/Y)">
                    Delivered
                  </th>
                  <th className="py-3.5 px-4 text-center font-extrabold" title="Opened / read by customer (X/Y)">
                    Read
                  </th>
                  <th className="py-3.5 px-4 text-center font-extrabold" title="Delivery failure (X/Y)">
                    Failed
                  </th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD] text-xs text-[#2F352F]">
                {filteredCampaigns.map((camp) => {
                  const total = normalizeCount(camp.totalRecipients);
                  const sent = normalizeCount(camp.sentCount);
                  const delivered = normalizeCount(camp.deliveredCount);
                  const read = normalizeCount(camp.readCount);
                  const failed = normalizeCount(camp.failedCount);

                  const canSend = camp.status === "DRAFT" || camp.status === "QUEUED";
                  const canCancel = camp.status === "QUEUED" || camp.status === "SENDING";

                  return (
                    <tr key={camp.id} className="hover:bg-[#FAF4E8]/20 transition">
                      {/* Campaign Name & Created */}
                      <td className="py-3.5 px-4 font-semibold text-[#2F352F]">
                        <button
                          type="button"
                          onClick={() => onViewCampaign(camp)}
                          className="hover:underline text-left cursor-pointer group flex items-center gap-1.5"
                        >
                          <span className="font-bold text-sm text-[#2F352F] group-hover:text-[#5F7A62] transition">
                            {camp.name}
                          </span>
                          <Eye size={12} className="opacity-0 group-hover:opacity-100 text-[#5F7A62] transition" />
                        </button>
                        <span className="text-[10px] text-[#747A72] block mt-0.5">
                          Created {formatDisplayDate(camp.createdAt)}
                        </span>
                      </td>

                      {/* Audience */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F7F7F4] border border-[#CCD2C8] text-[10px] font-semibold text-[#2F352F]">
                          <Users size={10} className="text-[#5F7A62]" />
                          {audienceLabels[camp.audienceType] || camp.audienceType}
                        </span>
                      </td>

                      {/* Template */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[11px] text-[#5F7A62] bg-[#E8ECE5]/50 px-2 py-0.5 rounded border border-[#CCD2C8]">
                          {camp.templateName}
                        </span>
                      </td>

                      {/* Recipients (Total) */}
                      <td className="py-3.5 px-4 text-center font-bold text-sm text-[#2F352F]">
                        {total}
                      </td>

                      {/* Sent (X/Y) */}
                      <td className="py-3.5 px-4 text-center font-bold text-xs text-[#2B6CB0]">
                        {sent}/{total}
                      </td>

                      {/* Delivered (X/Y) */}
                      <td className="py-3.5 px-4 text-center font-bold text-xs text-[#5F7A62]">
                        {delivered}/{total}
                      </td>

                      {/* Read (X/Y) */}
                      <td className="py-3.5 px-4 text-center font-bold text-xs text-[#38503B]">
                        {read}/{total}
                      </td>

                      {/* Failed (X/Y) */}
                      <td className="py-3.5 px-4 text-center">
                        {failed > 0 ? (
                          <span className="inline-block text-[#B55B5B] font-bold text-xs bg-[#FBEBEB] px-2 py-0.5 rounded-md border border-[#F8D7D7]">
                            {failed}/{total}
                          </span>
                        ) : (
                          <span className="text-[#8C9389] font-medium text-xs">0/{total}</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Retry N Button (When Failed > 0) */}
                          {failed > 0 && (
                            <button
                              type="button"
                              title={`Retry ${failed} failed recipient${failed > 1 ? "s" : ""}`}
                              disabled={checkingRetryId === camp.id}
                              onClick={() => handleTriggerRetry(camp)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#FBD38D] bg-[#FFF4E5] hover:bg-[#FEEBC8] text-xs font-bold text-[#C05621] shadow-2xs transition cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              <RotateCcw size={12} className={checkingRetryId === camp.id ? "animate-spin" : ""} />
                              <span>Retry {failed}</span>
                            </button>
                          )}

                          {/* Send button for Draft/Queued when failed = 0 */}
                          {canSend && failed === 0 && (
                            <button
                              type="button"
                              title="Send Campaign Now"
                              onClick={() => onSendCampaign(camp)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#5F7A62] hover:bg-[#4E6651] text-[#FAF4E8] text-xs font-bold shadow-2xs transition cursor-pointer"
                            >
                              <Play size={12} />
                              <span>Send</span>
                            </button>
                          )}

                          {/* View Details */}
                          <button
                            type="button"
                            title="View Campaign Details"
                            onClick={() => onViewCampaign(camp)}
                            className="p-1.5 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#2F352F] transition cursor-pointer shadow-2xs"
                          >
                            <Eye size={13} />
                          </button>

                          {/* Cancel Queue */}
                          {canCancel && (
                            <button
                              type="button"
                              title="Cancel Queue"
                              onClick={() => onCancelCampaign(camp.id)}
                              className="p-1.5 rounded-lg border border-[#F8D7D7] bg-[#FBEBEB] hover:bg-[#F9D2D2] text-[#B55B5B] shadow-2xs transition cursor-pointer"
                            >
                              <XCircle size={13} />
                            </button>
                          )}

                          {/* Duplicate */}
                          {onDuplicateCampaign && (
                            <button
                              type="button"
                              title="Duplicate Campaign"
                              onClick={() => onDuplicateCampaign(camp)}
                              className="p-1.5 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#747A72] transition cursor-pointer shadow-2xs"
                            >
                              <Copy size={13} />
                            </button>
                          )}

                          {/* Delete */}
                          {(camp.status === "DRAFT" ||
                            camp.status === "CANCELLED" ||
                            camp.status === "COMPLETED" ||
                            camp.status === "FAILED") && (
                            <button
                              type="button"
                              title="Delete Campaign"
                              onClick={() => onDeleteCampaign(camp.id)}
                              className="p-1.5 rounded-lg border border-transparent hover:border-[#CCD2C8] hover:bg-[#FBEBEB] text-[#747A72] hover:text-[#B55B5B] transition cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 131049 Delivery Restriction Confirmation Modal */}
      {restrictionConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs transition-opacity"
            onClick={() => setRestrictionConfirmModal(null)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-[#FFF4E5] text-[#C05621] border border-[#FBD38D]">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[#2F352F]">
                  WhatsApp Delivery Restriction
                </h3>
                <p className="text-xs text-[#747A72]">Marketing Ecosystem Notice</p>
              </div>
            </div>

            <p className="text-xs text-[#2F352F] leading-relaxed bg-[#FAF4E8] p-3.5 rounded-2xl border border-[#FBD38D]/60 font-medium">
              Some recipients were previously restricted by WhatsApp&apos;s marketing delivery system. Retrying may still fail.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E0E4DD]">
              <button
                type="button"
                onClick={() => setRestrictionConfirmModal(null)}
                className="rounded-xl border border-[#CCD2C8] px-4 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = restrictionConfirmModal.campaignId;
                  setRestrictionConfirmModal(null);
                  onRetryCampaign(id);
                }}
                className="rounded-xl bg-[#C05621] hover:bg-[#9C4215] px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
              >
                Retry Failed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
