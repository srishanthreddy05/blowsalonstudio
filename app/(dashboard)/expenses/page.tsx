"use client";

import { useEffect, useMemo, useState } from "react";
import * as expensesService from "@/services/expenses";
import type { Expense } from "@/types/expense";
import { Plus, Search, Edit2, Trash2, X, Receipt, Calendar } from "lucide-react";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { toLocalDateString } from "@/lib/utils/date";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Date range filters
  const now = new Date();
  const firstDayStr = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const todayStr = toLocalDateString(now);

  const [typeFilter, setTypeFilter] = useState<"all" | "daily" | "monthly">("all");
  const [dateFrom, setDateFrom] = useState(firstDayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState({
    description: "",
    amount: 0,
    date: toLocalDateString(new Date()),
    category: "Rent",
    type: "monthly" as "daily" | "monthly",
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  const loadExpenses = async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      const data = await expensesService.getByDateRange(start, end);
      setExpenses(data);
    } catch (error) {
      console.error("Failed to load expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("add") === "true") {
        handleOpenAdd();
        const cleanUrl = window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
      }
    }
  }, []);

  const handleOpenAdd = () => {
    setEditingExpense(null);
    setFormData({
      description: "",
      amount: 0,
      date: toLocalDateString(new Date()),
      category: "Rent",
      type: "monthly",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (e: Expense) => {
    setEditingExpense(e);
    setFormData({
      description: e.description,
      amount: e.amount,
      date: e.date,
      category: e.category || "Rent",
      type: e.type || "monthly",
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
      await expensesService.delete(idToDelete);
      setDeleteConfirmOpen(false);
      setIdToDelete(null);
      loadExpenses();
    } catch (error) {
      console.error("Failed to delete expense:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingExpense?.id) {
        await expensesService.update(editingExpense.id, formData);
      } else {
        await expensesService.create(formData);
      }
      setModalOpen(false);
      loadExpenses();
    } catch (error) {
      console.error("Failed to save expense:", error);
    }
  };

  // ── Summary card calculations ─────────────────────────────────────────────
  const summary = useMemo(() => {
    const todayStr = toLocalDateString(new Date());
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    let todayDaily = 0;
    let monthFixed = 0;

    expenses.forEach((exp) => {
      if (exp.type === "daily" && exp.date === todayStr) {
        todayDaily += exp.amount;
      }
      if (exp.type === "monthly") {
        const d = new Date(exp.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          monthFixed += exp.amount;
        }
      }
    });

    return { todayDaily, monthFixed, total: todayDaily + monthFixed };
  }, [expenses]);

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch =
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === "all" || e.type === typeFilter;

      const matchesFrom = !dateFrom || e.date >= dateFrom;
      const matchesTo = !dateTo || e.date <= dateTo;

      return matchesSearch && matchesType && matchesFrom && matchesTo;
    });
  }, [expenses, searchQuery, typeFilter, dateFrom, dateTo]);

  return (
    <div className="w-full text-[#292D29]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Finance & Costs
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Expenses Tracker
          </h1>
        </div>
        {!loading && expenses.length > 0 && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Log Expense
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-4">
            <Receipt size={28} />
          </div>
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">No Expenses Found</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            Log utility bills, stylist wages, and salon rent to calculate monthly net profits accurately.
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Log Expense
          </button>
        </div>
      ) : (
        <>
          {/* ── Summary cards ──────────────────────────────────────────── */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#747A72]">
                Today's Daily Expenses
              </p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#B55B5B]">
                {formatCurrency(summary.todayDaily)}
              </p>
              <p className="mt-1 text-xs text-[#747A72]">
                Daily refreshments, fuel, misc
              </p>
            </div>
            <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#747A72]">
                This Month's Fixed Costs
              </p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#B55B5B]">
                {formatCurrency(summary.monthFixed)}
              </p>
              <p className="mt-1 text-xs text-[#747A72]">
                Rent, electricity, fixed bills
              </p>
            </div>
            <div className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#747A72]">
                Total Expenses
              </p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#2F352F]">
                {formatCurrency(summary.total)}
              </p>
              <p className="mt-1 text-xs text-[#747A72]">
                Today's daily + month's fixed
              </p>
            </div>
          </div>

          {/* ── Filters row ────────────────────────────────────────────── */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex flex-1 min-w-[220px] max-w-xs items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
              <Search size={16} className="text-[#747A72] mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
              />
            </div>

            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | "daily" | "monthly")}
              className="h-11 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3.5 text-xs font-semibold text-[#292D29] shadow-xs outline-none focus:border-[#6F776D] transition"
            >
              <option value="all">All types</option>
              <option value="daily">Daily only</option>
              <option value="monthly">Monthly only</option>
            </select>

            {/* Date Selector */}
            <div className="flex items-center gap-2 flex-wrap bg-[#FFFFFF] p-1.5 rounded-xl border border-[#E0E4DD] shadow-xs">
              <Calendar size={15} className="text-[#747A72] ml-2" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 rounded-lg border border-[#E0E4DD] bg-[#F7F7F4] px-2.5 text-xs font-medium text-[#292D29] shadow-xs outline-none focus:border-[#6F776D] transition"
              />
              <span className="text-xs text-[#747A72] font-semibold px-0.5">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 rounded-lg border border-[#E0E4DD] bg-[#F7F7F4] px-2.5 text-xs font-medium text-[#292D29] shadow-xs outline-none focus:border-[#6F776D] transition"
              />
            </div>

            {/* Clear filters */}
            {(typeFilter !== "all" || dateFrom !== firstDayStr || dateTo !== todayStr) && (
              <button
                onClick={() => { setTypeFilter("all"); setDateFrom(firstDayStr); setDateTo(todayStr); }}
                className="h-11 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:text-[#2F352F] hover:bg-[#E8ECE5] shadow-xs transition cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* ── Table ──────────────────────────────────────────────────── */}
          <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
            <table className="w-full min-w-[800px] border-collapse text-left text-xs text-[#292D29]">
              <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Description</th>
                  <th className="px-5 py-3.5 font-bold">Type</th>
                  <th className="px-5 py-3.5 font-bold">Category</th>
                  <th className="px-5 py-3.5 font-bold">Date</th>
                  <th className="px-5 py-3.5 font-bold">Amount</th>
                  <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD]">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[#747A72] italic bg-transparent">
                      No expenses match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="hover:bg-[#F7F7F4]/60 transition bg-transparent"
                    >
                      <td className="px-5 py-3.5 font-semibold text-[#2F352F]">
                        {expense.description}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                            expense.type === "daily"
                              ? "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30"
                              : "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                          }`}
                        >
                          {expense.type === "daily" ? "Daily" : "Monthly"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-block rounded-full bg-[#F7F7F4] border border-[#E0E4DD] px-2.5 py-0.5 text-[10px] text-[#747A72] font-semibold">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[#747A72]">{expense.date}</td>
                      <td className="px-5 py-3.5 font-bold text-[#B55B5B]">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(expense)}
                            className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                            title="Edit"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => expense.id && handleDeleteTrigger(expense.id)}
                            className="grid size-8 place-items-center rounded-lg bg-[#FFFFFF] border border-[#E0E4DD] text-[#B55B5B] hover:bg-[#FBEBEB] hover:border-[#FBEBEB] transition cursor-pointer shadow-xs"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] animate-in zoom-in-95 duration-200 z-10">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">
              {editingExpense ? "Edit Expense Log" : "Log Business Expense"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Expense Description
                </span>
                <input
                  required
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                  placeholder="e.g. Electricity bill (May 2026)"
                />
              </label>

              {/* Type selector */}
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Expense Type
                </span>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as "daily" | "monthly",
                    })
                  }
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
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
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
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
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
                  value={formData.amount === 0 ? "" : formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                />
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
                  Save Log
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
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200">
            <h3 className="font-serif text-base font-bold text-[#2F352F]">
              Are you sure you want to delete this expense?
            </h3>
            <p className="mt-1.5 text-xs text-[#747A72]">
              This action cannot be undone and will remove the record immediately.
            </p>
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