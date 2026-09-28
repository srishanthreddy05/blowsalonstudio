import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import type { WhatsAppMessageStatus } from "@/types/whatsapp";
import { maskPhoneNumber } from "@/lib/whatsapp/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";

/**
 * Defensive utility to recursively strip any 'undefined' properties before passing to Firestore.
 */
function sanitizeFirestoreDoc<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = sanitizeFirestoreDoc(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

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

                // Update matching Firestore audit doc
                try {
                  const q = query(
                    collection(db, MESSAGES_COLLECTION),
                    where("messageId", "==", messageId)
                  );
                  const querySnap = await getDocs(q);

                  if (!querySnap.empty) {
                    const nowIso = new Date().toISOString();
                    const docSnap = querySnap.docs[0];
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
                } catch (updateErr) {
                  console.error(
                    `[WhatsApp Webhook] Failed to update Firestore message doc ${messageId}:`,
                    updateErr instanceof Error ? updateErr.message : updateErr
                  );
                }
              }
            }
          }

          // B. Handle Incoming Messages (logged safely)
          if (Array.isArray(value.messages)) {
            for (const msg of value.messages) {
              const sender = msg.from;
              console.log(
                `[WhatsApp Webhook] Received customer response from: ${maskPhoneNumber(sender)} (Type: ${msg.type || "text"})`
              );
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
    // Return 200 to prevent Meta from disabling the webhook endpoint during transient errors
    return NextResponse.json({ success: false, error: errorMsg }, { status: 200 });
  }
}
