import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc,
  setDoc,
  addDoc,
  doc,
  increment,
} from "firebase/firestore";
import type { WhatsAppMessageStatus } from "@/types/whatsapp";
import { maskPhoneNumber } from "@/lib/whatsapp/logger";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { toTitleCase } from "@/lib/utils/text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { calculateCampaignStats } from "@/lib/whatsapp/campaignStats";

const MESSAGES_COLLECTION = "whatsapp_messages";
const CONVERSATIONS_COLLECTION = "whatsapp_conversations";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const CUSTOMERS_COLLECTION = "customers";

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

                    // Update corresponding conversation lastMessageStatus if applicable
                    if (msgData.conversationId) {
                      try {
                        const convRef = doc(db, CONVERSATIONS_COLLECTION, msgData.conversationId);
                        const convSnap = await getDoc(convRef);
                        if (convSnap.exists()) {
                          await updateDoc(convRef, {
                            lastMessageStatus: mappedStatus,
                            updatedAt: nowIso,
                          });
                        }
                      } catch (convErr) {
                        console.warn("[WhatsApp Webhook] Could not update conversation status:", convErr);
                      }
                    }
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

          // B. Handle Incoming Messages from Customers
          if (Array.isArray(value.messages)) {
            const profileName = value.contacts?.[0]?.profile?.name || null;

            for (const msg of value.messages) {
              const metaMessageId = msg.id;
              const senderRaw = msg.from;
              const msgType = msg.type || "text";
              const nowIso = new Date().toISOString();

              console.log(
                `[WhatsApp Webhook] Processing incoming message ID=${metaMessageId} from: ${maskPhoneNumber(senderRaw)} (Type: ${msgType})`
              );

              // 1. Idempotency check: prevent duplicate insertion
              if (metaMessageId) {
                try {
                  const qDup = query(
                    collection(db, MESSAGES_COLLECTION),
                    where("metaMessageId", "==", metaMessageId)
                  );
                  const dupSnap = await getDocs(qDup);
                  if (!dupSnap.empty) {
                    console.log(`[WhatsApp Webhook] Skipping duplicate incoming message ID=${metaMessageId}`);
                    continue;
                  }
                } catch (dupErr) {
                  console.warn("[WhatsApp Webhook] Idempotency check error:", dupErr);
                }
              }

              // 2. Normalize sender phone
              const normalized = normalizePhoneNumber(senderRaw);
              const digits = normalized.digits || senderRaw;
              const displayPhone = normalized.display || senderRaw;

              // 3. Match or link customer in existing customers collection (DO NOT duplicate DB)
              let customerId: string | null = null;
              let customerName: string = profileName ? toTitleCase(profileName) : "WhatsApp Contact";

              try {
                // Check direct digit match
                const qCust1 = query(collection(db, CUSTOMERS_COLLECTION), where("phone", "==", digits));
                let custSnap = await getDocs(qCust1);

                // Check 10-digit suffix match (Indian mobile standard)
                if (custSnap.empty && digits.length === 12 && digits.startsWith("91")) {
                  const tenDigit = digits.slice(2);
                  const qCust2 = query(collection(db, CUSTOMERS_COLLECTION), where("phone", "==", tenDigit));
                  custSnap = await getDocs(qCust2);
                }

                if (!custSnap.empty) {
                  const custDoc = custSnap.docs[0];
                  customerId = custDoc.id;
                  customerName = custDoc.data().name || customerName;
                } else {
                  // If customer doesn't exist yet, auto-create a clean record in existing customers collection
                  const newCustDocRef = doc(collection(db, CUSTOMERS_COLLECTION));
                  customerId = newCustDocRef.id;
                  const newCustomerData = {
                    name: customerName,
                    phone: digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits,
                    customerType: "regular" as const,
                    createdAt: nowIso,
                    whatsappOptIn: true,
                    whatsappOptInAt: nowIso,
                  };
                  await setDoc(newCustDocRef, newCustomerData);

                  // Increment stats counter
                  try {
                    await setDoc(
                      doc(db, "stats", "customers"),
                      { regularCount: increment(1) },
                      { merge: true }
                    );
                  } catch {}
                }
              } catch (custErr) {
                console.error("[WhatsApp Webhook] Error matching/creating customer:", custErr);
              }

              // 4. Extract message text
              let messageText = "";
              if (msgType === "text") {
                messageText = msg.text?.body || "";
              } else if (msgType === "button") {
                messageText = msg.button?.text || "[Button Reply]";
              } else if (msgType === "interactive") {
                messageText =
                  msg.interactive?.button_reply?.title ||
                  msg.interactive?.list_reply?.title ||
                  "[Interactive Reply]";
              } else if (msgType === "image") {
                messageText = msg.image?.caption ? `[Image] ${msg.image.caption}` : "[Image received]";
              } else if (msgType === "video") {
                messageText = msg.video?.caption ? `[Video] ${msg.video.caption}` : "[Video received]";
              } else if (msgType === "document") {
                messageText = msg.document?.filename ? `[Document] ${msg.document.filename}` : "[Document received]";
              } else if (msgType === "audio") {
                messageText = "[Voice Note received]";
              } else if (msgType === "location") {
                messageText = "[Location shared]";
              } else {
                messageText = `[${msgType} message received]`;
              }

              const conversationId = digits;

              // 5. Update or create Conversation in whatsapp_conversations
              try {
                const convRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
                const convSnap = await getDoc(convRef);
                const isNew = !convSnap.exists();

                await setDoc(
                  convRef,
                  sanitizeFirestoreDoc({
                    id: conversationId,
                    phoneNumber: displayPhone,
                    normalizedPhone: digits,
                    customerId: customerId || null,
                    customerName,
                    lastMessage: messageText,
                    lastMessageAt: nowIso,
                    lastMessageDirection: "INBOUND",
                    lastMessageStatus: "DELIVERED",
                    lastInboundAt: nowIso, // Resets 24-hr customer service window!
                    unreadCount: increment(1),
                    updatedAt: nowIso,
                    ...(isNew ? { createdAt: nowIso, isArchived: false } : {}),
                  }),
                  { merge: true }
                );
              } catch (convErr) {
                console.error(`[WhatsApp Webhook] Error updating conversation ${conversationId}:`, convErr);
              }

              // 6. Save message in whatsapp_messages collection
              try {
                const messageRecord = {
                  conversationId,
                  direction: "INBOUND" as const,
                  messageType: "INBOX_TEXT" as const,
                  customerId: customerId || null,
                  customerName,
                  phoneNumber: digits,
                  recipientPhone: displayPhone,
                  normalizedPhone: digits,
                  message: messageText,
                  status: "DELIVERED" as WhatsAppMessageStatus,
                  provider: "WHATSAPP_CLOUD_API" as const,
                  messageId: metaMessageId || null,
                  metaMessageId: metaMessageId || null,
                  deliveredAt: nowIso,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                };

                await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(messageRecord));
              } catch (msgStoreErr) {
                console.error(`[WhatsApp Webhook] Error storing inbound message:`, msgStoreErr);
              }
            }
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

