import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  addDoc,
} from "firebase/firestore";
import type { Appointment } from "@/types/appointment";

export const dynamic = "force-dynamic";

/**
 * Helper to get current Date in Indian Standard Time (Asia/Kolkata)
 */
function getISTDate(): Date {
  const istString = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
  });
  return new Date(istString);
}

/**
 * Returns today's date formatted as YYYY-MM-DD in IST
 */
function getTodayISTString(): string {
  const ist = getISTDate();
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, "0");
  const dd = String(ist.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts 24-hour time string ("17:00") to 12-hour format ("5:00 PM")
 */
function formatTime12Hour(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return timeStr;

  let hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return timeStr;

  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  hour = hour ? hour : 12;
  const minuteStr = String(minute).padStart(2, "0");
  return `${hour}:${minuteStr} ${ampm}`;
}

export async function GET() {
  return handleReminderCheck();
}

export async function POST() {
  return handleReminderCheck();
}

/**
 * Serverless reminder check handler:
 * 1. Finds today's upcoming appointments in IST
 * 2. Calculates time difference between now and appointment time
 * 3. Identifies appointments that are ~30 minutes away
 * 4. Records that the reminder was already sent to prevent duplicates
 * 5. Creates in-app system notification for salon operators
 */
async function handleReminderCheck() {
  try {
    const todayIST = getTodayISTString();
    const nowIST = getISTDate();

    // 1. Query today's appointments
    const q = query(
      collection(db, "appointments"),
      where("date", "==", todayIST)
    );
    const snap = await getDocs(q);

    const appointments: Appointment[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Appointment));

    const remindersTriggered: Array<{ id: string; customer: string; time: string }> = [];

    for (const appt of appointments) {
      if (!appt.id || !appt.startTime) continue;

      // 2. Ignore cancelled, completed, and no-show appointments
      if (
        appt.status === "cancelled" ||
        appt.status === "completed" ||
        appt.status === "no-show"
      ) {
        continue;
      }

      // 3. Calculate difference between now and appointment time in IST
      const [year, month, day] = todayIST.split("-").map(Number);
      const [hour, minute] = appt.startTime.split(":").map(Number);
      if (isNaN(hour) || isNaN(minute)) continue;

      const apptIST = new Date(year, month - 1, day, hour, minute, 0, 0);
      const diffMinutes = (apptIST.getTime() - nowIST.getTime()) / (1000 * 60);

      // Check duplicate prevention: key is `${appt.date}_${appt.startTime}`
      // This automatically respects rescheduled appointments because their time changes
      const reminderKey = `${appt.date}_${appt.startTime}`;
      if (appt.reminder30MinSentFor === reminderKey) {
        continue;
      }

      // Trigger if appointment is ~30 minutes away (or within 0 - 30.5 mins)
      if (diffMinutes <= 30.5 && diffMinutes >= 0) {
        // 4. Record that reminder was already sent in Firestore
        const apptRef = doc(db, "appointments", appt.id);
        await updateDoc(apptRef, {
          reminder30MinSent: true,
          reminder30MinSentFor: reminderKey,
          reminder30MinSentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // 5. Create system notification in Firestore
        const customerName = appt.customerName?.trim() || "Customer";
        const formattedTime = formatTime12Hour(appt.startTime);
        const serviceName = appt.serviceName?.trim();

        const message = serviceName
          ? `Appointment in 30 minutes — ${customerName}\n${serviceName} · ${formattedTime}`
          : `Appointment in 30 minutes — ${customerName}, ${formattedTime}`;

        await addDoc(collection(db, "notifications"), {
          title: "🔔 BLOW SALON",
          message,
          type: "alert",
          read: false,
          appointmentId: appt.id,
          createdAt: new Date().toISOString(),
        });

        remindersTriggered.push({
          id: appt.id,
          customer: customerName,
          time: formattedTime,
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: nowIST.toISOString(),
      todayIST,
      totalTodayAppointments: appointments.length,
      remindersTriggeredCount: remindersTriggered.length,
      remindersTriggered,
    });
  } catch (error: any) {
    console.error("Error in appointment reminder check route:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process reminders" },
      { status: 500 }
    );
  }
}
