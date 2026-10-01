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
} from "@/types/whatsapp";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { getTemplateLanguage } from "@/lib/whatsapp/templateRegistry";
import { calculateCampaignStats } from "@/lib/whatsapp/campaignStats";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const MESSAGES_COLLECTION = "whatsapp_messages";

import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    // 1. Fetch Campaign
    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const campaignSnap = await getDoc(campaignRef);

    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const campaign = { id: campaignSnap.id, ...campaignSnap.data() } as WhatsAppCampaign;

    if (campaign.status === "SENDING") {
      return NextResponse.json(
        { error: "Campaign is already in progress." },
        { status: 400 }
      );
    }

    // ── Master kill-switch ──────────────────────────────────────────────────
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) return enabledCheck.response;
    // ───────────────────────────────────────────────────────────────────────

    // 2. Check Provider Connection / Configuration
    const provider = getWhatsAppProvider();
    const providerStatus = await provider.getStatus();

    if (providerStatus.status !== "CONNECTED") {
      const errorMsg = providerStatus.errorMessage || "WhatsApp provider is not configured or connected.";
      await updateDoc(
        campaignRef,
        sanitizeFirestoreDoc({
          status: "FAILED",
          errorMessage: errorMsg,
          updatedAt: new Date().toISOString(),
        })
      );
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: 400 }
      );
    }

    // 3. Mark Campaign as SENDING
    const startedAt = new Date().toISOString();
    await updateDoc(
      campaignRef,
      sanitizeFirestoreDoc({
        status: "SENDING",
        startedAt,
        errorMessage: null,
      })
    );

    // 4. Fetch Pending Recipients for this campaign
    const q = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id),
      where("status", "==", "PENDING")
    );
    const recSnap = await getDocs(q);
    const recipients: WhatsAppCampaignRecipient[] = recSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaignRecipient));

    if (recipients.length === 0) {
      await updateDoc(
        campaignRef,
        sanitizeFirestoreDoc({
          status: "COMPLETED",
          completedAt: new Date().toISOString(),
        })
      );
      return NextResponse.json({
        success: true,
        message: "No pending recipients to send to.",
        campaign: { ...campaign, status: "COMPLETED" },
      });
    }

    // 5. Send Campaign Messages in Controlled Batches with Rate Limiting
    let sentCount = campaign.sentCount || 0;
    let failedCount = campaign.failedCount || 0;

    for (let i = 0; i < recipients.length; i++) {
      const rec = recipients[i];
      const nowIso = new Date().toISOString();

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
          const varKeys = Object.keys(campaign.templateVariables || {}).sort((a, b) => Number(a) - Number(b));

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

        // Dispatch via Provider using exact registered language code
        const templateLang = getTemplateLanguage(campaign.templateName, campaign.templateLanguage);
        const sendResult = await provider.sendTemplateMessage(
          rec.normalizedPhone || rec.phone,
          campaign.templateName,
          templateLang,
          components
        );

        if (sendResult.success) {
          sentCount++;
          // Update recipient doc in Firestore
          await updateDoc(
            doc(db, RECIPIENTS_COLLECTION, rec.id!),
            sanitizeFirestoreDoc({
              status: "SENT",
              metaMessageId: sendResult.messageId || null,
              sentAt: nowIso,
              updatedAt: nowIso,
              errorMessage: null,
            })
          );

          // Add record to unified whatsapp_messages audit collection
          const auditRecord: Omit<WhatsAppMessageRecord, "id"> = {
            messageType: "MARKETING_CAMPAIGN",
            campaignId: id,
            campaignName: campaign.name,
            customerId: rec.customerId || null,
            customerName: rec.customerName,
            phoneNumber: rec.phone,
            normalizedPhone: rec.normalizedPhone,
            templateName: campaign.templateName,
            message: `[Campaign Template: ${campaign.templateName}]`,
            status: "SENT",
            provider: provider.providerType,
            messageId: sendResult.messageId || null,
            sentAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));
        } else {
          failedCount++;
          await updateDoc(
            doc(db, RECIPIENTS_COLLECTION, rec.id!),
            sanitizeFirestoreDoc({
              status: "FAILED",
              errorMessage: sendResult.error || "Failed to dispatch WhatsApp message",
              errorCode: sendResult.errorCode || null,
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
            message: `[Campaign Template: ${campaign.templateName}]`,
            status: "FAILED",
            provider: provider.providerType,
            errorMessage: sendResult.error || "Message delivery failed",
            errorCode: sendResult.errorCode || null,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(auditRecord));
        }
      } catch (sendErr: unknown) {
        failedCount++;
        const errorMsg = sendErr instanceof Error ? sendErr.message : "Error sending message";
        await updateDoc(
          doc(db, RECIPIENTS_COLLECTION, rec.id!),
          sanitizeFirestoreDoc({
            status: "FAILED",
            errorMessage: errorMsg,
            updatedAt: nowIso,
          })
        );
      }

      // Safe rate-limiting pause between messages (60ms)
      if (i < recipients.length - 1) {
        await sleep(60);
      }
    }

    // 6. Update Final Campaign Status and stats from Single Source of Truth
    const completedAt = new Date().toISOString();
    const allRecSnap = await getDocs(
      query(collection(db, RECIPIENTS_COLLECTION), where("campaignId", "==", id))
    );
    const allRecs = allRecSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WhatsAppCampaignRecipient));
    const stats = calculateCampaignStats(allRecs);

    let finalStatus: WhatsAppCampaign["status"] = stats.status || "COMPLETED";
    if (failedCount > 0 && sentCount === 0) {
      finalStatus = "FAILED";
    } else if (failedCount > 0) {
      finalStatus = "COMPLETED_WITH_ERRORS";
    }

    await updateDoc(
      campaignRef,
      sanitizeFirestoreDoc({
        status: finalStatus,
        totalRecipients: stats.totalRecipients,
        sentCount: stats.sentCount,
        deliveredCount: stats.deliveredCount,
        readCount: stats.readCount,
        failedCount: stats.failedCount,
        excludedCount: stats.excludedCount,
        completedAt,
        updatedAt: completedAt,
      })
    );

    return NextResponse.json({
      success: true,
      status: finalStatus,
      sentCount: stats.sentCount,
      deliveredCount: stats.deliveredCount,
      readCount: stats.readCount,
      failedCount: stats.failedCount,
      totalProcessed: recipients.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error executing campaign send";
    console.error("[Campaign Send API] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
