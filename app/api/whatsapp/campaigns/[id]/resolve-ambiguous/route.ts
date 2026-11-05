import { NextResponse } from "next/server";
import {
  adminDb as db,
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
} from "@/lib/firebaseAdmin";
import type { WhatsAppCampaignJob, WhatsAppCampaignRecipient, WhatsAppMessageRecord } from "@/types/whatsapp";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { syncCampaignStats } from "@/lib/whatsapp/queue/queueManager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QUEUE_JOBS_COLLECTION = "whatsappCampaignJobs";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const MESSAGES_COLLECTION = "whatsapp_messages";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized access." }, { status: 401 });
    }

    // Role-based authorization guard: Only administrators may manually resolve ambiguous dispatches
    const userRole = auth.user?.role;
    if (userRole !== "ADMIN" && userRole !== "SYSTEM_ADMIN" && userRole !== "DEV_ADMIN" && auth.source !== "ADMIN_KEY") {
      return NextResponse.json(
        { error: "Forbidden: Only salon administrators may manually resolve ambiguous queue jobs." },
        { status: 403 }
      );
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      jobId,
      resolution,
      notes,
      acknowledgeDuplicateRisk,
    } = body;

    if (!jobId) {
      return NextResponse.json({ error: "Missing required field: jobId." }, { status: 400 });
    }

    const validResolutions = ["MARK_ACCEPTED", "MARK_FAILED", "FORCE_RESEND"];
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json(
        { error: `Invalid resolution "${resolution}". Must be one of: ${validResolutions.join(", ")}` },
        { status: 400 }
      );
    }

    const jobRef = doc(db, QUEUE_JOBS_COLLECTION, jobId);
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists()) {
      return NextResponse.json({ error: `Job "${jobId}" not found.` }, { status: 404 });
    }

    const jobData = jobSnap.data() as WhatsAppCampaignJob;
    if (jobData.campaignId !== campaignId) {
      return NextResponse.json({ error: "Job does not belong to specified campaign." }, { status: 400 });
    }

    // Ambiguity validation: Only jobs currently in an ambiguous state can be manually resolved
    if (jobData.status !== "AMBIGUOUS" && !jobData.isAmbiguous) {
      return NextResponse.json(
        {
          error: `Job "${jobId}" is not in an AMBIGUOUS state (current status: ${jobData.status}). Only ambiguous dispatches require manual intervention.`,
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const recRef = doc(db, RECIPIENTS_COLLECTION, jobData.recipientId);
    const resolvedBy = auth.user?.email || auth.source || "ADMIN";

    if (resolution === "MARK_ACCEPTED") {
      await updateDoc(
        jobRef,
        sanitizeFirestoreDoc({
          status: "ACCEPTED",
          isAmbiguous: false,
          resolvedByAdmin: true,
          adminResolution: "MARK_ACCEPTED",
          adminResolutionNotes: notes || "Manually marked ACCEPTED by administrator.",
          resolvedBy,
          resolvedAt: nowIso,
          updatedAt: nowIso,
        })
      );
      await updateDoc(
        recRef,
        sanitizeFirestoreDoc({
          status: "SENT",
          updatedAt: nowIso,
        })
      );
      await syncCampaignStats(campaignId);

      // Write immutable audit log record to whatsapp_messages
      const auditRecord: Omit<WhatsAppMessageRecord, "id"> = {
        messageType: "MARKETING_CAMPAIGN",
        category: "MARKETING",
        provider: "WHATSAPP_CLOUD_API",
        campaignId,
        customerId: jobData.customerId || null,
        customerName: jobData.customerName,
        phoneNumber: jobData.phoneNumber,
        normalizedPhone: jobData.phoneNumber,
        templateName: jobData.templateName,
        message: `[MANUAL RESOLUTION: MARK_ACCEPTED] Resolved by ${resolvedBy}. Notes: ${notes || "None"}`,
        status: "SENT",
        costPerMessage: 0.90,
        estimatedCharge: 0,
        sentAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));

      return NextResponse.json({
        success: true,
        message: "Job resolved as ACCEPTED without resending.",
        jobId,
        status: "ACCEPTED",
      });
    }

    if (resolution === "MARK_FAILED") {
      await updateDoc(
        jobRef,
        sanitizeFirestoreDoc({
          status: "FAILED",
          isAmbiguous: false,
          resolvedByAdmin: true,
          adminResolution: "MARK_FAILED",
          adminResolutionNotes: notes || "Manually marked FAILED by administrator.",
          resolvedBy,
          resolvedAt: nowIso,
          updatedAt: nowIso,
        })
      );
      await updateDoc(
        recRef,
        sanitizeFirestoreDoc({
          status: "FAILED",
          errorMessage: notes || "Manually marked FAILED by administrator.",
          updatedAt: nowIso,
        })
      );
      await syncCampaignStats(campaignId);

      // Write immutable audit log record to whatsapp_messages
      const auditRecord: Omit<WhatsAppMessageRecord, "id"> = {
        messageType: "MARKETING_CAMPAIGN",
        category: "MARKETING",
        provider: "WHATSAPP_CLOUD_API",
        campaignId,
        customerId: jobData.customerId || null,
        customerName: jobData.customerName,
        phoneNumber: jobData.phoneNumber,
        normalizedPhone: jobData.phoneNumber,
        templateName: jobData.templateName,
        message: `[MANUAL RESOLUTION: MARK_FAILED] Resolved by ${resolvedBy}. Notes: ${notes || "None"}`,
        status: "FAILED",
        costPerMessage: 0.90,
        estimatedCharge: 0,
        errorMessage: notes || "Manually marked FAILED by administrator.",
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));

      return NextResponse.json({
        success: true,
        message: "Job resolved as FAILED without resending.",
        jobId,
        status: "FAILED",
      });
    }

    if (resolution === "FORCE_RESEND") {
      if (acknowledgeDuplicateRisk !== true) {
        return NextResponse.json(
          {
            error:
              "Explicit acknowledgement of duplicate delivery risk is required (acknowledgeDuplicateRisk: true). Meta acceptance cannot be conclusively ruled out after a lost response, and exactly-once delivery cannot be guaranteed.",
          },
          { status: 400 }
        );
      }

      await updateDoc(
        jobRef,
        sanitizeFirestoreDoc({
          status: "PENDING",
          isAmbiguous: false,
          processingLeaseExpiresAt: null,
          nextAttemptAt: nowIso,
          resolvedByAdmin: true,
          adminResolution: "FORCE_RESEND",
          adminResolutionNotes: notes || "Forced manual re-dispatch authorized by administrator.",
          resolvedBy,
          manualResendCount: ((jobData as any).manualResendCount || 0) + 1,
          updatedAt: nowIso,
        })
      );
      await updateDoc(
        recRef,
        sanitizeFirestoreDoc({
          status: "PENDING",
          errorMessage: null,
          errorCode: null,
          updatedAt: nowIso,
        })
      );
      await syncCampaignStats(campaignId);

      // Write immutable audit log record to whatsapp_messages
      const auditRecord: Omit<WhatsAppMessageRecord, "id"> = {
        messageType: "MARKETING_CAMPAIGN",
        category: "MARKETING",
        provider: "WHATSAPP_CLOUD_API",
        campaignId,
        customerId: jobData.customerId || null,
        customerName: jobData.customerName,
        phoneNumber: jobData.phoneNumber,
        normalizedPhone: jobData.phoneNumber,
        templateName: jobData.templateName,
        message: `[MANUAL RESOLUTION: FORCE_RESEND] Authorized by ${resolvedBy}. Notes: ${notes || "None"}. Duplicate risk explicitly acknowledged.`,
        status: "PENDING",
        costPerMessage: 0.90,
        estimatedCharge: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));

      return NextResponse.json({
        success: true,
        message:
          "Job requeued to PENDING for re-dispatch. Warning: If Meta processed the prior attempt before the crash, the customer may receive a duplicate message.",
        jobId,
        status: "PENDING",
      });
    }

    return NextResponse.json({ error: "Unhandled resolution." }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error resolving ambiguous job";
    console.error("[Resolve Ambiguous API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

