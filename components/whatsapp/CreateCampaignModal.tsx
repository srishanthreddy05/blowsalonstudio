"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X,
  Users,
  Sparkles,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Search,
  Check,
  ShieldCheck,
  Smartphone,
  ChevronRight,
  Info,
} from "lucide-react";
import { toast } from "react-hot-toast";
import * as whatsappService from "@/services/whatsapp";
import * as customersService from "@/services/customers";
import type { Customer } from "@/types/customer";
import type { WhatsAppTemplate, WhatsAppAudienceType, WhatsAppCampaign } from "@/types/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { SendTestModal } from "./SendTestModal";

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCampaignCreated: (campaign: WhatsAppCampaign) => void;
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  onCampaignCreated,
}: CreateCampaignModalProps) {
  const [name, setName] = useState("");
  const [audienceType, setAudienceType] = useState<WhatsAppAudienceType>("ALL");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  // Templates
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>("");
  const [customTemplateInput, setCustomTemplateInput] = useState("");
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  // UI Flow
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load Customers and Templates
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      setLoadingCustomers(true);
      setLoadingTemplates(true);

      try {
        const [custList, tplList] = await Promise.all([
          customersService.getAll(),
          whatsappService.getTemplates(),
        ]);
        setCustomers(custList || []);
        setTemplates(tplList || []);

        if (tplList && tplList.length > 0) {
          const firstApproved = tplList.find((t) => t.status === "APPROVED") || tplList[0];
          setSelectedTemplateName(firstApproved.name);
        }
      } catch (err) {
        console.error("Error loading campaign prerequisites:", err);
      } finally {
        setLoadingCustomers(false);
        setLoadingTemplates(false);
      }
    }

    loadData();
  }, [isOpen]);

  // Selected template object
  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.name === selectedTemplateName);
  }, [templates, selectedTemplateName]);

  // Effective Template Name
  const effectiveTemplateName = selectedTemplateName === "__custom__"
    ? customTemplateInput.trim()
    : selectedTemplateName || customTemplateInput.trim();

  // Audience Calculations
  const audienceStats = useMemo(() => {
    let segment: Customer[] = [];
    if (audienceType === "ALL") {
      segment = customers;
    } else if (audienceType === "REGULAR") {
      segment = customers.filter((c) => c.customerType === "regular");
    } else if (audienceType === "MEMBERSHIP") {
      segment = customers.filter((c) => c.customerType === "membership");
    } else if (audienceType === "CUSTOM") {
      const setIds = new Set(selectedCustomerIds);
      segment = customers.filter((c) => c.id && setIds.has(c.id));
    }

    let eligible = 0;
    let optedOut = 0;
    let invalidPhone = 0;

    for (const c of segment) {
      const norm = normalizePhoneNumber(c.phone);
      if (c.whatsappOptOut === true) {
        optedOut++;
      } else if (!norm.isValid) {
        invalidPhone++;
      } else {
        eligible++;
      }
    }

    return {
      total: segment.length,
      eligible,
      excluded: optedOut + invalidPhone,
      optedOut,
      invalidPhone,
    };
  }, [customers, audienceType, selectedCustomerIds]);

  // Calculate required variable count dynamically based on the active template
  const templateVarCount = useMemo(() => {
    if (effectiveTemplateName === "3p_direct_integration_test_template") return 0;
    if (activeTemplate) {
      return activeTemplate.variableCount ?? 0;
    }
    return 0;
  }, [activeTemplate, effectiveTemplateName]);

  // Sync templateVariables whenever active template or templateVarCount changes
  useEffect(() => {
    if (templateVarCount === 0) {
      setTemplateVariables({});
    } else {
      setTemplateVariables((prev) => {
        const next: Record<string, string> = {};
        for (let i = 1; i <= templateVarCount; i++) {
          const k = String(i);
          next[k] = prev[k] || (i === 1 ? "customer_name" : i === 2 ? "BLOW SALON" : "");
        }
        return next;
      });
    }
  }, [templateVarCount, selectedTemplateName]);

  // Generate live preview text
  const previewText = useMemo(() => {
    let body = activeTemplate?.bodyText || "Hello, here is your update from BLOW SALON.";
    if (templateVarCount === 0) return body;

    const varKeys = Object.keys(templateVariables);
    for (const k of varKeys) {
      const val = templateVariables[k] || `{{${k}}}`;
      let replacement = val;
      if (val === "customer_name" || val === "{{customer_name}}") replacement = "Rahul Sharma";
      else if (val === "salon_name" || val === "{{salon_name}}") replacement = "BLOW SALON";

      body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), replacement);
    }
    return body;
  }, [activeTemplate, templateVariables, templateVarCount]);

  // Search filtered customers for custom selection
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    );
  }, [customers, customerSearch]);

  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const ids = filteredCustomers.map((c) => c.id!).filter(Boolean);
    setSelectedCustomerIds(Array.from(new Set([...selectedCustomerIds, ...ids])));
  };

  const handleDeselectAll = () => {
    setSelectedCustomerIds([]);
  };

  // Variable change handler
  const handleVariableChange = (key: string, value: string) => {
    setTemplateVariables((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateAndSend = async (autoStartSend: boolean) => {
    if (!name.trim()) {
      toast.error("Please provide a campaign name.");
      return;
    }
    if (!effectiveTemplateName) {
      toast.error("Please select or enter an approved WhatsApp template name.");
      return;
    }
    if (audienceStats.eligible === 0) {
      toast.error("No eligible recipients found in the selected audience segment.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create Campaign
      const createRes = await whatsappService.createCampaign({
        name: name.trim(),
        templateName: effectiveTemplateName,
        templateLanguage: activeTemplate?.language || "en_US",
        templateCategory: activeTemplate?.category || "MARKETING",
        audienceType,
        customCustomerIds: audienceType === "CUSTOM" ? selectedCustomerIds : [],
        templateVariables,
      });

      const campaign = createRes.campaign;
      toast.success(`Campaign "${campaign.name}" created with ${campaign.eligibleCount} eligible recipients!`);

      // 2. Start Sending if confirmed
      if (autoStartSend && campaign.id) {
        toast.loading("Queuing and dispatching campaign messages...", { id: "send-campaign" });
        const sendRes = await whatsappService.sendCampaign(campaign.id);
        toast.success(`Campaign dispatched! Sent: ${sendRes.sentCount}, Failed: ${sendRes.failedCount}`, {
          id: "send-campaign",
        });
      }

      onCampaignCreated(campaign);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to execute campaign";
      toast.error(msg, { id: "send-campaign" });
    } finally {
      setSubmitting(false);
      setConfirmModalOpen(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#E0E4DD] rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E0E4DD] bg-[#F7F7F4] shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#E8ECE5] text-[#5F7A62] border border-[#CCD2C8]">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                Create WhatsApp Campaign
              </h2>
              <p className="text-xs text-[#747A72]">
                Deliver approved Meta WhatsApp templates to segmented customer audiences
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#747A72] hover:bg-[#E8ECE5] hover:text-[#2F352F] transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {/* 1. Campaign Name */}
          <div className="space-y-1.5">
            <label className="block font-bold text-[#2F352F] text-xs">
              1. Campaign Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Festive Glow Special Offer, Weekend Hair Spa Discount"
              className="w-full h-10 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-semibold text-[#2F352F] focus:outline-none focus:border-[#5F7A62]"
            />
          </div>

          {/* 2. Audience Segment Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-[#2F352F] text-xs">
                2. Target Audience Segment
              </label>
              <span className="text-[11px] text-[#747A72]">
                Total in Database: <strong className="text-[#2F352F]">{customers.length}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: "ALL", label: "All Customers", desc: "Every client" },
                { id: "REGULAR", label: "Regular Clients", desc: "Standard tier" },
                { id: "MEMBERSHIP", label: "Members Only", desc: "Active members" },
                { id: "CUSTOM", label: "Custom Selection", desc: "Choose clients" },
              ].map((aud) => (
                <button
                  key={aud.id}
                  type="button"
                  onClick={() => setAudienceType(aud.id as WhatsAppAudienceType)}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                    audienceType === aud.id
                      ? "bg-[#E8ECE5] border-[#5F7A62] text-[#2F352F] shadow-2xs"
                      : "bg-[#FFFFFF] border-[#CCD2C8] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F]"
                  }`}
                >
                  <span className="font-bold text-xs block text-[#2F352F]">{aud.label}</span>
                  <span className="text-[10px] text-[#747A72]">{aud.desc}</span>
                </button>
              ))}
            </div>

            {/* Custom Selection Table */}
            {audienceType === "CUSTOM" && (
              <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747A72]" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search customers by name or phone..."
                      className="w-full h-8 pl-9 pr-3 rounded-xl border border-[#CCD2C8] bg-white text-xs text-[#2F352F] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="px-2.5 py-1 rounded-lg border border-[#CCD2C8] bg-white text-[11px] font-semibold text-[#2F352F] hover:bg-[#E8ECE5] transition cursor-pointer"
                    >
                      Select All Filtered ({filteredCustomers.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-2.5 py-1 rounded-lg border border-[#CCD2C8] bg-white text-[11px] text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                <div className="max-h-44 overflow-y-auto border border-[#E0E4DD] rounded-xl bg-white divide-y divide-[#E0E4DD]">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-4 text-center text-[#747A72] italic text-[11px]">
                      No customers match your search.
                    </div>
                  ) : (
                    filteredCustomers.map((c) => {
                      const isSelected = selectedCustomerIds.includes(c.id!);
                      const isOptedOut = c.whatsappOptOut === true;
                      return (
                        <label
                          key={c.id}
                          className="flex items-center justify-between px-3.5 py-2 hover:bg-[#F7F7F4] cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectCustomer(c.id!)}
                              className="w-4 h-4 rounded text-[#5F7A62] accent-[#5F7A62]"
                            />
                            <div>
                              <span className="font-semibold text-[#2F352F] block">{c.name}</span>
                              <span className="font-mono text-[10px] text-[#747A72]">{c.phone}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.customerType === "membership" && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30">
                                Member
                              </span>
                            )}
                            {isOptedOut && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#FBEBEB] text-[#B55B5B] border border-[#F8D7D7]">
                                Opted Out
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="text-[11px] font-semibold text-[#5F7A62]">
                  {selectedCustomerIds.length} customer{selectedCustomerIds.length !== 1 ? "s" : ""} selected
                </div>
              </div>
            )}

            {/* Recipient Count & Opt-in Breakdown Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-[#FAF4E8]/50 border border-[#B18A45]/30">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-xl bg-white text-[#5F7A62] shadow-2xs shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                    Eligible Recipients
                  </span>
                  <span className="font-mono text-sm font-extrabold text-[#5F7A62]">
                    {audienceStats.eligible}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-xl bg-white text-[#B55B5B] shadow-2xs shrink-0">
                  <AlertCircle size={16} />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                    Excluded (Opt-out / Invalid)
                  </span>
                  <span className="font-mono text-sm font-extrabold text-[#B55B5B]">
                    {audienceStats.excluded}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-xl bg-white text-[#2F352F] shadow-2xs shrink-0">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                    Total Audience Size
                  </span>
                  <span className="font-mono text-sm font-extrabold text-[#2F352F]">
                    {audienceStats.total}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. WhatsApp Message Template */}
          <div className="space-y-3">
            <label className="block font-bold text-[#2F352F] text-xs">
              3. Select Approved Meta WhatsApp Template
            </label>

            {templates.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {templates.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateName(tpl.name);
                    }}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      selectedTemplateName === tpl.name
                        ? "bg-[#E8ECE5] border-[#5F7A62] text-[#2F352F] shadow-2xs"
                        : "bg-[#FFFFFF] border-[#CCD2C8] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono font-bold text-xs text-[#2F352F] truncate">
                          {tpl.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#FAF4E8] text-[#B18A45] shrink-0">
                          {tpl.language}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#747A72] line-clamp-2">
                        {tpl.bodyText || "Template message"}
                      </p>
                    </div>
                    <div className="mt-2 text-[10px] font-semibold text-[#5F7A62] flex items-center gap-1">
                      <Check size={12} />
                      <span>Approved</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-2">
                <p className="text-xs font-semibold text-[#2F352F] flex items-center gap-1.5">
                  <Info size={14} className="text-[#B18A45]" />
                  Enter Approved Template Name
                </p>
                <p className="text-[11px] text-[#747A72]">
                  Ensure this template name is registered and approved in your Meta WhatsApp Business Manager (WABA).
                </p>
                <input
                  type="text"
                  value={customTemplateInput}
                  onChange={(e) => setCustomTemplateInput(e.target.value)}
                  placeholder="e.g. blow_festive_offer, blow_salon_campaign_1"
                  className="w-full h-10 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-mono text-[#2F352F] focus:outline-none focus:border-[#5F7A62]"
                />
              </div>
            )}
          </div>

          {/* 4. Template Variables Mapping */}
          <div className="space-y-3">
            <label className="block font-bold text-[#2F352F] text-xs">
              4. Map Template Variables
            </label>

            {templateVarCount === 0 ? (
              <div className="p-4 rounded-2xl bg-[#FAF4E8]/60 border border-[#B18A45]/30 text-xs flex items-center gap-2">
                <Sparkles size={16} className="text-[#B18A45] shrink-0" />
                <span className="text-[#2F352F]">
                  This approved template requires <strong>0 dynamic body parameters</strong>. Messages will be dispatched directly to recipients.
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: templateVarCount }).map((_, idx) => {
                    const varNum = String(idx + 1);
                    return (
                      <div key={varNum} className="space-y-1">
                        <label className="text-[11px] font-bold text-[#2F352F] flex items-center gap-1">
                          <span>Variable</span>
                          <code className="bg-white px-1.5 py-0.5 rounded border border-[#CCD2C8] text-[10px] text-[#5F7A62]">
                            {`{{${varNum}}}`}
                          </code>
                        </label>
                        {varNum === "1" ? (
                          <select
                            value={templateVariables["1"] || "customer_name"}
                            onChange={(e) => handleVariableChange("1", e.target.value)}
                            className="w-full h-9 px-3 rounded-xl border border-[#CCD2C8] bg-white text-xs font-medium text-[#2F352F]"
                          >
                            <option value="customer_name">Dynamic: Client Name (e.g. Rahul Sharma)</option>
                            <option value="salon_name">Dynamic: Salon Name (BLOW SALON)</option>
                            <option value="Valued Customer">Static: "Valued Customer"</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={templateVariables[varNum] || ""}
                            onChange={(e) => handleVariableChange(varNum, e.target.value)}
                            placeholder={varNum === "2" ? "e.g. 20% OFF or BLOW SALON" : `Value for {{${varNum}}}`}
                            className="w-full h-9 px-3 rounded-xl border border-[#CCD2C8] bg-white text-xs text-[#2F352F]"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 5. Live WhatsApp Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-[#2F352F] text-xs">
                5. WhatsApp Customer Message Preview
              </label>
              <span className="text-[10px] uppercase font-bold text-[#5F7A62]">
                Live Dynamic Preview
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#E8ECE5]/30 border border-[#CCD2C8]">
              <div className="bg-[#FFFFFF] p-4 rounded-2xl border border-[#E0E4DD] shadow-xs font-sans text-xs text-[#292D29] space-y-2 max-w-lg">
                <div className="flex items-center gap-2 pb-2 border-b border-[#F7F7F4]">
                  <div className="size-6 rounded-full bg-[#5F7A62] text-white flex items-center justify-center text-[10px] font-bold">
                    B
                  </div>
                  <div>
                    <span className="font-bold text-[11px] text-[#2F352F] block">BLOW SALON</span>
                    <span className="text-[9px] text-[#747A72]">Official Business Account</span>
                  </div>
                </div>

                <p className="whitespace-pre-wrap leading-relaxed text-[#2F352F]">
                  {previewText}
                </p>

                <div className="text-[9px] text-[#747A72] text-right font-mono">
                  10:30 AM ✓✓
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-[#E0E4DD] bg-[#F7F7F4] shrink-0">
          <button
            type="button"
            onClick={() => setTestModalOpen(true)}
            className="h-10 px-4 rounded-xl border border-[#CCD2C8] bg-white hover:bg-[#E8ECE5] text-xs font-bold text-[#2F352F] transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Smartphone size={14} className="text-[#5F7A62]" />
            <span>Send Test Message</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-[#CCD2C8] text-xs font-semibold text-[#747A72] hover:text-[#2F352F] hover:bg-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || audienceStats.eligible === 0 || !name.trim()}
              onClick={() => setConfirmModalOpen(true)}
              className="h-10 px-6 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Send size={14} />
              <span>Review & Launch Campaign ({audienceStats.eligible})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Test Message Modal */}
      <SendTestModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        templateName={effectiveTemplateName || "sample_template"}
        templateLanguage={activeTemplate?.language || "en_US"}
        templateVariables={templateVariables}
        bodyTextPreview={previewText}
      />

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E0E4DD] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30">
                <Send size={20} />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#2F352F]">
                  Confirm WhatsApp Campaign
                </h3>
                <p className="text-[11px] text-[#747A72]">
                  Please review the campaign details before dispatching
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-2.5 font-sans">
              <div className="flex justify-between">
                <span className="text-[#747A72]">Campaign:</span>
                <span className="font-bold text-[#2F352F]">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747A72]">Audience:</span>
                <span className="font-semibold text-[#2F352F]">{audienceType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#747A72]">Template:</span>
                <span className="font-mono text-[#2F352F]">{effectiveTemplateName}</span>
              </div>
              <div className="flex justify-between border-t border-[#E0E4DD] pt-2">
                <span className="text-[#5F7A62] font-bold">Eligible Recipients:</span>
                <span className="font-mono font-extrabold text-[#5F7A62] text-sm">{audienceStats.eligible}</span>
              </div>
              {audienceStats.excluded > 0 && (
                <div className="flex justify-between text-[11px] text-[#B55B5B]">
                  <span>Excluded (Opt-out/Invalid):</span>
                  <span className="font-mono">{audienceStats.excluded}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="h-9 px-4 rounded-xl border border-[#CCD2C8] text-xs font-semibold text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleCreateAndSend(true)}
                className="h-9 px-5 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Launching...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Confirm & Launch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
