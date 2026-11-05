import { NextResponse } from "next/server";
import {
  adminDb as db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from "@/lib/firebaseAdmin";
import type {
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppMessageRecord,
  WhatsAppDeliveryAttempt,
} from "@/types/whatsapp";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { calculateCampaignStats } from "@/lib/whatsapp/campaignStats";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { getTemplateLanguage } from "@/lib/whatsapp/templateRegistry";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";
import { classifyRetryEligibility } from "@/lib/whatsapp/errorClassifier";
import { WHATSAPP_APPLICATION_RATES } from "@/lib/whatsapp/pricingConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const MESSAGES_COLLECTION = "whatsapp_messages";
const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes default delay
const MAX_AUTOMATIC_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET /api/whatsapp/campaigns/[id]/retry
 * Evaluates retry eligibility for failed recipients without dispatching.
 * Used by the confirmation dialog to show eligible count and application usage charges.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized campaign retry access." }, { status: 401 });
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

    const campaign = { id: campaignSnap.id, ...campaignSnap.data() } as WhatsAppCampaign & {
      isRetrying?: boolean;
    };

    // Fetch all recipients for this campaign
    const q = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id)
    );
    const recSnap = await getDocs(q);
    const allRecipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    const confirmedFailed = allRecipients.filter((r) => (r.status || "").toUpperCase() === "FAILED");
    const nowMs = Date.now();

    let eligibleCount = 0;
    let coolingCount = 0;
    let maxCooldownRemainingMinutes = 0;

    const breakdown = {
      transient_eligible: 0,
      invalid_number: 0,
      customer_opt_out: 0,
      template_error: 0,
      auth_error: 0,
      rate_limit: 0,
      max_retries_exceeded: 0,
    };

    const evaluatedRecipients = confirmedFailed.map((rec) => {
      const retryCount = rec.retryCount || 0;
      const eligibility = classifyRetryEligibility(
        rec.errorMessage,
        rec.errorCode,
        retryCount,
        MAX_AUTOMATIC_RETRIES
      );

      const lastAttemptIso = rec.updatedAt || rec.sentAt || rec.createdAt;
      const lastAttemptMs = lastAttemptIso ? new Date(lastAttemptIso).getTime() : 0;
      const elapsedMs = nowMs - lastAttemptMs;
      const isCooling = elapsedMs < DEFAULT_RETRY_DELAY_MS;
      const coolingMinutesRemaining = isCooling
        ? Math.ceil((DEFAULT_RETRY_DELAY_MS - elapsedMs) / 60000)
        : 0;

      if (isCooling && eligibility.eligible) {
        coolingCount++;
        if (coolingMinutesRemaining > maxCooldownRemainingMinutes) {
          maxCooldownRemainingMinutes = coolingMinutesRemaining;
        }
      }

      if (eligibility.eligible) {
        eligibleCount++;
        if (eligibility.classification === "RATE_LIMIT") {
          breakdown.rate_limit++;
        } else {
          breakdown.transient_eligible++;
        }
      } else {
        if (eligibility.classification === "INVALID_RECIPIENT") breakdown.invalid_number++;
        else if (eligibility.classification === "OPT_OUT") breakdown.customer_opt_out++;
        else if (eligibility.classification === "TEMPLATE_ERROR") breakdown.template_error++;
        else if (eligibility.classification === "AUTH_ERROR") breakdown.auth_error++;
        else if (retryCount >= MAX_AUTOMATIC_RETRIES) breakdown.max_retries_exceeded++;
      }

      return {
        id: rec.id,
        customerName: rec.customerName,
        phone: rec.phone,
        retryCount,
        eligible: eligibility.eligible,
        classification: eligibility.classification,
        reason: eligibility.reason,
        actionAdvice: eligibility.actionAdvice,
        isCooling,
        coolingMinutesRemaining,
      };
    });

    const rate = WHATSAPP_APPLICATION_RATES.MARKETING;
    const estimatedCharge = Math.round(eligibleCount * rate * 100) / 100;

    return NextResponse.json({
      campaignId: id,
      campaignName: campaign.name,
      isCurrentlySending: campaign.status === "SENDING" || campaign.isRetrying === true,
      totalFailed: confirmedFailed.length,
      retryEligibleCount: eligibleCount,
      nonRetryableCount: confirmedFailed.length - eligibleCount,
      coolingCount,
      maxCooldownRemainingMinutes,
      defaultDelayMinutes: 5,
      rate,
      estimatedCharge,
      breakdown,
      recipients: evaluatedRecipients,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error assessing retry eligibility";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/campaigns/[id]/retry
 * Dispatches safe retry to eligible failed recipients with locking and rate limiting.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
  }

  const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);

  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized campaign retry access." }, { status: 401 });
    }

    let body: { bypassDelay?: boolean; manualRecipientId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    const campaignSnap = await getDoc(campaignRef);
    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const campaign = { id: campaignSnap.id, ...campaignSnap.data() } as WhatsAppCampaign & {
      isRetrying?: boolean;
    };

    // 1. Concurrency Safeguard: Prevent parallel retry or send jobs
    if (campaign.status === "SENDING" || campaign.isRetrying === true) {
      return NextResponse.json(
        {
          error:
            "This campaign is already currently dispatching messages or running a retry job. Please wait for it to finish.",
        },
        { status: 400 }
      );
    }

    // 2. Master Kill-Switch Check
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) {
      return enabledCheck.response;
    }

    // 3. Fetch ONLY currently failed recipients for this campaign
    const qFailed = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id),
      where("status", "==", "FAILED")
    );
    const recSnap = await getDocs(qFailed);
    const failedRecipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    if (failedRecipients.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No failed recipients found to retry for this campaign.",
        retriedSuccessCount: 0,
        retriedFailedCount: 0,
      });
    }

    // 4. Filter Eligible Recipients
    const nowMs = Date.now();
    const eligibleRecipients: WhatsAppCampaignRecipient[] = [];
    const skippedDetails: Array<{ id: string; name: string; phone: string; reason: string }> = [];

    for (const rec of failedRecipients) {
      // If manual target specified, allow it specifically
      if (body.manualRecipientId && rec.id !== body.manualRecipientId) {
        continue;
      }

      const retryCount = rec.retryCount || 0;
      const eligibility = classifyRetryEligibility(
        rec.errorMessage,
        rec.errorCode,
        retryCount,
        body.manualRecipientId ? 10 : MAX_AUTOMATIC_RETRIES
      );

      if (!eligibility.eligible && !body.manualRecipientId) {
        skippedDetails.push({
          id: rec.id,
          name: rec.customerName,
          phone: rec.phone,
          reason: eligibility.reason,
        });
        continue;
      }

      // 5-minute cooldown check (unless bypassDelay requested)
      const lastAttemptIso = rec.updatedAt || rec.sentAt || rec.createdAt;
      const lastAttemptMs = lastAttemptIso ? new Date(lastAttemptIso).getTime() : 0;
      const elapsedMs = nowMs - lastAttemptMs;

      if (!body.bypassDelay && elapsedMs < DEFAULT_RETRY_DELAY_MS) {
        const remainingMinutes = Math.ceil((DEFAULT_RETRY_DELAY_MS - elapsedMs) / 60000);
        skippedDetails.push({
          id: rec.id,
          name: rec.customerName,
          phone: rec.phone,
          reason: `Cooling delay active. Please wait ${remainingMinutes} more minute(s) before retrying.`,
        });
        continue;
      }

      eligibleRecipients.push(rec);
    }

    if (eligibleRecipients.length === 0) {
      return NextResponse.json({
        success: false,
        error:
          skippedDetails.length > 0
            ? `No eligible recipients ready for retry: ${skippedDetails[0].reason}`
            : "No failed recipients met retry criteria.",
        skippedDetails,
      }, { status: 400 });
    }

    // 5. Verify Meta WhatsApp Provider Connection
    const provider = getWhatsAppProvider();
    const providerStatus = await provider.getStatus();
    if (providerStatus.status !== "CONNECTED") {
      return NextResponse.json(
        { error: providerStatus.errorMessage || "WhatsApp provider is not connected." },
        { status: 400 }
      );
    }

    // 6. Acquire Retry Lock on Campaign
    await updateDoc(
      campaignRef,
      sanitizeFirestoreDoc({
        isRetrying: true,
        status: "SENDING",
        updatedAt: new Date().toISOString(),
      })
    );

    let retriedSuccessCount = 0;
    let retriedFailedCount = 0;

    try {
      // 7. Enqueue Eligible Failed Recipients into Persistent Queue
      const nowIso = new Date().toISOString();
      for (const rec of eligibleRecipients) {
        const jobId = `${id}_${rec.id}`;
        const jobRef = doc(db, "whatsappCampaignJobs", jobId);

        // Build template parameters dynamically
        let components: Array<Record<string, unknown>> | undefined = undefined;
        if (campaign.templateName === "blow_salon_campaign") {
          const customerName = (rec.customerName || "Customer").trim();
          const campaignContent = (
            campaign.templateVariables?.["2"] ||
            campaign.templateVariables?.["content"] ||
            campaign.templateVariables?.["message"] ||
            "Welcome to BLOW SALON"
          ).trim();

          components = [
            {
              type: "body",
              parameters: [
                { type: "text", text: customerName },
                { type: "text", text: campaignContent },
              ],
            },
          ];
        } else {
          const bodyParameters: Array<{ type: string; text: string }> = [];
          const varKeys = Object.keys(campaign.templateVariables || {}).sort(
            (a, b) => Number(a) - Number(b)
          );

          for (const k of varKeys) {
            const varTypeOrVal = (campaign.templateVariables[k] ?? "").toString().trim();
            let resolvedText = varTypeOrVal;

            if (varTypeOrVal === "customer_name" || varTypeOrVal === "{{customer_name}}") {
              resolvedText = (rec.customerName || "Customer").trim();
            } else if (varTypeOrVal === "salon_name" || varTypeOrVal === "{{salon_name}}") {
              resolvedText = "BLOW SALON";
            }

            if (resolvedText) {
              bodyParameters.push({
                type: "text",
                text: resolvedText,
              });
            }
          }

          if (bodyParameters.length > 0) {
            components = [{ type: "body", parameters: bodyParameters }];
          }
        }

        const priorAttempts = Array.isArray(rec.attempts) ? [...rec.attempts] : [];
        if (priorAttempts.length === 0) {
          priorAttempts.push({
            attempt: 1,
            status: "FAILED",
            sentAt: rec.sentAt || rec.createdAt,
            errorMessage: rec.errorMessage || "Initial delivery failure",
            errorCode: rec.errorCode || null,
            metaMessageId: rec.metaMessageId || null,
          });
        }

        // Set persistent queue job
        await setDoc(
          jobRef,
          sanitizeFirestoreDoc({
            id: jobId,
            campaignId: id,
            recipientId: rec.id,
            customerId: rec.customerId || null,
            phoneNumber: rec.normalizedPhone || rec.phone,
            customerName: rec.customerName || "Customer",
            templateName: campaign.templateName,
            templateLanguage: campaign.templateLanguage,
            templateParameters: components,
            imageUrl: campaign.headerImageUrl || null,
            status: "PENDING",
            attemptCount: rec.retryCount || 1,
            attempts: rec.retryCount || 1,
            maxAttempts: 4,
            nextAttemptAt: nowIso,
            createdAt: rec.createdAt || nowIso,
            updatedAt: nowIso,
            lastError: null,
            metaErrorCode: null,
            metaErrorDetails: null,
            whatsappMessageId: null,
            messageIds: rec.messageIds || (rec.metaMessageId ? [rec.metaMessageId] : []),
            idempotencyKey: jobId,
          }),
          { merge: true }
        );

        // Update recipient to PENDING
        await updateDoc(
          doc(db, RECIPIENTS_COLLECTION, rec.id),
          sanitizeFirestoreDoc({
            status: "PENDING",
            attemptCount: rec.retryCount || 1,
            retryCount: rec.retryCount || 1,
            attempts: priorAttempts,
            updatedAt: nowIso,
          })
        );
      }

      // Trigger queue worker for immediate execution of first batch
      const { processQueueBatch } = await import("@/lib/whatsapp/queue/queueManager");
      const workerRes = await processQueueBatch({
        maxJobs: 2,
        timeBudgetMs: 5000,
      });

      retriedSuccessCount = workerRes.acceptedCount;
      retriedFailedCount = workerRes.failedCount;
    } finally {
      // 8. Always release lock and recalculate campaign statistics
      const allRecSnap = await getDocs(
        query(collection(db, RECIPIENTS_COLLECTION), where("campaignId", "==", id))
      );
      const allRecs = allRecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const stats = calculateCampaignStats(allRecs);

      const nowIso = new Date().toISOString();
      await updateDoc(
        campaignRef,
        sanitizeFirestoreDoc({
          isRetrying: false,
          lastRetryAt: nowIso,
          totalRecipients: stats.totalRecipients,
          sentCount: stats.sentCount,
          deliveredCount: stats.deliveredCount,
          readCount: stats.readCount,
          failedCount: stats.failedCount,
          excludedCount: stats.excludedCount,
          status: stats.status || (stats.failedCount === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS"),
          updatedAt: nowIso,
        })
      );
    }

    const applicationCharges = Math.round(retriedSuccessCount * WHATSAPP_APPLICATION_RATES.MARKETING * 100) / 100;

    return NextResponse.json({
      success: true,
      message: `Retried ${eligibleRecipients.length} recipient(s): ${retriedSuccessCount} accepted, ${retriedFailedCount} failed.`,
      retriedCount: eligibleRecipients.length,
      retriedSuccessCount,
      retriedFailedCount,
      skippedCount: skippedDetails.length,
      skippedDetails,
      applicationCharges,
    });
  } catch (error: unknown) {
    // Release lock in error eventuality
    try {
      await updateDoc(
        campaignRef,
        sanitizeFirestoreDoc({
          isRetrying: false,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Ignore fallback unlock error
    }

    const msg = error instanceof Error ? error.message : "Failed to retry campaign recipients";
    console.error("[Campaign Retry API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
