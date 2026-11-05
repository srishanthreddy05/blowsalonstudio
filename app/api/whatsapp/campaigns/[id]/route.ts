import { NextResponse } from "next/server";
import {
  adminDb as db,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
} from "@/lib/firebaseAdmin";
import type { WhatsAppCampaign, WhatsAppCampaignRecipient, WhatsAppCampaignJob } from "@/types/whatsapp";
import { normalizeCampaignData } from "@/lib/utils/firestore";

import { calculateCampaignStats, applyStatsToCampaign } from "@/lib/whatsapp/campaignStats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    const docRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const initialCampaign = normalizeCampaignData(snap.data(), snap.id);

    // Fetch recipients for this campaign
    const q = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id)
    );
    const recSnap = await getDocs(q);
    const recipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    // Fetch live queue job breakdown for real-time monitoring and authoritative status reconciliation
    let pendingJobsCount = 0;
    let processingJobsCount = 0;
    let retryWaitJobsCount = 0;
    let acceptedJobsCount = 0;
    const jobsByRecipientId = new Map<string, WhatsAppCampaignJob>();

    const STATUS_RANK: Record<string, number> = {
      CANCELLED: 0,
      FAILED: 1,
      EXCLUDED: 1,
      NOT_SENT: 1,
      PENDING: 2,
      QUEUED: 2,
      RETRY_WAIT: 2,
      AMBIGUOUS: 2,
      PROCESSING: 3,
      ACCEPTED: 4,
      SENT: 5,
      DELIVERED: 6,
      READ: 7,
    };

    try {
      const qJobs = query(
        collection(db, "whatsappCampaignJobs"),
        where("campaignId", "==", id)
      );
      const jobSnap = await getDocs(qJobs);
      for (const d of jobSnap.docs) {
        const job = d.data() as WhatsAppCampaignJob;
        const recId = job.recipientId || (job.id.includes("_") ? job.id.split("_")[1] : null);
        if (recId) jobsByRecipientId.set(recId, job);

        const s = job.status;
        if (s === "PENDING" || s === "QUEUED") pendingJobsCount++;
        else if (s === "PROCESSING") processingJobsCount++;
        else if (s === "RETRY_WAIT") retryWaitJobsCount++;
        else if (s === "ACCEPTED") acceptedJobsCount++;
      }
    } catch {
      pendingJobsCount = recipients.filter((r) => r.status === "PENDING").length;
    }

    // Reconcile recipient statuses using authoritative queue jobs
    const reconciledRecs = recipients.map((r) => {
      const job = jobsByRecipientId.get(r.id);
      if (!job) return r;
      const recRank = STATUS_RANK[(r.status || "").toUpperCase()] || 0;
      const jobRank = STATUS_RANK[(job.status || "").toUpperCase()] || 0;
      if (jobRank > recRank) {
        return {
          ...r,
          status: job.status as any,
          deliveredAt: job.deliveredAt || r.deliveredAt,
          readAt: job.readAt || r.readAt,
        };
      }
      return r;
    });

    // Dynamically calculate accurate stats from the reconciled delivery records
    const stats = calculateCampaignStats(reconciledRecs);
    let campaign = applyStatsToCampaign(initialCampaign, stats);

    const { getCurrentSendDelayMs } = await import("@/lib/whatsapp/queue/throttleController");
    const currentDelayMs = getCurrentSendDelayMs();
    const remainingJobs = pendingJobsCount + processingJobsCount + retryWaitJobsCount;
    const estimatedCompletionMinutes = remainingJobs > 0
      ? Math.max(1, Math.ceil((remainingJobs * currentDelayMs) / 60000))
      : 0;

    campaign = {
      ...campaign,
      pendingCount: pendingJobsCount,
      processingCount: processingJobsCount,
      retryWaitingCount: retryWaitJobsCount,
      acceptedCount: acceptedJobsCount,
      currentDelayMs,
      estimatedCompletionMinutes,
      isPaused: campaign.status === "PAUSED",
    };

    return NextResponse.json({
      campaign,
      recipients,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load campaign details";
    console.error("[Campaign Details API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    // Delete Campaign Doc
    await deleteDoc(doc(db, CAMPAIGNS_COLLECTION, id));

    // Delete Recipient Docs
    const q = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id)
    );
    const recSnap = await getDocs(q);

    const BATCH_SIZE = 400;
    for (let i = 0; i < recSnap.docs.length; i += BATCH_SIZE) {
      const chunk = recSnap.docs.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }

    // Delete Queue Jobs
    try {
      const qJobs = query(
        collection(db, "whatsappCampaignJobs"),
        where("campaignId", "==", id)
      );
      const jobSnap = await getDocs(qJobs);
      for (let i = 0; i < jobSnap.docs.length; i += BATCH_SIZE) {
        const chunk = jobSnap.docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const d of chunk) {
          batch.delete(d.ref);
        }
        await batch.commit();
      }
    } catch {
      // Ignore if collection not yet created
    }

    return NextResponse.json({ success: true, message: "Campaign deleted successfully." });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete campaign";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
