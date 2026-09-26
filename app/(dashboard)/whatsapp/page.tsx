"use client";

import { useEffect, useState, useCallback } from "react";
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Unlink,
  ExternalLink,
  Sparkles,
  Receipt,
  Phone,
  Clock,
  ShieldCheck,
  Smartphone,
  Eye,
  Send,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import Image from "next/image";
import * as whatsappService from "@/services/whatsapp";
import type {
  WhatsAppConnectionStatus,
  WhatsAppMessageRecord,
  WhatsAppSettings,
  WhatsAppStatusResponse,
} from "@/types/whatsapp";
import { toast } from "react-hot-toast";
import { formatDisplayDate } from "@/lib/utils/date";

function WhatsAppBrandIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c4.56 0 8.25 3.69 8.25 8.24 0 2.2-.86 4.28-2.42 5.84a8.214 8.214 0 0 1-5.83 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.12.82.83-3.04-.19-.31a8.19 8.19 0 0 1-1.26-4.48c0-4.55 3.7-8.24 8.29-8.24m4.54 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6-.1.49-.3 1.47-1.2 1.68-1.77.2-.57.2-1.06.14-1.16-.06-.1-.23-.17-.48-.29" />
    </svg>
  );
}

export default function WhatsAppPage() {
  const [statusData, setStatusData] = useState<WhatsAppStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessageRecord[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [autoSendInvoice, setAutoSendInvoice] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await whatsappService.getStatus();
      setStatusData(data);
      setAutoSendInvoice(data.autoSendInvoice ?? true);
    } catch (err) {
      console.error("Error fetching WhatsApp status:", err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Fetch message audit log
  const fetchMessages = useCallback(async () => {
    try {
      const list = await whatsappService.getRecentMessages();
      setMessages(list);
    } catch (err) {
      console.error("Error fetching WhatsApp messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchMessages();

    // Live polling for QR/Connection status every 4 seconds when in connecting/qr state, otherwise 15s
    const interval = setInterval(() => {
      fetchStatus();
    }, statusData?.status === "QR_REQUIRED" || statusData?.status === "CONNECTING" ? 3000 : 15000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchMessages, statusData?.status]);

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const res = await whatsappService.connect();
      setStatusData(res);
      toast.success("Connecting to WhatsApp... Please scan QR code.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect WhatsApp";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect WhatsApp? You will need to scan QR code again.")) {
      return;
    }
    setActionLoading(true);
    try {
      await whatsappService.disconnect();
      await fetchStatus();
      toast.success("WhatsApp disconnected successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to disconnect WhatsApp";
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleAutoSend = async (checked: boolean) => {
    setAutoSendInvoice(checked);
    setSavingSettings(true);
    try {
      await whatsappService.updateSettings({ autoSendInvoice: checked });
      toast.success(`Automatic invoice messaging ${checked ? "enabled" : "disabled"}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update settings";
      toast.error(msg);
      setAutoSendInvoice(!checked);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRetryMessage = async (invoiceId: string) => {
    toast.loading("Retrying receipt send...", { id: "retry-wa" });
    try {
      const result = await whatsappService.sendInvoiceWhatsApp(invoiceId, true);
      if (result.success) {
        toast.success("Receipt sent successfully via WhatsApp!", { id: "retry-wa" });
      } else {
        toast.error(result.error || "Failed to deliver WhatsApp message", { id: "retry-wa" });
      }
      fetchMessages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to retry message";
      toast.error(msg, { id: "retry-wa" });
    }
  };

  const isConnected = statusData?.status === "CONNECTED";
  const isConnecting = statusData?.status === "CONNECTING";
  const isQrRequired = statusData?.status === "QR_REQUIRED";

  const statusPills: Record<WhatsAppConnectionStatus, { label: string; pillClass: string; dotClass: string }> = {
    CONNECTED: {
      label: "Connected",
      pillClass: "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30",
      dotClass: "bg-[#5F7A62]",
    },
    CONNECTING: {
      label: "Connecting...",
      pillClass: "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30",
      dotClass: "bg-[#B18A45] animate-pulse",
    },
    QR_REQUIRED: {
      label: "QR Code Ready",
      pillClass: "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30",
      dotClass: "bg-[#B18A45]",
    },
    DISCONNECTED: {
      label: "Not Connected",
      pillClass: "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]",
      dotClass: "bg-[#CCD2C8]",
    },
    ERROR: {
      label: "Connection Error",
      pillClass: "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]",
      dotClass: "bg-[#B55B5B]",
    },
  };

  const currentPill = statusData?.status
    ? statusPills[statusData.status] || statusPills.DISCONNECTED
    : statusPills.DISCONNECTED;

  return (
    <div className="w-full text-[#292D29] space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E0E4DD] pb-5">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6F776D] mb-1">
            <WhatsAppBrandIcon size={14} className="text-[#5F7A62]" />
            <span>Communication & Automation</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            WhatsApp Integration
          </h1>
          <p className="text-xs text-[#747A72] mt-0.5">
            Connect a salon WhatsApp number via QR code to automatically send invoice receipts
          </p>
        </div>

        <button
          onClick={() => {
            fetchStatus();
            fetchMessages();
            toast.success("Status refreshed.");
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] px-3 text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
        >
          <RefreshCw size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Grid: Connection Card & Settings */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Connection & QR Card */}
        <div className="md:col-span-7 space-y-6">
          <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-4">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
                  <WhatsAppBrandIcon size={22} />
                </div>
                <div>
                  <h2 className="font-serif text-base font-bold text-[#2F352F]">
                    WhatsApp Number Connection
                  </h2>
                  <p className="text-xs text-[#747A72]">
                    Provider: <span className="font-semibold text-[#2F352F]">QR WhatsApp (Web Session)</span>
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${currentPill.pillClass}`}
              >
                <span className={`size-1.5 rounded-full ${currentPill.dotClass}`} />
                {currentPill.label}
              </span>
            </div>

            {/* Connected State */}
            {isConnected ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#E8ECE5]/40 border border-[#CCD2C8] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-[#FFFFFF] text-[#5F7A62] shadow-2xs">
                      <Phone size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                        Connected Phone Number
                      </span>
                      <span className="font-mono text-base font-bold text-[#2F352F]">
                        {statusData?.connectedNumber || "Connected Number"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-[#5F7A62] font-semibold">
                    <CheckCircle2 size={16} />
                    <span>Active Session</span>
                  </div>
                </div>

                <div className="text-xs text-[#747A72] space-y-1 bg-[#F7F7F4] p-3.5 rounded-2xl border border-[#E0E4DD]">
                  <p className="flex items-center gap-1.5 text-[#2F352F] font-semibold">
                    <ShieldCheck size={14} className="text-[#5F7A62]" />
                    Session Persisted
                  </p>
                  <p>
                    Authentication credentials are saved locally. You do not need to rescan the QR code on server restarts.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleDisconnect}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#F8D7D7] bg-[#FBEBEB] hover:bg-[#F5DCDC] px-4 text-xs font-bold text-[#B55B5B] transition cursor-pointer disabled:opacity-50"
                  >
                    <Unlink size={13} />
                    <span>Disconnect WhatsApp</span>
                  </button>
                </div>
              </div>
            ) : isQrRequired && statusData?.qrCode ? (
              /* QR Code Scanning State */
              <div className="space-y-4 text-center">
                <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] max-w-xs mx-auto">
                  <div className="bg-[#FFFFFF] p-3 rounded-xl border border-[#CCD2C8] shadow-sm inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={statusData.qrCode}
                      alt="WhatsApp Connection QR Code"
                      className="w-56 h-56 object-contain rounded-lg"
                    />
                  </div>
                  <p className="text-xs font-semibold text-[#2F352F] mt-3">
                    Scan this QR code with WhatsApp
                  </p>
                </div>

                {/* Instructions */}
                <div className="text-left bg-[#FFFFFF] p-4 rounded-2xl border border-[#E0E4DD] text-xs space-y-2 text-[#747A72]">
                  <p className="font-bold text-[#2F352F] flex items-center gap-1.5">
                    <Smartphone size={14} className="text-[#6F776D]" />
                    How to connect:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px]">
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap <strong>Menu (⋮)</strong> or <strong>Settings (⚙)</strong></li>
                    <li>Select <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong></li>
                    <li>Point your phone camera at this screen to scan</li>
                  </ol>
                </div>

                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleConnect}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] px-4 text-xs font-semibold text-[#2F352F] transition cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Regenerate QR</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleDisconnect}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E0E4DD] text-xs font-semibold text-[#747A72] hover:text-[#2F352F] px-4"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Disconnected / Ready to Connect State */
              <div className="space-y-4 text-center py-4">
                <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mx-auto">
                  <QrCode size={28} />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-[#2F352F]">
                    No WhatsApp Number Linked
                  </h3>
                  <p className="text-xs text-[#747A72] max-w-sm mx-auto mt-1">
                    Connect your salon phone number by scanning a QR code to enable automatic bill delivery.
                  </p>
                </div>

                {statusData?.errorMessage && (
                  <div className="p-3 rounded-xl bg-[#FBEBEB] border border-[#F8D7D7] text-[#B55B5B] text-xs text-left max-w-md mx-auto flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{statusData.errorMessage}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleConnect}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading || isConnecting ? (
                      <>
                        <div className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Starting Connection...</span>
                      </>
                    ) : (
                      <>
                        <QrCode size={15} />
                        <span>Connect WhatsApp via QR</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Automated Messaging Settings & Preview */}
        <div className="md:col-span-5 space-y-6">
          {/* Automated Receipt Settings */}
          <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs space-y-4">
            <h2 className="font-serif text-base font-bold text-[#2F352F] flex items-center gap-2 border-b border-[#E0E4DD] pb-3">
              <Receipt size={16} className="text-[#6F776D]" />
              Automatic Invoice Messages
            </h2>

            <div className="space-y-4">
              <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] cursor-pointer hover:border-[#CCD2C8] transition">
                <input
                  type="checkbox"
                  checked={autoSendInvoice}
                  disabled={savingSettings}
                  onChange={(e) => handleToggleAutoSend(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-[#5F7A62] accent-[#5F7A62] cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-[#2F352F] block">
                    Send invoice automatically after billing
                  </span>
                  <p className="text-[11px] text-[#747A72] mt-0.5">
                    When enabled, saving an invoice triggers an instant receipt dispatch to the client’s phone number.
                  </p>
                </div>
              </label>

              {/* Message Preview button */}
              <button
                type="button"
                onClick={() => setPreviewOpen(!previewOpen)}
                className="w-full inline-flex items-center justify-between h-9 px-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Eye size={13} className="text-[#6F776D]" />
                  {previewOpen ? "Hide Sample Message" : "Preview WhatsApp Receipt Template"}
                </span>
                <span className="text-[10px] text-[#747A72] font-mono">{previewOpen ? "▲" : "▼"}</span>
              </button>

              {/* Sample WhatsApp Mockup */}
              {previewOpen && (
                <div className="p-4 rounded-2xl bg-[#E8ECE5]/30 border border-[#CCD2C8] space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#6F776D] uppercase">
                    <span>Message Mockup</span>
                    <span className="text-[#5F7A62]">Dynamic Generator</span>
                  </div>
                  <div className="bg-[#FFFFFF] p-3.5 rounded-xl border border-[#E0E4DD] shadow-2xs font-sans text-xs space-y-1.5 text-[#292D29] whitespace-pre-line leading-relaxed">
                    <p>Hello *Rahul* 👋</p>
                    <p className="text-[11px] text-[#747A72]">
                      Thank you for visiting *BLOW SALON*. Here is your official invoice receipt:
                    </p>
                    <div className="font-mono text-[11px] bg-[#F7F7F4] p-2 rounded-lg border border-[#E0E4DD]">
                      <p>📄 *Invoice:* INV-260926-001</p>
                      <p>📅 *Date:* 26 Sep 2026</p>
                      <p>────────────────────</p>
                      <p>• Haircut — ₹300</p>
                      <p>• Beard Trim — ₹150</p>
                      <p>────────────────────</p>
                      <p>Subtotal: ₹450</p>
                      <p>*Total: ₹450*</p>
                      <p>💳 *Payment:* UPI (PAID)</p>
                    </div>
                    <p className="text-[11px] text-[#747A72]">
                      We look forward to welcoming you back soon! ✨
                      <br />
                      *BLOW SALON — Management Suite*
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Architecture Readiness Card */}
          <div className="rounded-3xl border border-[#E0E4DD] bg-[#F7F7F4] p-5 shadow-xs space-y-2 text-xs">
            <h3 className="font-bold text-[#2F352F] flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#6F776D]" />
              Modular Provider Architecture
            </h3>
            <p className="text-[#747A72] leading-relaxed text-[11px]">
              The billing system interfaces strictly with the <code>IWhatsAppProvider</code> abstraction. When ready, migration to Meta Cloud API requires zero changes to billing logic.
            </p>
          </div>
        </div>
      </div>

      {/* Message Audit Log Section */}
      <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E0E4DD] pb-4">
          <div>
            <h2 className="font-serif text-base font-bold text-[#2F352F] flex items-center gap-2">
              <Clock size={16} className="text-[#6F776D]" />
              Recent WhatsApp Invoice Dispatches
            </h2>
            <p className="text-xs text-[#747A72]">Audit record of automatic and manual receipts sent</p>
          </div>
          <span className="text-xs font-semibold text-[#6F776D]">
            {messages.length} Record{messages.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loadingMessages ? (
          <div className="flex h-32 items-center justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center text-[#747A72] text-xs italic">
            No WhatsApp receipts recorded yet. New invoice dispatches will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E0E4DD] text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                  <th className="pb-2.5">Invoice</th>
                  <th className="pb-2.5">Customer</th>
                  <th className="pb-2.5">Phone</th>
                  <th className="pb-2.5">Time</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD]">
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-[#F7F7F4] transition">
                    <td className="py-3 font-mono font-bold text-[#2F352F]">
                      {msg.invoiceNumber || msg.invoiceId}
                    </td>
                    <td className="py-3 font-semibold text-[#2F352F]">
                      {msg.customerName}
                    </td>
                    <td className="py-3 font-mono text-[#747A72]">
                      {msg.phoneNumber || "No Phone"}
                    </td>
                    <td className="py-3 text-[11px] text-[#747A72]">
                      {msg.sentAt || msg.createdAt ? formatDisplayDate(msg.sentAt || msg.createdAt) : "—"}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                          msg.status === "SENT"
                            ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                            : msg.status === "FAILED"
                            ? "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                            : "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                        }`}
                      >
                        {msg.status === "SENT" ? "✓ Sent" : msg.status === "FAILED" ? "⚠ Failed" : "Not Sent"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {msg.status === "FAILED" || msg.status === "NOT_SENT" ? (
                        <button
                          type="button"
                          onClick={() => handleRetryMessage(msg.invoiceId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#E8ECE5] text-[11px] font-bold text-[#2F352F] transition cursor-pointer"
                        >
                          <RotateCcw size={11} />
                          Retry
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRetryMessage(msg.invoiceId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E0E4DD] text-[11px] font-medium text-[#747A72] hover:text-[#2F352F] hover:bg-[#F7F7F4] transition cursor-pointer"
                          title="Resend receipt to customer"
                        >
                          Resend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
