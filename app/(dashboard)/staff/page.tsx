"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import * as staffService from "@/services/staff";
import * as attendanceService from "@/services/attendance";
import type { Staff } from "@/types/staff";
import { formatStaffRole, normalizeStaffRole } from "@/types/staff";
import type { AttendanceRecord } from "@/types/attendance";
import { normalizeAttendanceStatus } from "@/types/attendance";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Users,
  Calendar,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Briefcase,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { useAppData } from "@/context/AppDataContext";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { toLocalDateString } from "@/lib/utils/date";
import { AttendanceCalendarView } from "@/components/staff/AttendanceCalendarView";
import { StaffProfileModal } from "@/components/staff/StaffProfileModal";
import { getCurrentBusinessMonth } from "@/lib/utils/businessMonth";

export default function StaffPage() {
  const { staff, refreshStaff, loadingAppData } = useAppData();
  const loading = loadingAppData;

  const currentBm = useMemo(() => getCurrentBusinessMonth(), []);

  // Active Tab
  const [activeTab, setActiveTab] = useState<"directory" | "history">("directory");
  const [searchQuery, setSearchQuery] = useState("");

  // Today's Attendance Map: employeeId -> AttendanceRecord
  const [todayAttendanceMap, setTodayAttendanceMap] = useState<Record<string, AttendanceRecord>>({});

  // Profile Modal State
  const [selectedStaffForProfile, setSelectedStaffForProfile] = useState<Staff | null>(null);
  const [historySelectedEmployeeId, setHistorySelectedEmployeeId] = useState<string>("all");

  // Add / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    role: "STYLIST",
    salary: 0,
    status: "Active",
    revenueMonthly: 0,
    servicesMonthly: 0,
  });

  // Manager Reassignment Confirmation Modal State
  const [managerConfirmModal, setManagerConfirmModal] = useState<{
    open: boolean;
    currentManager: Staff;
    targetStaffName: string;
    pendingPayload: Partial<Staff>;
    targetId?: string;
  } | null>(null);

  // Delete Confirm Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  // Service Performance Maps (Today & Monthly)
  const [staffTodayRevMap, setStaffTodayRevMap] = useState<Record<string, number>>({});
  const [staffTodaySrvMap, setStaffTodaySrvMap] = useState<Record<string, number>>({});
  const [staffMonthRevMap, setStaffMonthRevMap] = useState<Record<string, number>>({});
  const [staffMonthSrvMap, setStaffMonthSrvMap] = useState<Record<string, number>>({});

  const todayKey = toLocalDateString(new Date());

  // Load today's attendance records from Firestore
  const loadTodayAttendance = useCallback(async () => {
    try {
      const map = await attendanceService.getTodayAttendance(todayKey);
      setTodayAttendanceMap(map);
    } catch (err) {
      console.error("Failed to load today's attendance:", err);
    }
  }, [todayKey]);

  // Load service performance metrics from actual invoices (Today & This Business Month)
  const loadStaffPerformance = useCallback(async () => {
    try {
      const invRef = collection(db, "invoices");
      const q = query(invRef, where("date", ">=", currentBm.startDate), where("date", "<=", currentBm.endDate));
      const snap = await getDocs(q);

      const todayRev: Record<string, number> = {};
      const todaySrv: Record<string, number> = {};
      const monthRev: Record<string, number> = {};
      const monthSrv: Record<string, number> = {};

      staff.forEach((m) => {
        if (m.id) {
          todayRev[m.id] = 0;
          todaySrv[m.id] = 0;
          monthRev[m.id] = 0;
          monthSrv[m.id] = 0;
        }
      });

      snap.forEach((d) => {
        const inv = d.data();
        const invDate = inv.date?.toDate ? inv.date.toDate() : new Date(inv.date);
        const isToday = toLocalDateString(invDate) === todayKey;

        (inv.services || []).forEach((s: any) => {
          if (s.serviceId === "membership_fee" || s.isSystemService === true) return;
          const staffId = s.staffId;
          const staffName = s.staffName || s.staff;
          const matched = staff.find(
            (m) => (staffId && m.id === staffId) || (staffName && m.name === staffName)
          );

          if (matched && matched.id) {
            const amount =
              s.amount !== undefined
                ? Number(s.amount) || 0
                : Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);

            monthRev[matched.id] = (monthRev[matched.id] || 0) + amount;
            monthSrv[matched.id] = (monthSrv[matched.id] || 0) + 1;

            if (isToday) {
              todayRev[matched.id] = (todayRev[matched.id] || 0) + amount;
              todaySrv[matched.id] = (todaySrv[matched.id] || 0) + 1;
            }
          }
        });
      });

      setStaffTodayRevMap(todayRev);
      setStaffTodaySrvMap(todaySrv);
      setStaffMonthRevMap(monthRev);
      setStaffMonthSrvMap(monthSrv);
    } catch (error) {
      console.error("Failed to load staff performance from invoices:", error);
    }
  }, [staff, todayKey, currentBm]);

  useEffect(() => {
    loadTodayAttendance();
  }, [loadTodayAttendance]);

  useEffect(() => {
    if (staff && staff.length > 0) {
      loadStaffPerformance();
    }
  }, [staff, loadStaffPerformance]);

  // Staff Add/Edit Handlers
  const handleOpenAdd = () => {
    setEditingStaff(null);
    setFormData({
      name: "",
      phone: "",
      role: "STYLIST",
      salary: 0,
      status: "Active",
      revenueMonthly: 0,
      servicesMonthly: 0,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (stf: Staff, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStaff(stf);
    setFormData({
      name: stf.name,
      phone: stf.phone || "",
      role: normalizeStaffRole(stf.role),
      salary: stf.salary || 0,
      status: stf.status,
      revenueMonthly: stf.targets?.revenueMonthly || 0,
      servicesMonthly: stf.targets?.servicesMonthly || 0,
    });
    setModalOpen(true);
  };

  const handleDeleteTrigger = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!idToDelete) return;
    try {
      await staffService.delete(idToDelete);
      setDeleteConfirmOpen(false);
      setIdToDelete(null);
      await refreshStaff();
      loadStaffPerformance();
    } catch (error) {
      console.error("Failed to delete staff member:", error);
    }
  };

  const executeSave = async (
    payload: Partial<Staff>,
    targetId?: string,
    previousManagerId?: string
  ) => {
    try {
      if (previousManagerId) {
        await staffService.update(previousManagerId, { role: "STYLIST" });
      }
      if (targetId) {
        await staffService.update(targetId, payload);
      } else {
        await staffService.create(payload as any);
      }
      setModalOpen(false);
      setManagerConfirmModal(null);
      await refreshStaff();
      loadStaffPerformance();
    } catch (error) {
      console.error("Failed to save staff member:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedRole = normalizeStaffRole(formData.role);
    const payload: Partial<Staff> = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      role: normalizedRole,
      salary: Number(formData.salary) || 0,
      status: formData.status,
    };

    // If assigned as MANAGER, verify if another manager already exists
    if (normalizedRole === "MANAGER") {
      const existingManager = staff.find(
        (s) => normalizeStaffRole(s.role) === "MANAGER" && s.id && s.id !== editingStaff?.id
      );

      if (existingManager) {
        setManagerConfirmModal({
          open: true,
          currentManager: existingManager,
          targetStaffName: formData.name.trim() || "this staff member",
          pendingPayload: payload,
          targetId: editingStaff?.id,
        });
        return;
      }
    }

    await executeSave(payload, editingStaff?.id);
  };

  const filteredStaff = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return staff.filter((s) => {
      const nameMatch = s.name.toLowerCase().includes(q);
      const roleMatch =
        formatStaffRole(s.role).toLowerCase().includes(q) ||
        (s.role || "").toLowerCase().includes(q);
      return nameMatch || roleMatch;
    });
  }, [staff, searchQuery]);

  const sortedStaff = useMemo(() => {
    return [...filteredStaff].sort((a, b) => {
      const aIsManager = normalizeStaffRole(a.role) === "MANAGER";
      const bIsManager = normalizeStaffRole(b.role) === "MANAGER";
      if (aIsManager && !bIsManager) return -1;
      if (!aIsManager && bIsManager) return 1;

      const aIsActive = a.status === "Active";
      const bIsActive = b.status === "Active";
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredStaff]);

  const handleViewFullAttendanceForStaff = (staffId: string) => {
    setHistorySelectedEmployeeId(staffId);
    setActiveTab("history");
  };

  return (
    <div className="w-full text-[#292D29] space-y-6">
      {/* Title & Actions Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Staff Management
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            BLOW SALON Specialists & Attendance ({staff.length})
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAdd}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={15} />
            Register Staff
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#E0E4DD]">
        <button
          onClick={() => setActiveTab("directory")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${
            activeTab === "directory"
              ? "border-[#6F776D] text-[#2F352F] bg-[#FFFFFF]/40"
              : "border-transparent text-[#747A72] hover:text-[#2F352F] hover:border-[#CCD2C8]"
          }`}
        >
          <Users size={15} />
          Staff Directory
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2 cursor-pointer ${
            activeTab === "history"
              ? "border-[#6F776D] text-[#2F352F] bg-[#FFFFFF]/40"
              : "border-transparent text-[#747A72] hover:text-[#2F352F] hover:border-[#CCD2C8]"
          }`}
        >
          <Calendar size={15} />
          Attendance & Revenue History
        </button>
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : activeTab === "history" ? (
        /* Attendance & Revenue History View */
        <AttendanceCalendarView
          staffList={staff}
          selectedEmployeeId={historySelectedEmployeeId}
          onClearEmployeeFilter={() => setHistorySelectedEmployeeId("all")}
        />
      ) : (
        /* Staff Directory View */
        <div className="space-y-6">
          {/* Search bar & Section Title */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">Staff Directory</h2>
              <p className="text-xs text-[#747A72]">
                Profiles, salary details, and live service performance
              </p>
            </div>
            <div className="flex max-w-md w-full sm:w-80 items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-10 shadow-xs focus-within:border-[#6F776D] transition">
              <Search size={15} className="text-[#747A72] mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search by name or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
              />
            </div>
          </div>

          {/* Staff Cards List: 2 per row on desktop, 1 on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {sortedStaff.length === 0 ? (
              <div className="col-span-full p-12 text-center bg-[#FFFFFF] rounded-3xl border border-[#E0E4DD] text-[#747A72]">
                <Users size={36} className="mx-auto mb-2 opacity-30 text-[#6F776D]" />
                <p className="font-semibold text-sm text-[#2F352F]">No staff added yet.</p>
                <p className="text-xs text-[#747A72] mt-1">
                  Click &quot;Register Staff&quot; above to add your salon team members.
                </p>
              </div>
            ) : (
              sortedStaff.map((stf) => {
                if (!stf.id) return null;
                const todayRev = staffTodayRevMap[stf.id] || 0;
                const todaySrv = staffTodaySrvMap[stf.id] || 0;
                const monthRev = staffMonthRevMap[stf.id] || 0;
                const monthSrv = staffMonthSrvMap[stf.id] || 0;

                const att = stf.id ? todayAttendanceMap[stf.id] : undefined;
                const normStatus = normalizeAttendanceStatus(att?.status);

                const isManager = normalizeStaffRole(stf.role) === "MANAGER";

                return (
                  <div
                    key={stf.id}
                    onClick={() => setSelectedStaffForProfile(stf)}
                    className={`rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs flex flex-col justify-between transition hover:border-[#CCD2C8] hover:shadow-md cursor-pointer group ${
                      isManager ? "gap-3" : "gap-4"
                    }`}
                  >
                    {/* Top: Staff Info & Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`grid size-11 place-items-center rounded-2xl ${
                            isManager ? "bg-[#2F352F] text-white" : "bg-[#E8ECE5] text-[#2F352F]"
                          } font-serif font-bold text-base border border-[#CCD2C8] shrink-0 group-hover:bg-[#6F776D] group-hover:text-white transition`}
                        >
                          {stf.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-serif font-bold text-base text-[#2F352F] group-hover:text-[#6F776D] transition truncate">
                            {stf.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-xs text-[#747A72] mt-0.5">
                            <span
                              className={`font-semibold ${
                                stf.status === "Active" ? "text-[#5F7A62]" : "text-[#B55B5B]"
                              }`}
                            >
                              {stf.status}
                            </span>
                            <span>·</span>
                            <span
                              className={`font-semibold ${
                                isManager
                                  ? "text-[#2F352F] font-bold"
                                  : "text-[#747A72]"
                              }`}
                            >
                              {formatStaffRole(stf.role)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Today's Attendance Badge */}
                      <div className="shrink-0">
                        {normStatus === "PRESENT" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CCD2C8] bg-[#E8ECE5] px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#2F352F]">
                            <span className="size-1.5 rounded-full bg-[#5F7A62]" />
                            PRESENT
                          </span>
                        ) : normStatus === "ABSENT" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F8D7D7] bg-[#FBEBEB] px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#B55B5B]">
                            <span className="size-1.5 rounded-full bg-[#B55B5B]" />
                            ABSENT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E0E4DD] bg-[#F7F7F4] px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#747A72]">
                            <span className="size-1.5 rounded-full bg-[#CCD2C8]" />
                            NOT MARKED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Service Performance Breakdown (Stylists only) */}
                    {!isManager && (
                      <div className="pt-3 border-t border-[#E0E4DD] space-y-3">
                        <span className="font-bold block text-[10px] text-[#747A72] uppercase tracking-wider">
                          Service Performance (Salary-Based)
                        </span>

                        {/* Today's Performance */}
                        <div>
                          <span className="block text-[10px] font-bold text-[#2F352F] uppercase tracking-wider mb-1.5">
                            Today
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#F7F7F4] rounded-xl p-2.5 border border-[#E0E4DD]/80">
                              <span className="block text-[9px] uppercase font-bold text-[#747A72]">
                                Services Today
                              </span>
                              <span className="text-sm font-bold text-[#2F352F] mt-0.5 block">
                                {todaySrv}
                              </span>
                            </div>
                            <div className="bg-[#F7F7F4] rounded-xl p-2.5 border border-[#E0E4DD]/80">
                              <span className="block text-[9px] uppercase font-bold text-[#747A72]">
                                Revenue Today
                              </span>
                              <span className="text-sm font-bold text-[#5F7A62] mt-0.5 block">
                                {formatCurrency(todayRev)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Monthly Performance */}
                        <div>
                          <span className="block text-[10px] font-bold text-[#2F352F] uppercase tracking-wider mb-1.5">
                            Monthly ({currentBm.label})
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#F7F7F4] rounded-xl p-2.5 border border-[#E0E4DD]/80">
                              <span className="block text-[9px] uppercase font-bold text-[#747A72]">
                                Services (Month)
                              </span>
                              <span className="text-sm font-bold text-[#2F352F] mt-0.5 block">
                                {monthSrv}
                              </span>
                            </div>
                            <div className="bg-[#F7F7F4] rounded-xl p-2.5 border border-[#E0E4DD]/80">
                              <span className="block text-[9px] uppercase font-bold text-[#747A72]">
                                Revenue (Month)
                              </span>
                              <span className="text-sm font-bold text-[#5F7A62] mt-0.5 block">
                                {formatCurrency(monthRev)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bottom: Action Buttons */}
                    <div
                      className={`flex items-center justify-end gap-2 ${
                        isManager ? "pt-2 border-t border-[#E0E4DD]" : "pt-3 border-t border-[#E0E4DD]"
                      }`}
                    >
                      <button
                        onClick={(e) => handleOpenEdit(stf, e)}
                        className="grid size-8 place-items-center rounded-xl bg-[#FFFFFF] border border-[#E0E4DD] text-[#747A72] hover:text-[#2F352F] hover:bg-[#E8ECE5] hover:border-[#6F776D] transition cursor-pointer shadow-2xs"
                        title="Edit Profile"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={(e) => stf.id && handleDeleteTrigger(stf.id, e)}
                        className="grid size-8 place-items-center rounded-xl bg-[#FFFFFF] border border-[#E0E4DD] text-[#B55B5B] hover:bg-[#FBEBEB] hover:border-[#FBEBEB] transition cursor-pointer shadow-2xs"
                        title="Remove Staff"
                      >
                        <Trash2 size={13} />
                      </button>
                      <div className="grid size-8 place-items-center rounded-xl bg-[#F7F7F4] text-[#747A72] group-hover:text-[#2F352F] group-hover:bg-[#E8ECE5] transition">
                        <ChevronRight size={15} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Staff Profile Modal */}
      {selectedStaffForProfile && (
        <StaffProfileModal
          staff={selectedStaffForProfile}
          isOpen={!!selectedStaffForProfile}
          onClose={() => setSelectedStaffForProfile(null)}
          onViewFullAttendance={handleViewFullAttendanceForStaff}
          todayServicesCount={
            selectedStaffForProfile.id ? staffTodaySrvMap[selectedStaffForProfile.id] || 0 : 0
          }
          todayServiceRevenue={
            selectedStaffForProfile.id ? staffTodayRevMap[selectedStaffForProfile.id] || 0 : 0
          }
          monthServicesCount={
            selectedStaffForProfile.id ? staffMonthSrvMap[selectedStaffForProfile.id] || 0 : 0
          }
          monthServiceRevenue={
            selectedStaffForProfile.id ? staffMonthRevMap[selectedStaffForProfile.id] || 0 : 0
          }
        />
      )}

      {/* Add / Edit Specialist Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] overflow-y-auto max-h-[90vh] z-10 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">
              {editingStaff ? "Edit Staff" : "Register Staff"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Staff Name *</span>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                  placeholder="e.g. Aarav Kapoor"
                />
              </label>

              {/* Role */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Role *</span>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] font-medium outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                >
                  <option value="STYLIST">Stylist</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </label>

              {/* Base Salary */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Base Salary / Mo (₹)</span>
                <input
                  type="number"
                  min="0"
                  value={formData.salary === 0 ? "" : formData.salary}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      salary: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                  placeholder="0"
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                />
              </label>

              {/* Employment Status */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Employment Status</span>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                >
                  <option value="Active">Active Duty</option>
                  <option value="Inactive">On Leave / Inactive</option>
                </select>
              </label>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-[#E0E4DD] px-4 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 py-2 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
                >
                  {editingStaff ? "Save Profile" : "Register Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs"
            onClick={() => setDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200">
            <h3 className="font-serif text-base font-bold text-[#2F352F] mb-2">Remove Staff</h3>
            <p className="text-xs text-[#747A72] mb-5">
              Are you sure you want to remove this staff profile from the salon directory?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-xl border border-[#E0E4DD] px-3.5 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="rounded-xl bg-[#B55B5B] hover:bg-[#9E4747] px-3.5 py-2 text-xs font-bold text-white transition duration-150 cursor-pointer shadow-xs"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Transfer Confirmation Modal */}
      {managerConfirmModal?.open && managerConfirmModal.currentManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs"
            onClick={() => setManagerConfirmModal(null)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#2F352F]">
                  Change Manager Assignment
                </h3>
                <p className="text-[11px] text-[#747A72]">
                  Only one manager can be assigned at a time.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 text-xs text-[#2F352F] space-y-2.5 my-4">
              <p className="font-medium">
                Another manager is currently assigned ({managerConfirmModal.currentManager.name}).
              </p>
              <p>
                Do you want to make <strong>{managerConfirmModal.targetStaffName}</strong> the manager?
              </p>
              <p className="text-[11px] text-[#747A72]">
                The current manager ({managerConfirmModal.currentManager.name}) will be changed to Stylist.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManagerConfirmModal(null)}
                className="rounded-xl border border-[#E0E4DD] px-4 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  executeSave(
                    managerConfirmModal.pendingPayload,
                    managerConfirmModal.targetId,
                    managerConfirmModal.currentManager?.id
                  )
                }
                className="rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 py-2 text-xs font-bold text-white transition duration-150 cursor-pointer shadow-xs"
              >
                Confirm &amp; Reassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}