/**
 * BLOW SALON — Cloudflare WhatsApp Queue Scheduler Test Suite
 *
 * Verifies all requirements for the Cloudflare Worker scheduler:
 * 1. Health-check endpoint behavior (GET, zero backend calls, no secrets exposed)
 * 2. Fail-closed behavior on missing CRON_SECRET
 * 3. Invariant: ENABLE_LIVE_QUEUE=false performs zero backend calls
 * 4. Invariant: ENABLE_LIVE_QUEUE=true dispatches POST with Bearer token
 * 5. Timeout behavior and strictly NO retries on uncertain errors
 * 6. HTTP 401, 403, and 500 error handling
 * 7. Privacy: No secrets or phone numbers in logs
 * 8. Manual POST trigger authentication & dry-run gating
 */

import { test } from "node:test";
import assert from "node:assert";
import worker from "../cloudflare/worker.js";

test("BLOW SALON — Cloudflare Queue Scheduler Suite", async (t) => {
  const TEST_BACKEND = "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker";
  const TEST_SECRET = "test_cron_secret_cloudflare_987654";
  const TEST_SCHEDULER_SECRET = "test_scheduler_secret_cf_12345";

  // ── 1. Manual Health Check Behavior ─────────────────────────────────────────
  await t.test("Health check (GET) returns status and never calls backend", async () => {
    let backendFetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      backendFetchCalled = true;
      throw new Error("Backend fetch should NEVER be called on health check!");
    };

    try {
      const env = {
        CRON_SECRET: TEST_SECRET,
        SCHEDULER_SECRET: TEST_SCHEDULER_SECRET,
        ENABLE_LIVE_QUEUE: "false",
        BACKEND_URL: TEST_BACKEND,
      };

      const req = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/health", {
        method: "GET",
      });

      const res = await worker.fetch(req, env);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(backendFetchCalled, false, "Health check must perform zero backend calls");

      const body = await res.json();
      assert.strictEqual(body.worker, "blow-salon-queue-scheduler");
      assert.strictEqual(body.status, "DEPLOYED");
      assert.strictEqual(body.schedule, "* * * * *");
      assert.strictEqual(body.isSecretConfigured, true);
      assert.strictEqual(body.isSchedulerSecretConfigured, true);
      assert.strictEqual(body.isLiveExecutionEnabled, false);
      assert.strictEqual(body.backendUrl, TEST_BACKEND);

      // Verify that secrets are NEVER exposed in response body
      const rawBody = JSON.stringify(body);
      assert.strictEqual(rawBody.includes(TEST_SECRET), false, "Health check must NEVER leak CRON_SECRET");
      assert.strictEqual(rawBody.includes(TEST_SCHEDULER_SECRET), false, "Health check must NEVER leak SCHEDULER_SECRET");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 2. Health Check with Missing Secret ─────────────────────────────────────
  await t.test("Health check accurately reports when CRON_SECRET is unconfigured", async () => {
    const env = {
      ENABLE_LIVE_QUEUE: "false",
    };

    const req = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/", {
      method: "GET",
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.isSecretConfigured, false);
    assert.strictEqual(body.isLiveExecutionEnabled, false);
  });

  // ── 3. Scheduled Handler Fails Closed on Missing CRON_SECRET ───────────────
  await t.test("Scheduled handler fails closed when CRON_SECRET is missing", async () => {
    let backendFetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      backendFetchCalled = true;
      return new Response(JSON.stringify({ success: true }));
    };

    try {
      const env = {
        ENABLE_LIVE_QUEUE: "true", // even if live queue is true
        CRON_SECRET: "",           // missing secret
      };

      await worker.scheduled({}, env);
      assert.strictEqual(backendFetchCalled, false, "Must abort immediately when CRON_SECRET is missing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 4. Scheduled Handler: ENABLE_LIVE_QUEUE=false Invariant ────────────────
  await t.test("Scheduled handler performs zero requests when ENABLE_LIVE_QUEUE=false", async () => {
    let backendFetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      backendFetchCalled = true;
      return new Response(JSON.stringify({ success: true }));
    };

    try {
      const env = {
        CRON_SECRET: TEST_SECRET,
        ENABLE_LIVE_QUEUE: "false",
        BACKEND_URL: TEST_BACKEND,
      };

      await worker.scheduled({}, env);
      assert.strictEqual(backendFetchCalled, false, "Must not invoke backend when ENABLE_LIVE_QUEUE=false");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 5. Scheduled Handler: ENABLE_LIVE_QUEUE=true Invocation ────────────────
  await t.test("Scheduled handler sends authenticated POST request when ENABLE_LIVE_QUEUE=true", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders = null;
    let capturedBody = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      capturedUrl = url;
      capturedMethod = options.method;
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          success: true,
          processedCount: 2,
          acceptedCount: 2,
          failedCount: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const env = {
        CRON_SECRET: TEST_SECRET,
        SCHEDULER_SECRET: TEST_SCHEDULER_SECRET,
        ENABLE_LIVE_QUEUE: "true",
        BACKEND_URL: TEST_BACKEND,
      };

      await worker.scheduled({}, env);

      assert.strictEqual(capturedUrl, TEST_BACKEND);
      assert.strictEqual(capturedMethod, "POST");
      assert.strictEqual(capturedHeaders["Authorization"], `Bearer ${TEST_SECRET}`);
      assert.strictEqual(capturedHeaders["Content-Type"], "application/json");
      assert.strictEqual(capturedHeaders["X-Scheduler-Secret"], TEST_SCHEDULER_SECRET);
      assert.strictEqual(capturedBody.dryRun, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 5b. Scheduled Handler: Missing SCHEDULER_SECRET Fails Closed ───────────
  await t.test("Scheduled handler fails closed when SCHEDULER_SECRET is missing even if ENABLE_LIVE_QUEUE=true", async () => {
    let backendFetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      backendFetchCalled = true;
      return new Response(JSON.stringify({ success: true }));
    };

    try {
      const env = {
        CRON_SECRET: TEST_SECRET,
        ENABLE_LIVE_QUEUE: "true",
        BACKEND_URL: TEST_BACKEND,
        // SCHEDULER_SECRET deliberately omitted
      };

      await worker.scheduled({}, env);
      assert.strictEqual(backendFetchCalled, false, "Must not invoke backend when SCHEDULER_SECRET is missing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 6. Timeout Behavior & Strictly NO Retries ───────────────────────────────
  await t.test("Timeout safely terminates and NEVER retries on uncertain errors", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
      callCount++;
      // Simulate network abort / timeout
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };

    try {
      const env = {
        CRON_SECRET: TEST_SECRET,
        SCHEDULER_SECRET: TEST_SCHEDULER_SECRET,
        ENABLE_LIVE_QUEUE: "true",
        BACKEND_URL: TEST_BACKEND,
        REQUEST_TIMEOUT_MS: "50",
      };

      await worker.scheduled({}, env);

      // CRITICAL SAFETY CHECK: Fetch must be attempted exactly once (NO automatic retry)
      assert.strictEqual(callCount, 1, "Must never automatically retry after a network timeout");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 7. HTTP Error Responses (401, 403, 500) Handled Safely ────────────────
  await t.test("Handles backend HTTP 401, 403, and 500 error responses without throwing", async () => {
    const errorStatuses = [401, 403, 500];

    for (const status of errorStatuses) {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ error: `Backend simulated error ${status}` }), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      };

      try {
        const env = {
          CRON_SECRET: TEST_SECRET,
          SCHEDULER_SECRET: TEST_SCHEDULER_SECRET,
          ENABLE_LIVE_QUEUE: "true",
          BACKEND_URL: TEST_BACKEND,
        };

        // Scheduled invocation must complete cleanly without throwing an unhandled exception
        await worker.scheduled({}, env);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });

  // ── 8. Privacy & Sensitive Data Protection in Logs ──────────────────────────
  await t.test("Runner logs never expose tokens, secrets, or recipient phone numbers", async () => {
    const loggedMessages = [];
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => loggedMessages.push(args.join(" "));
    console.error = (...args) => loggedMessages.push(args.join(" "));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          success: true,
          processedCount: 1,
          acceptedCount: 1,
          failedCount: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const env = {
        CRON_SECRET: "super_secret_token_never_log_me_99999",
        SCHEDULER_SECRET: TEST_SCHEDULER_SECRET,
        ENABLE_LIVE_QUEUE: "true",
        BACKEND_URL: TEST_BACKEND,
      };

      await worker.scheduled({}, env);

      const allLogs = loggedMessages.join("\n");
      assert.strictEqual(
        allLogs.includes("super_secret_token_never_log_me_99999"),
        false,
        "Secret token must NEVER appear in console logs"
      );
      assert.strictEqual(
        /91\d{10}/.test(allLogs),
        false,
        "Customer phone numbers must never appear in console logs"
      );
    } finally {
      console.log = originalLog;
      console.error = originalError;
      globalThis.fetch = originalFetch;
    }
  });

  // ── 9. Manual Trigger POST Authentication & Dry-Run ─────────────────────────
  await t.test("Manual POST trigger enforces Bearer authentication and dryRun gating", async () => {
    const env = {
      CRON_SECRET: TEST_SECRET,
      ENABLE_LIVE_QUEUE: "false",
      BACKEND_URL: TEST_BACKEND,
    };

    // 1. Missing Authorization header
    const unauthReq = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/", {
      method: "POST",
    });
    const unauthRes = await worker.fetch(unauthReq, env);
    assert.strictEqual(unauthRes.status, 401);

    // 2. Wrong Authorization token
    const wrongAuthReq = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/", {
      method: "POST",
      headers: { Authorization: "Bearer wrong_token" },
    });
    const wrongAuthRes = await worker.fetch(wrongAuthReq, env);
    assert.strictEqual(wrongAuthRes.status, 401);

    // 3. Live request blocked when ENABLE_LIVE_QUEUE=false
    const liveBlockedReq = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/", {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_SECRET}` },
      body: JSON.stringify({ dryRun: false }),
    });
    const liveBlockedRes = await worker.fetch(liveBlockedReq, env);
    assert.strictEqual(liveBlockedRes.status, 403);

    // 4. Dry-run allowed even when ENABLE_LIVE_QUEUE=false
    const originalFetch = globalThis.fetch;
    let dryRunPassed = false;
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      dryRunPassed = body.dryRun === true && options.headers["x-dry-run"] === "true";
      return new Response(JSON.stringify({ success: true, dryRun: true, simulatedJobs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const dryRunReq = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_SECRET}`,
          "Content-Type": "application/json",
          "x-dry-run": "true",
        },
        body: JSON.stringify({ dryRun: true }),
      });
      const dryRunRes = await worker.fetch(dryRunReq, env);
      assert.strictEqual(dryRunRes.status, 200);
      assert.strictEqual(dryRunPassed, true, "Dry-run flag must be forwarded to backend");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 10. Attempt to Override Dry-Run when Live Queue is Disabled is Blocked ──
  await t.test("Attempt to override dryRun=false via query string or body when ENABLE_LIVE_QUEUE=false is rejected", async () => {
    const env = {
      CRON_SECRET: TEST_SECRET,
      ENABLE_LIVE_QUEUE: "false",
      BACKEND_URL: TEST_BACKEND,
    };

    // Attempt 1: body says dryRun: false
    const req1 = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/?dryRun=false", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dryRun: false }),
    });
    const res1 = await worker.fetch(req1, env);
    assert.strictEqual(res1.status, 403, "Must reject live execution attempt with 403");

    // Attempt 2: omit dryRun header and body
    const req2 = new Request("https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const res2 = await worker.fetch(req2, env);
    assert.strictEqual(res2.status, 403, "Must reject non-dry-run request when live queue is disabled");
  });

  // ── 11. Concurrent Cloudflare Invocations Dispatched Safely ─────────────────
  await t.test("Concurrent Cloudflare invocations both complete without crashing", async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ success: true, processedCount: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const env = {
        CRON_SECRET: TEST_SECRET,
        SCHEDULER_SECRET: TEST_SCHEDULER_SECRET,
        ENABLE_LIVE_QUEUE: "true",
        BACKEND_URL: TEST_BACKEND,
      };

      // Two scheduled events firing simultaneously
      await Promise.all([
        worker.scheduled({ cron: "* * * * *" }, env),
        worker.scheduled({ cron: "* * * * *" }, env),
      ]);

      assert.strictEqual(callCount, 2, "Both executions complete safely; atomic lease on Vercel prevents double sends");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // ── 12. Meta Token Expiration & Revocation Classification ───────────────────
  await t.test("Meta token expiration (#190) and revocation (#102, #10) are classified as non-retryable AUTH_ERROR", async () => {
    const { parseWhatsAppFailure, classifyRetryEligibility } = await import("../lib/whatsapp/errorClassifier.ts");

    // Case 1: Code 190 (Access token expired)
    const expiredRes = parseWhatsAppFailure("Error validating access token: Session has expired", "190");
    assert.strictEqual(expiredRes.classification, "AUTH_ERROR");
    const expiredRetry = classifyRetryEligibility("Session expired", "190");
    assert.strictEqual(expiredRetry.eligible, false, "Token expiration must NOT be automatically retried");

    // Case 2: Code 102 (API session error / invalid OAuth)
    const invalidRes = parseWhatsAppFailure("API Session error: token revoked", "102");
    assert.strictEqual(invalidRes.classification, "AUTH_ERROR");
    const invalidRetry = classifyRetryEligibility("Session error", "102");
    assert.strictEqual(invalidRetry.eligible, false, "Session errors must NOT be automatically retried");

    // Case 3: Code 10 (Application secret / permission revoked)
    const revokedRes = parseWhatsAppFailure("Application does not have permission for this action", "10");
    assert.strictEqual(revokedRes.classification, "AUTH_ERROR");
    const revokedRetry = classifyRetryEligibility("Permission revoked", "10");
    assert.strictEqual(revokedRetry.eligible, false, "Permission revoked must NOT be automatically retried");
  });
});

