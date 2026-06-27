"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { AppDataProvider } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

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
  }, [user, router, pathname]);

  // While firebase resolves user state or if redirect is occurring
  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0E0D0B]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#B8962E] border-t-transparent" />
      </div>
    );
  }

  return (
    <AppDataProvider>
      <div className="relative min-h-screen bg-[#0E0D0B] text-[#A89F8C] antialiased">
        {pathname === "/dashboard" && (
          <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            <div 
              className="absolute inset-0 bg-cover bg-center filter blur-2xl opacity-20 scale-105"
              style={{ backgroundImage: "url('/banner.jpeg')" }}
            />
          </div>
        )}
        
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
          <main className="flex-1 px-4 pb-8 pt-4 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="border-t border-[#2E2B24] bg-[#131210] py-4 px-4 sm:px-6 lg:px-8 text-xs text-[#6B6358] select-none">
            <div className="flex items-center justify-between">
              <span>Demo Salon ERP</span>
              <span>Built by Thrivex Labs</span>
            </div>
          </footer>
        </div>
      </div>
    </AppDataProvider>
  );
}
