import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from "firebase/firestore";
import type {
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppMessageRecord,
  WhatsAppDeliveryAttempt,
} from "@/types/whatsapp";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { calculateCampaignStats } from "@/lib/whatsapp/campaignStats";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { getTemplateLanguage } from "@/lib/whatsapp/templateRegistry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const MESSAGES_COLLECTION = "whatsapp_messages";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const campaignSnap = await getDoc(campaignRef);

    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const campaign = { id: campaignSnap.id, ...campaignSnap.data() } as WhatsAppCampaign;

    // 1. Fetch ONLY currently failed recipients
    const qFailed = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id),
      where("status", "==", "FAILED")
    );
    const recSnap = await getDocs(qFailed);
    const failedRecipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    if (failedRecipients.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No failed recipients found to retry for this campaign.",
      });
    }

    // 2. Initialize and verify provider
    const provider = getWhatsAppProvider();
    const providerStatus = await provider.getStatus();
    if (providerStatus.status !== "CONNECTED") {
      return NextResponse.json(
        { error: providerStatus.errorMessage || "WhatsApp provider is not configured or connected." },
        { status: 400 }
      );
    }

    let retriedSuccessCount = 0;
    let retriedFailedCount = 0;

    // 3. Dispatch retries only to failed recipients
    for (let i = 0; i < failedRecipients.length; i++) {
      const rec = failedRecipients[i];
      const nowIso = new Date().toISOString();

      // Build Attempt History (Preserve past attempt 1)
      const priorAttempts: WhatsAppDeliveryAttempt[] = Array.isArray(rec.attempts)
        ? [...rec.attempts]
        : [];

      if (priorAttempts.length === 0) {
        priorAttempts.push({
          attempt: 1,
          status: "FAILED",
          sentAt: rec.sentAt || rec.createdAt,
          errorMessage: rec.errorMessage || "Delivery failed",
          errorCode: rec.errorCode || null,
          metaMessageId: rec.metaMessageId || null,
        });
      }

      const currentAttemptNumber = priorAttempts.length + 1;

      try {
        // Build template component parameters dynamically
        let components: Array<Record<string, unknown>> | undefined = undefined;

        if (campaign.templateName === "blow_salon_campaign") {
          const customerName = (rec.customerName || "Customer").trim();
          const campaignContent = (
            campaign.templateVariables?.["2"] ||
            campaign.templateVariables?.["content"] ||
            campaign.templateVariables?.["message"] ||
            "Welcome to BLOW SALON"
          ).trim();

          components = [
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
              bodyParameters.push({
                type: "text",
                text: resolvedText,
              });
            }
          }

          if (bodyParameters.length > 0) {
            components = [{ type: "body", parameters: bodyParameters }];
          }
        }

        const templateLang = getTemplateLanguage(
          campaign.templateName,
          campaign.templateLanguage
        );

        // Execute retry dispatch
        const sendResult = await provider.sendTemplateMessage(
          rec.normalizedPhone || rec.phone,
          campaign.templateName,
          templateLang,
          components
        );

        if (sendResult.success) {
          retriedSuccessCount++;
          priorAttempts.push({
            attempt: currentAttemptNumber,
            status: "SENT",
            sentAt: nowIso,
            metaMessageId: sendResult.messageId || null,
          });

          // Update existing recipient record (Single source of truth)
          await updateDoc(
            doc(db, RECIPIENTS_COLLECTION, rec.id),
            sanitizeFirestoreDoc({
              status: "SENT",
              metaMessageId: sendResult.messageId || null,
              errorMessage: null,
              errorCode: null,
              retryCount: (rec.retryCount || 0) + 1,
              attempts: priorAttempts,
              sentAt: nowIso,
              updatedAt: nowIso,
            })
          );

          // Add a new audit entry in whatsapp_messages to preserve attempt history
          const auditRecord: Omit<WhatsAppMessageRecord, "id"> = {
            messageType: "MARKETING_CAMPAIGN",
            campaignId: id,
            campaignName: campaign.name,
            customerId: rec.customerId || null,
            customerName: rec.customerName,
            phoneNumber: rec.phone,
            normalizedPhone: rec.normalizedPhone,
            templateName: campaign.templateName,
            message: `[Campaign Template: ${campaign.templateName}] (Retry #${currentAttemptNumber})`,
            status: "SENT",
            provider: provider.providerType,
            messageId: sendResult.messageId || null,
            metaMessageId: sendResult.messageId || null,
            retryCount: currentAttemptNumber,
            sentAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));
        } else {
          retriedFailedCount++;
          priorAttempts.push({
            attempt: currentAttemptNumber,
            status: "FAILED",
            sentAt: nowIso,
            errorMessage: sendResult.error || "Retry delivery failed",
            errorCode: sendResult.errorCode || null,
          });

          await updateDoc(
            doc(db, RECIPIENTS_COLLECTION, rec.id),
            sanitizeFirestoreDoc({
              status: "FAILED",
              errorMessage: sendResult.error || "Retry delivery failed",
              errorCode: sendResult.errorCode || null,
              retryCount: (rec.retryCount || 0) + 1,
              attempts: priorAttempts,
              updatedAt: nowIso,
            })
          );

          const auditRecord: Omit<WhatsAppMessageRecord, "id"> = {
            messageType: "MARKETING_CAMPAIGN",
            campaignId: id,
            campaignName: campaign.name,
            customerId: rec.customerId || null,
            customerName: rec.customerName,
            phoneNumber: rec.phone,
            normalizedPhone: rec.normalizedPhone,
            templateName: campaign.templateName,
            message: `[Campaign Template: ${campaign.templateName}] (Retry #${currentAttemptNumber})`,
            status: "FAILED",
            provider: provider.providerType,
            errorMessage: sendResult.error || "Retry delivery failed",
            errorCode: sendResult.errorCode || null,
            retryCount: currentAttemptNumber,
            sentAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));
        }
      } catch (err: unknown) {
        retriedFailedCount++;
        const errorMsg = err instanceof Error ? err.message : "Error retrying message";
        priorAttempts.push({
          attempt: currentAttemptNumber,
          status: "FAILED",
          sentAt: nowIso,
          errorMessage: errorMsg,
        });

        await updateDoc(
          doc(db, RECIPIENTS_COLLECTION, rec.id),
          sanitizeFirestoreDoc({
            status: "FAILED",
            errorMessage: errorMsg,
            retryCount: (rec.retryCount || 0) + 1,
            attempts: priorAttempts,
            updatedAt: nowIso,
          })
        );
      }

      // Safe dispatch pacing between retried messages
      if (i < failedRecipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    // 4. Recalculate campaign statistics from all recipient records
    const allRecSnap = await getDocs(
      query(collection(db, RECIPIENTS_COLLECTION), where("campaignId", "==", id))
    );
    const allRecs = allRecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const stats = calculateCampaignStats(allRecs);

    const nowIso = new Date().toISOString();
    await updateDoc(
      campaignRef,
      sanitizeFirestoreDoc({
        totalRecipients: stats.totalRecipients,
        sentCount: stats.sentCount,
        deliveredCount: stats.deliveredCount,
        readCount: stats.readCount,
        failedCount: stats.failedCount,
        excludedCount: stats.excludedCount,
        status: stats.status || (stats.failedCount === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS"),
        updatedAt: nowIso,
      })
    );

    return NextResponse.json({
      success: true,
      message: `Retried ${failedRecipients.length} failed recipient(s). ${retriedSuccessCount} accepted, ${retriedFailedCount} failed.`,
      retriedSuccessCount,
      retriedFailedCount,
      stats,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to retry failed recipients";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
