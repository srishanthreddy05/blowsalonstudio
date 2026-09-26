import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { WhatsAppSettings } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SETTINGS_DOC = doc(db, "settings", "whatsapp");

export async function GET() {
  try {
    const snap = await getDoc(SETTINGS_DOC);
    if (snap.exists()) {
      return NextResponse.json(snap.data() as WhatsAppSettings);
    }
    const defaultSettings: WhatsAppSettings = {
      autoSendInvoice: true,
      provider: "QR_WHATSAPP",
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(defaultSettings);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load WhatsApp settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { autoSendInvoice, provider, customTemplateHeader, customTemplateFooter } = body;

    const updatedSettings: WhatsAppSettings = {
      autoSendInvoice: typeof autoSendInvoice === "boolean" ? autoSendInvoice : true,
      provider: provider || "QR_WHATSAPP",
      customTemplateHeader: customTemplateHeader || undefined,
      customTemplateFooter: customTemplateFooter || undefined,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(SETTINGS_DOC, updatedSettings, { merge: true });

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to save WhatsApp settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
