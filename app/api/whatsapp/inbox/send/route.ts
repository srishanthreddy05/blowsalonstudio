import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import type { WhatsAppMessageRecord, WhatsAppMessageStatus } from "@/types/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { assertWhatsAppEnabled } from "@/lib/whatsapp/enabledGuard";
import { getTemplateLanguage, sanitizeTemplateVariable } from "@/lib/whatsapp/templateRegistry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";
const CONVERSATIONS_COLLECTION = "whatsapp_conversations";
const CUSTOMERS_COLLECTION = "customers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      conversationId,
      phoneNumber,
      message,
      type = "text",
      templateName,
      templateLanguage,
      templateVariables = {},
    } = body;

    // 1. Master Kill-Switch Guard
    const enabledCheck = await assertWhatsAppEnabled();
    if (!enabledCheck.enabled) return enabledCheck.response;

    // 2. Validate Target Phone Number
    const rawTarget = (conversationId || phoneNumber || "").toString().trim();
    const normalized = normalizePhoneNumber(rawTarget);

    if (!normalized.isValid) {
      return NextResponse.json(
        {
          success: false,
          status: "NOT_SENT",
          error: `Invalid phone number: "${rawTarget}"`,
        },
        { status: 400 }
      );
    }

    const targetDigits = normalized.digits;
    const targetDisplay = normalized.display;
    const convRef = doc(db, CONVERSATIONS_COLLECTION, targetDigits);
    const convSnap = await getDoc(convRef);
    const convData = convSnap.exists() ? convSnap.data() : null;

    // 3. Customer Linking
    let customerId = convData?.customerId || null;
    let customerName = convData?.customerName || "WhatsApp Customer";

    if (!customerId) {
      try {
        const custSnap = await getDoc(doc(db, CUSTOMERS_COLLECTION, targetDigits));
        if (custSnap.exists()) {
          customerId = custSnap.id;
          customerName = custSnap.data().name || customerName;
        }
      } catch {}
    }

    // 4. 24-Hour Customer Service Window Validation for Free-Form Text
    const nowIso = new Date().toISOString();
    const isTemplate = type === "template" || Boolean(templateName);

    if (!isTemplate) {
      const textBody = (message || "").trim();
      if (!textBody) {
        return NextResponse.json(
          {
            success: false,
            error: "Message text cannot be empty.",
          },
          { status: 400 }
        );
      }

      const lastInboundAt = convData?.lastInboundAt;
      let windowOpen = false;

      if (lastInboundAt) {
        const diffMs = Date.now() - new Date(lastInboundAt).getTime();
        windowOpen = diffMs < 24 * 60 * 60 * 1000;
      }

      if (!windowOpen) {
        return NextResponse.json(
          {
            success: false,
            status: "FAILED",
            errorCode: "WHATSAPP_TEMPLATE_ERROR",
            error:
              "The 24-hour customer service window has closed. You must send an approved template message to initiate contact.",
            windowClosed: true,
          },
          { status: 400 }
        );
      }
    }

    const provider = getWhatsAppProvider();

    // 5. Send via Meta WhatsApp Cloud API Provider
    let sendResult: {
      success: boolean;
      messageId?: string | null;
      error?: string | null;
      errorCode?: any;
    };
    let messageTextContent = "";
    let finalTemplateName: string | null = null;
    let finalTemplateLang: string | null = null;

    if (isTemplate) {
      if (!templateName) {
        return NextResponse.json(
          { success: false, error: "Template name is required." },
          { status: 400 }
        );
      }

      finalTemplateName = templateName;
      finalTemplateLang = getTemplateLanguage(templateName, templateLanguage);

      // Build components array for Meta Cloud API
      const varKeys = Object.keys(templateVariables).sort((a, b) => Number(a) - Number(b));
      const bodyParameters = varKeys.map((k) => ({
        type: "text",
        text: sanitizeTemplateVariable(templateVariables[k], "-"),
      }));

      const components =
        bodyParameters.length > 0
          ? [
              {
                type: "body",
                parameters: bodyParameters,
              },
            ]
          : undefined;

      messageTextContent = `[Template: ${templateName}]`;
      sendResult = await provider.sendTemplateMessage(
        targetDigits,
        templateName,
        finalTemplateLang,
        components
      );
    } else {
      messageTextContent = (message || "").trim();
      sendResult = await provider.sendMessage(targetDigits, messageTextContent);
    }

    const messageStatus: WhatsAppMessageStatus = sendResult.success ? "SENT" : "FAILED";

    // 6. Record Message in Firestore (whatsapp_messages)
    const messageRecord: Omit<WhatsAppMessageRecord, "id"> = {
      conversationId: targetDigits,
      direction: "OUTBOUND",
      messageType: isTemplate ? "INBOX_TEMPLATE" : "INBOX_TEXT",
      customerId: customerId || null,
      customerName,
      phoneNumber: targetDigits,
      recipientPhone: targetDisplay,
      normalizedPhone: targetDigits,
      templateName: finalTemplateName,
      templateLanguage: finalTemplateLang,
      message: messageTextContent,
      status: messageStatus,
      provider: provider.providerType,
      errorMessage: sendResult.error || null,
      errorCode: sendResult.errorCode || null,
      messageId: sendResult.messageId || null,
      metaMessageId: sendResult.messageId || null,
      sentAt: sendResult.success ? nowIso : null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let savedDocRefId: string | null = null;
    try {
      const docRef = await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(messageRecord));
      savedDocRefId = docRef.id;
    } catch (saveErr) {
      console.error("[WhatsApp Inbox Send] Error saving message doc:", saveErr);
    }

    // 7. Update or Create Conversation Record (whatsapp_conversations)
    try {
      await setDoc(
        convRef,
        sanitizeFirestoreDoc({
          id: targetDigits,
          phoneNumber: targetDisplay,
          normalizedPhone: targetDigits,
          customerId: customerId || null,
          customerName,
          lastMessage: messageTextContent,
          lastMessageAt: nowIso,
          lastMessageDirection: "OUTBOUND",
          lastMessageStatus: messageStatus,
          updatedAt: nowIso,
          ...(convSnap.exists()
            ? {}
            : {
                createdAt: nowIso,
                unreadCount: 0,
                isArchived: false,
              }),
        }),
        { merge: true }
      );
    } catch (convErr) {
      console.error("[WhatsApp Inbox Send] Error updating conversation doc:", convErr);
    }

    if (!sendResult.success) {
      return NextResponse.json(
        {
          success: false,
          status: "FAILED",
          error: sendResult.error || "Failed to send message.",
          errorCode: sendResult.errorCode || "WHATSAPP_API_ERROR",
          messageRecord: {
            id: savedDocRefId || undefined,
            ...messageRecord,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "SENT",
      messageRecord: {
        id: savedDocRefId || undefined,
        ...messageRecord,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error sending inbox message";
    console.error("[WhatsApp Inbox Send] Unhandled error:", errorMsg);
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
