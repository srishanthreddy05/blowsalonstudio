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
  UserX,
  UserCheck,
  UploadCloud,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import * as whatsappService from "@/services/whatsapp";
import * as customersService from "@/services/customers";
import type { Customer } from "@/types/customer";
import type { WhatsAppTemplate, WhatsAppAudienceType, WhatsAppCampaign } from "@/types/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { SendTestModal } from "./SendTestModal";
import { auth } from "@/lib/firebase";
import { DEFAULT_TEMPLATE_HEADER_IMAGE_URL } from "@/lib/whatsapp/templateRegistry";

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

  // Campaign Header Image (Cloudinary)
  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null);
  const [headerImageMetadata, setHeaderImageMetadata] = useState<any | null>(null);
  const [imageUploadStatus, setImageUploadStatus] = useState<"IDLE" | "UPLOADING" | "SUCCESS" | "ERROR">("IDLE");
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

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
  const [excludedModalOpen, setExcludedModalOpen] = useState(false);
  const [excludedFilter, setExcludedFilter] = useState<"ALL" | "OPTED_OUT" | "INVALID_PHONE">("ALL");
  const [excludedSearch, setExcludedSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [togglingOptInId, setTogglingOptInId] = useState<string | null>(null);

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
    const excludedCustomers: Array<{
      customer: Customer;
      reason: "OPTED_OUT" | "INVALID_PHONE";
      detail: string;
    }> = [];

    for (const c of segment) {
      const norm = normalizePhoneNumber(c.phone);
      if (c.whatsappOptOut === true) {
        optedOut++;
        excludedCustomers.push({
          customer: c,
          reason: "OPTED_OUT",
          detail: c.whatsappOptOutAt
            ? `Opted out on ${new Date(c.whatsappOptOutAt).toLocaleDateString("en-IN")}`
            : "Opted out of WhatsApp marketing",
        });
      } else if (!norm.isValid) {
        invalidPhone++;
        excludedCustomers.push({
          customer: c,
          reason: "INVALID_PHONE",
          detail: !c.phone?.trim() ? "Missing phone number" : "Invalid phone format (must be 10-15 digits)",
        });
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
      excludedCustomers,
    };
  }, [customers, audienceType, selectedCustomerIds]);

  const handleToggleOptIn = async (customer: Customer, newOptOut: boolean) => {
    if (!customer.id) return;
    setTogglingOptInId(customer.id);
    try {
      const res = await fetch("/api/whatsapp/customers/opt-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, optOut: newOptOut }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update consent");

      toast.success(
        newOptOut
          ? `${customer.name} marked as opted out.`
          : `${customer.name} opted back into WhatsApp marketing!`
      );

      // Update local customers state
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customer.id
            ? { ...c, whatsappOptOut: newOptOut, whatsappOptIn: !newOptOut }
            : c
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update consent";
      toast.error(msg);
    } finally {
      setTogglingOptInId(null);
    }
  };

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

  // Filtered excluded customers for the excluded list view
  const filteredExcluded = useMemo(() => {
    let list = audienceStats.excludedCustomers;
    if (excludedFilter === "OPTED_OUT") {
      list = list.filter((item) => item.reason === "OPTED_OUT");
    } else if (excludedFilter === "INVALID_PHONE") {
      list = list.filter((item) => item.reason === "INVALID_PHONE");
    }

    if (excludedSearch.trim()) {
      const q = excludedSearch.toLowerCase();
      list = list.filter(
        (item) =>
          item.customer.name.toLowerCase().includes(q) ||
          (item.customer.phone && item.customer.phone.includes(q))
      );
    }
    return list;
  }, [audienceStats.excludedCustomers, excludedFilter, excludedSearch]);

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

  const handleImageSelect = async (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!allowed.includes(file.type.toLowerCase())) {
      const err = `Invalid file format "${file.type}". Please upload a JPEG, PNG, or WebP image.`;
      setImageUploadStatus("ERROR");
      setImageUploadError(err);
      toast.error(err);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const err = `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 5 MB limit.`;
      setImageUploadStatus("ERROR");
      setImageUploadError(err);
      toast.error(err);
      return;
    }

    setHeaderImageFile(file);
    const localUrl = URL.createObjectURL(file);
    setImagePreviewUrl(localUrl);
    setImageUploadStatus("UPLOADING");
    setImageUploadError(null);

    try {
      let idToken: string | undefined;
      try {
        idToken = await auth.currentUser?.getIdToken();
      } catch {
        // Fallback
      }

      const res = await whatsappService.uploadCampaignImage(file, idToken);
      if (res.success && res.secure_url) {
        setHeaderImageUrl(res.secure_url);
        setHeaderImageMetadata(res.metadata || null);
        setImageUploadStatus("SUCCESS");
        toast.success("Campaign image uploaded to Cloudinary!");
      } else {
        throw new Error(res.error || "Failed to upload image");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Image upload failed";
      setImageUploadStatus("ERROR");
      setImageUploadError(msg);
      setHeaderImageUrl(null);
      setHeaderImageMetadata(null);
      toast.error(msg);
    }
  };

  const handleRemoveImage = () => {
    setHeaderImageFile(null);
    setHeaderImageUrl(null);
    setHeaderImageMetadata(null);
    setImagePreviewUrl(null);
    setImageUploadStatus("IDLE");
    setImageUploadError(null);
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

    if (imageUploadStatus === "UPLOADING") {
      toast.error("Please wait for the campaign image to finish uploading.");
      return;
    }

    if (imageUploadStatus === "ERROR") {
      toast.error(
        imageUploadError ||
          "Selected campaign image failed to upload. Please fix or remove it before proceeding."
      );
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
    if (imageUploadStatus === "ERROR") {
      toast.error(
        imageUploadError ||
          "Selected campaign image failed to upload. Please fix or remove it before creating."
      );
      return;
    }

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
        headerImageUrl: headerImageUrl || null,
        headerImageMetadata: headerImageMetadata || null,
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

              <button
                type="button"
                onClick={() => setExcludedModalOpen(true)}
                className="flex items-center justify-between p-2 rounded-xl bg-white/80 border border-[#B55B5B]/30 hover:border-[#B55B5B] hover:bg-[#FBEBEB]/40 transition cursor-pointer text-left group"
                title="Click to view all excluded and opted-out members"
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid size-8 place-items-center rounded-xl bg-[#FBEBEB] text-[#B55B5B] shadow-2xs shrink-0 group-hover:scale-105 transition-transform">
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
                <span className="text-[9px] font-bold text-[#B55B5B] bg-[#FBEBEB] px-2 py-0.5 rounded-full border border-[#F8D7D7] group-hover:bg-[#B55B5B] group-hover:text-white transition">
                  View ({audienceStats.excluded}) ↗
                </span>
              </button>

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
                  Official BLOW SALON marketing template. Requires an IMAGE header and exactly 2 parameters: customer name {"{{1}}"} and campaign message {"{{2}}"}.
                </p>
              </div>
            </div>
          </div>

          {/* 4. Campaign Header Image (Cloudinary) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-[#2F352F] text-xs">
                4. Campaign Header Image (Cloudinary)
              </label>
              <span className="text-[10px] text-[#747A72]">
                Max 5 MB • JPEG, PNG, or WebP
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-3">
              {imageUploadStatus === "IDLE" && !headerImageUrl && (
                <div>
                  <label
                    htmlFor="campaign-image-input"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-[#CCD2C8] hover:border-[#5F7A62] bg-white rounded-2xl p-5 cursor-pointer transition group"
                  >
                    <div className="grid size-10 place-items-center rounded-xl bg-[#E8ECE5] text-[#5F7A62] group-hover:scale-105 transition-transform mb-2">
                      <UploadCloud size={20} />
                    </div>
                    <span className="text-xs font-bold text-[#2F352F]">
                      Click or drag an image to upload to Cloudinary
                    </span>
                    <span className="text-[11px] text-[#747A72] mt-0.5">
                      Optional: Leave blank to use official BLOW SALON default header image
                    </span>
                    <input
                      id="campaign-image-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageSelect(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}

              {imageUploadStatus === "UPLOADING" && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-[#E0E4DD]">
                  <div className="size-5 border-2 border-[#5F7A62] border-t-transparent rounded-full animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-[#2F352F] block truncate">
                      Uploading {headerImageFile?.name || "image"} to Cloudinary...
                    </span>
                    <span className="text-[10px] text-[#747A72]">
                      Validating file format and optimizing asset
                    </span>
                  </div>
                </div>
              )}

              {imageUploadStatus === "SUCCESS" && headerImageUrl && (
                <div className="p-3.5 rounded-2xl bg-white border border-[#5F7A62]/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-12 rounded-xl overflow-hidden border border-[#E0E4DD] shrink-0 bg-[#F7F7F4]">
                      <img
                        src={headerImageUrl}
                        alt="Uploaded preview"
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#2F352F] truncate block">
                          {headerImageMetadata?.originalFilename || headerImageFile?.name || "Campaign Image"}
                        </span>
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#E8ECE5] text-[#5F7A62] border border-[#5F7A62]/30 shrink-0">
                          Uploaded
                        </span>
                      </div>
                      <span className="text-[10px] text-[#747A72] block">
                        Cloudinary secure URL saved • {headerImageMetadata?.bytes ? `${(headerImageMetadata.bytes / 1024).toFixed(0)} KB` : "Ready"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="p-2 rounded-xl text-[#B55B5B] hover:bg-[#FBEBEB] transition cursor-pointer shrink-0"
                    title="Remove custom image and revert to default"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}

              {imageUploadStatus === "ERROR" && (
                <div className="p-3.5 rounded-2xl bg-[#FBEBEB] border border-[#F8D7D7] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle size={16} className="text-[#B55B5B] shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-[#B55B5B] block">
                        Upload Failed
                      </span>
                      <span className="text-[11px] text-[#B55B5B]/90 block">
                        {imageUploadError || "An error occurred during Cloudinary upload."}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor="campaign-image-retry"
                      className="px-2.5 py-1 rounded-xl bg-white border border-[#CCD2C8] text-xs font-semibold text-[#2F352F] hover:bg-[#F7F7F4] cursor-pointer transition flex items-center gap-1"
                    >
                      <RefreshCw size={12} />
                      <span>Retry</span>
                      <input
                        id="campaign-image-retry"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/jpg"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageSelect(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1 rounded-lg text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
                      title="Clear error and use default image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-[#747A72] flex items-center gap-1.5">
                <Info size={13} className="text-[#5F7A62] shrink-0" />
                <span>
                  {headerImageUrl
                    ? "Custom image selected. This image will be sent in the WhatsApp IMAGE header."
                    : "No custom image selected. WhatsApp Cloud API will use official BLOW SALON default header image."}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Campaign Message / Content Mapping */}
          <div className="space-y-3">
            <label className="block font-bold text-[#2F352F] text-xs">
              5. Campaign Content & Offer Message {"{{2}}"} *
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

          {/* 6. Live WhatsApp Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-[#2F352F] text-xs">
                6. WhatsApp Customer Message Preview
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

                {/* WhatsApp Image Header Preview */}
                <div className="rounded-xl overflow-hidden border border-[#E0E4DD] bg-[#F7F7F4] relative my-1">
                  <img
                    src={headerImageUrl || imagePreviewUrl || DEFAULT_TEMPLATE_HEADER_IMAGE_URL}
                    alt="WhatsApp Header Preview"
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute top-2 right-2">
                    {headerImageUrl ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#E8ECE5]/95 text-[#5F7A62] border border-[#5F7A62]/30 backdrop-blur-xs">
                        Custom Image
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/95 text-[#747A72] border border-[#CCD2C8] backdrop-blur-xs">
                        Default Header
                      </span>
                    )}
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
              disabled={
                audienceStats.eligible === 0 ||
                !name.trim() ||
                !campaignMessageContent.trim() ||
                imageUploadStatus === "UPLOADING"
              }
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
                  <span className="text-[#747A72]">Header Image:</span>
                  <span className="font-semibold text-[#2F352F] flex items-center gap-1.5">
                    {headerImageUrl ? (
                      <>
                        <span className="size-1.5 rounded-full bg-[#5F7A62]" />
                        <span>Custom (Cloudinary)</span>
                      </>
                    ) : (
                      <>
                        <span className="size-1.5 rounded-full bg-[#8C9389]" />
                        <span>Default Template Image</span>
                      </>
                    )}
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

        {/* Excluded Members Breakdown Modal */}
        {excludedModalOpen && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
            onClick={() => setExcludedModalOpen(false)}
          >
            <div
              className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-3xl border border-[#E0E4DD] bg-white shadow-2xl text-[#292D29] overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#E0E4DD] bg-[#FAF4E8]/60 px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-2xl bg-[#FBEBEB] text-[#B55B5B] border border-[#F8D7D7]">
                    <UserX size={18} />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[#2F352F]">
                      Excluded Audience Members ({audienceStats.excluded})
                    </h3>
                    <p className="text-xs text-[#747A72]">
                      Clients excluded from this marketing campaign due to opt-out consent or invalid phone numbers.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExcludedModalOpen(false)}
                  className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] hover:border-[#6F776D] bg-white text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Filters & Search */}
              <div className="p-4 border-b border-[#E0E4DD] bg-[#F7F7F4] space-y-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-[#E0E4DD] text-xs">
                    <button
                      type="button"
                      onClick={() => setExcludedFilter("ALL")}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        excludedFilter === "ALL"
                          ? "bg-[#5F7A62] text-white shadow-2xs"
                          : "text-[#747A72] hover:text-[#2F352F]"
                      }`}
                    >
                      All ({audienceStats.excluded})
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcludedFilter("OPTED_OUT")}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        excludedFilter === "OPTED_OUT"
                          ? "bg-[#B55B5B] text-white shadow-2xs"
                          : "text-[#747A72] hover:text-[#2F352F]"
                      }`}
                    >
                      Opted Out ({audienceStats.optedOut})
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcludedFilter("INVALID_PHONE")}
                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                        excludedFilter === "INVALID_PHONE"
                          ? "bg-[#B18A45] text-white shadow-2xs"
                          : "text-[#747A72] hover:text-[#2F352F]"
                      }`}
                    >
                      Invalid Phone ({audienceStats.invalidPhone})
                    </button>
                  </div>

                  <div className="relative flex-1 min-w-[180px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747A72]" />
                    <input
                      type="text"
                      placeholder="Search name or phone..."
                      value={excludedSearch}
                      onChange={(e) => setExcludedSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 text-xs rounded-xl border border-[#E0E4DD] bg-white text-[#2F352F] placeholder:text-[#A0A69D] focus:outline-none focus:border-[#5F7A62]"
                    />
                  </div>
                </div>
              </div>

              {/* Members List */}
              <div className="flex-1 overflow-y-auto p-4 divide-y divide-[#E0E4DD]/60">
                {filteredExcluded.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#747A72] italic">
                    No excluded members match your current filter.
                  </div>
                ) : (
                  filteredExcluded.map(({ customer, reason, detail }) => {
                    const isToggling = togglingOptInId === customer.id;
                    return (
                      <div
                        key={customer.id || customer.phone}
                        className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#2F352F] truncate">
                              {customer.name}
                            </span>
                            {customer.customerType === "membership" && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30">
                                Member
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#747A72]">
                            <span className="font-mono">{customer.phone}</span>
                            <span>•</span>
                            <span className={reason === "OPTED_OUT" ? "text-[#B55B5B] font-medium" : "text-[#B18A45] font-medium"}>
                              {detail}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {reason === "OPTED_OUT" ? (
                            <button
                              type="button"
                              disabled={isToggling}
                              onClick={() => handleToggleOptIn(customer, false)}
                              className="px-3 py-1 rounded-xl bg-[#E8ECE5] hover:bg-[#5F7A62] text-[#2F352F] hover:text-white border border-[#CCD2C8] text-[11px] font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              title="Customer agreed to receive WhatsApp offers again"
                            >
                              {isToggling ? (
                                <div className="size-3 border-2 border-[#5F7A62] border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <UserCheck size={12} />
                              )}
                              <span>Opt In</span>
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30">
                              Needs Phone Fix
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-[#E0E4DD] bg-[#F7F7F4] flex items-center justify-between text-xs text-[#747A72] shrink-0">
                <span>
                  Showing {filteredExcluded.length} of {audienceStats.excluded} excluded member{audienceStats.excluded !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setExcludedModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-white border border-[#CCD2C8] text-xs font-semibold text-[#2F352F] hover:bg-[#E8ECE5] transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
