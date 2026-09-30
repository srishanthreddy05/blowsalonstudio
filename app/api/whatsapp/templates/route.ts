import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import {
  isTemplateExposedInUI,
  META_WHATSAPP_TEMPLATES,
} from "@/lib/whatsapp/templateRegistry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const purpose = searchParams.get("purpose")?.toLowerCase();

    const provider = getWhatsAppProvider();
    let templates: any[] = [];

    if (typeof provider.getTemplates === "function") {
      templates = await provider.getTemplates();
    }

    // Fallback if provider returns empty (e.g. offline/testing environment)
    if (!templates || templates.length === 0) {
      templates = Object.values(META_WHATSAPP_TEMPLATES)
        .filter((t) => t.exposedInUI)
        .map((t) => ({
          id: t.name,
          name: t.name,
          language: t.language,
          status: "APPROVED" as const,
          category: t.category,
          components: [],
          bodyText:
            t.name === "blow_salon_campaign"
              ? "Hello {{1}} 👋\n\nWe have an update from BLOW SALON.\n\n{{2}}\n\nWe look forward to seeing you soon! ✨"
              : t.name === "blow_salon_invoice"
              ? "Hello {{1}} 👋\nThank you for visiting BLOW SALON.\n\nInvoice: {{2}}\nDate: {{3}}\n\nServices & Products:\n{{4}}\n\nSubtotal: {{5}}\nTax: {{6}}\nTotal: {{7}}\n\nPayment Details:\n{{8}}"
              : "Integration test template with zero parameters.",
          headerText: "",
          footerText: "",
          variableCount: t.expectedParamCount,
          variableKeys: Array.from({ length: t.expectedParamCount }, (_, i) => String(i + 1)),
        }));
    }

    // Always filter out hello_world and any unexposed templates
    templates = templates.filter((t: any) => isTemplateExposedInUI(t.name));

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
