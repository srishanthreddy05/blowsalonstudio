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
  LayoutDashboard,
  Megaphone,
  History,
  Power,
  WifiOff,
} from "lucide-react";
import * as whatsappService from "@/services/whatsapp";
import type {
  WhatsAppConnectionStatus,
  WhatsAppMessageRecord,
  WhatsAppSettings,
  WhatsAppStatusResponse,
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
} from "@/types/whatsapp";
import { toast } from "react-hot-toast";
import { formatDisplayDate } from "@/lib/utils/date";

import CampaignsList from "@/components/whatsapp/CampaignsList";
import { CreateCampaignModal } from "@/components/whatsapp/CreateCampaignModal";
import CampaignDetailModal from "@/components/whatsapp/CampaignDetailModal";
import { SendTestModal } from "@/components/whatsapp/SendTestModal";
import MessageHistoryView from "@/components/whatsapp/MessageHistoryView";

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

type WhatsAppNavTab = "OVERVIEW" | "CAMPAIGNS" | "HISTORY";

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<WhatsAppNavTab>("OVERVIEW");

  // Overview / Status state
  const [statusData, setStatusData] = useState<WhatsAppStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessageRecord[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [autoSendInvoice, setAutoSendInvoice] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState<"off" | "on" | null>(null);

  // Campaigns state
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [selectedCampaignForDetail, setSelectedCampaignForDetail] = useState<WhatsAppCampaign | null>(null);
  const [detailRecipients, setDetailRecipients] = useState<WhatsAppCampaignRecipient[]>([]);
  const [loadingDetailRecipients, setLoadingDetailRecipients] = useState(false);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await whatsappService.getStatus();
      setStatusData(data);
      setAutoSendInvoice(data.autoSendInvoice ?? true);
      setWhatsappEnabled(data.whatsappEnabled ?? true);
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

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    try {
      setLoadingCampaigns(true);
      const list = await whatsappService.getCampaigns();
      setCampaigns(list);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchMessages();
    fetchCampaigns();

    // Live polling for QR / Connection status
    const interval = setInterval(() => {
      fetchStatus();
    }, statusData?.status === "QR_REQUIRED" || statusData?.status === "CONNECTING" ? 3000 : 20000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchMessages, fetchCampaigns, statusData?.status]);

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

  const handleToggleMasterSwitch = async (newValue: boolean) => {
    setSavingSettings(true);
    setConfirmToggle(null);
    try {
      const res = await whatsappService.updateSettings({ whatsappEnabled: newValue });
      setWhatsappEnabled(res.whatsappEnabled ?? newValue);
      toast.success(
        newValue
          ? "WhatsApp messaging is now ON."
          : "WhatsApp messaging has been turned OFF. No messages will be sent."
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update WhatsApp switch";
      toast.error(msg);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRetryInvoiceMessage = async (invoiceId: string) => {
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

  // Campaign Handlers
  const handleViewCampaign = async (campaign: WhatsAppCampaign) => {
    setSelectedCampaignForDetail(campaign);
    setLoadingDetailRecipients(true);
    try {
      const res = await whatsappService.getCampaignById(campaign.id);
      setSelectedCampaignForDetail(res.campaign);
      setDetailRecipients(res.recipients || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load campaign recipients";
      toast.error(msg);
    } finally {
      setLoadingDetailRecipients(false);
    }
  };

  const handleSendCampaign = async (campaign: WhatsAppCampaign) => {
    if (
      !confirm(
        `Are you ready to send "${campaign.name}" to ${campaign.totalRecipients || 0} recipients?`
      )
    ) {
      return;
    }

    toast.loading("Queuing and dispatching campaign messages...", { id: "send-camp" });
    try {
      const res = await whatsappService.sendCampaign(campaign.id);
      if (res.success) {
        toast.success(
          `Campaign started! Sent: ${res.sentCount}, Failed: ${res.failedCount}`,
          { id: "send-camp" }
        );
      } else {
        toast.error("Campaign completed with errors", { id: "send-camp" });
      }
      fetchCampaigns();
      fetchMessages();
      if (selectedCampaignForDetail?.id === campaign.id) {
        handleViewCampaign(campaign);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send campaign";
      toast.error(msg, { id: "send-camp" });
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to cancel this campaign? Pending messages will not be sent.")) {
      return;
    }
    toast.loading("Cancelling campaign...", { id: "cancel-camp" });
    try {
      await whatsappService.cancelCampaign(campaignId);
      toast.success("Campaign cancelled.", { id: "cancel-camp" });
      fetchCampaigns();
      if (selectedCampaignForDetail?.id === campaignId) {
        const res = await whatsappService.getCampaignById(campaignId);
        setSelectedCampaignForDetail(res.campaign);
        setDetailRecipients(res.recipients || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel campaign";
      toast.error(msg, { id: "cancel-camp" });
    }
  };

  const handleRetryCampaign = async (campaignId: string) => {
    toast.loading("Retrying failed recipients...", { id: "retry-camp" });
    try {
      const res = await whatsappService.retryCampaign(campaignId);
      toast.success(res.message || "Retry dispatched for failed recipients.", { id: "retry-camp" });
      fetchCampaigns();
      if (selectedCampaignForDetail?.id === campaignId) {
        const detailRes = await whatsappService.getCampaignById(campaignId);
        setSelectedCampaignForDetail(detailRes.campaign);
        setDetailRecipients(detailRes.recipients || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to retry campaign";
      toast.error(msg, { id: "retry-camp" });
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to delete this campaign? This cannot be undone.")) {
      return;
    }
    try {
      await whatsappService.deleteCampaign(campaignId);
      toast.success("Campaign deleted.");
      fetchCampaigns();
      if (selectedCampaignForDetail?.id === campaignId) {
        setSelectedCampaignForDetail(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete campaign";
      toast.error(msg);
    }
  };

  const handleToggleCustomerOptOut = async (customerId: string, optOut: boolean) => {
    try {
      await whatsappService.optOutCustomer(customerId, optOut);
      toast.success(optOut ? "Customer opted out of WhatsApp campaigns." : "Customer re-opted into WhatsApp campaigns.");
      if (selectedCampaignForDetail) {
        const res = await whatsappService.getCampaignById(selectedCampaignForDetail.id);
        setSelectedCampaignForDetail(res.campaign);
        setDetailRecipients(res.recipients || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update opt-out status";
      toast.error(msg);
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
    <div className="w-full text-[#292D29] space-y-6 max-w-6xl mx-auto">
      {/* ── Master Kill-Switch Banner ─────────────────────────────────────── */}
      <div
        className={`rounded-2xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          whatsappEnabled
            ? "border-[#5F7A62]/40 bg-[#E8ECE5]/50"
            : "border-[#B55B5B]/40 bg-[#FBEBEB]/60"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`grid size-10 place-items-center rounded-xl border ${
              whatsappEnabled
                ? "bg-[#E8ECE5] border-[#5F7A62]/30 text-[#5F7A62]"
                : "bg-[#FBEBEB] border-[#B55B5B]/30 text-[#B55B5B]"
            }`}
          >
            {whatsappEnabled ? <Power size={18} /> : <WifiOff size={18} />}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6F776D] mb-0.5">
              WhatsApp Messaging
            </p>
            <p
              className={`text-sm font-bold ${
                whatsappEnabled ? "text-[#2F352F]" : "text-[#B55B5B]"
              }`}
            >
              {whatsappEnabled ? "WhatsApp is ON" : "WhatsApp is OFF"}
            </p>
            <p className="text-[11px] text-[#747A72] mt-0.5 max-w-md">
              {whatsappEnabled
                ? "WhatsApp messaging is active. Invoices, campaigns, and tests will send normally."
                : "WhatsApp messaging is temporarily disabled. No outgoing messages will be sent. Your configuration and history are preserved."}
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          id="whatsapp-master-toggle"
          type="button"
          disabled={savingSettings || loadingStatus}
          onClick={() => setConfirmToggle(whatsappEnabled ? "off" : "on")}
          className={`relative inline-flex h-8 w-[140px] shrink-0 items-center rounded-full border-2 transition-colors duration-300 focus:outline-none cursor-pointer disabled:opacity-50 ${
            whatsappEnabled
              ? "border-[#5F7A62] bg-[#5F7A62]"
              : "border-[#CCD2C8] bg-[#CCD2C8]"
          }`}
          title={whatsappEnabled ? "Click to turn off WhatsApp messaging" : "Click to turn on WhatsApp messaging"}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
              whatsappEnabled ? "translate-x-[104px]" : "translate-x-1"
            }`}
          />
          <span
            className={`absolute text-[10px] font-bold uppercase tracking-wider transition-opacity ${
              whatsappEnabled
                ? "left-3 text-white opacity-100"
                : "right-3 text-[#747A72] opacity-100"
            }`}
          >
            {whatsappEnabled ? "ON" : "OFF"}
          </span>
        </button>
      </div>

      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E0E4DD] pb-5">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6F776D] mb-1">
            <WhatsAppBrandIcon size={14} className="text-[#5F7A62]" />
            <span>Communication & WhatsApp Automation</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            WhatsApp Suite
          </h1>
          <p className="text-xs text-[#747A72] mt-0.5">
            Meta WhatsApp Cloud API integration for automatic invoice receipts and targeted marketing campaigns
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchStatus();
            fetchMessages();
            fetchCampaigns();
            toast.success("Refreshed WhatsApp state.");
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] px-3 text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
        >
          <RefreshCw size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("OVERVIEW")}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === "OVERVIEW"
              ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs border border-[#CCD2C8]"
              : "text-[#747A72] hover:text-[#2F352F]"
          }`}
        >
          <LayoutDashboard size={14} className={activeTab === "OVERVIEW" ? "text-[#5F7A62]" : ""} />
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("CAMPAIGNS")}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === "CAMPAIGNS"
              ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs border border-[#CCD2C8]"
              : "text-[#747A72] hover:text-[#2F352F]"
          }`}
        >
          <Megaphone size={14} className={activeTab === "CAMPAIGNS" ? "text-[#5F7A62]" : ""} />
          <span>Campaigns</span>
          {campaigns.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[#FAF4E8] text-[#B18A45] font-mono text-[10px]">
              {campaigns.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("HISTORY")}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === "HISTORY"
              ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs border border-[#CCD2C8]"
              : "text-[#747A72] hover:text-[#2F352F]"
          }`}
        >
          <History size={14} className={activeTab === "HISTORY" ? "text-[#5F7A62]" : ""} />
          <span>Message History</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "OVERVIEW" && (
        <div className="space-y-6 animate-in fade-in duration-150">
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
                        Provider:{" "}
                        <span className="font-semibold text-[#2F352F]">
                          {statusData?.provider === "WHATSAPP_CLOUD_API"
                            ? "Meta WhatsApp Cloud API"
                            : "QR WhatsApp (Web Session)"}
                        </span>
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
                            {statusData?.connectedNumber || "Meta Cloud Registered Number"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-[#5F7A62] font-semibold">
                        <CheckCircle2 size={16} />
                        <span>Active Provider</span>
                      </div>
                    </div>

                    <div className="text-xs text-[#747A72] space-y-1 bg-[#F7F7F4] p-3.5 rounded-2xl border border-[#E0E4DD]">
                      <p className="flex items-center gap-1.5 text-[#2F352F] font-semibold">
                        <ShieldCheck size={14} className="text-[#5F7A62]" />
                        {statusData?.provider === "WHATSAPP_CLOUD_API" ? "Meta Cloud API Active" : "Session Persisted"}
                      </p>
                      <p>
                        {statusData?.provider === "WHATSAPP_CLOUD_API"
                          ? "Official Meta Cloud API is active. Receipts and campaigns are dispatched securely via Meta Graph API."
                          : "Authentication credentials are saved locally."}
                      </p>
                    </div>

                    {statusData?.provider === "QR_WHATSAPP" && (
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
                    )}
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
                  /* Disconnected / Ready State */
                  <div className="space-y-4 text-center py-4">
                    <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mx-auto">
                      <WhatsAppBrandIcon size={28} />
                    </div>
                    <div>
                      <h3 className="font-serif text-base font-bold text-[#2F352F]">
                        {statusData?.provider === "WHATSAPP_CLOUD_API"
                          ? "Meta WhatsApp Cloud API"
                          : "No WhatsApp Number Linked"}
                      </h3>
                      <p className="text-xs text-[#747A72] max-w-sm mx-auto mt-1">
                        {statusData?.provider === "WHATSAPP_CLOUD_API"
                          ? "Official Meta Cloud API integration. Receipts dispatch automatically upon billing."
                          : "Connect your salon phone number by scanning a QR code to enable automatic bill delivery."}
                      </p>
                    </div>

                    {statusData?.errorMessage && (
                      <div className="p-3 rounded-xl bg-[#FAF4E8] border border-[#B18A45]/30 text-[#8C6D2D] text-xs text-left max-w-md mx-auto flex items-center gap-2">
                        <AlertCircle size={15} className="shrink-0 text-[#B18A45]" />
                        <span>{statusData.errorMessage}</span>
                      </div>
                    )}
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
                        <span>Template Preview</span>
                        <span className="font-mono text-[#5F7A62]">blow_salon_invoice (8 params)</span>
                      </div>
                      <div className="bg-[#FFFFFF] p-4 rounded-2xl border border-[#E0E4DD] shadow-xs font-sans text-xs space-y-2 text-[#292D29] leading-relaxed">
                        <p className="font-semibold text-[#2F352F]">Hello Customer 👋</p>
                        <p className="text-[11px] text-[#747A72]">
                          Thank you for visiting <strong className="text-[#2F352F]">BLOW SALON</strong>.
                        </p>

                        <div className="text-[11px] bg-[#F7F7F4] p-3 rounded-xl border border-[#E0E4DD] space-y-2">
                          <div className="flex justify-between font-mono text-[11px] text-[#2F352F] pb-1.5 border-b border-[#E0E4DD]">
                            <span>Invoice: <strong>INV-XXXX</strong></span>
                            <span>Date: <strong>DD MMM YYYY</strong></span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F776D] block">
                              Services & Products
                            </span>
                            <div className="flex justify-between">
                              <span>Haircut</span>
                              <span className="font-mono">₹500</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Facial</span>
                              <span className="font-mono">₹800</span>
                            </div>
                          </div>

                          <div className="pt-1.5 border-t border-[#E0E4DD] space-y-0.5 text-[11px]">
                            <div className="flex justify-between text-[#747A72]">
                              <span>Subtotal:</span>
                              <span className="font-mono">₹1,300</span>
                            </div>
                            <div className="flex justify-between text-[#747A72]">
                              <span>Tax:</span>
                              <span className="font-mono">₹65</span>
                            </div>
                            <div className="flex justify-between font-bold text-[#2F352F] pt-0.5">
                              <span>Total:</span>
                              <span className="font-mono text-xs">₹1,365</span>
                            </div>
                          </div>

                          <div className="pt-1.5 border-t border-[#E0E4DD] text-[11px] text-[#5F7A62] font-semibold space-y-0.5">
                            <div className="flex justify-between">
                              <span>Amount Paid:</span>
                              <span className="font-mono">₹1,365</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Payment Method:</span>
                              <span>UPI</span>
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] text-[#747A72] pt-1">
                          Thank you for choosing BLOW SALON. ✨
                          <br />
                          We look forward to seeing you again!
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Campaigns Banner */}
              <div className="rounded-3xl border border-[#E0E4DD] bg-[#FAF4E8]/50 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-sm font-bold text-[#2F352F] flex items-center gap-1.5">
                    <Sparkles size={14} className="text-[#B18A45]" />
                    WhatsApp Marketing Campaigns
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("CAMPAIGNS")}
                    className="text-xs font-semibold text-[#5F7A62] hover:underline cursor-pointer"
                  >
                    View All →
                  </button>
                </div>
                <p className="text-[#747A72] text-[11px] leading-relaxed">
                  Send targeted festive offers, membership reminders, and promotions using Meta-approved templates to opted-in customers.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("CAMPAIGNS");
                      setCreateModalOpen(true);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#2F352F] hover:bg-[#1E221E] text-[#FAF4E8] px-3 text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    <span>Create Campaign</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("CAMPAIGNS");
                      setTestModalOpen(true);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#2F352F] px-3 text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    <span>Send Test</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CAMPAIGNS */}
      {activeTab === "CAMPAIGNS" && (
        <div className="animate-in fade-in duration-150">
          <CampaignsList
            campaigns={campaigns}
            loading={loadingCampaigns}
            whatsappEnabled={whatsappEnabled}
            onCreateNew={() => setCreateModalOpen(true)}
            onSendTest={() => setTestModalOpen(true)}
            onViewCampaign={handleViewCampaign}
            onSendCampaign={handleSendCampaign}
            onCancelCampaign={handleCancelCampaign}
            onRetryCampaign={handleRetryCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onDuplicateCampaign={(camp) => {
              setCreateModalOpen(true);
            }}
          />
        </div>
      )}

      {/* TAB 3: MESSAGE HISTORY */}
      {activeTab === "HISTORY" && (
        <div className="animate-in fade-in duration-150">
          <MessageHistoryView
            messages={messages}
            loading={loadingMessages}
            whatsappEnabled={whatsappEnabled}
            onRefresh={() => {
              fetchMessages();
              toast.success("Message audit history refreshed.");
            }}
            onRetryInvoiceMessage={handleRetryInvoiceMessage}
          />
        </div>
      )}

      {/* MODALS */}
      <CreateCampaignModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCampaignCreated={(camp) => {
          setCreateModalOpen(false);
          fetchCampaigns();
          toast.success(`Campaign "${camp.name}" created successfully!`);
          handleViewCampaign(camp);
        }}
      />

      <SendTestModal
        isOpen={testModalOpen}
        whatsappEnabled={whatsappEnabled}
        onClose={() => setTestModalOpen(false)}
      />

      {selectedCampaignForDetail && (
        <CampaignDetailModal
          campaign={selectedCampaignForDetail}
          recipients={detailRecipients}
          loadingRecipients={loadingDetailRecipients}
          whatsappEnabled={whatsappEnabled}
          onClose={() => setSelectedCampaignForDetail(null)}
          onSendCampaign={handleSendCampaign}
          onCancelCampaign={handleCancelCampaign}
          onRetryCampaign={handleRetryCampaign}
          onToggleCustomerOptOut={handleToggleCustomerOptOut}
        />
      )}

      {/* ── Master Switch Confirmation Dialog ───────────────────────────────── */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/50 backdrop-blur-xs"
            onClick={() => setConfirmToggle(null)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl z-10 animate-in zoom-in-95 duration-200 space-y-5">
            <div className="flex items-center gap-3">
              <div
                className={`grid size-11 place-items-center rounded-2xl border ${
                  confirmToggle === "off"
                    ? "bg-[#FBEBEB] border-[#F8D7D7] text-[#B55B5B]"
                    : "bg-[#E8ECE5] border-[#5F7A62]/30 text-[#5F7A62]"
                }`}
              >
                <Power size={20} />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[#2F352F]">
                  {confirmToggle === "off"
                    ? "Turn off WhatsApp messaging?"
                    : "Turn on WhatsApp messaging?"}
                </h3>
              </div>
            </div>

            <p className="text-xs text-[#2F352F] leading-relaxed bg-[#F7F7F4] p-3.5 rounded-2xl border border-[#E0E4DD]">
              {confirmToggle === "off"
                ? "New WhatsApp messages, invoice receipts, campaigns, tests, and retries will be temporarily disabled. Your existing WhatsApp configuration and message history will not be affected."
                : "WhatsApp messages will be allowed to send again. No queued or historical messages will be sent automatically — only new explicit send actions will work."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E0E4DD]">
              <button
                type="button"
                onClick={() => setConfirmToggle(null)}
                className="rounded-xl border border-[#CCD2C8] px-4 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                id={`whatsapp-confirm-${confirmToggle}`}
                type="button"
                disabled={savingSettings}
                onClick={() => handleToggleMasterSwitch(confirmToggle === "on")}
                className={`rounded-xl px-5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50 ${
                  confirmToggle === "off"
                    ? "bg-[#B55B5B] hover:bg-[#9C4040]"
                    : "bg-[#5F7A62] hover:bg-[#4E6450]"
                }`}
              >
                {savingSettings ? "Saving..." : confirmToggle === "off" ? "Turn Off WhatsApp" : "Turn On WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
