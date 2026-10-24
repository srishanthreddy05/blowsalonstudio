"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Receipt,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RefreshCw,
  Code,
  Tag,
  Languages,
  Plus,
  AlertCircle,
  PauseCircle,
  XCircle,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import type { WhatsAppTemplate, WhatsAppTemplateStatus } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { CreateTemplateModal } from "./CreateTemplateModal";
import { toast } from "react-hot-toast";

interface TemplatesViewProps {
  whatsappEnabled?: boolean;
}

export function TemplatesView({ whatsappEnabled = true }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);

  // Pagination & Filtering
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [paging, setPaging] = useState<{ cursors?: { before?: string; after?: string } } | null>(null);
  const [currentCursor, setCurrentCursor] = useState<{ after?: string; before?: string } | undefined>();

  // Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const fetchTemplates = useCallback(
    async (cursor?: { after?: string; before?: string }) => {
      setLoading(true);
      setApiError(null);
      try {
        const res = await whatsappService.getTemplatesDetailed({
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          category: categoryFilter !== "ALL" ? categoryFilter : undefined,
          after: cursor?.after,
          before: cursor?.before,
          limit: 50,
        });

        setTemplates(res.templates || []);
        setPaging(res.paging || null);
        setLastSync(res.lastSync || new Date().toISOString());
        setIsStale(Boolean(res.isStale));
        if (res.error) {
          setApiError(res.error);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load Meta WhatsApp templates";
        setApiError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, categoryFilter]
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Client-side search filtering
  const filteredTemplates = templates.filter((tmpl) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      tmpl.name.toLowerCase().includes(q) ||
      (tmpl.bodyText && tmpl.bodyText.toLowerCase().includes(q)) ||
      tmpl.language.toLowerCase().includes(q)
    );
  });

  // Render Status Badge with honest Meta status
  const renderStatusBadge = (status: WhatsAppTemplateStatus, rejectedReason?: string) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E8ECE5] text-[#5F7A62] text-[10px] font-bold uppercase tracking-wider border border-[#5F7A62]/30">
            <CheckCircle2 size={11} />
            <span>Approved</span>
          </span>
        );
      case "PENDING":
      case "IN_REVIEW":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FAF4E8] text-[#B18A45] text-[10px] font-bold uppercase tracking-wider border border-[#EDD98A]">
            <Clock size={11} className="animate-spin text-[#B18A45]" />
            <span>In Review (Pending)</span>
          </span>
        );
      case "REJECTED":
        return (
          <span
            title={rejectedReason || "Rejected by Meta"}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FBEBEB] text-[#B55B5B] text-[10px] font-bold uppercase tracking-wider border border-[#F8D7D7]"
          >
            <AlertCircle size={11} />
            <span>Rejected</span>
          </span>
        );
      case "PAUSED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFF8E6] text-[#A67514] text-[10px] font-bold uppercase tracking-wider border border-[#F3E2B8]">
            <PauseCircle size={11} />
            <span>Paused</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#F7F7F4] text-[#747A72] text-[10px] font-bold uppercase tracking-wider border border-[#CCD2C8]">
            <XCircle size={11} />
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs">
        <div>
          <h2 className="font-serif text-lg font-bold text-[#2F352F] flex items-center gap-2">
            <Sparkles size={18} className="text-[#5F7A62]" />
            Live Meta WhatsApp Message Templates
          </h2>
          <p className="text-xs text-[#747A72] mt-0.5 max-w-xl">
            Live templates synchronized directly with your connected Meta WhatsApp Business Account
            (WABA). Invoices and marketing campaigns can only dispatch templates confirmed as Approved by Meta.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-[11px] font-mono text-[#747A72] hidden sm:inline">
              Synced: {new Date(lastSync).toLocaleTimeString()}
            </span>
          )}

          <button
            type="button"
            onClick={() => fetchTemplates()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh from Meta</span>
          </button>

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#5F7A62] hover:bg-[#4E6651] text-xs font-bold text-white shadow-xs transition cursor-pointer"
          >
            <Plus size={14} />
            <span>Create Template</span>
          </button>
        </div>
      </div>

      {/* Meta API Error or Stale Notice */}
      {apiError && (
        <div className="p-4 rounded-3xl bg-[#FAF4E8] border border-[#F3E2B8] flex items-start gap-3 animate-in fade-in">
          <AlertCircle size={18} className="text-[#B18A45] shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1 text-xs">
            <p className="font-bold text-[#7A5C0A]">Meta Graph API Notice</p>
            <p className="text-[11px] text-[#8A6B1A] leading-relaxed">{apiError}</p>
            <div className="pt-1 flex items-center gap-4 text-[11px]">
              <a
                href="https://business.facebook.com/wa/manage/message-templates/"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-[#7A5C0A] hover:underline inline-flex items-center gap-1"
              >
                <span>Open Meta WhatsApp Manager Templates</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747A72]" />
          <input
            type="text"
            placeholder="Search templates by name or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-[#CCD2C8] bg-[#F7F7F4] text-xs text-[#2F352F] focus:border-[#5F7A62] focus:bg-[#FFFFFF] focus:outline-none"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-semibold text-[#2F352F] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved Only</option>
            <option value="PENDING">In Review (Pending)</option>
            <option value="REJECTED">Rejected</option>
            <option value="PAUSED">Paused</option>
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 px-2.5 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] text-xs font-semibold text-[#2F352F] focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="UTILITY">Utility</option>
            <option value="MARKETING">Marketing</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD]">
          <Clock size={24} className="mx-auto mb-2 animate-spin text-[#747A72]" />
          Fetching live templates from Meta WhatsApp Business Platform...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="p-12 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD] space-y-3">
          <Sparkles size={28} className="mx-auto text-[#CCD2C8]" />
          <p className="font-semibold text-sm text-[#2F352F]">No message templates found</p>
          <p className="text-[11px] max-w-md mx-auto">
            {searchQuery
              ? `No templates match "${searchQuery}".`
              : "No message templates found in your connected WhatsApp Business Account. Click 'Create Template' to submit one to Meta."}
          </p>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#5F7A62] text-white text-xs font-bold hover:bg-[#4E6651] transition cursor-pointer"
          >
            <Plus size={14} />
            <span>Create First Template</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTemplates.map((tmpl) => {
            const isUtility = tmpl.category === "UTILITY";
            const isMarketing = tmpl.category === "MARKETING";

            return (
              <div
                key={tmpl.id || tmpl.name}
                className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs flex flex-col justify-between space-y-4 hover:border-[#CCD2C8] transition"
              >
                <div className="space-y-3">
                  {/* Top card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {isUtility ? (
                          <Receipt size={16} className="text-[#5F7A62]" />
                        ) : (
                          <Sparkles size={16} className="text-[#B18A45]" />
                        )}
                        <h3 className="font-mono text-xs font-bold text-[#2F352F]">
                          {tmpl.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                          <Languages size={11} />
                          <span>{tmpl.language}</span>
                        </span>
                        <span className="text-[#CCD2C8]">•</span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.2 rounded-full border ${
                            isUtility
                              ? "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30"
                              : "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30"
                          }`}
                        >
                          {tmpl.category}
                        </span>
                      </div>
                    </div>

                    {renderStatusBadge(tmpl.status, tmpl.rejectedReason)}
                  </div>

                  {/* Header text if present */}
                  {tmpl.headerText && (
                    <div className="text-xs font-bold text-[#2F352F] pb-1 border-b border-[#E0E4DD]">
                      {tmpl.headerText}
                    </div>
                  )}

                  {/* Body Text */}
                  <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] text-xs text-[#2F352F] leading-relaxed whitespace-pre-wrap font-sans">
                    {tmpl.bodyText || "No body text available."}
                  </div>

                  {/* Footer Text if present */}
                  {tmpl.footerText && (
                    <div className="text-[10px] text-[#747A72] italic">
                      {tmpl.footerText}
                    </div>
                  )}
                </div>

                {/* Footer specs */}
                <div className="pt-3 border-t border-[#E0E4DD] flex items-center justify-between text-[11px] text-[#747A72]">
                  <span className="flex items-center gap-1 font-mono">
                    <Code size={13} />
                    <span>
                      {tmpl.variableCount} Variable{tmpl.variableCount !== 1 ? "s" : ""}
                    </span>
                  </span>

                  {tmpl.status === "APPROVED" ? (
                    <span className="font-semibold text-[#5F7A62] flex items-center gap-1">
                      <ShieldCheck size={13} />
                      <span>Ready for Dispatches</span>
                    </span>
                  ) : (
                    <span className="font-medium text-[#B18A45] flex items-center gap-1">
                      <Clock size={13} />
                      <span>Requires Meta Approval</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {paging?.cursors && (paging.cursors.after || paging.cursors.before) && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[#FFFFFF] border border-[#E0E4DD] text-xs">
          <button
            type="button"
            disabled={!paging.cursors.before || loading}
            onClick={() => fetchTemplates({ before: paging.cursors?.before })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#CCD2C8] disabled:opacity-40 cursor-pointer font-semibold"
          >
            <ChevronLeft size={14} />
            <span>Previous Page</span>
          </button>

          <span className="text-[11px] text-[#747A72]">
            Showing {filteredTemplates.length} templates
          </span>

          <button
            type="button"
            disabled={!paging.cursors.after || loading}
            onClick={() => fetchTemplates({ after: paging.cursors?.after })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#CCD2C8] disabled:opacity-40 cursor-pointer font-semibold"
          >
            <span>Next Page</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Create Template Modal */}
      <CreateTemplateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onTemplateCreated={() => {
          fetchTemplates();
        }}
      />
    </div>
  );
}
