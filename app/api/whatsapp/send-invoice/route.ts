import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import type { Invoice } from "@/types/invoice";
import type { WhatsAppMessageRecord, WhatsAppSettings } from "@/types/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { invoiceId, forceResend, overridePhone } = body;

    // ── Master kill-switch ──────────────────────────────────────────────────
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) return enabledCheck.response;
    // ───────────────────────────────────────────────────────────────────────

    if (!invoiceId) {
      return NextResponse.json(
        {
          success: false,
          status: "NOT_SENT",
          error: "Missing invoiceId in request.",
        },
        { status: 400 }
      );
    }

    // 1. Fetch Invoice
    const invoiceDocRef = doc(db, "invoices", invoiceId);
    const invoiceSnap = await getDoc(invoiceDocRef);

    if (!invoiceSnap.exists()) {
      return NextResponse.json(
        {
          success: false,
          status: "NOT_SENT",
          error: `Invoice "${invoiceId}" not found.`,
        },
        { status: 404 }
      );
    }

    const invoiceData = {
      id: invoiceSnap.id,
      ...invoiceSnap.data(),
    } as Invoice;

    // 2. Check Settings if not manual force resend
    if (!forceResend) {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "whatsapp"));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data() as WhatsAppSettings;
          if (settings.autoSendInvoice === false) {
            return NextResponse.json({
              success: true,
              status: "NOT_SENT",
              message: "Auto-send is disabled in WhatsApp settings.",
            });
          }
        }
      } catch (settingsErr) {
        console.warn("Could not read WhatsApp settings:", settingsErr);
      }
    }

    // 3. Duplicate Prevention (Idempotency)
    if (!forceResend) {
      try {
        const q = query(
          collection(db, MESSAGES_COLLECTION),
          where("invoiceId", "==", invoiceId)
        );
        const existingSnap = await getDocs(q);
        const alreadySent = existingSnap.docs.find((d) => {
          const s = d.data().status;
          return s === "SENT" || s === "DELIVERED" || s === "READ" || s === "SENDING" || s === "PENDING";
        });
        if (alreadySent) {
          const existing = alreadySent.data() as WhatsAppMessageRecord;
          return NextResponse.json({
            success: true,
            status: existing.status,
            message: "WhatsApp receipt was already sent.",
            messageRecord: {
              id: alreadySent.id,
              ...existing,
            },
          });
        }
      } catch (dupErr) {
        console.warn("Idempotency check error:", dupErr);
      }
    }

    // 4. Resolve Target Phone
    const targetRawPhone = (overridePhone || invoiceData.customerPhone || "").trim();
    const normalized = normalizePhoneNumber(targetRawPhone);
    const provider = getWhatsAppProvider();

    if (!normalized.isValid) {
      const nowIso = new Date().toISOString();
      const record: Omit<WhatsAppMessageRecord, "id"> = {
        invoiceId,
        invoiceNumber: invoiceData.invoiceNumber || "INV",
        customerId: invoiceData.customerId || null,
        customerName: invoiceData.customerName || "Customer",
        phoneNumber: targetRawPhone,
        normalizedPhone: normalized.e164 || "",
        message: "Customer phone number is missing or invalid.",
        status: "NOT_SENT",
        provider: provider.providerType,
        errorMessage: "Customer phone number is missing or invalid.",
        errorCode: "WHATSAPP_API_ERROR",
        messageId: null,
        sentAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      try {
        await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(record));
      } catch (logErr) {
        console.error("[WhatsApp API] Failed to log NOT_SENT audit to Firestore:", logErr);
      }

      return NextResponse.json({
        success: false,
        status: "NOT_SENT",
        error: "Customer does not have a valid WhatsApp phone number.",
        messageRecord: record,
      });
    }

    // 5. Send via Provider
    const sendResult = await provider.sendInvoiceReceipt(invoiceData, targetRawPhone);

    // 6. Record Audit in Firestore (Guaranteed no undefined values)
    const nowIso = new Date().toISOString();
    const messageRecord: Omit<WhatsAppMessageRecord, "id"> = {
      invoiceId,
      invoiceNumber: invoiceData.invoiceNumber || "INV",
      customerId: invoiceData.customerId || null,
      customerName: invoiceData.customerName || "Customer",
      phoneNumber: targetRawPhone,
      normalizedPhone: normalized.display || normalized.e164 || "",
      message: sendResult.formattedMessage || "",
      status: sendResult.status,
      provider: provider.providerType,
      errorMessage: sendResult.error || null,
      errorCode: sendResult.errorCode || null,
      messageId: sendResult.messageId || null,
      sentAt: sendResult.status === "SENT" ? nowIso : null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let savedDocId: string | null = null;
    try {
      const sanitized = sanitizeFirestoreDoc(messageRecord);
      const docRef = await addDoc(collection(db, MESSAGES_COLLECTION), sanitized);
      savedDocId = docRef.id;
    } catch (loggingErr) {
      console.error("[WhatsApp API] Failed to log message audit to Firestore:", loggingErr);
    }

    return NextResponse.json({
      success: sendResult.success,
      status: sendResult.status,
      error: sendResult.error || null,
      errorCode: sendResult.errorCode || null,
      messageRecord: {
        id: savedDocId || undefined,
        ...messageRecord,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Error dispatching WhatsApp invoice";
    console.error("[WhatsApp Send-Invoice] Safe Error:", errorMsg);
    return NextResponse.json(
      {
        success: false,
        status: "FAILED",
        error: errorMsg,
        errorCode: "WHATSAPP_API_ERROR",
      },
      { status: 200 }
    );
  }
}
