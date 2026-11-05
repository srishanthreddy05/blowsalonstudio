import { NextResponse } from "next/server";
import {
  adminDb as db,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "@/lib/firebaseAdmin";
import type { WhatsAppCampaign } from "@/types/whatsapp";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const campaignSnap = await getDoc(campaignRef);

    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const campaign = campaignSnap.data() as WhatsAppCampaign;

    if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
      return NextResponse.json(
        { error: `Cannot cancel campaign in ${campaign.status} state.` },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // Mark Campaign as CANCELLED
    await updateDoc(campaignRef, {
      status: "CANCELLED",
      completedAt: nowIso,
      updatedAt: nowIso,
    });

    // Mark all PENDING recipients as EXCLUDED / Cancelled
    const q = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id),
      where("status", "==", "PENDING")
    );
    const recSnap = await getDocs(q);

    const BATCH_SIZE = 400;
    for (let i = 0; i < recSnap.docs.length; i += BATCH_SIZE) {
      const chunk = recSnap.docs.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.update(d.ref, {
          status: "EXCLUDED",
          errorMessage: "Campaign was cancelled before send",
          updatedAt: nowIso,
        });
      }
      await batch.commit();
    }

    // Mark all PENDING/RETRY_WAIT/PROCESSING queue jobs as CANCELLED
    try {
      const qJobs = query(
        collection(db, "whatsappCampaignJobs"),
        where("campaignId", "==", id)
      );
      const jobSnap = await getDocs(qJobs);
      const cancellableStatuses = new Set(["PENDING", "QUEUED", "RETRY_WAIT", "PROCESSING"]);
      for (let i = 0; i < jobSnap.docs.length; i += BATCH_SIZE) {
        const chunk = jobSnap.docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const d of chunk) {
          if (cancellableStatuses.has(d.data().status)) {
            batch.update(d.ref, {
              status: "CANCELLED",
              lastError: "Campaign was cancelled",
              updatedAt: nowIso,
            });
          }
        }
        await batch.commit();
      }
    } catch (jobErr) {
      console.warn("[Cancel Campaign] Error cancelling queue jobs:", jobErr);
    }

    return NextResponse.json({
      success: true,
      message: "Campaign cancelled successfully.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to cancel campaign";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
