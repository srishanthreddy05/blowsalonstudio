"use client";

import { useEffect, useState, useMemo } from "react";
import * as staffService from "@/services/staff";
import type { Staff } from "@/types/staff";
import { Plus, Search, Edit2, Trash2, X, Users, DollarSign, Award, Clock } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { useAppData } from "@/context/AppDataContext";
import { formatCurrency } from "@/components/salon-dashboard/types";

export default function StaffPage() {
  const { staff, refreshStaff, loadingAppData } = useAppData();
  const loading = loadingAppData;
  const [searchQuery, setSearchQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    role: "Stylist",
    salary: 0,
    status: "Active",
    revenueMonthly: 0,
    servicesMonthly: 0,
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  const [staffRevenueMap, setStaffRevenueMap] = useState<Record<string, number>>({});
  const [staffServicesMap, setStaffServicesMap] = useState<Record<string, number>>({});

  const loadStaffProgress = async () => {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const invRef = collection(db, "invoices");
      const q = query(invRef, where("date", ">=", start), where("date", "<=", end));
      const snap = await getDocs(q);

      const revMap: Record<string, number> = {};
      const srvMap: Record<string, number> = {};

      staff.forEach((member) => {
        if (member.id) {
          revMap[member.id] = 0;
          srvMap[member.id] = 0;
        }
      });

      snap.forEach((d) => {
        const inv = d.data();
        (inv.services || []).forEach((s: any) => {
          if (s.serviceId === "membership_fee" || s.isSystemService === true) return;
          const staffId = s.staffId;
          const staffName = s.staffName || s.staff;
          const matched = staff.find((m) => (staffId && m.id === staffId) || (staffName && m.name === staffName));
          if (matched && matched.id) {
            const amount = s.amount !== undefined 
              ? Number(s.amount) || 0 
              : Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);
            revMap[matched.id] = (revMap[matched.id] || 0) + amount;
            srvMap[matched.id] = (srvMap[matched.id] || 0) + 1;
          }
        });
      });

      setStaffRevenueMap(revMap);
      setStaffServicesMap(srvMap);
    } catch (error) {
      console.error("Failed to load staff list progress from invoices, falling back to stats docs:", error);
      try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const monthKey = `${yyyy}-${mm}`;

        const revMap: Record<string, number> = {};
        const srvMap: Record<string, number> = {};

        await Promise.all(
          staff.map(async (member) => {
            if (!member.id) return;
            const ref = doc(db, "stats", `staff_${member.id}_${monthKey}`);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const data = snap.data();
              revMap[member.id] = data.revenue ?? 0;
              srvMap[member.id] = data.servicesCount ?? 0;
            } else {
              revMap[member.id] = 0;
              srvMap[member.id] = 0;
            }
          })
        );

        setStaffRevenueMap(revMap);
        setStaffServicesMap(srvMap);
      } catch (err) {
        console.error("Failed to load fallback stats:", err);
      }
    }
  };

  useEffect(() => {
    if (staff && staff.length > 0) {
      loadStaffProgress();
    }
  }, [staff]);

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setFormData({
      name: "",
      phone: "",
      role: "Stylist",
      salary: 0,
      status: "Active",
      revenueMonthly: 0,
      servicesMonthly: 0,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (stf: Staff) => {
    setEditingStaff(stf);
    setFormData({
      name: stf.name,
      phone: stf.phone || "",
      role: stf.role,
      salary: stf.salary || 0,
      status: stf.status,
      revenueMonthly: stf.targets?.revenueMonthly || 0,
      servicesMonthly: stf.targets?.servicesMonthly || 0,
    });
    setModalOpen(true);
  };

  const handleDeleteTrigger = (id: string) => {
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
      loadStaffProgress();
    } catch (error) {
      console.error("Failed to delete staff member:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Staff> = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      role: formData.role,
      salary: Number(formData.salary) || 0,
      status: formData.status,
      targets: {
        revenueMonthly: Number(formData.revenueMonthly) || 0,
        servicesMonthly: Number(formData.servicesMonthly) || 0,
      },
    };
    try {
      if (editingStaff?.id) {
        await staffService.update(editingStaff.id, payload);
      } else {
        await staffService.create(payload as any);
      }
      setModalOpen(false);
      await refreshStaff();
      loadStaffProgress();
    } catch (error) {
      console.error("Failed to save staff member:", error);
    }
  };

  const filteredStaff = staff.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedStaff = useMemo(() => {
    return [...filteredStaff].sort((a, b) => {
      const aIsActive = a.status === "Active";
      const bIsActive = b.status === "Active";
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredStaff]);

  return (
    <div className="w-full text-[#292D29] space-y-8">
      {/* Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Team & Specialists
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Salon Staff Directory ({staff.length})
          </h1>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
        >
          <Plus size={15} />
          Register Specialist
        </button>
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="flex max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
            <Search size={16} className="text-[#747A72] mr-2" />
            <input
              type="text"
              placeholder="Search by name or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
            />
          </div>

          {/* Staff Cards List */}
          <div className="grid gap-4">
            {sortedStaff.length === 0 ? (
              <div className="p-8 text-center bg-[#FFFFFF] rounded-2xl border border-[#E0E4DD] text-[#747A72]">
                <Users size={32} className="mx-auto mb-2 opacity-40 text-[#6F776D]" />
                <p className="font-semibold text-sm">No team members found</p>
                <p className="text-xs text-[#747A72] mt-1">
                  Enlist your salon specialists and stylists to assign services and monitor attendance.
                </p>
              </div>
            ) : sortedStaff.map((stf) => {
              const revenueMonthly = stf.targets?.revenueMonthly || 0;
              const servicesMonthly = stf.targets?.servicesMonthly || 0;
              const revenueAchieved = stf.id ? staffRevenueMap[stf.id] || 0 : 0;
              const servicesAchieved = stf.id ? staffServicesMap[stf.id] || 0 : 0;

              const revenuePercent = revenueMonthly > 0 ? Math.min(100, (revenueAchieved / revenueMonthly) * 100) : 0;
              const servicesPercent = servicesMonthly > 0 ? Math.min(100, (servicesAchieved / servicesMonthly) * 100) : 0;

              const hasRevenueTarget = revenueMonthly > 0;
              const hasServicesTarget = servicesMonthly > 0;

              return (
                <div
                  key={stf.id}
                  className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5 transition hover:border-[#CCD2C8]"
                >
                  {/* Left: Info */}
                  <div className="flex items-center gap-4 min-w-[260px]">
                    <div className="grid size-12 place-items-center rounded-2xl bg-[#E8ECE5] text-[#2F352F] font-serif font-bold text-lg border border-[#CCD2C8]">
                      {stf.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-serif font-bold text-base text-[#2F352F]">{stf.name}</h3>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                          stf.status === "Active"
                            ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                            : "bg-[#FBEBEB] text-[#B55B5B] border-[#FBEBEB]"
                        }`}>
                          {stf.status}
                        </span>
                        <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]">
                          {stf.role}
                        </span>
                      </div>
                      
                      <div className="text-xs text-[#747A72] flex flex-wrap items-center gap-3">
                        <div>
                          <span className="font-bold text-[10px] uppercase tracking-wider text-[#747A72]">Phone: </span>
                          <span className="text-[#292D29] font-medium">{stf.phone || "—"}</span>
                        </div>
                        <div>
                          <span className="font-bold text-[10px] uppercase tracking-wider text-[#747A72]">Base Salary: </span>
                          <span className="text-[#292D29] font-bold">{stf.salary ? formatCurrency(stf.salary) : "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Progress / Informational Metrics */}
                  <div className="flex-1 min-w-[280px] pt-4 md:pt-0 border-t md:border-t-0 border-[#E0E4DD]">
                    <span className="font-bold block text-[10px] text-[#747A72] uppercase tracking-wider mb-2">Monthly Performance (Analytical)</span>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#747A72]">
                          <span>Revenue Generated: {formatCurrency(revenueAchieved)} {hasRevenueTarget && `/ ${formatCurrency(revenueMonthly)}`}</span>
                          {hasRevenueTarget && <span className="font-bold text-[#5F7A62]">{Math.round(revenuePercent)}%</span>}
                        </div>
                        {hasRevenueTarget ? (
                          <div className="w-full h-1.5 rounded-full bg-[#F7F7F4] overflow-hidden border border-[#E0E4DD]">
                            <div
                              className="h-full rounded-full bg-[#6F776D]"
                              style={{ width: `${revenuePercent}%` }}
                            />
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#747A72] italic">No revenue target set</div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#747A72]">
                          <span>Services Completed: {servicesAchieved} {hasServicesTarget && `/ ${servicesMonthly}`}</span>
                          {hasServicesTarget && <span className="font-bold text-[#5F7A62]">{Math.round(servicesPercent)}%</span>}
                        </div>
                        {hasServicesTarget ? (
                          <div className="w-full h-1.5 rounded-full bg-[#F7F7F4] overflow-hidden border border-[#E0E4DD]">
                            <div
                              className="h-full rounded-full bg-[#6F776D]"
                              style={{ width: `${servicesPercent}%` }}
                            />
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#747A72] italic">No service target set</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 pt-4 md:pt-0 border-t md:border-t-0 border-[#E0E4DD] self-end md:self-auto min-w-[90px]">
                    <button
                      onClick={() => handleOpenEdit(stf)}
                      className="grid size-8 place-items-center rounded-xl bg-[#FFFFFF] border border-[#E0E4DD] text-[#747A72] hover:text-[#2F352F] hover:bg-[#E8ECE5] hover:border-[#6F776D] transition cursor-pointer shadow-xs"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => stf.id && handleDeleteTrigger(stf.id)}
                      className="grid size-8 place-items-center rounded-xl bg-[#FFFFFF] border border-[#E0E4DD] text-[#B55B5B] hover:bg-[#FBEBEB] hover:border-[#FBEBEB] transition cursor-pointer shadow-xs"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
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
              {editingStaff ? "Edit Specialist Profile" : "Register Team Specialist"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Staff Name *
                </span>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                  placeholder="e.g. Aarav Kapoor"
                />
              </label>

              {/* Phone */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Phone Number
                </span>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                  placeholder="+91 98765 43210"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                {/* Role */}
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">
                    Role / Position
                  </span>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value })
                    }
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  >
                    <option value="Stylist">Stylist</option>
                    <option value="Senior Stylist">Senior Stylist</option>
                    <option value="Colorist">Colorist</option>
                    <option value="Therapist">Therapist</option>
                    <option value="Manager">Manager</option>
                    <option value="Receptionist">Receptionist</option>
                  </select>
                </label>

                {/* Base Salary */}
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">
                    Base Salary / Mo (₹)
                  </span>
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
              </div>

              {/* Targets */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">
                    Revenue Target / Mo (₹)
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={formData.revenueMonthly === 0 ? "" : formData.revenueMonthly}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        revenueMonthly: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">
                    Services Target / Mo
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={formData.servicesMonthly === 0 ? "" : formData.servicesMonthly}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        servicesMonthly: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  />
                </label>
              </div>

              {/* Employment Status */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Employment Status
                </span>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
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
                  {editingStaff ? "Save Profile" : "Register Specialist"}
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
            <h3 className="font-serif text-base font-bold text-[#2F352F] mb-2">
              Remove Specialist
            </h3>
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
    </div>
  );
}