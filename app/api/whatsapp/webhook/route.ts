import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  setDoc,
  doc,
} from "firebase/firestore";
import type { WhatsAppMessageStatus } from "@/types/whatsapp";
import { maskPhoneNumber } from "@/lib/whatsapp/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { calculateCampaignStats } from "@/lib/whatsapp/campaignStats";

const MESSAGES_COLLECTION = "whatsapp_messages";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";

/**
 * GET /api/whatsapp/webhook
 * Handles Meta Webhook Verification Handshake
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("hub.mode");
    const verifyToken = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    const expectedVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

    if (mode === "subscribe" && verifyToken && expectedVerifyToken && verifyToken === expectedVerifyToken) {
      console.log("[WhatsApp Webhook] Webhook subscription verified successfully.");
      return new Response(challenge || "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.warn("[WhatsApp Webhook] Verification failed: Token mismatch or invalid mode.");
    return new Response("Forbidden", { status: 403 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error during webhook verification";
    console.error("[WhatsApp Webhook] GET error:", msg);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * POST /api/whatsapp/webhook
 * Receives Meta WhatsApp Cloud API events (Delivery receipts, Read receipts, Failures, Inbound messages)
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // 1. Webhook Signature Verification (X-Hub-Signature-256) if app secret configured
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    if (appSecret) {
      const signatureHeader = request.headers.get("x-hub-signature-256") || "";
      const expectedSignature = `sha256=${crypto
        .createHmac("sha256", appSecret)
        .update(rawBody, "utf8")
        .digest("hex")}`;

      const sigBuffer = Buffer.from(signatureHeader);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.warn("[WhatsApp Webhook] Signature verification failed.");
        return new Response("Unauthorized signature", { status: 401 });
      }
    }

    // 2. Parse Payload safely
    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // 3. Process events asynchronously without blocking the 200 OK response
    if (payload.object === "whatsapp_business_account" && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        if (!Array.isArray(entry.changes)) continue;

        for (const change of entry.changes) {
          const value = change.value;
          if (!value) continue;

          // A. Handle Status Updates (sent, delivered, read, failed)
          if (Array.isArray(value.statuses)) {
            for (const statusObj of value.statuses) {
              const messageId = statusObj.id;
              const statusStr = (statusObj.status || "").toLowerCase();
              const recipientPhone = statusObj.recipient_id;

              let mappedStatus: WhatsAppMessageStatus | null = null;
              if (statusStr === "sent") mappedStatus = "SENT";
              else if (statusStr === "delivered") mappedStatus = "DELIVERED";
              else if (statusStr === "read") mappedStatus = "READ";
              else if (statusStr === "failed") mappedStatus = "FAILED";

              if (messageId && mappedStatus) {
                console.log(
                  `[WhatsApp Webhook] Status update: ID=${messageId} -> ${mappedStatus} (Phone: ${maskPhoneNumber(recipientPhone)})`
                );

                const nowIso = new Date().toISOString();

                // 1. Update matching unified Firestore audit doc (whatsapp_messages)
                try {
                  const qMsg = query(
                    collection(db, MESSAGES_COLLECTION),
                    where("messageId", "==", messageId)
                  );
                  const msgSnap = await getDocs(qMsg);

                  if (!msgSnap.empty) {
                    const docSnap = msgSnap.docs[0];
                    const msgData = docSnap.data();
                    const updatePayload: Record<string, any> = {
                      status: mappedStatus,
                      updatedAt: nowIso,
                    };

                    if (mappedStatus === "DELIVERED") {
                      updatePayload.deliveredAt = nowIso;
                    } else if (mappedStatus === "READ") {
                      updatePayload.readAt = nowIso;
                    } else if (mappedStatus === "FAILED") {
                      const errorObj = statusObj.errors?.[0];
                      updatePayload.errorMessage = errorObj?.message || errorObj?.title || "Message delivery failed";
                      updatePayload.errorCode = "WHATSAPP_API_ERROR";
                    }

                    await updateDoc(
                      doc(db, MESSAGES_COLLECTION, docSnap.id),
                      sanitizeFirestoreDoc(updatePayload)
                    );


                  }
                } catch (msgErr) {
                  console.error(
                    `[WhatsApp Webhook] Failed to update message audit doc ${messageId}:`,
                    msgErr instanceof Error ? msgErr.message : msgErr
                  );
                }

                // 2. Update matching campaign recipient doc (whatsapp_campaign_recipients)
                try {
                  const qRec = query(
                    collection(db, RECIPIENTS_COLLECTION),
                    where("metaMessageId", "==", messageId)
                  );
                  const recSnap = await getDocs(qRec);

                  if (!recSnap.empty) {
                    const recDoc = recSnap.docs[0];
                    const recData = recDoc.data();
                    const campaignId = recData.campaignId;

                    const recUpdate: Record<string, any> = {
                      status: mappedStatus,
                      updatedAt: nowIso,
                    };

                    if (mappedStatus === "DELIVERED") {
                      recUpdate.deliveredAt = nowIso;
                    } else if (mappedStatus === "READ") {
                      recUpdate.readAt = nowIso;
                    } else if (mappedStatus === "FAILED") {
                      const errorObj = statusObj.errors?.[0];
                      recUpdate.errorMessage = errorObj?.message || errorObj?.title || "Delivery failed";
                    }

                    await updateDoc(
                      doc(db, RECIPIENTS_COLLECTION, recDoc.id),
                      sanitizeFirestoreDoc(recUpdate)
                    );

                    // 3. Recalculate and Synchronize Campaign Counters from Recipient Records
                    if (campaignId) {
                      const allRecSnap = await getDocs(
                        query(collection(db, RECIPIENTS_COLLECTION), where("campaignId", "==", campaignId))
                      );
                      const allRecs = allRecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
                      const stats = calculateCampaignStats(allRecs);

                      await updateDoc(
                        doc(db, CAMPAIGNS_COLLECTION, campaignId),
                        sanitizeFirestoreDoc({
                          totalRecipients: stats.totalRecipients,
                          sentCount: stats.sentCount,
                          deliveredCount: stats.deliveredCount,
                          readCount: stats.readCount,
                          failedCount: stats.failedCount,
                          excludedCount: stats.excludedCount,
                          ...(stats.status ? { status: stats.status } : {}),
                          updatedAt: nowIso,
                        })
                      );
                    }
                  }
                } catch (recErr) {
                  console.error(
                    `[WhatsApp Webhook] Failed to update campaign recipient doc ${messageId}:`,
                    recErr instanceof Error ? recErr.message : recErr
                  );
                }
              }
            }
          }

          // B. Incoming customer messages — Inbox feature removed
          // Inbound messages are no longer stored in Firestore.
          if (Array.isArray(value.messages) && value.messages.length > 0) {
            const messageCount = value.messages.length;
            console.log(`[WhatsApp Webhook] Received ${messageCount} inbound message(s) — Inbox feature disabled, not persisting.`);
          }


          // C. WhatsApp Business App Coexistence Events (Phase 2 Architectural Foundation)
          const field = change.field;
          if (field === "smb_message_echoes" || (value as any).message_echoes) {
            console.log("[WhatsApp Webhook] Received smb_message_echoes event (Coexistence - Phase 2 Foundation)");
          } else if (field === "history" || (value as any).history) {
            console.log("[WhatsApp Webhook] Received history sync event (Coexistence - Phase 2 Foundation)");
          } else if (field === "account_update" || (value as any).account_update) {
            console.log("[WhatsApp Webhook] Received account_update event (Coexistence - Phase 2 Foundation)");
          } else if (field === "smb_app_state_sync" || (value as any).smb_app_state_sync) {
            console.log("[WhatsApp Webhook] Received smb_app_state_sync event (Coexistence - Phase 2 Foundation)");
          }
        }
      }
    }

    // Always respond 200 OK quickly to Meta
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error processing WhatsApp webhook";
    console.error("[WhatsApp Webhook] POST error:", errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 200 });
  }
}

