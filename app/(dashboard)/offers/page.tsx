"use client";

import { useState } from "react";
import * as offersService from "@/services/offers";
import { useAppData } from "@/context/AppDataContext";
import type { Offer } from "@/types/offer";
import { Plus, Search, Edit2, Trash2, X, Tag } from "lucide-react";
import { formatCurrency } from "@/components/salon-dashboard/types";

type OfferFormData = {
  code: string;
  name: string;
  discountType: string;
  discountValue: number;
  status: string;
  startDate: string;
  endDate: string;
  minBillAmount: number;
  applicableServiceIds: string[];
  customerType: "all" | "regular" | "membership";
};

const emptyForm: OfferFormData = {
  code: "",
  name: "",
  discountType: "percentage",
  discountValue: 10,
  status: "Active",
  startDate: "",
  endDate: "",
  minBillAmount: 0,
  applicableServiceIds: [],
  customerType: "all",
};

export default function OffersPage() {
  const { offers, services, refreshOffers, loadingAppData } = useAppData();
  const servicesList = services;
  const loading = loadingAppData;

  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [formData, setFormData] = useState<OfferFormData>(emptyForm);

  const handleOpenAdd = () => {
    setEditingOffer(null);
    setFormData(emptyForm);
    setModalOpen(true);
  };

  const handleOpenEdit = (o: Offer) => {
    setEditingOffer(o);
    setFormData({
      code: o.code,
      name: o.name,
      discountType: o.discountType || "percentage",
      discountValue: o.discountValue,
      status: o.status || "Active",
      startDate: o.startDate || "",
      endDate: o.endDate || "",
      minBillAmount: o.minBillAmount || 0,
      applicableServiceIds: o.applicableServiceIds || [],
      customerType: o.customerType || "all",
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this offer campaign?")) return;
    try {
      await offersService.delete(id);
      await refreshOffers();
    } catch (error) {
      console.error("Failed to delete offer:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Omit<Offer, "id"> = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue) || 0,
        status: formData.status,
        minBillAmount: Number(formData.minBillAmount) || 0,
        applicableServiceIds: formData.applicableServiceIds,
        customerType: formData.customerType,
      };
      if (formData.startDate) payload.startDate = formData.startDate;
      if (formData.endDate) payload.endDate = formData.endDate;

      if (editingOffer?.id) {
        await offersService.update(editingOffer.id, payload);
      } else {
        await offersService.create(payload);
      }
      setModalOpen(false);
      await refreshOffers();
    } catch (error) {
      console.error("Failed to save offer:", error);
    }
  };

  const toggleServiceId = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      applicableServiceIds: prev.applicableServiceIds.includes(id)
        ? prev.applicableServiceIds.filter((x) => x !== id)
        : [...prev.applicableServiceIds, id],
    }));
  };

  const filteredOffers = offers.filter(
    (o) =>
      o.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const describeOffer = (o: Offer) => {
    const parts: string[] = [];
    if (o.customerType && o.customerType !== "all") {
      parts.push(`Target: ${o.customerType === "membership" ? "Membership Only" : "Regular Only"}`);
    }
    if (o.startDate || o.endDate) {
      parts.push(`Valid ${o.startDate || "anytime"} → ${o.endDate || "no end"}`);
    }
    if (o.minBillAmount) {
      parts.push(`Min service amount ${formatCurrency(o.minBillAmount)}`);
    }
    const svcCount = o.applicableServiceIds?.length || 0;
    if (svcCount > 0) {
      parts.push(`Applies to ${svcCount} selected service${svcCount > 1 ? "s" : ""}`);
    } else {
      parts.push("Applies to all services");
    }
    return parts.join(" · ");
  };

  return (
    <div className="w-full text-[#292D29]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Promotions & Campaigns
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Service Offers & Discounts
          </h1>
        </div>
        {!loading && offers.length > 0 && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Add Offer
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : offers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-4">
            <Tag size={28} />
          </div>
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">No Offers Found</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            Publish service coupon discounts and promotions. (Offers apply exclusively to service sales; retail products are excluded).
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Add Offer
          </button>
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="mb-5 flex max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
            <Search size={16} className="text-[#747A72] mr-2" />
            <input
              type="text"
              placeholder="Search coupon codes or names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
            />
          </div>

          {/* List display */}
          <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs text-[#292D29]">
              <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Promo Code</th>
                  <th className="px-5 py-3.5 font-bold">Campaign Name</th>
                  <th className="px-5 py-3.5 font-bold">Discount</th>
                  <th className="px-5 py-3.5 font-bold">Rules</th>
                  <th className="px-5 py-3.5 font-bold">Status</th>
                  <th className="px-5 py-3.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD]">
                {filteredOffers.map((offer) => (
                  <tr key={offer.id} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                    <td className="px-5 py-3.5 font-bold text-[#2F352F] uppercase tracking-wider">{offer.code}</td>
                    <td className="px-5 py-3.5 font-semibold text-[#2F352F]">{offer.name}</td>
                    <td className="px-5 py-3.5 font-bold text-[#5F7A62]">
                      {offer.discountType === "percentage"
                        ? `${offer.discountValue}% Off Services`
                        : `${formatCurrency(offer.discountValue)} Off Services`}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[#747A72] max-w-[260px]">
                      {describeOffer(offer)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                          offer.status === "Active"
                            ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                            : "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                        }`}
                      >
                        {offer.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(offer)}
                          className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => offer.id && handleDelete(offer.id)}
                          className="grid size-8 place-items-center rounded-lg bg-[#FFFFFF] border border-[#E0E4DD] text-[#B55B5B] hover:bg-[#FBEBEB] hover:border-[#FBEBEB] transition cursor-pointer shadow-xs"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Overlay Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] max-h-[90vh] overflow-y-auto z-10 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">
              {editingOffer ? "Edit Offer Campaign" : "Launch Service Offer"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Coupon Code *</span>
                <input
                  required
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs font-bold text-[#2F352F] uppercase outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  placeholder="e.g. SUMMER20"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Campaign Name *</span>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  placeholder="e.g. 20% Summer Hair Styling discount"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Discount Type</span>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount (INR)</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">
                    {formData.discountType === "percentage" ? "Discount Percentage (%) *" : "Discount Amount (₹) *"}
                  </span>
                  <input
                    required
                    type="number"
                    min="1"
                    value={formData.discountValue === 0 ? "" : formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  />
                </label>
              </div>

              {/* Validity dates */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Valid From</span>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Valid Until</span>
                  <input
                    type="date"
                    value={formData.endDate}
                    min={formData.startDate || undefined}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  />
                </label>
              </div>
              <p className="text-[11px] text-[#747A72] -mt-1">Leave dates blank for an offer with no expiration.</p>

              {/* Minimum service amount */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Minimum Eligible Service Amount (₹)</span>
                <input
                  type="number"
                  min="0"
                  value={formData.minBillAmount === 0 ? "" : formData.minBillAmount}
                  onChange={(e) => setFormData({ ...formData, minBillAmount: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  placeholder="0 = no minimum"
                />
                <p className="text-[11px] text-[#747A72] mt-1">Evaluated strictly against eligible service sales (retail products excluded).</p>
              </label>

              {/* Applicable services */}
              <div className="block">
                <span className="text-xs font-semibold text-[#747A72]">Applicable Services</span>
                <p className="text-[11px] text-[#747A72] mb-1.5">Leave all unchecked to apply this offer to all services. (Retail products never receive offer discounts).</p>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-2 space-y-1">
                  {servicesList.length === 0 ? (
                    <p className="text-xs text-[#747A72] px-2 py-1">No services available.</p>
                  ) : (
                    servicesList.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#FFFFFF] cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={!!s.id && formData.applicableServiceIds.includes(s.id)}
                          onChange={() => s.id && toggleServiceId(s.id)}
                          className="size-3.5 accent-[#6F776D]"
                        />
                        <span className="text-[#292D29] font-medium">{s.name}</span>
                        <span className="text-[#747A72] text-[11px] ml-auto">{formatCurrency(s.price)}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Target Customer Type</span>
                <select
                  value={formData.customerType}
                  onChange={(e) => setFormData({ ...formData, customerType: e.target.value as "all" | "regular" | "membership" })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                >
                  <option value="all">All Customers</option>
                  <option value="regular">Regular Customers Only</option>
                  <option value="membership">Membership Customers Only</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Campaign Status</span>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                >
                  <option value="Active">Active Campaign</option>
                  <option value="Inactive">Paused / Inactive</option>
                </select>
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
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}