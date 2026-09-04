"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as expensesService from "@/services/expenses";
import { toLocalDateString } from "@/lib/utils/date";

interface AddExpenseModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddExpenseModal({ onClose, onSuccess }: AddExpenseModalProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [category, setCategory] = useState("Rent");
  const [type, setType] = useState<"daily" | "monthly">("daily");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || amount === "" || amount <= 0) {
      setError("Please enter a description and valid amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await expensesService.create({
        description: description.trim(),
        amount: Number(amount),
        date,
        category,
        type,
      });
      onSuccess();
    } catch (err) {
      console.error("Failed to add expense:", err);
      setError("Failed to log business expense. Please try again.");
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
        <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">Log Business Expense</h2>

        {error && (
          <div className="mb-4 text-xs font-semibold text-[#B55B5B] bg-[#FBEBEB] border border-[#FBEBEB] rounded-lg p-2.5">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-[#747A72]">Expense Description</span>
            <input
              required
              autoFocus
              type="text"
              placeholder="e.g. Electricity bill (May 2026)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-[#747A72]">Expense Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "daily" | "monthly")}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
            >
              <option value="daily">Daily — refreshments, fuel, misc</option>
              <option value="monthly">Monthly — rent, electricity, salaries</option>
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-[#747A72]">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
              >
                <option value="Rent">Shop Rent</option>
                <option value="Utilities">Utilities (Power/Water)</option>
                <option value="Salaries">Staff Salaries</option>
                <option value="Inventory">Product Inventory Restock</option>
                <option value="Marketing">Marketing & Flyers</option>
                <option value="Food">Food & Refreshments</option>
                <option value="Transport">Transport & Fuel</option>
                <option value="Other">Other Expenses</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-[#747A72]">Date</span>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-[#747A72]">Amount (INR)</span>
            <input
              required
              type="number"
              min="1"
              placeholder="Enter amount..."
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
            />
          </label>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-xl bg-[#6F776D] px-5 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {saving ? "Logging..." : "Save Log"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
