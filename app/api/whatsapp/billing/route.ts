import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import type { WhatsAppBillingInfo } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_VERSION = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^v?/, "v");

export async function GET() {
  try {
    const snap = await getDoc(doc(db, "settings", "whatsapp_coexistence"));
    if (!snap.exists()) {
      return NextResponse.json(
        { error: "WhatsApp Business App is not connected." },
        { status: 400 }
      );
    }

    const data = snap.data();
    if (data?.status !== "CONNECTED" || !data?.wabaId) {
      return NextResponse.json(
        { error: "WhatsApp Business App is disconnected or WABA ID is missing." },
        { status: 400 }
      );
    }

    const wabaId = String(data.wabaId).trim();
    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();

    let currency: string | null = null;
    let timezoneId: string | null = null;
    let accountReviewStatus: string | null = null;
    let paymentStatus: "ACTIVE" | "PENDING" | "RESTRICTED" | "UNKNOWN" = "UNKNOWN";

    if (token) {
      try {
        const wabaUrl = `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(
          wabaId
        )}?fields=id,name,currency,timezone_id,account_review_status`;

        const wRes = await fetch(wabaUrl, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 0 },
        });

        if (wRes.ok) {
          const wJson = await wRes.json();
          currency = wJson.currency || null;
          timezoneId = wJson.timezone_id || null;
          accountReviewStatus = wJson.account_review_status || null;

          if (wJson.account_review_status === "APPROVED") {
            paymentStatus = "ACTIVE";
          } else if (wJson.account_review_status === "PENDING") {
            paymentStatus = "PENDING";
          } else if (wJson.account_review_status === "RESTRICTED") {
            paymentStatus = "RESTRICTED";
          }
        }
      } catch (err) {
        console.warn("[Billing API] WABA fetch warning:", err);
      }
    }

    const directBillingUrl = `https://business.facebook.com/wa/manage/billing/?waba_id=${encodeURIComponent(
      wabaId
    )}`;

    const billingInfo: WhatsAppBillingInfo = {
      wabaId,
      currency: currency || "INR",
      timezoneId: timezoneId || "Asia/Kolkata",
      accountReviewStatus,
      paymentStatus,
      balanceAvailable: false,
      balance: null, // Explicitly NULL — never ₹0 when unavailable!
      balanceUnavailableReason:
        "Meta WhatsApp Cloud API does not expose a prepaid wallet balance or credit ledger endpoint via the Graph API. Payment methods, invoices, and credit lines are configured directly in Meta WhatsApp Manager.",
      directBillingUrl,
      lastSync: new Date().toISOString(),
    };

    return NextResponse.json({ billing: billingInfo });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to load WhatsApp billing info";
    console.error("[WhatsApp Billing API] Error:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
