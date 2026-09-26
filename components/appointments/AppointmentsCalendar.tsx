"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Search,
  CheckCircle2,
  FileText,
  Phone,
  Receipt,
} from "lucide-react";
import type { Appointment } from "@/types/appointment";
import * as appointmentService from "@/services/appointments";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { AddAppointmentModal } from "./AddAppointmentModal";
import { AppointmentDetailModal } from "./AppointmentDetailModal";
import { toLocalDateString } from "@/lib/utils/date";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday as checkIsToday,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from "date-fns";

export function AppointmentsCalendar() {
  // Calendar State
  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");

  // Modals State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [bookAgainCustomer, setBookAgainCustomer] = useState<{ id: string; name: string; phone?: string } | null>(null);

  // Determine query date range based on view
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "day") {
      const dStr = toLocalDateString(currentDate);
      return { rangeStart: dStr, rangeEnd: dStr };
    } else if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
      const end = endOfWeek(currentDate, { weekStartsOn: 1 }); // Sunday
      return {
        rangeStart: toLocalDateString(start),
        rangeEnd: toLocalDateString(end),
      };
    } else {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      return {
        rangeStart: toLocalDateString(start),
        rangeEnd: toLocalDateString(end),
      };
    }
  }, [viewMode, currentDate]);

  // Load Appointments for the active range
  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      let list: Appointment[] = [];
      if (viewMode === "day") {
        list = await appointmentService.getByDate(rangeStart);
      } else {
        list = await appointmentService.getByDateRange(rangeStart, rangeEnd);
      }
      setAppointments(list);
    } catch (err) {
      console.error("Failed to load appointments:", err);
    } finally {
      setLoading(false);
    }
  }, [viewMode, rangeStart, rangeEnd]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === "day") {
      setCurrentDate((d) => subDays(d, 1));
    } else if (viewMode === "week") {
      setCurrentDate((d) => subWeeks(d, 1));
    } else {
      setCurrentDate((d) => subMonths(d, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "day") {
      setCurrentDate((d) => addDays(d, 1));
    } else if (viewMode === "week") {
      setCurrentDate((d) => addWeeks(d, 1));
    } else {
      setCurrentDate((d) => addMonths(d, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Client-side filtering
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (appt.customerName || "").toLowerCase().includes(q);
        const phoneMatch = (appt.customerPhone || "").includes(q);
        const notesMatch = (appt.notes || "").toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !notesMatch) return false;
      }

      // Status filter
      if (selectedStatusFilter !== "all" && appt.status !== selectedStatusFilter) {
        return false;
      }

      return true;
    });
  }, [appointments, searchQuery, selectedStatusFilter]);

  // Summary counts for current range
  const summaryCounts = useMemo(() => {
    let scheduled = 0;
    let confirmed = 0;
    let completed = 0;
    let cancelled = 0;
    let noShow = 0;

    filteredAppointments.forEach((a) => {
      if (a.status === "scheduled") scheduled++;
      else if (a.status === "confirmed") confirmed++;
      else if (a.status === "completed") completed++;
      else if (a.status === "cancelled") cancelled++;
      else if (a.status === "no-show") noShow++;
    });

    return {
      total: filteredAppointments.length,
      scheduled,
      confirmed,
      completed,
      cancelled,
      noShow,
    };
  }, [filteredAppointments]);

  // Date Header Title
  const headerDateLabel = useMemo(() => {
    if (viewMode === "day") {
      return format(currentDate, "EEEE, dd MMMM yyyy");
    } else if (viewMode === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, "dd MMM")} – ${format(end, "dd MMM yyyy")}`;
    } else {
      return format(currentDate, "MMMM yyyy");
    }
  }, [viewMode, currentDate]);

  const handleBookAgainTrigger = (cust: { id: string; name: string; phone?: string }) => {
    setBookAgainCustomer(cust);
    setAddModalOpen(true);
  };

  return (
    <div className="w-full text-[#292D29] space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E0E4DD] pb-5">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#6F776D] mb-1">
            <CalendarDays size={13} />
            <span>Salon Operations</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Appointments & Schedule
          </h1>
          <p className="text-xs text-[#747A72] mt-0.5">
            Manage manual customer visit bookings and reminders
          </p>
        </div>

        <button
          onClick={() => {
            setBookAgainCustomer(null);
            setAddModalOpen(true);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Appointment</span>
        </button>
      </div>

      {/* Navigation & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FFFFFF] rounded-2xl border border-[#E0E4DD] p-3 shadow-xs">
        {/* Left: View Modes & Today shortcut */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="h-9 px-3 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] hover:bg-[#D8DEC5] text-xs font-bold text-[#2F352F] transition cursor-pointer"
          >
            Today
          </button>

          <div className="flex rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-0.5">
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === "day"
                  ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs"
                  : "text-[#747A72] hover:text-[#2F352F]"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === "week"
                  ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs"
                  : "text-[#747A72] hover:text-[#2F352F]"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === "month"
                  ? "bg-[#FFFFFF] text-[#2F352F] shadow-xs"
                  : "text-[#747A72] hover:text-[#2F352F]"
              }`}
            >
              Month
            </button>
          </div>
        </div>

        {/* Center: Date Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
            title="Previous"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-serif font-bold text-sm text-[#2F352F] min-w-[180px] text-center">
            {headerDateLabel}
          </span>
          <button
            onClick={handleNext}
            className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
            title="Next"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Right: Summary Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span className="px-2.5 py-1 rounded-lg bg-[#F7F7F4] border border-[#E0E4DD] text-[#2F352F]">
            {summaryCounts.total} Total
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F]">
            {summaryCounts.scheduled} Scheduled
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#FAF4E8] border border-[#B18A45]/30 text-[#B18A45]">
            {summaryCounts.confirmed} Confirmed
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#E8ECE5] border border-[#5F7A62]/30 text-[#5F7A62]">
            {summaryCounts.completed} Completed
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Search */}
        <div className="flex items-center h-10 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3 shadow-xs focus-within:border-[#6F776D] transition">
          <Search size={14} className="text-[#747A72] mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search customer, phone, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
          />
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3 text-xs text-[#292D29] shadow-xs outline-none focus:border-[#6F776D]"
          >
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="no-show">No Show</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Main Calendar Views */}
      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : (
        <div>
          {/* Day View */}
          {viewMode === "day" && (
            <DayView
              date={currentDate}
              appointments={filteredAppointments}
              onAppointmentClick={(appt) => setSelectedAppointment(appt)}
              onAddAppointment={() => {
                setBookAgainCustomer(null);
                setAddModalOpen(true);
              }}
            />
          )}

          {/* Week View */}
          {viewMode === "week" && (
            <WeekView
              currentDate={currentDate}
              appointments={filteredAppointments}
              onAppointmentClick={(appt) => setSelectedAppointment(appt)}
              onDateClick={(clickedDate) => {
                setCurrentDate(clickedDate);
                setViewMode("day");
              }}
              onAddAppointment={() => {
                setBookAgainCustomer(null);
                setAddModalOpen(true);
              }}
            />
          )}

          {/* Month View */}
          {viewMode === "month" && (
            <MonthView
              currentDate={currentDate}
              appointments={filteredAppointments}
              onDateClick={(clickedDate) => {
                setCurrentDate(clickedDate);
                setViewMode("day");
              }}
            />
          )}
        </div>
      )}

      {/* Add Appointment Modal */}
      {addModalOpen && (
        <AddAppointmentModal
          isOpen={addModalOpen}
          initialCustomerId={bookAgainCustomer?.id}
          initialCustomerName={bookAgainCustomer?.name}
          initialCustomerPhone={bookAgainCustomer?.phone}
          initialDate={toLocalDateString(currentDate)}
          onClose={() => setAddModalOpen(false)}
          onSuccess={() => {
            loadAppointments();
          }}
        />
      )}

      {/* Appointment Detail Modal */}
      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          isOpen={!!selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onUpdated={() => {
            loadAppointments();
          }}
          onBookAgain={handleBookAgainTrigger}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Day View Sub-Component
// ─────────────────────────────────────────────────────────────────────────────
function DayView({
  date,
  appointments,
  onAppointmentClick,
  onAddAppointment,
}: {
  date: Date;
  appointments: Appointment[];
  onAppointmentClick: (appt: Appointment) => void;
  onAddAppointment: () => void;
}) {
  const isToday = checkIsToday(date);

  const statusConfig = {
    scheduled: {
      label: "Scheduled",
      pillClass: "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]",
      dotClass: "bg-[#CCD2C8]",
    },
    confirmed: {
      label: "Confirmed",
      pillClass: "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]",
      dotClass: "bg-[#6F776D]",
    },
    completed: {
      label: "Completed",
      pillClass: "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30",
      dotClass: "bg-[#5F7A62]",
    },
    "no-show": {
      label: "No Show",
      pillClass: "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30",
      dotClass: "bg-[#B18A45]",
    },
    rescheduled: {
      label: "Rescheduled",
      pillClass: "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30",
      dotClass: "bg-[#B18A45]",
    },
    cancelled: {
      label: "Cancelled",
      pillClass: "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]",
      dotClass: "bg-[#B55B5B]",
    },
  };

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
        <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-3">
          <CalendarDays size={26} />
        </div>
        <h3 className="font-serif text-lg font-bold text-[#2F352F]">
          No appointments scheduled for {isToday ? "today" : format(date, "dd MMM yyyy")}
        </h3>
        <p className="text-xs text-[#747A72] mt-1 max-w-sm">
          Customer visit bookings for this date will appear here.
        </p>
        <button
          onClick={onAddAppointment}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
        >
          <Plus size={15} />
          + Add Appointment
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[#747A72]">
          {format(date, "EEEE — dd MMM yyyy")}
        </span>
        <span className="text-xs font-semibold text-[#6F776D]">
          {appointments.length} Appointment{appointments.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="divide-y divide-[#E0E4DD]">
        {appointments.map((appt) => {
          const cfg = statusConfig[appt.status] || statusConfig.scheduled;
          return (
            <div
              key={appt.id}
              onClick={() => onAppointmentClick(appt)}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-3 rounded-2xl transition hover:bg-[#F7F7F4] cursor-pointer"
            >
              {/* Left: Visit Time & Customer Info */}
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center justify-center w-18 h-12 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] shrink-0 group-hover:bg-[#E8ECE5] group-hover:border-[#CCD2C8] transition">
                  <span className="font-mono text-xs font-bold text-[#2F352F]">
                    {appt.startTime}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-[#747A72]">
                    Visit
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#2F352F] group-hover:text-[#6F776D] transition">
                      {appt.customerName || "Customer"}
                    </span>
                    {appt.customerPhone && (
                      <span className="text-[11px] text-[#747A72] flex items-center gap-1">
                        <Phone size={10} />
                        {appt.customerPhone}
                      </span>
                    )}
                  </div>
                  {appt.notes && (
                    <p className="text-xs text-[#747A72] mt-0.5 line-clamp-1 flex items-center gap-1">
                      <FileText size={11} className="text-[#6F776D] shrink-0" />
                      {appt.notes}
                    </p>
                  )}
                  {appt.status === "completed" && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                      {appt.completedInvoiceId ? (
                        <span className="font-semibold text-[#5F7A62] flex items-center gap-1">
                          <Receipt size={11} />
                          {appt.completedInvoiceNumber || "Billed"}
                          {appt.completedInvoiceAmount !== undefined && (
                            <span className="text-[#2F352F] font-bold">
                              • {formatCurrency(appt.completedInvoiceAmount)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[#747A72] italic text-[10px]">
                          Not Billed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Status Pill & Action button */}
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.pillClass}`}
                >
                  <span className={`size-1.5 rounded-full ${cfg.dotClass}`} />
                  {cfg.label}
                </span>

                <button
                  type="button"
                  className="h-8 px-3 rounded-lg border border-[#E0E4DD] bg-[#FFFFFF] text-xs font-semibold text-[#2F352F] group-hover:border-[#6F776D] group-hover:bg-[#E8ECE5] transition"
                >
                  View Details
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Week View Sub-Component (7 Columns: Mon – Sun)
// ─────────────────────────────────────────────────────────────────────────────
function WeekView({
  currentDate,
  appointments,
  onAppointmentClick,
  onDateClick,
  onAddAppointment,
}: {
  currentDate: Date;
  appointments: Appointment[];
  onAppointmentClick: (appt: Appointment) => void;
  onDateClick: (date: Date) => void;
  onAddAppointment: () => void;
}) {
  const start = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(start, i));

  const statusColors = {
    scheduled: "border-[#E0E4DD] bg-[#F7F7F4] text-[#2F352F]",
    confirmed: "border-[#CCD2C8] bg-[#E8ECE5] text-[#2F352F]",
    completed: "border-[#5F7A62]/30 bg-[#E8ECE5] text-[#5F7A62]",
    "no-show": "border-[#B18A45]/30 bg-[#FAF4E8] text-[#B18A45]",
    rescheduled: "border-[#B18A45]/30 bg-[#FAF4E8] text-[#B18A45]",
    cancelled: "border-[#F8D7D7] bg-[#FBEBEB] text-[#B55B5B] line-through opacity-70",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {weekDays.map((day) => {
        const dayKey = toLocalDateString(day);
        const dayAppointments = appointments
          .filter((a) => a.date === dayKey)
          .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        const isCurrentDay = checkIsToday(day);

        return (
          <div
            key={dayKey}
            className={`flex flex-col rounded-2xl border bg-[#FFFFFF] p-3 shadow-2xs transition min-h-[360px] ${
              isCurrentDay
                ? "border-[#6F776D] ring-1 ring-[#6F776D]"
                : "border-[#E0E4DD]"
            }`}
          >
            {/* Day Header */}
            <div
              onClick={() => onDateClick(day)}
              className="flex items-center justify-between pb-2 mb-2 border-b border-[#E0E4DD] cursor-pointer group"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] block">
                  {format(day, "EEE")}
                </span>
                <span className="font-serif text-sm font-bold text-[#2F352F] group-hover:text-[#6F776D]">
                  {format(day, "dd MMM")}
                </span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#F7F7F4] text-[#747A72]">
                {dayAppointments.length}
              </span>
            </div>

            {/* Appointments list for this day */}
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[420px] pr-0.5">
              {dayAppointments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-8 text-center text-[#CCD2C8]">
                  <span className="text-[11px] italic text-[#747A72]">No bookings</span>
                </div>
              ) : (
                dayAppointments.map((appt) => {
                  const colorClass = statusColors[appt.status] || statusColors.scheduled;
                  return (
                    <div
                      key={appt.id}
                      onClick={() => onAppointmentClick(appt)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer hover:shadow-xs text-xs ${colorClass}`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono font-bold mb-1">
                        <span>{appt.startTime}</span>
                        <span className="capitalize">{appt.status}</span>
                      </div>
                      <span className="font-bold text-[#2F352F] block truncate">
                        {appt.customerName || "Customer"}
                      </span>
                      {appt.notes && (
                        <span className="text-[10px] text-[#747A72] block truncate mt-0.5">
                          {appt.notes}
                        </span>
                      )}
                      {appt.status === "completed" && appt.completedInvoiceNumber && (
                        <span className="text-[9px] font-semibold text-[#5F7A62] block truncate mt-0.5">
                          {appt.completedInvoiceNumber}
                          {appt.completedInvoiceAmount !== undefined && ` • ${formatCurrency(appt.completedInvoiceAmount)}`}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Month View Sub-Component
// ─────────────────────────────────────────────────────────────────────────────
function MonthView({
  currentDate,
  appointments,
  onDateClick,
}: {
  currentDate: Date;
  appointments: Appointment[];
  onDateClick: (date: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Monday offset for leading blanks
  const firstDayOfWeek = monthStart.getDay();
  const leadingBlanks = (firstDayOfWeek + 6) % 7;

  // Map appointments count by dateKey
  const countMap = useMemo(() => {
    const map: Record<string, number> = {};
    appointments.forEach((a) => {
      if (a.date) {
        map[a.date] = (map[a.date] || 0) + 1;
      }
    });
    return map;
  }, [appointments]);

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs space-y-3">
      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-wider text-[#747A72]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Leading blanks */}
        {Array.from({ length: leadingBlanks }).map((_, idx) => (
          <div key={`blank-${idx}`} className="h-24 rounded-2xl bg-transparent opacity-0 pointer-events-none" />
        ))}

        {/* Days of current month */}
        {allDays.map((day) => {
          const dayKey = toLocalDateString(day);
          const count = countMap[dayKey] || 0;
          const isCurrentDay = checkIsToday(day);

          return (
            <div
              key={dayKey}
              onClick={() => onDateClick(day)}
              className={`h-24 rounded-2xl border p-2 flex flex-col justify-between transition cursor-pointer hover:border-[#6F776D] hover:bg-[#F7F7F4] ${
                isCurrentDay
                  ? "border-[#6F776D] bg-[#E8ECE5]/30 ring-1 ring-[#6F776D]"
                  : "border-[#E0E4DD] bg-[#FFFFFF]"
              }`}
            >
              <div className="flex justify-between items-center">
                <span
                  className={`text-xs font-bold ${
                    isCurrentDay ? "text-[#2F352F] font-extrabold" : "text-[#747A72]"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {isCurrentDay && (
                  <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-[#6F776D] text-white">
                    Today
                  </span>
                )}
              </div>

              {count > 0 ? (
                <div className="rounded-xl bg-[#E8ECE5] border border-[#CCD2C8] p-1.5 text-center">
                  <span className="text-[10px] font-bold text-[#2F352F] block">
                    {count} Booking{count !== 1 ? "s" : ""}
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-[#CCD2C8] text-center italic">
                  —
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
