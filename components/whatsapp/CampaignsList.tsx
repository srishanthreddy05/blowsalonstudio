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
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Plus,
  Play,
  FileText,
  Search,
  Filter,
} from "lucide-react";
import type { WhatsAppCampaign, WhatsAppCampaignStatus } from "@/types/whatsapp";
import { formatDisplayDate } from "@/lib/utils/date";
import { normalizeCount } from "@/lib/utils/firestore";

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

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.templateName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
            <option value="ALL">All Statuses ({campaigns.length})</option>
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
                  <th className="py-3.5 px-4">Campaign Name</th>
                  <th className="py-3.5 px-4">Audience</th>
                  <th className="py-3.5 px-4">Template</th>
                  <th className="py-3.5 px-4 text-center">Recipients</th>
                  <th className="py-3.5 px-4 text-center">Sent</th>
                  <th className="py-3.5 px-4 text-center">Delivered</th>
                  <th className="py-3.5 px-4 text-center">Failed</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD] text-xs text-[#2F352F]">
                {filteredCampaigns.map((camp) => {
                  const pill = statusConfig[camp.status] || statusConfig.DRAFT;
                  const canSend = camp.status === "DRAFT" || camp.status === "QUEUED";
                  const canCancel = camp.status === "QUEUED" || camp.status === "SENDING";
                  const failedCountNum = normalizeCount(camp.failedCount);
                  const canRetry =
                    failedCountNum > 0 &&
                    (camp.status === "COMPLETED_WITH_ERRORS" || camp.status === "FAILED");

                  return (
                    <tr key={camp.id} className="hover:bg-[#FAF4E8]/20 transition">
                      {/* Name */}
                      <td className="py-3.5 px-4 font-semibold text-[#2F352F]">
                        <button
                          type="button"
                          onClick={() => onViewCampaign(camp)}
                          className="hover:underline text-left cursor-pointer group flex items-center gap-1.5"
                        >
                          <span>{camp.name}</span>
                          <Eye size={12} className="opacity-0 group-hover:opacity-100 text-[#5F7A62] transition" />
                        </button>
                      </td>

                      {/* Audience */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#F7F7F4] border border-[#CCD2C8] text-[11px] font-medium text-[#2F352F]">
                          <Users size={11} className="text-[#5F7A62]" />
                          {audienceLabels[camp.audienceType] || camp.audienceType}
                        </span>
                      </td>

                      {/* Template */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-[11px] text-[#5F7A62] bg-[#E8ECE5]/50 px-2 py-0.5 rounded border border-[#CCD2C8]">
                          {camp.templateName}
                        </span>
                      </td>

                      {/* Recipients */}
                      <td className="py-3.5 px-4 text-center font-semibold">
                        {normalizeCount(camp.totalRecipients)}
                      </td>

                      {/* Sent */}
                      <td className="py-3.5 px-4 text-center text-[#5F7A62] font-semibold">
                        {normalizeCount(camp.sentCount)}
                      </td>

                      {/* Delivered */}
                      <td className="py-3.5 px-4 text-center text-[#2B6CB0] font-semibold">
                        {normalizeCount(camp.deliveredCount)}
                      </td>

                      {/* Failed */}
                      <td className="py-3.5 px-4 text-center">
                        {failedCountNum > 0 ? (
                          <span className="text-[#B55B5B] font-bold">{failedCountNum}</span>
                        ) : (
                          <span className="text-[#8C9389]">0</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${pill.bg} ${pill.text} ${pill.border}`}
                        >
                          <span className={`size-1.5 rounded-full ${pill.dot}`} />
                          {pill.label}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-4 text-[#747A72] text-[11px] whitespace-nowrap">
                        {formatDisplayDate(camp.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View */}
                          <button
                            type="button"
                            title="View Details"
                            onClick={() => onViewCampaign(camp)}
                            className="p-1.5 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#2F352F] transition cursor-pointer"
                          >
                            <Eye size={13} />
                          </button>

                          {/* Send */}
                          {canSend && (
                            <button
                              type="button"
                              title="Send Campaign Now"
                              onClick={() => onSendCampaign(camp)}
                              className="p-1.5 rounded-lg bg-[#5F7A62] hover:bg-[#4E6651] text-[#FAF4E8] shadow-xs transition cursor-pointer"
                            >
                              <Play size={13} />
                            </button>
                          )}

                          {/* Retry Failed */}
                          {canRetry && (
                            <button
                              type="button"
                              title="Retry Failed Recipients"
                              onClick={() => onRetryCampaign(camp.id)}
                              className="p-1.5 rounded-lg border border-[#FBD38D] bg-[#FFF4E5] hover:bg-[#FEEBC8] text-[#C05621] shadow-xs transition cursor-pointer"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}

                          {/* Cancel */}
                          {canCancel && (
                            <button
                              type="button"
                              title="Cancel Queue"
                              onClick={() => onCancelCampaign(camp.id)}
                              className="p-1.5 rounded-lg border border-[#F8D7D7] bg-[#FBEBEB] hover:bg-[#F9D2D2] text-[#B55B5B] shadow-xs transition cursor-pointer"
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
                              className="p-1.5 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#747A72] transition cursor-pointer"
                            >
                              <Copy size={13} />
                            </button>
                          )}

                          {/* Delete (only Draft or Completed/Cancelled) */}
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
    </div>
  );
}
