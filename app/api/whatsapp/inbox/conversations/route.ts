import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit as firestoreLimit } from "firebase/firestore";
import type { WhatsAppConversation } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONVERSATIONS_COLLECTION = "whatsapp_conversations";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const maxLimit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 200);

    try {
      const q = query(
        collection(db, CONVERSATIONS_COLLECTION),
        orderBy("lastMessageAt", "desc"),
        firestoreLimit(maxLimit)
      );
      const snap = await getDocs(q);
      const conversations: WhatsAppConversation[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as WhatsAppConversation));

      return NextResponse.json({ conversations });
    } catch {
      // Fallback in case index is building
      const snap = await getDocs(collection(db, CONVERSATIONS_COLLECTION));
      const conversations: WhatsAppConversation[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WhatsAppConversation))
        .sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""))
        .slice(0, maxLimit);

      return NextResponse.json({ conversations });
    }
  } catch (err: unknown) {
    console.error("[WhatsApp Inbox Conversations] Error fetching conversations:", err);
    return NextResponse.json({ conversations: [] });
  }
}
