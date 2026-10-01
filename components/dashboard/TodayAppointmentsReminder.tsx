"use client";

import Link from "next/link";
import { Bell, ArrowRight } from "lucide-react";

interface TodayAppointmentsReminderProps {
  count: number;
}

export function TodayAppointmentsReminder({ count }: TodayAppointmentsReminderProps) {
  if (count <= 0) {
    return (
      <Link
        href="/appointments"
        id="today-appointments-header-reminder"
        className="group relative flex min-h-[48px] sm:h-[50px] items-center gap-3 rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 sm:px-5 shadow-2xs transition-all duration-200 hover:border-[#CCD2C8] hover:bg-[#F7F7F4] hover:shadow-xs cursor-pointer max-w-full"
        title="View appointments schedule"
      >
        <div className="relative flex items-center justify-center shrink-0">
          <Bell
            size={20}
            className="text-[#747A72] transition-colors duration-200 group-hover:text-[#2F352F]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm sm:text-[14.5px]">
          <span className="text-[#747A72] font-semibold tracking-tight">
            No Appointments Today
          </span>
          <span className="text-[#CCD2C8] font-light hidden xs:inline">•</span>
          <span className="inline-flex items-center gap-1 text-xs sm:text-[13px] font-semibold text-[#6F776D] transition-colors group-hover:text-[#2F352F]">
            <span>View Appointments</span>
            <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/appointments"
      id="today-appointments-header-reminder"
      className="group relative flex min-h-[48px] sm:h-[50px] items-center gap-3 rounded-2xl border border-[#CCD2C8] bg-[#FFFFFF] px-4 sm:px-5 shadow-2xs transition-all duration-300 hover:border-[#6F776D] hover:bg-[#F7F7F4] hover:shadow-xs animate-soft-pulse cursor-pointer max-w-full"
      title="View today's pending appointments"
    >
      {/* Soft pulsing bell indicator */}
      <div className="relative flex items-center justify-center shrink-0">
        <Bell
          size={21}
          className="text-[#6F776D] transition-transform duration-300 group-hover:scale-110 group-hover:text-[#2F352F]"
        />
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5F7A62] opacity-75 duration-1000" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#5F7A62]" />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm sm:text-[15px]">
        <span className="text-[#2F352F] tracking-tight">
          <span className="font-extrabold">{count}</span>{" "}
          <span className="font-bold">Today&apos;s Appointment{count > 1 ? "s" : ""}</span>
        </span>
        <span className="text-[#CCD2C8] font-light hidden xs:inline">•</span>
        <span className="inline-flex items-center gap-1 text-xs sm:text-[13.5px] font-semibold text-[#5F7A62] transition-colors group-hover:text-[#2F352F]">
          <span>View Appointments</span>
          <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
