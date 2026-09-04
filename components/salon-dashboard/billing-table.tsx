"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ServiceRow } from "./types";
import { formatCurrency } from "./types";
import { ClearableNumberInput } from "../ui/ClearableNumberInput";

interface BillingTableProps {
  rows: ServiceRow[];
  onRowsChange: (rows: ServiceRow[]) => void;
  serviceOptions?: { name: string; price: number; category?: string }[];
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
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset search when modal opens or closes
  useEffect(() => {
    if (!showModal) {
      setSearchQuery("");
      setSelectedCat("All");
    }
  }, [showModal]);

  const updateRow = (id: number, patch: Partial<ServiceRow>) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const getServiceCount = (serviceName: string) => {
    return rows.filter((r) => r.service === serviceName).length;
  };

  const selectService = (svc: { name: string; price: number }) => {
    const firstStaff = staffOptions[0] || "";
    onRowsChange([
      ...rows,
      {
        id: Date.now() + Math.random(),
        service: svc.name,
        staff: firstStaff,
        price: svc.price,
        quantity: 1,
        discount: 0,
      },
    ]);
  };

  const categories = ["All", ...Array.from(new Set(serviceOptions.map(s => s.category || "General")))];

  const filteredServices = serviceOptions.filter(s => {
    const matchesCategory = selectedCat === "All" || (s.category || "General") === selectedCat;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Group services by category
  const serviceGroups: Record<string, typeof serviceOptions> = {};
  filteredServices.forEach(s => {
    const cat = s.category || "General";
    if (!serviceGroups[cat]) {
      serviceGroups[cat] = [];
    }
    serviceGroups[cat].push(s);
  });

  const sortedCategories = Object.keys(serviceGroups).sort((a, b) => a.localeCompare(b));

  // Sort services alphabetically within each category group
  sortedCategories.forEach(cat => {
    serviceGroups[cat].sort((a, b) => a.name.localeCompare(b.name));
  });

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#292D29]">Services</h2>
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
              <th className="px-3 py-3 font-bold">Service</th>
              <th className="px-2 py-3 font-bold w-[160px]">Staff</th>
              <th className="px-2 py-3 font-bold w-[100px]">Price</th>
              <th className="px-2 py-3 font-bold w-[100px]">Discount</th>
              <th className="px-2 py-3 font-bold w-[100px]">Amount</th>
              <th className="px-2 py-3 font-bold w-[50px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E0E4DD]">
            {rows.map((row) => (
              <tr key={row.id} className="bg-transparent transition hover:bg-[#F7F7F4]">
                <td className="px-3 py-2 font-bold text-[#292D29] truncate text-xs" title={row.service}>
                  {row.service}
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Select Service Modal Overlay */}
      {showModal && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] flex flex-col max-h-[85vh]">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#292D29] transition"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-bold text-[#292D29] mb-4">Select Service Menu</h2>

            {/* Search Input */}
            <div className="mb-4 flex items-center rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 h-10 shadow-xs focus-within:border-[#6F776D] transition">
              <input
                type="text"
                placeholder="Search services by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-[#292D29] outline-none placeholder:text-[#747A72]"
              />
            </div>

            {/* Category Filter Chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCat(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${selectedCat === cat
                      ? "bg-[#6F776D] text-[#FFFFFF] border-[#6F776D]"
                      : "bg-[#F7F7F4] border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#292D29] hover:bg-[#E8ECE5]"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Service Cards Grouped Grid */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-5">
              {sortedCategories.length === 0 ? (
                <p className="text-sm text-[#747A72] italic text-center py-8">No services found matching the criteria.</p>
              ) : (
                sortedCategories.map(catName => (
                  <div key={catName} className="space-y-2.5">
                    {/* Category Divider */}
                    <div className="flex items-center gap-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6F776D]">
                        {catName}
                      </h4>
                      <div className="h-px flex-1 bg-[#E0E4DD]" />
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                      {serviceGroups[catName].map((svc) => {
                        const count = getServiceCount(svc.name);
                        return (
                          <div
                            key={svc.name}
                            onClick={() => selectService(svc)}
                            className={`relative cursor-pointer rounded-2xl border p-3.5 transition duration-150 select-none ${
                              count > 0
                                ? "border-[#6F776D] bg-[#E8ECE5] shadow-xs"
                                : "border-[#E0E4DD] bg-[#F7F7F4] hover:-translate-y-0.5 hover:border-[#6F776D] hover:bg-[#E8ECE5]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <h3 className="text-xs font-bold text-[#292D29] truncate" title={svc.name}>
                                {svc.name}
                              </h3>
                              {count > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#6F776D] text-white px-2 py-0.5 text-[10px] font-bold shrink-0">
                                  ✓ {count}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs font-bold text-[#6F776D]">{formatCurrency(svc.price)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer with Done Button */}
            <div className="mt-4 pt-3.5 border-t border-[#E0E4DD] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#747A72]">
                {rows.length} service{rows.length === 1 ? "" : "s"} in bill
              </span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl bg-[#6F776D] hover:bg-[#2F352F] text-white px-6 py-2 text-xs font-bold transition duration-150 shadow-xs cursor-pointer"
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