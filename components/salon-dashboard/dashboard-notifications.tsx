"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Package, UserCheck, UserX, Check, Sparkles, CalendarDays, Clock } from "lucide-react";
import * as productService from "@/services/products";
import * as customerService from "@/services/customers";
import * as notificationService from "@/services/notifications";
import * as appointmentService from "@/services/appointments";
import type { Product } from "@/types/product";
import type { Customer } from "@/types/customer";
import type { Notification } from "@/types/notification";
import type { Appointment } from "@/types/appointment";
import { toLocalDateString } from "@/lib/utils/date";
import { requestNotificationPermission } from "@/lib/reminders/appointmentReminderManager";
import Link from "next/link";

export default function DashboardNotifications() {
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [expiringMemberships, setExpiringMemberships] = useState<Customer[]>([]);
  const [dbNotifications, setDbNotifications] = useState<Notification[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("granted");
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission("unsupported");
    }
  }, []);

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
  };

  const fetchData = async () => {
    try {
      // 1. Fetch products and filter low stock (<= 5 units)
      const allProducts = await productService.getAll();
      const lowStock = allProducts.filter((p) => (p.quantity ?? 0) <= (p.lowStockThreshold || 5));
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

      // 3. Fetch today's pending/scheduled appointments
      const todayStr = toLocalDateString(new Date());
      const appts = await appointmentService.getByDate(todayStr);
      const activeAppts = appts.filter((a) => a.status === "scheduled" || a.status === "confirmed");
      setTodayAppointments(activeAppts);

      // 4. Fetch unread notifications from DB
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

  const totalAlertsCount =
    lowStockProducts.length +
    expiringMemberships.length +
    todayAppointments.length +
    dbNotifications.length;

  if (loading) {
    return (
      <div className="grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72]">
        <Bell size={17} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="relative grid size-10 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] transition hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5] cursor-pointer"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={17} className={totalAlertsCount > 0 ? "text-[#B55B5B]" : ""} />
        {totalAlertsCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-[#B55B5B] text-[9px] font-bold text-[#FFFFFF] shadow-xs">
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

          {/* Dropdown panel */}
          <div
            className="fixed z-[9999] w-80 sm:w-96 rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 space-y-4 text-[#292D29]"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
          >
            <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] text-[#6F776D]">
                  <Bell size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#292D29] text-left">Notifications & Reminders</h2>
                  <p className="text-[10px] text-[#747A72] font-medium mt-0.5 text-left">Appointments, stock and membership updates</p>
                </div>
              </div>
              {totalAlertsCount > 0 && (
                <span className="inline-flex items-center justify-center bg-[#FBEBEB] text-[#B55B5B] text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none shrink-0 border border-[#B55B5B]/20">
                  {totalAlertsCount} Alert{totalAlertsCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {notificationPermission !== "granted" && notificationPermission !== "unsupported" && (
              <div className="flex items-center justify-between gap-3 p-3 bg-[#FAF4E8] border border-[#B18A45]/30 rounded-xl text-xs">
                <div className="min-w-0 text-left">
                  <span className="font-bold text-[#292D29] block text-[11px]">System Reminders</span>
                  <span className="text-[10px] text-[#747A72]">Get alerted 30 min before appointments</span>
                </div>
                <button
                  onClick={handleEnableNotifications}
                  className="shrink-0 bg-[#6F776D] hover:bg-[#2F352F] text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition cursor-pointer"
                >
                  🔔 Enable Appointment Notifications
                </button>
              </div>
            )}

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {totalAlertsCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-[#747A72]">
                  <Sparkles size={22} className="text-[#5F7A62] mb-2" />
                  <p className="text-xs font-semibold text-[#292D29]">All caught up!</p>
                  <p className="text-[10px] text-[#747A72] mt-0.5">No pending appointments or inventory alerts.</p>
                </div>
              ) : (
                <>
                  {/* Today's Appointments Reminders */}
                  {todayAppointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between gap-3 p-3 bg-[#E8ECE5]/50 border border-[#CCD2C8] rounded-xl text-xs text-[#2F352F]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CalendarDays size={15} className="text-[#6F776D] shrink-0" />
                        <div className="min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[#2F352F] truncate">{appt.customerName || "Customer"}</span>
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-[#FFFFFF] border border-[#CCD2C8] text-[#2F352F]">
                              {appt.startTime}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#747A72] font-medium truncate block">
                            {appt.notes || "Customer visit appointment"}
                          </span>
                        </div>
                      </div>
                      <Link
                        href="/appointments"
                        onClick={() => setIsOpen(false)}
                        className="font-bold text-[11px] text-[#6F776D] hover:text-[#2F352F] hover:underline transition shrink-0"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                  {/* 1. Low Stock Products Alerts */}
                  {lowStockProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-4 p-3 bg-[#FBEBEB] border border-[#B55B5B]/30 rounded-xl text-xs text-[#B55B5B]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Package size={14} className="text-[#B55B5B] shrink-0" />
                        <div className="min-w-0 text-left">
                          <span className="font-bold text-[#292D29] truncate block mr-1">{p.name}</span>
                          <span className="font-medium text-[#747A72]">
                            Only <b>{p.quantity ?? 0}</b> units remaining.
                          </span>

                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href="/products"
                          onClick={() => setIsOpen(false)}
                          className="font-bold text-[#B55B5B] hover:underline transition px-2 py-1 rounded-lg"
                        >
                          Reorder
                        </Link>
                        <button
                          onClick={() => p.id && handleDismissProduct(p.id)}
                          className="p-1 rounded-lg hover:bg-[#FFFFFF] text-[#747A72] hover:text-[#292D29] cursor-pointer"
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
                        className="flex items-center justify-between gap-4 p-3 bg-[#FAF4E8] border border-[#B18A45]/30 rounded-xl text-xs text-[#B18A45]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserCheck size={14} className="text-[#B18A45] shrink-0" />
                          <div className="min-w-0 text-left">
                            <span className="font-bold text-[#292D29] truncate block mr-1">{c.name}</span>
                            <span className="font-medium text-[#747A72]">
                              Expiring in <b>{daysLeft} days</b>.
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href="/customers"
                            onClick={() => setIsOpen(false)}
                            className="font-bold text-[#B18A45] hover:underline transition px-2 py-1 rounded-lg"
                          >
                            Renew
                          </Link>
                          <button
                            onClick={() => c.id && handleDismissMembership(c.id)}
                            className="p-1 rounded-lg hover:bg-[#FFFFFF] text-[#747A72] hover:text-[#292D29] cursor-pointer"
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
                      className="flex items-center justify-between gap-4 p-3 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs text-[#292D29]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 text-left">
                        <UserX size={14} className="text-[#747A72] shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-[#292D29] truncate block mr-1">{n.title}</span>
                          <span className="font-medium text-[#747A72]">{n.message}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => n.id && handleMarkAsRead(n.id)}
                        className="p-1 rounded-lg hover:bg-[#E8ECE5] text-[#747A72] hover:text-[#2F352F] cursor-pointer shrink-0"
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