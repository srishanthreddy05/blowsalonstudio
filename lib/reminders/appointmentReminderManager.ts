/**
 * BLOW SALON - Appointment Reminder Engine
 * 
 * Handles:
 * - 30-minute reminder triggers for today's active appointments
 * - IST (Indian Standard Time) calculations
 * - Single-trigger duplicate prevention (localStorage + Firestore + memory)
 * - Browser Notification API & Service Worker integration
 * - System notification sound & click-to-open appointment modal
 */

import type { Appointment } from "@/types/appointment";
import * as appointmentService from "@/services/appointments";

const STORAGE_KEY_PREFIX = "blow_salon_reminder_sent_";

/**
 * Returns current Date in Indian Standard Time (Asia/Kolkata, UTC+05:30)
 */
export function getNowIST(): Date {
  const istDateString = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
  });
  return new Date(istDateString);
}

/**
 * Returns today's date formatted as YYYY-MM-DD in IST
 */
export function getTodayISTDateString(): string {
  const ist = getNowIST();
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, "0");
  const dd = String(ist.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts a 24-hour time string ("17:00", "09:30") to 12-hour format ("5:00 PM", "9:30 AM")
 */
export function formatTime12Hour(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return timeStr;

  let hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return timeStr;

  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  hour = hour ? hour : 12; // 0 becomes 12
  const minuteStr = String(minute).padStart(2, "0");
  return `${hour}:${minuteStr} ${ampm}`;
}

/**
 * Generates unique key for the reminder to ensure strict duplicate prevention
 * and proper handling of rescheduled times.
 */
export function getReminderKey(appointmentId: string, date: string, startTime: string): string {
  return `${appointmentId}_${date}_${startTime}`;
}

/**
 * Checks if a reminder was already sent on this device
 */
export function wasReminderSentLocally(reminderKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${reminderKey}`) === "true";
  } catch {
    return false;
  }
}

/**
 * Marks reminder as sent locally
 */
export function markReminderSentLocally(reminderKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${reminderKey}`, "true");
  } catch (e) {
    console.warn("Failed to save reminder state to localStorage:", e);
  }
}

// In-memory set for the active tab session to prevent any immediate race conditions
const inMemorySentKeys = new Set<string>();

/**
 * Calculates remaining minutes until the appointment in IST.
 * Positive number = appointment is in the future.
 * Negative number = appointment has already started.
 */
export function getMinutesUntilAppointment(appt: Appointment): number | null {
  if (!appt.date || !appt.startTime) return null;

  try {
    const [year, month, day] = appt.date.split("-").map(Number);
    const [hour, minute] = appt.startTime.split(":").map(Number);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
      return null;
    }

    const nowIST = getNowIST();
    const apptIST = new Date(year, month - 1, day, hour, minute, 0, 0);

    const diffMs = apptIST.getTime() - nowIST.getTime();
    return diffMs / (1000 * 60);
  } catch {
    return null;
  }
}

/**
 * Checks whether an appointment is eligible for the 30-minute reminder
 */
export function isEligibleFor30MinReminder(appt: Appointment): boolean {
  // 1. Must have an ID and valid date & startTime
  if (!appt.id || !appt.date || !appt.startTime) return false;

  // 2. Ignore cancelled, completed, and no-show appointments
  if (
    appt.status === "cancelled" ||
    appt.status === "completed" ||
    appt.status === "no-show"
  ) {
    return false;
  }

  // 3. Must be scheduled for today in IST
  const todayIST = getTodayISTDateString();
  if (appt.date !== todayIST) return false;

  // 4. Duplicate prevention check
  const reminderKey = getReminderKey(appt.id, appt.date, appt.startTime);
  if (inMemorySentKeys.has(reminderKey)) return false;
  if (wasReminderSentLocally(reminderKey)) return false;
  if (appt.reminder30MinSentFor === `${appt.date}_${appt.startTime}`) return false;

  // 5. Check if appointment is approximately 30 minutes away
  // Window: trigger when between 28 and 30.5 minutes away
  // (or if the tab just opened and it's within 0-30 mins and not yet sent)
  const diffMinutes = getMinutesUntilAppointment(appt);
  if (diffMinutes === null) return false;

  // Trigger when 30 minutes away (or up to 30.5 min ahead down to 0 min if not yet notified)
  return diffMinutes <= 30.5 && diffMinutes >= 0;
}

/**
 * Triggers the browser/system notification for an appointment
 */
export async function triggerAppointmentReminder(appt: Appointment): Promise<boolean> {
  if (!appt.id) return false;

  const reminderKey = getReminderKey(appt.id, appt.date, appt.startTime);

  // Mark in-memory immediately to prevent duplicate triggers from simultaneous checks
  inMemorySentKeys.add(reminderKey);
  markReminderSentLocally(reminderKey);

  // Also update Firestore asynchronously so all tabs/devices know
  appointmentService.markReminderSent(appt.id, `${appt.date}_${appt.startTime}`).catch((err) => {
    console.warn("Failed to record reminder in Firestore:", err);
  });

  const customerName = appt.customerName?.trim() || "Customer";
  const formattedTime = formatTime12Hour(appt.startTime);
  const serviceName = appt.serviceName?.trim();

  // Notification content format specified:
  // Title: "🔔 BLOW SALON"
  // If service exists:
  // "Appointment in 30 minutes — Rahul Kumar
  // Haircut · 5:00 PM"
  // If no service:
  // "Appointment in 30 minutes — Rahul Kumar, 5:00 PM"
  const title = "🔔 BLOW SALON";
  const body = serviceName
    ? `Appointment in 30 minutes — ${customerName}\n${serviceName} · ${formattedTime}`
    : `Appointment in 30 minutes — ${customerName}, ${formattedTime}`;

  const targetUrl = `/appointments?id=${appt.id}`;

  try {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    if (Notification.permission !== "granted") {
      return false;
    }

    // Attempt via Service Worker first (ensures notification appears when tab is in background/minimized)
    let shownViaSw = false;
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.active) {
          await registration.showNotification(title, {
            body,
            icon: "/logoo.jpeg",
            badge: "/logoo.jpeg",
            tag: `blow-reminder-${reminderKey}`,
            data: {
              appointmentId: appt.id,
              url: targetUrl,
            },
            silent: false, // Use system notification sound
            requireInteraction: true,
          });
          shownViaSw = true;
        }
      } catch (swErr) {
        console.warn("Could not show notification via ServiceWorker, falling back to Notification API:", swErr);
      }
    }

    // Fallback to standard Notification constructor if service worker was not available
    if (!shownViaSw) {
      const notification = new Notification(title, {
        body,
        icon: "/logoo.jpeg",
        badge: "/logoo.jpeg",
        tag: `blow-reminder-${reminderKey}`,
        silent: false,
        requireInteraction: true,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        window.location.href = targetUrl;
      };
    }

    return true;
  } catch (error) {
    console.error("Error triggering appointment reminder notification:", error);
    return false;
  }
}

/**
 * Registers the background Service Worker for notifications
 */
export async function registerReminderServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (error) {
    console.warn("Failed to register Service Worker for reminders:", error);
    return null;
  }
}

/**
 * Requests Notification permission with user gesture
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await registerReminderServiceWorker();
    }
    return permission;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return "denied";
  }
}
