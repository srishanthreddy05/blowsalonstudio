"use client";

import { useState, useEffect } from "react";
import { X, Send, AlertCircle, CheckCircle2, Phone, Sparkles } from "lucide-react";
import { toast } from "react-hot-toast";
import * as whatsappService from "@/services/whatsapp";
import type { WhatsAppTemplate } from "@/types/whatsapp";

interface SendTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateName?: string;
  templateLanguage?: string;
  templateVariables?: Record<string, string>;
  bodyTextPreview?: string;
}

export function SendTestModal({
  isOpen,
  onClose,
  templateName: initialTemplateName,
  templateLanguage: initialTemplateLanguage,
  templateVariables: initialTemplateVariables,
  bodyTextPreview: initialBodyTextPreview,
}: SendTestModalProps) {
  const [testPhone, setTestPhone] = useState("");
  const [sampleName, setSampleName] = useState("Rahul Sharma");
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Template selection state if not passed in props
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState(initialTemplateName || "");
  const [customTemplateInput, setCustomTemplateInput] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    if (!initialTemplateName) {
      setLoadingTemplates(true);
      whatsappService
        .getTemplates()
        .then((tpls) => {
          setTemplates(tpls || []);
          if (tpls && tpls.length > 0) {
            const firstApproved = tpls.find((t) => t.status === "APPROVED") || tpls[0];
            setSelectedTemplateName(firstApproved.name);
          }
        })
        .finally(() => setLoadingTemplates(false));
    } else {
      setSelectedTemplateName(initialTemplateName);
    }
  }, [isOpen, initialTemplateName]);

  if (!isOpen) return null;

  const currentTemplate = templates.find((t) => t.name === selectedTemplateName);
  const activeTemplateName =
    selectedTemplateName === "__custom__"
      ? customTemplateInput.trim()
      : selectedTemplateName || initialTemplateName || customTemplateInput.trim();

  const activeLanguage =
    initialTemplateLanguage || currentTemplate?.language || "en_US";

  const activePreview =
    initialBodyTextPreview ||
    currentTemplate?.bodyText ||
    "Hello {{1}}, here is your exclusive update from BLOW SALON!";

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("Please enter a valid test WhatsApp number.");
      return;
    }

    if (!activeTemplateName) {
      toast.error("Please specify an approved WhatsApp template name.");
      return;
    }

    setLoading(true);
    setLastResult(null);

    try {
      const res = await whatsappService.sendTestTemplate({
        testPhone: testPhone.trim(),
        templateName: activeTemplateName,
        templateLanguage: activeLanguage,
        templateVariables: initialTemplateVariables || { "1": "customer_name", "2": "BLOW SALON" },
        sampleCustomerName: sampleName.trim() || "Test Customer",
      });

      if (res.success) {
        toast.success(`Test template dispatched to ${testPhone}!`);
        setLastResult({
          success: true,
          message: `Message dispatched successfully (Meta ID: ${res.messageId || "Queued"}). Check your WhatsApp.`,
        });
      } else {
        toast.error(res.error || "Failed to dispatch test message");
        setLastResult({
          success: false,
          message: res.error || "Meta dispatch failed. Please check phone number and template status.",
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
                Template: <span className="font-mono font-semibold text-[#5F7A62]">{activeTemplateName || "Select below"}</span>
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
          {/* Template Selector if opened standalone */}
          {!initialTemplateName && (
            <div>
              <label className="block text-xs font-bold text-[#2F352F] mb-1">
                Select Approved WhatsApp Template *
              </label>
              {loadingTemplates ? (
                <div className="text-xs text-[#747A72] py-2">Loading Meta templates...</div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedTemplateName}
                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-medium text-[#2F352F] focus:outline-hidden focus:border-[#5F7A62] cursor-pointer"
                  >
                    {templates.map((tpl) => (
                      <option key={tpl.id || tpl.name} value={tpl.name}>
                        {tpl.name} ({tpl.language}) — {tpl.category} [{tpl.status}]
                      </option>
                    ))}
                    <option value="__custom__">+ Enter custom template name</option>
                  </select>

                  {selectedTemplateName === "__custom__" && (
                    <input
                      type="text"
                      placeholder="e.g. festive_offer_2026"
                      value={customTemplateInput}
                      onChange={(e) => setCustomTemplateInput(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-mono text-[#2F352F] focus:outline-hidden focus:border-[#5F7A62]"
                      required
                    />
                  )}
                </div>
              )}
            </div>
          )}

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
              Enter your test phone number to receive a live WhatsApp template verification message.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#2F352F] mb-1">
              Sample Customer Name (for preview substitution)
            </label>
            <input
              type="text"
              value={sampleName}
              onChange={(e) => setSampleName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full h-10 px-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs text-[#2F352F] focus:outline-hidden focus:border-[#5F7A62]"
            />
          </div>

          {/* Message Content Preview Box */}
          <div className="p-3.5 rounded-2xl bg-[#E8ECE5]/30 border border-[#CCD2C8] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F776D] block">
              Sample Text Preview
            </span>
            <p className="text-xs text-[#2F352F] font-sans whitespace-pre-wrap leading-relaxed">
              {activePreview}
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
              disabled={loading || !testPhone.trim() || !activeTemplateName}
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
