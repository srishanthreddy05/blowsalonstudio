"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarDays,
  Clock,
  Plus,
  ChevronRight,
  FileText,
  Phone,
  Receipt,
} from "lucide-react";
import type { Appointment } from "@/types/appointment";
import * as appointmentService from "@/services/appointments";
import { AddAppointmentModal } from "@/components/appointments/AddAppointmentModal";
import { AppointmentDetailModal } from "@/components/appointments/AppointmentDetailModal";
import { toLocalDateString } from "@/lib/utils/date";
import { formatCurrency } from "@/components/salon-dashboard/types";
import Link from "next/link";

interface TodayAppointmentsSectionProps {
  onOpenBilling?: (appointment: Appointment) => void;
}

export function TodayAppointmentsSection({
  onOpenBilling,
}: TodayAppointmentsSectionProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const todayStr = toLocalDateString(new Date());

  useEffect(() => {
    setLoading(true);
    const unsub = appointmentService.subscribeByDate(
      todayStr,
      (list) => {
        setAppointments(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load today's appointments for dashboard:", err);
        setAppointments([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [todayStr]);

  const summary = useMemo(() => {
    let scheduled = 0;
    let confirmed = 0;
    let completed = 0;
    let cancelled = 0;
    let noShow = 0;

    appointments.forEach((a) => {
      if (a.status === "scheduled") scheduled++;
      else if (a.status === "confirmed") confirmed++;
      else if (a.status === "completed") completed++;
      else if (a.status === "cancelled") cancelled++;
      else if (a.status === "no-show") noShow++;
    });

    return {
      total: appointments.length,
      scheduled,
      confirmed,
      completed,
      cancelled,
      noShow,
    };
  }, [appointments]);

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

  return (
    <section className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E0E4DD] bg-[#F7F7F4]/60 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-base font-bold text-[#2F352F]">
              Today&apos;s Appointments
            </h2>
            <span className="rounded-full bg-[#E8ECE5] border border-[#CCD2C8] px-2 py-0.5 text-[10px] font-bold text-[#2F352F]">
              {summary.total} Total
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[#747A72] mt-0.5">
            <span>{summary.scheduled} Scheduled</span>
            <span>•</span>
            <span>{summary.confirmed} Confirmed</span>
            <span>•</span>
            <span className="text-[#5F7A62] font-semibold">{summary.completed} Completed</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/appointments"
            className="inline-flex h-8 items-center gap-1 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3 text-xs font-semibold text-[#292D29] transition hover:border-[#6F776D] hover:bg-[#E8ECE5]"
          >
            <span>Calendar</span>
            <ChevronRight size={13} />
          </Link>
          <button
            onClick={() => setAddModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-3.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Appointment</span>
          </button>
        </div>
      </div>

      {/* List / Empty State */}
      {loading ? (
        <div className="flex h-36 items-center justify-center">
          <div className="size-7 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
        </div>
      ) : appointments.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-[#FFFFFF]">
          <div className="grid size-12 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-2.5">
            <CalendarDays size={22} />
          </div>
          <p className="text-sm font-semibold text-[#2F352F]">
            No appointments scheduled for today.
          </p>
          <p className="text-xs text-[#747A72] mt-0.5 max-w-sm">
            Book manual customer appointments and visit reminders for today.
          </p>
          <button
            onClick={() => setAddModalOpen(true)}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 text-xs font-bold text-white shadow-xs transition cursor-pointer"
          >
            <Plus size={14} />
            <span>+ Add Appointment</span>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[#E0E4DD] max-h-[380px] overflow-y-auto">
          {appointments.map((appt) => {
            const cfg = statusConfig[appt.status] || statusConfig.scheduled;
            return (
              <div
                key={appt.id}
                onClick={() => setSelectedAppointment(appt)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-[#F7F7F4] transition cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-center justify-center w-16 h-11 rounded-xl bg-[#F7F7F4] border border-[#E0E4DD] shrink-0 group-hover:bg-[#E8ECE5] transition">
                    <span className="font-mono text-xs font-bold text-[#2F352F]">
                      {appt.startTime}
                    </span>
                    <span className="text-[9px] uppercase text-[#747A72]">
                      Visit
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-[#2F352F] truncate group-hover:text-[#6F776D] transition">
                        {appt.customerName || "Customer"}
                      </span>
                      {appt.customerPhone && (
                        <span className="text-[10px] text-[#747A72] flex items-center gap-0.5 truncate">
                          <Phone size={9} />
                          {appt.customerPhone}
                        </span>
                      )}
                    </div>
                    {appt.notes && (
                      <p className="text-[11px] text-[#747A72] truncate mt-0.5 flex items-center gap-1">
                        <FileText size={10} className="shrink-0 text-[#6F776D]" />
                        {appt.notes}
                      </p>
                    )}
                    {appt.status === "completed" && (
                      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                        {appt.completedInvoiceId ? (
                          <span className="font-semibold text-[#5F7A62] flex items-center gap-1">
                            <Receipt size={10} />
                            {appt.completedInvoiceNumber || "Billed"}
                            {appt.completedInvoiceAmount !== undefined && (
                              <span className="text-[#2F352F] font-bold">
                                • {formatCurrency(appt.completedInvoiceAmount)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#747A72] italic">
                            Not Billed
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${cfg.pillClass}`}
                  >
                    <span className={`size-1 rounded-full ${cfg.dotClass}`} />
                    {cfg.label}
                  </span>

                  {appt.status === "completed" && !appt.completedInvoiceId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenBilling) {
                          onOpenBilling(appt);
                        } else {
                          const params = new URLSearchParams();
                          if (appt.customerId) params.set("customerId", appt.customerId);
                          if (appt.customerName) params.set("customerName", appt.customerName);
                          if (appt.customerPhone) params.set("customerPhone", appt.customerPhone);
                          if (appt.serviceId) params.set("serviceId", appt.serviceId);
                          if (appt.staffId) params.set("staffId", appt.staffId);
                          if (appt.id) params.set("appointmentId", appt.id);
                          window.location.href = `/billing?${params.toString()}`;
                        }
                      }}
                      className="h-7 px-2.5 rounded-lg bg-[#5F7A62] hover:bg-[#4E6450] text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Receipt size={11} />
                      Open Billing
                    </button>
                  )}

                  <button
                    type="button"
                    className="h-7 px-2.5 rounded-lg border border-[#E0E4DD] bg-[#FFFFFF] text-[11px] font-semibold text-[#292D29] group-hover:border-[#6F776D] group-hover:bg-[#E8ECE5] transition"
                  >
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {addModalOpen && (
        <AddAppointmentModal
          isOpen={addModalOpen}
          initialDate={todayStr}
          onClose={() => setAddModalOpen(false)}
          onSuccess={() => {
            setAddModalOpen(false);
          }}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          isOpen={!!selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onUpdated={() => {
            setSelectedAppointment(null);
          }}
          onOpenBilling={onOpenBilling}
        />
      )}
    </section>
  );
}
