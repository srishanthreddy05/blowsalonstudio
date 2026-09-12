"use client";

import { useState } from "react";
import * as packagesService from "@/services/packages";
import { useAppData } from "@/context/AppDataContext";
import type { Package } from "@/types/package";
import { Plus, Search, Edit2, Trash2, X, Sparkles, Check, Gift } from "lucide-react";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { toast } from "react-hot-toast";

export default function PackagesPage() {
  const { packages, refreshPackages, loadingAppData } = useAppData();
  const loading = loadingAppData;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGender, setSelectedGender] = useState<"all" | "men" | "women" | "both">("all");

  // Package Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    gender: "both" as "men" | "women" | "both",
    includesText: "",
    isActive: true,
  });

  // Delete Confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingPackage(null);
    setFormData({
      name: "",
      price: 0,
      gender: "both",
      includesText: "",
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setFormData({
      name: pkg.name,
      price: pkg.price,
      gender: pkg.gender || "both",
      includesText: (pkg.includes || []).join("\n"),
      isActive: pkg.isActive !== false,
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
      await packagesService.delete(idToDelete);
      setDeleteConfirmOpen(false);
      setIdToDelete(null);
      await refreshPackages();
      toast.success("Package deleted successfully!");
    } catch (error) {
      console.error("Failed to delete package:", error);
      toast.error("Failed to delete package.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Please enter a package name.");
      return;
    }

    const includes = formData.includesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Partial<Package> = {
      businessId: "blow-salon",
      name: formData.name.trim(),
      price: Number(formData.price) || 0,
      gender: formData.gender,
      includes,
      isActive: formData.isActive,
    };

    try {
      if (editingPackage?.id) {
        await packagesService.update(editingPackage.id, payload as any);
        toast.success("Package updated successfully!");
      } else {
        await packagesService.create(payload as any);
        toast.success("Package created successfully!");
      }
      setModalOpen(false);
      await refreshPackages();
    } catch (error) {
      console.error("Failed to save package:", error);
      toast.error("Failed to save package.");
    }
  };

  const filteredPackages = packages.filter((p) => {
    if (selectedGender !== "all") {
      if (selectedGender === "both") {
        if (p.gender !== "both") return false;
      } else {
        if (p.gender !== selectedGender && p.gender !== "both") return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchIncludes = p.includes?.some((inc) => inc.toLowerCase().includes(q));
      return matchName || matchIncludes;
    }

    return true;
  });

  return (
    <div className="w-full text-[#292D29]">
      {/* Top Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Blow Salon Bundles
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Packages
          </h1>
        </div>
        {!loading && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Add Package
          </button>
        )}
      </div>

      {/* Gender Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => setSelectedGender("all")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs cursor-pointer ${
            selectedGender === "all"
              ? "bg-[#6F776D] text-white"
              : "bg-[#FFFFFF] text-[#747A72] border border-[#E0E4DD] hover:border-[#6F776D] hover:text-[#2F352F]"
          }`}
        >
          <span>All Packages</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selectedGender === "all" ? "bg-white/20 text-white" : "bg-[#F7F7F4] text-[#2F352F]"}`}>
            {packages.length}
          </span>
        </button>

        <button
          onClick={() => setSelectedGender("women")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs cursor-pointer ${
            selectedGender === "women"
              ? "bg-[#6F776D] text-white"
              : "bg-[#FFFFFF] text-[#747A72] border border-[#E0E4DD] hover:border-[#6F776D] hover:text-[#2F352F]"
          }`}
        >
          <span>👩 Pre-Bridal (Women)</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selectedGender === "women" ? "bg-white/20 text-white" : "bg-[#F7F7F4] text-[#2F352F]"}`}>
            {packages.filter((p) => p.gender === "women").length}
          </span>
        </button>

        <button
          onClick={() => setSelectedGender("men")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs cursor-pointer ${
            selectedGender === "men"
              ? "bg-[#6F776D] text-white"
              : "bg-[#FFFFFF] text-[#747A72] border border-[#E0E4DD] hover:border-[#6F776D] hover:text-[#2F352F]"
          }`}
        >
          <span>👨 Pre Bride-Groom (Men)</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selectedGender === "men" ? "bg-white/20 text-white" : "bg-[#F7F7F4] text-[#2F352F]"}`}>
            {packages.filter((p) => p.gender === "men").length}
          </span>
        </button>
      </div>

      {/* Search bar */}
      <div className="mb-6 flex max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
        <Search size={16} className="text-[#747A72] mr-2" />
        <input
          type="text"
          placeholder="Search packages or inclusions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-[#747A72] hover:text-[#2F352F]"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-4">
            <Gift size={28} />
          </div>
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">No packages found.</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            Create wedding or combo packages to bundle services for your clients.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredPackages.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs flex flex-col justify-between hover:border-[#6F776D] transition"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border mb-2 ${
                      pkg.gender === "women"
                        ? "bg-[#FDF2F8] text-[#B83280] border-[#B83280]/20"
                        : pkg.gender === "men"
                        ? "bg-[#EBF3FC] text-[#2B6CB0] border-[#2B6CB0]/20"
                        : "bg-[#F0FDF4] text-[#276749] border-[#276749]/20"
                    }`}>
                      {pkg.gender === "women" ? "Women / Bride" : pkg.gender === "men" ? "Men / Groom" : "Unisex"}
                    </span>
                    <h3 className="text-lg font-serif font-bold text-[#2F352F]">{pkg.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-[#2F352F] font-serif">{formatCurrency(pkg.price)}</span>
                    <p className="text-[10px] font-semibold text-[#747A72]">Full Bundle</p>
                  </div>
                </div>

                {/* Inclusions */}
                <div className="mt-4 pt-4 border-t border-[#E0E4DD]">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#747A72] mb-2.5">
                    Includes ({pkg.includes?.length || 0} services):
                  </p>
                  <ul className="space-y-1.5">
                    {pkg.includes?.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-[#2F352F]">
                        <span className="grid size-4 place-items-center rounded-full bg-[#E8ECE5] text-[#2F352F] text-[9px] font-bold shrink-0 mt-0.5">
                          ✓
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E0E4DD] flex items-center justify-between">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  pkg.isActive !== false ? "bg-[#E8ECE5] text-[#2F352F]" : "bg-[#FBEBEB] text-[#B55B5B]"
                }`}>
                  {pkg.isActive !== false ? "Active" : "Inactive"}
                </span>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenEdit(pkg)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] px-3.5 py-1.5 text-xs font-bold text-[#2F352F] hover:bg-[#6F776D] hover:text-white transition cursor-pointer shadow-xs"
                  >
                    <Edit2 size={13} /> Edit
                  </button>
                  <button
                    onClick={() => pkg.id && handleDeleteTrigger(pkg.id)}
                    className="grid size-8 place-items-center rounded-xl bg-[#FFFFFF] border border-[#E0E4DD] text-[#B55B5B] hover:bg-[#FBEBEB] transition cursor-pointer shadow-xs"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PACKAGE ADD / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] animate-in zoom-in-95 duration-200 z-10">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">
              {editingPackage ? "Edit Package Details" : "Create New Package"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Package Name *</span>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  placeholder="e.g. Pre-Bridal Package Premium"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Package Price (INR) *</span>
                  <input
                    required
                    type="number"
                    min="0"
                    value={formData.price === 0 ? "" : formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] font-bold"
                    placeholder="10000"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Gender Target *</span>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] font-semibold"
                  >
                    <option value="women">Women / Bridal</option>
                    <option value="men">Men / Groom</option>
                    <option value="both">Both / Unisex</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Included Services (One per line) *
                </span>
                <textarea
                  rows={5}
                  required
                  value={formData.includesText}
                  onChange={(e) => setFormData({ ...formData, includesText: e.target.value })}
                  placeholder="Golden Facial&#10;Full Arms, Legs, Under Arms Waxing&#10;Detan Face & Neck&#10;Eyebrows & Upper Lip&#10;Manicure Premium&#10;Pedicure Premium&#10;Basic Hair Spa"
                  className="mt-1.5 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] font-mono leading-relaxed"
                />
              </label>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="size-4 rounded border-[#E0E4DD] accent-[#6F776D]"
                />
                <span className="text-xs font-semibold text-[#2F352F]">Active package</span>
              </label>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-[#6F776D] px-5 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition cursor-pointer shadow-xs"
                >
                  Save Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setDeleteConfirmOpen(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200">
            <h3 className="font-serif text-base font-bold text-[#2F352F]">Are you sure you want to delete this package?</h3>
            <p className="mt-1.5 text-xs text-[#747A72]">This action will mark the package as inactive.</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3.5 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="h-9 rounded-xl bg-[#B55B5B] hover:bg-[#9E4D4D] px-4 text-xs font-bold text-[#FFFFFF] shadow-xs transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
