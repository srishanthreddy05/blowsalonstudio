"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Power,
  WifiOff,
  Receipt,
  Phone,
  CheckCircle2,
  AlertCircle,
  Eye,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { WhatsAppStatusResponse, WhatsAppConnectionStatus } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { toast } from "react-hot-toast";

function WhatsAppBrandIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c4.56 0 8.25 3.69 8.25 8.24 0 2.2-.86 4.28-2.42 5.84a8.214 8.214 0 0 1-5.83 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.12.82.83-3.04-.19-.31a8.19 8.19 0 0 1-1.26-4.48c0-4.55 3.7-8.24 8.29-8.24m4.54 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6-.1.49-.3 1.47-1.2 1.68-1.77.2-.57.2-1.06.14-1.16-.06-.1-.23-.17-.48-.29" />
    </svg>
  );
}

interface WhatsAppSettingsViewProps {
  statusData: WhatsAppStatusResponse | null;
  whatsappEnabled: boolean;
  autoSendInvoice: boolean;
  onRefresh: () => void;
  onToggleMasterSwitch: (enabled: boolean) => void;
  onToggleAutoSend: (enabled: boolean) => void;
  savingSettings?: boolean;
}

export function WhatsAppSettingsView({
  statusData,
  whatsappEnabled,
  autoSendInvoice,
  onRefresh,
  onToggleMasterSwitch,
  onToggleAutoSend,
  savingSettings = false,
}: WhatsAppSettingsViewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const isConnected = statusData?.status === "CONNECTED";

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 1. Connection Overview Card */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
              <WhatsAppBrandIcon size={22} />
            </div>
            <div>
              <h3 className="font-serif text-base font-bold text-[#2F352F]">
                WhatsApp Provider & Connection
              </h3>
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
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              isConnected
                ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                : "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                isConnected ? "bg-[#5F7A62]" : "bg-[#B55B5B]"
              }`}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
              Registered Phone Number
            </span>
            <span className="font-mono text-sm font-bold text-[#2F352F]">
              {statusData?.connectedNumber || "Meta Cloud Registered Number"}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
              Meta Graph API Version
            </span>
            <span className="font-mono text-sm font-bold text-[#2F352F]">
              v21.0 (Cloud API)
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#E8ECE5]/30 border border-[#CCD2C8] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[#5F7A62] font-semibold">
            <ShieldCheck size={16} />
            <span>Secure Server-Side Meta Authentication Active</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs font-bold text-[#5F7A62] hover:underline cursor-pointer"
          >
            Check Status
          </button>
        </div>
      </div>

      {/* 2. Master WhatsApp Kill-Switch & Automation Toggles */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-5">
        <h3 className="font-serif text-base font-bold text-[#2F352F] border-b border-[#E0E4DD] pb-3">
          Messaging Controls
        </h3>

        <div className="space-y-4">
          {/* Master Switch */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-[#2F352F] block">
                Master WhatsApp Switch
              </span>
              <p className="text-[11px] text-[#747A72]">
                Globally enables or halts all WhatsApp dispatches (inbox, invoices, campaigns, retries).
              </p>
            </div>
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => onToggleMasterSwitch(!whatsappEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors cursor-pointer disabled:opacity-50 ${
                whatsappEnabled
                  ? "border-[#5F7A62] bg-[#5F7A62]"
                  : "border-[#CCD2C8] bg-[#CCD2C8]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                  whatsappEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Auto-send Invoice Toggle */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-[#2F352F] block">
                Automatic Invoice WhatsApp Receipts
              </span>
              <p className="text-[11px] text-[#747A72]">
                Automatically dispatches the official invoice template when saving an invoice in Billing.
              </p>
            </div>
            <button
              type="button"
              disabled={savingSettings}
              onClick={() => onToggleAutoSend(!autoSendInvoice)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors cursor-pointer disabled:opacity-50 ${
                autoSendInvoice
                  ? "border-[#5F7A62] bg-[#5F7A62]"
                  : "border-[#CCD2C8] bg-[#CCD2C8]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                  autoSendInvoice ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Invoice Receipt Template Preview */}
      <div className="p-6 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
          <h3 className="font-serif text-base font-bold text-[#2F352F] flex items-center gap-2">
            <Receipt size={16} className="text-[#5F7A62]" />
            Invoice Receipt Preview
          </h3>
          <button
            type="button"
            onClick={() => setPreviewOpen(!previewOpen)}
            className="text-xs font-bold text-[#5F7A62] hover:underline cursor-pointer"
          >
            {previewOpen ? "Hide Preview" : "Show Template Preview"}
          </button>
        </div>

        {previewOpen && (
          <div className="p-4 rounded-2xl bg-[#E8ECE5]/30 border border-[#CCD2C8] space-y-2 animate-in fade-in">
            <div className="bg-[#FFFFFF] p-4 rounded-2xl border border-[#E0E4DD] text-xs space-y-2 text-[#292D29] max-w-md">
              <p className="font-semibold text-[#2F352F]">Hello Customer 👋</p>
              <p className="text-[11px] text-[#747A72]">
                Thank you for visiting <strong className="text-[#2F352F]">BLOW SALON</strong>.
              </p>
              <div className="text-[11px] bg-[#F7F7F4] p-3 rounded-xl border border-[#E0E4DD] space-y-2">
                <div className="flex justify-between font-mono text-[11px] pb-1 border-b border-[#E0E4DD]">
                  <span>Invoice: <strong>INV-1001</strong></span>
                  <span>Date: <strong>01 Oct 2026</strong></span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Hair Styling</span>
                    <span className="font-mono">₹1,500</span>
                  </div>
                </div>
                <div className="pt-1 border-t border-[#E0E4DD] flex justify-between font-bold text-[#2F352F]">
                  <span>Total:</span>
                  <span className="font-mono text-xs">₹1,500</span>
                </div>
              </div>
              <p className="text-[11px] text-[#747A72]">
                We look forward to seeing you again! ✨
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
