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
      className="sticky top-0 z-20 border-b shadow-md"
      style={{ backgroundColor: "#000000", borderColor: "#2E2B24", height: "80px" }}
    >
      {/* Brand Name — centered */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-sm sm:text-base md:text-xl font-bold tracking-widest text-[#F5F0E8] uppercase hidden sm:block">
          Demo Salon ERP
        </span>
      </div>

      {/* Overlay grid on top of banner */}
      <div className="relative h-full grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile menu toggle */}
        <div className="flex items-center gap-3 lg:hidden">
          <button
            onClick={onToggleMobileSidebar}
            className="grid size-11 place-items-center rounded-xl border border-[#2E2B24] text-[#A89F8C] transition hover:bg-[#1C1A16] hover:text-[#F5F0E8]"
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        </div>
        <div className="hidden lg:block" />

        {/* Center: empty — banner is the branding */}
        <div />

        {/* Right: Notification Bell & Trackers */}
        <div className="flex justify-end gap-3">
          <AdvanceTracker />
          <CreditTracker />
          <DashboardNotifications />
        </div>
      </div>
    </header>

  );
}