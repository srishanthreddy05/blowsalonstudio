import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit as firestoreLimit,
} from "firebase/firestore";
import type { WhatsAppMessageRecord } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("invoiceId");
    const campaignId = searchParams.get("campaignId");
    const messageType = searchParams.get("messageType");
    const status = searchParams.get("status");
    const maxLimit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    // 1. Single Invoice Query
    if (invoiceId) {
      try {
        const q = query(
          collection(db, MESSAGES_COLLECTION),
          where("invoiceId", "==", invoiceId),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const messages: WhatsAppMessageRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as WhatsAppMessageRecord));
        return NextResponse.json({ messages });
      } catch {
        const snap = await getDocs(collection(db, MESSAGES_COLLECTION));
        const messages: WhatsAppMessageRecord[] = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as WhatsAppMessageRecord))
          .filter((m) => m.invoiceId === invoiceId)
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        return NextResponse.json({ messages });
      }
    }

    // 2. Single Campaign Query
    if (campaignId) {
      try {
        const q = query(
          collection(db, MESSAGES_COLLECTION),
          where("campaignId", "==", campaignId),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        const messages: WhatsAppMessageRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as WhatsAppMessageRecord));
        return NextResponse.json({ messages });
      } catch {
        const snap = await getDocs(collection(db, MESSAGES_COLLECTION));
        const messages: WhatsAppMessageRecord[] = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as WhatsAppMessageRecord))
          .filter((m) => m.campaignId === campaignId)
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        return NextResponse.json({ messages });
      }
    }

    // 3. Fetch recent messages with safe fallback
    try {
      const q = query(
        collection(db, MESSAGES_COLLECTION),
        orderBy("createdAt", "desc"),
        firestoreLimit(maxLimit)
      );
      const snap = await getDocs(q);
      let messages: WhatsAppMessageRecord[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as WhatsAppMessageRecord));

      if (messageType && messageType !== "ALL") {
        messages = messages.filter((m) => {
          if (messageType === "INVOICE_RECEIPT") return !m.messageType || m.messageType === "INVOICE_RECEIPT";
          return m.messageType === messageType;
        });
      }

      if (status && status !== "ALL") {
        messages = messages.filter((m) => m.status === status);
      }

      return NextResponse.json({ messages });
    } catch {
      const snap = await getDocs(collection(db, MESSAGES_COLLECTION));
      let messages: WhatsAppMessageRecord[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WhatsAppMessageRecord))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      if (messageType && messageType !== "ALL") {
        messages = messages.filter((m) => {
          if (messageType === "INVOICE_RECEIPT") return !m.messageType || m.messageType === "INVOICE_RECEIPT";
          return m.messageType === messageType;
        });
      }

      if (status && status !== "ALL") {
        messages = messages.filter((m) => m.status === status);
      }

      return NextResponse.json({ messages: messages.slice(0, maxLimit) });
    }
  } catch (error: unknown) {
    console.error("[WhatsApp Messages API] Error fetching messages:", error);
    return NextResponse.json({ messages: [] });
  }
}
