import { NextResponse } from "next/server";
import { processQueueBatch } from "@/lib/whatsapp/queue/queueManager";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel function duration (seconds)

/**
 * GET & POST /api/whatsapp/queue/worker
 * Authenticated worker triggered by Vercel Cron (* * * * *) or internal API calls.
 */
async function handleWorker(request: Request) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized worker access." }, { status: 401 });
    }

    // Check Master Kill Switch
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) {
      return NextResponse.json({
        success: false,
        message: "WhatsApp messaging is disabled by master kill-switch. Worker paused.",
      });
    }

    // Verify WhatsApp provider connection (not required in dry-run simulation mode)
    const { searchParams } = new URL(request.url);
    const dryRunHeader = request.headers.get("x-dry-run");
    let isDryRun = dryRunHeader === "true" || dryRunHeader === "1" || searchParams.get("dryRun") === "true";

    if (!isDryRun && request.method === "POST") {
      try {
        const body = await request.clone().json().catch(() => ({}));
        if (body?.dryRun === true) {
          isDryRun = true;
        }
      } catch {
        // Body is non-JSON or empty
      }
    }

    if (!isDryRun) {
      const provider = getWhatsAppProvider();
      const providerStatus = await provider.getStatus();
      if (providerStatus.status !== "CONNECTED") {
        return NextResponse.json({
          success: false,
          message: providerStatus.errorMessage || "WhatsApp Cloud API is not connected.",
        });
      }
    }

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

