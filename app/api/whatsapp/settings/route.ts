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
      const data = snap.data() as Partial<WhatsAppSettings>;
      // Ensure whatsappEnabled defaults to true if field not present yet
      return NextResponse.json({
        whatsappEnabled: typeof data.whatsappEnabled === "boolean" ? data.whatsappEnabled : true,
        autoSendInvoice: typeof data.autoSendInvoice === "boolean" ? data.autoSendInvoice : true,
        provider: data.provider || "WHATSAPP_CLOUD_API",
        customTemplateHeader: data.customTemplateHeader,
        customTemplateFooter: data.customTemplateFooter,
        templateName: data.templateName,
        templateLanguage: data.templateLanguage,
        updatedAt: data.updatedAt,
      } as WhatsAppSettings);
    }
    const defaultSettings: WhatsAppSettings = {
      whatsappEnabled: true,
      autoSendInvoice: true,
      provider: "WHATSAPP_CLOUD_API",
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
    const {
      whatsappEnabled,
      autoSendInvoice,
      provider,
      customTemplateHeader,
      customTemplateFooter,
    } = body;

    const patch: Partial<WhatsAppSettings> = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof whatsappEnabled === "boolean") patch.whatsappEnabled = whatsappEnabled;
    if (typeof autoSendInvoice === "boolean") patch.autoSendInvoice = autoSendInvoice;
    if (provider) patch.provider = provider;
    if (customTemplateHeader !== undefined) patch.customTemplateHeader = customTemplateHeader || undefined;
    if (customTemplateFooter !== undefined) patch.customTemplateFooter = customTemplateFooter || undefined;

    await setDoc(SETTINGS_DOC, patch, { merge: true });

    // Return the full merged settings doc so the UI can update its state
    const snap = await getDoc(SETTINGS_DOC);
    const merged = snap.exists() ? (snap.data() as Partial<WhatsAppSettings>) : patch;

    return NextResponse.json({
      success: true,
      settings: {
        whatsappEnabled: typeof merged.whatsappEnabled === "boolean" ? merged.whatsappEnabled : true,
        autoSendInvoice: typeof merged.autoSendInvoice === "boolean" ? merged.autoSendInvoice : true,
        provider: merged.provider || "WHATSAPP_CLOUD_API",
        customTemplateHeader: merged.customTemplateHeader,
        customTemplateFooter: merged.customTemplateFooter,
        updatedAt: merged.updatedAt,
      } as WhatsAppSettings,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to save WhatsApp settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
