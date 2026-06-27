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
  Settings,
  X,
  History,
  Coins,
  LogOut,
} from "lucide-react";
import { SidebarItem } from "./SidebarItem";
import { useMemo } from "react";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

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
    title: "Administration",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
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
  const { settings, products } = useAppData();
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const salonName = useMemo(() => {
    if (!settings?.salonName) return "Demo";
    return settings.salonName.split(" ")[0];
  }, [settings]);



  const navList = (isMobile: boolean) => (
    <div className="space-y-6">
      {menuGroups.map((group, groupIdx) => {
        const showHeader = group.title && (!collapsed || isMobile);
        const showSeparator = groupIdx > 0 && collapsed && !isMobile;

        return (
          <div key={group.title || groupIdx} className="space-y-2">
            {showSeparator && (
              <div className="my-4 border-t border-[#2E2B24] mx-2" />
            )}
            {showHeader && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.25em] text-[#6B6358]">
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
        className={`fixed bottom-0 left-0 top-0 z-30 hidden border-r border-[#2E2B24] bg-[#131210] shadow-2xl transition-all duration-300 lg:block ${collapsed ? "w-24" : "w-72"
          }`}
      >
        <div className="flex h-full flex-col p-4">
          <div className="mb-8 flex h-14 items-center justify-between rounded-xl" style={{ backgroundColor: "#000000", margin: "-16px -16px 32px -16px", padding: "40px 16px" }}>

            <div className="flex min-w-0 items-center">
              {!collapsed && (
                <img
                  src="/logoo.jpeg"
                  alt="Logo"
                  className="h-16 w-auto object-contain rounded-lg"
                  style={{ maxWidth: "160px" }}
                />
              )}
            </div>
            <button
              aria-label="Toggle sidebar"
              onClick={onToggle}
              className={`grid size-10 place-items-center rounded-xl border border-[#2E2B24] bg-[#131210] text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1F1A0F] ${collapsed ? "mx-auto" : ""
                }`}
            >
              <Menu size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 select-none font-medium flex flex-col justify-between [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div>
              {navList(false)}
            </div>

            <div className="mt-6 mb-4 shrink-0">
              <button
                onClick={handleLogout}
                className={`group flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition duration-200 text-[#A89F8C] hover:bg-[#1F1A0F] hover:text-[#B8962E] border border-transparent hover:border-[#B8962E] ${collapsed ? "justify-center" : "justify-start"
                  }`}
              >
                <LogOut size={20} className="transition text-[#6B6358] group-hover:text-[#B8962E]" />
                {!collapsed && <span className="truncate">Logout</span>}
              </button>
            </div>
          </div>


        </div>
      </aside>

      {/* Mobile Drawer Navigation overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer Panel */}
          <aside className="fixed bottom-0 left-0 top-0 z-50 w-72 border-r border-[#2E2B24] bg-[#131210] p-4 flex flex-col shadow-2xl transition-transform duration-300">
            <div className="mb-8 flex h-14 items-center justify-between rounded-xl" style={{ backgroundColor: "#000000", margin: "-16px -16px 32px -16px", padding: "40px 16px" }}>
              <div className="flex min-w-0 items-center">
                <img
                  src="/logoo.jpeg"
                  alt="Logo"
                  className="h-16 w-auto object-contain rounded-lg"
                  style={{ maxWidth: "160px" }}
                />
              </div>
              <button
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="grid size-10 place-items-center rounded-xl border border-[#2E2B24] bg-[#131210] text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1F1A0F]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 select-none font-medium flex flex-col justify-between [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div>
                {navList(true)}
              </div>

              <div className="mt-6 mb-4 shrink-0">
                <button
                  onClick={async () => {
                    setMobileOpen(false);
                    await handleLogout();
                  }}
                  className="group flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold transition duration-200 text-[#A89F8C] hover:bg-[#1F1A0F] hover:text-[#B8962E] border border-transparent hover:border-[#B8962E] justify-start"
                >
                  <LogOut size={20} className="transition text-[#6B6358] group-hover:text-[#B8962E]" />
                  <span className="truncate">Logout</span>
                </button>
              </div>
            </div>


          </aside>
        </div>
      )}
    </>
  );
}
