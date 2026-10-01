"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Send,
  Sparkles,
  Clock,
  Check,
  CheckCheck,
  AlertTriangle,
  Info,
  ChevronRight,
  ChevronLeft,
  User,
  RotateCcw,
  X,
  FileText,
  ShieldCheck,
  Receipt,
  MessageSquare,
} from "lucide-react";
import type {
  WhatsAppConversation,
  WhatsAppMessageRecord,
  WhatsAppTemplate,
  WhatsAppMessageStatus,
} from "@/types/whatsapp";
import { formatDisplayDate } from "@/lib/utils/date";
import * as whatsappService from "@/services/whatsapp";
import { toast } from "react-hot-toast";

interface ChatThreadProps {
  conversation: WhatsAppConversation;
  messages: WhatsAppMessageRecord[];
  loadingMessages?: boolean;
  whatsappEnabled?: boolean;
  onSendMessage: (payload: {
    message?: string;
    type?: "text" | "template";
    templateName?: string;
    templateLanguage?: string;
    templateVariables?: Record<string, string>;
  }) => Promise<boolean>;
  onToggleCustomerPanel?: () => void;
  showCustomerPanel?: boolean;
}

function formatMessageTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function StatusIndicator({ status }: { status?: WhatsAppMessageStatus }) {
  if (!status) return null;
  if (status === "READ") {
    return (
      <span title="Read by customer">
        <CheckCheck size={14} className="text-[#38503B] shrink-0" />
      </span>
    );
  }
  if (status === "DELIVERED") {
    return (
      <span title="Delivered to customer">
        <CheckCheck size={14} className="text-[#747A72] shrink-0" />
      </span>
    );
  }
  if (status === "SENT") {
    return (
      <span title="Sent from salon">
        <Check size={14} className="text-[#747A72] shrink-0" />
      </span>
    );
  }
  if (status === "SENDING" || status === "PENDING") {
    return (
      <span title="Sending...">
        <Clock size={13} className="text-[#B18A45] shrink-0 animate-spin" />
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span title="Delivery failed">
        <AlertTriangle size={13} className="text-[#B55B5B] shrink-0" />
      </span>
    );
  }
  return null;
}

export function ChatThread({
  conversation,
  messages,
  loadingMessages = false,
  whatsappEnabled = true,
  onSendMessage,
  onToggleCustomerPanel,
  showCustomerPanel = true,
}: ChatThreadProps) {
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check 24-hour customer service window
  const windowStatus = useMemo(() => {
    if (!conversation.lastInboundAt) {
      return { isOpen: false, remainingHours: 0, text: "Template Required" };
    }
    const lastInboundTime = new Date(conversation.lastInboundAt).getTime();
    const diffMs = Date.now() - lastInboundTime;
    const maxWindowMs = 24 * 60 * 60 * 1000;

    if (diffMs < maxWindowMs) {
      const remainingHours = Math.max(1, Math.round((maxWindowMs - diffMs) / (60 * 60 * 1000)));
      return {
        isOpen: true,
        remainingHours,
        text: `Customer service window open (~${remainingHours}h remaining)`,
      };
    }

    return { isOpen: false, remainingHours: 0, text: "24-hr window expired (Template required)" };
  }, [conversation.lastInboundAt]);

  // Load available templates when modal opens
  const handleOpenTemplateModal = async () => {
    setTemplateModalOpen(true);
    setLoadingTemplates(true);
    try {
      const list = await whatsappService.getTemplates("campaign");
      setTemplates(list);
      if (list.length > 0 && !selectedTemplate) {
        setSelectedTemplate(list[0]);
        // Set default customer name for variable 1 if available
        setTemplateVars({
          "1": conversation.customerName || "Customer",
          "2": "Special Offer",
        });
      }
    } catch {
      toast.error("Failed to load approved templates");
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || sending) return;

    if (!whatsappEnabled) {
      toast.error("WhatsApp messaging is currently disabled in Settings.");
      return;
    }

    if (!windowStatus.isOpen) {
      toast.error("The 24-hour customer service window has expired. Please select a template.");
      setTemplateModalOpen(true);
      return;
    }

    setSending(true);
    const textToSend = inputText.trim();
    setInputText("");

    const ok = await onSendMessage({
      type: "text",
      message: textToSend,
    });

    if (!ok) {
      setInputText(textToSend); // restore on failure
    }
    setSending(false);
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate || sending) return;

    setSending(true);
    const ok = await onSendMessage({
      type: "template",
      templateName: selectedTemplate.name,
      templateLanguage: selectedTemplate.language,
      templateVariables: templateVars,
    });

    if (ok) {
      setTemplateModalOpen(false);
      toast.success("Template message sent successfully!");
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF4E8]/20 relative">
      {/* Thread Header */}
      <div className="h-16 px-4 border-b border-[#E0E4DD] bg-[#FFFFFF] flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-full bg-[#5F7A62] text-white grid place-items-center font-bold text-xs shrink-0">
            {(conversation.customerName || "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-sm font-bold text-[#2F352F] truncate">
                {conversation.customerName || "Customer"}
              </h3>
              {conversation.customerId && (
                <span className="px-1.5 py-0.2 rounded bg-[#E8ECE5] text-[#5F7A62] text-[10px] font-semibold">
                  Linked Client
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#747A72] font-mono truncate">
              {conversation.phoneNumber || conversation.normalizedPhone}
            </p>
          </div>
        </div>

        {/* 24-hr Window status and Customer Panel Toggle */}
        <div className="flex items-center gap-3">
          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${
              windowStatus.isOpen
                ? "bg-[#E8ECE5] text-[#5F7A62] border-[#CCD2C8]"
                : "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30"
            }`}
            title={windowStatus.text}
          >
            <Clock size={12} />
            <span>{windowStatus.text}</span>
          </div>

          {onToggleCustomerPanel && (
            <button
              type="button"
              onClick={onToggleCustomerPanel}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                showCustomerPanel
                  ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                  : "bg-[#FFFFFF] text-[#747A72] border-[#E0E4DD] hover:text-[#2F352F]"
              }`}
              title={showCustomerPanel ? "Hide customer details" : "Show customer details"}
            >
              <User size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 [scrollbar-width:thin]">
        {loadingMessages && messages.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#747A72]">
            <Clock size={18} className="mx-auto mb-2 animate-spin text-[#747A72]" />
            Loading chat history...
          </div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#747A72] space-y-2">
            <MessageSquare size={24} className="mx-auto text-[#CCD2C8]" />
            <p className="font-semibold text-[#2F352F]">No messages in this conversation yet</p>
            <p className="text-[11px] text-[#747A72]">
              {windowStatus.isOpen
                ? "Type a message below to chat with this customer."
                : "Send an approved template message to start the conversation."}
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isInbound = msg.direction === "INBOUND";
            const isInvoice = msg.messageType === "INVOICE_RECEIPT";
            const isTemplate = msg.messageType === "INBOX_TEMPLATE" || Boolean(msg.templateName);

            return (
              <div
                key={msg.id || idx}
                className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs space-y-1.5 break-words ${
                    isInbound
                      ? "bg-[#FFFFFF] text-[#2F352F] border border-[#E0E4DD] rounded-tl-xs"
                      : "bg-[#E8ECE5] text-[#2F352F] border border-[#CCD2C8] rounded-tr-xs"
                  }`}
                >
                  {/* Badge for template / invoice */}
                  {isInvoice && (
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#5F7A62] pb-1 border-b border-[#CCD2C8]">
                      <Receipt size={12} />
                      <span>Invoice Receipt</span>
                    </div>
                  )}

                  {isTemplate && !isInvoice && (
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#B18A45] pb-1 border-b border-[#CCD2C8]">
                      <Sparkles size={12} />
                      <span>Meta Template ({msg.templateName})</span>
                    </div>
                  )}

                  {/* Message body */}
                  <div className="whitespace-pre-wrap">{msg.message}</div>

                  {/* Timestamp & Status */}
                  <div className="flex items-center justify-end gap-1.5 pt-0.5 text-[10px] text-[#747A72]">
                    <span>{formatMessageTime(msg.createdAt)}</span>
                    {!isInbound && <StatusIndicator status={msg.status} />}
                  </div>

                  {/* Error banner if failed */}
                  {msg.status === "FAILED" && msg.errorMessage && (
                    <div className="p-2 rounded-lg bg-[#FBEBEB] text-[#B55B5B] text-[10px] font-medium border border-[#F8D7D7]">
                      {msg.errorMessage}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input / Action Bar */}
      <div className="p-3 border-t border-[#E0E4DD] bg-[#FFFFFF] shrink-0 space-y-2 shadow-sm">
        {!whatsappEnabled ? (
          <div className="p-3 rounded-2xl bg-[#FBEBEB] border border-[#F8D7D7] text-center text-xs text-[#B55B5B] font-semibold">
            WhatsApp messaging is currently turned OFF. Enable it in Settings to send replies.
          </div>
        ) : !windowStatus.isOpen ? (
          /* Window Expired State - Template Required */
          <div className="p-3.5 rounded-2xl bg-[#FAF4E8] border border-[#B18A45]/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#8C6D2D]">
                <AlertTriangle size={14} className="text-[#B18A45]" />
                <span>24-Hour Window Closed</span>
              </div>
              <span className="text-[10px] text-[#747A72]">Meta Policy</span>
            </div>
            <p className="text-[11px] text-[#747A72] leading-relaxed">
              Meta WhatsApp Cloud API requires an approved template message when initiating contact or replying after 24 hours.
            </p>
            <button
              type="button"
              onClick={handleOpenTemplateModal}
              className="w-full h-9 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <Sparkles size={14} />
              <span>Select Approved WhatsApp Template</span>
            </button>
          </div>
        ) : (
          /* Normal Free-Form Text Input Bar */
          <form onSubmit={handleSendText} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your WhatsApp message... (Press Enter to send, Shift+Enter for new line)"
                rows={1}
                className="w-full min-h-[42px] max-h-32 p-2.5 pr-10 rounded-2xl border border-[#CCD2C8] bg-[#F7F7F4] text-xs text-[#2F352F] placeholder-[#747A72] focus:outline-none focus:border-[#5F7A62] resize-none transition"
              />
              <button
                type="button"
                onClick={handleOpenTemplateModal}
                title="Send an approved template"
                className="absolute right-2.5 bottom-2.5 text-[#747A72] hover:text-[#5F7A62] p-1 rounded-lg transition"
              >
                <Sparkles size={16} />
              </button>
            </div>

            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="size-10 rounded-2xl bg-[#5F7A62] hover:bg-[#4E6450] text-white grid place-items-center shadow-xs transition cursor-pointer disabled:opacity-50 shrink-0"
              title="Send Message"
            >
              <Send size={16} />
            </button>
          </form>
        )}
      </div>

      {/* Template Selection Modal */}
      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/50 backdrop-blur-xs"
            onClick={() => setTemplateModalOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl z-10 animate-in zoom-in-95 duration-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-xl bg-[#FAF4E8] text-[#B18A45]">
                  <Sparkles size={16} />
                </div>
                <h3 className="font-serif text-base font-bold text-[#2F352F]">
                  Send Approved WhatsApp Template
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                className="text-[#747A72] hover:text-[#2F352F]"
              >
                <X size={16} />
              </button>
            </div>

            {loadingTemplates ? (
              <div className="p-8 text-center text-xs text-[#747A72]">
                <Clock size={18} className="mx-auto mb-2 animate-spin" />
                Loading Meta templates...
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-[#6F776D] uppercase tracking-wider block mb-1">
                    Select Template
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {templates.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onClick={() => {
                          setSelectedTemplate(tmpl);
                          setTemplateVars({
                            "1": conversation.customerName || "Customer",
                            "2": "Special Offer",
                          });
                        }}
                        className={`w-full text-left p-3 rounded-2xl border transition cursor-pointer ${
                          selectedTemplate?.name === tmpl.name
                            ? "border-[#5F7A62] bg-[#E8ECE5]"
                            : "border-[#E0E4DD] bg-[#F7F7F4] hover:border-[#CCD2C8]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[#2F352F]">
                            {tmpl.name}
                          </span>
                          <span className="text-[10px] font-bold text-[#5F7A62] uppercase bg-[#FFFFFF] px-2 py-0.5 rounded-full border border-[#CCD2C8]">
                            {tmpl.category}
                          </span>
                        </div>
                        {tmpl.bodyText && (
                          <p className="text-[11px] text-[#747A72] mt-1 line-clamp-2">
                            {tmpl.bodyText}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic variables input if template requires variables */}
                {selectedTemplate && selectedTemplate.variableCount > 0 && (
                  <div className="space-y-2 p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
                    <span className="text-[11px] font-bold text-[#6F776D] uppercase tracking-wider block">
                      Template Variables ({selectedTemplate.variableCount})
                    </span>
                    <div className="space-y-2">
                      {Array.from({ length: selectedTemplate.variableCount }).map((_, i) => {
                        const key = String(i + 1);
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-[#747A72] w-8">
                              {"{{" + key + "}}"}
                            </span>
                            <input
                              type="text"
                              value={templateVars[key] || ""}
                              onChange={(e) =>
                                setTemplateVars((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              placeholder={`Value for variable {{${key}}}`}
                              className="flex-1 h-9 px-3 rounded-xl border border-[#CCD2C8] bg-white text-xs text-[#2F352F] focus:outline-none focus:border-[#5F7A62]"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E0E4DD]">
                  <button
                    type="button"
                    onClick={() => setTemplateModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[#CCD2C8] text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!selectedTemplate || sending}
                    onClick={handleSendTemplate}
                    className="px-5 py-2 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Template"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
