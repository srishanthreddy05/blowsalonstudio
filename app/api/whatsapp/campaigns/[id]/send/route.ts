import { NextResponse } from "next/server";
import {
  adminDb as db,
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
} from "@/lib/firebaseAdmin";
import type {
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
} from "@/types/whatsapp";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import {
  createCampaignJobs,
} from "@/lib/whatsapp/queue/queueManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";

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

    // ── Master kill-switch ──────────────────────────────────────────────────
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) return enabledCheck.response;
    // ───────────────────────────────────────────────────────────────────────

    // 1. Atomically Claim/Lock Campaign to "SENDING" status to prevent duplicate start race condition
    const lockResult = await runTransaction(db, async (txn) => {
      const snap = await txn.get(campaignRef);
      if (!snap.exists()) {
        return { ok: false, error: "Campaign not found.", status: 404 };
      }
      const data = snap.data() as WhatsAppCampaign;
      if (data.status === "SENDING") {
        // Guard against duplicate start: campaign.status === "SENDING"
        return { ok: false, error: "Campaign is already in progress.", status: 400 };
      }
      if (data.status === "CANCELLED") {
        return { ok: false, error: "Cannot send a cancelled campaign.", status: 400 };
      }

      const nowIso = new Date().toISOString();
      txn.update(campaignRef, sanitizeFirestoreDoc({
        status: "SENDING",
        startedAt: data.startedAt || nowIso,
        errorMessage: null,
        updatedAt: nowIso,
      }));

      return { ok: true, campaign: { ...data, id: snap.id } as WhatsAppCampaign };
    });

    if (!lockResult.ok || !lockResult.campaign) {
      return NextResponse.json({ error: lockResult.error }, { status: lockResult.status || 400 });
    }

    const campaign = lockResult.campaign;

    // Verify template compliance and header image configuration
    const isBlowSalonCampaign = campaign.templateName === "blow_salon_campaign";
    const headerImageUrl = campaign.headerImageUrl || null;

    // 2. Check Provider Connection / Configuration
    const provider = getWhatsAppProvider();
    const providerStatus = await provider.getStatus();

    if (providerStatus.status !== "CONNECTED") {
      const errorMsg = providerStatus.errorMessage || "WhatsApp provider is not configured or connected.";
      await updateDoc(
        campaignRef,
        sanitizeFirestoreDoc({
          status: "FAILED",
          errorMessage: errorMsg,
          updatedAt: new Date().toISOString(),
        })
      );
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 400 }
      );
    }

    // 3. Fetch Pending Recipients for this campaign
    const q = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id),
      where("status", "==", "PENDING")
    );
    const recSnap = await getDocs(q);
    const recipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    if (recipients.length === 0) {
      await updateDoc(
        campaignRef,
        sanitizeFirestoreDoc({
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
        })
      );
      return NextResponse.json({
        success: true,
        message: "No pending recipients to send to.",
        campaign: { ...campaign, status: "COMPLETED" },
      });
    }

    // 4. Create Persistent Queue Jobs in Firestore (Before Processing Begins)
    await createCampaignJobs(campaign, recipients);

    // 5. Decoupled Architecture: Jobs seeded into whatsappCampaignJobs with status "PENDING".
    // Campaign status is locked to "SENDING". Central queue worker (scheduled exclusively by
    // Cloudflare Workers Cron) dispatches jobs sequentially. Start API does NOT call processQueueBatch().
    return NextResponse.json({
      success: true,
      message: "Campaign queued successfully for persistent background dispatch.",
      status: "SENDING",
      sentCount: campaign.sentCount || 0,
      deliveredCount: campaign.deliveredCount || 0,
      readCount: campaign.readCount || 0,
      failedCount: campaign.failedCount || 0,
      totalProcessed: recipients.length,
      totalRecipients: campaign.totalRecipients || recipients.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error executing campaign send";
    console.error("[Campaign Send API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
