import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionStatus, FORWARD_DELIVERY_RANK, maskWamid } from "../lib/whatsapp/statusTransitions.ts";
import { calculateCampaignStats } from "../lib/whatsapp/campaignStats.ts";
import { sanitizeFirestoreDoc } from "../lib/utils/firestore.ts";
import { parseWhatsAppFailure } from "../lib/whatsapp/errorClassifier.ts";

/**
 * Strict validator simulating Firestore Admin SDK behavior (rejects any undefined values)
 */
function assertNoUndefined(obj, path = "root") {
  if (obj === undefined) {
    throw new Error(`Invalid Firestore value: "undefined" found at path "${path}"`);
  }
  if (obj === null || typeof obj !== "object") return;
  if (obj instanceof Date) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoUndefined(item, `${path}[${idx}]`));
    return;
  }
  for (const [key, val] of Object.entries(obj)) {
    assertNoUndefined(val, `${path}.${key}`);
  }
}

test("BLOW SALON — WhatsApp Webhook Failure Reconciliation & Status Progression Suite", async (t) => {
  // ── 1. Phase 1: Status Transition Rules ─────────────────────────────────────
  await t.test("Requirement 1: ACCEPTED -> FAILED must be allowed", () => {
    const decision = canTransitionStatus("ACCEPTED", "FAILED");
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.action, "APPLY_UPDATE");
  });

  await t.test("Requirement 2: SENT -> FAILED must be allowed", () => {
    const decision = canTransitionStatus("SENT", "FAILED");
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.action, "APPLY_UPDATE");
  });

  await t.test("Requirement 3: PROCESSING -> FAILED must be allowed", () => {
    const decision = canTransitionStatus("PROCESSING", "FAILED");
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.action, "APPLY_UPDATE");
  });

  await t.test("Requirement 4: SENT -> DELIVERED must be allowed", () => {
    const decision = canTransitionStatus("SENT", "DELIVERED");
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.action, "APPLY_UPDATE");
  });

  await t.test("Requirement 5: DELIVERED -> READ must be allowed", () => {
    const decision = canTransitionStatus("DELIVERED", "READ");
    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.action, "APPLY_UPDATE");
  });

  await t.test("Requirement 6: DELIVERED -> FAILED must NOT be allowed (cannot downgrade confirmed delivery)", () => {
    const decision = canTransitionStatus("DELIVERED", "FAILED");
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.action, "SKIP_DOWNGRADE");
  });

  await t.test("Requirement 7: READ -> FAILED must NOT be allowed (cannot downgrade confirmed read)", () => {
    const decision = canTransitionStatus("READ", "FAILED");
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.action, "SKIP_DOWNGRADE");
  });

  await t.test("Requirement 8: Duplicate webhook events must be idempotent", () => {
    const dupDelivered = canTransitionStatus("DELIVERED", "DELIVERED");
    assert.strictEqual(dupDelivered.allowed, false);
    assert.strictEqual(dupDelivered.action, "IDEMPOTENT_NOOP");

    const dupRead = canTransitionStatus("READ", "READ");
    assert.strictEqual(dupRead.allowed, false);
    assert.strictEqual(dupRead.action, "IDEMPOTENT_NOOP");

    const dupFailed = canTransitionStatus("FAILED", "FAILED");
    assert.strictEqual(dupFailed.allowed, false);
    assert.strictEqual(dupFailed.action, "IDEMPOTENT_NOOP");

    const dupAccepted = canTransitionStatus("ACCEPTED", "ACCEPTED");
    assert.strictEqual(dupAccepted.allowed, false);
    assert.strictEqual(dupAccepted.action, "IDEMPOTENT_NOOP");
  });

  await t.test("Requirement 9: Older events must not overwrite newer confirmed delivery states", () => {
    assert.strictEqual(canTransitionStatus("READ", "DELIVERED").allowed, false);
    assert.strictEqual(canTransitionStatus("READ", "DELIVERED").action, "SKIP_DOWNGRADE");

    assert.strictEqual(canTransitionStatus("READ", "SENT").allowed, false);
    assert.strictEqual(canTransitionStatus("READ", "SENT").action, "SKIP_DOWNGRADE");

    assert.strictEqual(canTransitionStatus("DELIVERED", "SENT").allowed, false);
    assert.strictEqual(canTransitionStatus("DELIVERED", "SENT").action, "SKIP_DOWNGRADE");

    assert.strictEqual(canTransitionStatus("DELIVERED", "ACCEPTED").allowed, false);
    assert.strictEqual(canTransitionStatus("DELIVERED", "ACCEPTED").action, "SKIP_DOWNGRADE");
  });

  // ── 2. Phase 2: Meta Error Extraction & Persistence ─────────────────────────
  await t.test("Phase 2: Extract errors array with code, title, message, error_data.details", () => {
    const statusObj = {
      id: "wamid.HBgMOTE5NzA0OTk4MDI2FQIAERgUQ0U4Q0VFNEQ3MUUzMzBDQkE3QzYA",
      status: "failed",
      timestamp: "1730869734",
      recipient_id: "919704998026",
      errors: [
        {
          code: 131049,
          title: "Message failed to send",
          message: "Message failed to send due to a policy violation or frequency capping",
          error_data: {
            details: "Cloud API message rejected: healthy ecosystem engagement",
          },
        },
      ],
    };

    const primaryError = statusObj.errors[0];
    const metaErrorCode = primaryError.code;
    const metaErrorTitle = primaryError.title;
    const metaErrorMessage = primaryError.message;
    const metaErrorDataDetails = primaryError.error_data.details;

    assert.strictEqual(metaErrorCode, 131049);
    assert.strictEqual(metaErrorTitle, "Message failed to send");
    assert.strictEqual(metaErrorMessage, "Message failed to send due to a policy violation or frequency capping");
    assert.strictEqual(metaErrorDataDetails, "Cloud API message rejected: healthy ecosystem engagement");

    const failureClass = parseWhatsAppFailure(
      [metaErrorTitle, metaErrorMessage, metaErrorDataDetails].filter(Boolean).join(" - "),
      metaErrorCode
    );
    assert.strictEqual(failureClass.classification, "ECOSYSTEM_DECLINE");
    assert.strictEqual(failureClass.metaErrorCode, "131049");
  });

  await t.test("Phase 2: Missing errors array does not crash and provides graceful fallback", () => {
    const statusObjNoErrors = {
      id: "wamid.TEST_NO_ERRORS",
      status: "failed",
      timestamp: "1730869734",
      recipient_id: "919704998026",
    };

    const errorsArray = Array.isArray(statusObjNoErrors.errors) ? statusObjNoErrors.errors : [];
    const primaryError = errorsArray[0] || null;

    const metaErrorCode = primaryError?.code || null;
    const metaErrorTitle = primaryError?.title || null;
    const metaErrorMessage = primaryError?.message || null;
    const metaErrorDataDetails = primaryError?.error_data?.details || null;

    const errorDescription = metaErrorDataDetails || metaErrorMessage || metaErrorTitle || (metaErrorCode ? `Meta error ${metaErrorCode}` : "Message delivery failed");
    assert.strictEqual(errorDescription, "Message delivery failed");

    const failureClass = parseWhatsAppFailure(errorDescription, metaErrorCode);
    assert.strictEqual(failureClass.shortReason, "Message delivery failed");
  });

  await t.test("Phase 2: Multiple errors array formatted cleanly into allErrorsSummary", () => {
    const statusObjMulti = {
      id: "wamid.TEST_MULTI",
      status: "failed",
      errors: [
        { code: 131056, title: "Pair rate limit", message: "Too many messages" },
        { code: 130429, title: "Rate limit", error_data: { details: "Throughput exceeded" } },
      ],
    };

    const errorsArray = statusObjMulti.errors;
    const allErrorsSummary = errorsArray
      .map((e, idx) => {
        const c = e.code ? `[Code ${e.code}] ` : "";
        const t = e.title ? `${e.title}: ` : "";
        const m = e.error_data?.details || e.message || "";
        return `${idx + 1}. ${c}${t}${m}`.trim();
      })
      .join("; ");

    assert.ok(allErrorsSummary.includes("[Code 131056] Pair rate limit: Too many messages"));
    assert.ok(allErrorsSummary.includes("[Code 130429] Rate limit: Throughput exceeded"));
  });

  await t.test("Phase 2: WAMID masking protects message hashes while preserving prefix/suffix", () => {
    const wamid = "wamid.HBgMOTE5NzA0OTk4MDI2FQIAERgUQ0U4Q0VFNEQ3MUUzMzBDQkE3QzYA";
    const masked = maskWamid(wamid);
    assert.strictEqual(masked, "wamid.HBgM...E3QzYA");
    assert.ok(!masked.includes("MOTE5NzA0OTk4MDI2FQIAERgUQ0U4Q0VFNEQ3"));
  });

  // ── 3. Phase 3: Firestore Document Sanitization for all 3 collections ─────────
  await t.test("Phase 3: Sanitizes job update payload on FAILED webhook with zero undefined values", () => {
    const jobUpdate = {
      status: "FAILED",
      isAmbiguous: false,
      updatedAt: "2026-11-06T05:08:54.634Z",
      failedAt: "2026-11-06T05:08:54.634Z",
      lastError: "Marketing delivery restricted",
      metaErrorCode: 131049,
      metaErrorDetails: "Cloud API message rejected: healthy ecosystem engagement",
      classification: "ECOSYSTEM_DECLINE",
      errorSource: "WEBHOOK",
      readAt: undefined, // Must be stripped
      deliveredAt: undefined, // Must be stripped
    };

    const sanitized = sanitizeFirestoreDoc(jobUpdate);
    assertNoUndefined(sanitized);
    assert.strictEqual("readAt" in sanitized, false);
    assert.strictEqual("deliveredAt" in sanitized, false);
    assert.strictEqual(sanitized.status, "FAILED");
    assert.strictEqual(sanitized.metaErrorCode, 131049);
  });

  await t.test("Phase 3: Sanitizes recipient attempts array on FAILED webhook with zero undefined values", () => {
    const existingAttempts = [
      {
        attempt: 1,
        status: "SENT",
        sentAt: "2026-11-06T05:08:42.875Z",
        metaMessageId: "wamid.TEST123",
      },
    ];

    const newAttempt = {
      attempt: 1,
      status: "FAILED",
      sentAt: "2026-11-06T05:08:42.875Z",
      metaMessageId: "wamid.TEST123",
      errorMessage: "Marketing delivery restricted",
      errorCode: "131049",
      deliveredAt: undefined,
      readAt: undefined,
    };

    const recUpdate = {
      status: "FAILED",
      updatedAt: "2026-11-06T05:08:54.634Z",
      failedAt: "2026-11-06T05:08:54.634Z",
      errorMessage: "Marketing delivery restricted",
      errorCode: "131049",
      metaErrorDetails: "Cloud API message rejected: healthy ecosystem engagement",
      classification: "ECOSYSTEM_DECLINE",
      errorSource: "WEBHOOK",
      attempts: [...existingAttempts, newAttempt],
    };

    const sanitized = sanitizeFirestoreDoc(recUpdate);
    assertNoUndefined(sanitized);
    assert.strictEqual(sanitized.attempts.length, 2);
    assert.strictEqual("deliveredAt" in sanitized.attempts[1], false);
    assert.strictEqual("readAt" in sanitized.attempts[1], false);
  });

  await t.test("Phase 3: Sanitizes message audit payload on FAILED webhook with zero undefined values", () => {
    const msgUpdate = {
      status: "FAILED",
      updatedAt: "2026-11-06T05:08:54.634Z",
      failedAt: "2026-11-06T05:08:54.634Z",
      errorMessage: "Marketing delivery restricted",
      errorCode: "131049",
      metaErrorDetails: "Cloud API message rejected: healthy ecosystem engagement",
      classification: "ECOSYSTEM_DECLINE",
      errorSource: "WEBHOOK",
      readAt: undefined,
      deliveredAt: undefined,
    };

    const sanitized = sanitizeFirestoreDoc(msgUpdate);
    assertNoUndefined(sanitized);
    assert.strictEqual("readAt" in sanitized, false);
    assert.strictEqual("deliveredAt" in sanitized, false);
  });

  // ── 4. Phase 4: Campaign Statistics Calculation & Reconciliation ─────────────
  await t.test("Phase 4: Campaign stats calculation with 1 DELIVERED and 4 FAILED matches test3 reality", () => {
    const recipients = [
      { id: "rec1", status: "DELIVERED" },
      { id: "rec2", status: "FAILED" },
      { id: "rec3", status: "FAILED" },
      { id: "rec4", status: "FAILED" },
      { id: "rec5", status: "FAILED" },
    ];

    const stats = calculateCampaignStats(recipients);
    assert.strictEqual(stats.totalRecipients, 5);
    assert.strictEqual(stats.sentCount, 5, "All 5 dispatched messages count towards sentCount");
    assert.strictEqual(stats.deliveredCount, 1, "Only 1 confirmed delivered");
    assert.strictEqual(stats.failedCount, 4, "4 confirmed failures");
    assert.strictEqual(stats.pendingCount, 0, "0 pending");
    assert.strictEqual(stats.status, "COMPLETED_WITH_ERRORS", "Partial failures mark campaign COMPLETED_WITH_ERRORS");
  });

  await t.test("Phase 4: Campaign stats tracks acceptedCount separately when jobs are in ACCEPTED", () => {
    const recipients = [
      { id: "rec1", status: "DELIVERED" },
      { id: "rec2", status: "ACCEPTED" },
      { id: "rec3", status: "ACCEPTED" },
      { id: "rec4", status: "ACCEPTED" },
      { id: "rec5", status: "ACCEPTED" },
    ];

    const stats = calculateCampaignStats(recipients);
    assert.strictEqual(stats.totalRecipients, 5);
    assert.strictEqual(stats.acceptedCount, 4, "4 recipients currently in ACCEPTED status");
    assert.strictEqual(stats.deliveredCount, 1, "1 delivered");
    assert.strictEqual(stats.failedCount, 0, "0 failed");
    assert.strictEqual(stats.pendingCount, 0);
  });

  // ── 5. End-to-End Simulation of Campaign test3 Webhook Flow ──────────────────
  await t.test("Phase 5: Simulates exact Campaign test3 lifecycle for all 5 recipients", () => {
    const state = {
      recipients: [
        { id: "rec_sricharan", status: "ACCEPTED", phone: "919704998026" },
        { id: "rec_yash", status: "ACCEPTED", phone: "919392376559" },
        { id: "rec_sindhu", status: "ACCEPTED", phone: "918688259135" },
        { id: "rec_srishanth", status: "ACCEPTED", phone: "918125902062" },
        { id: "rec_akhila", status: "ACCEPTED", phone: "919705989674" },
      ],
      jobs: [
        { id: "job_sricharan", status: "ACCEPTED" },
        { id: "job_yash", status: "ACCEPTED" },
        { id: "job_sindhu", status: "ACCEPTED" },
        { id: "job_srishanth", status: "ACCEPTED" },
        { id: "job_akhila", status: "ACCEPTED" },
      ],
    };

    // Incoming Webhooks:
    // 1. Sricharan -> delivered
    const sricharanTransition = canTransitionStatus(state.recipients[0].status, "DELIVERED");
    assert.strictEqual(sricharanTransition.allowed, true);
    state.recipients[0].status = "DELIVERED";
    state.jobs[0].status = "DELIVERED";

    // 2-5. Yash, Sindhu, Srishanth, Akhila -> failed
    for (let i = 1; i < 5; i++) {
      const decision = canTransitionStatus(state.recipients[i].status, "FAILED");
      assert.strictEqual(decision.allowed, true, `Recipient ${i} must allow ACCEPTED -> FAILED`);
      state.recipients[i].status = "FAILED";
      state.jobs[i].status = "FAILED";
    }

    // Reconcile stats:
    const finalStats = calculateCampaignStats(state.recipients);
    assert.strictEqual(finalStats.deliveredCount, 1);
    assert.strictEqual(finalStats.failedCount, 4);
    assert.strictEqual(finalStats.sentCount, 5);
    assert.strictEqual(finalStats.status, "COMPLETED_WITH_ERRORS");

    // Late duplicate or out-of-order webhooks:
    // Late "delivered" for Yash: DELIVERED overrides prior FAILED state if confirmed
    const lateDeliveredForFailed = canTransitionStatus("FAILED", "DELIVERED");
    assert.strictEqual(lateDeliveredForFailed.allowed, true);

    // Late "failed" for Sricharan (already delivered): BLOCKED
    const lateFailedForDelivered = canTransitionStatus(state.recipients[0].status, "FAILED");
    assert.strictEqual(lateFailedForDelivered.allowed, false);
    assert.strictEqual(lateFailedForDelivered.action, "SKIP_DOWNGRADE");
  });
});
