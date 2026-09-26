"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, Search, Calendar, Clock, User, Plus, Sparkles, Check } from "lucide-react";
import * as appointmentService from "@/services/appointments";
import * as customerService from "@/services/customers";
import type { Customer } from "@/types/customer";
import { toLocalDateString } from "@/lib/utils/date";
import { toast } from "react-hot-toast";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";

interface AddAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (appointmentId: string) => void;
  initialCustomerId?: string;
  initialCustomerName?: string;
  initialCustomerPhone?: string;
  initialDate?: string;
}

const TIME_SLOTS = [
  "08:00", "08:30",
  "09:00", "09:15", "09:30", "09:45",
  "10:00", "10:15", "10:30", "10:45",
  "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45",
  "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45",
  "15:00", "15:15", "15:30", "15:45",
  "16:00", "16:15", "16:30", "16:45",
  "17:00", "17:15", "17:30", "17:45",
  "18:00", "18:15", "18:30", "18:45",
  "19:00", "19:15", "19:30", "19:45",
  "20:00", "20:30", "21:00"
];

export function AddAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  initialCustomerId,
  initialCustomerName,
  initialCustomerPhone,
  initialDate,
}: AddAppointmentModalProps) {
  // Customer states
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Form fields
  const [date, setDate] = useState<string>(initialDate || toLocalDateString(new Date()));
  const [visitTime, setVisitTime] = useState<string>("10:00");
  const [notes, setNotes] = useState<string>("");

  // Reminder fields
  const [reminderDay, setReminderDay] = useState<boolean>(true);
  const [reminder1Hour, setReminder1Hour] = useState<boolean>(false);
  const [reminder30Min, setReminder30Min] = useState<boolean>(false);

  const [saving, setSaving] = useState(false);

  // Load all customers for search
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const list = await customerService.getAll();
        if (active) setAllCustomers(list);
      } catch (err) {
        console.error("Error loading customers:", err);
      }
    };
    if (isOpen) {
      load();
    }
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Handle initial customer if provided
  useEffect(() => {
    if (isOpen) {
      if (initialCustomerId) {
        const found = allCustomers.find((c) => c.id === initialCustomerId);
        if (found) {
          setSelectedCustomer(found);
        } else if (initialCustomerName) {
          setSelectedCustomer({
            id: initialCustomerId,
            name: initialCustomerName,
            phone: initialCustomerPhone || "",
            customerType: "regular",
            createdAt: new Date().toISOString(),
          } as Customer);
        }
      }
      if (initialDate) {
        setDate(initialDate);
      }
    }
  }, [isOpen, initialCustomerId, initialCustomerName, initialCustomerPhone, initialDate, allCustomers]);

  // Click outside customer dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filtered customer list for search
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return allCustomers.slice(0, 8);
    return allCustomers
      .filter((c) => {
        const nameMatch = (c.name || "").toLowerCase().includes(q);
        const phoneMatch = (c.phone || "").includes(q);
        return nameMatch || phoneMatch;
      })
      .slice(0, 10);
  }, [customerSearchQuery, allCustomers]);

  if (!isOpen) return null;

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerDropdown(false);
    setCustomerSearchQuery("");
  };

  const handleCreatedNewCustomer = () => {
    setAddCustomerModalOpen(false);
    customerService.getAll().then((list) => {
      setAllCustomers(list);
      if (list.length > 0) {
        setSelectedCustomer(list[0]);
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      toast.error("Please select a customer for the appointment.");
      return;
    }

    if (!date) {
      toast.error("Please select a date.");
      return;
    }

    if (!visitTime) {
      toast.error("Please select a visit time.");
      return;
    }

    setSaving(true);
    try {
      // Determine reminder setting
      let reminderMinutes = 0; // Default appointment day
      if (reminder30Min) reminderMinutes = 30;
      else if (reminder1Hour) reminderMinutes = 60;

      const appointmentId = await appointmentService.create({
        customerId: selectedCustomer.id || "",
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        date,
        startTime: visitTime,
        status: "scheduled",
        notes: notes.trim() || undefined,
        reminderEnabled: reminderDay || reminder1Hour || reminder30Min,
        reminderMinutesBefore: reminderMinutes,
      });

      toast.success(`Appointment booked for ${selectedCustomer.name}`);
      if (onSuccess) {
        onSuccess(appointmentId);
      }
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to create appointment";
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-[#18181b] border border-neutral-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800/80 bg-[#1f1f23]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Book Appointment</h2>
                <p className="text-xs text-neutral-400">Manual customer visit booking & reminder</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* 1. CUSTOMER SELECTION */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                <span>
                  Customer <span className="text-rose-400">*</span>
                </span>
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearchQuery("");
                    }}
                    className="text-[11px] text-neutral-400 hover:text-amber-400 transition-colors"
                  >
                    Change Customer
                  </button>
                )}
              </label>

              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900 border border-neutral-700/60">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center font-medium text-sm border border-amber-500/20">
                      {selectedCustomer.name?.charAt(0).toUpperCase() || "C"}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        {selectedCustomer.name}
                        {selectedCustomer.customerType === "membership" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            MEMBER
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400 flex items-center gap-3">
                        <span>{selectedCustomer.phone || "No phone"}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative" ref={customerDropdownRef}>
                  <div className="relative">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search customer by name or phone..."
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="w-full pl-9 pr-24 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setAddCustomerModalOpen(true)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New
                    </button>
                  </div>

                  {/* Customer Dropdown Results */}
                  {showCustomerDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 max-h-56 overflow-y-auto bg-[#1c1c20] border border-neutral-700/80 rounded-xl shadow-xl z-20 divide-y divide-neutral-800">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((cust) => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => handleSelectCustomer(cust)}
                            className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-neutral-800/70 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-xs font-medium">
                                {cust.name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-white">{cust.name}</p>
                                <p className="text-xs text-neutral-400">{cust.phone || "No phone"}</p>
                              </div>
                            </div>
                            <div className="text-right text-[11px] text-neutral-400">
                              {cust.customerType === "membership" ? "Member" : "Regular"}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-xs text-neutral-400">No customers found</p>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCustomerDropdown(false);
                              setAddCustomerModalOpen(true);
                            }}
                            className="mt-2 text-xs text-amber-400 hover:underline flex items-center justify-center gap-1 mx-auto"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Create new customer &quot;{customerSearchQuery}&quot;
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. DATE & VISIT TIME ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                  Date <span className="text-rose-400">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500/60 transition-colors [color-scheme:dark]"
                />
              </div>

              {/* Visit Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                  Visit Time <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <select
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500/60 transition-colors cursor-pointer"
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot} className="bg-neutral-900 text-white">
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 3. SPECIAL INSTRUCTIONS / NOTES */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                <span>Special Instructions / Notes</span>
                <span className="text-[11px] text-neutral-500 font-normal">Optional</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Customer requested preferred stylist, low fade, patch test, etc."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors resize-none"
              />
            </div>

            {/* 4. REMINDER SETTINGS */}
            <div className="space-y-2.5 pt-1">
              <label className="text-xs font-semibold text-neutral-300 block">
                Reminder Settings
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    reminderDay
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                      : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={reminderDay}
                    onChange={(e) => setReminderDay(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-neutral-950 border-neutral-700 accent-amber-500"
                  />
                  <span>Day reminder</span>
                </label>

                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    reminder1Hour
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                      : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={reminder1Hour}
                    onChange={(e) => {
                      setReminder1Hour(e.target.checked);
                      if (e.target.checked) setReminder30Min(false);
                    }}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-neutral-950 border-neutral-700 accent-amber-500"
                  />
                  <span>1 hour before</span>
                </label>

                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    reminder30Min
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                      : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={reminder30Min}
                    onChange={(e) => {
                      setReminder30Min(e.target.checked);
                      if (e.target.checked) setReminder1Hour(false);
                    }}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-neutral-950 border-neutral-700 accent-amber-500"
                  />
                  <span>30 mins before</span>
                </label>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white bg-neutral-800/80 hover:bg-neutral-800 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !selectedCustomer}
                className="px-5 py-2 text-sm font-medium text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/10 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                    Booking...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Appointment
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Add Customer Modal nested flow */}
      {addCustomerModalOpen && (
        <AddCustomerModal
          onClose={() => setAddCustomerModalOpen(false)}
          onSuccess={handleCreatedNewCustomer}
        />
      )}
    </>
  );
}
