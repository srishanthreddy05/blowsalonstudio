import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit as firestoreLimit, getDocs, doc, getDoc } from "firebase/firestore";
import type { WhatsAppInsightsData, WhatsAppMessageRecord } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_VERSION = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^v?/, "v");

export async function GET() {
  try {
    // 1. Fetch phone metadata from Meta Graph API
    let phoneQuality = "UNKNOWN";
    let messagingLimitTier = "TIER_250";

    const coexSnap = await getDoc(doc(db, "settings", "whatsapp_coexistence"));
    const coexData = coexSnap.exists() ? coexSnap.data() : null;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || coexData?.phoneNumberId?.trim();
    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();

    if (phoneNumberId && token) {
      try {
        const phoneUrl = `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(
          phoneNumberId
        )}?fields=quality_rating,messaging_limit_tier`;
        const pRes = await fetch(phoneUrl, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 0 },
        });
        if (pRes.ok) {
          const pJson = await pRes.json();
          phoneQuality = pJson.quality_rating || "UNKNOWN";
          messagingLimitTier = pJson.messaging_limit_tier || "TIER_250";
        }
      } catch (err) {
        console.warn("[Insights API] Phone metadata warning:", err);
      }
    }

    // 2. Fetch recent messages from Firestore to compute real delivery breakdown
    let recentMessages: WhatsAppMessageRecord[] = [];
    try {
      const q = query(
        collection(db, "whatsapp_messages"),
        orderBy("createdAt", "desc"),
        firestoreLimit(100)
      );
      const snap = await getDocs(q);
      recentMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WhatsAppMessageRecord));
    } catch {
      const snap = await getDocs(collection(db, "whatsapp_messages"));
      recentMessages = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WhatsAppMessageRecord))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .slice(0, 100);
    }

    // 3. Compute real metrics
    let sent = 0;
    let delivered = 0;
    let read = 0;
    let failed = 0;
    let latestWebhookTimestamp: string | null = null;

    for (const msg of recentMessages) {
      if (msg.status === "SENT") sent++;
      else if (msg.status === "DELIVERED") delivered++;
      else if (msg.status === "READ") read++;
      else if (msg.status === "FAILED") failed++;

      if (msg.deliveredAt && (!latestWebhookTimestamp || msg.deliveredAt > latestWebhookTimestamp)) {
        latestWebhookTimestamp = msg.deliveredAt;
      }
      if (msg.readAt && (!latestWebhookTimestamp || msg.readAt > latestWebhookTimestamp)) {
        latestWebhookTimestamp = msg.readAt;
      }
    }

    const totalCalculated = sent + delivered + read + failed;
    const deliveredRate = totalCalculated > 0 ? Math.round(((delivered + read) / totalCalculated) * 100) : 100;
    const readRate = totalCalculated > 0 ? Math.round((read / totalCalculated) * 100) : 0;
    const failedRate = totalCalculated > 0 ? Math.round((failed / totalCalculated) * 100) : 0;

    const recentEvents = recentMessages.slice(0, 8).map((m) => ({
      id: m.id || m.messageId || Math.random().toString(),
      recipient: m.customerName || m.phoneNumber || "Client",
      type: m.messageType || "OUTBOUND",
      status: m.status,
      timestamp: m.createdAt,
      error: m.errorMessage || null,
    }));

    const insights: WhatsAppInsightsData = {
      totalSent30d: totalCalculated,
      deliveredRate,
      readRate,
      failedRate,
      deliveryBreakdown: {
        sent,
        delivered,
        read,
        failed,
      },
      phoneQuality,
      messagingLimitTier,
      webhookStatus: latestWebhookTimestamp ? "HEALTHY" : "UNKNOWN",
      lastWebhookEvent: latestWebhookTimestamp,
      recentEvents,
      lastSync: new Date().toISOString(),
    };

    return NextResponse.json({ insights });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to load WhatsApp insights";
    console.error("[WhatsApp Insights API] Error:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
