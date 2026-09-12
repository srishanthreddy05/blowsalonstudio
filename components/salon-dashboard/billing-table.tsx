"use client";

import { Plus, Trash2, X, CheckCircle2, Layers } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { ServiceRow } from "./types";
import { formatCurrency } from "./types";
import { ClearableNumberInput } from "../ui/ClearableNumberInput";

export interface ServiceOptionVariant {
  name: string;
  price: number;
  priceLabel?: string;
  priceUnit?: string;
}

export interface ServiceOptionItem {
  id?: string;
  name: string;
  price: number;
  category?: string;
  gender?: string;
  startingPrice?: number;
  priceLabel?: string;
  priceUnit?: string;
  variants?: ServiceOptionVariant[];
  isPackage?: boolean;
}

interface BillingTableProps {
  rows: ServiceRow[];
  onRowsChange: (rows: ServiceRow[]) => void;
  serviceOptions?: ServiceOptionItem[];
  staffOptions?: string[];
  disabled?: boolean;
}

export function BillingTable({
  rows,
  onRowsChange,
  serviceOptions = [],
  staffOptions = [],
  disabled = false,
}: BillingTableProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedCat, setSelectedCat] = useState("All");
  const [selectedGenderFilter, setSelectedGenderFilter] = useState<"all" | "men" | "women" | "both">("all");
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset search and categories when modal opens or closes
  useEffect(() => {
    if (!showModal) {
      setSearchQuery("");
      setSelectedCat("All");
      setSelectedGenderFilter("all");
    }
  }, [showModal]);

  const updateRow = (id: number, patch: Partial<ServiceRow>) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const getServiceCount = (serviceName: string, variantName?: string) => {
    return rows.filter((r) => {
      if (variantName) {
        return (
          r.service === `${serviceName} (${variantName})` ||
          (r.service === serviceName && r.selectedVariant === variantName)
        );
      }
      return r.service === serviceName || r.service.startsWith(`${serviceName} (`);
    }).length;
  };

  const selectServiceDirect = (svc: ServiceOptionItem, variant?: ServiceOptionVariant) => {
    const firstStaff = staffOptions[0] || "";
    const displayName = variant ? `${svc.name} (${variant.name})` : svc.name;
    const finalPrice = variant ? variant.price : svc.price;

    onRowsChange([
      ...rows,
      {
        id: Date.now() + Math.random(),
        serviceId: svc.id,
        service: displayName,
        category: svc.category || (svc.isPackage ? "Packages" : undefined),
        selectedVariant: variant ? variant.name : undefined,
        priceLabel: variant?.priceLabel || svc.priceLabel,
        priceUnit: variant?.priceUnit || svc.priceUnit,
        staff: firstStaff,
        price: finalPrice,
        quantity: 1,
        discount: 0,
      },
    ]);
  };

  // Derive categories available for currently selected gender
  const availableCategories = useMemo(() => {
    const rawCategories = Array.from(
      new Set(
        serviceOptions
          .filter((s) => {
            if (selectedGenderFilter === "all") return true;
            if (selectedGenderFilter === "both") return s.gender === "both";
            return s.gender === selectedGenderFilter || s.gender === "both";
          })
          .map((s) => s.category || "General")
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["All", ...rawCategories];
  }, [serviceOptions, selectedGenderFilter]);

  // If active category is filtered out by gender change, revert to "All"
  useEffect(() => {
    if (selectedCat !== "All" && !availableCategories.includes(selectedCat)) {
      setSelectedCat("All");
    }
  }, [availableCategories, selectedCat]);

  // Filtered services based on gender, category, and search query
  const filteredServices = useMemo(() => {
    return serviceOptions.filter((s) => {
      // Category filter
      const matchesCategory =
        selectedCat === "All" || (s.category || "General").toLowerCase() === selectedCat.toLowerCase();

      // Gender filter
      let matchesGender = true;
      if (selectedGenderFilter !== "all") {
        if (selectedGenderFilter === "both") {
          matchesGender = s.gender === "both";
        } else {
          matchesGender = s.gender === selectedGenderFilter || s.gender === "both";
        }
      }

      // Search filter
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q) ||
        (s.variants && s.variants.some((v) => v.name.toLowerCase().includes(q)));

      return matchesCategory && matchesGender && matchesSearch;
    });
  }, [serviceOptions, selectedCat, selectedGenderFilter, searchQuery]);

  // Group services by category for display
  const serviceGroups = useMemo(() => {
    const groups: Record<string, ServiceOptionItem[]> = {};
    filteredServices.forEach((s) => {
      const cat = s.category || "General";
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(s);
    });

    const sortedCategories = Object.keys(groups).sort((a, b) => a.localeCompare(b));
    sortedCategories.forEach((cat) => {
      groups[cat].sort((a, b) => a.name.localeCompare(b.name));
    });

    return { groups, sortedCategories };
  }, [filteredServices]);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#292D29]">Services & Packages</h2>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowModal(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] px-3.5 text-xs font-bold text-[#2F352F] transition hover:bg-[#6F776D] hover:text-[#FFFFFF] hover:border-[#6F776D] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <Plus size={15} />
          Add Service
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF]">
        <table className="w-full min-w-[600px] table-fixed border-collapse text-left text-sm text-[#292D29]">
          <thead className="bg-[#F7F7F4] text-[11px] uppercase tracking-[0.18em] text-[#747A72] border-b border-[#E0E4DD]">
            <tr>
              <th className="px-3 py-3 font-bold">Service / Package</th>
              <th className="px-2 py-3 font-bold w-[160px]">Staff</th>
              <th className="px-2 py-3 font-bold w-[100px]">Price</th>
              <th className="px-2 py-3 font-bold w-[100px]">Discount</th>
              <th className="px-2 py-3 font-bold w-[100px]">Amount</th>
              <th className="px-2 py-3 font-bold w-[50px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E0E4DD]">
            {rows.map((row) => {
              const matchedOption = serviceOptions.find(
                (s) =>
                  (row.serviceId && s.id === row.serviceId) ||
                  s.name === row.service ||
                  row.service.startsWith(`${s.name} (`)
              );
              const categoryName =
                row.category ||
                matchedOption?.category ||
                (matchedOption?.isPackage ? "Packages" : undefined);

              return (
                <tr key={row.id} className="bg-transparent transition hover:bg-[#F7F7F4]">
                  <td className="px-3 py-2 font-bold text-[#292D29] text-xs" title={row.service}>
                    <div className="flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{row.service}</span>
                        {row.selectedVariant && (
                          <span className="shrink-0 inline-block rounded-md bg-[#E8ECE5] text-[#2F352F] px-1.5 py-0.2 text-[9px] font-bold">
                            {row.selectedVariant}
                          </span>
                        )}
                      </div>
                      {categoryName && (
                        <span className="text-[11px] font-normal text-[#747A72] leading-tight truncate">
                          {categoryName}
                        </span>
                      )}
                    </div>
                  </td>
                <td className="px-2 py-2 w-[160px]">
                  <select
                    value={row.staff}
                    disabled={disabled || row.isCreditSettle}
                    onChange={(event) => updateRow(row.id, { staff: event.target.value })}
                    className="h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2.5 text-[#292D29] outline-none transition focus:border-[#6F776D] disabled:bg-[#F7F7F4] disabled:text-[#747A72] text-xs font-semibold cursor-pointer appearance-none"
                  >
                    {staffOptions.length === 0 && !row.isCreditSettle && <option value="">No Options</option>}
                    {(row.isCreditSettle || row.staff === "System") && (
                      <option value="System" className="bg-[#FFFFFF] text-[#292D29]">
                        System
                      </option>
                    )}
                    {row.isCreditSettle && row.staff && row.staff !== "System" && !staffOptions.includes(row.staff) && (
                      <option value={row.staff} className="bg-[#FFFFFF] text-[#292D29]">
                        {row.staff}
                      </option>
                    )}
                    {staffOptions.map((option) => (
                      <option key={option} value={option} className="bg-[#FFFFFF] text-[#292D29]">
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 w-[100px]">
                  <div className="h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 flex items-center transition focus-within:border-[#6F776D]">
                    <ClearableNumberInput
                      min="0"
                      disabled={disabled || row.isCreditSettle}
                      value={row.price}
                      onChange={(val) => updateRow(row.id, { price: val })}
                      className="text-[#292D29] text-xs font-semibold disabled:text-[#747A72]"
                    />
                  </div>
                </td>
                <td className="px-2 py-2 w-[100px]">
                  <div className="h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 flex items-center transition focus-within:border-[#6F776D]">
                    <ClearableNumberInput
                      min="0"
                      disabled={disabled || row.isCreditSettle}
                      value={row.discount}
                      onChange={(val) => updateRow(row.id, { discount: val })}
                      className="text-[#292D29] text-xs font-semibold disabled:text-[#747A72]"
                    />
                  </div>
                </td>
                <td className="px-2 py-2 font-bold text-[#292D29] text-xs w-[100px]">
                  {formatCurrency(Math.max((Number(row.price) || 0) - (Number(row.discount) || 0), 0))}
                </td>
                <td className="px-2 py-2 text-right w-[50px]">
                  <button
                    aria-label="Delete row"
                    type="button"
                    disabled={disabled}
                    onClick={() => onRowsChange(rows.filter((item) => item.id !== row.id))}
                    className="grid size-8 place-items-center rounded-lg border border-[#FBEBEB] text-[#B55B5B] bg-[#FBEBEB] transition hover:bg-[#B55B5B] hover:text-[#FFFFFF] disabled:opacity-50 disabled:pointer-events-none mx-auto cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Select Service Modal Overlay */}
      {showModal && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
          <div className="fixed inset-0 bg-[#292D29]/50 backdrop-blur-xs" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-4xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xl text-[#292D29] flex flex-col max-h-[92vh] z-10 overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Top Fixed Controls Area */}
            <div className="p-5 pb-4 border-b border-[#E0E4DD] bg-[#FFFFFF] shrink-0 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#2F352F]">
                    Select Service or Package
                  </h2>
                  <p className="text-[11px] text-[#747A72]">
                    Choose from the salon menu to add to this invoice
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-2 text-[#747A72] hover:text-[#2F352F] hover:border-[#6F776D] hover:bg-[#E8ECE5] transition cursor-pointer shadow-xs"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 1. Search Bar */}
              <div className="flex items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3.5 h-10 shadow-xs focus-within:border-[#6F776D] focus-within:bg-[#FFFFFF] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
                <input
                  type="text"
                  placeholder="Search services, variants, or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-[#747A72] hover:text-[#2F352F] cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* 2. Gender Filters */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] mr-1">
                  Gender:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedGenderFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                    selectedGenderFilter === "all"
                      ? "bg-[#6F776D] text-white"
                      : "bg-[#F7F7F4] border border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F]"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGenderFilter("men")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                    selectedGenderFilter === "men"
                      ? "bg-[#6F776D] text-white"
                      : "bg-[#F7F7F4] border border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F]"
                  }`}
                >
                  👨 Men
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGenderFilter("women")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                    selectedGenderFilter === "women"
                      ? "bg-[#6F776D] text-white"
                      : "bg-[#F7F7F4] border border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F]"
                  }`}
                >
                  👩 Women
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGenderFilter("both")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                    selectedGenderFilter === "both"
                      ? "bg-[#6F776D] text-white"
                      : "bg-[#F7F7F4] border border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F]"
                  }`}
                >
                  ✨ Unisex
                </button>
              </div>

              {/* 3. Service Categories - Naturally wrapped multi-row layout without scrollbar */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72]">
                    Service Categories ({availableCategories.length - 1} categories)
                  </span>
                  {selectedCat !== "All" && (
                    <button
                      type="button"
                      onClick={() => setSelectedCat("All")}
                      className="text-[10px] font-bold text-[#6F776D] hover:underline cursor-pointer"
                    >
                      Show All Categories
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {availableCategories.map((cat) => {
                    const isAll = cat === "All";
                    const isSelected = selectedCat.toLowerCase() === cat.toLowerCase();
                    
                    const catServiceCount = isAll
                      ? filteredServices.length
                      : serviceOptions.filter((s) => {
                          const matchesCat = (s.category || "General").toLowerCase() === cat.toLowerCase();
                          if (!matchesCat) return false;
                          if (selectedGenderFilter === "all") return true;
                          if (selectedGenderFilter === "both") return s.gender === "both";
                          return s.gender === selectedGenderFilter || s.gender === "both";
                        }).length;

                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCat(cat)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition duration-150 cursor-pointer shadow-2xs ${
                          isSelected
                            ? "bg-[#2F352F] text-[#FFFFFF] ring-2 ring-[#2F352F] ring-offset-1"
                            : "bg-[#F7F7F4] border border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5]"
                        }`}
                      >
                        <span>{isAll ? "All Categories" : cat}</span>
                        <span
                          className={`rounded-md px-1.5 py-0.2 text-[10px] font-extrabold ${
                            isSelected ? "bg-white/20 text-white" : "bg-[#E0E4DD] text-[#2F352F]"
                          }`}
                        >
                          {catServiceCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Middle Services Content Area (Scrolls cleanly if height exceeds modal) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin bg-[#FAFAFA]">
              {serviceGroups.sortedCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm font-semibold text-[#747A72]">
                    No services found matching the criteria.
                  </p>
                  <p className="mt-1 text-xs text-[#747A72]">
                    Try changing your category, gender filter, or search query.
                  </p>
                </div>
              ) : (
                serviceGroups.sortedCategories.map((catName) => {
                  const catServices = serviceGroups.groups[catName] || [];

                  return (
                    <div key={catName} className="space-y-3">
                      {/* Category Header */}
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#6F776D]">
                          {catName}
                        </h3>
                        <span className="rounded-full bg-[#E8ECE5] border border-[#CCD2C8] px-2.5 py-0.5 text-[10px] text-[#2F352F] font-bold">
                          {catServices.length} {catServices.length === 1 ? "service" : "services"}
                        </span>
                        <div className="h-px flex-1 bg-[#E0E4DD]" />
                      </div>

                      {/* Services Grid */}
                      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                        {catServices.map((svc) => {
                          const hasVariants = svc.variants && svc.variants.length > 0;
                          const count = getServiceCount(svc.name);

                          if (hasVariants) {
                            return (
                              <div
                                key={svc.name}
                                className={`rounded-2xl border p-3.5 transition duration-150 flex flex-col justify-between ${
                                  count > 0
                                    ? "border-[#6F776D] bg-[#E8ECE5]/50 shadow-xs"
                                    : "border-[#E0E4DD] bg-[#FFFFFF] hover:border-[#6F776D]/60"
                                }`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-1.5 mb-1">
                                    <h4 className="text-xs font-bold text-[#2F352F] leading-snug" title={svc.name}>
                                      {svc.name}
                                    </h4>
                                    {count > 0 && (
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-[#6F776D] text-white px-2 py-0.5 text-[9px] font-bold shrink-0">
                                        ✓ {count}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-semibold text-[#747A72]">
                                    Base: {formatCurrency(svc.price)} {svc.priceLabel && <span>({svc.priceLabel})</span>}
                                  </p>
                                </div>

                                {/* Selectable Variants List */}
                                <div className="mt-3 pt-2.5 border-t border-[#E0E4DD]/80 space-y-1.5">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#747A72]">
                                    Select Pricing Variant:
                                  </span>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {svc.variants?.map((v) => {
                                      const variantCount = getServiceCount(svc.name, v.name);
                                      return (
                                        <button
                                          key={v.name}
                                          type="button"
                                          onClick={() => selectServiceDirect(svc, v)}
                                          className={`rounded-xl border p-2 text-left transition cursor-pointer flex flex-col justify-between ${
                                            variantCount > 0
                                              ? "border-[#6F776D] bg-[#6F776D] text-white shadow-2xs"
                                              : "border-[#E0E4DD] bg-[#F7F7F4] text-[#2F352F] hover:border-[#6F776D] hover:bg-[#E8ECE5]"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="text-[10px] font-bold truncate">{v.name}</span>
                                            {variantCount > 0 && (
                                              <span className="text-[9px] font-extrabold text-white">✓{variantCount}</span>
                                            )}
                                          </div>
                                          <span
                                            className={`text-[11px] font-bold mt-1 ${
                                              variantCount > 0 ? "text-white" : "text-[#6F776D]"
                                            }`}
                                          >
                                            {formatCurrency(v.price)}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={svc.name}
                              onClick={() => selectServiceDirect(svc)}
                              className={`relative cursor-pointer rounded-2xl border p-3.5 transition duration-150 select-none flex flex-col justify-between ${
                                count > 0
                                  ? "border-[#6F776D] bg-[#E8ECE5]/60 shadow-xs"
                                  : "border-[#E0E4DD] bg-[#FFFFFF] hover:-translate-y-0.5 hover:border-[#6F776D] hover:bg-[#E8ECE5]/40 hover:shadow-xs"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <h4 className="text-xs font-bold text-[#2F352F] leading-snug" title={svc.name}>
                                  {svc.name}
                                </h4>
                                {count > 0 && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#6F776D] text-white px-2 py-0.5 text-[9px] font-bold shrink-0">
                                    ✓ {count}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2.5 flex items-baseline gap-1.5">
                                <span className="text-sm font-bold text-[#6F776D]">{formatCurrency(svc.price)}</span>
                                {svc.priceLabel && (
                                  <span className="text-[10px] font-semibold text-[#747A72]">{svc.priceLabel}</span>
                                )}
                                {svc.priceUnit && (
                                  <span className="text-[10px] font-semibold text-[#747A72]">{svc.priceUnit}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Fixed Footer Area */}
            <div className="p-4 px-6 border-t border-[#E0E4DD] bg-[#FFFFFF] shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#2F352F]">
                  {rows.length} {rows.length === 1 ? "service" : "services"} in bill
                </span>
                {rows.length > 0 && (
                  <span className="rounded-full bg-[#E8ECE5] px-2 py-0.5 text-[10px] font-bold text-[#6F776D]">
                    Total: {formatCurrency(rows.reduce((sum, r) => sum + (Number(r.price) || 0), 0))}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl bg-[#6F776D] hover:bg-[#2F352F] text-white px-7 py-2.5 text-xs font-bold transition duration-150 shadow-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}