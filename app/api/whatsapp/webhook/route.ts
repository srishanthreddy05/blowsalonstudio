import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  adminDb as db,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  setDoc,
  doc,
  getDoc,
} from "@/lib/firebaseAdmin";
import type { WhatsAppMessageStatus } from "@/types/whatsapp";
import { maskPhoneNumber } from "@/lib/whatsapp/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { calculateCampaignStats } from "@/lib/whatsapp/campaignStats";
import { syncCampaignStats } from "@/lib/whatsapp/queue/queueManager";
import { parseWhatsAppFailure } from "@/lib/whatsapp/errorClassifier";
import type { WhatsAppDeliveryAttempt } from "@/types/whatsapp";
import {
  handleIncomingCallWebhook,
  handleCallPermissionWebhook,
} from "@/lib/whatsapp/callingService";

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

                const STATUS_RANK: Record<string, number> = {
                  FAILED: 1,
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

                const errorObj = statusObj.errors?.[0];
                const failureClass = mappedStatus === "FAILED"
                  ? parseWhatsAppFailure(errorObj?.message || errorObj?.title, errorObj?.code)
                  : null;

                // 1. Update matching unified Firestore audit doc (whatsapp_messages)
                try {
                  let msgDocs: any[] = [];
                  const qMsg = query(
                    collection(db, MESSAGES_COLLECTION),
                    where("messageId", "==", messageId)
                  );
                  const msgSnap = await getDocs(qMsg);
                  msgDocs = msgSnap.docs;

                  if (msgDocs.length === 0) {
                    const qMeta = query(
                      collection(db, MESSAGES_COLLECTION),
                      where("metaMessageId", "==", messageId)
                    );
                    const metaSnap = await getDocs(qMeta);
                    msgDocs = metaSnap.docs;
                  }

                  if (msgDocs.length > 0) {
                    const docSnap = msgDocs[0];
                    const msgData = docSnap.data();
                    const currentStatus = (msgData.status || "").toUpperCase();
                    const currentRank = STATUS_RANK[currentStatus] || 0;
                    const newRank = STATUS_RANK[mappedStatus] || 0;

                    // Idempotency: Do not downgrade READ to DELIVERED or SENT
                    if (newRank > 0 && currentRank >= newRank && currentStatus !== mappedStatus) {
                      // Skip status downgrade
                    } else if (currentStatus === mappedStatus && (mappedStatus !== "FAILED")) {
                      // Already in final status, idempotent no-op
                    } else {
                      const updatePayload: Record<string, any> = {
                        status: mappedStatus,
                        updatedAt: nowIso,
                      };

                      if (mappedStatus === "DELIVERED") {
                        updatePayload.deliveredAt = msgData.deliveredAt || nowIso;
                      } else if (mappedStatus === "READ") {
                        updatePayload.deliveredAt = msgData.deliveredAt || nowIso;
                        updatePayload.readAt = msgData.readAt || nowIso;
                      } else if (mappedStatus === "FAILED") {
                        updatePayload.errorMessage = failureClass?.details || failureClass?.shortReason || errorObj?.message || errorObj?.title || "Message delivery failed";
                        updatePayload.errorCode = errorObj?.code ? String(errorObj.code) : "WHATSAPP_API_ERROR";
                      }

                      await updateDoc(
                        doc(db, MESSAGES_COLLECTION, docSnap.id),
                        sanitizeFirestoreDoc(updatePayload)
                      );
                    }
                  }
                } catch (msgErr) {
                  console.error(
                    `[WhatsApp Webhook] Failed to update message audit doc ${messageId}:`,
                    msgErr instanceof Error ? msgErr.message : msgErr
                  );
                }

                // 2. Update matching persistent queue job (whatsappCampaignJobs)
                // Finds by messageIds array-contains or scalar whatsappMessageId
                let jobDocs: any[] = [];
                try {
                  try {
                    const qJobArr = query(
                      collection(db, "whatsappCampaignJobs"),
                      where("messageIds", "array-contains", messageId)
                    );
                    const jobArrSnap = await getDocs(qJobArr);
                    jobDocs = jobArrSnap.docs;
                  } catch {
                    // Fallback to scalar match
                  }

                  if (jobDocs.length === 0) {
                    const qJob = query(
                      collection(db, "whatsappCampaignJobs"),
                      where("whatsappMessageId", "==", messageId)
                    );
                    const jobSnap = await getDocs(qJob);
                    jobDocs = jobSnap.docs;
                  }

                  // Crash Recovery Reconciliation:
                  // If wamid was lost in a server crash before being persisted,
                  // search for an AMBIGUOUS job matching the recipient phone number.
                  if (jobDocs.length === 0 && recipientPhone) {
                    const qAmb = query(
                      collection(db, "whatsappCampaignJobs"),
                      where("phoneNumber", "==", recipientPhone),
                      where("status", "==", "AMBIGUOUS")
                    );
                    const ambSnap = await getDocs(qAmb);
                    if (ambSnap.docs.length === 1) {
                      // Safe single-job match: exactly one ambiguous job exists for this recipient
                      const candidateDoc = ambSnap.docs[0];
                      const ambData = candidateDoc.data();
                      const dispatchTime = ambData.dispatchStartedAt || ambData.lastAttemptAt || ambData.createdAt;
                      const dispatchTimeMs = dispatchTime ? new Date(dispatchTime).getTime() : 0;
                      const dispatchAgeMs = dispatchTimeMs ? Date.now() - dispatchTimeMs : 0;
                      const MAX_RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;

                      // Chronological safeguard: Check Meta webhook timestamp if available
                      const webhookTimestampSec = Number(statusObj.timestamp);
                      const webhookEventTimeMs = !isNaN(webhookTimestampSec) && webhookTimestampSec > 0
                        ? webhookTimestampSec * 1000
                        : null;

                      // If webhook event occurred before dispatch attempt even started (with 60s clock skew margin),
                      // it belongs to an older/stale attempt on that phone number and MUST NOT be linked.
                      const isPreDispatchStale = webhookEventTimeMs !== null && dispatchTimeMs > 0 &&
                        webhookEventTimeMs < (dispatchTimeMs - 60000);

                      if (isPreDispatchStale) {
                        console.warn(
                          `[WhatsApp Webhook] Webhook timestamp (${new Date(webhookEventTimeMs!).toISOString()}) precedes ambiguous dispatch attempt start (${new Date(dispatchTimeMs).toISOString()}). Skipping stale automated link.`
                        );
                      } else if (dispatchAgeMs <= MAX_RECONCILIATION_WINDOW_MS) {
                        jobDocs = [candidateDoc];
                        const existingIds = ambData.messageIds || [];
                        await updateDoc(
                          doc(db, "whatsappCampaignJobs", candidateDoc.id),
                          sanitizeFirestoreDoc({
                            whatsappMessageId: messageId,
                            messageIds: Array.from(new Set([...existingIds, messageId])),
                            isAmbiguous: false,
                            reconciledViaWebhook: true,
                            updatedAt: nowIso,
                          })
                        );
                      } else {
                        console.warn(
                          `[WhatsApp Webhook] Ambiguous job ${candidateDoc.id} dispatch age exceeds 24h window. Skipping automated link.`
                        );
                      }
                    } else if (ambSnap.docs.length > 1) {
                      // Safety guard: Multiple ambiguous jobs exist for this phone number.
                      // Do NOT guess or arbitrarily bind wamid to avoid cross-campaign contamination.
                      console.warn(
                        `[WhatsApp Webhook] Multiple ambiguous jobs (${ambSnap.docs.length}) found for phone ${maskPhoneNumber(recipientPhone)}. Leaving for manual admin resolution.`
                      );
                    }
                  }

                  if (jobDocs.length > 0) {
                    const jobDoc = jobDocs[0];
                    const jobData = jobDoc.data();
                    const currentStatus = (jobData.status || "").toUpperCase();
                    const currentRank = STATUS_RANK[currentStatus] || 0;
                    const newRank = STATUS_RANK[mappedStatus] || 0;

                    if (newRank > 0 && currentRank >= newRank && currentStatus !== mappedStatus) {
                      // Skip status downgrade
                    } else if (currentStatus === mappedStatus && mappedStatus !== "FAILED") {
                      // Duplicate event
                    } else {
                      const jobUpdate: Record<string, any> = {
                        status: mappedStatus,
                        isAmbiguous: false,
                        updatedAt: nowIso,
                      };

                      if (mappedStatus === "DELIVERED") {
                        jobUpdate.deliveredAt = jobData.deliveredAt || nowIso;
                      } else if (mappedStatus === "READ") {
                        jobUpdate.deliveredAt = jobData.deliveredAt || nowIso;
                        jobUpdate.readAt = jobData.readAt || nowIso;
                      } else if (mappedStatus === "FAILED") {
                        jobUpdate.failedAt = nowIso;
                        jobUpdate.lastError = failureClass?.details || failureClass?.shortReason || errorObj?.message || errorObj?.title || "Message delivery failed";
                        jobUpdate.metaErrorCode = errorObj?.code || null;
                        jobUpdate.metaErrorDetails = errorObj?.details || errorObj?.message || errorObj?.title || null;
                        jobUpdate.classification = failureClass?.classification || null;
                        jobUpdate.errorSource = "WEBHOOK";
                      }

                      await updateDoc(
                        doc(db, "whatsappCampaignJobs", jobDoc.id),
                        sanitizeFirestoreDoc(jobUpdate)
                      );
                    }
                  }
                } catch (jobErr) {
                  console.error(`[WhatsApp Webhook] Failed to update queue job for ${messageId}:`, jobErr);
                }

                // 3. Update matching campaign recipient doc (whatsapp_campaign_recipients)
                // Finds by messageIds array-contains or scalar metaMessageId
                try {
                  let recDocs: any[] = [];
                  try {
                    const qRecArr = query(
                      collection(db, RECIPIENTS_COLLECTION),
                      where("messageIds", "array-contains", messageId)
                    );
                    const recArrSnap = await getDocs(qRecArr);
                    recDocs = recArrSnap.docs;
                  } catch {
                    // Fallback to scalar match
                  }

                  if (recDocs.length === 0) {
                    const qRec = query(
                      collection(db, RECIPIENTS_COLLECTION),
                      where("metaMessageId", "==", messageId)
                    );
                    const recSnap = await getDocs(qRec);
                    recDocs = recSnap.docs;
                  }

                  // Crash Recovery Reconciliation for Recipient:
                  // Use the exact recipientId from the matched job to prevent cross-campaign contamination
                  if (recDocs.length === 0 && jobDocs.length > 0 && jobDocs[0].data()?.recipientId) {
                    const matchedRecRef = doc(db, RECIPIENTS_COLLECTION, jobDocs[0].data().recipientId);
                    const matchedRecSnap = await getDoc(matchedRecRef);
                    if (matchedRecSnap.exists()) {
                      recDocs = [matchedRecSnap];
                    }
                  }

                  if (recDocs.length > 0) {
                    const recDoc = recDocs[0];
                    const recData = recDoc.data();
                    const campaignId = recData.campaignId;
                    const currentStatus = (recData.status || "").toUpperCase();
                    const currentRank = STATUS_RANK[currentStatus] || 0;
                    const newRank = STATUS_RANK[mappedStatus] || 0;

                    let shouldRecalculate = false;

                    if (newRank > 0 && currentRank >= newRank && currentStatus !== mappedStatus) {
                      // Skip status downgrade
                    } else if (currentStatus === mappedStatus && mappedStatus !== "FAILED") {
                      // Idempotent duplicate event
                    } else {
                      shouldRecalculate = true;
                      const recUpdate: Record<string, any> = {
                        status: mappedStatus,
                        updatedAt: nowIso,
                      };

                      if (mappedStatus === "DELIVERED") {
                        recUpdate.deliveredAt = recData.deliveredAt || nowIso;
                      } else if (mappedStatus === "READ") {
                        recUpdate.deliveredAt = recData.deliveredAt || nowIso;
                        recUpdate.readAt = recData.readAt || nowIso;
                      } else if (mappedStatus === "FAILED") {
                        recUpdate.errorMessage = failureClass?.details || failureClass?.shortReason || errorObj?.message || errorObj?.title || "Delivery failed";
                        recUpdate.errorCode = errorObj?.code ? String(errorObj.code) : null;
                        recUpdate.metaErrorDetails = errorObj?.details || errorObj?.message || errorObj?.title || null;
                        recUpdate.classification = failureClass?.classification || null;
                        recUpdate.errorSource = "WEBHOOK";
                      }

                      // Append to attempts history array cleanly without undefined properties
                      const existingAttempts: WhatsAppDeliveryAttempt[] = Array.isArray(recData.attempts) ? [...recData.attempts] : [];
                      const newAttempt: WhatsAppDeliveryAttempt = {
                        attempt: recData.attemptCount || recData.retryCount || 1,
                        status: mappedStatus,
                        sentAt: recData.sentAt || nowIso,
                        metaMessageId: messageId,
                      };
                      if (mappedStatus === "DELIVERED" || mappedStatus === "READ") {
                        newAttempt.deliveredAt = recData.deliveredAt || nowIso;
                      }
                      if (mappedStatus === "READ") {
                        newAttempt.readAt = recData.readAt || nowIso;
                      }
                      if (mappedStatus === "FAILED") {
                        newAttempt.errorMessage = failureClass?.details || failureClass?.shortReason || errorObj?.message || errorObj?.title || "Delivery failed";
                        if (errorObj?.code) {
                          newAttempt.errorCode = String(errorObj.code);
                        }
                      }
                      existingAttempts.push(newAttempt);
                      recUpdate.attempts = existingAttempts;

                      await updateDoc(
                        doc(db, RECIPIENTS_COLLECTION, recDoc.id),
                        sanitizeFirestoreDoc(recUpdate)
                      );
                    }

                    // 4. Recalculate and Synchronize Campaign Counters using authoritative queue job statuses
                    if (campaignId && shouldRecalculate) {
                      await syncCampaignStats(campaignId);
                    }
                  } else if (jobDocs.length > 0 && jobDocs[0]?.data()?.campaignId) {
                    // Fallback: If recipient doc was not found, still reconcile campaign counters from authoritative queue jobs
                    await syncCampaignStats(jobDocs[0].data().campaignId);
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

          // D. WhatsApp Calling Events (Isolated Testing POC)
          if (field === "calls" || Array.isArray(value.calls)) {
            const callList = Array.isArray(value.calls) ? value.calls : [];
            console.log("\n================ [WhatsApp Calling Webhook Event] ================");
            console.log("WEBHOOK OBJECT:", payload.object);
            console.log("ENTRY ID:", entry.id);
            console.log("PHONE NUMBER ID:", value.metadata?.phone_number_id);
            console.log("CALLS COUNT:", callList.length);

            for (const callEvent of callList) {
              console.log("----------------------------------------------------------------");
              console.log("CALL ID:", callEvent.id);
              console.log("EVENT:", callEvent.event);
              console.log("DIRECTION:", callEvent.direction || "N/A");
              console.log("TIMESTAMP:", callEvent.timestamp || "N/A");
              console.log("SESSION SDP TYPE:", callEvent.session?.sdp_type || "NONE");
              console.log("SESSION SDP PRESENT:", Boolean(callEvent.session?.sdp) ? "YES" : "NO");

              if (callEvent.event === "connect") {
                console.log(">>> CONNECT WEBHOOK RECEIVED <<<");
                console.log("CALL ID:", callEvent.id);
                console.log("DIRECTION:", callEvent.direction || "N/A");
                console.log("SDP TYPE:", callEvent.session?.sdp_type);
                console.log("SDP PRESENT:", Boolean(callEvent.session?.sdp) ? "YES" : "NO");
              }

              try {
                await handleIncomingCallWebhook(callEvent);
              } catch (callErr) {
                console.error("[WhatsApp Webhook] Calling event handling error:", callErr);
              }
            }
            console.log("================================================================\n");
          }

          // E. WhatsApp Call Permission Events (Isolated Testing POC)
          if (Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              if (
                msg.type === "interactive" &&
                msg.interactive?.type === "call_permission_reply" &&
                msg.interactive.call_permission_reply
              ) {
                const userResp = msg.interactive.call_permission_reply.response || "";
                console.log(`[WhatsApp Webhook] Received call_permission_reply from ${maskPhoneNumber(msg.from)}: ${userResp}`);
                try {
                  await handleCallPermissionWebhook(msg.from, userResp);
                } catch (permErr) {
                  console.error("[WhatsApp Webhook] Call permission handling error:", permErr);
                }
              }
            }
          } else if (field === "call_permission_reply" || (value as any).call_permission_reply) {
            const replyObj = (value as any).call_permission_reply;
            const fromPhone = (value as any).from || (value as any).user_wa_id || "";
            if (fromPhone && replyObj?.response) {
              console.log(`[WhatsApp Webhook] Received field call_permission_reply from ${maskPhoneNumber(fromPhone)}: ${replyObj.response}`);
              try {
                await handleCallPermissionWebhook(fromPhone, replyObj.response);
              } catch (permErr) {
                console.error("[WhatsApp Webhook] Call permission handling error:", permErr);
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

