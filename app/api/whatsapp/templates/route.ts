import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const purpose = searchParams.get("purpose")?.toLowerCase();

    const provider = getWhatsAppProvider();
    if (typeof provider.getTemplates !== "function") {
      return NextResponse.json({ templates: [] });
    }

    let templates = await provider.getTemplates();

    if (purpose === "campaign") {
      templates = templates.filter((t: any) => t.name === "blow_salon_campaign");
    } else if (purpose === "invoice") {
      templates = templates.filter((t: any) => t.name === "blow_salon_invoice");
    } else if (purpose === "test") {
      templates = templates.filter((t: any) => t.name === "3p_direct_integration_test_template");
    }

    return NextResponse.json({ templates });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to fetch WhatsApp templates";
    console.error("[WhatsApp Templates API] Error:", errorMsg);
    return NextResponse.json({ templates: [], error: errorMsg }, { status: 200 });
  }
}

