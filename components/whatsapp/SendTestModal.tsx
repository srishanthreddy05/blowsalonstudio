"use client";

import { useState } from "react";
import { X, Send, AlertCircle, CheckCircle2, Phone, Sparkles, ShieldCheck } from "lucide-react";
import { toast } from "react-hot-toast";
import * as whatsappService from "@/services/whatsapp";

interface SendTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SendTestModal({ isOpen, onClose }: SendTestModalProps) {
  const [testPhone, setTestPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message?: string } | null>(null);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("Please enter a valid test WhatsApp number.");
      return;
    }

    setLoading(true);
    setLastResult(null);

    try {
      // 3p_direct_integration_test_template has exactly ZERO variables and ZERO body parameters
      const res = await whatsappService.sendTestTemplate({
        testPhone: testPhone.trim(),
        templateName: "3p_direct_integration_test_template",
        templateLanguage: "en_US",
        templateVariables: {},
      });

      if (res.success) {
        toast.success(`Test template dispatched to ${testPhone}!`);
        setLastResult({
          success: true,
          message: `Integration test message dispatched successfully via Meta WhatsApp Cloud API (Message ID: ${res.messageId || "Dispatched"}). Check your WhatsApp.`,
        });
      } else {
        toast.error(res.error || "Failed to dispatch test message");
        setLastResult({
          success: false,
          message: res.error || "Meta dispatch failed. Please check phone number and Meta Cloud API credentials.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error sending test message";
      toast.error(msg);
      setLastResult({ success: false, message: msg });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-[#FFFFFF] border border-[#E0E4DD] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E0E4DD] bg-[#FAF4E8]/50">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="font-serif text-base font-bold text-[#2F352F]">
                Send Test WhatsApp Message
              </h3>
              <p className="text-[11px] text-[#747A72]">
                Meta Integration Test • <span className="font-mono font-semibold text-[#5F7A62]">3p_direct_integration_test_template</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#747A72] hover:bg-[#E8ECE5] hover:text-[#2F352F] transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSendTest} className="p-6 space-y-4">
          {/* Active Test Template Information */}
          <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F776D]">
                Approved Integration Test Template
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#E8ECE5] text-[#5F7A62] border border-[#5F7A62]/30 flex items-center gap-1">
                <ShieldCheck size={11} /> Approved
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono font-bold text-xs text-[#2F352F]">
                3p_direct_integration_test_template
              </span>
              <span className="text-[11px] text-[#747A72]">
                (Utility • 0 parameters)
              </span>
            </div>
            <p className="text-[11px] text-[#747A72] leading-relaxed">
              This Meta-approved template verifies end-to-end delivery from the BLOW SALON WhatsApp Cloud API number to your test device with zero parameters.
            </p>
          </div>

          {/* Test Phone Number */}
          <div>
            <label className="block text-xs font-bold text-[#2F352F] mb-1">
              Test WhatsApp Number *
            </label>
            <div className="relative">
              <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#747A72]" />
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="e.g. 9876543210 or +919876543210"
                required
                className="w-full h-10 pl-10 pr-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-mono text-[#2F352F] focus:outline-hidden focus:border-[#5F7A62]"
              />
            </div>
            <p className="text-[11px] text-[#747A72] mt-1">
              Enter your WhatsApp number to receive the verification template message directly from Meta.
            </p>
          </div>

          {/* Result Alert */}
          {lastResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                lastResult.success
                  ? "bg-[#E8ECE5] border-[#5F7A62]/30 text-[#2F352F]"
                  : "bg-[#FBEBEB] border-[#F8D7D7] text-[#B55B5B]"
              }`}
            >
              {lastResult.success ? (
                <CheckCircle2 size={16} className="text-[#5F7A62] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="text-[#B55B5B] shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{lastResult.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E0E4DD]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-[#CCD2C8] text-xs font-semibold text-[#747A72] hover:text-[#2F352F] hover:bg-[#F7F7F4] transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={loading || !testPhone.trim()}
              className="h-9 px-5 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-[#FAF4E8] text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>Send Test Message</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

