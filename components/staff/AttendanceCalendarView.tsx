"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Staff } from "@/types/staff";
import type { AttendanceRecord } from "@/types/attendance";
import { normalizeAttendanceStatus } from "@/types/attendance";
import * as attendanceService from "@/services/attendance";
import {
  getAllStaffMonthRevenue,
  type StaffMonthRevenueData,
} from "@/services/staffRevenue";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { toLocalDateString } from "@/lib/utils/date";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
  CalendarDays,
  Receipt,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface AttendanceCalendarViewProps {
  staffList: Staff[];
  selectedEmployeeId?: string;
  onClearEmployeeFilter?: () => void;
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

export function AttendanceCalendarView({
  staffList,
  selectedEmployeeId,
  onClearEmployeeFilter,
}: AttendanceCalendarViewProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [staffRevenueMap, setStaffRevenueMap] = useState<
    Record<string, StaffMonthRevenueData>
  >({});

  // Current month being viewed: format 'YYYY-MM'
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Filters
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>(
    selectedEmployeeId || "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "HAS_ABSENCE" | "ALL_PRESENT"
  >("ALL");

  // Read-only Date Detail Modal State
  const [activeDateModal, setActiveDateModal] = useState<{
    staff: Staff;
    dateKey: string;
    currentRecord?: AttendanceRecord;
  } | null>(null);

  // Sync external employee filter if provided
  useEffect(() => {
    if (selectedEmployeeId) {
      setFilterEmployeeId(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  // Load all attendance records and revenue data for the selected month
  const loadMonthData = useCallback(async () => {
    setLoading(true);
    try {
      const [attendanceData, revenueData] = await Promise.all([
        attendanceService.getAttendanceHistory({
          month: selectedMonth,
          employeeId: filterEmployeeId !== "all" ? filterEmployeeId : undefined,
          limitCount: 1500,
        }),
        getAllStaffMonthRevenue(selectedMonth, staffList),
      ]);
      setRecords(attendanceData);
      setStaffRevenueMap(revenueData);
    } catch (err) {
      console.error("Failed to load attendance/revenue records for calendar:", err);
      setRecords([]);
      setStaffRevenueMap({});
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, filterEmployeeId, staffList]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  // Lookup map: employeeId -> { [dateKey]: AttendanceRecord }
  const attendanceMap = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>();
    records.forEach((rec) => {
      if (!rec.employeeId || !rec.date) return;
      if (!map.has(rec.employeeId)) {
        map.set(rec.employeeId, new Map());
      }
      map.get(rec.employeeId)!.set(rec.date, rec);
    });
    return map;
  }, [records]);

  // Parse Year and Month
  const { year, monthIndex, monthName, daysInMonth, startDayOffset } = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split("-");
    const y = parseInt(yStr, 10) || new Date().getFullYear();
    const m = (parseInt(mStr, 10) || 1) - 1;
    const dateObj = new Date(y, m, 1);

    const mName = dateObj.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const totalDays = new Date(y, m + 1, 0).getDate();
    const firstDay = new Date(y, m, 1).getDay();
    const mondayOffset = (firstDay + 6) % 7;

    return {
      year: y,
      monthIndex: m,
      monthName: mName,
      daysInMonth: totalDays,
      startDayOffset: mondayOffset,
    };
  }, [selectedMonth]);

  const todayDateKey = useMemo(() => toLocalDateString(new Date()), []);

  // Month navigation handlers
  const handlePrevMonth = () => {
    const d = new Date(year, monthIndex - 1, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setActiveDateModal(null);
  };

  const handleNextMonth = () => {
    const d = new Date(year, monthIndex + 1, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setActiveDateModal(null);
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    setActiveDateModal(null);
  };

  // Month options for dropdown
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = -12; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      // Employee filter
      if (filterEmployeeId !== "all" && s.id !== filterEmployeeId) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesRole = s.role?.toLowerCase().includes(q);
        if (!matchesName && !matchesRole) return false;
      }
      // Status filter
      if (statusFilter !== "ALL" && s.id) {
        const empMap = attendanceMap.get(s.id);
        let hasAbsent = false;
        let presentCount = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const rec = empMap?.get(dKey);
          const norm = rec ? normalizeAttendanceStatus(rec.status) : "NOT_MARKED";
          if (norm === "ABSENT") hasAbsent = true;
          if (norm === "PRESENT") presentCount++;
        }

        if (statusFilter === "HAS_ABSENCE" && !hasAbsent) return false;
        if (statusFilter === "ALL_PRESENT" && (hasAbsent || presentCount === 0)) return false;
      }
      return true;
    });
  }, [
    staffList,
    filterEmployeeId,
    searchQuery,
    statusFilter,
    attendanceMap,
    daysInMonth,
    year,
    monthIndex,
  ]);

  // Open Date Modal (View Only)
  const handleOpenDateModal = (staff: Staff, dayNumber: number) => {
    if (!staff.id) return;
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    const currentRec = attendanceMap.get(staff.id)?.get(dateKey);

    setActiveDateModal({
      staff,
      dateKey,
      currentRecord: currentRec,
    });
  };

  // Helper to format date string for display
  const formatModalDate = (dKey: string) => {
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

  // Date detail variables for active modal
  const activeStaffId = activeDateModal?.staff.id;
  const activeDateKey = activeDateModal?.dateKey;
  const activeStaffRevenueData = activeStaffId ? staffRevenueMap[activeStaffId] : undefined;
  const modalDayRevenue =
    activeStaffRevenueData && activeDateKey
      ? activeStaffRevenueData.dailyRevenue[activeDateKey] || 0
      : 0;
  const modalDayRecords =
    activeStaffRevenueData && activeDateKey
      ? activeStaffRevenueData.dailyRecords[activeDateKey] || []
      : [];
  const modalAttendanceStatus = activeDateModal?.currentRecord
    ? normalizeAttendanceStatus(activeDateModal.currentRecord.status)
    : "NOT_MARKED";
  const modalAttendanceNotes = activeDateModal?.currentRecord?.notes;

  return (
    <div className="space-y-6">
      {/* GLOBAL CONTROLS & HEADER */}
      <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs">
        <div className="flex flex-col gap-4">
          {/* Top Row: Month Navigation & Today Jump */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E0E4DD]">
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-[#F7F7F4] border border-[#E0E4DD] rounded-2xl p-1 shadow-2xs">
                <button
                  onClick={handlePrevMonth}
                  className="grid size-8 place-items-center rounded-xl text-[#747A72] hover:bg-[#E8ECE5] hover:text-[#2F352F] transition cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="px-3 py-1 font-serif text-base font-bold text-[#2F352F] min-w-[140px] text-center">
                  {monthName}
                </div>
                <button
                  onClick={handleNextMonth}
                  className="grid size-8 place-items-center rounded-xl text-[#747A72] hover:bg-[#E8ECE5] hover:text-[#2F352F] transition cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <button
                onClick={handleCurrentMonth}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] hover:bg-[#D8DEC5] px-3 text-xs font-bold text-[#2F352F] transition cursor-pointer shadow-2xs"
              >
                <CalendarDays size={14} />
                Today
              </button>
            </div>

            {/* Quick Month Selector & Refresh */}
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs font-semibold text-[#292D29] outline-none focus:border-[#6F776D] cursor-pointer"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => loadMonthData()}
                disabled={loading}
                className="grid size-9 place-items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] hover:bg-[#E8ECE5] text-[#2F352F] transition cursor-pointer"
                title="Refresh Attendance & Revenue"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Bottom Row: Filters (Employee, Search, Status) & Global Legend */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              {/* Employee Filter */}
              <div className="w-full sm:w-56">
                <select
                  value={filterEmployeeId}
                  onChange={(e) => {
                    setFilterEmployeeId(e.target.value);
                    if (e.target.value === "all" && onClearEmployeeFilter) {
                      onClearEmployeeFilter();
                    }
                  }}
                  className="w-full h-9 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D]"
                >
                  <option value="all">All Specialists ({staffList.length})</option>
                  {staffList.map((stf) => (
                    <option key={stf.id} value={stf.id}>
                      {stf.name} ({stf.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="w-full sm:w-44">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full h-9 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D]"
                >
                  <option value="ALL">All Attendance</option>
                  <option value="HAS_ABSENCE">Has Absences</option>
                  <option value="ALL_PRESENT">100% Present</option>
                </select>
              </div>

              {/* Search Staff */}
              <div className="flex max-w-xs w-full items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 h-9 focus-within:border-[#6F776D] focus-within:bg-[#FFFFFF] transition">
                <Search size={14} className="text-[#747A72] mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search specialist..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-[#747A72] hover:text-[#2F352F]"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Global Legend */}
            <div className="flex items-center gap-3 bg-[#F7F7F4] border border-[#E0E4DD] px-3.5 py-1.5 rounded-2xl text-[11px] font-bold tracking-wide">
              <span className="text-[10px] uppercase tracking-wider text-[#747A72] mr-1">
                Legend:
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#2F352F]">
                <span className="size-2.5 rounded-full bg-[#5F7A62]" />
                Present
              </span>
              <span className="text-[#CCD2C8]">|</span>
              <span className="inline-flex items-center gap-1.5 text-[#B55B5B]">
                <span className="size-2.5 rounded-full bg-[#B55B5B]" />
                Absent
              </span>
              <span className="text-[#CCD2C8]">|</span>
              <span className="inline-flex items-center gap-1.5 text-[#747A72]">
                <span className="size-2.5 rounded-full bg-[#CCD2C8]" />
                Not Marked
              </span>
              <span className="text-[#CCD2C8]">|</span>
              <span className="inline-flex items-center gap-1 text-[#2F352F]">
                ₹ Revenue
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* CALENDAR CARDS GRID */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF]">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center text-[#747A72]">
          <CalendarIcon size={40} className="mx-auto mb-2 opacity-30 text-[#6F776D]" />
          <p className="font-serif font-bold text-base text-[#2F352F]">
            No specialists match the selected criteria.
          </p>
          <p className="text-xs text-[#747A72] mt-1">
            Try adjusting your search keywords, month, or employee filter above.
          </p>
        </div>
      ) : (
        /* Responsive Grid: 2 columns on Desktop, 1 on Mobile/Tablet */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredStaff.map((stf) => {
            if (!stf.id) return null;
            const empRecords = attendanceMap.get(stf.id);
            const stfRevData = staffRevenueMap[stf.id] || {
              totalMonthRevenue: 0,
              dailyRevenue: {},
              dailyRecords: {},
            };

            // Compute summary statistics for this employee in this month
            let presentCount = 0;
            let absentCount = 0;
            let notMarkedCount = 0;

            for (let day = 1; day <= daysInMonth; day++) {
              const dayStr = String(day).padStart(2, "0");
              const dKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${dayStr}`;
              const rec = empRecords?.get(dKey);
              const norm = rec ? normalizeAttendanceStatus(rec.status) : "NOT_MARKED";

              if (norm === "PRESENT") {
                presentCount++;
              } else if (norm === "ABSENT") {
                absentCount++;
              } else {
                notMarkedCount++;
              }
            }

            return (
              <div
                key={stf.id}
                className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs hover:border-[#CCD2C8] hover:shadow-md transition duration-200 flex flex-col justify-between"
              >
                {/* 1. Employee Header & 2. Month/Year */}
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E0E4DD]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="grid size-11 place-items-center rounded-2xl bg-[#E8ECE5] text-[#2F352F] font-serif font-bold text-base border border-[#CCD2C8] shrink-0">
                        {stf.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-serif font-bold text-base text-[#2F352F] truncate">
                            {stf.name}
                          </h3>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                              stf.status === "Active"
                                ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                                : "bg-[#FBEBEB] text-[#B55B5B] border-[#FBEBEB]"
                            }`}
                          >
                            {stf.status}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                          {stf.role}
                        </p>
                      </div>
                    </div>

                    {/* Month / Year Badge */}
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] px-2.5 py-1 text-xs font-serif font-bold text-[#2F352F]">
                        {monthName}
                      </span>
                    </div>
                  </div>

                  {/* 3. Monthly Calendar Grid (Monday - Sunday) */}
                  <div className="pt-3">
                    {/* Weekday headers: Mon, Tue, Wed, Thu, Fri, Sat, Sun */}
                    <div className="grid grid-cols-7 gap-1 text-center mb-1">
                      {WEEKDAYS.map((w) => (
                        <div
                          key={w.short}
                          className="py-1 text-[10px] font-bold uppercase tracking-wider text-[#747A72]"
                          title={w.full}
                        >
                          {w.short}
                        </div>
                      ))}
                    </div>

                    {/* Day Cells Grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {/* Leading empty blank slots for offset */}
                      {Array.from({ length: startDayOffset }).map((_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          className="h-14 sm:h-16 rounded-xl bg-transparent opacity-0 pointer-events-none"
                        />
                      ))}

                      {/* Actual Month Days */}
                      {Array.from({ length: daysInMonth }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const dayStr = String(dayNum).padStart(2, "0");
                        const dKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${dayStr}`;
                        const record = empRecords?.get(dKey);
                        const statusNorm = record
                          ? normalizeAttendanceStatus(record.status)
                          : "NOT_MARKED";
                        const isToday = dKey === todayDateKey;
                        const dailyRev = stfRevData.dailyRevenue[dKey] || 0;

                        const isPresent = statusNorm === "PRESENT";
                        const isAbsent = statusNorm === "ABSENT";

                        return (
                          <button
                            key={dKey}
                            onClick={() => handleOpenDateModal(stf, dayNum)}
                            title={`${stf.name} - ${dKey}: ${
                              isPresent ? "Present" : isAbsent ? "Absent" : "Not Marked"
                            } • Revenue: ${formatCurrency(dailyRev)} (Click to view history)`}
                            className={`group relative h-14 sm:h-16 rounded-xl border text-left p-1 sm:p-1.5 transition flex flex-col justify-between cursor-pointer select-none ${
                              isPresent
                                ? "border-[#CCD2C8] bg-[#E8ECE5]/60 hover:bg-[#E8ECE5] text-[#2F352F]"
                                : isAbsent
                                ? "border-[#F8D7D7] bg-[#FBEBEB] hover:bg-[#F8D7D7] text-[#B55B5B]"
                                : "border-[#E0E4DD] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#747A72]"
                            } ${isToday ? "ring-2 ring-[#6F776D] font-bold" : ""}`}
                          >
                            {/* Top: Day number + Today indicator */}
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

                              {/* Today Marker */}
                              {isToday && (
                                <span className="text-[7px] font-extrabold uppercase tracking-tighter text-[#6F776D]">
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
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 5. Summary & Monthly Revenue inside employee card */}
                <div className="mt-4 pt-3 border-t border-[#E0E4DD] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    {/* Attendance Counts */}
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

                    {/* Revenue This Month & Rate */}
                    <div className="flex items-center gap-2">
                      {presentCount + absentCount > 0 && (
                        <span className="text-[10px] font-bold text-[#5F7A62] bg-[#E8ECE5] px-2 py-0.5 rounded-full border border-[#CCD2C8]">
                          {Math.round((presentCount / (presentCount + absentCount)) * 100)}% Rate
                        </span>
                      )}
                      <div className="font-semibold text-xs text-[#2F352F] bg-[#F7F7F4] border border-[#E0E4DD] px-2.5 py-1 rounded-xl">
                        Monthly Revenue:{" "}
                        <strong className="font-bold text-[#5F7A62]">
                          {formatCurrency(stfRevData.totalMonthRevenue)}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* READ-ONLY DATE DETAIL & REVENUE MODAL */}
      {activeDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveDateModal(null)}
          />

          <div className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#E0E4DD]">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-2xl bg-[#6F776D] text-[#FFFFFF] font-serif font-bold text-lg shadow-sm">
                  {activeDateModal.staff.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-base text-[#2F352F]">
                    {activeDateModal.staff.name}
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                    {activeDateModal.staff.role} • Specialist
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveDateModal(null)}
                className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-4 pt-4">
              {/* Selected Date Header */}
              <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                  Selected Date
                </p>
                <p className="font-serif font-bold text-sm text-[#2F352F] mt-0.5">
                  {formatModalDate(activeDateModal.dateKey)}
                </p>
              </div>

              {/* 1. Read-Only Attendance Section */}
              <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] p-3.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#747A72]">
                  Attendance
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      modalAttendanceStatus === "PRESENT"
                        ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                        : modalAttendanceStatus === "ABSENT"
                        ? "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]"
                        : "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                    }`}
                  >
                    {modalAttendanceStatus === "PRESENT"
                      ? "● PRESENT"
                      : modalAttendanceStatus === "ABSENT"
                      ? "● ABSENT"
                      : "○ NOT MARKED"}
                  </span>
                  {modalAttendanceNotes && (
                    <span className="text-xs text-[#747A72] italic">
                      ({modalAttendanceNotes})
                    </span>
                  )}
                </div>
              </div>

              {/* 2. Daily Revenue & Grouped Revenue Records */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#747A72]">
                    Today&apos;s Revenue
                  </span>
                  <span className="font-serif text-base font-bold text-[#5F7A62]">
                    {formatCurrency(modalDayRevenue)}
                  </span>
                </div>

                {/* Records List */}
                <div className="mt-2 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#747A72] block">
                    Revenue Records
                  </span>

                  {modalDayRecords.length === 0 ? (
                    <div className="p-3 text-center rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] text-xs text-[#747A72]">
                      No completed services/revenue for this date.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] overflow-hidden divide-y divide-[#E0E4DD]">
                      {modalDayRecords.map((item) => (
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

                      {/* Total Footer */}
                      <div className="p-3 bg-[#F7F7F4] flex items-center justify-between text-xs font-bold text-[#2F352F]">
                        <span>TOTAL REVENUE</span>
                        <span className="font-serif text-base text-[#5F7A62]">
                          {formatCurrency(modalDayRevenue)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2 border-t border-[#E0E4DD] pt-4">
              <button
                type="button"
                onClick={() => setActiveDateModal(null)}
                className="rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] hover:bg-[#E8ECE5] px-4 py-2 text-xs font-bold text-[#2F352F] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
