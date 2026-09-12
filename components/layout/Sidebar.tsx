"use client";

import {
  BadgePercent,
  CreditCard,
  Gauge,
  Menu,
  Package,
  Scissors,
  Users,
  WalletCards,
  X,
  History,
  Coins,
  Sparkles,
} from "lucide-react";
import { SidebarItem } from "./SidebarItem";
import { useMemo } from "react";
import { useAppData } from "@/context/AppDataContext";

function WhatsAppIcon({ size = 19, strokeWidth = 2, className = "" }: { size?: number; strokeWidth?: number; className?: string }) {
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

const menuGroups = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Gauge },
    ],
  },
  {
    title: "Daily Operations",
    items: [
      { label: "Settlements", href: "/settlements", icon: Coins },
      { label: "Invoices", href: "/invoices", icon: History },
      { label: "Customers", href: "/customers", icon: Users },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Services", href: "/services", icon: Scissors },
      { label: "Packages", href: "/packages", icon: Sparkles },
      { label: "Products", href: "/products", icon: Package },
      { label: "Offers", href: "/offers", icon: WalletCards },
    ],
  },
  {
    title: "Team",
    items: [
      { label: "Staff", href: "/staff", icon: BadgePercent },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "Expenses", href: "/expenses", icon: Coins },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "WhatsApp", href: "/whatsapp", icon: WhatsAppIcon },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) {
  const { settings } = useAppData();

  const salonTitle = useMemo(() => {
    const name = settings?.salonName;
    if (!name || name.toLowerCase().includes("demo") || name.toLowerCase().includes("thea")) return "BLOW SALON";
    return name;
  }, [settings]);

  const navList = (isMobile: boolean) => (
    <div className="space-y-6">
      {menuGroups.map((group, groupIdx) => {
        const showHeader = group.title && (!collapsed || isMobile);
        const showSeparator = groupIdx > 0 && collapsed && !isMobile;

        return (
          <div key={group.title || groupIdx} className="space-y-1.5">
            {showSeparator && (
              <div className="my-3 border-t border-[#E0E4DD] mx-2" />
            )}
            {showHeader && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#747A72]">
                {group.title}
              </p>
            )}
            <nav className="space-y-1">
              {group.items.map((item) => (
                <SidebarItem
                  key={item.label}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  collapsed={isMobile ? false : collapsed}
                  onClick={isMobile ? () => setMobileOpen(false) : undefined}
                />
              ))}
            </nav>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Desktop/Tablet Collapsible Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-30 hidden border-r border-[#E0E4DD] bg-[#FFFFFF] shadow-sm transition-all duration-300 lg:block ${
          collapsed ? "w-24" : "w-72"
        }`}
      >
        <div className="flex h-full flex-col p-4">
          {/* Brand Header */}
          <div className="mb-6 flex h-16 items-center justify-between border-b border-[#E0E4DD] pb-3 px-1">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-[#6F776D] text-[#FFFFFF] shadow-xs shrink-0">
                <span className="font-serif text-lg font-extrabold tracking-tight">{salonTitle.charAt(0) || "B"}</span>
              </div>
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-base font-extrabold tracking-wider text-[#2F352F] uppercase truncate font-serif">
                    {salonTitle}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#747A72]">
                    Management Suite
                  </span>
                </div>
              )}
            </div>
            <button
              aria-label="Toggle sidebar"
              onClick={onToggle}
              className={`grid size-9 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] transition hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5] ${
                collapsed ? "mx-auto mt-2" : ""
              }`}
            >
              <Menu size={17} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 select-none font-medium flex flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div>
              {navList(false)}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer Panel */}
          <aside className="fixed bottom-0 left-0 top-0 z-50 w-72 border-r border-[#E0E4DD] bg-[#FFFFFF] p-4 flex flex-col shadow-2xl transition-transform duration-300">
            <div className="mb-6 flex h-16 items-center justify-between border-b border-[#E0E4DD] pb-3 px-1">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-[#6F776D] text-[#FFFFFF] shadow-xs shrink-0">
                  <span className="font-serif text-lg font-extrabold tracking-tight">{salonTitle.charAt(0) || "B"}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-base font-extrabold tracking-wider text-[#2F352F] uppercase truncate font-serif">
                    {salonTitle}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#747A72]">
                    Management Suite
                  </span>
                </div>
              </div>
              <button
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="grid size-9 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] transition hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5]"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 select-none font-medium flex flex-col [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div>
                {navList(true)}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
