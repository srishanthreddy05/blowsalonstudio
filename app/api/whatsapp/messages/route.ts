import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from "firebase/firestore";
import type { WhatsAppMessageRecord } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MESSAGES_COLLECTION = "whatsapp_messages";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("invoiceId");

    if (invoiceId) {
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
    }

    // Default: fetch recent 25 messages
    const q = query(
      collection(db, MESSAGES_COLLECTION),
      orderBy("createdAt", "desc"),
      limit(25)
    );
    const snap = await getDocs(q);
    const messages: WhatsAppMessageRecord[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppMessageRecord));

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    console.error("Error fetching WhatsApp messages:", error);
    try {
      // Fallback without ordering if index not built yet
      const snap = await getDocs(collection(db, MESSAGES_COLLECTION));
      const messages: WhatsAppMessageRecord[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WhatsAppMessageRecord))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .slice(0, 25);
      return NextResponse.json({ messages });
    } catch {
      return NextResponse.json({ messages: [] });
    }
  }
}
