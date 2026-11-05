/**
 * BLOW SALON — Cloudflare Workers WhatsApp Queue Scheduler
 *
 * Exclusively schedules the persistent WhatsApp campaign queue on a 1-minute cron.
 * Dispatches authenticated POST requests to the Vercel backend worker endpoint.
 *
 * Safety Invariants:
 * - Fails closed if CRON_SECRET is missing.
 * - Live execution disabled by default (ENABLE_LIVE_QUEUE=false).
 * - Safe manual health-check on GET that makes ZERO external network requests.
 * - Strict timeout (45s) with NO automatic retries after network errors/timeouts to prevent duplicate message sends.
 * - Never logs secrets, bearer tokens, or recipient phone numbers.
 */

export default {
  /**
   * HTTP Fetch Handler
   * - GET / or GET /health: Health check reporting deployment status and configuration (zero external requests).
   * - POST / or POST /trigger: Authenticated manual trigger with optional dry-run support.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Health-check endpoint on GET / HEAD
    if (request.method === "GET" || request.method === "HEAD") {
      const isSecretConfigured = Boolean(env.CRON_SECRET && env.CRON_SECRET.trim().length > 0);
      const isSchedulerSecretConfigured = Boolean(env.SCHEDULER_SECRET && env.SCHEDULER_SECRET.trim().length > 0);
      const isLiveExecutionEnabled = String(env.ENABLE_LIVE_QUEUE).toLowerCase() === "true";
      const backendUrl = env.BACKEND_URL || "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker";

      const healthData = {
        worker: "blow-salon-queue-scheduler",
        status: "DEPLOYED",
        schedule: "* * * * *",
        backendUrl,
        isSecretConfigured,
        isSchedulerSecretConfigured,
        isLiveExecutionEnabled,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(healthData, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    // 2. Manual Authenticated Trigger on POST
    if (request.method === "POST") {
      const cronSecret = env.CRON_SECRET?.trim();
      if (!cronSecret) {
        return new Response(JSON.stringify({ error: "CRON_SECRET is not configured on Cloudflare Worker." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const authHeader = request.headers.get("authorization") || "";
      const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (!bearerToken || bearerToken !== cronSecret) {
        return new Response(JSON.stringify({ error: "Unauthorized. Valid Bearer token matching CRON_SECRET is required." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check dry-run mode
      const dryRunHeader = request.headers.get("x-dry-run");
      const dryRunParam = url.searchParams.get("dryRun");
      let isDryRun = dryRunHeader === "true" || dryRunHeader === "1" || dryRunParam === "true";

      let reqBody = {};
      try {
        reqBody = await request.json();
        if (reqBody && reqBody.dryRun === true) {
          isDryRun = true;
        }
      } catch {
        // Body is not JSON or empty
      }

      const isLiveExecutionEnabled = String(env.ENABLE_LIVE_QUEUE).toLowerCase() === "true";

      if (!isDryRun && !isLiveExecutionEnabled) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Live execution is disabled (ENABLE_LIVE_QUEUE=false). Run with dryRun=true or set ENABLE_LIVE_QUEUE=true in Cloudflare.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const schedulerSecret = !isDryRun ? env.SCHEDULER_SECRET?.trim() : undefined;
      const backendUrl = env.BACKEND_URL || "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker";
      const result = await invokeBackendWorker(backendUrl, cronSecret, isDryRun, env.REQUEST_TIMEOUT_MS, schedulerSecret);

      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed. Use GET for health check or POST for manual trigger." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  },

  /**
   * Cloudflare Cron Trigger Handler
   * Executed automatically every minute (* * * * *) by Cloudflare edge runners.
   */
  async scheduled(controller, env, ctx) {
    const cronSecret = env.CRON_SECRET?.trim();
    if (!cronSecret) {
      console.error("[Scheduler] CRON_SECRET is missing or empty. Scheduled run aborted (FAIL CLOSED).");
      return;
    }

    const isLiveExecutionEnabled = String(env.ENABLE_LIVE_QUEUE).toLowerCase() === "true";
    if (!isLiveExecutionEnabled) {
      console.log("[Scheduler] Live queue execution is DISABLED (ENABLE_LIVE_QUEUE=false). Skipping queue invocation. Zero messages sent. Zero writes performed.");
      return;
    }

    const schedulerSecret = env.SCHEDULER_SECRET?.trim();
    if (!schedulerSecret) {
      console.error("[Scheduler] SCHEDULER_SECRET is missing or empty. Scheduled live run aborted (FAIL CLOSED).");
      return;
    }

    const backendUrl = env.BACKEND_URL || "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker";
    console.log(`[Scheduler] Cron triggered at ${new Date().toISOString()}. Invoking Vercel worker: ${backendUrl}`);

    await invokeBackendWorker(backendUrl, cronSecret, false, env.REQUEST_TIMEOUT_MS, schedulerSecret);
  },
};

/**
 * Invokes the Vercel queue worker endpoint with bearer authentication and timeout safeguards.
 * Never retries on uncertain network errors or timeouts to prevent duplicate message dispatches.
 */
async function invokeBackendWorker(backendUrl, cronSecret, dryRun = false, customTimeoutMs, schedulerSecret) {
  const timeoutMs = parseInt(customTimeoutMs, 10) || 45000;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const headers = {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
      "x-dry-run": dryRun ? "true" : "false",
      "User-Agent": "BlowSalon-Cloudflare-Scheduler/1.0",
    };

    // Send X-Scheduler-Secret only for live execution dispatches
    if (!dryRun && schedulerSecret) {
      headers["X-Scheduler-Secret"] = schedulerSecret;
    }

    const response = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ dryRun }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => "");
      data = { raw: text.slice(0, 300) };
    }

    if (!response.ok) {
      console.error(`[Scheduler] Vercel worker responded with HTTP ${response.status}: ${JSON.stringify(data)}`);
      return { status: response.status, data };
    }

    if (dryRun) {
      console.log(`[Scheduler] Dry-run batch completed: candidates=${data.candidateCount ?? 0}, wouldSend=${data.simulatedJobs?.filter((j) => j.wouldSend).length ?? 0}`);
    } else {
      console.log(`[Scheduler] Live batch completed: processed=${data.processedCount ?? 0}, accepted=${data.acceptedCount ?? 0}, failed=${data.failedCount ?? 0}, retryWait=${data.retryWaitCount ?? 0}`);
    }

    return { status: 200, data };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      console.error(`[Scheduler] Worker request timed out after ${timeoutMs}ms. Safe termination: NO automatic retry to prevent duplicate dispatches.`);
      return {
        status: 504,
        data: {
          error: "Worker request timed out.",
          details: `Backend did not respond within ${timeoutMs}ms. Execution safely halted without retrying.`,
        },
      };
    }

    console.error(`[Scheduler] Network error invoking backend worker: ${err.message}. Safe termination: NO automatic retry.`);
    return {
      status: 502,
      data: {
        error: "Network error invoking backend worker.",
        message: err.message,
      },
    };
  }
}

