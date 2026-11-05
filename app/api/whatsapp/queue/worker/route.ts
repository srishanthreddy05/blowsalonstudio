import { NextResponse } from "next/server";
import crypto from "crypto";
import { processQueueBatch } from "@/lib/whatsapp/queue/queueManager";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel function duration (seconds)

/**
 * Constant-time comparison to prevent timing attacks.
 */
function timingSafeEqualStr(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * GET & POST /api/whatsapp/queue/worker
 * Authenticated worker triggered by Cloudflare Worker scheduler or authorized admin simulation.
 */
async function handleWorker(request: Request) {
  try {
    // 1. Authenticate caller (requires valid Bearer CRON_SECRET, x-admin-key, or admin session)
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized worker access." }, { status: 401 });
    }

    // 2. Determine dry-run vs live dispatch intent.
    // Default mode is strictly DRY-RUN unless live dispatch is explicitly configured and authorized.
    const { searchParams } = new URL(request.url);
    const dryRunHeader = request.headers.get("x-dry-run");
    let isDryRunRequested = dryRunHeader === "true" || dryRunHeader === "1" || searchParams.get("dryRun") === "true";

    if (!isDryRunRequested && request.method === "POST") {
      try {
        const body = await request.clone().json().catch(() => ({}));
        if (body?.dryRun === true) {
          isDryRunRequested = true;
        }
      } catch {
        // Body is non-JSON or empty
      }
    }

    // 3. Security Hardening for Live Execution:
    // If the caller is attempting a LIVE dispatch (dryRun is not explicitly true):
    if (!isDryRunRequested) {
      // TASK 1: Independent Vercel live-dispatch gate
      // ENABLE_LIVE_QUEUE must explicitly equal "true" on the Vercel server.
      const serverLiveQueueFlag = process.env.ENABLE_LIVE_QUEUE?.trim();
      if (serverLiveQueueFlag !== "true") {
        return NextResponse.json(
          {
            error: "Live queue execution is disabled on the server (ENABLE_LIVE_QUEUE is not 'true'). Direct live dispatch is blocked.",
            code: "LIVE_QUEUE_DISABLED",
          },
          { status: 403 }
        );
      }

      // TASK 2: Exclusive Cloudflare scheduler authorization
      // Validate X-Scheduler-Secret header using constant-time comparison against SCHEDULER_SECRET.
      const configuredSchedulerSecret = process.env.SCHEDULER_SECRET?.trim();
      const providedSchedulerSecret = request.headers.get("x-scheduler-secret")?.trim();

      if (
        !configuredSchedulerSecret ||
        !providedSchedulerSecret ||
        !timingSafeEqualStr(providedSchedulerSecret, configuredSchedulerSecret)
      ) {
        return NextResponse.json(
          {
            error: "Unauthorized live dispatch scheduler. Valid X-Scheduler-Secret header required for live execution.",
            code: "SCHEDULER_SECRET_INVALID",
          },
          { status: 403 }
        );
      }

      // TASK 3: Master Kill Switch (fail-closed)
      const enabledCheck = await assertWhatsAppEnabled();
      if (!enabledCheck.enabled) {
        return NextResponse.json({
          success: false,
          message: "WhatsApp messaging is disabled by master kill-switch. Worker paused.",
        });
      }

      // Provider connection check for live execution
      const provider = getWhatsAppProvider();
      const providerStatus = await provider.getStatus();
      if (providerStatus.status !== "CONNECTED") {
        return NextResponse.json({
          success: false,
          message: providerStatus.errorMessage || "WhatsApp Cloud API is not connected.",
        });
      }
    }

    const isDryRun = isDryRunRequested;

    // Execute batch processing with safety bounds (35s budget safely below 60s maxDuration with 12s headroom)
    const result = await processQueueBatch({
      maxJobs: 10,
      timeBudgetMs: 35000,
      dryRun: isDryRun,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error executing queue worker";
    console.error("[Queue Worker API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleWorker(request);
}

export async function POST(request: Request) {
  return handleWorker(request);
}

