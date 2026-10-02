"use client";

import { useState } from "react";
import { X, Calendar, Clock, RotateCcw } from "lucide-react";
import * as appointmentService from "@/services/appointments";
import type { Appointment } from "@/types/appointment";
import { toLocalDateString, formatDisplayDate } from "@/lib/utils/date";
import { toast } from "react-hot-toast";

interface RescheduleModalProps {
  appointment: Appointment;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAppointmentId: string) => void;
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

export function RescheduleModal({
  appointment,
  isOpen,
  onClose,
  onSuccess,
}: RescheduleModalProps) {
  const [newDate, setNewDate] = useState<string>(appointment.date || toLocalDateString(new Date()));
  const [newVisitTime, setNewVisitTime] = useState<string>(appointment.startTime || "10:00");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointment.id) return;

    if (!newDate) {
      toast.error("Please select a new date.");
      return;
    }

    if (!newVisitTime) {
      toast.error("Please select a new visit time.");
      return;
    }

    setSaving(true);
    try {
      const newId = await appointmentService.reschedule(
        appointment.id,
        newDate,
        newVisitTime,
        reason.trim() || undefined
      );

      toast.success("Appointment rescheduled successfully");
      onSuccess(newId);
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to reschedule appointment";
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#292D29]/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-2xl text-[#292D29] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#E0E4DD] bg-[#FFFFFF]">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#2F352F]">Reschedule Appointment</h2>
              <p className="text-xs text-[#747A72]">{appointment.customerName || "Customer"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleReschedule} className="p-6 space-y-4">
          {/* Current Booking Info */}
          <div className="p-3.5 rounded-2xl bg-[#F7F7F4] border border-[#E0E4DD] space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#747A72]">
              Current Visit Time
            </span>
            <div className="text-xs font-bold text-[#2F352F] flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[#2F352F]">
                <Calendar className="w-3.5 h-3.5 text-[#6F776D]" />
                {appointment.date ? formatDisplayDate(appointment.date) : "N/A"}
              </span>
              <span className="text-[#CCD2C8]">•</span>
              <span className="flex items-center gap-1.5 font-mono px-2 py-0.5 rounded-md bg-[#FFFFFF] border border-[#CCD2C8] text-[#2F352F]">
                <Clock className="w-3.5 h-3.5 text-[#6F776D]" />
                {appointment.startTime}
              </span>
            </div>
          </div>

          {/* New Date & Visit Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#747A72] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#6F776D]" />
                New Date <span className="text-[#B55B5B]">*</span>
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs font-medium text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#747A72] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#6F776D]" />
                New Visit Time <span className="text-[#B55B5B]">*</span>
              </label>
              <select
                value={newVisitTime}
                onChange={(e) => setNewVisitTime(e.target.value)}
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

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#747A72] flex items-center justify-between">
              <span>Reschedule Reason</span>
              <span className="text-[11px] text-[#747A72] font-normal">Optional</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Customer requested evening slot, travel delay, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl text-xs text-[#292D29] placeholder:text-[#747A72] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
            />
          </div>

          {/* Actions */}
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
              disabled={saving}
              className="h-10 px-5 text-xs font-bold text-white bg-[#6F776D] hover:bg-[#2F352F] rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                "Confirm Reschedule"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
