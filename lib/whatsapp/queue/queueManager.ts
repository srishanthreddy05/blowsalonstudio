import {
  adminDb as db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  addDoc,
} from "@/lib/firebaseAdmin";
import type {
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppCampaignJob,
  WhatsAppQueueJobStatus,
  WhatsAppMessageRecord,
  WhatsAppDeliveryAttempt,
} from "@/types/whatsapp";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { getTemplateLanguage } from "@/lib/whatsapp/templateRegistry";
import { calculateCampaignStats } from "@/lib/whatsapp/campaignStats";
import { classifyRetryEligibility } from "@/lib/whatsapp/errorClassifier";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import {
  getQueueConfig,
  getCurrentSendDelayMs,
  getQueueCoolingStatus,
  recordThrottleSuccess,
  recordThrottleRateLimit,
  calculateNextAttemptAt,
} from "./throttleController";
import { checkConversationBudget } from "./conversationTracker";
import { canTransitionStatus } from "@/lib/whatsapp/statusTransitions";

export const QUEUE_JOBS_COLLECTION = "whatsappCampaignJobs";
export const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
export const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
export const MESSAGES_COLLECTION = "whatsapp_messages";
export const CUSTOMERS_COLLECTION = "customers";

export const STATUS_RANK: Record<string, number> = {
  CANCELLED: 0,
  FAILED: 1,
  EXCLUDED: 1,
  NOT_SENT: 1,
  PENDING: 2,
  RETRY_WAIT: 2,
  AMBIGUOUS: 2,
  PROCESSING: 3,
  ACCEPTED: 4,
  SENT: 5,
  DELIVERED: 6,
  READ: 7,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Creates persistent queue jobs for all eligible recipients of a campaign.
 * Uses deterministic document IDs (${campaignId}_${recipientId}) as an idempotency safeguard.
 */
export async function createCampaignJobs(
  campaign: WhatsAppCampaign,
  recipients: WhatsAppCampaignRecipient[]
): Promise<{ createdCount: number; skippedCount: number }> {
  const nowIso = new Date().toISOString();
  const eligibleRecipients = recipients.filter(
    (r) => (r.status || "").toUpperCase() === "PENDING"
  );

  let createdCount = 0;
  let skippedCount = 0;

  const BATCH_SIZE = 400;
  for (let i = 0; i < eligibleRecipients.length; i += BATCH_SIZE) {
    const chunk = eligibleRecipients.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    for (const rec of chunk) {
      const jobId = `${campaign.id}_${rec.id}`;
      const jobRef = doc(db, QUEUE_JOBS_COLLECTION, jobId);

      // Template parameters built dynamically
      let templateParameters: Array<Record<string, unknown>> | undefined = undefined;
      if (campaign.templateName === "blow_salon_campaign") {
        const customerName = (rec.customerName || "Customer").trim();
        const campaignContent = (
          campaign.templateVariables?.["2"] ||
          campaign.templateVariables?.["content"] ||
          campaign.templateVariables?.["message"] ||
          "Welcome to BLOW SALON"
        ).trim();

        templateParameters = [
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
            bodyParameters.push({ type: "text", text: resolvedText });
          }
        }

        if (bodyParameters.length > 0) {
          templateParameters = [{ type: "body", parameters: bodyParameters }];
        }
      }

      const jobData: WhatsAppCampaignJob = {
        id: jobId,
        campaignId: campaign.id,
        recipientId: rec.id,
        customerId: rec.customerId || null,
        phoneNumber: rec.normalizedPhone || rec.phone,
        customerName: rec.customerName || "Customer",
        templateName: campaign.templateName,
        templateLanguage: campaign.templateLanguage,
        templateParameters,
        imageUrl: campaign.headerImageUrl || null,
        status: "PENDING",
        attemptCount: 0,
        attempts: 0,
        maxAttempts: 4, // 1 initial + up to 3 retries
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
        messageIds: [],
        lastError: null,
        metaErrorCode: null,
        metaErrorDetails: null,
        httpStatus: null,
        fbtraceId: null,
        classification: null,
        isAmbiguous: false,
        idempotencyKey: jobId,
      };

      batch.set(jobRef, sanitizeFirestoreDoc(jobData), { merge: true });
      createdCount++;
    }

    await batch.commit();
  }

  return { createdCount, skippedCount };
}

/**
 * Atomically claims the next due job using a Firestore transaction.
 * Safe against worker concurrency and crashed worker recovery.
 */
export async function claimNextDueJob(workerId: string): Promise<WhatsAppCampaignJob | null> {
  const nowIso = new Date().toISOString();
  const leaseDurationMs = 2 * 60 * 1000; // 2-minute processing lease
  const leaseExpiryIso = new Date(Date.now() + leaseDurationMs).toISOString();

  // 1. Find candidate due jobs: PENDING or RETRY_WAIT due for dispatch
  let candidateDocs: any[] = [];

  try {
    const qDue = query(
      collection(db, QUEUE_JOBS_COLLECTION),
      where("status", "in", ["PENDING", "RETRY_WAIT", "QUEUED"]),
      where("nextAttemptAt", "<=", nowIso),
      orderBy("nextAttemptAt", "asc"),
      limit(5)
    );
    const snap = await getDocs(qDue);
    candidateDocs = snap.docs;
  } catch (err) {
    // Fallback query if composite index is still building
    try {
      const qFallback = query(
        collection(db, QUEUE_JOBS_COLLECTION),
        where("status", "in", ["PENDING", "RETRY_WAIT", "QUEUED"]),
        limit(20)
      );
      const snapFallback = await getDocs(qFallback);
      candidateDocs = snapFallback.docs
        .filter((d) => (d.data().nextAttemptAt || "") <= nowIso)
        .sort((a, b) => (a.data().nextAttemptAt || "").localeCompare(b.data().nextAttemptAt || ""))
        .slice(0, 5);
    } catch {
      candidateDocs = [];
    }
  }

  // 2. Also check for expired/abandoned PROCESSING leases (crashed worker recovery)
  if (candidateDocs.length === 0) {
    try {
      const qExpired = query(
        collection(db, QUEUE_JOBS_COLLECTION),
        where("status", "==", "PROCESSING"),
        where("processingLeaseExpiresAt", "<=", nowIso),
        limit(5)
      );
      const snapExpired = await getDocs(qExpired);
      candidateDocs = snapExpired.docs;
    } catch {
      // Ignore if index missing
    }
  }

  if (candidateDocs.length === 0) {
    return null;
  }

  // 3. Atomically claim first available candidate doc using Firestore transaction
  for (const candDoc of candidateDocs) {
    const candRef = doc(db, QUEUE_JOBS_COLLECTION, candDoc.id);

    try {
      const claimedJob = await runTransaction(db, async (txn) => {
        const freshSnap = await txn.get(candRef);
        if (!freshSnap.exists()) return null;

        const data = freshSnap.data() as WhatsAppCampaignJob;
        const currentStatus = data.status;

        const isDuePending = (currentStatus === "PENDING" || currentStatus === "RETRY_WAIT" || currentStatus === "QUEUED") &&
          (data.nextAttemptAt <= nowIso);
        const isExpiredLease = currentStatus === "PROCESSING" &&
          Boolean(data.processingLeaseExpiresAt && data.processingLeaseExpiresAt <= nowIso);

        if (!isDuePending && !isExpiredLease) {
          // Already claimed by another worker
          return null;
        }

        // Concurrency safeguard & crash-recovery for expired leases
        if (isExpiredLease) {
          if (data.whatsappMessageId) {
            // Already has a wamid - never re-dispatch
            txn.update(candRef, sanitizeFirestoreDoc({
              status: "ACCEPTED",
              processingLeaseExpiresAt: null,
              updatedAt: nowIso,
            }));
            return null;
          }
          if (data.isAmbiguous || data.status === "AMBIGUOUS") {
            // Ambiguous dispatch awaiting webhook reconciliation
            txn.update(candRef, sanitizeFirestoreDoc({
              status: "AMBIGUOUS",
              processingLeaseExpiresAt: null,
              updatedAt: nowIso,
            }));
            return null;
          }

          // Crash Safety Fix: The job was in PROCESSING when its lease expired, but has no saved wamid.
          // Because Meta might have received the dispatch and issued a wamid right before
          // the worker crashed, there is NO reliable proof that dispatch never occurred.
          // We MUST NOT automatically re-dispatch. We mark it AMBIGUOUS for webhook reconciliation
          // or manual administrator resolution.
          txn.update(candRef, sanitizeFirestoreDoc({
            status: "AMBIGUOUS",
            isAmbiguous: true,
            classification: "AMBIGUOUS_CRASH_RECOVERY",
            lastError: "Worker lease expired during dispatch without delivery confirmation. Dispatch status is ambiguous.",
            processingLeaseExpiresAt: null,
            updatedAt: nowIso,
          }));

          const recRef = doc(db, RECIPIENTS_COLLECTION, data.recipientId);
          txn.update(recRef, sanitizeFirestoreDoc({
            status: "AMBIGUOUS",
            classification: "AMBIGUOUS_CRASH_RECOVERY",
            errorMessage: "Worker lease expired during dispatch without delivery confirmation. Dispatch status is ambiguous.",
            updatedAt: nowIso,
          }));

          return null;
        }

        // Check campaign status: only campaigns explicitly in "SENDING" status can have jobs processed.
        // PAUSED, CANCELLED, COMPLETED, DRAFT, and historical campaigns are strictly excluded via READ-ONLY checks.
        // ZERO mutations or status rewrites are performed on historical campaigns, jobs, or recipients.
        const campRef = doc(db, CAMPAIGNS_COLLECTION, data.campaignId);
        const campSnap = await txn.get(campRef);
        if (!campSnap.exists()) {
          // Parent campaign document does not exist: strictly read-only skip without mutating any records
          return null;
        }

        const campData = campSnap.data() as WhatsAppCampaign;
        const campNameUpper = (campData.name || "").toUpperCase();
        const isHistorical = campNameUpper.includes("DIWALI") || campNameUpper.includes("35% DISCOUNT");

        if (isHistorical) {
          // Historical campaign: strictly read-only exclusion.
          // NEVER modify historical campaign, recipient, or job documents. Byte-for-byte immutability preserved.
          return null;
        }

        if (campData.status !== "SENDING") {
          // Campaign is PAUSED, COMPLETED, DRAFT, SCHEDULED, CANCELLED, or unfinished.
          // Strictly reject dispatch via read-only skip: only campaigns explicitly in "SENDING" status can proceed.
          return null;
        }

        // Check customer consent if customerId exists
        if (data.customerId) {
          const custRef = doc(db, CUSTOMERS_COLLECTION, data.customerId);
          const custSnap = await txn.get(custRef);
          if (custSnap.exists() && custSnap.data().whatsappOptOut === true) {
            txn.update(candRef, sanitizeFirestoreDoc({
              status: "CANCELLED",
              lastError: "Customer opted out of WhatsApp marketing",
              updatedAt: nowIso,
            }));
            return null;
          }
        }

        // Atomically claim lease
        txn.update(candRef, sanitizeFirestoreDoc({
          status: "PROCESSING",
          workerId,
          processingLeaseExpiresAt: leaseExpiryIso,
          lastAttemptAt: nowIso,
          updatedAt: nowIso,
        }));

        return {
          ...data,
          status: "PROCESSING" as const,
          workerId,
          processingLeaseExpiresAt: leaseExpiryIso,
          lastAttemptAt: nowIso,
          updatedAt: nowIso,
        };
      });

      if (claimedJob) {
        return claimedJob;
      }
    } catch (txnErr) {
      console.warn(`[Queue Worker] Concurrency contention claiming job ${candDoc.id}:`, txnErr);
      continue;
    }
  }

  return null;
}

export interface JobExecutionResult {
  jobId: string;
  success: boolean;
  status: WhatsAppQueueJobStatus;
  messageId?: string | null;
  error?: string | null;
  metaErrorCode?: string | number | null;
  isRateLimit?: boolean;
  nextAttemptAt?: string | null;
}

/**
 * Dispatches a single claimed job through Meta Cloud API and immediately persists result.
 */
export async function executeClaimedJob(
  job: WhatsAppCampaignJob,
  provider: ReturnType<typeof getWhatsAppProvider>
): Promise<JobExecutionResult> {
  const nowIso = new Date().toISOString();
  const jobRef = doc(db, QUEUE_JOBS_COLLECTION, job.id);
  const recRef = doc(db, RECIPIENTS_COLLECTION, job.recipientId);

  const templateLang = getTemplateLanguage(job.templateName, job.templateLanguage);
  const currentAttempts = (job.attemptCount ?? job.attempts ?? 0) + 1;
  const maxAttempts = job.maxAttempts || 4;

  const dispatchAttemptId = `${job.id}_att${currentAttempts}_${Date.now()}`;
  const dispatchStartIso = new Date().toISOString();

  // Persist dispatch attempt identifiers before calling external Meta API
  await updateDoc(jobRef, sanitizeFirestoreDoc({
    dispatchStartedAt: dispatchStartIso,
    dispatchAttemptId,
    lastAttemptAt: dispatchStartIso,
    attemptCount: currentAttempts,
    attempts: currentAttempts,
    updatedAt: dispatchStartIso,
  }));

  try {
    const sendResult = await provider.sendTemplateMessage(
      job.phoneNumber,
      job.templateName,
      templateLang,
      job.templateParameters,
      job.imageUrl || undefined
    );

    // 1. Ambiguous timeout or mid-flight connection loss
    if (sendResult.isAmbiguous) {
      const errorMsg = sendResult.error || "Message dispatch timed out; awaiting webhook reconciliation";
      const jobUpdate: Partial<WhatsAppCampaignJob> = {
        status: "AMBIGUOUS",
        attemptCount: currentAttempts,
        attempts: currentAttempts,
        isAmbiguous: true,
        classification: "AMBIGUOUS_TIMEOUT",
        lastError: errorMsg,
        metaErrorCode: sendResult.metaErrorCode || "TIMEOUT",
        metaErrorDetails: sendResult.metaErrorDetails || null,
        httpStatus: sendResult.httpStatus || 408,
        fbtraceId: sendResult.fbtraceId || null,
        errorSource: "INTERNAL",
        processingLeaseExpiresAt: null,
        lastAttemptAt: nowIso,
        updatedAt: nowIso,
      };
      await updateDoc(jobRef, sanitizeFirestoreDoc(jobUpdate));

      const recSnap = await getDoc(recRef);
      const recData = recSnap.exists() ? (recSnap.data() as WhatsAppCampaignRecipient) : null;
      const existingAttempts: WhatsAppDeliveryAttempt[] = Array.isArray(recData?.attempts) ? [...recData.attempts] : [];
      existingAttempts.push({
        attempt: currentAttempts,
        status: "PENDING",
        sentAt: nowIso,
        errorMessage: errorMsg,
        errorCode: "AMBIGUOUS_TIMEOUT",
      });

      await updateDoc(recRef, sanitizeFirestoreDoc({
        errorMessage: errorMsg,
        errorCode: "AMBIGUOUS_TIMEOUT",
        metaErrorDetails: sendResult.metaErrorDetails || null,
        classification: "AMBIGUOUS_TIMEOUT",
        attemptCount: currentAttempts,
        attempts: existingAttempts,
        updatedAt: nowIso,
      }));

      return {
        jobId: job.id,
        success: false,
        status: "AMBIGUOUS",
        error: errorMsg,
        metaErrorCode: "TIMEOUT",
      };
    }

    // 2. Success: Meta accepted the message and returned wamid
    if (sendResult.success && sendResult.messageId) {
      recordThrottleSuccess();

      const existingMessageIds = Array.isArray(job.messageIds)
        ? job.messageIds
        : (job.whatsappMessageId ? [job.whatsappMessageId] : []);
      const updatedMessageIds = Array.from(new Set([...existingMessageIds, sendResult.messageId]));

      const jobUpdate: Partial<WhatsAppCampaignJob> = {
        status: "ACCEPTED",
        attemptCount: currentAttempts,
        attempts: currentAttempts,
        whatsappMessageId: sendResult.messageId,
        messageIds: updatedMessageIds,
        sentAt: nowIso,
        lastAttemptAt: nowIso,
        lastError: null,
        metaErrorCode: null,
        metaErrorDetails: null,
        httpStatus: sendResult.httpStatus || 200,
        fbtraceId: sendResult.fbtraceId || null,
        classification: null,
        isAmbiguous: false,
        processingLeaseExpiresAt: null,
        updatedAt: nowIso,
      };
      await updateDoc(jobRef, sanitizeFirestoreDoc(jobUpdate));

      // Update matching recipient record
      const recSnap = await getDoc(recRef);
      const recData = recSnap.exists() ? (recSnap.data() as WhatsAppCampaignRecipient) : null;
      const existingRecMessageIds = Array.isArray(recData?.messageIds)
        ? recData.messageIds
        : (recData?.metaMessageId ? [recData.metaMessageId] : []);
      const updatedRecMessageIds = Array.from(new Set([...existingRecMessageIds, sendResult.messageId]));
      const existingAttempts: WhatsAppDeliveryAttempt[] = Array.isArray(recData?.attempts) ? [...recData.attempts] : [];
      existingAttempts.push({
        attempt: currentAttempts,
        status: "SENT",
        sentAt: nowIso,
        metaMessageId: sendResult.messageId,
      });

      await updateDoc(recRef, sanitizeFirestoreDoc({
        status: "SENT",
        metaMessageId: sendResult.messageId,
        messageIds: updatedRecMessageIds,
        sentAt: nowIso,
        errorMessage: null,
        errorCode: null,
        metaErrorDetails: null,
        classification: null,
        attemptCount: currentAttempts,
        attempts: existingAttempts,
        updatedAt: nowIso,
      }));

      // Add audit entry in whatsapp_messages
      const auditRecord: Omit<WhatsAppMessageRecord, "id"> = {
        messageType: "MARKETING_CAMPAIGN",
        category: "MARKETING",
        campaignId: job.campaignId,
        customerId: job.customerId || null,
        customerName: job.customerName,
        phoneNumber: job.phoneNumber,
        normalizedPhone: job.phoneNumber,
        templateName: job.templateName,
        message: `[Campaign Template: ${job.templateName}]`,
        status: "SENT",
        provider: provider.providerType,
        messageId: sendResult.messageId,
        metaMessageId: sendResult.messageId,
        costPerMessage: 0.90,
        estimatedCharge: 0.90,
        sentAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));

      return {
        jobId: job.id,
        success: true,
        status: "ACCEPTED",
        messageId: sendResult.messageId,
      };
    }

    // 3. Failure: Meta returned an error or rate limit
    const errorCode = sendResult.errorCode;
    const metaErrorCode = sendResult.metaErrorCode || null;
    const errorMsg = sendResult.error || "Meta message dispatch failed";

    // Classify retry eligibility
    const eligibility = classifyRetryEligibility(
      errorMsg,
      metaErrorCode || errorCode,
      currentAttempts - 1,
      maxAttempts - 1
    );

    const isRateLimit = eligibility.classification === "THROUGHPUT_LIMIT" ||
      eligibility.classification === "PAIR_RATE_LIMIT" ||
      eligibility.classification === "APP_LEVEL_LIMIT" ||
      eligibility.classification === "RATE_LIMIT";

    if (isRateLimit) {
      recordThrottleRateLimit(sendResult.retryAfterSeconds);
    }

    const shouldRetry = eligibility.eligible && currentAttempts < maxAttempts;

    const recSnap = await getDoc(recRef);
    const recData = recSnap.exists() ? (recSnap.data() as WhatsAppCampaignRecipient) : null;
    const existingAttempts: WhatsAppDeliveryAttempt[] = Array.isArray(recData?.attempts) ? [...recData.attempts] : [];
    existingAttempts.push({
      attempt: currentAttempts,
      status: "FAILED",
      sentAt: nowIso,
      errorMessage: errorMsg,
      errorCode: metaErrorCode ? String(metaErrorCode) : errorCode ? String(errorCode) : null,
    });

    if (shouldRetry) {
      const nextAttemptIso = calculateNextAttemptAt(currentAttempts, {
        isRateLimit,
        retryAfterSeconds: sendResult.retryAfterSeconds,
      });

      const jobUpdate: Partial<WhatsAppCampaignJob> = {
        status: "RETRY_WAIT",
        attemptCount: currentAttempts,
        attempts: currentAttempts,
        nextAttemptAt: nextAttemptIso,
        lastAttemptAt: nowIso,
        lastError: errorMsg,
        metaErrorCode,
        metaErrorDetails: sendResult.metaErrorDetails || null,
        httpStatus: sendResult.httpStatus || null,
        fbtraceId: sendResult.fbtraceId || null,
        classification: eligibility.classification,
        isAmbiguous: false,
        errorSource: "API_RESPONSE",
        processingLeaseExpiresAt: null,
        updatedAt: nowIso,
      };
      await updateDoc(jobRef, sanitizeFirestoreDoc(jobUpdate));

      // Update recipient record with cooldown state
      await updateDoc(recRef, sanitizeFirestoreDoc({
        status: "FAILED",
        errorMessage: errorMsg,
        errorCode: metaErrorCode ? String(metaErrorCode) : errorCode || null,
        metaErrorDetails: sendResult.metaErrorDetails || null,
        classification: eligibility.classification,
        retryCount: currentAttempts,
        attemptCount: currentAttempts,
        attempts: existingAttempts,
        nextAttemptAt: nextAttemptIso,
        updatedAt: nowIso,
      }));

      return {
        jobId: job.id,
        success: false,
        status: "RETRY_WAIT",
        error: errorMsg,
        metaErrorCode,
        isRateLimit,
        nextAttemptAt: nextAttemptIso,
      };
    }

    // Permanent error or max attempts reached -> mark FAILED
    const jobUpdate: Partial<WhatsAppCampaignJob> = {
      status: "FAILED",
      attemptCount: currentAttempts,
      attempts: currentAttempts,
      failedAt: nowIso,
      lastAttemptAt: nowIso,
      lastError: errorMsg,
      metaErrorCode,
      metaErrorDetails: sendResult.metaErrorDetails || null,
      httpStatus: sendResult.httpStatus || null,
      fbtraceId: sendResult.fbtraceId || null,
      classification: eligibility.classification,
      isAmbiguous: false,
      errorSource: "API_RESPONSE",
      processingLeaseExpiresAt: null,
      updatedAt: nowIso,
    };
    await updateDoc(jobRef, sanitizeFirestoreDoc(jobUpdate));

    await updateDoc(recRef, sanitizeFirestoreDoc({
      status: "FAILED",
      errorMessage: errorMsg,
      errorCode: metaErrorCode ? String(metaErrorCode) : errorCode || null,
      metaErrorDetails: sendResult.metaErrorDetails || null,
      classification: eligibility.classification,
      retryCount: currentAttempts,
      attemptCount: currentAttempts,
      attempts: existingAttempts,
      updatedAt: nowIso,
    }));

    return {
      jobId: job.id,
      success: false,
      status: "FAILED",
      error: errorMsg,
      metaErrorCode,
      isRateLimit,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unexpected exception during message dispatch";
    const currentAttempts = (job.attemptCount ?? job.attempts ?? 0) + 1;

    await updateDoc(jobRef, sanitizeFirestoreDoc({
      status: "RETRY_WAIT",
      attemptCount: currentAttempts,
      attempts: currentAttempts,
      nextAttemptAt: calculateNextAttemptAt(currentAttempts),
      lastAttemptAt: nowIso,
      lastError: errorMsg,
      errorSource: "INTERNAL",
      processingLeaseExpiresAt: null,
      updatedAt: nowIso,
    }));

    return {
      jobId: job.id,
      success: false,
      status: "RETRY_WAIT",
      error: errorMsg,
    };
  }
}

export interface WorkerBatchResult {
  processedCount: number;
  acceptedCount: number;
  failedCount: number;
  retryWaitCount: number;
  coolingActive: boolean;
  budgetBlocked: boolean;
  message: string;
  dryRun?: boolean;
  candidateCount?: number;
  simulatedJobs?: Array<{
    jobId: string;
    campaignId: string;
    customerName: string;
    phoneNumberMasked: string;
    templateName: string;
    status: string;
    nextAttemptAt: string;
    wouldSend: boolean;
    reason?: string;
  }>;
}

/**
 * Main queue worker batch processor.
 * Runs in a bounded execution loop respecting concurrency 1, controlled delay between messages,
 * and maximum serverless execution time.
 */
export async function processQueueBatch(options?: {
  maxJobs?: number;
  timeBudgetMs?: number;
  workerId?: string;
  dryRun?: boolean;
}): Promise<WorkerBatchResult> {
  const maxJobs = options?.maxJobs || 10;
  const timeBudgetMs = options?.timeBudgetMs || 20000; // 20 seconds safe bound
  const workerId = options?.workerId || `worker_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const isDryRun = Boolean(options?.dryRun);
  const startTime = Date.now();

  // 0. Master WhatsApp Kill-Switch Check
  const enabledCheck = await assertWhatsAppEnabled();
  if (!enabledCheck.enabled) {
    return {
      dryRun: isDryRun,
      processedCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      retryWaitCount: 0,
      coolingActive: false,
      budgetBlocked: false,
      message: "WhatsApp messaging is disabled by master kill-switch. Queue batch skipped.",
    };
  }

  // Dry-run simulation mode: safely inspects due queue jobs without mutations or Meta API calls
  if (isDryRun) {
    const nowIso = new Date().toISOString();
    let candidateDocs: any[] = [];
    try {
      const qDue = query(
        collection(db, QUEUE_JOBS_COLLECTION),
        where("status", "in", ["PENDING", "RETRY_WAIT", "QUEUED"]),
        where("nextAttemptAt", "<=", nowIso),
        orderBy("nextAttemptAt", "asc"),
        limit(maxJobs)
      );
      const snap = await getDocs(qDue);
      candidateDocs = snap.docs;
    } catch {
      try {
        const qFallback = query(
          collection(db, QUEUE_JOBS_COLLECTION),
          where("status", "in", ["PENDING", "RETRY_WAIT", "QUEUED"]),
          limit(maxJobs * 2)
        );
        const snapFallback = await getDocs(qFallback);
        candidateDocs = snapFallback.docs
          .filter((d) => (d.data().nextAttemptAt || "") <= nowIso)
          .sort((a, b) => (a.data().nextAttemptAt || "").localeCompare(b.data().nextAttemptAt || ""))
          .slice(0, maxJobs);
      } catch {
        candidateDocs = [];
      }
    }

    const simulatedJobs: Array<{
      jobId: string;
      campaignId: string;
      customerName: string;
      phoneNumberMasked: string;
      templateName: string;
      status: string;
      nextAttemptAt: string;
      wouldSend: boolean;
      reason?: string;
    }> = [];

    for (const candDoc of candidateDocs) {
      const jobData = candDoc.data() as WhatsAppCampaignJob;
      let wouldSend = true;
      let reason: string | undefined = undefined;

      try {
        const campRef = doc(db, CAMPAIGNS_COLLECTION, jobData.campaignId);
        const campSnap = await getDoc(campRef);
        if (!campSnap.exists()) {
          wouldSend = false;
          reason = "Parent campaign not found";
        } else {
          const camp = campSnap.data() as WhatsAppCampaign;
          const campNameUpper = (camp.name || "").toUpperCase();
          const isHistorical = campNameUpper.includes("DIWALI") || campNameUpper.includes("35% DISCOUNT");

          if (isHistorical) {
            wouldSend = false;
            reason = "Historical campaign protected";
          } else if (camp.status === "CANCELLED") {
            wouldSend = false;
            reason = "Campaign is CANCELLED";
          } else if (camp.status === "PAUSED") {
            wouldSend = false;
            reason = "Campaign is PAUSED";
          } else if (camp.status !== "SENDING") {
            wouldSend = false;
            reason = `Campaign is in ${camp.status || "NON-SENDING"} status (only SENDING permitted)`;
          }
        }
      } catch {
        // Ignore read errors in simulation
      }

      if (wouldSend && jobData.customerId) {
        try {
          const custRef = doc(db, CUSTOMERS_COLLECTION, jobData.customerId);
          const custSnap = await getDoc(custRef);
          if (custSnap.exists() && custSnap.data().whatsappOptOut === true) {
            wouldSend = false;
            reason = "Customer opted out of WhatsApp marketing";
          }
        } catch {
          // Ignore
        }
      }

      const rawPhone = String(jobData.phoneNumber || "");
      const masked = rawPhone.length > 5
        ? `${rawPhone.substring(0, 3)}****${rawPhone.substring(rawPhone.length - 2)}`
        : "****";

      simulatedJobs.push({
        jobId: candDoc.id,
        campaignId: jobData.campaignId,
        customerName: jobData.customerName || "Customer",
        phoneNumberMasked: masked,
        templateName: jobData.templateName || "blow_salon_campaign",
        status: jobData.status,
        nextAttemptAt: jobData.nextAttemptAt,
        wouldSend,
        reason,
      });
    }

    const payableCandidates = simulatedJobs.filter((j) => j.wouldSend).length;
    return {
      dryRun: true,
      processedCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      retryWaitCount: 0,
      coolingActive: false,
      budgetBlocked: false,
      candidateCount: simulatedJobs.length,
      simulatedJobs,
      message: `[DRY-RUN] Inspected queue. Found ${simulatedJobs.length} due jobs (${payableCandidates} eligible for immediate dispatch). Zero messages sent. Zero records modified.`,
    };
  }

  const provider = getWhatsAppProvider();

  let processedCount = 0;
  let acceptedCount = 0;
  let failedCount = 0;
  let retryWaitCount = 0;
  const affectedCampaignIds = new Set<string>();

  // 1. Check Daily 24h Conversation Safety Budget
  const budgetCheck = await checkConversationBudget();
  if (!budgetCheck.allowed) {
    return {
      processedCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      retryWaitCount: 0,
      coolingActive: false,
      budgetBlocked: true,
      message: budgetCheck.reason || "Daily 24h conversation budget reached.",
    };
  }

  // 2. Check Queue Cooling Status (backoff after rate-limit hit)
  const cooling = getQueueCoolingStatus();
  if (cooling.isCooling) {
    return {
      processedCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      retryWaitCount: 0,
      coolingActive: true,
      budgetBlocked: false,
      message: `Queue is actively cooling down from a previous rate-limit. Remaining: ${Math.ceil(cooling.remainingMs / 1000)}s.`,
    };
  }

  // Minimum execution headroom needed to safely complete an entire job cycle
  // (10s worst-case Meta timeout + 2s Firestore writes & campaign stat updates)
  const MIN_JOB_EXECUTION_HEADROOM_MS = 12000;

  // 3. Sequential Worker Loop (Concurrency = 1)
  while (processedCount < maxJobs && (Date.now() - startTime) < timeBudgetMs) {
    const remainingBudgetMs = timeBudgetMs - (Date.now() - startTime);
    if (processedCount > 0 && remainingBudgetMs < MIN_JOB_EXECUTION_HEADROOM_MS) {
      break; // Safe exit: insufficient time budget remains to safely complete another Meta request
    }

    // Atomically claim next available due job
    const job = await claimNextDueJob(workerId);
    if (!job) {
      break; // No more due jobs to process
    }

    affectedCampaignIds.add(job.campaignId);

    // Execute message send
    const res = await executeClaimedJob(job, provider);
    processedCount++;

    if (res.status === "ACCEPTED") {
      acceptedCount++;
    } else if (res.status === "FAILED") {
      failedCount++;
    } else if (res.status === "RETRY_WAIT") {
      retryWaitCount++;
    }

    // If rate-limited, immediately break to avoid hammering Meta API
    if (res.isRateLimit) {
      break;
    }

    // Controlled message delay pacing (default: 3,000ms or current adaptive delay)
    const delayMs = getCurrentSendDelayMs();
    const elapsedSoFar = Date.now() - startTime;
    if (processedCount < maxJobs && (elapsedSoFar + delayMs) < timeBudgetMs) {
      await sleep(delayMs);
    } else {
      break;
    }
  }

  // 4. Synchronize campaign counters for all affected campaigns
  for (const campaignId of affectedCampaignIds) {
    try {
      await syncCampaignStats(campaignId);
    } catch (syncErr) {
      console.warn(`[Queue Worker] Failed to sync campaign stats for ${campaignId}:`, syncErr);
    }
  }

  return {
    processedCount,
    acceptedCount,
    failedCount,
    retryWaitCount,
    coolingActive: false,
    budgetBlocked: false,
    message: `Processed ${processedCount} jobs (Accepted: ${acceptedCount}, RetryWait: ${retryWaitCount}, Failed: ${failedCount}).`,
  };
}

/**
 * Recalculates and updates campaign statistics from Single Source of Truth recipient records.
 */
export async function syncCampaignStats(campaignId: string): Promise<void> {
  const campRef = doc(db, CAMPAIGNS_COLLECTION, campaignId);
  const campSnap = await getDoc(campRef);
  if (!campSnap.exists()) return;

  const campData = campSnap.data() as WhatsAppCampaign;
  if (campData.status === "CANCELLED") return;

  // Fetch all recipients for accurate stats
  const recSnap = await getDocs(
    query(collection(db, RECIPIENTS_COLLECTION), where("campaignId", "==", campaignId))
  );
  const allRecs = recSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WhatsAppCampaignRecipient));

  // Fetch live queue job counts for campaign dashboard reporting
  let pendingJobsCount = 0;
  let processingJobsCount = 0;
  let retryWaitJobsCount = 0;
  let ambiguousJobsCount = 0;
  let acceptedJobsCount = 0;
  const jobsByRecipientId = new Map<string, WhatsAppCampaignJob>();

  try {
    const jobSnap = await getDocs(
      query(collection(db, QUEUE_JOBS_COLLECTION), where("campaignId", "==", campaignId))
    );
    for (const d of jobSnap.docs) {
      const job = d.data() as WhatsAppCampaignJob;
      const recId = job.recipientId || (job.id.includes("_") ? job.id.split("_")[1] : null);
      if (recId) {
        jobsByRecipientId.set(recId, job);
      }
      const s = job.status;
      if (s === "PENDING" || s === "QUEUED") pendingJobsCount++;
      else if (s === "PROCESSING") processingJobsCount++;
      else if (s === "RETRY_WAIT") retryWaitJobsCount++;
      else if (s === "AMBIGUOUS") ambiguousJobsCount++;
      else if (s === "ACCEPTED") acceptedJobsCount++;
    }
  } catch {
    // If job query fails, derive from recipient status
    pendingJobsCount = allRecs.filter((r) => r.status === "PENDING" || (r as any).status === "QUEUED").length;
    ambiguousJobsCount = allRecs.filter((r) => r.status === "AMBIGUOUS").length;
    acceptedJobsCount = allRecs.filter((r) => r.status === "ACCEPTED").length;
  }

  // Reconcile recipient delivery statuses using authoritative queue jobs
  // Monotonic lifecycle transition: DELIVERED/READ cannot be downgraded to FAILED or SENT
  const nowIso = new Date().toISOString();
  const reconciledRecs = allRecs.map((rec) => {
    const job = jobsByRecipientId.get(rec.id);
    if (!job) return rec;

    const transition = canTransitionStatus(rec.status, job.status);

    if (transition.allowed) {
      // Reconcile recipient doc in Firestore if out of sync with authoritative job
      updateDoc(
        doc(db, RECIPIENTS_COLLECTION, rec.id),
        sanitizeFirestoreDoc({
          status: job.status,
          deliveredAt: job.deliveredAt || rec.deliveredAt || null,
          readAt: job.readAt || rec.readAt || null,
          failedAt: job.failedAt || (rec as any).failedAt || null,
          errorMessage: job.lastError || rec.errorMessage || null,
          errorCode: job.metaErrorCode ? String(job.metaErrorCode) : rec.errorCode || null,
          metaErrorDetails: job.metaErrorDetails || (rec as any).metaErrorDetails || null,
          classification: job.classification || (rec as any).classification || null,
          errorSource: job.errorSource || (rec as any).errorSource || null,
          metaMessageId: job.whatsappMessageId || rec.metaMessageId || null,
          updatedAt: nowIso,
        })
      ).catch((err) => {
        console.warn(`[QueueManager] Non-blocking recipient sync error for ${rec.id}:`, err);
      });

      return {
        ...rec,
        status: job.status as any,
        deliveredAt: job.deliveredAt || rec.deliveredAt,
        readAt: job.readAt || rec.readAt,
        failedAt: job.failedAt || (rec as any).failedAt,
        errorMessage: job.lastError || rec.errorMessage,
        errorCode: job.metaErrorCode ? String(job.metaErrorCode) : rec.errorCode,
      };
    }
    return rec;
  });

  const stats = calculateCampaignStats(reconciledRecs);

  const remainingJobs = pendingJobsCount + processingJobsCount + retryWaitJobsCount;
  const currentDelayMs = getCurrentSendDelayMs();
  const estimatedCompletionMinutes = remainingJobs > 0
    ? Math.max(1, Math.ceil((remainingJobs * currentDelayMs) / 60000))
    : 0;

  let newStatus: WhatsAppCampaign["status"] = campData.status;

  if (campData.status === "PAUSED") {
    newStatus = "PAUSED";
  } else if (remainingJobs === 0) {
    if (stats.failedCount > 0 && stats.sentCount === 0) {
      newStatus = "FAILED";
    } else if (stats.failedCount > 0) {
      newStatus = "COMPLETED_WITH_ERRORS";
    } else {
      newStatus = "COMPLETED";
    }
  } else {
    newStatus = "SENDING";
  }

  await updateDoc(campRef, sanitizeFirestoreDoc({
    status: newStatus,
    totalRecipients: stats.totalRecipients,
    sentCount: stats.sentCount,
    deliveredCount: stats.deliveredCount,
    readCount: stats.readCount,
    failedCount: stats.failedCount,
    ambiguousCount: stats.ambiguousCount || ambiguousJobsCount,
    excludedCount: stats.excludedCount,
    pendingCount: pendingJobsCount,
    processingCount: processingJobsCount,
    retryWaitingCount: retryWaitJobsCount,
    acceptedCount: stats.acceptedCount || acceptedJobsCount,
    currentDelayMs,
    estimatedCompletionMinutes,
    completedAt: remainingJobs === 0 && (newStatus === "COMPLETED" || newStatus === "COMPLETED_WITH_ERRORS")
      ? (campData.completedAt || nowIso)
      : null,
    updatedAt: nowIso,
  }));
}

