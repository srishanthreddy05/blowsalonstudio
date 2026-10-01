"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Receipt,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Code,
  Tag,
  Languages,
} from "lucide-react";
import type { WhatsAppTemplate } from "@/types/whatsapp";
import * as whatsappService from "@/services/whatsapp";
import { toast } from "react-hot-toast";

interface TemplatesViewProps {
  whatsappEnabled?: boolean;
}

export function TemplatesView({ whatsappEnabled = true }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const list = await whatsappService.getTemplates();
      setTemplates(list);
    } catch {
      toast.error("Failed to load Meta WhatsApp templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs">
        <div>
          <h2 className="font-serif text-lg font-bold text-[#2F352F] flex items-center gap-2">
            <Sparkles size={18} className="text-[#5F7A62]" />
            Meta WhatsApp Message Templates
          </h2>
          <p className="text-xs text-[#747A72] mt-0.5 max-w-xl">
            Official WhatsApp Business (WABA) approved templates used for automatic invoice receipts, appointment reminders, and marketing campaigns.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchTemplates}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-xs font-semibold text-[#2F352F] shadow-xs transition cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span>Sync from Meta</span>
        </button>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-[#747A72]">
          <Clock size={24} className="mx-auto mb-2 animate-spin text-[#747A72]" />
          Loading approved WhatsApp templates from Meta Cloud API...
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center text-xs text-[#747A72] bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD] space-y-2">
          <Sparkles size={28} className="mx-auto text-[#CCD2C8]" />
          <p className="font-semibold text-[#2F352F]">No templates found</p>
          <p className="text-[11px]">Make sure Meta WhatsApp Cloud API credentials are configured.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {templates.map((tmpl) => {
            const isUtility = tmpl.category === "UTILITY";
            const isMarketing = tmpl.category === "MARKETING";

            return (
              <div
                key={tmpl.name}
                className="p-5 rounded-3xl bg-[#FFFFFF] border border-[#E0E4DD] shadow-xs flex flex-col justify-between space-y-4 hover:border-[#CCD2C8] transition"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {isUtility ? (
                          <Receipt size={16} className="text-[#5F7A62]" />
                        ) : (
                          <Sparkles size={16} className="text-[#B18A45]" />
                        )}
                        <h3 className="font-mono text-xs font-bold text-[#2F352F]">{tmpl.name}</h3>
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

                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E8ECE5] text-[#5F7A62] text-[10px] font-bold uppercase tracking-wider border border-[#5F7A62]/30">
                      <CheckCircle2 size={11} />
                      <span>Approved</span>
                    </span>
                  </div>

                  {/* Body Preview */}
                  <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] text-xs text-[#2F352F] leading-relaxed whitespace-pre-wrap font-sans">
                    {tmpl.bodyText || "No body text"}
                  </div>
                </div>

                {/* Footer specs */}
                <div className="pt-3 border-t border-[#E0E4DD] flex items-center justify-between text-[11px] text-[#747A72]">
                  <span className="flex items-center gap-1 font-mono">
                    <Code size={13} />
                    <span>{tmpl.variableCount} Parameter{tmpl.variableCount !== 1 ? "s" : ""}</span>
                  </span>
                  <span className="font-semibold text-[#5F7A62] flex items-center gap-1">
                    <ShieldCheck size={13} />
                    <span>Meta Verified</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
