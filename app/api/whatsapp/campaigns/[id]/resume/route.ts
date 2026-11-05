import { NextResponse } from "next/server";
import { adminDb as db, doc, getDoc, updateDoc } from "@/lib/firebaseAdmin";
import type { WhatsAppCampaign } from "@/types/whatsapp";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { processQueueBatch, syncCampaignStats } from "@/lib/whatsapp/queue/queueManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized campaign access." }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const campaignSnap = await getDoc(campaignRef);

    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const campaign = campaignSnap.data() as WhatsAppCampaign;

    if (campaign.status !== "PAUSED") {
      return NextResponse.json(
        { error: `Cannot resume campaign in "${campaign.status}" state. Only PAUSED campaigns can be resumed.` },
        { status: 400 }
      );
    }

    // Master kill-switch guard
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) return enabledCheck.response;

    const nowIso = new Date().toISOString();
    await updateDoc(
      campaignRef,
      sanitizeFirestoreDoc({
        status: "SENDING",
        isPaused: false,
        updatedAt: nowIso,
      })
    );

    // Trigger worker immediately to continue queue
    await processQueueBatch({
      maxJobs: 2,
      timeBudgetMs: 5000,
    });

    await syncCampaignStats(id);

    return NextResponse.json({
      success: true,
      message: "Campaign resumed successfully. Background dispatch has restarted.",
      status: "SENDING",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to resume campaign";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

