import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import type { WhatsAppMessageRecord } from "@/types/whatsapp";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      testPhone,
      templateName,
      templateLanguage = "en_US",
      templateVariables = {},
      sampleCustomerName = "Valued Customer",
    } = body;

    if (!testPhone || !templateName) {
      return NextResponse.json(
        { error: "Test phone number and template name are required." },
        { status: 400 }
      );
    }

    const normalized = normalizePhoneNumber(testPhone);
    if (!normalized.isValid) {
      return NextResponse.json(
        { error: `Invalid test phone number: "${testPhone}". Please enter a valid 10-12 digit mobile number.` },
        { status: 400 }
      );
    }

    const provider = getWhatsAppProvider();
    const providerStatus = await provider.getStatus();

    if (providerStatus.status !== "CONNECTED") {
      return NextResponse.json(
        {
          success: false,
          error: providerStatus.errorMessage || "WhatsApp provider is not configured or connected.",
          errorCode: providerStatus.errorCode || "WHATSAPP_NOT_CONFIGURED",
        },
        { status: 200 }
      );
    }

    // Build body parameters for variables only if dynamic variables exist
    const bodyParameters: Array<{ type: string; text: string }> = [];
    const varKeys = Object.keys(templateVariables || {}).sort((a, b) => Number(a) - Number(b));

    for (const k of varKeys) {
      const varTypeOrVal = (templateVariables[k] ?? "").toString().trim();
      let resolvedText = varTypeOrVal;

      if (varTypeOrVal === "customer_name" || varTypeOrVal === "{{customer_name}}") {
        resolvedText = (sampleCustomerName || "Customer").trim();
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

    const components = bodyParameters.length > 0
      ? [{ type: "body", parameters: bodyParameters }]
      : undefined;

    // Send Test Message
    const sendResult = await provider.sendTemplateMessage(
      normalized.digits,
      templateName,
      templateLanguage,
      components
    );

    const nowIso = new Date().toISOString();

    // Log to message history
    try {
      const record: Omit<WhatsAppMessageRecord, "id"> = {
        messageType: "TEST_MESSAGE",
        customerName: `${sampleCustomerName} (Test)`,
        phoneNumber: testPhone,
        normalizedPhone: normalized.display,
        templateName,
        message: `[Test Message for Template: ${templateName}]`,
        status: sendResult.success ? "SENT" : "FAILED",
        provider: provider.providerType,
        messageId: sendResult.messageId || null,
        errorMessage: sendResult.error || null,
        errorCode: sendResult.errorCode || null,
        sentAt: sendResult.success ? nowIso : null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(record));
    } catch (auditErr) {
      console.warn("[Test Send API] Failed to log audit record:", auditErr);
    }

    return NextResponse.json({
      success: sendResult.success,
      messageId: sendResult.messageId || null,
      error: sendResult.error || null,
      errorCode: sendResult.errorCode || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to send test template message";
    console.error("[Test Send API] Error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
