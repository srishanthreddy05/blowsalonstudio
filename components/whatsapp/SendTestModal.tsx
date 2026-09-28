"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Send, AlertCircle, CheckCircle2, Phone, Sparkles, Info, Check } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Template selection state if not passed in props
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState(initialTemplateName || "");
  const [customTemplateInput, setCustomTemplateInput] = useState("");

  // Dynamic variable state: { "1": "val1", "2": "val2", ... }
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({});

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

  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.name === selectedTemplateName);
  }, [templates, selectedTemplateName]);

  const activeTemplateName =
    selectedTemplateName === "__custom__"
      ? customTemplateInput.trim()
      : selectedTemplateName || initialTemplateName || customTemplateInput.trim();

  const activeLanguage =
    initialTemplateLanguage || currentTemplate?.language || "en_US";

  const activePreview =
    initialBodyTextPreview ||
    currentTemplate?.bodyText ||
    "Hello, here is your update from BLOW SALON!";

  // Calculate required variable count dynamically based on the active template
  const variableCount = useMemo(() => {
    if (activeTemplateName === "3p_direct_integration_test_template") {
      return 0;
    }
    if (currentTemplate) {
      return currentTemplate.variableCount || 0;
    }
    if (initialTemplateVariables && Object.keys(initialTemplateVariables).length > 0) {
      return Object.keys(initialTemplateVariables).length;
    }
    const matches = (activePreview || "").match(/\{\{(\d+)\}\}/g);
    return matches ? new Set(matches.map((m) => m.replace(/\D/g, ""))).size : 0;
  }, [currentTemplate, activeTemplateName, initialTemplateVariables, activePreview]);

  // Sync customVariables whenever active template or variableCount changes
  useEffect(() => {
    if (variableCount === 0) {
      setCustomVariables({});
    } else {
      const newVars: Record<string, string> = {};
      for (let i = 1; i <= variableCount; i++) {
        const key = String(i);
        if (initialTemplateVariables && initialTemplateVariables[key]) {
          newVars[key] = initialTemplateVariables[key];
        } else if (i === 1) {
          newVars[key] = "Rahul Sharma";
        } else if (i === 2) {
          newVars[key] = "BLOW SALON";
        } else {
          newVars[key] = `Value ${i}`;
        }
      }
      setCustomVariables(newVars);
    }
  }, [variableCount, initialTemplateVariables, selectedTemplateName]);

  if (!isOpen) return null;

  // Generate live interpolated preview
  const interpolatedPreview = useMemo(() => {
    let text = activePreview;
    if (variableCount === 0) return text;

    for (let i = 1; i <= variableCount; i++) {
      const key = String(i);
      const val = customVariables[key] || `{{${i}}}`;
      text = text.replace(new RegExp(`\\{\\{${i}\\}\\}`, "g"), val);
    }
    return text;
  }, [activePreview, variableCount, customVariables]);

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
      // If variableCount is 0, send completely empty variables object so zero parameters are passed
      const payloadVariables = variableCount > 0 ? customVariables : {};

      const res = await whatsappService.sendTestTemplate({
        testPhone: testPhone.trim(),
        templateName: activeTemplateName,
        templateLanguage: activeLanguage,
        templateVariables: payloadVariables,
        sampleCustomerName: customVariables["1"] || "Test Customer",
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
                        {tpl.name} ({tpl.language}) — {tpl.category} [{tpl.status}] • {tpl.variableCount || 0} vars
                      </option>
                    ))}
                    <option value="__custom__">+ Enter custom template name</option>
                  </select>

                  {selectedTemplateName === "__custom__" && (
                    <input
                      type="text"
                      placeholder="e.g. 3p_direct_integration_test_template"
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
              Enter your test phone number to receive a live WhatsApp template verification message.
            </p>
          </div>

          {/* Dynamic Template Variables */}
          {variableCount === 0 ? (
            <div className="p-3 rounded-2xl bg-[#FAF4E8]/60 border border-[#B18A45]/30 text-xs flex items-center gap-2">
              <Sparkles size={15} className="text-[#B18A45] shrink-0" />
              <span className="text-[#2F352F]">
                Template requires <strong>0 dynamic variables</strong>. It will be dispatched directly with 0 parameters.
              </span>
            </div>
          ) : (
            <div className="space-y-2 p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F776D] block">
                Required Template Variables ({variableCount})
              </span>
              <div className="space-y-2">
                {Array.from({ length: variableCount }).map((_, idx) => {
                  const varNum = String(idx + 1);
                  return (
                    <div key={varNum} className="space-y-1">
                      <label className="text-[11px] font-semibold text-[#2F352F] flex items-center gap-1">
                        <span>Variable</span>
                        <code className="bg-white px-1.5 py-0.5 rounded border border-[#CCD2C8] text-[10px] text-[#5F7A62]">
                          {`{{${varNum}}}`}
                        </code>
                      </label>
                      <input
                        type="text"
                        value={customVariables[varNum] || ""}
                        onChange={(e) =>
                          setCustomVariables((prev) => ({
                            ...prev,
                            [varNum]: e.target.value,
                          }))
                        }
                        placeholder={varNum === "1" ? "e.g. Rahul Sharma" : `Value for {{${varNum}}}`}
                        className="w-full h-9 px-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs text-[#2F352F] focus:outline-hidden focus:border-[#5F7A62]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Message Content Preview Box */}
          <div className="p-3.5 rounded-2xl bg-[#E8ECE5]/30 border border-[#CCD2C8] space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F776D] block">
              Sample Text Preview
            </span>
            <p className="text-xs text-[#2F352F] font-sans whitespace-pre-wrap leading-relaxed">
              {interpolatedPreview}
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
