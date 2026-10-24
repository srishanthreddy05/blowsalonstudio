"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Languages,
  CheckCircle2,
  Clock,
  Smartphone,
  Info,
} from "lucide-react";
import type {
  CreateWhatsAppTemplateRequest,
  WhatsAppTemplateComponent,
} from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { toast } from "react-hot-toast";

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateCreated: () => void;
}

export function CreateTemplateModal({
  isOpen,
  onClose,
  onTemplateCreated,
}: CreateTemplateModalProps) {
  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"UTILITY" | "MARKETING" | "AUTHENTICATION">("UTILITY");
  const [language, setLanguage] = useState("en");

  // Components state
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT">("NONE");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");

  // Buttons state
  const [hasButtons, setHasButtons] = useState(false);
  const [buttons, setButtons] = useState<
    Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phone_number?: string }>
  >([]);

  // Sample values map: e.g. { "1": "Ananya", "2": "₹1,500" }
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extract variables from body text sequentially
  const detectedVariables = useMemo(() => {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const indices = matches.map((m) => parseInt(m.replace(/\D/g, ""), 10));
    return Array.from(new Set(indices)).sort((a, b) => a - b);
  }, [bodyText]);

  // Insert variable into body at cursor or end
  const handleInsertVariable = () => {
    const nextVar = detectedVariables.length + 1;
    setBodyText((prev) => prev + ` {{${nextVar}}}`);
  };

  // Add button
  const handleAddButton = () => {
    if (buttons.length >= 3) {
      toast.error("Meta allows a maximum of 3 buttons.");
      return;
    }
    setButtons((prev) => [...prev, { type: "QUICK_REPLY", text: "Book Appointment" }]);
  };

  const handleRemoveButton = (idx: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== idx));
  };

  // Live preview text with sample values interpolated
  const previewBody = useMemo(() => {
    if (!bodyText) return "Your message text will appear here...";
    let text = bodyText;
    detectedVariables.forEach((num) => {
      const sample = sampleValues[String(num)] || `[Variable {{${num}}}]`;
      text = text.replaceAll(`{{${num}}}`, sample);
    });
    return text;
  }, [bodyText, detectedVariables, sampleValues]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = name.trim().toLowerCase();
    if (!cleanName) {
      setErrorMessage("Template name is required.");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanName)) {
      setErrorMessage(
        "Template name can only contain lowercase letters, numbers, and underscores (e.g. blow_salon_discount)."
      );
      return;
    }

    if (!bodyText.trim()) {
      setErrorMessage("Body text is required.");
      return;
    }

    // Verify sequential variables
    for (let i = 0; i < detectedVariables.length; i++) {
      if (detectedVariables[i] !== i + 1) {
        setErrorMessage(
          `Variable placeholders must be in sequential order without skipping. Missing {{${i + 1}}}.`
        );
        return;
      }
    }

    // Verify sample values
    for (const vNum of detectedVariables) {
      const val = sampleValues[String(vNum)];
      if (!val || !val.trim()) {
        setErrorMessage(`Please provide a sample value for variable {{${vNum}}}.`);
        return;
      }
    }

    // Build components
    const components: WhatsAppTemplateComponent[] = [];

    if (headerType === "TEXT" && headerText.trim()) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        text: headerText.trim(),
      });
    }

    // Body component
    const bodyComp: WhatsAppTemplateComponent = {
      type: "BODY",
      text: bodyText.trim(),
    };

    if (detectedVariables.length > 0) {
      const samplesArray = detectedVariables.map((v) => sampleValues[String(v)] || "Sample");
      bodyComp.example = {
        body_text: [samplesArray],
      };
    }
    components.push(bodyComp);

    // Footer component
    if (footerText.trim()) {
      components.push({
        type: "FOOTER",
        text: footerText.trim(),
      });
    }

    // Buttons component
    if (hasButtons && buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((b) => ({
          type: b.type,
          text: b.text.trim(),
          url: b.type === "URL" ? b.url : undefined,
          phone_number: b.type === "PHONE_NUMBER" ? b.phone_number : undefined,
        })),
      });
    }

    const payload: CreateWhatsAppTemplateRequest = {
      name: cleanName,
      category,
      language,
      components,
    };

    setSubmitting(true);
    try {
      const result = await whatsappService.createTemplate(payload);
      toast.success(
        `Template "${cleanName}" submitted to Meta! Status: ${result.status || "PENDING / IN_REVIEW"}`
      );
      onTemplateCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create template";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#292D29]/50 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xl z-10 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-6 border-b border-[#E0E4DD] flex items-center justify-between bg-[#F7F7F4]">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                Create WhatsApp Message Template
              </h2>
              <p className="text-xs text-[#747A72]">
                Submit official template to Meta for WhatsApp Business compliance review
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="size-8 grid place-items-center rounded-xl hover:bg-[#E8ECE5] text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Split into Form (Left) and Live WhatsApp Preview (Right) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: 7 cols */}
          <form id="create-template-form" onSubmit={handleSubmit} className="lg:col-span-7 space-y-4">
            {errorMessage && (
              <div className="p-4 rounded-2xl bg-[#FBEBEB] border border-[#F8D7D7] flex items-start gap-2.5 text-xs text-[#B55B5B]">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Template Name & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#747A72] block">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. blow_salon_discount"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                  }
                  className="w-full h-10 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-mono text-[#2F352F] focus:border-[#5F7A62] focus:outline-none"
                />
                <span className="text-[10px] text-[#747A72] block">
                  Lowercase alphanumeric and underscores only.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#747A72] block">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-semibold text-[#2F352F] focus:border-[#5F7A62] focus:outline-none cursor-pointer"
                >
                  <option value="UTILITY">Utility (Receipts, Confirmations)</option>
                  <option value="MARKETING">Marketing (Promotions, Offers)</option>
                  <option value="AUTHENTICATION">Authentication (OTPs)</option>
                </select>
              </div>
            </div>

            {/* Language Selection */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#747A72] block">
                Language *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { code: "en", label: "English (en)" },
                  { code: "en_US", label: "English US (en_US)" },
                  { code: "hi", label: "Hindi (hi)" },
                ].map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setLanguage(item.code)}
                    className={`h-9 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      language === item.code
                        ? "bg-[#5F7A62] text-white border-[#5F7A62]"
                        : "bg-[#FFFFFF] text-[#2F352F] border-[#CCD2C8] hover:bg-[#F7F7F4]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Header Component */}
            <div className="space-y-2 pt-2 border-t border-[#E0E4DD]">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#747A72]">
                  Header (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => setHeaderType(headerType === "NONE" ? "TEXT" : "NONE")}
                  className="text-xs font-semibold text-[#5F7A62] hover:underline cursor-pointer"
                >
                  {headerType === "NONE" ? "+ Add Text Header" : "Remove Header"}
                </button>
              </div>
              {headerType === "TEXT" && (
                <input
                  type="text"
                  placeholder="e.g. Appointment Update"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  maxLength={60}
                  className="w-full h-10 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-semibold text-[#2F352F] focus:border-[#5F7A62] focus:outline-none"
                />
              )}
            </div>

            {/* Body Component */}
            <div className="space-y-2 pt-2 border-t border-[#E0E4DD]">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#747A72]">
                  Message Body *
                </label>
                <button
                  type="button"
                  onClick={handleInsertVariable}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#5F7A62] hover:underline cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Insert Variable {"{{x}}"}</span>
                </button>
              </div>
              <textarea
                rows={4}
                required
                maxLength={1024}
                placeholder="Hello {{1}} 👋, thank you for choosing BLOW SALON! Your appointment for {{2}} is confirmed."
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full p-3.5 rounded-2xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs text-[#2F352F] focus:border-[#5F7A62] focus:outline-none leading-relaxed"
              />
              <div className="flex items-center justify-between text-[10px] text-[#747A72]">
                <span>
                  Use <code className="bg-[#E8ECE5] px-1 py-0.5 rounded font-mono">{"{{1}}"}</code>,{" "}
                  <code className="bg-[#E8ECE5] px-1 py-0.5 rounded font-mono">{"{{2}}"}</code> for
                  dynamic variables.
                </span>
                <span>{bodyText.length} / 1024 chars</span>
              </div>
            </div>

            {/* Variable Samples Section (Required by Meta) */}
            {detectedVariables.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#FAF4E8] border border-[#F3E2B8] space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#7A5C0A]">
                  <Info size={14} />
                  <span>Meta Requires Sample Values for Variables</span>
                </div>
                <div className="space-y-2">
                  {detectedVariables.map((vNum) => (
                    <div key={vNum} className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold text-[#5C4A0A] w-12 shrink-0">
                        {"{{" + vNum + "}}"}
                      </span>
                      <input
                        type="text"
                        required
                        placeholder={`Sample value for {{${vNum}}} (e.g. Rahul)`}
                        value={sampleValues[String(vNum)] || ""}
                        onChange={(e) =>
                          setSampleValues((prev) => ({
                            ...prev,
                            [String(vNum)]: e.target.value,
                          }))
                        }
                        className="flex-1 h-9 px-3 rounded-xl border border-[#EDD98A] bg-[#FFFFFF] text-xs text-[#2F352F] focus:outline-none focus:border-[#B18A45]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Footer */}
            <div className="space-y-2 pt-2 border-t border-[#E0E4DD]">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#747A72] block">
                Footer Text (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Reply STOP to opt out."
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                maxLength={60}
                className="w-full h-10 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs text-[#2F352F] focus:border-[#5F7A62] focus:outline-none"
              />
            </div>

            {/* Optional Buttons */}
            <div className="space-y-2 pt-2 border-t border-[#E0E4DD]">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#747A72]">
                  Interactive Buttons (Optional)
                </label>
                {!hasButtons ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHasButtons(true);
                      handleAddButton();
                    }}
                    className="text-xs font-semibold text-[#5F7A62] hover:underline cursor-pointer"
                  >
                    + Add Buttons
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setHasButtons(false);
                      setButtons([]);
                    }}
                    className="text-xs font-semibold text-[#B55B5B] hover:underline cursor-pointer"
                  >
                    Remove Buttons
                  </button>
                )}
              </div>

              {hasButtons && (
                <div className="space-y-2">
                  {buttons.map((btn, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] flex items-center gap-2"
                    >
                      <select
                        value={btn.type}
                        onChange={(e) => {
                          const newType = e.target.value as any;
                          setButtons((prev) =>
                            prev.map((b, i) => (i === idx ? { ...b, type: newType } : b))
                          );
                        }}
                        className="h-8 px-2 rounded-lg border border-[#CCD2C8] bg-white text-[11px] font-semibold text-[#2F352F]"
                      >
                        <option value="QUICK_REPLY">Quick Reply</option>
                        <option value="PHONE_NUMBER">Call Number</option>
                        <option value="URL">Visit URL</option>
                      </select>

                      <input
                        type="text"
                        placeholder="Button Label"
                        value={btn.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setButtons((prev) =>
                            prev.map((b, i) => (i === idx ? { ...b, text: val } : b))
                          );
                        }}
                        className="flex-1 h-8 px-2.5 rounded-lg border border-[#CCD2C8] bg-white text-[11px] text-[#2F352F]"
                      />

                      {btn.type === "PHONE_NUMBER" && (
                        <input
                          type="text"
                          placeholder="+91..."
                          value={btn.phone_number || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setButtons((prev) =>
                              prev.map((b, i) => (i === idx ? { ...b, phone_number: val } : b))
                            );
                          }}
                          className="w-28 h-8 px-2 rounded-lg border border-[#CCD2C8] bg-white text-[11px] font-mono"
                        />
                      )}

                      {btn.type === "URL" && (
                        <input
                          type="text"
                          placeholder="https://..."
                          value={btn.url || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setButtons((prev) =>
                              prev.map((b, i) => (i === idx ? { ...b, url: val } : b))
                            );
                          }}
                          className="w-32 h-8 px-2 rounded-lg border border-[#CCD2C8] bg-white text-[11px] font-mono"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveButton(idx)}
                        className="size-7 grid place-items-center text-[#B55B5B] hover:bg-[#FBEBEB] rounded-lg cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  {buttons.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddButton}
                      className="text-xs text-[#5F7A62] font-semibold hover:underline flex items-center gap-1 cursor-pointer pt-1"
                    >
                      <Plus size={12} />
                      <span>Add another button ({buttons.length}/3)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>

          {/* Right Column: Live Mobile WhatsApp Chat Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-start bg-[#EFEAE2] p-5 rounded-3xl border border-[#CCD2C8] space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] flex items-center gap-1.5">
              <Smartphone size={13} />
              Live WhatsApp Customer Preview
            </span>

            {/* Realistic WhatsApp Chat Bubble */}
            <div className="w-full max-w-xs bg-[#FFFFFF] rounded-2xl shadow-md p-4 space-y-2 border border-[#E0E4DD] text-[#292D29]">
              {/* Header */}
              {headerType === "TEXT" && headerText.trim() && (
                <div className="font-bold text-xs text-[#2F352F] pb-1 border-b border-[#E0E4DD]/60">
                  {headerText}
                </div>
              )}

              {/* Body */}
              <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans text-[#2F352F]">
                {previewBody}
              </div>

              {/* Footer */}
              {footerText.trim() && (
                <div className="text-[10px] text-[#747A72] pt-1">{footerText}</div>
              )}

              {/* Timestamp */}
              <div className="text-right text-[9px] text-[#8C9389] font-mono pt-1">
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
              </div>

              {/* Action Buttons */}
              {hasButtons && buttons.length > 0 && (
                <div className="pt-2 border-t border-[#E0E4DD] space-y-1.5">
                  {buttons.map((b, i) => (
                    <div
                      key={i}
                      className="text-center py-1.5 px-3 rounded-xl bg-[#F7F7F4] border border-[#CCD2C8] text-xs font-semibold text-[#5F7A62]"
                    >
                      {b.text || "Action"}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[11px] text-[#747A72] text-center max-w-xs">
              Preview updates in real time using your sample variable values.
            </p>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-5 border-t border-[#E0E4DD] bg-[#F7F7F4] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#747A72] hover:bg-[#E8ECE5] transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            form="create-template-form"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#5F7A62] text-white text-xs font-bold hover:bg-[#4E6651] shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Submitting to Meta...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Submit Template to Meta</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
