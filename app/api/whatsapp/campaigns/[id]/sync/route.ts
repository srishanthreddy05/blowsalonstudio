import { NextResponse } from "next/server";
import { adminDb as db, doc, getDoc } from "@/lib/firebaseAdmin";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";
import { syncCampaignStats } from "@/lib/whatsapp/queue/queueManager";
import { normalizeCampaignData } from "@/lib/utils/firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";

/**
 * POST /api/whatsapp/campaigns/[id]/sync
 * Administrative endpoint to trigger authoritative queue job status reconciliation.
 *
 * Authentication Requirements:
 * - Bearer CRON_SECRET (Cloudflare scheduler or authorized runner), OR
 * - x-admin-key (Service Secret), OR
 * - Firebase ID Token of an authorized salon administrator.
 *
 * Safety Invariants:
 * - Strictly idempotent.
 * - Zero external Meta API calls or message dispatches.
 * - Never downgrades delivery status (e.g. READ cannot become DELIVERED or SENT).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized campaign synchronization access." },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const snap = await getDoc(campaignRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    // Perform authoritative reconciliation
    await syncCampaignStats(id);

    // Fetch updated document
    const updatedSnap = await getDoc(campaignRef);
    const campaign = normalizeCampaignData(updatedSnap.data() || {}, id);

    return NextResponse.json({
      success: true,
      message: `Campaign ${id} successfully reconciled with authoritative queue job statuses.`,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        sentCount: campaign.sentCount,
        deliveredCount: campaign.deliveredCount,
        readCount: campaign.readCount,
        failedCount: campaign.failedCount,
        excludedCount: campaign.excludedCount,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error reconciling campaign";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

