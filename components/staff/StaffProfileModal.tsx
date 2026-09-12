"use client";

import { useState, useEffect } from "react";
import type { Staff } from "@/types/staff";
import type { AttendanceRecord, AttendanceSummary } from "@/types/attendance";
import { normalizeAttendanceStatus } from "@/types/attendance";
import * as attendanceService from "@/services/attendance";
import { formatCurrency } from "@/components/salon-dashboard/types";
import {
  X,
  User,
  Calendar,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { toLocalDateString } from "@/lib/utils/date";

interface StaffProfileModalProps {
  staff: Staff;
  isOpen: boolean;
  onClose: () => void;
  onViewFullAttendance: (staffId: string) => void;
  todayServicesCount: number;
  todayServiceRevenue: number;
  monthServicesCount: number;
  monthServiceRevenue: number;
}

export function StaffProfileModal({
  staff,
  isOpen,
  onClose,
  onViewFullAttendance,
  todayServicesCount,
  todayServiceRevenue,
  monthServicesCount,
  monthServiceRevenue,
}: StaffProfileModalProps) {
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [summary, setSummary] = useState<AttendanceSummary>({
    presentDays: 0,
    absentDays: 0,
    totalRecorded: 0,
    attendanceRate: 0,
  });
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);

  const todayKey = toLocalDateString(new Date());

  useEffect(() => {
    if (!isOpen || !staff.id) return;

    let isMounted = true;
    setLoadingAttendance(true);

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    Promise.all([
      attendanceService.getStaffAttendanceForDate(staff.id, todayKey),
      attendanceService.getStaffAttendanceSummary(staff.id, monthKey),
      attendanceService.getStaffRecentAttendance(staff.id, 6),
    ])
      .then(([todayRec, sum, recs]) => {
        if (isMounted) {
          setTodayRecord(todayRec);
          setSummary(sum);
          setRecentRecords(recs);
        }
      })
      .catch((err) => {
        console.error("Failed to load staff attendance summary:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingAttendance(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, staff.id, todayKey]);

  if (!isOpen) return null;

  const formatDateDisplay = (dateKey: string) => {
    if (!dateKey) return "—";
    const [y, m, d] = dateKey.split("-").map(Number);
    if (!y || !m || !d) return dateKey;
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const currentMonthName = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayStatus = normalizeAttendanceStatus(todayRecord?.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header with Close */}
        <div className="flex items-start justify-between pb-4 border-b border-[#E0E4DD]">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-[#6F776D] text-[#FFFFFF] font-serif font-bold text-2xl shadow-sm">
              {staff.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl font-bold text-[#2F352F]">{staff.name}</h2>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                    staff.status === "Active"
                      ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                      : "bg-[#FBEBEB] text-[#B55B5B] border-[#FBEBEB]"
                  }`}
                >
                  {staff.status}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#747A72] tracking-wider uppercase mt-0.5">
                {staff.role} • BLOW SALON Specialist
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6 pt-5">
          {/* Section 1: Staff Details & Today's Attendance */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3 flex items-center gap-1.5">
              <User size={13} className="text-[#6F776D]" />
              Staff Details & Today's Availability
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
                <p className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Phone</p>
                <p className="text-xs font-semibold text-[#2F352F] mt-1">{staff.phone || "—"}</p>
              </div>
              <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
                <p className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Role</p>
                <p className="text-xs font-semibold text-[#2F352F] mt-1">{staff.role}</p>
              </div>
              <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
                <p className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Base Salary</p>
                <p className="text-xs font-bold text-[#5F7A62] mt-1">
                  {staff.salary ? formatCurrency(staff.salary) : "—"}
                  <span className="text-[9px] font-normal text-[#747A72]"> /mo</span>
                </p>
              </div>
              <div className="rounded-xl border border-[#CCD2C8] bg-[#E8ECE5]/50 p-3">
                <p className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Today&apos;s Status</p>
                <p className="text-xs font-bold text-[#2F352F] mt-1">
                  {todayStatus === "PRESENT"
                    ? "● PRESENT"
                    : todayStatus === "ABSENT"
                    ? "○ ABSENT"
                    : "○ NOT MARKED"}
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Attendance Summary */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] flex items-center gap-1.5">
                <Calendar size={13} className="text-[#6F776D]" />
                Attendance Summary ({currentMonthName})
              </h3>
              {staff.id && (
                <button
                  onClick={() => {
                    if (staff.id) {
                      onClose();
                      onViewFullAttendance(staff.id);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#6F776D] hover:text-[#2F352F] transition cursor-pointer"
                >
                  View Full Attendance
                  <ArrowRight size={13} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-[#CCD2C8] bg-[#E8ECE5]/50 p-3.5 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2F352F]">
                  Present Days
                </span>
                <p className="font-serif text-2xl font-bold text-[#2F352F] mt-1">
                  {summary.presentDays}
                </p>
              </div>

              <div className="rounded-2xl border border-[#F8D7D7] bg-[#FBEBEB]/60 p-3.5 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B55B5B]">
                  Absent Days
                </span>
                <p className="font-serif text-2xl font-bold text-[#B55B5B] mt-1">
                  {summary.absentDays}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                  Attendance Rate
                </span>
                <p className="font-serif text-2xl font-bold text-[#5F7A62] mt-1">
                  {summary.totalRecorded > 0 ? `${summary.attendanceRate}%` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Recent Attendance Logs */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3">
              Recent Attendance
            </h3>
            <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] overflow-hidden">
              {loadingAttendance ? (
                <div className="p-6 text-center text-xs text-[#747A72]">
                  Loading attendance records...
                </div>
              ) : recentRecords.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#747A72]">
                  No attendance records found for this specialist.
                </div>
              ) : (
                <div className="divide-y divide-[#E0E4DD]">
                  {recentRecords.map((rec) => {
                    const statusNorm = normalizeAttendanceStatus(rec.status);
                    return (
                      <div
                        key={rec.id || `${rec.employeeId}_${rec.date}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-[#F7F7F4]/60 transition"
                      >
                        <span className="font-medium text-xs text-[#2F352F]">
                          {formatDateDisplay(rec.date)}
                        </span>
                        <div>
                          {statusNorm === "PRESENT" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CCD2C8] bg-[#E8ECE5] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[#2F352F]">
                              <span className="size-1.5 rounded-full bg-[#5F7A62]" />
                              PRESENT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F8D7D7] bg-[#FBEBEB] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[#B55B5B]">
                              <span className="size-1.5 rounded-full bg-[#B55B5B]" />
                              ABSENT
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Service Performance (Separate from attendance, no commissions) */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-[#6F776D]" />
              Service Performance (Invoices Completed)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                  Services Today
                </span>
                <p className="font-serif text-xl font-bold text-[#2F352F] mt-1">
                  {todayServicesCount}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                  Revenue Today
                </span>
                <p className="font-serif text-xl font-bold text-[#5F7A62] mt-1">
                  {formatCurrency(todayServiceRevenue)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                  Services (Mo)
                </span>
                <p className="font-serif text-xl font-bold text-[#2F352F] mt-1">
                  {monthServicesCount}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                  Revenue (Mo)
                </span>
                <p className="font-serif text-xl font-bold text-[#5F7A62] mt-1">
                  {formatCurrency(monthServiceRevenue)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-2 border-t border-[#E0E4DD] pt-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-[#E0E4DD] px-4 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
          >
            Close
          </button>
          {staff.id && (
            <button
              onClick={() => {
                if (staff.id) {
                  onClose();
                  onViewFullAttendance(staff.id);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
            >
              View Full Attendance History
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
