"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as customerService from "@/services/customers";
import * as invoicesService from "@/services/invoices";
import { toLocalDateString } from "@/lib/utils/date";

interface AddCustomerModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCustomerModal({ onClose, onSuccess }: AddCustomerModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerType, setCustomerType] = useState<"regular" | "membership">("regular");
  const [membershipAmount, setMembershipAmount] = useState("");
  const [membershipDuration, setMembershipDuration] = useState("");
  const [membershipStart, setMembershipStart] = useState(toLocalDateString(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "Cash" | "Card">("UPI");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const calculateMembershipEnd = (start: string, months: number): string => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    return d.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError("Please fill out all fields.");
      return;
    }
    if (customerType === "membership" && (!membershipAmount || !membershipDuration)) {
      setError("Please fill out all membership fields.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const customerId = await customerService.create({
        name: name.trim(),
        phone: phone.trim(),
        customerType,
        ...(customerType === "membership" ? {
          membershipAmount: parseFloat(membershipAmount),
          membershipDuration: parseInt(membershipDuration),
          membershipStart: new Date(membershipStart).toISOString(),
          membershipEnd: calculateMembershipEnd(membershipStart, parseInt(membershipDuration)),
        } : {})
      });

      if (customerType === "membership") {
        await invoicesService.createMembershipInvoice({
          customerId,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          membershipAmount: parseFloat(membershipAmount),
          paymentMethod,
          dateString: membershipStart,
        });
      }

      onSuccess();
    } catch (err) {
      console.error("Failed to add customer:", err);
      setError("Failed to create customer profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] my-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] cursor-pointer transition"
          title="Close Modal (ESC)"
        >
          <X size={18} />
        </button>
        <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">Add Customer</h2>
        
        {error && (
          <div className="mb-4 text-xs font-semibold text-[#B55B5B] bg-[#FBEBEB] border border-[#FBEBEB] rounded-lg p-2.5">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-[#747A72]">Name</span>
              <input
                required
                autoFocus
                type="text"
                placeholder="Customer's name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-[#747A72]">Phone Number</span>
              <input
                required
                type="text"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-[#747A72]">Customer Type</span>
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as "regular" | "membership")}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
            >
              <option value="regular">Regular</option>
              <option value="membership">Membership</option>
            </select>
          </label>

          {customerType === "membership" && (
            <div className="space-y-3.5 border-l-2 border-[#6F776D] pl-3 mt-3 animate-in slide-in-from-left-2 duration-200">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Membership Amount (₹)</span>
                  <input
                    required
                    type="number"
                    placeholder="e.g. 5000"
                    value={membershipAmount}
                    onChange={(e) => setMembershipAmount(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Duration (months)</span>
                  <input
                    required
                    type="number"
                    placeholder="e.g. 3"
                    value={membershipDuration}
                    onChange={(e) => setMembershipDuration(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Start Date</span>
                <input
                  required
                  type="date"
                  value={membershipStart}
                  onChange={(e) => setMembershipStart(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Payment Method</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as "UPI" | "Cash" | "Card")}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                </select>
              </label>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#292D29] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-xl bg-[#6F776D] px-5 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
