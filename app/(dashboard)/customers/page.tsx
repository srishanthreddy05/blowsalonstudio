"use client";

import { useEffect, useState } from "react";
import * as customerService from "@/services/customers";
import * as invoicesService from "@/services/invoices";
import type { Customer } from "@/types/customer";
import { Plus, Search, Edit2, Trash2, X, Users, Eye } from "lucide-react";
import CustomerDetailModal from "@/components/customers/CustomerDetailModal";
import { db } from "@/lib/firebase";
import { toast } from "react-hot-toast";
import {
  query,
  collection,
  where,
  limit,
  getDocs,
  startAfter,
  orderBy,
} from "firebase/firestore";
import { toTitleCase } from "@/lib/utils/text";
import { toLocalDateString } from "@/lib/utils/date";

export default function CustomersPage() {
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState({ regularCount: 0, membershipCount: 0 });

  // Customer states
  const [regularCustomers, setRegularCustomers] = useState<Customer[]>([]);
  const [membershipCustomers, setMembershipCustomers] = useState<Customer[]>([]);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);

  // Pagination cursors
  const [lastRegularDoc, setLastRegularDoc] = useState<any>(null);
  const [lastMembershipDoc, setLastMembershipDoc] = useState<any>(null);

  // Completion flags
  const [hasMoreRegular, setHasMoreRegular] = useState(false);
  const [hasMoreMembership, setHasMoreMembership] = useState(false);

  // Loading more states
  const [loadingMoreRegular, setLoadingMoreRegular] = useState(false);
  const [loadingMoreMembership, setLoadingMoreMembership] = useState(false);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    customerType: "regular" as "regular" | "membership",
    membershipAmount: "",
    membershipDuration: "",
    membershipStart: "",
    paymentMethod: "UPI" as "UPI" | "Cash" | "Card",
    recordInvoice: false,
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCustomerForDetail, setSelectedCustomerForDetail] = useState<Customer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadStats = async () => {
    const s = await customerService.getStats();
    setStats(s);
  };

  const loadRegular = async (isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMoreRegular(true);
    }
    try {
      let snap;
      try {
        let q = query(
          collection(db, "customers"),
          where("customerType", "==", "regular"),
          orderBy("name", "asc"),
          limit(10)
        );

        if (isLoadMore && lastRegularDoc) {
          q = query(
            collection(db, "customers"),
            where("customerType", "==", "regular"),
            orderBy("name", "asc"),
            startAfter(lastRegularDoc),
            limit(10)
          );
        }
        snap = await getDocs(q);
      } catch {
        // In-code fallback while composite index is building on Firestore
        const fallbackQuery = query(
          collection(db, "customers"),
          where("customerType", "==", "regular")
        );
        snap = await getDocs(fallbackQuery);
      }

      const docs = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Customer
      );
      docs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      if (isLoadMore) {
        setRegularCustomers((prev) => [...prev, ...docs]);
      } else {
        setRegularCustomers(docs);
      }

      if (snap.docs.length > 0) {
        setLastRegularDoc(snap.docs[snap.docs.length - 1]);
      } else if (!isLoadMore) {
        setLastRegularDoc(null);
      }
      setHasMoreRegular(snap.docs.length >= 10);
    } catch (error) {
      console.error("Error loading regular customers:", error);
    } finally {
      if (isLoadMore) {
        setLoadingMoreRegular(false);
      }
    }
  };

  const loadMembership = async (isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMoreMembership(true);
    }
    try {
      let snap;
      try {
        let q = query(
          collection(db, "customers"),
          where("customerType", "==", "membership"),
          orderBy("name", "asc"),
          limit(10)
        );

        if (isLoadMore && lastMembershipDoc) {
          q = query(
            collection(db, "customers"),
            where("customerType", "==", "membership"),
            orderBy("name", "asc"),
            startAfter(lastMembershipDoc),
            limit(10)
          );
        }
        snap = await getDocs(q);
      } catch {
        // In-code fallback while composite index is building on Firestore
        const fallbackQuery = query(
          collection(db, "customers"),
          where("customerType", "==", "membership")
        );
        snap = await getDocs(fallbackQuery);
      }

      const docs = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Customer
      );
      docs.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      if (isLoadMore) {
        setMembershipCustomers((prev) => [...prev, ...docs]);
      } else {
        setMembershipCustomers(docs);
      }

      if (snap.docs.length > 0) {
        setLastMembershipDoc(snap.docs[snap.docs.length - 1]);
      } else if (!isLoadMore) {
        setLastMembershipDoc(null);
      }
      setHasMoreMembership(snap.docs.length >= 10);
    } catch (error) {
      console.error("Error loading membership customers:", error);
    } finally {
      if (isLoadMore) {
        setLoadingMoreMembership(false);
      }
    }
  };

  const runSearch = async (queryString: string) => {
    if (!queryString.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const isPhone = /^\d+$/.test(queryString);
      let q;
      if (isPhone) {
        q = query(
          collection(db, "customers"),
          where("phone", ">=", queryString),
          where("phone", "<=", queryString + "\uf8ff"),
          limit(10)
        );
      } else {
        const formatted = toTitleCase(queryString);
        q = query(
          collection(db, "customers"),
          where("name", ">=", formatted),
          where("name", "<=", formatted + "\uf8ff"),
          limit(10)
        );
      }
      const snap = await getDocs(q);
      const results = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Customer
      );
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching customers:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  const initializeData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadRegular(false),
        loadMembership(false),
      ]);
    } catch (error) {
      console.error("Initialization error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initializeData();
  }, []);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      runSearch(debouncedQuery);
    } else {
      setSearchResults([]);
    }
  }, [debouncedQuery]);

  const handleOpenDetail = (customer: Customer) => {
    setSelectedCustomerForDetail(customer);
    setDetailModalOpen(true);
  };

  const handleRefresh = async () => {
    await initializeData();
    if (debouncedQuery.trim()) {
      runSearch(debouncedQuery);
    }
  };

  const calculateMembershipEnd = (start: string, months: number): string => {
    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    return d.toISOString();
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData({
      name: "",
      phone: "",
      customerType: "regular",
      membershipAmount: "",
      membershipDuration: "",
      membershipStart: toLocalDateString(new Date()),
      paymentMethod: "UPI",
      recordInvoice: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || "",
      phone: customer.phone || "",
      customerType: customer.customerType || "regular",
      membershipAmount: customer.membershipAmount?.toString() || "",
      membershipDuration: customer.membershipDuration?.toString() || "",
      membershipStart: customer.membershipStart ? toLocalDateString(customer.membershipStart) : toLocalDateString(new Date()),
      paymentMethod: "UPI",
      recordInvoice: false,
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
      await customerService.delete(idToDelete);
      toast.success("Customer deleted successfully!");
      setDeleteConfirmOpen(false);
      setIdToDelete(null);
      await handleRefresh();
    } catch (error: any) {
      console.error("Failed to delete customer:", error);
      if (error?.code === "failed-precondition" || error?.message?.includes("failed-precondition")) {
        toast.error("This customer was already removed — list refreshed");
      } else {
        toast.error("Failed to delete customer.");
      }
      setDeleteConfirmOpen(false);
      setIdToDelete(null);
      await handleRefresh();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave = {
        name: formData.name,
        phone: formData.phone,
        customerType: formData.customerType,
        ...(formData.customerType === "membership" ? {
          membershipAmount: parseFloat(formData.membershipAmount) || 0,
          membershipDuration: parseInt(formData.membershipDuration) || 0,
          membershipStart: new Date(formData.membershipStart).toISOString(),
          membershipEnd: calculateMembershipEnd(formData.membershipStart, parseInt(formData.membershipDuration) || 0),
        } : {
          membershipAmount: null,
          membershipDuration: null,
          membershipStart: null,
          membershipEnd: null,
        })
      };

      let customerId = editingCustomer?.id;
      if (editingCustomer?.id) {
        await customerService.update(editingCustomer.id, dataToSave);
      } else {
        customerId = await customerService.create(dataToSave);
      }

      if (formData.customerType === "membership" && formData.recordInvoice && customerId) {
        await invoicesService.createMembershipInvoice({
          customerId,
          customerName: formData.name.trim(),
          customerPhone: formData.phone.trim(),
          membershipAmount: parseFloat(formData.membershipAmount) || 0,
          paymentMethod: formData.paymentMethod,
          dateString: formData.membershipStart,
        });
      }

      setModalOpen(false);
      await handleRefresh();
    } catch (error) {
      console.error("Failed to save customer:", error);
    }
  };

  const regularToDisplay = debouncedQuery.trim()
    ? searchResults.filter((c) => c.customerType === "regular" || !c.customerType)
    : regularCustomers;

  const membershipToDisplay = debouncedQuery.trim()
    ? searchResults.filter((c) => c.customerType === "membership")
    : membershipCustomers;

  const regularHeader = debouncedQuery.trim()
    ? `Regular Customers (${regularToDisplay.length} found)`
    : `Regular Customers (${stats.regularCount})`;

  const membershipHeader = debouncedQuery.trim()
    ? `Membership Customers (${membershipToDisplay.length} found)`
    : `Membership Customers (${stats.membershipCount})`;

  return (
    <div className="w-full text-[#292D29]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Client Management
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Customers ({stats.regularCount + stats.membershipCount})
          </h1>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
        >
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : (stats.regularCount + stats.membershipCount) === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-4">
            <Users size={28} />
          </div>
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">No Customers Found</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            Create profiles to track salon memberships and schedule visits.
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Add Customer
          </button>
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="mb-6 flex max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
            {searchLoading ? (
              <div className="size-3.5 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent mr-2 shrink-0" />
            ) : (
              <Search size={16} className="text-[#747A72] mr-2 shrink-0" />
            )}
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
            />
          </div>

          {/* List display: 2 columns side-by-side */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Regular Customers Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-2">
                <h2 className="font-serif text-base font-bold text-[#2F352F]">
                  {regularHeader}
                </h2>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
                <table className="w-full min-w-[340px] border-collapse text-left text-xs text-[#292D29]">
                  <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                    <tr>
                      <th className="px-4 py-3 font-bold">Name</th>
                      <th className="px-4 py-3 font-bold">Phone</th>
                      <th className="px-4 py-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E4DD]">
                    {regularToDisplay.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-[#747A72] font-medium italic bg-transparent">
                          {debouncedQuery.trim()
                            ? "No matching regular customers."
                            : "No regular customers."}
                        </td>
                      </tr>
                    ) : (
                      regularToDisplay.map((customer) => (
                        <tr key={customer.id} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                          <td className="px-4 py-3 font-semibold text-[#2F352F]">{customer.name}</td>
                          <td className="px-4 py-3 font-medium text-[#747A72]">{customer.phone}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenDetail(customer)}
                                className="grid size-8 place-items-center rounded-lg border border-[#E0E4DD] bg-[#FFFFFF] text-[#747A72] hover:text-[#2F352F] hover:border-[#6F776D] hover:bg-[#E8ECE5] transition cursor-pointer shadow-xs"
                                title="View Details"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={() => handleOpenEdit(customer)}
                                className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                                title="Edit"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => customer.id && handleDeleteTrigger(customer.id)}
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
              {!debouncedQuery.trim() && hasMoreRegular && (
                <button
                  onClick={() => loadRegular(true)}
                  disabled={loadingMoreRegular}
                  className="w-full h-10 border border-[#E0E4DD] bg-[#FFFFFF] hover:border-[#6F776D] hover:bg-[#E8ECE5] rounded-xl text-xs font-bold text-[#2F352F] transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {loadingMoreRegular && (
                    <div className="size-3.5 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
                  )}
                  {loadingMoreRegular ? "Loading..." : "Load More"}
                </button>
              )}
            </div>

            {/* Membership Customers Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-2">
                <h2 className="font-serif text-base font-bold text-[#2F352F]">
                  {membershipHeader}
                </h2>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
                <table className="w-full min-w-[340px] border-collapse text-left text-xs text-[#292D29]">
                  <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                    <tr>
                      <th className="px-4 py-3 font-bold">Name</th>
                      <th className="px-4 py-3 font-bold">Phone</th>
                      <th className="px-4 py-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E4DD]">
                    {membershipToDisplay.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-[#747A72] font-medium italic bg-transparent">
                          {debouncedQuery.trim()
                            ? "No matching membership customers."
                            : "No membership customers."}
                        </td>
                      </tr>
                    ) : (
                      membershipToDisplay.map((customer) => (
                        <tr key={customer.id} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                          <td className="px-4 py-3 font-semibold text-[#2F352F]">{customer.name}</td>
                          <td className="px-4 py-3 font-medium text-[#747A72]">{customer.phone}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenDetail(customer)}
                                className="grid size-8 place-items-center rounded-lg border border-[#E0E4DD] bg-[#FFFFFF] text-[#747A72] hover:text-[#2F352F] hover:border-[#6F776D] hover:bg-[#E8ECE5] transition cursor-pointer shadow-xs"
                                title="View Details"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={() => handleOpenEdit(customer)}
                                className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                                title="Edit"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => customer.id && handleDeleteTrigger(customer.id)}
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
              {!debouncedQuery.trim() && hasMoreMembership && (
                <button
                  onClick={() => loadMembership(true)}
                  disabled={loadingMoreMembership}
                  className="w-full h-10 border border-[#E0E4DD] bg-[#FFFFFF] hover:border-[#6F776D] hover:bg-[#E8ECE5] rounded-xl text-xs font-bold text-[#2F352F] transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {loadingMoreMembership && (
                    <div className="size-3.5 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
                  )}
                  {loadingMoreMembership ? "Loading..." : "Load More"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal Overlay Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] animate-in zoom-in-95 duration-200 z-10 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">
              {editingCustomer ? "Edit Customer Details" : "Add Customer"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Name</span>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Phone Number</span>
                <input
                  required
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Customer Type</span>
                <select
                  value={formData.customerType}
                  onChange={(e) => {
                    const newType = e.target.value as "regular" | "membership";
                    setFormData({
                      ...formData,
                      customerType: newType,
                      recordInvoice: newType === "membership" ? (editingCustomer?.customerType !== "membership") : false
                    });
                  }}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                >
                  <option value="regular">Regular</option>
                  <option value="membership">Membership</option>
                </select>
              </label>

              {formData.customerType === "membership" && (
                <div className="space-y-3.5 border-l-2 border-[#6F776D] pl-3 mt-3 animate-in slide-in-from-left-2 duration-200">
                  <label className="block">
                    <span className="text-xs font-semibold text-[#747A72]">Membership Amount (₹)</span>
                    <input
                      required
                      type="number"
                      placeholder="e.g. 5000"
                      value={formData.membershipAmount}
                      onChange={(e) => setFormData({ ...formData, membershipAmount: e.target.value })}
                      className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-[#747A72]">Duration (in months)</span>
                    <input
                      required
                      type="number"
                      placeholder="e.g. 3"
                      value={formData.membershipDuration}
                      onChange={(e) => setFormData({ ...formData, membershipDuration: e.target.value })}
                      className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-[#747A72]">Start Date</span>
                    <input
                      required
                      type="date"
                      value={formData.membershipStart}
                      onChange={(e) => setFormData({ ...formData, membershipStart: e.target.value })}
                      className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-[#747A72]">Payment Method</span>
                    <select
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as "UPI" | "Cash" | "Card" })}
                      className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                    >
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                    </select>
                  </label>

                  <div className="flex items-center gap-2.5 pt-1">
                    <input
                      type="checkbox"
                      id="recordInvoice"
                      checked={formData.recordInvoice}
                      onChange={(e) => setFormData({ ...formData, recordInvoice: e.target.checked })}
                      className="size-4 rounded border-[#E0E4DD] bg-[#F7F7F4] text-[#6F776D] focus:ring-0 accent-[#6F776D] cursor-pointer"
                    />
                    <label htmlFor="recordInvoice" className="text-xs font-semibold text-[#292D29] cursor-pointer select-none">
                      Record payment & generate membership invoice
                    </label>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#292D29] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-[#6F776D] px-5 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition cursor-pointer shadow-xs"
                >
                  Save Profile
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
            <h3 className="font-serif text-base font-bold text-[#2F352F]">Are you sure you want to delete this customer?</h3>
            <p className="mt-1.5 text-xs text-[#747A72]">This action cannot be undone and will remove the record immediately.</p>
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

      {detailModalOpen && selectedCustomerForDetail && (
        <CustomerDetailModal
          customer={selectedCustomerForDetail}
          onClose={() => {
            setDetailModalOpen(false);
            setSelectedCustomerForDetail(null);
          }}
        />
      )}
    </div>
  );
}
