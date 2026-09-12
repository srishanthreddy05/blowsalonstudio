"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { Staff } from "@/types/staff";
import type { AttendanceRecord, AttendanceStatus } from "@/types/attendance";
import { normalizeAttendanceStatus } from "@/types/attendance";
import * as attendanceService from "@/services/attendance";
import { Calendar, Filter, RefreshCw, XCircle } from "lucide-react";

interface AttendanceHistoryTableProps {
  staffList: Staff[];
  selectedEmployeeId?: string;
  onClearEmployeeFilter?: () => void;
}

export function AttendanceHistoryTable({
  staffList,
  selectedEmployeeId,
  onClearEmployeeFilter,
}: AttendanceHistoryTableProps) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);

  // Filters
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>(selectedEmployeeId || "all");
  const [filterStatus, setFilterStatus] = useState<AttendanceStatus | "All">("All");

  // Sync external employee filter if passed
  useEffect(() => {
    if (selectedEmployeeId) {
      setFilterEmployeeId(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await attendanceService.getAttendanceHistory({
        date: filterDate || undefined,
        month: !filterDate ? filterMonth : undefined,
        employeeId: filterEmployeeId !== "all" ? filterEmployeeId : undefined,
        status: filterStatus,
        limitCount: 150,
      });
      setRecords(data);
    } catch (err) {
      console.error("Failed to load attendance history:", err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterDate, filterEmployeeId, filterStatus]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const staffMap = useMemo(() => {
    const map = new Map<string, Staff>();
    staffList.forEach((s) => {
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [staffList]);

  // Generate month options (last 12 months)
  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      options.push({ value: val, label });
    }
    return options;
  }, []);

  const formatDateDisplay = (dateKey: string) => {
    if (!dateKey) return "—";
    const [y, m, d] = dateKey.split("-").map(Number);
    if (!y || !m || !d) return dateKey;
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: AttendanceStatus) => {
    const norm = normalizeAttendanceStatus(status);
    if (norm === "PRESENT") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CCD2C8] bg-[#E8ECE5] px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#2F352F]">
          <span className="size-1.5 rounded-full bg-[#5F7A62]" />
          PRESENT
        </span>
      );
    }
    if (norm === "ABSENT") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F8D7D7] bg-[#FBEBEB] px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#B55B5B]">
          <span className="size-1.5 rounded-full bg-[#B55B5B]" />
          ABSENT
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#E0E4DD] bg-[#F7F7F4] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[#747A72]">
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E0E4DD]">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-[#6F776D]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#2F352F]">
              Attendance Filter Controls
            </span>
          </div>
          <button
            onClick={() => loadHistory()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] hover:bg-[#E8ECE5] px-3 py-1.5 text-xs font-semibold text-[#2F352F] transition cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
          {/* Month Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#747A72] mb-1">
              Select Month
            </label>
            <select
              value={filterMonth}
              disabled={!!filterDate}
              onChange={(e) => {
                setFilterMonth(e.target.value);
                setFilterDate("");
              }}
              className="w-full h-9 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] disabled:opacity-50"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Specific Date Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#747A72] mb-1 flex justify-between">
              <span>Specific Date</span>
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="text-[#6F776D] hover:underline cursor-pointer"
                >
                  Clear Date
                </button>
              )}
            </label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-full h-9 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D]"
            />
          </div>

          {/* Employee Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#747A72] mb-1 flex justify-between">
              <span>Employee</span>
              {filterEmployeeId !== "all" && onClearEmployeeFilter && (
                <button
                  onClick={() => {
                    setFilterEmployeeId("all");
                    onClearEmployeeFilter();
                  }}
                  className="text-[#6F776D] hover:underline cursor-pointer"
                >
                  All Staff
                </button>
              )}
            </label>
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
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#747A72] mb-1">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full h-9 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D]"
            >
              <option value="All">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
            </select>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-[#747A72]">
            <Calendar size={36} className="mx-auto mb-2 opacity-30 text-[#6F776D]" />
            <p className="font-semibold text-sm text-[#2F352F]">No attendance records found.</p>
            <p className="text-xs text-[#747A72] mt-1">
              {staffList.length === 0
                ? "No staff added yet."
                : "Try adjusting the date, month, or employee filters above."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#292D29]">
              <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee / Role</th>
                  <th className="py-3 px-4">Attendance Status</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD]">
                {records.map((rec) => {
                  const staffObj = staffMap.get(rec.employeeId);
                  const name = rec.employeeName || staffObj?.name || "Staff Member";
                  const role = staffObj?.role || "Specialist";

                  return (
                    <tr
                      key={rec.id || `${rec.employeeId}_${rec.date}`}
                      className="hover:bg-[#F7F7F4]/60 transition"
                    >
                      <td className="py-3.5 px-4 font-medium whitespace-nowrap">
                        {formatDateDisplay(rec.date)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="grid size-8 place-items-center rounded-xl bg-[#E8ECE5] text-[#2F352F] font-serif font-bold text-xs border border-[#CCD2C8] shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-serif font-bold text-[#2F352F]">{name}</p>
                            <p className="text-[10px] text-[#747A72] uppercase tracking-wider">
                              {role}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(rec.status)}
                      </td>
                      <td className="py-3.5 px-4 text-[#747A72] text-[11px] max-w-[240px] truncate">
                        {rec.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
