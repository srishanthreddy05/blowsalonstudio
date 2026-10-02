"use client";

import { useEffect, useRef } from "react";
import * as appointmentService from "@/services/appointments";
import type { Appointment } from "@/types/appointment";
import {
  getTodayISTDateString,
  isEligibleFor30MinReminder,
  triggerAppointmentReminder,
  registerReminderServiceWorker,
} from "@/lib/reminders/appointmentReminderManager";

/**
 * Headless component that monitors today's appointments in real-time
 * and triggers system/browser notifications exactly 30 minutes before appointment start time.
 * 
 * Renders null so it does not affect any visual UI, layout, or dashboard cards.
 */
export function AppointmentReminderManager() {
  const appointmentsRef = useRef<Appointment[]>([]);

  // Function to evaluate all appointments and fire reminders if 30 minutes away
  const checkReminders = () => {
    const list = appointmentsRef.current;
    if (!list || list.length === 0) return;

    for (const appt of list) {
      if (isEligibleFor30MinReminder(appt)) {
        triggerAppointmentReminder(appt);
      }
    }
  };

  useEffect(() => {
    // 1. Register Service Worker on client mount
    registerReminderServiceWorker();

    // 2. Real-time Firestore listener for today's appointments in IST
    const todayIST = getTodayISTDateString();
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = appointmentService.subscribeByDate(todayIST, (appts) => {
        appointmentsRef.current = appts;
        checkReminders();
      });
    } catch (err) {
      console.warn("Could not subscribe to today's appointments for reminders:", err);
      // Fallback: fetch once
      appointmentService.getByDate(todayIST).then((appts) => {
        appointmentsRef.current = appts;
        checkReminders();
      });
    }

    // 3. Periodic evaluation timer (runs every 15 seconds to catch 30-minute mark precisely)
    const intervalId = setInterval(() => {
      checkReminders();
    }, 15000);

    // 4. Also check whenever tab or window visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkReminders();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Purely background logic — no visual elements
  return null;
}
