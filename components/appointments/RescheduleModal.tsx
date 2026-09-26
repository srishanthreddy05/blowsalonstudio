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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#18181b] border border-neutral-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800/80 bg-[#1f1f23]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Reschedule Appointment</h2>
              <p className="text-xs text-neutral-400">{appointment.customerName || "Customer"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleReschedule} className="p-6 space-y-4">
          {/* Current Booking Info */}
          <div className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-400">
              Current Visit Time
            </span>
            <div className="text-sm font-medium text-white flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-neutral-300">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                {appointment.date ? formatDisplayDate(appointment.date) : "N/A"}
              </span>
              <span className="text-neutral-600">•</span>
              <span className="flex items-center gap-1.5 text-amber-400 font-mono">
                <Clock className="w-3.5 h-3.5" />
                {appointment.startTime}
              </span>
            </div>
          </div>

          {/* New Date & Visit Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                New Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500/60 transition-colors [color-scheme:dark]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                New Visit Time <span className="text-rose-400">*</span>
              </label>
              <select
                value={newVisitTime}
                onChange={(e) => setNewVisitTime(e.target.value)}
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

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
              <span>Reschedule Reason</span>
              <span className="text-[11px] text-neutral-500 font-normal">Optional</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Customer requested evening slot, travel delay, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>

          {/* Actions */}
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
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors font-semibold disabled:opacity-50 shadow-lg shadow-amber-500/10 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
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
