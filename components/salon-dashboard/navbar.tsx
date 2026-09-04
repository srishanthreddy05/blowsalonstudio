"use client";

import { Bell, ChevronDown, Settings, Sparkles } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#E0E4DD] bg-[#FFFFFF]/90 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3 lg:hidden">
          <div className="grid size-11 place-items-center rounded-xl border border-[#6F776D]/20 bg-[#6F776D]/10 text-[#6F776D]">
            <Sparkles size={21} />
          </div>
          <span className="font-serif font-bold tracking-wider text-[#2F352F]">THEA</span>
        </div>
        <div className="hidden lg:block" />

        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#6F776D]/40" />
          <div className="text-center">
            <p className="text-lg font-serif font-bold tracking-wider text-[#2F352F]">THEA SALON</p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#6F776D]">Management Suite</p>
          </div>
          <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#6F776D]/40" />
        </div>

        <div className="flex justify-end gap-2">
          <IconButton label="Notifications">
            <Bell size={18} />
          </IconButton>
          <IconButton label="Settings">
            <Settings size={18} />
          </IconButton>
          <button className="flex h-11 items-center gap-3 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] pl-2 pr-3 transition hover:border-[#6F776D]/40 hover:bg-[#E8ECE5]">
            <span className="grid size-8 place-items-center rounded-lg bg-[#6F776D] text-xs font-serif font-bold text-white">
              TS
            </span>
            <span className="hidden text-sm font-medium text-[#2F352F] sm:inline">Thea Salon</span>
            <ChevronDown size={16} className="text-[#747A72]" />
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
      className="grid size-11 place-items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] text-[#747A72] transition hover:border-[#6F776D]/40 hover:bg-[#E8ECE5] hover:text-[#2F352F]"
    >
      {children}
    </button>
  );
}

