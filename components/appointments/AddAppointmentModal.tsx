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
  const [reminder30Min, setReminder30Min] = useState<boolean>(true);

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

  // Close dropdown on outside click
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered customers for autocomplete
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) {
      return allCustomers.slice(0, 8);
    }
    const q = customerSearchQuery.toLowerCase().trim();
    return allCustomers
      .filter((c) => {
        const nameMatch = c.name?.toLowerCase().includes(q);
        const phoneMatch = c.phone?.includes(q);
        return nameMatch || phoneMatch;
      })
      .slice(0, 10);
  }, [allCustomers, customerSearchQuery]);

  if (!isOpen) return null;

  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomer(cust);
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
      toast.error("Please select or add a customer.");
      return;
    }

    if (!date) {
      toast.error("Please select an appointment date.");
      return;
    }

    if (!visitTime) {
      toast.error("Please select a visit time.");
      return;
    }

    setSaving(true);
    try {
      let reminderMinutes: number | undefined = undefined;
      if (reminder30Min) {
        reminderMinutes = 30;
      } else if (reminder1Hour) {
        reminderMinutes = 60;
      } else if (reminderDay) {
        reminderMinutes = 0;
      }

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
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#292D29]/40 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div 
          className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xl text-[#292D29] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#E0E4DD] bg-[#FFFFFF]">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-[#E8ECE5] text-[#6F776D] border border-[#CCD2C8]">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-[#2F352F]">Book Appointment</h2>
                <p className="text-xs text-[#747A72]">Manual customer visit booking & reminder</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* 1. CUSTOMER SELECTION */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#747A72] flex items-center justify-between">
                <span>
                  Customer <span className="text-[#B55B5B]">*</span>
                </span>
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearchQuery("");
                    }}
                    className="text-[11px] font-bold text-[#6F776D] hover:text-[#2F352F] hover:underline transition cursor-pointer"
                  >
                    Change Customer
                  </button>
                )}
              </label>

              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD]">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 place-items-center rounded-full bg-[#E8ECE5] text-[#2F352F] font-serif font-bold text-sm border border-[#CCD2C8]">
                      {selectedCustomer.name?.charAt(0).toUpperCase() || "C"}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#2F352F] flex items-center gap-2">
                        {selectedCustomer.name}
                        {selectedCustomer.customerType === "membership" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30">
                            MEMBER
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#747A72] flex items-center gap-3 mt-0.5">
                        <span>{selectedCustomer.phone || "No phone"}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="p-1 rounded-lg text-[#747A72] hover:text-[#2F352F] hover:bg-[#E8ECE5] transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative" ref={customerDropdownRef}>
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#747A72] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search customer by name or phone..."
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="w-full pl-9 pr-24 py-2.5 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs text-[#292D29] placeholder:text-[#747A72] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setAddCustomerModalOpen(true)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-bold bg-[#E8ECE5] text-[#2F352F] hover:bg-[#CCD2C8] border border-[#CCD2C8] rounded-lg transition flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New
                    </button>
                  </div>

                  {/* Customer Dropdown Results */}
                  {showCustomerDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 max-h-56 overflow-y-auto bg-[#FFFFFF] border border-[#E0E4DD] rounded-2xl shadow-xl z-20 divide-y divide-[#E0E4DD]">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((cust) => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => handleSelectCustomer(cust)}
                            className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-[#F7F7F4] transition cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="grid size-7 place-items-center rounded-full bg-[#E8ECE5] text-[#2F352F] text-xs font-bold">
                                {cust.name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-[#2F352F]">{cust.name}</p>
                                <p className="text-[11px] text-[#747A72]">{cust.phone || "No phone"}</p>
                              </div>
                            </div>
                            <div className="text-right text-[10px] font-bold text-[#6F776D]">
                              {cust.customerType === "membership" ? "Member" : "Regular"}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-xs text-[#747A72]">No customers found</p>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCustomerDropdown(false);
                              setAddCustomerModalOpen(true);
                            }}
                            className="mt-2 text-xs font-bold text-[#6F776D] hover:text-[#2F352F] hover:underline flex items-center justify-center gap-1 mx-auto cursor-pointer"
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
                <label className="text-xs font-semibold text-[#747A72] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#6F776D]" />
                  Date <span className="text-[#B55B5B]">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs font-medium text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
                />
              </div>

              {/* Visit Time */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#747A72] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#6F776D]" />
                  Visit Time <span className="text-[#B55B5B]">*</span>
                </label>
                <div className="relative">
                  <select
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs font-medium text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition cursor-pointer"
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 3. SPECIAL INSTRUCTIONS / NOTES */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#747A72] flex items-center justify-between">
                <span>Special Instructions / Notes</span>
                <span className="text-[11px] text-[#747A72] font-normal">Optional</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Customer requested preferred stylist, low fade, patch test, etc."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs text-[#292D29] placeholder:text-[#747A72] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition resize-none"
              />
            </div>

            {/* 4. REMINDER SETTINGS */}
            <div className="space-y-2.5 pt-1">
              <label className="text-xs font-semibold text-[#747A72] block">
                Reminder Settings
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    reminderDay
                      ? "bg-[#E8ECE5] border-[#6F776D] text-[#2F352F] font-bold ring-1 ring-[#6F776D]"
                      : "bg-[#F7F7F4] border-[#E0E4DD] text-[#747A72] hover:border-[#CCD2C8]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={reminderDay}
                    onChange={(e) => setReminderDay(e.target.checked)}
                    className="w-4 h-4 rounded text-[#6F776D] focus:ring-[#6F776D]/20 accent-[#6F776D]"
                  />
                  <span>Day reminder</span>
                </label>

                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    reminder1Hour
                      ? "bg-[#E8ECE5] border-[#6F776D] text-[#2F352F] font-bold ring-1 ring-[#6F776D]"
                      : "bg-[#F7F7F4] border-[#E0E4DD] text-[#747A72] hover:border-[#CCD2C8]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={reminder1Hour}
                    onChange={(e) => {
                      setReminder1Hour(e.target.checked);
                      if (e.target.checked) setReminder30Min(false);
                    }}
                    className="w-4 h-4 rounded text-[#6F776D] focus:ring-[#6F776D]/20 accent-[#6F776D]"
                  />
                  <span>1 hour before</span>
                </label>

                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    reminder30Min
                      ? "bg-[#E8ECE5] border-[#6F776D] text-[#2F352F] font-bold ring-1 ring-[#6F776D]"
                      : "bg-[#F7F7F4] border-[#E0E4DD] text-[#747A72] hover:border-[#CCD2C8]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={reminder30Min}
                    onChange={(e) => {
                      setReminder30Min(e.target.checked);
                      if (e.target.checked) setReminder1Hour(false);
                    }}
                    className="w-4 h-4 rounded text-[#6F776D] focus:ring-[#6F776D]/20 accent-[#6F776D]"
                  />
                  <span>30 mins before</span>
                </label>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E0E4DD]">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="h-10 px-5 text-xs font-bold text-[#747A72] hover:text-[#2F352F] bg-[#FFFFFF] hover:bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !selectedCustomer}
                className="h-10 px-5 text-xs font-bold text-white bg-[#6F776D] hover:bg-[#2F352F] rounded-xl transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
