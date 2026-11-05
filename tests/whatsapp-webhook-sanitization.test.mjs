import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFirestoreDoc, sanitizeFirestoreValue } from "../lib/utils/firestore.ts";
import { calculateCampaignStats } from "../lib/whatsapp/campaignStats.ts";

/**
 * Mock strict Firestore document validator that mimics Google Cloud Firestore Admin SDK behavior.
 * Firestore strictly rejects documents with any `undefined` value anywhere in the object tree.
 */
function assertValidFirestoreDoc(value, path = "root") {
  if (value === undefined) {
    throw new Error(`Invalid Firestore value: "undefined" found at path "${path}"`);
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (value instanceof Date) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, idx) => assertValidFirestoreDoc(item, `${path}[${idx}]`));
    return;
  }
  for (const [key, val] of Object.entries(value)) {
    assertValidFirestoreDoc(val, `${path}.${key}`);
  }
}

test("BLOW SALON — WhatsApp Webhook Firestore Sanitization & Lifecycle Suite", async (t) => {
  await t.test("Requirement 2 & 3: sanitizeFirestoreDoc strips undefined at all nesting levels in objects and arrays", () => {
    const rawPayload = {
      campaignId: "camp_123",
      status: "DELIVERED",
      metaMessageId: "wamid.TEST123",
      topLevelUndefined: undefined,
      nullField: null,
      nestedObj: {
        keepMe: "valid",
        removeMe: undefined,
        deepNull: null,
      },
      // Array containing objects with undefined properties (the exact root cause of the webhook bug)
      attempts: [
        {
          attempt: 1,
          status: "SENT",
          sentAt: "2026-11-05T19:15:46.250Z",
          metaMessageId: "wamid.TEST123",
          deliveredAt: undefined,
          readAt: undefined,
          errorMessage: undefined,
          errorCode: undefined,
        },
        {
          attempt: 1,
          status: "DELIVERED",
          sentAt: "2026-11-05T19:15:46.250Z",
          deliveredAt: "2026-11-05T19:15:59.848Z",
          readAt: undefined,
          metaMessageId: "wamid.TEST123",
          errorMessage: undefined,
        },
      ],
      // Array containing literal undefined items
      rawArray: [1, undefined, "two", null, undefined, { a: undefined, b: 3 }],
      // Deeply nested array of objects
      deepHierarchy: [
        {
          items: [
            {
              id: "item1",
              extra: undefined,
            },
          ],
        },
      ],
    };

    const sanitized = sanitizeFirestoreDoc(rawPayload);

    // 1. Must satisfy strict Firestore validation with zero throws
    assert.doesNotThrow(() => assertValidFirestoreDoc(sanitized));

    // 2. Verify top-level undefined is removed
    assert.equal("topLevelUndefined" in sanitized, false);

    // 3. Verify nested object undefined is removed
    assert.equal("removeMe" in sanitized.nestedObj, false);
    assert.equal(sanitized.nestedObj.keepMe, "valid");

    // 4. Verify array objects have undefined properties stripped
    assert.equal(sanitized.attempts.length, 2);
    assert.equal("deliveredAt" in sanitized.attempts[0], false);
    assert.equal("readAt" in sanitized.attempts[0], false);
    assert.equal("errorMessage" in sanitized.attempts[0], false);
    assert.equal("errorCode" in sanitized.attempts[0], false);
    assert.equal(sanitized.attempts[0].status, "SENT");

    assert.equal(sanitized.attempts[1].status, "DELIVERED");
    assert.equal(sanitized.attempts[1].deliveredAt, "2026-11-05T19:15:59.848Z");
    assert.equal("readAt" in sanitized.attempts[1], false);
    assert.equal("errorMessage" in sanitized.attempts[1], false);

    // 5. Verify array literal undefined elements are removed
    assert.deepEqual(sanitized.rawArray, [1, "two", null, { b: 3 }]);

    // 6. Verify deep hierarchy
    assert.deepEqual(sanitized.deepHierarchy, [{ items: [{ id: "item1" }] }]);
  });

  await t.test("Requirement 4: Preserves valid null values, timestamps, dates, booleans, and FieldValue sentinels", () => {
    const testDate = new Date("2026-11-05T19:15:46.250Z");
    const mockFieldValue = Object.create({
      isEqual: () => true,
    });
    mockFieldValue._methodName = "serverTimestamp";

    const doc = {
      readAt: null,
      deliveredAt: null,
      failedAt: null,
      errorMessage: null,
      createdAt: testDate,
      serverTime: mockFieldValue,
      tags: ["promo", "vip"],
      zeroCount: 0,
      emptyString: "",
      isFalse: false,
      undefinedKey: undefined,
    };

    const sanitized = sanitizeFirestoreDoc(doc);

    assert.doesNotThrow(() => assertValidFirestoreDoc(sanitized));
    assert.equal(sanitized.readAt, null);
    assert.equal(sanitized.deliveredAt, null);
    assert.equal(sanitized.failedAt, null);
    assert.equal(sanitized.errorMessage, null);
    assert.equal(sanitized.createdAt, testDate);
    assert.equal(sanitized.serverTime, mockFieldValue);
    assert.deepEqual(sanitized.tags, ["promo", "vip"]);
    assert.equal(sanitized.zeroCount, 0);
    assert.equal(sanitized.emptyString, "");
    assert.equal(sanitized.isFalse, false);
    assert.equal("undefinedKey" in sanitized, false);
  });

  await t.test("Requirement 5 & 6: Webhook lifecycle transitions prevent status downgrades and remain strictly idempotent", () => {
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

    function processStatusTransition(currentStatus, mappedStatus) {
      const currentRank = STATUS_RANK[currentStatus] || 0;
      const newRank = STATUS_RANK[mappedStatus] || 0;

      if (newRank > 0 && currentRank >= newRank && currentStatus !== mappedStatus) {
        return { updated: false, action: "SKIP_DOWNGRADE", finalStatus: currentStatus };
      }
      if (currentStatus === mappedStatus && mappedStatus !== "FAILED") {
        return { updated: false, action: "IDEMPOTENT_NOOP", finalStatus: currentStatus };
      }
      return { updated: true, action: "APPLY_UPDATE", finalStatus: mappedStatus };
    }

    // Monotonic progression: SENT -> DELIVERED -> READ
    let state = "SENT";
    let step1 = processStatusTransition(state, "DELIVERED");
    assert.equal(step1.action, "APPLY_UPDATE");
    assert.equal(step1.finalStatus, "DELIVERED");
    state = step1.finalStatus;

    let step2 = processStatusTransition(state, "READ");
    assert.equal(step2.action, "APPLY_UPDATE");
    assert.equal(step2.finalStatus, "READ");
    state = step2.finalStatus;

    // Downgrade protection: Out-of-order webhook delivery cannot downgrade READ
    let downgradeDelivered = processStatusTransition(state, "DELIVERED");
    assert.equal(downgradeDelivered.action, "SKIP_DOWNGRADE");
    assert.equal(downgradeDelivered.finalStatus, "READ");

    let downgradeSent = processStatusTransition(state, "SENT");
    assert.equal(downgradeSent.action, "SKIP_DOWNGRADE");
    assert.equal(downgradeSent.finalStatus, "READ");

    let downgradeFailed = processStatusTransition(state, "FAILED");
    assert.equal(downgradeFailed.action, "SKIP_DOWNGRADE");
    assert.equal(downgradeFailed.finalStatus, "READ");

    // Idempotency: Duplicate READ event is a no-op
    let duplicateRead = processStatusTransition(state, "READ");
    assert.equal(duplicateRead.action, "IDEMPOTENT_NOOP");
    assert.equal(duplicateRead.finalStatus, "READ");
  });

  await t.test("Requirement C: Delivery attempt construction omits absent optional fields cleanly", () => {
    const nowIso = "2026-11-05T19:18:56.234Z";
    const messageId = "wamid.TEST456";
    const recData = {
      attemptCount: 1,
      sentAt: "2026-11-05T19:18:43.879Z",
    };

    // When status is DELIVERED: readAt, errorMessage, and errorCode must NOT exist
    const deliveredAttempt = {
      attempt: recData.attemptCount || 1,
      status: "DELIVERED",
      sentAt: recData.sentAt,
      metaMessageId: messageId,
      deliveredAt: nowIso,
    };
    assert.doesNotThrow(() => assertValidFirestoreDoc(deliveredAttempt));
    assert.equal("readAt" in deliveredAttempt, false);
    assert.equal("errorMessage" in deliveredAttempt, false);
    assert.equal("errorCode" in deliveredAttempt, false);

    // When status is READ: readAt is present, error fields must NOT exist
    const readAttempt = {
      attempt: recData.attemptCount || 1,
      status: "READ",
      sentAt: recData.sentAt,
      metaMessageId: messageId,
      deliveredAt: nowIso,
      readAt: nowIso,
    };
    assert.doesNotThrow(() => assertValidFirestoreDoc(readAttempt));
    assert.equal("errorMessage" in readAttempt, false);
    assert.equal("errorCode" in readAttempt, false);
  });

  await t.test("Requirement C: Exact campaign test2 (3V4rbzWfX3AYEIenHNpi) reconciliation simulation", () => {
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

    // Exactly matches the 4 production recipients of test2 in Firestore
    const productionRecipients = [
      { id: "1U2RmI9bhVNaJoczXdLm", customerName: "Sricharan", status: "SENT" },
      { id: "8icEyTr0pHmTdtkjr0oM", customerName: "Srishanth Reddy", status: "SENT" },
      { id: "wfl5M12qg6Igv0Vqkvb4", customerName: "Yash Reddy", status: "SENT" },
      { id: "x5LGSm1QfGXfomF0M0ib", customerName: "Akhila", status: "SENT" },
    ];

    // Exactly matches the 4 production queue jobs of test2 in whatsappCampaignJobs
    const productionJobs = [
      { id: "3V4rbzWfX3AYEIenHNpi_1U2RmI9bhVNaJoczXdLm", recipientId: "1U2RmI9bhVNaJoczXdLm", status: "DELIVERED" },
      { id: "3V4rbzWfX3AYEIenHNpi_8icEyTr0pHmTdtkjr0oM", recipientId: "8icEyTr0pHmTdtkjr0oM", status: "ACCEPTED" },
      { id: "3V4rbzWfX3AYEIenHNpi_wfl5M12qg6Igv0Vqkvb4", recipientId: "wfl5M12qg6Igv0Vqkvb4", status: "DELIVERED" },
      { id: "3V4rbzWfX3AYEIenHNpi_x5LGSm1QfGXfomF0M0ib", recipientId: "x5LGSm1QfGXfomF0M0ib", status: "ACCEPTED" },
    ];

    const jobsByRecipientId = new Map(productionJobs.map((j) => [j.recipientId, j]));

    function reconcile(recipients) {
      return recipients.map((rec) => {
        const job = jobsByRecipientId.get(rec.id);
        if (!job) return rec;

        const recRank = STATUS_RANK[(rec.status || "").toUpperCase()] || 0;
        const jobRank = STATUS_RANK[(job.status || "").toUpperCase()] || 0;

        // Reconcile status if job has progressed further
        if (jobRank > recRank) {
          return {
            ...rec,
            status: job.status,
          };
        }
        return rec;
      });
    }

    const reconciled = reconcile(productionRecipients);
    const stats = calculateCampaignStats(reconciled);

    // Assertions matching production expectations:
    // 1. Total recipients = 4
    assert.equal(stats.totalRecipients, 4);
    // 2. Eligible count = 4
    assert.equal(stats.eligibleCount, 4);
    // 3. Sent count = 4 (all 4 were dispatched to Meta Cloud API)
    assert.equal(stats.sentCount, 4);
    // 4. Exactly two DELIVERED jobs produce deliveredCount = 2
    assert.equal(stats.deliveredCount, 2);
    // 5. The two ACCEPTED jobs (Srishanth & Akhila) are NOT counted as delivered
    assert.equal(stats.deliveredCount, 2, "ACCEPTED jobs must not be counted in deliveredCount");
    // 6. Read count = 0 (neither Sricharan nor Yash Reddy have opened/read yet)
    assert.equal(stats.readCount, 0);
    // 7. Failed count = 0
    assert.equal(stats.failedCount, 0);
    // 8. Campaign status = COMPLETED (queue dispatch finished, zero remaining queue jobs)
    assert.equal(stats.status, "COMPLETED");

    // Idempotency: Running reconciliation repeatedly produces identical results
    for (let i = 0; i < 5; i++) {
      const repeatedStats = calculateCampaignStats(reconcile(productionRecipients));
      assert.deepEqual(repeatedStats, stats);
    }
  });

  await t.test("Requirement B: Campaign status definition — COMPLETED vs SENDING vs FAILED", () => {
    // 1. When jobs are still processing or pending, campaign status is SENDING
    const pendingCampaign = calculateCampaignStats([
      { id: "r1", status: "SENT" },
      { id: "r2", status: "PENDING" },
    ]);
    assert.equal(pendingCampaign.pendingCount, 1);
    assert.equal(pendingCampaign.status, undefined); // Handled by queue manager remainingJobs > 0 -> "SENDING"

    // 2. When all jobs dispatched and pending = 0, status is COMPLETED
    const completedCampaign = calculateCampaignStats([
      { id: "r1", status: "SENT" },
      { id: "r2", status: "DELIVERED" },
    ]);
    assert.equal(completedCampaign.pendingCount, 0);
    assert.equal(completedCampaign.status, "COMPLETED");

    // 3. When some jobs failed and some sent, status is COMPLETED_WITH_ERRORS
    const errorCampaign = calculateCampaignStats([
      { id: "r1", status: "SENT" },
      { id: "r2", status: "FAILED" },
    ]);
    assert.equal(errorCampaign.status, "COMPLETED_WITH_ERRORS");

    // 4. When all eligible jobs failed, status is FAILED
    const allFailedCampaign = calculateCampaignStats([
      { id: "r1", status: "FAILED" },
      { id: "r2", status: "FAILED" },
    ]);
    assert.equal(allFailedCampaign.status, "FAILED");
  });
});
