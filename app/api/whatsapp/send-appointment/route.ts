import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
} from "firebase/firestore";
import type { Appointment } from "@/types/appointment";
import type { WhatsAppMessageRecord } from "@/types/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { sanitizeTemplateVariable } from "@/lib/whatsapp/templateRegistry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { appointmentId, type, overridePhone } = body;

    // ── 1. Master kill-switch ──────────────────────────────────────────────────
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) return enabledCheck.response;
    // ──────────────────────────────────────────────────────────────────────────

    if (!appointmentId || typeof appointmentId !== "string") {
      return NextResponse.json(
        {
          success: false,
          status: "NOT_SENT",
          error: "Missing appointmentId in request.",
        },
        { status: 400 }
      );
    }

    if (!type || (type !== "confirmation" && type !== "reminder")) {
      return NextResponse.json(
        {
          success: false,
          status: "NOT_SENT",
          error: "Invalid or missing appointment message type. Must be 'confirmation' or 'reminder'.",
        },
        { status: 400 }
      );
    }

    // 2. Fetch Appointment Record
    const apptDocRef = doc(db, "appointments", appointmentId);
    const apptSnap = await getDoc(apptDocRef);

    if (!apptSnap.exists()) {
      return NextResponse.json(
        {
          success: false,
          status: "NOT_SENT",
          error: `Appointment "${appointmentId}" not found.`,
        },
        { status: 404 }
      );
    }

    const apptData = {
      id: apptSnap.id,
      ...apptSnap.data(),
    } as Appointment;

    // Optional: If customer phone/name is missing on appointment, look up customer doc
    let customerName = (apptData.customerName || "").trim();
    let customerPhone = (apptData.customerPhone || "").trim();

    if ((!customerName || !customerPhone) && apptData.customerId) {
      try {
        const custSnap = await getDoc(doc(db, "customers", apptData.customerId));
        if (custSnap.exists()) {
          const custData = custSnap.data();
          if (!customerName) customerName = (custData.name || "").trim();
          if (!customerPhone) customerPhone = (custData.phone || custData.mobile || "").trim();
        }
      } catch (custErr) {
        console.warn("[WhatsApp Send-Appointment] Error looking up customer doc:", custErr);
      }
    }

    const targetRawPhone = (overridePhone || customerPhone || "").trim();
    const normalized = normalizePhoneNumber(targetRawPhone);
    const provider = getWhatsAppProvider();

    const templateName =
      type === "confirmation"
        ? "blow_salon_appointment_confirmation"
        : "blow_salon_appointment_reminder";
    const messageType =
      type === "confirmation"
        ? "APPOINTMENT_CONFIRMATION"
        : "APPOINTMENT_REMINDER";

    // 3. Validate Phone Number
    if (!normalized.isValid) {
      const nowIso = new Date().toISOString();
      const record: Omit<WhatsAppMessageRecord, "id"> = {
        messageType,
        category: "UTILITY",
        appointmentId,
        customerId: apptData.customerId || null,
        customerName: customerName || "Customer",
        phoneNumber: targetRawPhone,
        normalizedPhone: normalized.e164 || "",
        templateName,
        templateLanguage: "en",
        message: "Customer phone number is missing or invalid.",
        status: "NOT_SENT",
        provider: provider.providerType,
        errorMessage: targetRawPhone
          ? `Invalid phone number format: "${targetRawPhone}".`
          : "Customer does not have a phone number on file.",
        errorCode: "WHATSAPP_API_ERROR",
        messageId: null,
        sentAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      try {
        await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(record));
      } catch (logErr) {
        console.error("[WhatsApp Send-Appointment] Failed to log NOT_SENT audit:", logErr);
      }

      return NextResponse.json({
        success: false,
        status: "NOT_SENT",
        error: targetRawPhone
          ? `Invalid phone number format: "${targetRawPhone}". Please provide a valid 10-12 digit mobile number.`
          : "Customer does not have a phone number on file.",
        messageRecord: record,
      });
    }

    // 4. Dispatch via Provider
    // Parameter {{1}} is strictly the Customer's Name (sanitized, non-empty)
    const sanitizedName = sanitizeTemplateVariable(customerName || "Customer", "Customer");
    const bodyParameters = [{ type: "text", text: sanitizedName }];

    const templateResult = await provider.sendTemplateMessage(
      normalized.digits,
      templateName,
      "en",
      [
        {
          type: "body",
          parameters: bodyParameters,
        },
      ]
    );

    // 5. Record Message History in Firestore
    const nowIso = new Date().toISOString();
    const messageRecord: Omit<WhatsAppMessageRecord, "id"> = {
      messageType,
      category: "UTILITY",
      appointmentId,
      customerId: apptData.customerId || null,
      customerName: sanitizedName,
      phoneNumber: targetRawPhone,
      normalizedPhone: normalized.display || normalized.e164 || "",
      templateName,
      templateLanguage: "en",
      message: `[Meta Template: ${templateName}]`,
      status: templateResult.success ? "SENT" : "FAILED",
      provider: provider.providerType,
      errorMessage: templateResult.error || null,
      errorCode: templateResult.errorCode || null,
      messageId: templateResult.messageId || null,
      sentAt: templateResult.success ? nowIso : null,
      costPerMessage: 0.15,
      estimatedCharge: templateResult.success ? 0.15 : 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let savedDocId: string | null = null;
    try {
      const sanitized = sanitizeFirestoreDoc(messageRecord);
      const docRef = await addDoc(collection(db, MESSAGES_COLLECTION), sanitized);
      savedDocId = docRef.id;
    } catch (loggingErr) {
      console.error("[WhatsApp Send-Appointment] Failed to log message audit to Firestore:", loggingErr);
    }

    return NextResponse.json({
      success: templateResult.success,
      status: templateResult.success ? "SENT" : "FAILED",
      error: templateResult.error || null,
      errorCode: templateResult.errorCode || null,
      messageId: templateResult.messageId || null,
      messageRecord: {
        id: savedDocId || undefined,
        ...messageRecord,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Error dispatching WhatsApp appointment message";
    console.error("[WhatsApp Send-Appointment] Error:", errorMsg);
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
