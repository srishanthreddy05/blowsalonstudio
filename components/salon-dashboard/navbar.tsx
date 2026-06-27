"use client";

import { Bell, ChevronDown, Settings, Sparkles } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0A0A0A]/80 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="grid size-11 place-items-center rounded-2xl border border-[#D4AF37]/35 bg-[#D4AF37]/15 text-[#D4AF37]">
            <Sparkles size={21} />
          </div>
          <span className="font-semibold text-white">Demo</span>
        </div>
        <div className="hidden lg:block" />

        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#D4AF37]/60" />
          <div className="text-center">
            <p className="text-lg font-semibold tracking-wide text-white">Demo Salon</p>
            <p className="text-[10px] uppercase tracking-[0.4em] text-[#D4AF37]">Management Suite</p>
          </div>
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#D4AF37]/60" />
        </div>

        <div className="flex justify-end gap-2">
          <IconButton label="Notifications">
            <Bell size={18} />
          </IconButton>
          <IconButton label="Settings">
            <Settings size={18} />
          </IconButton>
          <button className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] pl-2 pr-3 transition hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/10">
            <span className="grid size-8 place-items-center rounded-xl bg-[#D4AF37] text-sm font-bold text-black">
              AS
            </span>
            <span className="hidden text-sm font-medium text-stone-200 sm:inline">Admin</span>
            <ChevronDown size={16} className="text-stone-400" />
          </button>
        </div>
      </div>
    </header>
  );
}

function IconButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] text-stone-300 transition hover:border-[#D4AF37]/45 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
    >
      {children}
    </button>
  );
}
