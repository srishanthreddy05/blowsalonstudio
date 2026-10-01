"use client";

import React, { useState } from "react";
import {
  X,
  AlertCircle,
  CheckCircle2,
  CheckCheck,
  Clock,
  Send,
  Receipt,
  Sparkles,
  Phone,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  Info,
} from "lucide-react";
import type { WhatsAppMessageRecord, WhatsAppCampaignRecipient } from "@/types/whatsapp";
import { parseWhatsAppFailure } from "@/lib/whatsapp/errorClassifier";
import { formatDisplayDate } from "@/lib/utils/date";
import Link from "next/link";

interface MessageDetailModalProps {
  message?: WhatsAppMessageRecord | null;
  recipient?: WhatsAppCampaignRecipient | null;
  isOpen: boolean;
  onClose: () => void;
  onRetryInvoiceMessage?: (invoiceId: string) => Promise<void>;
}

export function MessageDetailModal({
  message,
  recipient,
  isOpen,
  onClose,
  onRetryInvoiceMessage,
}: MessageDetailModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [retrying, setRetrying] = useState(false);

  if (!isOpen || (!message && !recipient)) return null;

  const status = message?.status || recipient?.status || "PENDING";
  const errorMessage = message?.errorMessage || recipient?.errorMessage;
  const errorCode = message?.errorCode;
  const metaMessageId = message?.metaMessageId || recipient?.metaMessageId;
  const customerName = message?.customerName || recipient?.customerName || "Customer";
  const phoneNumber = message?.phoneNumber || message?.recipientPhone || recipient?.phone || "—";
  const campaignName = message?.campaignName || (recipient as any)?.campaignName;
  const invoiceId = message?.invoiceId;
  const templateName = message?.templateName;
  const contentSummary = message?.contentSummary;
  const sentAt = message?.sentAt || recipient?.sentAt;
  const deliveredAt = message?.deliveredAt || recipient?.deliveredAt;
  const readAt = message?.readAt || recipient?.readAt;

  const isFailed = status === "FAILED";
  const failureInfo = isFailed ? parseWhatsAppFailure(errorMessage, errorCode) : null;

  const handleCopyMetaId = () => {
    if (!metaMessageId) return;
    navigator.clipboard.writeText(metaMessageId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleRetry = async () => {
    if (!invoiceId || !onRetryInvoiceMessage) return;
    setRetrying(true);
    try {
      await onRetryInvoiceMessage(invoiceId);
      onClose();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#E0E4DD]">
          <div className="flex items-center gap-3">
            <div
              className={`grid size-11 place-items-center rounded-2xl ${
                isFailed
                  ? "bg-[#FBEBEB] text-[#B55B5B] border border-[#F8D7D7]"
                  : status === "READ" || status === "DELIVERED"
                  ? "bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]"
                  : "bg-[#F7F7F4] text-[#747A72] border border-[#E0E4DD]"
              }`}
            >
              {isFailed ? (
                <AlertCircle size={20} />
              ) : status === "READ" ? (
                <CheckCheck size={20} />
              ) : status === "DELIVERED" ? (
                <CheckCircle2 size={20} />
              ) : (
                <Send size={18} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-lg font-bold text-[#2F352F]">
                  WhatsApp Message Details
                </h3>
              </div>
              <p className="text-xs text-[#747A72] mt-0.5">
                Delivery and routing metadata for this dispatch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 pt-5">
          {/* Status & Failure Card */}
          {isFailed && failureInfo ? (
            <div className="rounded-2xl border border-[#F8D7D7] bg-[#FBEBEB]/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#FBEBEB] text-[#B55B5B] border border-[#F8D7D7]">
                  <AlertCircle size={11} />
                  FAILED
                </span>
                {failureInfo.metaErrorCode && (
                  <span className="font-mono text-[10px] font-bold text-[#B55B5B] bg-[#FFFFFF] px-2 py-0.5 rounded-md border border-[#F8D7D7]">
                    Meta Code: {failureInfo.metaErrorCode}
                  </span>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider block">
                  Reason
                </span>
                <p className="text-sm font-bold text-[#2F352F] mt-0.5">
                  {failureInfo.shortReason}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider block">
                  Details
                </span>
                <p className="text-xs text-[#2F352F] mt-0.5 leading-relaxed">
                  {failureInfo.details}
                </p>
              </div>

              {failureInfo.rawErrorMessage && failureInfo.rawErrorMessage !== failureInfo.details && (
                <div className="pt-2 border-t border-[#F8D7D7]/60">
                  <span className="text-[9px] uppercase font-bold text-[#747A72] tracking-wider block">
                    Meta Technical Log
                  </span>
                  <p className="font-mono text-[10px] text-[#747A72] bg-[#FFFFFF] p-2 rounded-xl border border-[#F8D7D7] mt-1 break-words">
                    {failureInfo.rawErrorMessage}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
              <span className="text-xs font-semibold text-[#747A72]">Status</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
                {status === "READ" ? <CheckCheck size={13} /> : <CheckCircle2 size={13} />}
                {status}
              </span>
            </div>
          )}

          {/* Recipient Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider block">
                Recipient
              </span>
              <p className="text-xs font-bold text-[#2F352F] mt-1 truncate">{customerName}</p>
            </div>
            <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider block">
                Phone Number
              </span>
              <p className="font-mono text-xs font-bold text-[#2F352F] mt-1 flex items-center gap-1">
                <Phone size={11} className="text-[#6F776D]" />
                {phoneNumber}
              </p>
            </div>
          </div>

          {/* Reference: Invoice / Campaign / Template */}
          <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3.5 space-y-2">
            <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider block">
              Message Context
            </span>
            <div className="space-y-1.5 text-xs">
              {campaignName && (
                <div className="flex items-center justify-between">
                  <span className="text-[#747A72] flex items-center gap-1">
                    <Sparkles size={12} className="text-[#B18A45]" /> Campaign:
                  </span>
                  <span className="font-semibold text-[#2F352F]">{campaignName}</span>
                </div>
              )}
              {invoiceId && (
                <div className="flex items-center justify-between">
                  <span className="text-[#747A72] flex items-center gap-1">
                    <Receipt size={12} className="text-[#5F7A62]" /> Invoice:
                  </span>
                  <Link
                    href={`/invoices/${invoiceId}`}
                    className="font-mono font-bold text-[#5F7A62] hover:underline flex items-center gap-1"
                  >
                    #{invoiceId.slice(-6).toUpperCase()}
                    <ExternalLink size={10} />
                  </Link>
                </div>
              )}
              {templateName && (
                <div className="flex items-center justify-between">
                  <span className="text-[#747A72]">Template:</span>
                  <span className="font-mono text-[11px] text-[#2F352F]">{templateName}</span>
                </div>
              )}
              {contentSummary && (
                <div className="pt-1.5 border-t border-[#E0E4DD]">
                  <span className="text-[10px] text-[#747A72] block font-semibold mb-0.5">Summary Content:</span>
                  <p className="text-xs text-[#2F352F] italic bg-[#F7F7F4] p-2 rounded-lg">
                    {contentSummary}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Delivery Attempt History */}
          {((recipient?.attempts && recipient.attempts.length > 0) || (message?.retryCount && message.retryCount > 1)) && (
            <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3.5 space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider block">
                Delivery Attempt History
              </span>
              <div className="space-y-2 divide-y divide-[#E0E4DD]/60">
                {recipient?.attempts && recipient.attempts.length > 0 ? (
                  recipient.attempts.map((att) => {
                    const isAttFailed = att.status === "FAILED";
                    const attFailure = isAttFailed ? parseWhatsAppFailure(att.errorMessage, att.errorCode) : null;
                    return (
                      <div key={att.attempt} className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-[#2F352F]">
                            <span>Attempt #{att.attempt}</span>
                            <span
                              className={`px-2 py-0.2 rounded-full text-[9px] font-extrabold uppercase border ${
                                isAttFailed
                                  ? "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                                  : "bg-[#E8ECE5] text-[#5F7A62] border-[#CCD2C8]"
                              }`}
                            >
                              {att.status}
                            </span>
                          </div>
                          {attFailure && (
                            <p className="text-[10px] text-[#B55B5B] mt-0.5">
                              {attFailure.shortReason} {attFailure.metaErrorCode ? `(Meta: ${attFailure.metaErrorCode})` : ""}
                            </p>
                          )}
                        </div>
                        {att.sentAt && (
                          <span className="text-[10px] text-[#747A72] shrink-0">
                            {formatDisplayDate(att.sentAt)}
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-[#747A72]">
                    Retry Attempt #{message?.retryCount}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Technical IDs & Timestamps */}
          <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3 space-y-2 text-xs">
            {metaMessageId && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#747A72]">Meta Message ID:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-[#2F352F] truncate max-w-[200px]" title={metaMessageId}>
                    {metaMessageId}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMetaId}
                    className="grid size-6 place-items-center rounded bg-[#FFFFFF] border border-[#CCD2C8] text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
                    title="Copy Meta Message ID"
                  >
                    {copiedId ? <Check size={11} className="text-[#5F7A62]" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>
            )}
            {sentAt && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#747A72]">Dispatched At:</span>
                <span className="font-medium text-[#2F352F]">{formatDisplayDate(sentAt)}</span>
              </div>
            )}
            {deliveredAt && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#747A72]">Delivered At:</span>
                <span className="font-medium text-[#2F352F]">{formatDisplayDate(deliveredAt)}</span>
              </div>
            )}
            {readAt && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#747A72]">Read At:</span>
                <span className="font-medium text-[#2F352F]">{formatDisplayDate(readAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between gap-2 border-t border-[#E0E4DD] pt-4">
          <div>
            {isFailed && invoiceId && onRetryInvoiceMessage && (
              <button
                type="button"
                disabled={retrying}
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#FBD38D] bg-[#FFF4E5] hover:bg-[#FEEBC8] px-3.5 py-2 text-xs font-semibold text-[#C05621] shadow-2xs transition cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={13} className={retrying ? "animate-spin" : ""} />
                <span>Retry Delivery</span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-[#E0E4DD] px-4 py-2 text-xs font-bold text-[#2F352F] hover:bg-[#F7F7F4] transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
