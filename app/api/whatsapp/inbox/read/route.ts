import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONVERSATIONS_COLLECTION = "whatsapp_conversations";

export async function POST(request: Request) {
  try {
    const { conversationId } = await request.json();

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "Missing conversationId" },
        { status: 400 }
      );
    }

    const convRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
    const convSnap = await getDoc(convRef);

    if (convSnap.exists()) {
      await updateDoc(convRef, {
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Error marking conversation as read";
    console.error("[WhatsApp Inbox Read] Error:", errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
