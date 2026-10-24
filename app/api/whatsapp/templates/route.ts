import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import type {
  WhatsAppTemplate,
  WhatsAppTemplateComponent,
  WhatsAppTemplateStatus,
  CreateWhatsAppTemplateRequest,
} from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_VERSION = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^v?/, "v");

/**
 * Helper to resolve WABA ID from Firestore Coexistence record (single source of truth).
 */
async function getCoexistenceWaba(): Promise<{ wabaId?: string; error?: string }> {
  try {
    const snap = await getDoc(doc(db, "settings", "whatsapp_coexistence"));
    if (!snap.exists()) {
      return { error: "WhatsApp Business App is not connected. Connect in Settings." };
    }
    const data = snap.data();
    if (data?.status !== "CONNECTED") {
      return { error: "WhatsApp Business App is currently disconnected. Reconnect in Settings." };
    }
    if (!data?.wabaId) {
      return { error: "WhatsApp Business Account (WABA) ID is missing from Coexistence connection." };
    }
    return { wabaId: String(data.wabaId).trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load WhatsApp configuration" };
  }
}

/**
 * GET /api/whatsapp/templates
 * Fetches live message templates directly from Meta Business Management API.
 * Supports pagination, category/status filtering, and purpose-based filtering.
 * Never returns mock templates labeled "APPROVED" when Meta is unavailable.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const purpose = searchParams.get("purpose")?.toLowerCase();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 100);
    const after = searchParams.get("after") || undefined;
    const before = searchParams.get("before") || undefined;
    const statusFilter = searchParams.get("status")?.toUpperCase();
    const categoryFilter = searchParams.get("category")?.toUpperCase();

    const { wabaId, error: configError } = await getCoexistenceWaba();
    if (configError || !wabaId) {
      return NextResponse.json({
        templates: [],
        error: configError || "No active WhatsApp Business Account connected.",
        isStale: false,
        lastSync: new Date().toISOString(),
      });
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    if (!token) {
      return NextResponse.json({
        templates: [],
        error: "WHATSAPP_ACCESS_TOKEN is missing on server.",
        isStale: false,
        lastSync: new Date().toISOString(),
      });
    }

    // Build Graph API templates URL
    const url = new URL(`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`);
    url.searchParams.set("fields", "id,name,status,category,language,components,quality_score,rejected_reason");
    url.searchParams.set("limit", String(limit));
    if (after) url.searchParams.set("after", after);
    if (before) url.searchParams.set("before", before);

    const metaRes = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 0 },
    });

    const metaData = await metaRes.json().catch(() => ({}));

    if (!metaRes.ok) {
      const errInfo = metaData.error || {};
      console.warn("[WhatsApp Templates API] Meta Graph API error:", errInfo.message || metaRes.statusText);

      let actionableMessage = errInfo.message || `Meta API error (${metaRes.status})`;
      if (errInfo.code === 100 && errInfo.error_subcode === 33) {
        actionableMessage = `WABA ID ${wabaId} is not accessible with the current access token. Please ensure your System User has 'whatsapp_business_management' permissions assigned to this WABA in Meta Business Manager.`;
      }

      return NextResponse.json({
        templates: [],
        error: actionableMessage,
        metaError: {
          code: errInfo.code,
          subcode: errInfo.error_subcode,
          message: errInfo.message,
        },
        isStale: false,
        lastSync: new Date().toISOString(),
      });
    }

    // Map raw Meta templates into standardized UI objects
    let rawList: any[] = Array.isArray(metaData.data) ? metaData.data : [];

    // Filter out hello_world from the operational list
    rawList = rawList.filter((t: any) => t.name !== "hello_world");

    let templates: WhatsAppTemplate[] = rawList.map((t: any) => {
      let bodyText = "";
      let headerText = "";
      let footerText = "";
      const variableIndices = new Set<number>();
      const variableSampleMap: Record<string, string> = {};

      if (Array.isArray(t.components)) {
        for (const comp of t.components) {
          if (comp.type === "BODY") {
            bodyText = comp.text || "";
            const matches = bodyText.match(/\{\{(\d+)\}\}/g);
            if (matches) {
              for (const m of matches) {
                const num = parseInt(m.replace(/\D/g, ""), 10);
                if (!isNaN(num)) variableIndices.add(num);
              }
            }
            // Extract body example samples if present
            if (comp.example?.body_text?.[0]) {
              const samples = comp.example.body_text[0];
              samples.forEach((sampleVal: string, idx: number) => {
                variableSampleMap[String(idx + 1)] = String(sampleVal);
              });
            }
          } else if (comp.type === "HEADER") {
            headerText = comp.text || "";
          } else if (comp.type === "FOOTER") {
            footerText = comp.text || "";
          }
        }
      }

      const variableKeys = Array.from(variableIndices).sort((a, b) => a - b).map(String);
      const variableCount = variableIndices.size;

      return {
        id: t.id || t.name,
        name: t.name,
        language: t.language || "en",
        status: (t.status || "PENDING").toUpperCase() as WhatsAppTemplateStatus,
        category: (t.category || "UTILITY").toUpperCase() as "MARKETING" | "UTILITY" | "AUTHENTICATION",
        components: (t.components || []) as WhatsAppTemplateComponent[],
        bodyText,
        headerText,
        footerText,
        variableCount,
        variableKeys,
        variableSampleMap: Object.keys(variableSampleMap).length > 0 ? variableSampleMap : undefined,
        qualityScore: t.quality_score,
        rejectedReason: t.rejected_reason,
      };
    });

    // Optional status filter
    if (statusFilter && statusFilter !== "ALL") {
      templates = templates.filter((t) => t.status === statusFilter);
    }

    // Optional category filter
    if (categoryFilter && categoryFilter !== "ALL") {
      templates = templates.filter((t) => t.category === categoryFilter);
    }

    // PURPOSE-BASED FILTERING FOR INVOICES & CAMPAIGNS
    // Workflows can ONLY select approved templates in the correct category
    if (purpose === "invoice") {
      templates = templates.filter(
        (t) => t.status === "APPROVED" && (t.name === "blow_salon_invoice" || t.category === "UTILITY")
      );
    } else if (purpose === "campaign") {
      templates = templates.filter(
        (t) => t.status === "APPROVED" && (t.name === "blow_salon_campaign" || t.category === "MARKETING")
      );
    }

    return NextResponse.json({
      templates,
      paging: metaData.paging || null,
      lastSync: new Date().toISOString(),
      isStale: false,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to fetch WhatsApp templates";
    console.error("[WhatsApp Templates API] Fatal error:", errorMsg);
    return NextResponse.json(
      {
        templates: [],
        error: errorMsg,
        isStale: false,
        lastSync: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/whatsapp/templates
 * Submits a new message template to Meta for review and approval.
 */
export async function POST(request: Request) {
  try {
    const body: CreateWhatsAppTemplateRequest = await request.json().catch(() => ({}));
    const { name, category, language, components } = body;

    // 1. Client input validation
    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "Template name is required." }, { status: 400 });
    }

    const cleanName = name.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(cleanName)) {
      return NextResponse.json(
        {
          success: false,
          error: "Template name must contain only lowercase alphanumeric characters and underscores (e.g. blow_salon_reminder).",
        },
        { status: 400 }
      );
    }

    if (!category || !["UTILITY", "MARKETING", "AUTHENTICATION"].includes(category.toUpperCase())) {
      return NextResponse.json(
        { success: false, error: "Invalid category. Must be UTILITY, MARKETING, or AUTHENTICATION." },
        { status: 400 }
      );
    }

    const cleanLang = (language || "en").trim();
    if (!cleanLang) {
      return NextResponse.json({ success: false, error: "Template language is required." }, { status: 400 });
    }

    if (!Array.isArray(components) || components.length === 0) {
      return NextResponse.json({ success: false, error: "At least one component (BODY) is required." }, { status: 400 });
    }

    const bodyComp = components.find((c) => c.type === "BODY");
    if (!bodyComp || !bodyComp.text || !bodyComp.text.trim()) {
      return NextResponse.json({ success: false, error: "Template BODY component with text is required." }, { status: 400 });
    }

    if (bodyComp.text.length > 1024) {
      return NextResponse.json(
        { success: false, error: "Template BODY text cannot exceed 1024 characters." },
        { status: 400 }
      );
    }

    // Validate sequential variable indices: {{1}}, {{2}}, etc.
    const varMatches = bodyComp.text.match(/\{\{(\d+)\}\}/g) || [];
    const varIndices = varMatches.map((m) => parseInt(m.replace(/\D/g, ""), 10));
    const sortedVars = [...new Set(varIndices)].sort((a, b) => a - b);
    for (let i = 0; i < sortedVars.length; i++) {
      if (sortedVars[i] !== i + 1) {
        return NextResponse.json(
          {
            success: false,
            error: `Variable placeholders must be sequential starting at {{1}}. Missing {{${i + 1}}}.`,
          },
          { status: 400 }
        );
      }
    }

    // If variables exist, sample values in example.body_text are required by Meta
    if (sortedVars.length > 0) {
      const bodyExamples = bodyComp.example?.body_text?.[0];
      if (!Array.isArray(bodyExamples) || bodyExamples.length < sortedVars.length) {
        return NextResponse.json(
          {
            success: false,
            error: `Sample values are required for all ${sortedVars.length} variable placeholders.`,
          },
          { status: 400 }
        );
      }
    }

    // 2. Resolve WABA from Coexistence
    const { wabaId, error: configError } = await getCoexistenceWaba();
    if (configError || !wabaId) {
      return NextResponse.json(
        { success: false, error: configError || "No active WhatsApp Business Account connected." },
        { status: 400 }
      );
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    if (!token) {
      return NextResponse.json(
        { success: false, error: "WHATSAPP_ACCESS_TOKEN is missing on server." },
        { status: 500 }
      );
    }

    // 3. Submit to Meta Graph API
    const metaUrl = `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`;

    const payload = {
      name: cleanName,
      category: category.toUpperCase(),
      language: cleanLang,
      components,
    };

    console.log(`[WhatsApp Templates API] Submitting template "${cleanName}" to WABA ${wabaId}`);

    const response = await fetch(metaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errInfo = data.error || {};
      console.error("[WhatsApp Templates API] Meta template creation error:", errInfo);
      return NextResponse.json(
        {
          success: false,
          error: errInfo.message || `Meta API error (#${errInfo.code || response.status})`,
          metaError: {
            code: errInfo.code,
            subcode: errInfo.error_subcode,
            message: errInfo.message,
            userTitle: errInfo.error_user_title,
            userMsg: errInfo.error_user_msg,
          },
        },
        { status: response.status }
      );
    }

    // Successful submission — Note: Status is PENDING / IN_REVIEW by default until Meta reviews
    return NextResponse.json({
      success: true,
      id: data.id,
      status: data.status || "PENDING",
      category: data.category || category.toUpperCase(),
      message: `Template "${cleanName}" submitted successfully. Meta review status is ${data.status || "PENDING"}.`,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to create template";
    console.error("[WhatsApp Templates API] Fatal POST error:", errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
