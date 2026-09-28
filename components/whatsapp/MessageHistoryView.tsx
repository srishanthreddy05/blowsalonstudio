"use client";

import React, { useState } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  Receipt,
  Sparkles,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  CheckCheck,
  ExternalLink,
  Phone,
} from "lucide-react";
import type { WhatsAppMessageRecord, WhatsAppMessageType, WhatsAppMessageStatus } from "@/types/whatsapp";
import { formatDisplayDate } from "@/lib/utils/date";

interface MessageHistoryViewProps {
  messages: WhatsAppMessageRecord[];
  loading: boolean;
  onRefresh: () => void;
  onRetryInvoiceMessage?: (invoiceId: string) => Promise<void>;
}

const statusPillStyles: Record<
  WhatsAppMessageStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  PENDING: {
    label: "Pending",
    bg: "bg-[#F7F7F4]",
    text: "text-[#747A72]",
    border: "border-[#E0E4DD]",
  },
  SENDING: {
    label: "Sending",
    bg: "bg-[#EBF3FB]",
    text: "text-[#2B6CB0]",
    border: "border-[#2B6CB0]/30",
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
  NOT_SENT: {
    label: "Not Sent",
    bg: "bg-[#F7F7F4]",
    text: "text-[#747A72]",
    border: "border-[#E0E4DD]",
  },
  EXCLUDED: {
    label: "Excluded",
    bg: "bg-[#FAF4E8]",
    text: "text-[#B18A45]",
    border: "border-[#B18A45]/30",
  },
};

const typeBadges: Record<
  WhatsAppMessageType,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; bg: string; text: string }
> = {
  INVOICE_RECEIPT: {
    label: "Invoice Receipt",
    icon: Receipt,
    bg: "bg-[#E8ECE5]",
    text: "text-[#5F7A62]",
  },
  MARKETING_CAMPAIGN: {
    label: "Campaign",
    icon: Sparkles,
    bg: "bg-[#FAF4E8]",
    text: "text-[#B18A45]",
  },
  APPOINTMENT_REMINDER: {
    label: "Reminder",
    icon: Clock,
    bg: "bg-[#EBF3FB]",
    text: "text-[#2B6CB0]",
  },
  TEST_MESSAGE: {
    label: "Test Send",
    icon: Send,
    bg: "bg-[#F7F7F4]",
    text: "text-[#747A72]",
  },
};

export default function MessageHistoryView({
  messages,
  loading,
  onRefresh,
  onRetryInvoiceMessage,
}: MessageHistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const filteredMessages = messages.filter((msg) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (msg.customerName?.toLowerCase() || "").includes(term) ||
      (msg.phoneNumber || msg.recipientPhone || "").includes(term) ||
      (msg.invoiceId?.toLowerCase() || "").includes(term) ||
      (msg.campaignName?.toLowerCase() || "").includes(term) ||
      (msg.metaMessageId?.toLowerCase() || "").includes(term) ||
      (msg.templateName?.toLowerCase() || "").includes(term);

    const matchesType = typeFilter === "ALL" || (msg.messageType || "INVOICE_RECEIPT") === typeFilter;
    const matchesStatus = statusFilter === "ALL" || msg.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleRetry = async (invoiceId?: string, msgId?: string) => {
    if (!invoiceId || !onRetryInvoiceMessage) return;
    setRetryingId(msgId || invoiceId);
    try {
      await onRetryInvoiceMessage(invoiceId);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5F7A62]">
            <Receipt size={14} />
            <span>Audit & Real-Time Delivery</span>
          </div>
          <h2 className="font-serif text-xl font-bold text-[#2F352F] mt-1">
            WhatsApp Message History
          </h2>
          <p className="text-xs text-[#747A72] mt-0.5">
            Unified delivery log of all automated invoice receipts, marketing campaigns, and test dispatches.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] px-3.5 text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw size={13} />
          <span>Refresh History</span>
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C9389]" />
          <input
            type="text"
            placeholder="Search by customer, phone, invoice, campaign..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] pl-9 pr-3.5 text-xs text-[#2F352F] placeholder:text-[#8C9389] focus:outline-hidden focus:border-[#2F352F]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-[#8C9389]" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] px-3 text-xs font-semibold text-[#2F352F] focus:outline-hidden focus:border-[#2F352F] cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="INVOICE_RECEIPT">Invoice Receipts</option>
              <option value="MARKETING_CAMPAIGN">Campaigns</option>
              <option value="TEST_MESSAGE">Test Dispatches</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] px-3 text-xs font-semibold text-[#2F352F] focus:outline-hidden focus:border-[#2F352F] cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="READ">Read</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Messages Table */}
      <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-[#747A72]">
            <div className="inline-block size-6 animate-spin rounded-full border-2 border-[#5F7A62] border-t-transparent mb-2" />
            <p>Loading message delivery logs...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="font-serif text-base font-bold text-[#2F352F]">
              No message records found
            </p>
            <p className="text-xs text-[#747A72] max-w-sm mx-auto">
              {searchTerm || typeFilter !== "ALL" || statusFilter !== "ALL"
                ? "No WhatsApp messages match your search filter criteria."
                : "Outgoing invoice receipts and marketing campaign dispatches will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E0E4DD] bg-[#FAF4E8]/40 text-[10px] font-bold uppercase tracking-wider text-[#6F776D]">
                  <th className="py-3.5 px-4">Customer / Recipient</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Campaign / Invoice</th>
                  <th className="py-3.5 px-4">Template / Details</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Meta Message ID</th>
                  <th className="py-3.5 px-4">Sent Time</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD] text-xs text-[#2F352F]">
                {filteredMessages.map((msg) => {
                  const msgType = msg.messageType || "INVOICE_RECEIPT";
                  const typeInfo = typeBadges[msgType] || typeBadges.INVOICE_RECEIPT;
                  const TypeIcon = typeInfo.icon;
                  const statusPill = statusPillStyles[msg.status] || statusPillStyles.PENDING;

                  return (
                    <tr key={msg.id} className="hover:bg-[#FAF4E8]/20 transition">
                      {/* Recipient */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#2F352F]">
                          {msg.customerName || "Customer"}
                        </div>
                        <div className="font-mono text-[11px] text-[#747A72] flex items-center gap-1 mt-0.5">
                          <Phone size={10} className="text-[#8C9389]" />
                          {msg.phoneNumber || msg.recipientPhone || "—"}
                        </div>
                      </td>

                      {/* Message Type */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${typeInfo.bg} ${typeInfo.text}`}
                        >
                          <TypeIcon size={11} />
                          {typeInfo.label}
                        </span>
                      </td>

                      {/* Reference: Invoice / Campaign */}
                      <td className="py-3.5 px-4">
                        {msg.campaignName ? (
                          <div className="font-medium text-[#2F352F]">
                            {msg.campaignName}
                          </div>
                        ) : msg.invoiceId ? (
                          <span className="font-mono text-[11px] text-[#5F7A62] bg-[#E8ECE5]/50 px-2 py-0.5 rounded border border-[#CCD2C8]">
                            Invoice #{msg.invoiceId.slice(-6).toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-[#8C9389]">—</span>
                        )}
                      </td>

                      {/* Template Details */}
                      <td className="py-3.5 px-4 max-w-xs">
                        {msg.templateName ? (
                          <span className="font-mono text-[11px] text-[#5F7A62]">
                            {msg.templateName}
                          </span>
                        ) : msg.contentSummary ? (
                          <p className="text-[11px] text-[#747A72] truncate" title={msg.contentSummary}>
                            {msg.contentSummary}
                          </p>
                        ) : (
                          <span className="text-[#8C9389] text-[11px]">Direct Message</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusPill.bg} ${statusPill.text} ${statusPill.border}`}
                          >
                            {msg.status === "READ" && <CheckCheck size={10} />}
                            {statusPill.label}
                          </span>
                          {msg.errorMessage && (
                            <p
                              className="text-[10px] text-[#B55B5B] mt-0.5 max-w-xs truncate"
                              title={msg.errorMessage}
                            >
                              {msg.errorMessage}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Meta Message ID */}
                      <td className="py-3.5 px-4 font-mono text-[10px] text-[#747A72]">
                        {msg.metaMessageId ? msg.metaMessageId.slice(0, 16) + "..." : "—"}
                      </td>

                      {/* Sent Time */}
                      <td className="py-3.5 px-4 text-[#747A72] text-[11px] whitespace-nowrap">
                        {formatDisplayDate(msg.sentAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {msg.status === "FAILED" && msg.invoiceId && onRetryInvoiceMessage && (
                          <button
                            type="button"
                            title="Retry sending invoice receipt"
                            disabled={retryingId === (msg.id || msg.invoiceId)}
                            onClick={() => handleRetry(msg.invoiceId || undefined, msg.id || undefined)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#FBD38D] bg-[#FFF4E5] hover:bg-[#FEEBC8] text-[10px] font-semibold text-[#C05621] shadow-xs transition cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw size={11} className={retryingId === (msg.id || msg.invoiceId) ? "animate-spin" : ""} />
                            <span>Retry</span>
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
  );
}
