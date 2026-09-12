"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { AppDataProvider } from "@/context/AppDataContext";
import { useRouter, usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts while the user is typing inside inputs, textareas, selects, or contentEditable elements
      const target = e.target as HTMLElement;
      if (target) {
        const tagName = target.tagName?.toLowerCase();
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      // Registry of shortcuts for future-proofing
      const shortcuts = [
        {
          key: "b",
          ctrlKey: true,
          action: () => {
            if (pathname !== "/billing") {
              router.push("/billing");
            }
          },
        },
      ];

      for (const shortcut of shortcuts) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrlKey === e.ctrlKey;
        const altMatch = !!(shortcut as any).altKey === e.altKey;
        const shiftMatch = !!(shortcut as any).shiftKey === e.shiftKey;
        const metaMatch = !!(shortcut as any).metaKey === e.metaKey;

        if (keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch) {
          e.preventDefault();
          shortcut.action();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [router, pathname]);

  return (
    <AppDataProvider>
      <div className="relative min-h-screen bg-[#F7F7F4] text-[#292D29] antialiased">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        
        <div
          className={`min-h-screen flex flex-col transition-all duration-300 relative ${
            collapsed ? "lg:pl-24" : "lg:pl-72"
          }`}
        >
          <Navbar onToggleMobileSidebar={() => setMobileOpen((value) => !value)} />
          <main className="flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="border-t border-[#E0E4DD] bg-[#FFFFFF] py-4 px-4 sm:px-6 lg:px-8 text-xs text-[#747A72] select-none">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#2F352F]">BLOW SALON — Management Suite</span>
              <span>All rights reserved</span>
            </div>
          </footer>
        </div>
      </div>
    </AppDataProvider>
  );
}
