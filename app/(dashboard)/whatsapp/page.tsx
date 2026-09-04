"use client";

import { Lock, AlertCircle, ShieldAlert, PhoneCall, ExternalLink, Sparkles, Send } from "lucide-react";

function WhatsAppIcon({ size = 36, strokeWidth = 1.75, className = "" }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function WhatsAppPage() {
  return (
    <div className="w-full text-[#292D29] space-y-8 max-w-4xl mx-auto">
      {/* Page Title */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
          Communication Suite
        </p>
        <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
          WhatsApp
        </h1>
      </div>

      {/* Blocked / Unavailable Main Card */}
      <div className="rounded-3xl border border-[#CCD2C8] bg-[#FFFFFF] p-8 md:p-12 shadow-sm text-center relative overflow-hidden">
        {/* Subtle decorative background accent */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 size-48 rounded-full bg-[#E8ECE5] opacity-50 blur-2xl pointer-events-none" />

        <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-[#E8ECE5] border border-[#CCD2C8] text-[#6F776D] mb-6 shadow-xs">
          <WhatsAppIcon size={36} strokeWidth={1.75} />
        </div>

        <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#2F352F] mb-3">
          WhatsApp integration is currently unavailable
        </h2>

        <p className="text-sm text-[#747A72] max-w-lg mx-auto leading-relaxed mb-8">
          This feature will be enabled after official WhatsApp Business API configuration and verification are completed.
        </p>

        {/* Status Specification Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-8 text-left">
          <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block mb-1">
              Integration Status
            </span>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-[#B55B5B]" />
              <span className="text-xs font-bold text-[#2F352F]">Not Connected</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block mb-1">
              Terminal Access
            </span>
            <div className="flex items-center gap-2">
              <Lock size={12} className="text-[#747A72]" />
              <span className="text-xs font-bold text-[#747A72]">Unavailable</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block mb-1">
              Planned Scope
            </span>
            <span className="text-xs font-bold text-[#2F352F]">Bills • Receipts • Campaigns</span>
          </div>
        </div>

        {/* Action Button (Disabled state) */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            disabled
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#E8ECE5] border border-[#CCD2C8] px-6 text-xs font-bold text-[#747A72] opacity-70 cursor-not-allowed shadow-xs"
          >
            <Lock size={14} />
            Feature Locked
          </button>
        </div>
      </div>
    </div>
  );
}
