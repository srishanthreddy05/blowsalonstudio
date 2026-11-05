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
  setDoc,
} from "@/lib/firebaseAdmin";
import type { WhatsAppCampaign, WhatsAppCampaignRecipient, WhatsAppCampaignJob } from "@/types/whatsapp";
import type { Customer } from "@/types/customer";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";
import { classifyRetryEligibility } from "@/lib/whatsapp/errorClassifier";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { syncCampaignStats } from "@/lib/whatsapp/queue/queueManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const CUSTOMERS_COLLECTION = "customers";
const QUEUE_JOBS_COLLECTION = "whatsappCampaignJobs";

/**
 * GET /api/whatsapp/campaigns/[id]/recover
 * Read-only analysis of historical campaign recovery eligibility.
 * Identifies retryable recipients while excluding delivered, read, and opted-out customers.
 * Does NOT modify any database records.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized campaign recovery access." }, { status: 401 });
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

    const campaign = { id: campaignSnap.id, ...campaignSnap.data() } as WhatsAppCampaign;

    // Fetch all recipients for this campaign
    const qRec = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id)
    );
    const recSnap = await getDocs(qRec);
    const recipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    // Fetch customers map to verify opt-out status
    const custSnap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
    const customerMap = new Map<string, Customer>();
    for (const d of custSnap.docs) {
      customerMap.set(d.id, { id: d.id, ...d.data() } as Customer);
    }

    let deliveredOrReadCount = 0;
    let optOutCount = 0;
    let invalidCount = 0;
    let transientEligibleCount = 0;

    const breakdown = {
      delivered_or_read: 0,
      opted_out: 0,
      invalid_number: 0,
      undeliverable_131026: 0,
      ecosystem_decline_131049: 0,
      transient_eligible: 0,
      rate_limit: 0,
      template_or_auth: 0,
    };

    const eligibleRecipientIds: string[] = [];

    for (const rec of recipients) {
      const status = (rec.status || "").toUpperCase();

      // 1. Strictly exclude delivered or read recipients
      if (status === "DELIVERED" || status === "READ") {
        deliveredOrReadCount++;
        breakdown.delivered_or_read++;
        continue;
      }

      // 1b. Strictly exclude AMBIGUOUS recipients from automated recovery (safety guard)
      if (status === "AMBIGUOUS" || rec.classification?.includes("AMBIGUOUS")) {
        (breakdown as any).ambiguous = ((breakdown as any).ambiguous || 0) + 1;
        continue;
      }

      // 2. Check customer opt-out
      const cust = rec.customerId ? customerMap.get(rec.customerId) : null;
      if (cust && cust.whatsappOptOut === true) {
        optOutCount++;
        breakdown.opted_out++;
        continue;
      }

      // 3. Classify failure
      const eligibility = classifyRetryEligibility(rec.errorMessage, rec.errorCode, 0, 10);
      if (eligibility.classification === "ECOSYSTEM_DECLINE") {
        breakdown.ecosystem_decline_131049++;
      } else if (eligibility.classification === "RECIPIENT_UNDELIVERABLE") {
        breakdown.undeliverable_131026++;
      } else if (eligibility.classification === "INVALID_RECIPIENT") {
        invalidCount++;
        breakdown.invalid_number++;
      } else if (eligibility.classification === "OPT_OUT") {
        optOutCount++;
        breakdown.opted_out++;
      } else if (eligibility.classification === "TEMPLATE_ERROR" || eligibility.classification === "AUTH_ERROR") {
        breakdown.template_or_auth++;
      } else if (
        eligibility.classification === "RATE_LIMIT" ||
        eligibility.classification === "THROUGHPUT_LIMIT" ||
        eligibility.classification === "PAIR_RATE_LIMIT" ||
        eligibility.classification === "APP_LEVEL_LIMIT"
      ) {
        breakdown.rate_limit++;
        transientEligibleCount++;
        eligibleRecipientIds.push(rec.id);
      } else if (eligibility.eligible) {
        transientEligibleCount++;
        breakdown.transient_eligible++;
        eligibleRecipientIds.push(rec.id);
      }
    }

    return NextResponse.json({
      campaignId: id,
      campaignName: campaign.name,
      totalRecipients: recipients.length,
      deliveredOrReadCount,
      optOutCount,
      invalidCount,
      eligibleForRecoveryCount: transientEligibleCount,
      eligibleRecipientIds,
      breakdown,
      requiresConfirmation: true,
      advice: "Historical campaign recovery requires explicit user action to requeue eligible failures. Permanent failures (131026, 131049) and delivered/read recipients are excluded.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error assessing historical recovery";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/campaigns/[id]/recover
 * Explicitly requeues eligible historical failures into the persistent queue.
 * Strictly requires body.confirm === true.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized campaign recovery access." }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    let body: { confirm?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Body optional
    }

    if (body.confirm !== true) {
      return NextResponse.json(
        {
          error:
            "Explicit user confirmation (confirm: true) is required to recover and requeue historical failures.",
        },
        { status: 400 }
      );
    }

    // Kill switch guard
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) return enabledCheck.response;

    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const campaignSnap = await getDoc(campaignRef);

    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const campaign = { id: campaignSnap.id, ...campaignSnap.data() } as WhatsAppCampaign;

    // Fetch all recipients for this campaign
    const qRec = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id)
    );
    const recSnap = await getDocs(qRec);
    const recipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    // Fetch customer opt-out data
    const custSnap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
    const customerMap = new Map<string, Customer>();
    for (const d of custSnap.docs) {
      customerMap.set(d.id, { id: d.id, ...d.data() } as Customer);
    }

    const nowIso = new Date().toISOString();
    let requeuedCount = 0;

    for (const rec of recipients) {
      const status = (rec.status || "").toUpperCase();

      // Exclude delivered, read, or ambiguous
      if (status === "DELIVERED" || status === "READ" || status === "AMBIGUOUS" || rec.classification?.includes("AMBIGUOUS")) {
        continue;
      }

      // Exclude opted-out customers
      const cust = rec.customerId ? customerMap.get(rec.customerId) : null;
      if (cust && cust.whatsappOptOut === true) {
        continue;
      }

      // Classify: strictly exclude permanent errors, 131049 ecosystem declines, and 131026 undeliverable
      const eligibility = classifyRetryEligibility(rec.errorMessage, rec.errorCode, 0, 10);
      if (!eligibility.eligible) {
        continue;
      }

      const jobId = `${id}_${rec.id}_recovery`;
      const jobRef = doc(db, QUEUE_JOBS_COLLECTION, jobId);

      // Preserve existing delivery attempts
      const priorAttempts = Array.isArray(rec.attempts) ? [...rec.attempts] : [];
      if (priorAttempts.length === 0 && rec.sentAt) {
        priorAttempts.push({
          attempt: 1,
          status: "FAILED",
          sentAt: rec.sentAt,
          errorMessage: rec.errorMessage || "Historical dispatch failure",
          errorCode: rec.errorCode || null,
          metaMessageId: rec.metaMessageId || null,
        });
      }

      const jobData: WhatsAppCampaignJob = {
        id: jobId,
        campaignId: id,
        recipientId: rec.id,
        customerId: rec.customerId || null,
        phoneNumber: rec.normalizedPhone || rec.phone,
        customerName: rec.customerName || "Customer",
        templateName: campaign.templateName,
        templateLanguage: campaign.templateLanguage,
        imageUrl: campaign.headerImageUrl || null,
        status: "PENDING",
        attemptCount: rec.retryCount || 1,
        attempts: rec.retryCount || 1,
        maxAttempts: 4,
        nextAttemptAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastAttemptAt: null,
        processingLeaseExpiresAt: null,
        workerId: null,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        whatsappMessageId: null,
        messageIds: rec.messageIds || (rec.metaMessageId ? [rec.metaMessageId] : []),
        lastError: null,
        metaErrorCode: null,
        metaErrorDetails: null,
        idempotencyKey: jobId,
      };

      await setDoc(jobRef, sanitizeFirestoreDoc(jobData), { merge: true });

      // Update recipient record to PENDING
      await updateDoc(
        doc(db, RECIPIENTS_COLLECTION, rec.id),
        sanitizeFirestoreDoc({
          status: "PENDING",
          attemptCount: rec.retryCount || 1,
          attempts: priorAttempts,
          updatedAt: nowIso,
        })
      );

      requeuedCount++;
    }

    if (requeuedCount > 0) {
      await updateDoc(
        campaignRef,
        sanitizeFirestoreDoc({
          status: "SENDING",
          updatedAt: nowIso,
        })
      );

      // Decoupled Architecture: Campaign status updated to SENDING and jobs enqueued.
      // Queue worker (scheduled exclusively by Cloudflare Cron) will process them.
      // Recover API does NOT call processQueueBatch().
      await syncCampaignStats(id);
    }

    return NextResponse.json({
      success: true,
      campaignId: id,
      requeuedCount,
      message: `Successfully recovered and enqueued ${requeuedCount} eligible recipients into persistent queue.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error executing historical recovery";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

