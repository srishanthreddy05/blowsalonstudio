"use client";

import { Menu } from "lucide-react";
import DashboardNotifications from "@/components/salon-dashboard/dashboard-notifications";
import CreditTracker from "@/components/salon-dashboard/credit-tracker";
import AdvanceTracker from "@/components/salon-dashboard/advance-tracker";

interface NavbarProps {
  onToggleMobileSidebar: () => void;
}

export function Navbar({ onToggleMobileSidebar }: NavbarProps) {
  return (
    <header
      className="sticky top-0 z-20 border-b border-[#E0E4DD] bg-[#FFFFFF]/90 backdrop-blur-md shadow-2xs"
      style={{ height: "72px" }}
    >
      {/* Brand Name — centered */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="text-sm sm:text-base md:text-lg font-serif font-bold tracking-[0.2em] text-[#2F352F] uppercase hidden sm:block">
            BLOW SALON
          </span>
        </div>
      </div>

      {/* Grid container */}
      <div className="relative h-full grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile menu toggle */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            onClick={onToggleMobileSidebar}
            className="grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] transition hover:bg-[#E8ECE5] hover:text-[#2F352F] hover:border-[#6F776D]"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        </div>
        <div className="hidden lg:block" />

        {/* Center */}
        <div />

        {/* Right: Trackers & Notifications */}
        <div className="flex justify-end items-center gap-2.5">
          <AdvanceTracker />
          <CreditTracker />
          <DashboardNotifications />
        </div>
      </div>
    </header>
  );
}