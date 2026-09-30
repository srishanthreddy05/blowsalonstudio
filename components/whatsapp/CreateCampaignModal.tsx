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

  // Templates - strictly blow_salon_campaign
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>("blow_salon_campaign");
  const [campaignMessageContent, setCampaignMessageContent] = useState(
    "Enjoy 20% off on your next visit. Offer valid until 30 September."
  );

  // UI Flow
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load Customers and Campaign Templates
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      setLoadingCustomers(true);
      setLoadingTemplates(true);

      try {
        const [custList, tplList] = await Promise.all([
          customersService.getAll(),
          whatsappService.getTemplates("campaign"),
        ]);
        setCustomers(custList || []);
        
        // Filter strictly to blow_salon_campaign
        const campaignTpls = (tplList || []).filter((t) => t.name === "blow_salon_campaign");
        setTemplates(campaignTpls);
        setSelectedTemplateName("blow_salon_campaign");
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
    return (
      templates.find((t) => t.name === "blow_salon_campaign") || {
        id: "blow_salon_campaign",
        name: "blow_salon_campaign",
        language: "en",
        status: "APPROVED" as const,
        category: "MARKETING" as const,
        components: [],
        bodyText: "Hello {{1}} 👋\n\nWe have an update from BLOW SALON.\n\n{{2}}\n\nWe look forward to seeing you soon! ✨",
        variableCount: 2,
        variableKeys: ["1", "2"],
      }
    );
  }, [templates]);

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

  // Generate live preview text with {{1}} = Rahul Sharma and {{2}} = campaignMessageContent
  const previewText = useMemo(() => {
    let body =
      activeTemplate?.bodyText ||
      "Hello {{1}} 👋\n\nWe have an update from BLOW SALON.\n\n{{2}}\n\nWe look forward to seeing you soon! ✨";

    body = body.replace(/\{\{1\}\}/g, "Rahul Sharma");
    body = body.replace(/\{\{2\}\}/g, campaignMessageContent.trim() || "Enjoy 20% off on your next visit. Offer valid until 30 September.");
    return body;
  }, [activeTemplate, campaignMessageContent]);

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

  const toggleSelectCustomer = (customerId: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(customerId)
        ? prev.filter((id) => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleSelectAllCustomers = () => {
    const allIds = filteredCustomers.map((c) => c.id!).filter(Boolean);
    setSelectedCustomerIds(allIds);
  };

  const handleClearSelection = () => {
    setSelectedCustomerIds([]);
  };

  // Validation before confirmation
  const handleProceedToConfirmation = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a campaign name.");
      return;
    }

    if (audienceType === "CUSTOM" && selectedCustomerIds.length === 0) {
      toast.error("Please select at least one customer for custom audience.");
      return;
    }

    if (audienceStats.eligible === 0) {
      toast.error("No eligible recipients found in the selected audience.");
      return;
    }

    if (!campaignMessageContent.trim()) {
      toast.error("Please enter your campaign message/content.");
      return;
    }

    setConfirmModalOpen(true);
  };

  // Submit and Create Campaign Record
  const handleConfirmAndCreate = async (sendImmediately: boolean) => {
    setSubmitting(true);
    try {
      // Exactly 2 parameters mapped for blow_salon_campaign
      const templateVariablesPayload: Record<string, string> = {
        "1": "customer_name",
        "2": campaignMessageContent.trim(),
      };

      const res = await whatsappService.createCampaign({
        name: name.trim(),
        templateName: "blow_salon_campaign",
        templateLanguage: activeTemplate?.language || "en",
        templateCategory: "MARKETING",
        audienceType,
        customCustomerIds: audienceType === "CUSTOM" ? selectedCustomerIds : undefined,
        templateVariables: templateVariablesPayload,
      });

      if (!res.success || !res.campaign) {
        throw new Error("Failed to initialize campaign.");
      }

      const created = res.campaign;

      if (sendImmediately) {
        toast.loading("Queuing campaign for dispatch...", { id: "send-campaign" });
        await whatsappService.sendCampaign(created.id);
        toast.success(`Campaign "${created.name}" sent to queue!`, { id: "send-campaign" });
      }

      onCampaignCreated(created);
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
                Deliver approved Meta marketing template to segmented salon customers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#747A72] hover:bg-[#E8ECE5] hover:text-[#2F352F] transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleProceedToConfirmation} className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 1. Campaign Name */}
          <div className="space-y-1.5">
            <label className="block font-bold text-[#2F352F] text-xs">
              1. Campaign Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Festive Offer, Diwali Special, Weekend Hair Spa Discount"
              className="w-full h-10 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs text-[#2F352F] placeholder:text-[#8C9389] focus:outline-none focus:border-[#5F7A62]"
            />
          </div>

          {/* 2. Target Audience Segmentation */}
          <div className="space-y-3">
            <label className="block font-bold text-[#2F352F] text-xs">
              2. Target Audience & Opt-in Consent Filter
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: "ALL", label: "All Customers", desc: "All client records" },
                { id: "REGULAR", label: "Regular Clients", desc: "Frequent visitors" },
                { id: "MEMBERSHIP", label: "Members Only", desc: "Active package holders" },
                { id: "CUSTOM", label: "Custom Selection", desc: "Search & pick list" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAudienceType(tab.id as WhatsAppAudienceType)}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                    audienceType === tab.id
                      ? "bg-[#E8ECE5] border-[#5F7A62] text-[#2F352F] shadow-2xs"
                      : "bg-[#FFFFFF] border-[#CCD2C8] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F]"
                  }`}
                >
                  <span className="font-bold text-xs block">{tab.label}</span>
                  <span className="text-[10px] text-[#747A72] mt-0.5 block">{tab.desc}</span>
                </button>
              ))}
            </div>

            {/* Custom Audience Search and Select */}
            {audienceType === "CUSTOM" && (
              <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747A72]" />
                    <input
                      type="text"
                      placeholder="Search customer name or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 rounded-xl border border-[#CCD2C8] bg-white text-xs text-[#2F352F]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllCustomers}
                      className="h-9 px-3 rounded-xl border border-[#CCD2C8] bg-white text-xs font-semibold text-[#2F352F] hover:bg-[#E8ECE5] transition"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="h-9 px-3 rounded-xl border border-[#CCD2C8] bg-white text-xs font-semibold text-[#747A72] hover:bg-[#FBEBEB] hover:text-[#B55B5B] transition"
                    >
                      Clear
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

          {/* 3. Approved Meta Template Selection (Only blow_salon_campaign) */}
          <div className="space-y-3">
            <label className="block font-bold text-[#2F352F] text-xs">
              3. Approved Meta WhatsApp Marketing Template
            </label>

            <div className="p-4 rounded-2xl border border-[#5F7A62] bg-[#E8ECE5]/40 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-[#2F352F]">
                    blow_salon_campaign
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30">
                    Marketing Template
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#E8ECE5] text-[#5F7A62] border border-[#5F7A62]/30 flex items-center gap-1">
                    <Check size={10} /> Approved
                  </span>
                </div>
                <p className="text-[11px] text-[#747A72] mt-1">
                  Official BLOW SALON marketing template. Requires exactly 2 parameters: customer name {"{{1}}"} and campaign message {"{{2}}"}.
                </p>
              </div>
            </div>
          </div>

          {/* 4. Campaign Message / Content Mapping */}
          <div className="space-y-3">
            <label className="block font-bold text-[#2F352F] text-xs">
              4. Campaign Content & Offer Message {"{{2}}"} *
            </label>

            <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-[#2F352F]">
                    Enter Campaign Message (substitutes into {"{{2}}"}):
                  </span>
                  <span className="text-[10px] text-[#747A72] font-mono">
                    {campaignMessageContent.length} chars
                  </span>
                </div>
                <textarea
                  rows={3}
                  required
                  value={campaignMessageContent}
                  onChange={(e) => setCampaignMessageContent(e.target.value)}
                  placeholder="e.g. Enjoy 20% off on all hair and beauty services this week! Valid until 30 September."
                  className="w-full p-3 rounded-xl border border-[#CCD2C8] bg-white text-xs text-[#2F352F] leading-relaxed focus:outline-none focus:border-[#5F7A62]"
                />
              </div>

              <div className="text-[11px] text-[#747A72] flex items-center gap-1.5">
                <Info size={13} className="text-[#5F7A62] shrink-0" />
                <span>
                  Variable <code>{"{{1}}"}</code> is automatically mapped to each recipient customer’s name.
                </span>
              </div>
            </div>
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

                <div className="whitespace-pre-line text-[#2F352F] leading-relaxed py-1">
                  {previewText}
                </div>

                <div className="text-right text-[9px] text-[#8C9389] pt-1">
                  Now • Delivered
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E0E4DD]">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={audienceStats.eligible === 0 || !name.trim() || !campaignMessageContent.trim()}
              className="h-10 px-5 rounded-xl bg-[#2F352F] hover:bg-[#1E221E] text-[#FAF4E8] text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <span>Review & Confirm</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </form>

        {/* Confirmation Modal */}
        {confirmModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-[#FFFFFF] border border-[#E0E4DD] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-95 duration-150">
              <div>
                <h3 className="font-serif text-base font-bold text-[#2F352F]">
                  Confirm WhatsApp Campaign
                </h3>
                <p className="text-xs text-[#747A72] mt-0.5">
                  Verify recipient counts and template variables before launching
                </p>
              </div>

              <div className="space-y-2 p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] text-xs">
                <div className="flex justify-between py-1 border-b border-[#E0E4DD]">
                  <span className="text-[#747A72]">Campaign:</span>
                  <span className="font-bold text-[#2F352F]">{name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0E4DD]">
                  <span className="text-[#747A72]">Audience:</span>
                  <span className="font-medium text-[#2F352F]">{audienceType}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0E4DD]">
                  <span className="text-[#747A72]">Template:</span>
                  <span className="font-mono font-semibold text-[#5F7A62]">
                    blow_salon_campaign (2 vars)
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0E4DD]">
                  <span className="text-[#5F7A62] font-semibold">Eligible Recipients:</span>
                  <span className="font-mono font-bold text-[#5F7A62]">{audienceStats.eligible}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#E0E4DD]">
                  <span className="text-[#B55B5B]">Excluded Recipients:</span>
                  <span className="font-mono font-bold text-[#B55B5B]">{audienceStats.excluded}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#747A72]">Estimated Messages:</span>
                  <span className="font-mono font-bold text-[#2F352F]">{audienceStats.eligible}</span>
                </div>
              </div>

              <div className="text-[11px] text-[#747A72] bg-[#FAF4E8] p-3 rounded-xl border border-[#B18A45]/30">
                Messages will be sent safely through the Meta WhatsApp Cloud API with automatic rate limiting.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setConfirmModalOpen(false)}
                  className="h-9 px-4 rounded-xl border border-[#CCD2C8] text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleConfirmAndCreate(true)}
                  className="h-9 px-4 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-[#FAF4E8] text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Confirm & Send Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
