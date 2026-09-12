"use client";

import { Menu, LogOut } from "lucide-react";
import DashboardNotifications from "@/components/salon-dashboard/dashboard-notifications";
import CreditTracker from "@/components/salon-dashboard/credit-tracker";
import AdvanceTracker from "@/components/salon-dashboard/advance-tracker";
import { useAuth } from "@/context/AuthContext";

interface NavbarProps {
  onToggleMobileSidebar: () => void;
}

export function Navbar({ onToggleMobileSidebar }: NavbarProps) {
  const { user, logout } = useAuth();

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

        {/* Right: Trackers, Notifications & Profile */}
        <div className="flex justify-end items-center gap-2 sm:gap-2.5">
          <AdvanceTracker />
          <CreditTracker />
          <DashboardNotifications />
          {user && (
            <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-[#E0E4DD]">
              <div
                className="flex items-center gap-1.5 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 py-1.5 text-xs font-semibold text-[#2F352F] max-w-[160px] truncate"
                title={user.email || ""}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    className="size-5 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="grid size-5 place-items-center rounded-full bg-[#6F776D] text-white text-[10px] font-bold shrink-0">
                    {(user.email || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate text-[11px] font-medium hidden md:inline">
                  {user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Sign out of BLOW SALON"
                className="grid size-8 place-items-center rounded-xl border border-[#FBEBEB] bg-[#FFF5F5] text-[#B55B5B] transition hover:bg-[#B55B5B] hover:text-[#FFFFFF] cursor-pointer shrink-0"
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}