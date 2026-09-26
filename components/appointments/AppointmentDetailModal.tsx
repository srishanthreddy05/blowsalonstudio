"use client";

import { useState } from "react";
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  CalendarClock,
  UserX,
  Ban,
  Receipt,
  RotateCcw,
  Trash2,
  AlertTriangle,
  FileText,
  Bell,
  Phone,
} from "lucide-react";
import type { Appointment, AppointmentStatus } from "@/types/appointment";
import * as appointmentService from "@/services/appointments";
import { RescheduleModal } from "./RescheduleModal";
import { formatDisplayDate } from "@/lib/utils/date";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

interface AppointmentDetailModalProps {
  appointment: Appointment;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onBookAgain?: (customer: { id: string; name: string; phone?: string }) => void;
  onOpenBilling?: (appointment: Appointment) => void;
}

export function AppointmentDetailModal({
  appointment,
  isOpen,
  onClose,
  onUpdated,
  onBookAgain,
  onOpenBilling,
}: AppointmentDetailModalProps) {
  const router = useRouter();
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  if (!isOpen) return null;

  const handleStatusChange = async (newStatus: AppointmentStatus, extraNotes?: string) => {
    if (!appointment.id) return;
    setActionLoading(true);
    try {
      let finalNotes = appointment.notes || "";
      if (extraNotes) {
        finalNotes = finalNotes ? `${finalNotes}\n[${extraNotes}]` : `[${extraNotes}]`;
      }
      await appointmentService.updateStatus(appointment.id, newStatus, { notes: finalNotes });
      toast.success(`Appointment marked as ${newStatus.toUpperCase()}`);
      onUpdated();
      onClose();
    } catch (error) {
      console.error("Failed to update appointment status:", error);
      toast.error("Failed to update appointment status.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!appointment.id) return;
    setActionLoading(true);
    try {
      const cancelNote = cancelReason.trim()
        ? `Cancelled: ${cancelReason.trim()}`
        : "Cancelled by salon staff";
      let finalNotes = appointment.notes || "";
      finalNotes = finalNotes ? `${finalNotes}\n[${cancelNote}]` : `[${cancelNote}]`;

      await appointmentService.updateStatus(appointment.id, "cancelled", { notes: finalNotes });
      toast.success("Appointment cancelled.");
      setCancelConfirmOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      console.error("Failed to cancel appointment:", error);
      toast.error("Failed to cancel appointment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!appointment.id) return;
    setActionLoading(true);
    try {
      await appointmentService.delete(appointment.id);
      toast.success("Appointment permanently deleted.");
      setDeleteConfirmOpen(false);
      onUpdated();
      onClose();
    } catch (error) {
      console.error("Failed to delete appointment:", error);
      toast.error("Failed to delete appointment.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenBillingClick = () => {
    if (onOpenBilling) {
      onOpenBilling(appointment);
      onClose();
    } else {
      const params = new URLSearchParams();
      if (appointment.customerId) params.set("customerId", appointment.customerId);
      if (appointment.customerName) params.set("customerName", appointment.customerName);
      if (appointment.customerPhone) params.set("customerMobile", appointment.customerPhone);
      if (appointment.id) params.set("appointmentId", appointment.id);
      router.push(`/billing?${params.toString()}`);
      onClose();
    }
  };

  const handleBookAgainClick = () => {
    if (onBookAgain && appointment.customerId) {
      onBookAgain({
        id: appointment.customerId,
        name: appointment.customerName || "Customer",
        phone: appointment.customerPhone,
      });
      onClose();
    }
  };

  const statusConfig = {
    scheduled: {
      label: "SCHEDULED",
      pillClass: "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]",
      dotClass: "bg-[#CCD2C8]",
    },
    confirmed: {
      label: "CONFIRMED",
      pillClass: "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]",
      dotClass: "bg-[#6F776D]",
    },
    completed: {
      label: "COMPLETED",
      pillClass: "bg-[#E8ECE5] text-[#5F7A62] border-[#5F7A62]/30",
      dotClass: "bg-[#5F7A62]",
    },
    "no-show": {
      label: "NO SHOW",
      pillClass: "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30",
      dotClass: "bg-[#B18A45]",
    },
    rescheduled: {
      label: "RESCHEDULED",
      pillClass: "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30",
      dotClass: "bg-[#B18A45]",
    },
    cancelled: {
      label: "CANCELLED",
      pillClass: "bg-[#FBEBEB] text-[#B55B5B] border-[#F8D7D7]",
      dotClass: "bg-[#B55B5B]",
    },
  };

  const config = statusConfig[appointment.status] || statusConfig.scheduled;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#292D29]/40 backdrop-blur-xs animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-[#E0E4DD]">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-[#E8ECE5] text-[#2F352F] font-serif font-bold text-lg border border-[#CCD2C8]">
                {(appointment.customerName || "C").charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                  {appointment.customerName || "Customer"}
                </h2>
                <div className="flex items-center gap-2 text-xs text-[#747A72] mt-0.5">
                  <span className="flex items-center gap-1">
                    <Phone size={11} />
                    {appointment.customerPhone || "No phone"}
                  </span>
                  <span>•</span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider border ${config.pillClass}`}
                  >
                    <span className={`size-1.5 rounded-full ${config.dotClass}`} />
                    {config.label}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid size-8 place-items-center rounded-xl border border-[#E0E4DD] text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body Content */}
          <div className="space-y-4 pt-4 text-xs">
            {/* Appointment Schedule Box */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] flex items-center gap-1">
                  <Calendar size={12} className="text-[#6F776D]" />
                  Date
                </span>
                <span className="font-bold text-[#2F352F] text-sm mt-1 block">
                  {appointment.date ? formatDisplayDate(appointment.date) : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] flex items-center gap-1">
                  <Clock size={12} className="text-[#6F776D]" />
                  Visit Time
                </span>
                <span className="font-bold text-[#2F352F] text-sm mt-1 block font-mono">
                  {appointment.startTime}
                </span>
              </div>
            </div>

            {/* Notes if available */}
            {appointment.notes && (
              <div className="p-3.5 rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#747A72] flex items-center gap-1">
                  <FileText size={12} className="text-[#6F776D]" />
                  Special Instructions / Notes
                </span>
                <p className="text-xs text-[#2F352F] whitespace-pre-line leading-relaxed">
                  {appointment.notes}
                </p>
              </div>
            )}

            {/* Reminder status */}
            {appointment.reminderEnabled && (
              <div className="flex items-center gap-2 text-[11px] text-[#747A72] px-1">
                <Bell size={13} className="text-[#6F776D]" />
                <span>
                  Reminder enabled{" "}
                  {appointment.reminderMinutesBefore
                    ? `(${appointment.reminderMinutesBefore} mins prior)`
                    : "(Appointment day)"}
                </span>
              </div>
            )}

            {/* Rescheduled From reference */}
            {appointment.rescheduledFromId && (
              <div className="p-2.5 rounded-xl bg-[#FAF4E8] border border-[#B18A45]/30 text-[#B18A45] text-[11px] font-medium flex items-center gap-2">
                <RotateCcw size={13} />
                <span>This appointment was rescheduled from a previous booking.</span>
              </div>
            )}

            {/* Action Buttons Section */}
            <div className="space-y-2 pt-3 border-t border-[#E0E4DD]">
              {/* If Scheduled */}
              {appointment.status === "scheduled" && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange("confirmed")}
                    className="h-10 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] text-white font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <CheckCircle2 size={15} />
                    Confirm Appointment
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange("completed")}
                    className="h-10 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <CheckCircle2 size={15} />
                    Mark Completed
                  </button>
                </div>
              )}

              {/* If Confirmed */}
              {appointment.status === "confirmed" && (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange("completed")}
                    className="h-10 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <CheckCircle2 size={15} />
                    Mark Completed & Ready for Billing
                  </button>
                </div>
              )}

              {/* If Completed */}
              {appointment.status === "completed" && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleOpenBillingClick}
                    className="w-full h-11 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer text-sm"
                  >
                    <Receipt size={17} />
                    Open Billing for Customer
                  </button>
                  {appointment.completedInvoiceId && (
                    <p className="text-[11px] text-center text-[#747A72]">
                      Linked to Invoice: <span className="font-mono font-bold text-[#2F352F]">{appointment.completedInvoiceId}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Secondary Action Row for Active Appointments */}
              {(appointment.status === "scheduled" || appointment.status === "confirmed") && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setRescheduleModalOpen(true)}
                    className="h-9 rounded-xl border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#F7F7F4] text-[#2F352F] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <CalendarClock size={14} className="text-[#6F776D]" />
                    Reschedule
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleStatusChange("no-show")}
                    className="h-9 rounded-xl border border-[#FAF4E8] bg-[#FAF4E8] hover:bg-[#F5ECD7] text-[#B18A45] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <UserX size={14} />
                    No Show
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setCancelConfirmOpen(true)}
                    className="h-9 rounded-xl border border-[#FBEBEB] bg-[#FBEBEB] hover:bg-[#F8D7D7] text-[#B55B5B] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <Ban size={14} />
                    Cancel
                  </button>
                </div>
              )}

              {/* Cancelled or No Show - Book Again button */}
              {(appointment.status === "cancelled" || appointment.status === "no-show" || appointment.status === "rescheduled") && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleBookAgainClick}
                    className="w-full h-10 rounded-xl bg-[#2F352F] hover:bg-[#1C201C] text-white font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <RotateCcw size={15} />
                    Book Again for this Customer
                  </button>
                </div>
              )}

              {/* Admin Cleanup / Permanent Delete link */}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="text-[11px] text-[#A2A89F] hover:text-[#B55B5B] underline transition cursor-pointer flex items-center gap-1"
                >
                  <Trash2 size={11} />
                  Delete accidental record
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reschedule Modal */}
      {rescheduleModalOpen && (
        <RescheduleModal
          appointment={appointment}
          isOpen={rescheduleModalOpen}
          onClose={() => setRescheduleModalOpen(false)}
          onSuccess={() => {
            setRescheduleModalOpen(false);
            onUpdated();
            onClose();
          }}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      {cancelConfirmOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setCancelConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-[#FBEBEB] text-[#B55B5B]">
                <Ban size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F352F]">Cancel this appointment?</h3>
                <p className="text-xs text-[#747A72]">Status will change to Cancelled.</p>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#747A72] block mb-1">
                Cancellation Reason (Optional)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Customer requested cancellation"
                className="w-full h-9 rounded-xl border border-[#CCD2C8] px-3 text-xs text-[#2F352F] outline-none focus:border-[#5F7A62]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                className="h-9 px-4 rounded-xl border border-[#CCD2C8] text-xs font-semibold hover:bg-[#F7F7F4] transition"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmCancel}
                className="h-9 px-4 rounded-xl bg-[#B55B5B] hover:bg-[#9B4848] text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                {actionLoading ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-[#FBEBEB] text-[#B55B5B]">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#2F352F]">Permanently delete?</h3>
                <p className="text-xs text-[#747A72]">This cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[#747A72] bg-[#F7F7F4] p-3 rounded-xl border border-[#E0E4DD]">
              Please only delete accidentally created appointments. For customer cancellations, use the <strong>Cancel</strong> action instead.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="h-9 px-4 rounded-xl border border-[#CCD2C8] text-xs font-semibold hover:bg-[#F7F7F4] transition"
              >
                Abort
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDelete}
                className="h-9 px-4 rounded-xl bg-[#B55B5B] hover:bg-[#9B4848] text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                {actionLoading ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
