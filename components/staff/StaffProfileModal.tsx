"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Staff } from "@/types/staff";
import { formatStaffRole, normalizeStaffRole } from "@/types/staff";
import type { AttendanceRecord } from "@/types/attendance";
import { normalizeAttendanceStatus } from "@/types/attendance";
import * as attendanceService from "@/services/attendance";
import { getStaffMonthRevenue, type StaffMonthRevenueData } from "@/services/staffRevenue";
import { formatCurrency } from "@/components/salon-dashboard/types";
import {
  X,
  User,
  Calendar as CalendarIcon,
  TrendingUp,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Receipt,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toLocalDateString } from "@/lib/utils/date";
import {
  getBusinessMonth,
  getCurrentBusinessMonth,
  getPreviousBusinessMonth,
  getNextBusinessMonth,
} from "@/lib/utils/businessMonth";

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

const WEEKDAYS = [
  { short: "Mon", full: "Monday" },
  { short: "Tue", full: "Tuesday" },
  { short: "Wed", full: "Wednesday" },
  { short: "Thu", full: "Thursday" },
  { short: "Fri", full: "Friday" },
  { short: "Sat", full: "Saturday" },
  { short: "Sun", full: "Sunday" },
];

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
  const [loadingData, setLoadingData] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return getCurrentBusinessMonth().monthKey;
  });

  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [revenueData, setRevenueData] = useState<StaffMonthRevenueData>({
    totalMonthRevenue: 0,
    dailyRevenue: {},
    dailyRecords: {},
  });

  // Read-only date history modal state
  const [activeDateDetail, setActiveDateDetail] = useState<{
    dateKey: string;
    dayNum: number;
    currentRecord?: AttendanceRecord;
  } | null>(null);

  const todayKey = toLocalDateString(new Date());
  const isManager = normalizeStaffRole(staff.role) === "MANAGER";

  // Parse Business Month Details
  const businessMonth = useMemo(() => {
    return getBusinessMonth(selectedMonth);
  }, [selectedMonth]);

  const { label: monthName, rangeLabel, daysInPeriod } = businessMonth;
  const startDayOffset = (businessMonth.startDate.getDay() + 6) % 7;

  // Load Month Attendance & Revenue Records
  const loadMonthData = useCallback(async () => {
    if (!staff.id) return;
    setLoadingData(true);
    try {
      const [recs, todayRec, rev] = await Promise.all([
        attendanceService.getAttendanceHistory({
          month: selectedMonth,
          employeeId: staff.id,
          limitCount: 100,
        }),
        attendanceService.getStaffAttendanceForDate(staff.id, todayKey),
        getStaffMonthRevenue(selectedMonth, staff.id, staff.name),
      ]);
      setMonthRecords(recs);
      setTodayRecord(todayRec);
      setRevenueData(rev);
    } catch (err) {
      console.error("Failed to load staff attendance/revenue:", err);
      setMonthRecords([]);
      setRevenueData({ totalMonthRevenue: 0, dailyRevenue: {}, dailyRecords: {} });
    } finally {
      setLoadingData(false);
    }
  }, [staff.id, staff.name, selectedMonth, todayKey]);

  useEffect(() => {
    if (isOpen && staff.id) {
      loadMonthData();
    }
  }, [isOpen, staff.id, loadMonthData]);

  // Map of records by date
  const recordsMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    monthRecords.forEach((r) => {
      if (r.date) map.set(r.date, r);
    });
    return map;
  }, [monthRecords]);

  // Compute Summary Statistics
  const { presentCount, absentCount, notMarkedCount, attendanceRate } = useMemo(() => {
    let p = 0;
    let a = 0;
    let nm = 0;

    for (const dKey of daysInPeriod) {
      const rec = recordsMap.get(dKey);
      const norm = rec ? normalizeAttendanceStatus(rec.status) : "NOT_MARKED";
      if (norm === "PRESENT") p++;
      else if (norm === "ABSENT") a++;
      else nm++;
    }

    const rate = p + a > 0 ? Math.round((p / (p + a)) * 100) : 0;
    return {
      presentCount: p,
      absentCount: a,
      notMarkedCount: nm,
      attendanceRate: rate,
    };
  }, [daysInPeriod, recordsMap]);

  if (!isOpen) return null;

  // Navigation handlers
  const handlePrevMonth = () => {
    setSelectedMonth(getPreviousBusinessMonth(selectedMonth).monthKey);
    setActiveDateDetail(null);
  };

  const handleNextMonth = () => {
    setSelectedMonth(getNextBusinessMonth(selectedMonth).monthKey);
    setActiveDateDetail(null);
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(getCurrentBusinessMonth().monthKey);
    setActiveDateDetail(null);
  };

  // Open Date Click (View Only)
  const handleDayClick = (dateKey: string) => {
    const rec = recordsMap.get(dateKey);

    setActiveDateDetail({
      dateKey,
      dayNum: parseInt(dateKey.slice(8, 10), 10),
      currentRecord: rec,
    });
  };

  // Helper to format date string for display
  const formatDetailDate = (dKey: string) => {
    if (!dKey) return "";
    const [y, m, d] = dKey.split("-").map(Number);
    if (!y || !m || !d) return dKey;
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const todayStatus = normalizeAttendanceStatus(todayRecord?.status);

  // Selected date records for detail view
  const selectedDateKey = activeDateDetail?.dateKey;
  const selectedDateRevenue = selectedDateKey ? revenueData.dailyRevenue[selectedDateKey] || 0 : 0;
  const selectedDateRecords = selectedDateKey ? revenueData.dailyRecords[selectedDateKey] || [] : [];
  const selectedDateAttendance = activeDateDetail?.currentRecord
    ? normalizeAttendanceStatus(activeDateDetail.currentRecord.status)
    : "NOT_MARKED";
  const selectedDateNotes = activeDateDetail?.currentRecord?.notes;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
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
                {formatStaffRole(staff.role)} • BLOW SALON Staff
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
          {/* Section 1: Staff Details (No Phone card, 3-column layout) */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#747A72] mb-3 flex items-center gap-1.5">
              <User size={13} className="text-[#6F776D]" />
              Staff Details & Today&apos;s Availability
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3">
                <p className="text-[10px] uppercase font-bold text-[#747A72] tracking-wider">Role</p>
                <p className="text-xs font-semibold text-[#2F352F] mt-1">{formatStaffRole(staff.role)}</p>
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

          {/* Section 2: Attendance & Revenue History */}
          <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 sm:p-5 shadow-xs">
            {/* Calendar Header with Month Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E0E4DD]">
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl p-0.5 shadow-2xs">
                  <button
                    onClick={handlePrevMonth}
                    className="grid size-7 place-items-center rounded-lg text-[#747A72] hover:bg-[#E8ECE5] hover:text-[#2F352F] transition cursor-pointer"
                    title="Previous Month"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <div className="px-2.5 text-center min-w-[150px]">
                    <span className="font-serif text-sm font-bold text-[#2F352F] block leading-tight">
                      {monthName}
                    </span>
                    <span className="text-[9px] font-sans text-[#747A72] block">
                      {rangeLabel}
                    </span>
                  </div>
                  <button
                    onClick={handleNextMonth}
                    className="grid size-7 place-items-center rounded-lg text-[#747A72] hover:bg-[#E8ECE5] hover:text-[#2F352F] transition cursor-pointer"
                    title="Next Month"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                <button
                  onClick={handleCurrentMonth}
                  className="inline-flex h-8 items-center gap-1 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] hover:bg-[#D8DEC5] px-2.5 text-[11px] font-bold text-[#2F352F] transition cursor-pointer"
                >
                  <CalendarDays size={13} />
                  Today
                </button>
              </div>

              {/* Legend with Revenue */}
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                <span className="inline-flex items-center gap-1 text-[#2F352F]">
                  <span className="size-2 rounded-full bg-[#5F7A62]" /> Present
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-[#B55B5B]">
                  <span className="size-2 rounded-full bg-[#B55B5B]" /> Absent
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-[#747A72]">
                  <span className="size-2 rounded-full bg-[#CCD2C8]" /> Not Marked
                </span>
                {!isManager && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-[#2F352F]">
                      ₹ Revenue
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Calendar Days */}
            <div className="pt-3">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w.short}
                    className="py-1 text-[10px] font-bold uppercase tracking-wider text-[#747A72]"
                  >
                    {w.short}
                  </div>
                ))}
              </div>

              {/* Grid Cells */}
              {loadingData ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="size-7 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {/* Leading blanks */}
                  {Array.from({ length: startDayOffset }).map((_, idx) => (
                    <div
                      key={`empty-${idx}`}
                      className="h-14 sm:h-16 rounded-xl bg-transparent opacity-0 pointer-events-none"
                    />
                  ))}

                  {/* Actual Business Month days */}
                  {daysInPeriod.map((dKey) => {
                    const dayNum = parseInt(dKey.slice(8, 10), 10);
                    const rec = recordsMap.get(dKey);
                    const norm = rec ? normalizeAttendanceStatus(rec.status) : "NOT_MARKED";
                    const isToday = dKey === todayKey;

                    const isPresent = norm === "PRESENT";
                    const isAbsent = norm === "ABSENT";
                    const isSelected = activeDateDetail?.dateKey === dKey;
                    const dailyRev = revenueData.dailyRevenue[dKey] || 0;

                    return (
                      <button
                        key={dKey}
                        onClick={() => handleDayClick(dKey)}
                        className={`h-14 sm:h-16 rounded-xl border p-1 sm:p-1.5 text-left flex flex-col justify-between transition cursor-pointer select-none ${
                          isPresent
                            ? "border-[#CCD2C8] bg-[#E8ECE5]/60 hover:bg-[#E8ECE5] text-[#2F352F]"
                            : isAbsent
                            ? "border-[#F8D7D7] bg-[#FBEBEB] hover:bg-[#F8D7D7] text-[#B55B5B]"
                            : "border-[#E0E4DD] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#747A72]"
                        } ${isToday ? "ring-2 ring-[#6F776D] font-bold" : ""} ${
                          isSelected ? "ring-2 ring-[#2F352F]" : ""
                        }`}
                        title={`${dKey}: ${
                          isPresent ? "Present" : isAbsent ? "Absent" : "Not Marked"
                        } • Revenue: ${formatCurrency(dailyRev)} (Click to view history)`}
                      >
                        {/* Top: Day Number & Today */}
                        <div className="flex items-center justify-between w-full">
                          <span
                            className={`text-[11px] font-semibold leading-none ${
                              isPresent
                                ? "text-[#2F352F] font-bold"
                                : isAbsent
                                ? "text-[#B55B5B] font-bold"
                                : "text-[#747A72]"
                            }`}
                          >
                            {dayNum}
                          </span>
                          {isToday && (
                            <span className="text-[7px] font-extrabold uppercase text-[#6F776D]">
                              Today
                            </span>
                          )}
                        </div>

                        {/* Middle: Attendance Dot */}
                        <div className="flex items-center justify-center w-full">
                          {isPresent ? (
                            <span className="size-2 rounded-full bg-[#5F7A62] shadow-2xs" />
                          ) : isAbsent ? (
                            <span className="size-2 rounded-full bg-[#B55B5B] shadow-2xs" />
                          ) : (
                            <span className="size-1.5 rounded-full bg-[#CCD2C8]/70" />
                          )}
                        </div>

                        {/* Bottom: Daily Revenue */}
                        {!isManager && (
                          <div className="text-center w-full">
                            <span
                              className={`text-[10px] tracking-tight block truncate ${
                                dailyRev > 0
                                  ? "text-[#2F352F] font-bold"
                                  : "text-[#747A72]/60 font-medium"
                              }`}
                            >
                              {formatCurrency(dailyRev)}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Read-Only Date History Detail Panel */}
            {activeDateDetail && (
              <div className="mt-4 p-4 rounded-2xl border border-[#CCD2C8] bg-[#F7F7F4] space-y-4 animate-in fade-in duration-150">
                {/* Header & Date */}
                <div className="flex items-start justify-between pb-2 border-b border-[#E0E4DD]">
                  <div>
                    <h4 className="font-serif font-bold text-sm text-[#2F352F]">
                      {staff.name}
                    </h4>
                    <p className="text-xs font-semibold text-[#747A72]">
                      {formatDetailDate(activeDateDetail.dateKey)}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveDateDetail(null)}
                    className="grid size-7 place-items-center rounded-lg text-[#747A72] hover:text-[#2F352F] hover:bg-[#E0E4DD] transition cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* 1. Read-Only Attendance Status */}
                <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3 flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-[#747A72]">
                    Attendance
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                        selectedDateAttendance === "PRESENT"
                          ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                          : selectedDateAttendance === "ABSENT"
                          ? "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                          : "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                      }`}
                    >
                      {selectedDateAttendance === "PRESENT"
                        ? "● PRESENT"
                        : selectedDateAttendance === "ABSENT"
                        ? "● ABSENT"
                        : "○ NOT MARKED"}
                    </span>
                    {selectedDateNotes && (
                      <span className="text-xs text-[#747A72] italic">
                        ({selectedDateNotes})
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Today's Revenue & Revenue Records (Stylists Only) */}
                {!isManager && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] uppercase font-bold tracking-wider text-[#747A72]">
                        Today&apos;s Revenue
                      </span>
                      <span className="font-serif text-base font-bold text-[#5F7A62]">
                        {formatCurrency(selectedDateRevenue)}
                      </span>
                    </div>

                    {/* Records List */}
                    <div className="mt-2 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[#747A72] block">
                        Revenue Records
                      </span>

                      {selectedDateRecords.length === 0 ? (
                        <div className="p-3 text-center rounded-xl bg-[#FFFFFF] border border-[#E0E4DD] text-xs text-[#747A72]">
                          No completed services/revenue for this date.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] overflow-hidden divide-y divide-[#E0E4DD]">
                          {selectedDateRecords.map((item) => (
                            <div
                              key={item.invoiceId}
                              className="p-3 flex items-center justify-between gap-3 hover:bg-[#F7F7F4] transition text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="grid size-8 place-items-center rounded-xl bg-[#E8ECE5] text-[#2F352F] shrink-0 border border-[#CCD2C8]">
                                  <Receipt size={14} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Link
                                      href={`/invoices/${item.invoiceId}`}
                                      className="font-bold text-[#2F352F] hover:text-[#6F776D] underline flex items-center gap-1"
                                      title="View Invoice"
                                    >
                                      {item.invoiceNumber}
                                      <ExternalLink size={11} className="shrink-0" />
                                    </Link>
                                    <span className="text-[#CCD2C8]">•</span>
                                    <span className="text-[#747A72] font-semibold truncate">
                                      {item.customerName}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#747A72] mt-0.5 font-medium">
                                    {item.servicesCount} {item.servicesCount === 1 ? "Service" : "Services"}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-bold text-sm text-[#2F352F]">
                                  {formatCurrency(item.amount)}
                                </span>
                              </div>
                            </div>
                          ))}

                          {/* Total Summary Footer */}
                          <div className="p-3 bg-[#F7F7F4] flex items-center justify-between text-xs font-bold text-[#2F352F]">
                            <span>TOTAL REVENUE</span>
                            <span className="font-serif text-base text-[#5F7A62]">
                              {formatCurrency(selectedDateRevenue)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Close Button */}
                <div className="flex justify-end pt-2 border-t border-[#E0E4DD]">
                  <button
                    type="button"
                    onClick={() => setActiveDateDetail(null)}
                    className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] hover:bg-[#E8ECE5] px-4 py-1.5 text-xs font-bold text-[#2F352F] transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Summary Counts & Revenue This Month Bar */}
            <div className="mt-3 pt-3 border-t border-[#E0E4DD] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-1 font-semibold text-[#2F352F]">
                  <span className="size-2 rounded-full bg-[#5F7A62]" />
                  Present: <strong className="text-[#2F352F]">{presentCount}</strong>
                </span>
                <span className="text-[#CCD2C8]">|</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#B55B5B]">
                  <span className="size-2 rounded-full bg-[#B55B5B]" />
                  Absent: <strong className="text-[#B55B5B]">{absentCount}</strong>
                </span>
                <span className="text-[#CCD2C8]">|</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#747A72]">
                  <span className="size-2 rounded-full bg-[#CCD2C8]" />
                  Not Marked: <strong className="text-[#747A72]">{notMarkedCount}</strong>
                </span>
              </div>

              <div className="flex items-center gap-3">
                {presentCount + absentCount > 0 && (
                  <span className="text-[10px] font-bold text-[#5F7A62] bg-[#E8ECE5] px-2 py-0.5 rounded-full border border-[#CCD2C8]">
                    {attendanceRate}% Rate
                  </span>
                )}
                {!isManager && (
                  <div className="font-semibold text-xs text-[#2F352F] bg-[#F7F7F4] border border-[#E0E4DD] px-2.5 py-1 rounded-xl">
                    Revenue This Month:{" "}
                    <strong className="font-bold text-[#5F7A62]">
                      {formatCurrency(revenueData.totalMonthRevenue)}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Service Performance (Stylists Only) */}
          {!isManager && (
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
          )}
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
              {isManager ? "View Full Attendance History" : "View Full Attendance & Revenue History"}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
