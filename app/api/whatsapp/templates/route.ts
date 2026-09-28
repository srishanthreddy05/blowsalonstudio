import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const provider = getWhatsAppProvider();
    if (typeof provider.getTemplates !== "function") {
      return NextResponse.json({ templates: [] });
    }

    const templates = await provider.getTemplates();
    return NextResponse.json({ templates });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to fetch WhatsApp templates";
    console.error("[WhatsApp Templates API] Error:", errorMsg);
    return NextResponse.json({ templates: [], error: errorMsg }, { status: 200 });
  }
}
