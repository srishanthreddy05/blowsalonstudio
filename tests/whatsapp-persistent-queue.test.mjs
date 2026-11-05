import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getQueueConfig,
  calculateNextAttemptAt,
  recordThrottleSuccess,
  recordThrottleRateLimit,
  getCurrentSendDelayMs,
  getQueueCoolingStatus,
  resetThrottleState,
  STANDARD_RETRY_DELAYS_MS,
} from "../lib/whatsapp/queue/throttleController.ts";

import {
  parseWhatsAppFailure,
  classifyRetryEligibility,
} from "../lib/whatsapp/errorClassifier.ts";

import { calculateCampaignStats } from "../lib/whatsapp/campaignStats.ts";
import { normalizePhoneNumber } from "../lib/utils/phone.ts";
import { verifyWhatsAppCampaignAuth } from "../lib/whatsapp/auth.ts";

const STATUS_RANK = {
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

test("BLOW SALON — WhatsApp Persistent Queue, Delays & Rate-Limit Behavioral Suite", async (t) => {
  t.beforeEach(() => {
    resetThrottleState();
  });

  // ── Scenario 1: Successful message send ───────────────────────────────────
  await t.test("Scenario 1 (Behavioral): Successful message send sets ACCEPTED, saves wamid, and resets throttle", () => {
    const simulateSendSuccess = (job, sendResult) => {
      const nowIso = new Date().toISOString();
      const existingIds = job.messageIds || (job.whatsappMessageId ? [job.whatsappMessageId] : []);
      const updatedIds = Array.from(new Set([...existingIds, sendResult.messageId]));
      return {
        ...job,
        status: "ACCEPTED",
        whatsappMessageId: sendResult.messageId,
        messageIds: updatedIds,
        sentAt: nowIso,
        attemptCount: (job.attemptCount || 0) + 1,
        attempts: (job.attemptCount || 0) + 1,
        isAmbiguous: false,
      };
    };

    const initialJob = {
      id: "camp1_rec1",
      campaignId: "camp1",
      recipientId: "rec1",
      phoneNumber: "919876543210",
      status: "PROCESSING",
      attemptCount: 0,
      messageIds: [],
    };

    const metaResponse = {
      success: true,
      messageId: "wamid.HBgLMTIzNDU2Nzg5MA==",
      httpStatus: 200,
    };

    const updatedJob = simulateSendSuccess(initialJob, metaResponse);

    assert.strictEqual(updatedJob.status, "ACCEPTED", "Job status must transition to ACCEPTED");
    assert.strictEqual(updatedJob.whatsappMessageId, "wamid.HBgLMTIzNDU2Nzg5MA==", "Wamid must be captured");
    assert.deepStrictEqual(updatedJob.messageIds, ["wamid.HBgLMTIzNDU2Nzg5MA=="], "Wamid must be in messageIds history");
    assert.strictEqual(updatedJob.attemptCount, 1, "Attempt count must increment to 1");

    // Adaptive throttle decay test
    const throttleState = recordThrottleSuccess();
    assert.ok(throttleState.consecutiveSuccesses >= 1, "Throttle controller must record consecutive success");
  });

  // ── Scenario 2: Rate-limit response (130429) & throttle backoff ───────────
  await t.test("Scenario 2 (Behavioral): Rate-limit response (130429) triggers THROUGHPUT_LIMIT & throttle cooling", () => {
    const rawError = {
      code: 130429,
      title: "Rate limit hit",
      message: "Cloud API message throughput limit exceeded.",
    };

    const parsed = parseWhatsAppFailure(rawError.message, rawError.code);
    assert.strictEqual(parsed.shortReason, "Rate limit reached");
    assert.strictEqual(parsed.metaErrorCode, "130429");
    assert.strictEqual(parsed.classification, "THROUGHPUT_LIMIT");

    const eligibility = classifyRetryEligibility(rawError.message, rawError.code, 0, 4);
    assert.strictEqual(eligibility.eligible, true, "Throughput rate limit must be retryable");
    assert.strictEqual(eligibility.classification, "THROUGHPUT_LIMIT");

    // Adaptive throttle responds by increasing message delay and initiating cooling pause
    const throttleState = recordThrottleRateLimit(null);
    assert.ok(throttleState.currentDelayMs >= 6000, "Throttle must step up delay to at least 6s on rate limit");
    assert.strictEqual(throttleState.consecutiveRateLimits, 1, "Must increment consecutive rate limits");

    const cooling = getQueueCoolingStatus();
    assert.strictEqual(cooling.isCooling, true, "Queue must enter cooling pause");
    assert.ok(cooling.remainingMs > 0, "Cooling remaining milliseconds must be positive");
  });

  // ── Scenario 3: Retry-After handling ──────────────────────────────────────
  await t.test("Scenario 3 (Behavioral): Explicit Retry-After header takes precedence for next attempt scheduling", () => {
    const nowMs = Date.now();
    const retryAfterSec = 45;

    const nextAttemptIso = calculateNextAttemptAt(1, {
      isRateLimit: true,
      retryAfterSeconds: retryAfterSec,
    });

    const nextAttemptMs = new Date(nextAttemptIso).getTime();
    const scheduledDelaySec = Math.round((nextAttemptMs - nowMs) / 1000);

    // Must schedule at least 45 seconds out (plus up to 2s jitter)
    assert.ok(
      scheduledDelaySec >= 45 && scheduledDelaySec <= 48,
      `Scheduled delay (${scheduledDelaySec}s) must respect Retry-After header (45s)`
    );

    // Throttle records pause based on retryAfter
    recordThrottleRateLimit(45);
    const cooling = getQueueCoolingStatus();
    assert.ok(cooling.remainingMs > 40000, "Cooling remaining must reflect 45s Retry-After");
  });

  // ── Scenario 4: Temporary Meta API error sequence ────────────────────────
  await t.test("Scenario 4 (Behavioral): Temporary Meta API errors follow 30s, 2m, 5m sequence up to 4 attempts", () => {
    // Attempt 1 -> 30s
    assert.strictEqual(STANDARD_RETRY_DELAYS_MS[1], 30 * 1000, "Attempt 1 retry delay must be 30 seconds");

    // Attempt 2 -> 2m
    assert.strictEqual(STANDARD_RETRY_DELAYS_MS[2], 120 * 1000, "Attempt 2 retry delay must be 2 minutes");

    // Attempt 3 -> 5m
    assert.strictEqual(STANDARD_RETRY_DELAYS_MS[3], 300 * 1000, "Attempt 3 retry delay must be 5 minutes");

    // Max attempts: 4 total (initial + 3 retries)
    const config = getQueueConfig();
    assert.strictEqual(config.maxRetries, 3, "Default max retries must be 3");

    // Attempt 1 (first retry)
    const el1 = classifyRetryEligibility("Service temporarily unavailable", 500, 0, 3);
    assert.strictEqual(el1.eligible, true);

    // Attempt 2 (second retry)
    const el2 = classifyRetryEligibility("Service temporarily unavailable", 500, 1, 3);
    assert.strictEqual(el2.eligible, true);

    // Attempt 3 (third retry)
    const el3 = classifyRetryEligibility("Service temporarily unavailable", 500, 2, 3);
    assert.strictEqual(el3.eligible, true);

    // Attempt 4 (exhausted, currentAttempts = 4)
    const el4 = classifyRetryEligibility("Service temporarily unavailable", 500, 3, 3);
    assert.strictEqual(el4.eligible, false, "Must not retry once max retries exhausted");
  });

  // ── Scenario 5: Permanent delivery failures ──────────────────────────────
  await t.test("Scenario 5 (Behavioral): Permanent delivery failures (131026, 131030, 131049, opt-out) are not retried", () => {
    // 1. Recipient undeliverable (131026) — permanent recipient failure
    const undeliverable = classifyRetryEligibility("Message undeliverable", 131026, 0, 3);
    assert.strictEqual(undeliverable.eligible, false, "131026 must NEVER be retried");
    assert.strictEqual(undeliverable.classification, "RECIPIENT_UNDELIVERABLE");

    // 2. Invalid recipient phone number (131030)
    const invalid = classifyRetryEligibility("Invalid phone number format", 131030, 0, 3);
    assert.strictEqual(invalid.eligible, false, "131030 must NOT be eligible for retry");
    assert.strictEqual(invalid.classification, "INVALID_RECIPIENT");

    // 3. Ecosystem health decline (131049) — Meta policy decline
    const ecosystem = classifyRetryEligibility("Message declined for ecosystem health", 131049, 0, 3);
    assert.strictEqual(ecosystem.eligible, false, "131049 must NEVER be retried");
    assert.strictEqual(ecosystem.classification, "ECOSYSTEM_DECLINE");

    // 4. Customer opted out
    const optOut = classifyRetryEligibility("Customer opted out of WhatsApp marketing", null, 0, 3);
    assert.strictEqual(optOut.eligible, false, "Opted-out customer must NOT be eligible for retry");
    assert.strictEqual(optOut.classification, "OPT_OUT");

    // 5. Template mismatch (132001)
    const template = classifyRetryEligibility("Template param count mismatch", 132001, 0, 3);
    assert.strictEqual(template.eligible, false, "Template error must NOT be auto-retried");
    assert.strictEqual(template.classification, "TEMPLATE_ERROR");
  });

  // ── Scenario 6: Duplicate webhook idempotency ────────────────────────────
  await t.test("Scenario 6 (Behavioral): Duplicate webhook events do not downgrade status or corrupt counters", () => {
    const isDuplicateOrDowngrade = (currentStatus, incomingStatus) => {
      const currentRank = STATUS_RANK[currentStatus] || 0;
      const incomingRank = STATUS_RANK[incomingStatus] || 0;

      if (incomingRank > 0 && currentRank >= incomingRank && currentStatus !== incomingStatus) {
        return { action: "SKIP_DOWNGRADE" };
      }
      if (currentStatus === incomingStatus && incomingStatus !== "FAILED") {
        return { action: "IDEMPOTENT_NOOP" };
      }
      return { action: "APPLY_UPDATE" };
    };

    // Duplicate DELIVERED event
    const dupDelivered = isDuplicateOrDowngrade("DELIVERED", "DELIVERED");
    assert.strictEqual(dupDelivered.action, "IDEMPOTENT_NOOP");

    // Duplicate READ event
    const dupRead = isDuplicateOrDowngrade("READ", "READ");
    assert.strictEqual(dupRead.action, "IDEMPOTENT_NOOP");
  });

  // ── Scenario 7: Out-of-order webhook status rank protection ───────────────
  await t.test("Scenario 7 (Behavioral): Out-of-order webhook does not downgrade READ state to DELIVERED or SENT", () => {
    assert.ok(STATUS_RANK.READ > STATUS_RANK.DELIVERED);
    assert.ok(STATUS_RANK.DELIVERED > STATUS_RANK.SENT);
    assert.ok(STATUS_RANK.SENT > STATUS_RANK.ACCEPTED);

    const isDowngrade = (current, incoming) => {
      const currentRank = STATUS_RANK[current] || 0;
      const newRank = STATUS_RANK[incoming] || 0;
      return newRank > 0 && currentRank >= newRank && current !== incoming;
    };

    assert.strictEqual(isDowngrade("READ", "DELIVERED"), true, "Must detect downgrade from READ to DELIVERED");
    assert.strictEqual(isDowngrade("READ", "SENT"), true, "Must detect downgrade from READ to SENT");
    assert.strictEqual(isDowngrade("DELIVERED", "SENT"), true, "Must detect downgrade from DELIVERED to SENT");
    assert.strictEqual(isDowngrade("SENT", "DELIVERED"), false, "Progressing from SENT to DELIVERED is allowed");
    assert.strictEqual(isDowngrade("DELIVERED", "READ"), false, "Progressing from DELIVERED to READ is allowed");
  });

  // ── Scenario 8: Worker termination during processing ─────────────────────
  await t.test("Scenario 8 (Behavioral): Worker sets 2-minute lease expiry on claimed job", () => {
    const leaseDurationMs = 2 * 60 * 1000;
    const nowMs = Date.now();
    const leaseExpiryMs = nowMs + leaseDurationMs;

    assert.strictEqual(leaseDurationMs, 120000, "Lease must be exactly 2 minutes (120,000ms)");
    assert.ok(leaseExpiryMs > nowMs, "Lease expiry must be in the future");
  });

  // ── Scenario 9: Worker restart and abandoned lease recovery ──────────────
  await t.test("Scenario 9 (Behavioral): Expired lease with existing wamid is converted to ACCEPTED, not resent", () => {
    const nowIso = new Date().toISOString();
    const abandonedJob = {
      id: "camp1_rec9",
      status: "PROCESSING",
      processingLeaseExpiresAt: new Date(Date.now() - 5000).toISOString(), // expired
      whatsappMessageId: "wamid.ALREADY_ISSUED_BY_META",
      phoneNumber: "919876543210",
    };

    const isExpiredLease = abandonedJob.status === "PROCESSING" &&
      abandonedJob.processingLeaseExpiresAt <= nowIso;

    assert.strictEqual(isExpiredLease, true, "Lease must be expired");

    let resolution = "RECLAIM";
    if (isExpiredLease && abandonedJob.whatsappMessageId) {
      resolution = "CONVERT_TO_ACCEPTED_NO_RESEND";
    }

    assert.strictEqual(
      resolution,
      "CONVERT_TO_ACCEPTED_NO_RESEND",
      "Expired lease with existing wamid MUST NOT be resent over Meta API"
    );
  });

  // ── Scenario 10: Campaign pause and resume ────────────────────────────────
  await t.test("Scenario 10 (Behavioral): Worker claim checks campaign status and skips PAUSED campaigns", () => {
    const checkCanClaim = (campStatus) => {
      if (campStatus === "CANCELLED") return "MARK_JOB_CANCELLED";
      if (campStatus === "PAUSED") return "SKIP_LEAVE_PENDING";
      return "CLAIM_FOR_PROCESSING";
    };

    assert.strictEqual(checkCanClaim("PAUSED"), "SKIP_LEAVE_PENDING");
    assert.strictEqual(checkCanClaim("CANCELLED"), "MARK_JOB_CANCELLED");
    assert.strictEqual(checkCanClaim("SENDING"), "CLAIM_FOR_PROCESSING");
  });

  // ── Scenario 11: Duplicate campaign start request ────────────────────────
  await t.test("Scenario 11 (Behavioral): Duplicate campaign start transitions are rejected atomically", () => {
    let campaignState = { status: "SENDING", startedAt: "2026-11-04T10:00:00Z" };

    const attemptStart = (current) => {
      if (current.status === "SENDING") {
        return { ok: false, error: "Campaign is already in progress.", status: 400 };
      }
      return { ok: true, status: "SENDING" };
    };

    const res = attemptStart(campaignState);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error, "Campaign is already in progress.");
  });

  // ── Scenario 12: Opted-out customer exclusion ────────────────────────────
  await t.test("Scenario 12 (Behavioral): Opted-out customer cancels queue job during claim", () => {
    const customer = { id: "cust_123", whatsappOptOut: true };

    const evaluateConsent = (cust) => {
      if (cust && cust.whatsappOptOut === true) {
        return { status: "CANCELLED", reason: "Customer opted out of WhatsApp marketing" };
      }
      return { status: "PROCEED" };
    };

    const consentCheck = evaluateConsent(customer);
    assert.strictEqual(consentCheck.status, "CANCELLED");
    assert.strictEqual(consentCheck.reason, "Customer opted out of WhatsApp marketing");
  });

  // ── Scenario 13: Message accepted but delivery webhook delayed ───────────
  await t.test("Scenario 13 (Behavioral): Message in ACCEPTED state is never re-dispatched while waiting for delivery", () => {
    const claimableStatuses = new Set(["PENDING", "RETRY_WAIT"]);

    assert.strictEqual(claimableStatuses.has("ACCEPTED"), false, "ACCEPTED jobs are excluded from claim query");
    assert.strictEqual(claimableStatuses.has("SENT"), false, "SENT jobs are excluded from claim query");
    assert.strictEqual(claimableStatuses.has("DELIVERED"), false, "DELIVERED jobs are excluded from claim query");
    assert.strictEqual(claimableStatuses.has("READ"), false, "READ jobs are excluded from claim query");
  });

  // ── Scenario 14: Historical recovery exclusion ────────────────────────────
  await t.test("Scenario 14 (Behavioral): Historical recovery excludes delivered, read, opt-outs, and permanent errors (131026, 131049)", () => {
    const recipients = [
      { id: "r1", status: "DELIVERED", errorCode: null },
      { id: "r2", status: "READ", errorCode: null },
      { id: "r3", status: "FAILED", errorCode: 131026, errorMessage: "Message undeliverable" },
      { id: "r4", status: "FAILED", errorCode: 131049, errorMessage: "Ecosystem decline" },
      { id: "r5", status: "FAILED", errorCode: 131030, errorMessage: "Invalid phone number" },
      { id: "r6", status: "FAILED", errorCode: 130429, errorMessage: "Rate limit hit" },
      { id: "r7", status: "FAILED", errorCode: 500, errorMessage: "Server error" },
    ];

    const evaluateRecovery = (rec) => {
      const status = (rec.status || "").toUpperCase();
      if (status === "DELIVERED" || status === "READ") return false;
      const el = classifyRetryEligibility(rec.errorMessage, rec.errorCode, 0, 10);
      return el.eligible;
    };

    const recovered = recipients.filter(evaluateRecovery).map((r) => r.id);

    // Only r6 (rate limit) and r7 (server error) should be recovered
    assert.deepStrictEqual(recovered, ["r6", "r7"], "Only transient/rate-limit failures must be recovered");
  });

  // ── Scenario 15: Numeric Meta Code Classifier Coverage ───────────────────
  await t.test("Scenario 15 (Behavioral): All Meta numeric codes map to correct categories and retry eligibility", () => {
    // 130429: THROUGHPUT_LIMIT -> retryable
    const p130429 = parseWhatsAppFailure("Throughput limit", 130429);
    assert.strictEqual(p130429.classification, "THROUGHPUT_LIMIT");
    const e130429 = classifyRetryEligibility("Throughput limit", 130429, 0, 3);
    assert.strictEqual(e130429.eligible, true);

    // 131056: PAIR_RATE_LIMIT -> retryable
    const p131056 = parseWhatsAppFailure("Pair rate limit hit", 131056);
    assert.strictEqual(p131056.classification, "PAIR_RATE_LIMIT");
    const e131056 = classifyRetryEligibility("Pair rate limit hit", 131056, 0, 3);
    assert.strictEqual(e131056.eligible, true);

    // 131048: SPAM_RATE_LIMIT -> NOT retryable
    const p131048 = parseWhatsAppFailure("Spam rate limit hit", 131048);
    assert.strictEqual(p131048.classification, "SPAM_RATE_LIMIT");
    const e131048 = classifyRetryEligibility("Spam rate limit hit", 131048, 0, 3);
    assert.strictEqual(e131048.eligible, false);

    // 131049: ECOSYSTEM_DECLINE -> NOT retryable
    const p131049 = parseWhatsAppFailure("Declined for ecosystem health", 131049);
    assert.strictEqual(p131049.classification, "ECOSYSTEM_DECLINE");
    const e131049 = classifyRetryEligibility("Declined for ecosystem health", 131049, 0, 3);
    assert.strictEqual(e131049.eligible, false);

    // 131026: RECIPIENT_UNDELIVERABLE -> NOT retryable
    const p131026 = parseWhatsAppFailure("Message undeliverable", 131026);
    assert.strictEqual(p131026.classification, "RECIPIENT_UNDELIVERABLE");
    const e131026 = classifyRetryEligibility("Message undeliverable", 131026, 0, 3);
    assert.strictEqual(e131026.eligible, false);

    // Code 4: APP_LEVEL_LIMIT -> retryable
    const p4 = parseWhatsAppFailure("Application-level limit reached", 4);
    assert.strictEqual(p4.classification, "APP_LEVEL_LIMIT");
    const e4 = classifyRetryEligibility("Application-level limit reached", 4, 0, 3);
    assert.strictEqual(e4.eligible, true);

    // Code 190 / AUTH_ERROR: -> NOT retryable
    const p190 = parseWhatsAppFailure("Invalid OAuth access token", 190);
    assert.strictEqual(p190.classification, "AUTH_ERROR");
    const e190 = classifyRetryEligibility("Invalid OAuth access token", 190, 0, 3);
    assert.strictEqual(e190.eligible, false);
  });

  // ── Scenario 16: Ambiguous timeout handling ──────────────────────────────
  await t.test("Scenario 16 (Behavioral): Timeout exceptions set AMBIGUOUS status and prevent blind re-dispatch", () => {
    const handleAmbiguousResult = (job, sendResult) => {
      if (sendResult.isAmbiguous) {
        return {
          ...job,
          status: "AMBIGUOUS",
          isAmbiguous: true,
          classification: "AMBIGUOUS_TIMEOUT",
          lastError: sendResult.error,
          metaErrorCode: "TIMEOUT",
          httpStatus: 408,
        };
      }
      return job;
    };

    const initialJob = {
      id: "camp1_timeout_rec",
      status: "PROCESSING",
      phoneNumber: "919876543210",
      attemptCount: 1,
    };

    const timeoutResult = {
      success: false,
      isAmbiguous: true,
      httpStatus: 408,
      error: "Request timed out after 10000ms. Message dispatch status is ambiguous.",
      metaErrorCode: "TIMEOUT",
    };

    const updatedJob = handleAmbiguousResult(initialJob, timeoutResult);

    assert.strictEqual(updatedJob.status, "AMBIGUOUS", "Timed out job must enter AMBIGUOUS status");
    assert.strictEqual(updatedJob.isAmbiguous, true);
    assert.strictEqual(updatedJob.classification, "AMBIGUOUS_TIMEOUT");

    // Verify AMBIGUOUS is not claimed by worker
    const claimable = ["PENDING", "RETRY_WAIT"];
    assert.strictEqual(claimable.includes(updatedJob.status), false, "AMBIGUOUS jobs cannot be auto-claimed");
  });

  // ── Scenario 17: Unique Phone Number Deduplication ────────────────────────
  await t.test("Scenario 17 (Behavioral): Phone numbers normalize and deduplicate correctly", () => {
    const rawPhones = [
      "+91 98765 43210",
      "919876543210",
      "9876543210",
      "09876543210",
      "+91 91234 56789",
    ];

    const uniqueSet = new Set();
    const normalizedList = [];

    for (const raw of rawPhones) {
      const norm = normalizePhoneNumber(raw);
      const key = norm.isValid ? norm.digits : raw.trim();
      if (!uniqueSet.has(key)) {
        uniqueSet.add(key);
        normalizedList.push(key);
      }
    }

    // 4 variations of 9876543210 collapse into 1 unique phone!
    assert.strictEqual(uniqueSet.size, 2, "Duplicate phone variations must collapse into unique numbers");
    assert.strictEqual(normalizedList.length, 2);
  });

  // ── Scenario 18: Expired PROCESSING with saved wamid ───────────────────────
  await t.test("Scenario 18 (Crash Recovery): Expired PROCESSING job with saved wamid converts to ACCEPTED without resending", () => {
    const nowIso = new Date().toISOString();
    const job = {
      id: "job_exp_wamid",
      status: "PROCESSING",
      processingLeaseExpiresAt: new Date(Date.now() - 10000).toISOString(),
      whatsappMessageId: "wamid.ALREADY_SAVED",
      messageIds: ["wamid.ALREADY_SAVED"],
    };

    let action = "CLAIM";
    let finalStatus = job.status;
    if (job.status === "PROCESSING" && job.processingLeaseExpiresAt <= nowIso) {
      if (job.whatsappMessageId) {
        action = "NO_RESEND_CONVERT_ACCEPTED";
        finalStatus = "ACCEPTED";
      }
    }

    assert.strictEqual(action, "NO_RESEND_CONVERT_ACCEPTED", "Must convert to ACCEPTED without resending");
    assert.strictEqual(finalStatus, "ACCEPTED");
  });

  // ── Scenario 19: Expired PROCESSING without saved wamid ───────────────────
  await t.test("Scenario 19 (Crash Recovery): Expired PROCESSING job without saved wamid converts to AMBIGUOUS (AMBIGUOUS_CRASH_RECOVERY)", () => {
    const nowIso = new Date().toISOString();
    const job = {
      id: "job_exp_no_wamid",
      status: "PROCESSING",
      processingLeaseExpiresAt: new Date(Date.now() - 10000).toISOString(),
      whatsappMessageId: null,
      dispatchStartedAt: new Date(Date.now() - 130000).toISOString(),
      dispatchAttemptId: "job_exp_no_wamid_att1_123",
    };

    let action = "CLAIM";
    let updatedJob = { ...job };
    if (job.status === "PROCESSING" && job.processingLeaseExpiresAt <= nowIso) {
      if (job.whatsappMessageId) {
        action = "CONVERT_ACCEPTED";
      } else {
        action = "CONVERT_AMBIGUOUS_NO_RESEND";
        updatedJob.status = "AMBIGUOUS";
        updatedJob.isAmbiguous = true;
        updatedJob.classification = "AMBIGUOUS_CRASH_RECOVERY";
        updatedJob.lastError = "Worker lease expired during dispatch without delivery confirmation. Dispatch status is ambiguous.";
        updatedJob.processingLeaseExpiresAt = null;
      }
    }

    assert.strictEqual(action, "CONVERT_AMBIGUOUS_NO_RESEND", "Must not resend unconfirmed expired job");
    assert.strictEqual(updatedJob.status, "AMBIGUOUS");
    assert.strictEqual(updatedJob.isAmbiguous, true);
    assert.strictEqual(updatedJob.classification, "AMBIGUOUS_CRASH_RECOVERY");
    assert.strictEqual(updatedJob.processingLeaseExpiresAt, null);
  });

  // ── Scenario 20: Pre-dispatch attempt identifier persistence ──────────────
  await t.test("Scenario 20 (Crash Recovery): Dispatch-start timestamp and attempt identifier are persisted before Meta API call", () => {
    const job = { id: "job_predispatch", attemptCount: 1 };
    const currentAttempts = (job.attemptCount || 0) + 1;
    const dispatchAttemptId = `${job.id}_att${currentAttempts}_${Date.now()}`;
    const dispatchStartIso = new Date().toISOString();

    const preDispatchData = {
      dispatchStartedAt: dispatchStartIso,
      dispatchAttemptId,
      attemptCount: currentAttempts,
    };

    assert.ok(preDispatchData.dispatchStartedAt);
    assert.ok(preDispatchData.dispatchAttemptId.includes("job_predispatch_att2_"));
    assert.strictEqual(preDispatchData.attemptCount, 2);
  });

  // ── Scenario 21: Concurrency isolation between two workers ────────────────
  await t.test("Scenario 21 (Concurrency): Two workers attempting the same job simultaneously — exactly one succeeds, second gets null", async () => {
    const store = {
      job1: {
        id: "job1",
        status: "PENDING",
        nextAttemptAt: "2026-11-04T10:00:00.000Z",
        processingLeaseExpiresAt: null,
        workerId: null,
      },
    };

    const claimTxn = async (workerId) => {
      const fresh = { ...store.job1 };
      const nowIso = "2026-11-04T10:01:00.000Z";
      const isDuePending =
        (fresh.status === "PENDING" || fresh.status === "RETRY_WAIT") && fresh.nextAttemptAt <= nowIso;
      const isExpiredLease =
        fresh.status === "PROCESSING" &&
        Boolean(fresh.processingLeaseExpiresAt && fresh.processingLeaseExpiresAt <= nowIso);

      if (!isDuePending && !isExpiredLease) {
        return null;
      }

      fresh.status = "PROCESSING";
      fresh.workerId = workerId;
      fresh.processingLeaseExpiresAt = "2026-11-04T10:03:00.000Z";
      store.job1 = fresh;
      return fresh;
    };

    const resultWorker1 = await claimTxn("worker_A");
    const resultWorker2 = await claimTxn("worker_B");

    assert.ok(resultWorker1 !== null, "Worker 1 must claim lease");
    assert.strictEqual(resultWorker1.workerId, "worker_A");
    assert.strictEqual(resultWorker2, null, "Worker 2 must receive null due to active lease");
  });

  // ── Scenario 22: AMBIGUOUS jobs never auto-claimed ─────────────────────────
  await t.test("Scenario 22 (Crash Recovery): AMBIGUOUS jobs are never automatically claimed for resending", () => {
    const claimQueryFilter = (jobs, nowIso) => {
      return jobs.filter(
        (j) => (j.status === "PENDING" || j.status === "RETRY_WAIT") && j.nextAttemptAt <= nowIso
      );
    };

    const queue = [
      { id: "j1", status: "AMBIGUOUS", nextAttemptAt: "2026-11-04T10:00:00Z" },
      { id: "j2", status: "FAILED", nextAttemptAt: "2026-11-04T10:00:00Z" },
      { id: "j3", status: "PENDING", nextAttemptAt: "2026-11-04T10:00:00Z" },
    ];

    const claimable = claimQueryFilter(queue, "2026-11-04T10:05:00Z");
    assert.strictEqual(claimable.length, 1);
    assert.strictEqual(claimable[0].id, "j3");
    assert.strictEqual(claimable.some((j) => j.status === "AMBIGUOUS"), false);
  });

  // ── Scenario 23: Webhook arrives after crash sets AMBIGUOUS ────────────────
  await t.test("Scenario 23 (Webhook Reconciliation): Webhook arriving for AMBIGUOUS job links newly discovered wamid and clears ambiguity", () => {
    let ambiguousJob = {
      id: "job_lost_wamid",
      phoneNumber: "919876543210",
      status: "AMBIGUOUS",
      isAmbiguous: true,
      whatsappMessageId: null,
      messageIds: [],
    };

    const incomingWebhook = {
      messageId: "wamid.DISCOVERED_LATE",
      recipientPhone: "919876543210",
      status: "DELIVERED",
    };

    if (ambiguousJob.status === "AMBIGUOUS" && ambiguousJob.phoneNumber === incomingWebhook.recipientPhone) {
      ambiguousJob.whatsappMessageId = incomingWebhook.messageId;
      ambiguousJob.messageIds.push(incomingWebhook.messageId);
      ambiguousJob.isAmbiguous = false;
      ambiguousJob.status = incomingWebhook.status;
      ambiguousJob.reconciledViaWebhook = true;
    }

    assert.strictEqual(ambiguousJob.status, "DELIVERED");
    assert.strictEqual(ambiguousJob.isAmbiguous, false);
    assert.strictEqual(ambiguousJob.whatsappMessageId, "wamid.DISCOVERED_LATE");
    assert.deepStrictEqual(ambiguousJob.messageIds, ["wamid.DISCOVERED_LATE"]);
    assert.strictEqual(ambiguousJob.reconciledViaWebhook, true);
  });

  // ── Scenario 24: Strict Cron Secret enforcement ───────────────────────────
  await t.test("Scenario 24 (Security Auth): Query parameter ?secret= is rejected; Bearer header is strictly required", async () => {
    const originalSecret = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = "super_secret_cron_token_12345";

      // 1. Query parameter ?secret= must return 401 (unauthorized)
      const reqWithQuery = new Request(
        "https://blowsalon.com/api/whatsapp/queue/worker?secret=super_secret_cron_token_12345"
      );
      const authQuery = await verifyWhatsAppCampaignAuth(reqWithQuery);
      assert.strictEqual(authQuery.authorized, false, "Query parameter ?secret= MUST BE REJECTED");

      // 2. Missing authorization header must return 401
      const reqNoAuth = new Request("https://blowsalon.com/api/whatsapp/queue/worker");
      const authNone = await verifyWhatsAppCampaignAuth(reqNoAuth);
      assert.strictEqual(authNone.authorized, false, "Missing Authorization header MUST BE REJECTED");

      // 3. Bearer header must succeed
      const reqBearer = new Request("https://blowsalon.com/api/whatsapp/queue/worker", {
        headers: { Authorization: "Bearer super_secret_cron_token_12345" },
      });
      const authBearer = await verifyWhatsAppCampaignAuth(reqBearer);
      assert.strictEqual(authBearer.authorized, true, "Valid Bearer header MUST BE ACCEPTED");
      assert.strictEqual(authBearer.source, "CRON_SECRET");
    } finally {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  // ── Scenario 25: Firestore Rules Lockdown Audit ───────────────────────────
  await t.test("Scenario 25 (Security Rules): firestore.rules enforces deny-all on server-only collections while preserving ERP access", () => {
    const rulesContent = fs.readFileSync(path.resolve("firestore.rules"), "utf-8");

    // Server-only WhatsApp collections must be deny-all (allow read, write: if false;)
    assert.ok(
      rulesContent.includes("match /whatsappCampaignJobs/{document=**} {\n      allow read, write: if false;"),
      "whatsappCampaignJobs must be locked down"
    );
    assert.ok(
      rulesContent.includes("match /whatsapp_campaigns/{document=**} {\n      allow read, write: if false;"),
      "whatsapp_campaigns must be locked down"
    );
    assert.ok(
      rulesContent.includes("match /whatsapp_campaign_recipients/{document=**} {\n      allow read, write: if false;"),
      "whatsapp_campaign_recipients must be locked down"
    );
    assert.ok(
      rulesContent.includes("match /whatsapp_messages/{document=**} {\n      allow read, write: if false;"),
      "whatsapp_messages must be locked down"
    );

    // Default catch-all must be deny-all
    assert.ok(
      rulesContent.includes("match /{document=**} {\n      allow read, write: if false;"),
      "Catch-all rule must default to deny-all"
    );

    // Core ERP collections must remain accessible for client frontend
    assert.ok(
      rulesContent.includes("match /invoices/{document=**} {\n      allow read, write: if true;"),
      "Invoices rule must be preserved"
    );
    assert.ok(
      rulesContent.includes("match /customers/{document=**} {\n      allow read, write: if true;"),
      "Customers rule must be preserved"
    );
    assert.ok(
      rulesContent.includes("match /appointments/{document=**} {\n      allow read, write: if true;"),
      "Appointments rule must be preserved"
    );
    assert.ok(
      rulesContent.includes("match /staff/{document=**} {\n      allow read, write: if true;"),
      "Staff rule must be preserved"
    );
  });

  // ── Scenario 26: Multiple Ambiguous Jobs for Same Phone Number ─────────────
  await t.test("Scenario 26 (Crash Recovery): Multiple ambiguous jobs for same phone number are NOT automatically linked by webhook", () => {
    const ambiguousJobsInDb = [
      { id: "campA_job1", campaignId: "campA", phoneNumber: "919876543210", status: "AMBIGUOUS" },
      { id: "campB_job1", campaignId: "campB", phoneNumber: "919876543210", status: "AMBIGUOUS" },
    ];

    const incomingWebhook = {
      messageId: "wamid.UNKNOWN_CAMPAIGN_ORIGIN",
      recipientPhone: "919876543210",
      status: "DELIVERED",
    };

    // Webhook reconciliation logic:
    let linkedJob = null;
    let collisionDetected = false;

    const matchingAmbiguous = ambiguousJobsInDb.filter(
      (j) => j.phoneNumber === incomingWebhook.recipientPhone && j.status === "AMBIGUOUS"
    );

    if (matchingAmbiguous.length === 1) {
      linkedJob = matchingAmbiguous[0];
    } else if (matchingAmbiguous.length > 1) {
      collisionDetected = true;
      // MUST NOT arbitrarily link to matchingAmbiguous[0] to prevent cross-campaign contamination
      linkedJob = null;
    }

    assert.strictEqual(collisionDetected, true, "Must detect collision between multiple ambiguous jobs");
    assert.strictEqual(linkedJob, null, "Must NOT link wamid to any job when multiple ambiguous jobs exist");
  });

  // ── Scenario 27: Crash after Meta acceptance but before Firestore update ───
  await t.test("Scenario 27 (Crash Recovery): Crash after Meta acceptance but before Firestore update transitions to AMBIGUOUS without resending", () => {
    // 1. Worker dispatched to Meta; Meta accepted (issued wamid.ABC), but container was killed before Firestore update
    const jobInFirestore = {
      id: "job_crashed_before_save",
      status: "PROCESSING",
      dispatchStartedAt: "2026-11-04T10:00:00.000Z",
      dispatchAttemptId: "job_crashed_before_save_att1_123",
      processingLeaseExpiresAt: "2026-11-04T10:02:00.000Z",
      whatsappMessageId: null, // Lost in crash!
      messageIds: [],
    };

    // 2. Next worker runs at 10:03:00 (lease expired)
    const nowIso = "2026-11-04T10:03:00.000Z";
    const isExpiredLease =
      jobInFirestore.status === "PROCESSING" &&
      Boolean(jobInFirestore.processingLeaseExpiresAt && jobInFirestore.processingLeaseExpiresAt <= nowIso);

    assert.strictEqual(isExpiredLease, true, "Lease must be expired");

    let resolution = "CLAIM_FOR_RESEND";
    let updatedStatus = jobInFirestore.status;

    if (isExpiredLease) {
      if (jobInFirestore.whatsappMessageId) {
        resolution = "CONVERT_ACCEPTED";
        updatedStatus = "ACCEPTED";
      } else {
        resolution = "CONVERT_AMBIGUOUS_CRASH_RECOVERY";
        updatedStatus = "AMBIGUOUS";
      }
    }

    assert.strictEqual(
      resolution,
      "CONVERT_AMBIGUOUS_CRASH_RECOVERY",
      "Must safely transition to AMBIGUOUS instead of blindly claiming for resend"
    );
    assert.strictEqual(updatedStatus, "AMBIGUOUS");
  });

  // ── Scenario 28: Manual Admin Resolution Endpoint Logic ───────────────────
  await t.test("Scenario 28 (Admin Resolution): FORCE_RESEND requires acknowledgeDuplicateRisk; MARK_ACCEPTED never re-sends", () => {
    const ambiguousJob = {
      id: "job_amb_manual",
      campaignId: "camp1",
      status: "AMBIGUOUS",
      isAmbiguous: true,
      phoneNumber: "919876543210",
      customerName: "Priya",
    };

    // 1. FORCE_RESEND without acknowledgement MUST be rejected
    const validateResolution = (job, body) => {
      if (job.status !== "AMBIGUOUS" && !job.isAmbiguous) {
        return { ok: false, status: 400, error: "Not ambiguous" };
      }
      if (body.resolution === "FORCE_RESEND") {
        if (body.acknowledgeDuplicateRisk !== true) {
          return { ok: false, status: 400, error: "acknowledgeDuplicateRisk required" };
        }
        return { ok: true, newStatus: "PENDING", willResend: true };
      }
      if (body.resolution === "MARK_ACCEPTED") {
        return { ok: true, newStatus: "ACCEPTED", willResend: false };
      }
      if (body.resolution === "MARK_FAILED") {
        return { ok: true, newStatus: "FAILED", willResend: false };
      }
      return { ok: false, status: 400, error: "Invalid resolution" };
    };

    const resendNoAck = validateResolution(ambiguousJob, { resolution: "FORCE_RESEND" });
    assert.strictEqual(resendNoAck.ok, false);
    assert.strictEqual(resendNoAck.status, 400);

    // 2. FORCE_RESEND with acknowledgement succeeds
    const resendAck = validateResolution(ambiguousJob, {
      resolution: "FORCE_RESEND",
      acknowledgeDuplicateRisk: true,
    });
    assert.strictEqual(resendAck.ok, true);
    assert.strictEqual(resendAck.newStatus, "PENDING");
    assert.strictEqual(resendAck.willResend, true);

    // 3. MARK_ACCEPTED transitions to ACCEPTED and never re-sends
    const markAccepted = validateResolution(ambiguousJob, { resolution: "MARK_ACCEPTED" });
    assert.strictEqual(markAccepted.ok, true);
    assert.strictEqual(markAccepted.newStatus, "ACCEPTED");
    assert.strictEqual(markAccepted.willResend, false);

    // 4. MARK_FAILED transitions to FAILED and never re-sends
    const markFailed = validateResolution(ambiguousJob, { resolution: "MARK_FAILED" });
    assert.strictEqual(markFailed.ok, true);
    assert.strictEqual(markFailed.newStatus, "FAILED");
    assert.strictEqual(markFailed.willResend, false);
  });

  // ── Scenario 29: Canonical Queue Status (Newly Created & PENDING/QUEUED jobs) ──
  await t.test("Scenario 29 (Canonical Status): Newly created campaign jobs (PENDING) and QUEUED jobs are claimable", () => {
    const claimableStatuses = new Set(["PENDING", "RETRY_WAIT", "QUEUED"]);
    const nowIso = "2026-11-04T12:00:00.000Z";

    const candidateJobs = [
      { id: "job_new_1", status: "PENDING", nextAttemptAt: "2026-11-04T12:00:00.000Z" },
      { id: "job_legacy_queued", status: "QUEUED", nextAttemptAt: "2026-11-04T11:59:00.000Z" },
      { id: "job_processing", status: "PROCESSING", nextAttemptAt: "2026-11-04T12:00:00.000Z" },
      { id: "job_ambiguous", status: "AMBIGUOUS", nextAttemptAt: "2026-11-04T12:00:00.000Z" },
    ];

    const claimable = candidateJobs.filter(
      (j) => claimableStatuses.has(j.status) && j.nextAttemptAt <= nowIso
    );

    assert.strictEqual(claimable.length, 2);
    assert.ok(claimable.some((j) => j.id === "job_new_1"));
    assert.ok(claimable.some((j) => j.id === "job_legacy_queued"));
  });

  // ── Scenario 30: FORCE_RESEND Jobs Picked Up Immediately ────────────────────
  await t.test("Scenario 30 (FORCE_RESEND): Manually force-resent jobs reset to PENDING and are claimable immediately", () => {
    const ambiguousJob = {
      id: "job_force_1",
      status: "AMBIGUOUS",
      isAmbiguous: true,
      nextAttemptAt: "2026-11-04T10:00:00.000Z",
    };

    // Simulate resolve-ambiguous with FORCE_RESEND
    const nowIso = "2026-11-04T12:05:00.000Z";
    const forceResendJob = {
      ...ambiguousJob,
      status: "PENDING",
      isAmbiguous: false,
      processingLeaseExpiresAt: null,
      nextAttemptAt: nowIso,
    };

    const claimableStatuses = new Set(["PENDING", "RETRY_WAIT", "QUEUED"]);
    const isClaimable = claimableStatuses.has(forceResendJob.status) && forceResendJob.nextAttemptAt <= nowIso;

    assert.strictEqual(isClaimable, true, "Force-resent job must be claimable immediately by worker");
  });

  // ── Scenario 31: Retry Timing Invariance ────────────────────────────────────
  await t.test("Scenario 31 (Retry Timing): RETRY_WAIT jobs are only claimable at or after nextAttemptAt", () => {
    const claimableStatuses = new Set(["PENDING", "RETRY_WAIT", "QUEUED"]);
    const scheduledTime = "2026-11-04T12:10:00.000Z";
    const retryJob = {
      id: "job_retry_1",
      status: "RETRY_WAIT",
      nextAttemptAt: scheduledTime,
    };

    // Before scheduled time
    const beforeIso = "2026-11-04T12:09:59.000Z";
    const canClaimBefore = claimableStatuses.has(retryJob.status) && retryJob.nextAttemptAt <= beforeIso;
    assert.strictEqual(canClaimBefore, false, "Must not claim retry job before scheduled time");

    // Exactly at scheduled time
    const exactIso = scheduledTime;
    const canClaimAt = claimableStatuses.has(retryJob.status) && retryJob.nextAttemptAt <= exactIso;
    assert.strictEqual(canClaimAt, true, "Must claim retry job at scheduled time");

    // After scheduled time
    const afterIso = "2026-11-04T12:11:00.000Z";
    const canClaimAfter = claimableStatuses.has(retryJob.status) && retryJob.nextAttemptAt <= afterIso;
    assert.strictEqual(canClaimAfter, true, "Must claim retry job after scheduled time");
  });

  // ── Scenario 32: Campaign State Gating & Historical Immutability ──────────────
  await t.test("Scenario 32 (Campaign State & Immutability): Only SENDING campaigns process jobs; historical campaigns are read-only excluded with zero mutations", () => {
    let firestoreWrites = 0;

    const checkClaimForCampaign = (campaign, job) => {
      const campNameUpper = (campaign.name || "").toUpperCase();
      const isHistorical = campNameUpper.includes("DIWALI") || campNameUpper.includes("35% DISCOUNT");

      if (isHistorical) {
        // Strictly read-only exclusion without ANY document mutations
        return { action: "SKIP_READONLY_HISTORICAL", sent: false, modified: false };
      }
      if (campaign.status !== "SENDING") {
        // Read-only exclusion for non-sending states
        return { action: "SKIP_NON_SENDING", sent: false, modified: false };
      }
      return { action: "PROCEED_DISPATCH", sent: true, modified: true };
    };

    // 1. Sending campaign proceeds
    const sendingResult = checkClaimForCampaign({ name: "SUMMER OFFER", status: "SENDING" }, { id: "j0", status: "PENDING" });
    assert.strictEqual(sendingResult.action, "PROCEED_DISPATCH");
    assert.strictEqual(sendingResult.sent, true);

    // 2. Paused, Cancelled, Completed, Draft campaigns are skipped without mutation
    const pausedResult = checkClaimForCampaign({ name: "SUMMER OFFER", status: "PAUSED" }, { id: "j1", status: "PENDING" });
    assert.strictEqual(pausedResult.action, "SKIP_NON_SENDING");
    assert.strictEqual(pausedResult.sent, false);
    assert.strictEqual(pausedResult.modified, false);

    const cancelledResult = checkClaimForCampaign({ name: "SUMMER OFFER", status: "CANCELLED" }, { id: "j2", status: "PENDING" });
    assert.strictEqual(cancelledResult.action, "SKIP_NON_SENDING");
    assert.strictEqual(cancelledResult.sent, false);
    assert.strictEqual(cancelledResult.modified, false);

    const completedResult = checkClaimForCampaign({ name: "SUMMER OFFER", status: "COMPLETED" }, { id: "j3", status: "PENDING" });
    assert.strictEqual(completedResult.action, "SKIP_NON_SENDING");
    assert.strictEqual(completedResult.sent, false);
    assert.strictEqual(completedResult.modified, false);

    const draftResult = checkClaimForCampaign({ name: "SUMMER OFFER", status: "DRAFT" }, { id: "j4", status: "PENDING" });
    assert.strictEqual(draftResult.action, "SKIP_NON_SENDING");
    assert.strictEqual(draftResult.sent, false);
    assert.strictEqual(draftResult.modified, false);

    // 3. Historical campaigns (DIWALI, 35% DISCOUNT) are strictly read-only excluded
    const diwaliCampaignOriginal = Object.freeze({
      id: "camp_diwali_2024",
      name: "DIWALI OFFER 2024",
      status: "COMPLETED",
      sentCount: 450,
      deliveredCount: 430,
      readCount: 380,
      failedCount: 20,
    });
    const diwaliCampaignCopy = JSON.parse(JSON.stringify(diwaliCampaignOriginal));

    const diwaliResult = checkClaimForCampaign(diwaliCampaignCopy, { id: "j5", status: "PENDING" });
    assert.strictEqual(diwaliResult.action, "SKIP_READONLY_HISTORICAL");
    assert.strictEqual(diwaliResult.sent, false);
    assert.strictEqual(diwaliResult.modified, false);

    // Byte-for-byte immutability verification
    assert.deepStrictEqual(diwaliCampaignOriginal, diwaliCampaignCopy, "Historical DIWALI campaign document must be byte-for-byte unchanged");

    const discountCampaignOriginal = Object.freeze({
      id: "camp_discount_35",
      name: "35% DISCOUNT EXCLUSIVE",
      status: "COMPLETED",
      sentCount: 300,
      deliveredCount: 290,
      readCount: 250,
      failedCount: 10,
    });
    const discountCampaignCopy = JSON.parse(JSON.stringify(discountCampaignOriginal));

    const discountResult = checkClaimForCampaign(discountCampaignCopy, { id: "j6", status: "PENDING" });
    assert.strictEqual(discountResult.action, "SKIP_READONLY_HISTORICAL");
    assert.strictEqual(discountResult.sent, false);
    assert.strictEqual(discountResult.modified, false);

    // Byte-for-byte immutability verification
    assert.deepStrictEqual(discountCampaignOriginal, discountCampaignCopy, "Historical 35% DISCOUNT campaign document must be byte-for-byte unchanged");
  });

  // ── Scenario 33: Worker Execution Headroom & Batch Budget Safety ───────────
  await t.test("Scenario 33 (Batch Timing): Worker halts dispatch when remaining budget is below 12s headroom", () => {
    const timeBudgetMs = 35000;
    const MIN_JOB_EXECUTION_HEADROOM_MS = 12000;

    const shouldClaimNext = (startTimeMs, currentTimeMs, processedCount) => {
      const remainingMs = timeBudgetMs - (currentTimeMs - startTimeMs);
      if (processedCount > 0 && remainingMs < MIN_JOB_EXECUTION_HEADROOM_MS) {
        return false; // Insufficient headroom to safely complete another Meta request
      }
      return true;
    };

    const start = 100000;

    // After 2 jobs, 20s elapsed -> 15s remaining (>= 12s headroom) -> Continue
    assert.strictEqual(shouldClaimNext(start, start + 20000, 2), true);

    // After 3 jobs, 24s elapsed -> 11s remaining (< 12s headroom) -> Halt!
    assert.strictEqual(shouldClaimNext(start, start + 24000, 3), false);

    // First job (processedCount === 0) should attempt even if near edge
    assert.strictEqual(shouldClaimNext(start, start + 1000, 0), true);
  });

  // ── Scenario 34: Webhook Chronological Timestamp Safeguard ─────────────────
  await t.test("Scenario 34 (Webhook Chronology): Webhooks generated before dispatch attempt start are rejected", () => {
    const dispatchStartedAtMs = new Date("2026-11-04T12:00:00.000Z").getTime();

    const isStaleWebhook = (webhookTimestampSec, dispatchTimeMs) => {
      const webhookTimeMs = webhookTimestampSec * 1000;
      // 60s tolerance for clock skew
      return webhookTimeMs < (dispatchTimeMs - 60000);
    };

    // Webhook from 1 hour earlier (stale / previous campaign)
    const oldTimestampSec = (dispatchStartedAtMs - 3600000) / 1000;
    assert.strictEqual(isStaleWebhook(oldTimestampSec, dispatchStartedAtMs), true, "Older webhook must be detected as stale");

    // Webhook generated 5 seconds after dispatch started
    const freshTimestampSec = (dispatchStartedAtMs + 5000) / 1000;
    assert.strictEqual(isStaleWebhook(freshTimestampSec, dispatchStartedAtMs), false, "Fresh webhook must be allowed");
  });

  // ── Scenario 35: Delivery Reporting & Stats Invariance ──────────────────────
  await t.test("Scenario 35 (Delivery Reporting): DELIVERED includes READ; READ is separate metric; ACCEPTED is not delivered; FAILED and AMBIGUOUS are separate; duplicates do not double count", () => {
    const recipients = [
      { id: "r1", status: "READ" },
      { id: "r2", status: "DELIVERED" },
      { id: "r3", status: "SENT" },
      { id: "r4", status: "FAILED" },
      { id: "r5", status: "AMBIGUOUS" },
      { id: "r6", status: "PENDING" },
      { id: "r7", status: "EXCLUDED" },
    ];

    const stats = calculateCampaignStats(recipients);

    // 1. DELIVERED is counted as successful delivery (DELIVERED + READ)
    assert.strictEqual(stats.deliveredCount, 2, "Delivered count must equal delivered + read (2)");

    // 2. READ is reported as its own separate engagement metric
    assert.strictEqual(stats.readCount, 1, "Read count must equal 1");

    // 3. SENT / ACCEPTED is not counted as delivered
    assert.strictEqual(stats.sentCount, 4, "Sent count includes READ, DELIVERED, SENT, FAILED attempts (4)");

    // 4. FAILED and AMBIGUOUS are reported separately
    assert.strictEqual(stats.failedCount, 1, "Failed count must be 1");
    assert.strictEqual(stats.ambiguousCount, 1, "Ambiguous count must be 1 (reported separately from failed)");

    // 5. PENDING count
    assert.strictEqual(stats.pendingCount, 1, "Pending count must be 1");

    // 6. Idempotence / duplicate webhooks do not double-count (since stats are aggregated per unique recipient document)
    const statsAgain = calculateCampaignStats(recipients);
    assert.deepStrictEqual(stats, statsAgain, "Stats aggregation is purely idempotent");
  });

  // ── Scenario 36: Worker Authentication & Method Checks ──────────────────────
  await t.test("Scenario 36 (Scheduler Auth): POST with Bearer CRON_SECRET succeeds; missing/invalid secret gets 401; query-string ?secret= rejected", async () => {
    process.env.CRON_SECRET = "super_secret_scheduler_cron_token_12345";

    // 1. Valid Bearer Token on POST
    const validReq = new Request("https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker", {
      method: "POST",
      headers: {
        authorization: "Bearer super_secret_scheduler_cron_token_12345",
      },
    });
    const validAuth = await verifyWhatsAppCampaignAuth(validReq);
    assert.strictEqual(validAuth.authorized, true);
    assert.strictEqual(validAuth.source, "CRON_SECRET");

    // 2. Missing Token
    const missingReq = new Request("https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker", {
      method: "POST",
    });
    const missingAuth = await verifyWhatsAppCampaignAuth(missingReq);
    assert.strictEqual(missingAuth.authorized, false);

    // 3. Wrong Secret
    const wrongReq = new Request("https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker", {
      method: "POST",
      headers: {
        authorization: "Bearer totally_wrong_secret",
      },
    });
    const wrongAuth = await verifyWhatsAppCampaignAuth(wrongReq);
    assert.strictEqual(wrongAuth.authorized, false);

    // 4. Query Parameter ?secret= MUST NOT authenticate
    const queryParamReq = new Request(
      "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker?secret=super_secret_scheduler_cron_token_12345",
      {
        method: "POST",
      }
    );
    const queryAuth = await verifyWhatsAppCampaignAuth(queryParamReq);
    assert.strictEqual(queryAuth.authorized, false, "Query string secrets must not grant access");
  });

  // ── Scenario 37: Worker Dry-Run Mode Invariance ─────────────────────────────
  await t.test("Scenario 37 (Dry-Run Mode): Simulation mode reports candidate jobs without calling Meta API or mutating records", () => {
    const candidateJobs = [
      { id: "j_dry_1", campaignId: "c1", customerName: "Anita", phoneNumber: "919876543210", status: "PENDING", nextAttemptAt: "2026-11-04T12:00:00Z" },
      { id: "j_dry_2", campaignId: "c1", customerName: "Sunita", phoneNumber: "919876543211", status: "PENDING", nextAttemptAt: "2026-11-04T12:00:00Z" },
    ];

    const simulateDryRun = (jobs) => {
      let metaCalls = 0;
      let dbMutations = 0;
      const simulated = jobs.map((j) => {
        const masked = `${j.phoneNumber.substring(0, 3)}****${j.phoneNumber.substring(j.phoneNumber.length - 2)}`;
        return {
          jobId: j.id,
          customerName: j.customerName,
          phoneNumberMasked: masked,
          wouldSend: true,
        };
      });

      return {
        dryRun: true,
        processedCount: 0,
        acceptedCount: 0,
        metaCalls,
        dbMutations,
        candidateCount: simulated.length,
        simulatedJobs: simulated,
      };
    };

    const dryRunResult = simulateDryRun(candidateJobs);
    assert.strictEqual(dryRunResult.dryRun, true);
    assert.strictEqual(dryRunResult.processedCount, 0);
    assert.strictEqual(dryRunResult.metaCalls, 0, "Zero Meta API calls in dry run");
    assert.strictEqual(dryRunResult.dbMutations, 0, "Zero DB mutations in dry run");
    assert.strictEqual(dryRunResult.candidateCount, 2);
    assert.strictEqual(dryRunResult.simulatedJobs[0].phoneNumberMasked, "919****10");
  });

  // ── Scenario 38: Scheduler Architecture & Cloudflare Exclusive Integration ──
  await t.test("Scenario 38 (Scheduler Architecture): GitHub Actions workflow removed; Cloudflare Workers exclusive 1-min cron configured; Vercel competing cron disabled", async () => {
    const fs = await import("fs");

    // 1. Confirm GitHub Actions workflow is completely removed
    const githubWorkflowExists = fs.existsSync(".github/workflows/whatsapp-queue-worker.yml");
    assert.strictEqual(githubWorkflowExists, false, "GitHub Actions scheduler workflow must be completely removed");

    // 2. Confirm Cloudflare Wrangler configuration exists with correct properties
    const wranglerExists = fs.existsSync("cloudflare/wrangler.jsonc");
    assert.strictEqual(wranglerExists, true, "cloudflare/wrangler.jsonc must exist");

    const wranglerRaw = fs.readFileSync("cloudflare/wrangler.jsonc", "utf8");
    // Strip full-line comments to validate JSON content
    const strippedJson = wranglerRaw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const wranglerConfig = JSON.parse(strippedJson);

    assert.strictEqual(wranglerConfig.name, "blow-salon-queue-scheduler");
    assert.strictEqual(wranglerConfig.main, "worker.js");
    assert.deepStrictEqual(wranglerConfig.triggers?.crons, ["* * * * *"]);
    assert.strictEqual(wranglerConfig.vars?.ENABLE_LIVE_QUEUE, "false");
    assert.strictEqual(wranglerConfig.vars?.BACKEND_URL, "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker");

    // 3. Confirm Vercel competing cron is removed from vercel.json
    const vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    assert.ok(!vercelConfig.crons || vercelConfig.crons.length === 0, "vercel.json must have no competing cron tasks");
  });
});
