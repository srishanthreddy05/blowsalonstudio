import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  doc,
  increment,
} from "firebase/firestore";
import type { WhatsAppMessageStatus } from "@/types/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { toTitleCase } from "@/lib/utils/text";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";
const CONVERSATIONS_COLLECTION = "whatsapp_conversations";
const CUSTOMERS_COLLECTION = "customers";

/**
 * POST /api/whatsapp/test-inbound
 * Helper endpoint to simulate an incoming WhatsApp message during local development / testing.
 * Writes to the shared Firestore database in the exact same format as Meta webhook.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { from = "919876543210", name = "Test Customer", message = "Hello, I want to book an appointment!" } = body;

    const normalized = normalizePhoneNumber(from);
    const digits = normalized.digits || from;
    const displayPhone = normalized.display || from;
    const nowIso = new Date().toISOString();
    const simulatedMetaId = `sim_wamid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 1. Match or auto-link customer
    let customerId: string | null = null;
    let customerName: string = name ? toTitleCase(name) : "WhatsApp Contact";

    try {
      const qCust1 = query(collection(db, CUSTOMERS_COLLECTION), where("phone", "==", digits));
      let custSnap = await getDocs(qCust1);

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
        const newCustDocRef = doc(collection(db, CUSTOMERS_COLLECTION));
        customerId = newCustDocRef.id;
        await setDoc(newCustDocRef, {
          name: customerName,
          phone: digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits,
          customerType: "regular" as const,
          createdAt: nowIso,
          whatsappOptIn: true,
          whatsappOptInAt: nowIso,
        });

        try {
          await setDoc(
            doc(db, "stats", "customers"),
            { regularCount: increment(1) },
            { merge: true }
          );
        } catch {}
      }
    } catch (custErr) {
      console.error("[Test Inbound] Error matching/creating customer:", custErr);
    }

    const conversationId = digits;

    // 2. Update/Create Conversation
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
        lastMessage: message,
        lastMessageAt: nowIso,
        lastMessageDirection: "INBOUND",
        lastMessageStatus: "DELIVERED",
        lastInboundAt: nowIso, // Opens 24-hr window
        unreadCount: increment(1),
        updatedAt: nowIso,
        ...(isNew ? { createdAt: nowIso, isArchived: false } : {}),
      }),
      { merge: true }
    );

    // 3. Save Message Record
    const messageRecord = {
      conversationId,
      direction: "INBOUND" as const,
      messageType: "INBOX_TEXT" as const,
      customerId: customerId || null,
      customerName,
      phoneNumber: digits,
      recipientPhone: displayPhone,
      normalizedPhone: digits,
      message,
      status: "DELIVERED" as WhatsAppMessageStatus,
      provider: "WHATSAPP_CLOUD_API" as const,
      messageId: simulatedMetaId,
      metaMessageId: simulatedMetaId,
      deliveredAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const docRef = await addDoc(collection(db, MESSAGES_COLLECTION), sanitizeFirestoreDoc(messageRecord));

    return NextResponse.json({
      success: true,
      simulated: true,
      messageId: simulatedMetaId,
      docId: docRef.id,
      conversationId,
      customerName,
      phoneNumber: displayPhone,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error simulating inbound message";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
