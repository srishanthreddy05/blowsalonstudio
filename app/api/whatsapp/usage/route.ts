import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import type {
  WhatsAppMessageRecord,
  MonthlyUsageSummary,
  CategoryUsageMetric,
} from "@/types/whatsapp";
import {
  WHATSAPP_APPLICATION_RATES,
  getMessageCategory,
  calculateCategoryUsageCharge,
} from "@/lib/whatsapp/pricingConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";
const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Formats a Date or ISO string into YYYY-MM according to the salon timezone.
 */
function getYearMonthInTimezone(dateIso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const d = new Date(dateIso);
    if (isNaN(d.getTime())) return "";
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    });
    return formatter.format(d); // "YYYY-MM"
  } catch {
    return dateIso.slice(0, 7);
  }
}

/**
 * Returns human-readable label for "YYYY-MM" e.g. "October 2026"
 */
function getMonthLabel(yearMonth: string, timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const [yStr, mStr] = yearMonth.split("-");
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const d = new Date(Date.UTC(year, month, 15));
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return yearMonth;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timezone = searchParams.get("timezone") || DEFAULT_TIMEZONE;

    // Determine current month in salon timezone
    const now = new Date();
    const currentYearMonth = getYearMonthInTimezone(now.toISOString(), timezone);
    const selectedMonth = searchParams.get("month") || currentYearMonth;

    // Fetch all message records from Firestore
    const messagesSnap = await getDocs(collection(db, MESSAGES_COLLECTION));
    const allRecords: WhatsAppMessageRecord[] = messagesSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    } as WhatsAppMessageRecord));

    // Discover all distinct months present in records
    const distinctMonthsSet = new Set<string>();
    distinctMonthsSet.add(currentYearMonth);

    for (const msg of allRecords) {
      const ts = msg.sentAt || msg.createdAt;
      if (ts) {
        const ym = getYearMonthInTimezone(ts, timezone);
        if (ym && ym.match(/^\d{4}-\d{2}$/)) {
          distinctMonthsSet.add(ym);
        }
      }
    }

    const availableMonths = Array.from(distinctMonthsSet)
      .sort((a, b) => b.localeCompare(a))
      .map((ym) => ({
        value: ym,
        label: getMonthLabel(ym, timezone),
      }));

    // Filter messages for the selected month
    const monthRecords = allRecords.filter((msg) => {
      const ts = msg.sentAt || msg.createdAt;
      if (!ts) return false;
      const ym = getYearMonthInTimezone(ts, timezone);
      return ym === selectedMonth;
    });

    // Tracking structures for Utility vs Marketing
    const utilityMetric: CategoryUsageMetric = {
      messagesSent: 0,
      uniqueRecipients: 0,
      rate: WHATSAPP_APPLICATION_RATES.UTILITY,
      estimatedCharges: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
    };

    const marketingMetric: CategoryUsageMetric = {
      messagesSent: 0,
      uniqueRecipients: 0,
      rate: WHATSAPP_APPLICATION_RATES.MARKETING,
      estimatedCharges: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
    };

    const utilityRecipientsSet = new Set<string>();
    const marketingRecipientsSet = new Set<string>();
    const allRecipientsSet = new Set<string>();

    let totalAttempts = 0;

    for (const msg of monthRecords) {
      const status = (msg.status || "").toUpperCase();
      // Skip non-dispatches (e.g. invalid phone number not sent) from count of messages sent to WhatsApp
      if (status === "NOT_SENT" || status === "EXCLUDED") {
        continue;
      }

      totalAttempts++;

      const category = msg.category || getMessageCategory(msg.messageType, msg.templateName);
      const recipientKey = (msg.normalizedPhone || msg.phoneNumber || msg.recipientPhone || "").trim();
      const targetMetric = category === "UTILITY" ? utilityMetric : marketingMetric;
      const targetRecipients = category === "UTILITY" ? utilityRecipientsSet : marketingRecipientsSet;

      // Count sent message
      targetMetric.messagesSent++;
      if (recipientKey) {
        targetRecipients.add(recipientKey);
        allRecipientsSet.add(recipientKey);
      }

      // Track statuses
      if (status === "READ") {
        targetMetric.read++;
        targetMetric.delivered++;
      } else if (status === "DELIVERED") {
        targetMetric.delivered++;
      } else if (status === "FAILED") {
        targetMetric.failed++;
      } else if (status === "PENDING" || status === "SENDING") {
        targetMetric.pending++;
      }
    }

    utilityMetric.uniqueRecipients = utilityRecipientsSet.size;
    marketingMetric.uniqueRecipients = marketingRecipientsSet.size;

    utilityMetric.estimatedCharges = calculateCategoryUsageCharge(
      "UTILITY",
      utilityMetric.messagesSent
    );
    marketingMetric.estimatedCharges = calculateCategoryUsageCharge(
      "MARKETING",
      marketingMetric.messagesSent
    );

    const totalSent = utilityMetric.messagesSent + marketingMetric.messagesSent;
    const totalDelivered = utilityMetric.delivered + marketingMetric.delivered;
    const totalRead = utilityMetric.read + marketingMetric.read;
    const totalFailed = utilityMetric.failed + marketingMetric.failed;
    const totalPending = utilityMetric.pending + marketingMetric.pending;
    const totalCharges = Math.round((utilityMetric.estimatedCharges + marketingMetric.estimatedCharges) * 100) / 100;

    const summary: MonthlyUsageSummary = {
      month: selectedMonth,
      monthLabel: getMonthLabel(selectedMonth, timezone),
      timezone,
      totalMessagesSent: totalSent,
      totalUniqueRecipients: allRecipientsSet.size,
      totalAttempts,
      utilitySent: utilityMetric.messagesSent,
      marketingSent: marketingMetric.messagesSent,
      deliveredCount: totalDelivered,
      readCount: totalRead,
      failedCount: totalFailed,
      pendingCount: totalPending,
      estimatedCharges: {
        utilityRate: WHATSAPP_APPLICATION_RATES.UTILITY,
        marketingRate: WHATSAPP_APPLICATION_RATES.MARKETING,
        utilityCharges: utilityMetric.estimatedCharges,
        marketingCharges: marketingMetric.estimatedCharges,
        totalCharges,
      },
      breakdown: {
        utility: utilityMetric,
        marketing: marketingMetric,
      },
      availableMonths,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json({ usage: summary });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to calculate monthly WhatsApp usage";
    console.error("[WhatsApp Usage API] Error:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
