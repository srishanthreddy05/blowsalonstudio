"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Megaphone,
  Sparkles,
  History,
  Settings as SettingsIcon,
  Power,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import * as whatsappService from "@/services/whatsapp";
import type {
  WhatsAppMessageRecord,
  WhatsAppStatusResponse,
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
} from "@/types/whatsapp";
import { toast } from "react-hot-toast";

import CampaignsList from "@/components/whatsapp/CampaignsList";
import { CreateCampaignModal } from "@/components/whatsapp/CreateCampaignModal";
import CampaignDetailModal from "@/components/whatsapp/CampaignDetailModal";
import { SendTestModal } from "@/components/whatsapp/SendTestModal";
import MessageHistoryView from "@/components/whatsapp/MessageHistoryView";
import { TemplatesView } from "@/components/whatsapp/TemplatesView";
import { WhatsAppSettingsView } from "@/components/whatsapp/WhatsAppSettingsView";

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

export type WhatsAppNavTab = "CAMPAIGNS" | "TEMPLATES" | "HISTORY" | "SETTINGS";

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<WhatsAppNavTab>("CAMPAIGNS");

  // Global WhatsApp state
  const [statusData, setStatusData] = useState<WhatsAppStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [messages, setMessages] = useState<WhatsAppMessageRecord[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [autoSendInvoice, setAutoSendInvoice] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
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
  }, [fetchStatus, fetchMessages, fetchCampaigns]);

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

  return (
    <div className="w-full text-[#292D29] space-y-5 max-w-7xl mx-auto">
      {/* ── Master Kill-Switch Banner ─────────────────────────────────────── */}
      <div
        className={`rounded-2xl border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          whatsappEnabled
            ? "border-[#5F7A62]/30 bg-[#E8ECE5]/40"
            : "border-[#B55B5B]/30 bg-[#FBEBEB]/50"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`grid size-9 place-items-center rounded-xl border ${
              whatsappEnabled
                ? "bg-[#E8ECE5] border-[#5F7A62]/30 text-[#5F7A62]"
                : "bg-[#FBEBEB] border-[#B55B5B]/30 text-[#B55B5B]"
            }`}
          >
            {whatsappEnabled ? <Power size={16} /> : <WifiOff size={16} />}
          </div>
          <div>
            <p
              className={`text-xs font-bold ${
                whatsappEnabled ? "text-[#2F352F]" : "text-[#B55B5B]"
              }`}
            >
              {whatsappEnabled ? "WhatsApp is Active" : "WhatsApp is Paused"}
            </p>
            <p className="text-[11px] text-[#747A72]">
              {whatsappEnabled
                ? "Outbound messages, invoice receipts, and campaigns are sending normally."
                : "Outgoing dispatches are temporarily halted. History remains accessible."}
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          id="whatsapp-master-toggle"
          type="button"
          disabled={savingSettings || loadingStatus}
          onClick={() => setConfirmToggle(whatsappEnabled ? "off" : "on")}
          className={`relative inline-flex h-7 w-[120px] shrink-0 items-center rounded-full border-2 transition-colors duration-300 focus:outline-none cursor-pointer disabled:opacity-50 ${
            whatsappEnabled
              ? "border-[#5F7A62] bg-[#5F7A62]"
              : "border-[#CCD2C8] bg-[#CCD2C8]"
          }`}
          title={whatsappEnabled ? "Click to turn off WhatsApp messaging" : "Click to turn on WhatsApp messaging"}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform duration-300 ${
              whatsappEnabled ? "translate-x-[92px]" : "translate-x-0.5"
            }`}
          />
          <span
            className={`absolute text-[10px] font-bold uppercase tracking-wider transition-opacity ${
              whatsappEnabled
                ? "left-2.5 text-white opacity-100"
                : "right-2.5 text-[#747A72] opacity-100"
            }`}
          >
            {whatsappEnabled ? "ON" : "OFF"}
          </span>
        </button>
      </div>

      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E0E4DD] pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6F776D] mb-0.5">
            <WhatsAppBrandIcon size={14} className="text-[#5F7A62]" />
            <span>Communication & WhatsApp Automation</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            WhatsApp Suite
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchStatus();
            fetchMessages();
            fetchCampaigns();
            toast.success("Refreshed WhatsApp state.");
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] px-3 text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
        >
          <RefreshCw size={12} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] w-full sm:w-fit overflow-x-auto">
        {/* 1. Campaigns Tab */}
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

        {/* 2. Templates Tab */}
        <button
          type="button"
          onClick={() => setActiveTab("TEMPLATES")}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === "TEMPLATES"
              ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs border border-[#CCD2C8]"
              : "text-[#747A72] hover:text-[#2F352F]"
          }`}
        >
          <Sparkles size={14} className={activeTab === "TEMPLATES" ? "text-[#5F7A62]" : ""} />
          <span>Templates</span>
        </button>

        {/* 3. History Tab */}
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

        {/* 4. Settings Tab */}
        <button
          type="button"
          onClick={() => setActiveTab("SETTINGS")}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === "SETTINGS"
              ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs border border-[#CCD2C8]"
              : "text-[#747A72] hover:text-[#2F352F]"
          }`}
        >
          <SettingsIcon size={14} className={activeTab === "SETTINGS" ? "text-[#5F7A62]" : ""} />
          <span>Settings</span>
        </button>
      </div>


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
            onDuplicateCampaign={() => {
              setCreateModalOpen(true);
            }}
          />
        </div>
      )}

      {/* TAB 3: TEMPLATES */}
      {activeTab === "TEMPLATES" && (
        <div className="animate-in fade-in duration-150">
          <TemplatesView whatsappEnabled={whatsappEnabled} />
        </div>
      )}

      {/* TAB 4: MESSAGE HISTORY */}
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

      {/* TAB 5: SETTINGS */}
      {activeTab === "SETTINGS" && (
        <div className="animate-in fade-in duration-150">
          <WhatsAppSettingsView
            statusData={statusData}
            whatsappEnabled={whatsappEnabled}
            autoSendInvoice={autoSendInvoice}
            onRefresh={fetchStatus}
            onToggleMasterSwitch={handleToggleMasterSwitch}
            onToggleAutoSend={handleToggleAutoSend}
            savingSettings={savingSettings}
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

      {/* Master Switch Confirmation Dialog */}
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
