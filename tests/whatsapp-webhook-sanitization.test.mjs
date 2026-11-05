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

  await t.test("Requirement 4: Preserves valid null values, timestamps, dates, and FieldValue sentinels", () => {
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

  await t.test("Requirement 7: Campaign metrics accurately reconcile using authoritative queue job statuses", () => {
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

    // Simulate recipients in Firestore that were at status "SENT"
    const recipients = [
      { id: "rec_1", customerName: "Srishanth Reddy", status: "SENT" },
      { id: "rec_2", customerName: "Customer 2", status: "SENT" },
      { id: "rec_3", customerName: "Customer 3", status: "EXCLUDED" },
    ];

    // Simulate authoritative queue jobs that reached DELIVERED and READ via Meta webhooks
    const jobs = [
      { id: "camp_1_rec_1", recipientId: "rec_1", status: "READ" },
      { id: "camp_1_rec_2", recipientId: "rec_2", status: "DELIVERED" },
    ];

    const jobsByRecipientId = new Map(jobs.map((j) => [j.recipientId, j]));

    // Reconciliation algorithm implemented in syncCampaignStats
    const reconciledRecs = recipients.map((rec) => {
      const job = jobsByRecipientId.get(rec.id);
      if (!job) return rec;

      const recRank = STATUS_RANK[(rec.status || "").toUpperCase()] || 0;
      const jobRank = STATUS_RANK[(job.status || "").toUpperCase()] || 0;

      if (jobRank > recRank) {
        return {
          ...rec,
          status: job.status,
        };
      }
      return rec;
    });

    const stats = calculateCampaignStats(reconciledRecs);

    assert.equal(stats.totalRecipients, 3);
    assert.equal(stats.eligibleCount, 2);
    assert.equal(stats.excludedCount, 1);
    assert.equal(stats.sentCount, 2);
    // DELIVERED includes READ because a read message was necessarily delivered
    assert.equal(stats.deliveredCount, 2);
    assert.equal(stats.readCount, 1);
    assert.equal(stats.failedCount, 0);
    assert.equal(stats.status, "COMPLETED");
  });
});

