"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Package, AlertTriangle, UserCheck, UserX, Check, Trash, Sparkles } from "lucide-react";
import * as productService from "@/services/products";
import * as customerService from "@/services/customers";
import * as notificationService from "@/services/notifications";
import type { Product } from "@/types/product";
import type { Customer } from "@/types/customer";
import type { Notification } from "@/types/notification";
import Link from "next/link";

export default function DashboardNotifications() {
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [expiringMemberships, setExpiringMemberships] = useState<Customer[]>([]);
  const [dbNotifications, setDbNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchData = async () => {
    try {
      // 1. Fetch products and filter low stock / servings
      const allProducts = await productService.getAll();
      const lowStock = allProducts.filter((p) => {
        if (p.type === "service") {
          return (p.noOfServings ?? 0) < 3;
        } else {
          return (p.quantity ?? 0) < 5;
        }
      });
      setLowStockProducts(lowStock);

      // 2. Fetch memberships and filter expiring soon (within 7 days)
      const memberships = await customerService.getMemberships();
      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(now.getDate() + 7);

      const expiring = memberships.filter((c) => {
        if (!c.membershipEnd) return false;
        const end = new Date(c.membershipEnd);
        return end > now && end <= sevenDaysFromNow;
      });
      setExpiringMemberships(expiring);

      // 3. Fetch unread notifications from DB
      const allNotifications = await notificationService.getAll();
      const unread = allNotifications.filter((n) => !n.read);
      setDbNotifications(unread);
    } catch (error) {
      console.error("Error fetching dashboard notification data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Poll every 60 seconds to keep it fresh
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Recalculate dropdown position whenever it opens
  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen((prev) => !prev);
  };

  // Close on scroll/resize to avoid stale positioning
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      setDbNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleDismissProduct = (productId: string) => {
    setLowStockProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleDismissMembership = (customerId: string) => {
    setExpiringMemberships((prev) => prev.filter((c) => c.id !== customerId));
  };

  const totalAlertsCount = lowStockProducts.length + expiringMemberships.length + dbNotifications.length;

  if (loading) {
    return (
      <div className="grid size-11 place-items-center rounded-2xl border border-[#2E2B24] bg-[#131210] text-[#6B6358]">
        <Bell size={18} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative grid size-11 place-items-center rounded-2xl border border-[#2E2B24] bg-[#131210] text-[#A89F8C] transition hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1C1A16] cursor-pointer"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={18} className={totalAlertsCount > 0 ? "animate-swing" : ""} />
        {totalAlertsCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-[#131210]">
            {totalAlertsCount}
          </span>
        )}
      </button>

      {isOpen && typeof window !== "undefined" && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown panel — rendered on <body> to escape header stacking context */}
          <div
            className="fixed z-[9999] w-80 sm:w-96 rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-4 text-[#A89F8C]"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
          >
            <div className="flex items-center justify-between border-b border-[#2E2B24] pb-3">
              <div className="flex items-center gap-2">
                <div className="grid size-9 place-items-center rounded-xl bg-[#131210] text-[#B8962E] border border-[#2E2B24]">
                  <Bell size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F5F0E8] text-left">Notifications & Alerts</h2>
                  <p className="text-[10px] text-[#6B6358] font-semibold mt-0.5 text-left">Critical stock and membership updates</p>
                </div>
              </div>
              {totalAlertsCount > 0 && (
                <span className="inline-flex items-center justify-center bg-[#131210] text-[#B8962E] text-[10px] font-bold px-2 py-0.5 rounded-full select-none shrink-0 border border-[#2E2B24]">
                  {totalAlertsCount} Alert{totalAlertsCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {totalAlertsCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[#6B6358]">
                  <Sparkles size={24} className="text-[#6B6358] mb-2 animate-pulse" />
                  <p className="text-xs font-semibold text-[#A89F8C]">All caught up!</p>
                  <p className="text-[10px] text-[#6B6358] mt-0.5">No pending stock or membership alerts.</p>
                </div>
              ) : (
                <>
                  {/* 1. Low Stock Products Alerts */}
                  {lowStockProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-4 p-3 bg-[#1F1315] border border-rose-950/50 rounded-2xl text-xs text-rose-300"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Package size={14} className="text-rose-400 shrink-0" />
                        <div className="min-w-0 text-left">
                          <span className="font-bold text-rose-100 truncate block mr-1">{p.name}</span>
                          <span className="font-medium text-rose-300">
                            {p.type === "service" ? (
                              <>Only <b>{p.noOfServings ?? 0}</b> servings left.</>
                            ) : (
                              <>Only <b>{p.quantity}</b> remaining.</>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href="/products"
                          onClick={() => setIsOpen(false)}
                          className="font-bold text-rose-400 hover:text-rose-200 hover:underline transition px-2 py-1 rounded-lg hover:bg-rose-950/60"
                        >
                          Reorder
                        </Link>
                        <button
                          onClick={() => p.id && handleDismissProduct(p.id)}
                          className="p-1 rounded-lg hover:bg-rose-950/60 text-rose-400 hover:text-rose-200 cursor-pointer"
                          title="Dismiss warning"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* 2. Expiring Memberships Alerts */}
                  {expiringMemberships.map((c) => {
                    const daysLeft = Math.ceil(
                      (new Date(c.membershipEnd!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                    );

                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-4 p-3 bg-[#1F1911] border border-amber-950/50 rounded-2xl text-xs text-amber-300"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserCheck size={14} className="text-amber-400 shrink-0" />
                          <div className="min-w-0 text-left">
                            <span className="font-bold text-amber-100 truncate block mr-1">{c.name}</span>
                            <span className="font-medium text-amber-300">
                              Expiring in <b>{daysLeft} days</b>.
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href="/customers"
                            onClick={() => setIsOpen(false)}
                            className="font-bold text-amber-400 hover:text-amber-200 hover:underline transition px-2 py-1 rounded-lg hover:bg-amber-950/60"
                          >
                            Renew
                          </Link>
                          <button
                            onClick={() => c.id && handleDismissMembership(c.id)}
                            className="p-1 rounded-lg hover:bg-amber-950/60 text-amber-400 hover:text-amber-200 cursor-pointer"
                            title="Dismiss warning"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* 3. DB Notifications */}
                  {dbNotifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center justify-between gap-4 p-3 bg-[#131210] border border-[#2E2B24] rounded-2xl text-xs text-[#A89F8C]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 text-left">
                        <UserX size={14} className="text-[#6B6358] shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-[#F5F0E8] truncate block mr-1">{n.title}</span>
                          <span className="font-medium text-[#A89F8C]">{n.message}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => n.id && handleMarkAsRead(n.id)}
                        className="p-1 rounded-lg hover:bg-[#1C1A16] text-[#6B6358] hover:text-[#B8962E] cursor-pointer shrink-0"
                        title="Mark as read"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}