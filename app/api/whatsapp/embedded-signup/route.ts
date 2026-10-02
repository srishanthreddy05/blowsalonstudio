import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { WhatsAppCoexistenceAccount } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SETTINGS_COEXISTENCE_DOC = doc(db, "settings", "whatsapp_coexistence");
const SETTINGS_WHATSAPP_DOC = doc(db, "settings", "whatsapp");
const CONFIGURATION_ID = "1744937289890566";
const META_API_VERSION = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^v?/, "v");

interface EmbeddedSignupRequestBody {
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
  sessionData?: {
    waba_id?: string;
    phone_number_id?: string;
    current_step?: string;
    [key: string]: unknown;
  };
}

/**
 * GET /api/whatsapp/embedded-signup
 * Returns the current WhatsApp Business App Coexistence onboarding status.
 * Safe, sanitized non-secret details only.
 */
export async function GET() {
  try {
    const snap = await getDoc(SETTINGS_COEXISTENCE_DOC);
    if (!snap.exists()) {
      return NextResponse.json({
        connected: false,
        coexistence: {
          status: "DISCONNECTED",
          configurationId: CONFIGURATION_ID,
        } as WhatsAppCoexistenceAccount,
      });
    }

    const data = snap.data() as Partial<WhatsAppCoexistenceAccount>;
    const isConnected = data.status === "CONNECTED";

    return NextResponse.json({
      connected: isConnected,
      coexistence: {
        status: data.status || "DISCONNECTED",
        wabaId: data.wabaId || undefined,
        phoneNumberId: data.phoneNumberId || undefined,
        businessPhoneNumber: data.businessPhoneNumber || undefined,
        verifiedName: data.verifiedName || undefined,
        configurationId: data.configurationId || CONFIGURATION_ID,
        featureType: data.featureType || "whatsapp_business_app_onboarding",
        onboardedAt: data.onboardedAt || undefined,
        updatedAt: data.updatedAt || undefined,
      } as WhatsAppCoexistenceAccount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to load coexistence status";
    console.error("[Embedded Signup] GET error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/embedded-signup
 * Completes Meta Embedded Signup for WhatsApp Business App Coexistence.
 * Exchanges authorization code if provided, resolves WABA/Phone assets,
 * stores the non-secret coexistence metadata, and skips phone registration.
 */
export async function POST(request: Request) {
  try {
    const body: EmbeddedSignupRequestBody = await request.json().catch(() => ({}));
    const { code, wabaId: directWabaId, phoneNumberId: directPhoneId, sessionData } = body;

    console.log("[Embedded Signup] Processing onboarding completion request");

    // 1. Resolve WABA ID and Phone Number ID from input parameters or session listener data
    let resolvedWabaId = directWabaId || sessionData?.waba_id?.trim();
    let resolvedPhoneNumberId = directPhoneId || sessionData?.phone_number_id?.trim();
    let exchangedUserToken: string | null = null;

    // 2. If authorization code is provided, exchange for user access token if App Secret is available
    const appId =
      process.env.NEXT_PUBLIC_META_APP_ID ||
      process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ||
      "2308689169962503";
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();

    if (code && appSecret) {
      try {
        console.log("[Embedded Signup] Exchanging authorization code with Meta Graph API");
        const tokenExchangeUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?client_id=${encodeURIComponent(
          appId
        )}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;

        const tokenRes = await fetch(tokenExchangeUrl, { method: "GET" });
        const tokenData = await tokenRes.json().catch(() => ({}));

        if (tokenRes.ok && tokenData.access_token) {
          exchangedUserToken = tokenData.access_token;
          console.log("[Embedded Signup] Authorization code successfully exchanged for access token");
        } else {
          const errMsg = tokenData.error?.message || tokenRes.statusText;
          console.warn("[Embedded Signup] Code exchange warning:", errMsg);
        }
      } catch (exchangeErr) {
        console.warn(
          "[Embedded Signup] Code exchange network error:",
          exchangeErr instanceof Error ? exchangeErr.message : exchangeErr
        );
      }
    }

    // 3. Resolve WABA ID and Phone Number ID from token debug or asset queries if not in sessionData
    const activeServerToken = exchangedUserToken || process.env.WHATSAPP_ACCESS_TOKEN?.trim();

    if ((!resolvedWabaId || !resolvedPhoneNumberId) && activeServerToken) {
      try {
        // Query granular scopes from debug_token or me/accounts if user token exists
        const debugTokenUrl = `https://graph.facebook.com/${META_API_VERSION}/debug_token?input_token=${encodeURIComponent(
          activeServerToken
        )}&access_token=${encodeURIComponent(activeServerToken)}`;

        const debugRes = await fetch(debugTokenUrl, { method: "GET" });
        const debugData = await debugRes.json().catch(() => ({}));

        if (debugRes.ok && debugData.data?.granular_scopes) {
          const scopes = debugData.data.granular_scopes as Array<{ scope: string; target_ids?: string[] }>;
          const waScope = scopes.find((s) => s.scope === "whatsapp_business_management");
          if (waScope && Array.isArray(waScope.target_ids) && waScope.target_ids.length > 0) {
            resolvedWabaId = resolvedWabaId || waScope.target_ids[0];
          }
        }
      } catch (debugErr) {
        console.warn(
          "[Embedded Signup] Asset inspection error:",
          debugErr instanceof Error ? debugErr.message : debugErr
        );
      }
    }

    // If still missing phone number ID but WABA is known, discover phone numbers from WABA
    if (resolvedWabaId && !resolvedPhoneNumberId && activeServerToken) {
      try {
        const phoneListUrl = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(
          resolvedWabaId
        )}/phone_numbers`;

        const phoneRes = await fetch(phoneListUrl, {
          headers: { Authorization: `Bearer ${activeServerToken}` },
        });
        const phoneData = await phoneRes.json().catch(() => ({}));

        if (phoneRes.ok && Array.isArray(phoneData.data) && phoneData.data.length > 0) {
          resolvedPhoneNumberId = phoneData.data[0].id;
          console.log("[Embedded Signup] WhatsApp phone discovered from WABA assets");
        }
      } catch (phoneErr) {
        console.warn(
          "[Embedded Signup] Phone discovery error:",
          phoneErr instanceof Error ? phoneErr.message : phoneErr
        );
      }
    }

    // Validate that we resolved at least basic onboarding assets or received valid code
    if (!resolvedWabaId && !resolvedPhoneNumberId && !code) {
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp connection could not be completed. Missing WABA or phone details from Meta.",
        },
        { status: 400 }
      );
    }

    // 4. Retrieve phone metadata (Display number, verified name) if phone ID is known
    let businessPhoneNumber: string | undefined;
    let verifiedName: string | undefined;

    if (resolvedPhoneNumberId && activeServerToken) {
      try {
        const phoneDetailUrl = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(
          resolvedPhoneNumberId
        )}?fields=display_phone_number,verified_name,code_verification_status,quality_rating`;

        const detailRes = await fetch(phoneDetailUrl, {
          headers: { Authorization: `Bearer ${activeServerToken}` },
        });
        const detailData = await detailRes.json().catch(() => ({}));

        if (detailRes.ok) {
          businessPhoneNumber = detailData.display_phone_number;
          verifiedName = detailData.verified_name;
          console.log("[Embedded Signup] WhatsApp phone discovered");
        }
      } catch (detailErr) {
        console.warn(
          "[Embedded Signup] Phone details query warning:",
          detailErr instanceof Error ? detailErr.message : detailErr
        );
      }
    }

    // 5. CRITICAL: DO NOT REGISTER THE PHONE NUMBER
    // For WhatsApp Business App coexistence, the number is already active in the app.
    // Automatic call to POST /{phone_number_id}/register is intentionally skipped.

    // 6. Safe Structured Logging
    console.log("[Embedded Signup] WABA onboarding completed");

    const nowIso = new Date().toISOString();
    const coexistenceRecord: WhatsAppCoexistenceAccount = {
      status: "CONNECTED",
      wabaId: resolvedWabaId || undefined,
      phoneNumberId: resolvedPhoneNumberId || undefined,
      businessPhoneNumber: businessPhoneNumber || undefined,
      verifiedName: verifiedName || undefined,
      configurationId: CONFIGURATION_ID,
      featureType: "whatsapp_business_app_onboarding",
      onboardedAt: nowIso,
      updatedAt: nowIso,
    };

    // 7. Store coexistence onboarding state in Firestore
    await setDoc(SETTINGS_COEXISTENCE_DOC, coexistenceRecord, { merge: true });
    await setDoc(
      SETTINGS_WHATSAPP_DOC,
      {
        coexistence: coexistenceRecord,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    // 8. Return ONLY non-secret safe info to the frontend
    return NextResponse.json({
      success: true,
      message: "WhatsApp Business App connection completed.",
      coexistence: coexistenceRecord,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "WhatsApp connection could not be completed.";
    console.error("[Embedded Signup] POST error:", errorMsg);
    return NextResponse.json(
      {
        success: false,
        error: "WhatsApp connection could not be completed. " + errorMsg,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/whatsapp/embedded-signup
 * Disconnects the coexistence onboarding state from Firestore.
 * Does not touch existing production environment variables.
 */
export async function DELETE() {
  try {
    const nowIso = new Date().toISOString();
    const disconnectedState: WhatsAppCoexistenceAccount = {
      status: "DISCONNECTED",
      configurationId: CONFIGURATION_ID,
      featureType: "whatsapp_business_app_onboarding",
      updatedAt: nowIso,
    };

    await setDoc(SETTINGS_COEXISTENCE_DOC, disconnectedState, { merge: false });
    await setDoc(
      SETTINGS_WHATSAPP_DOC,
      {
        coexistence: disconnectedState,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    console.log("[Embedded Signup] WhatsApp Business App coexistence disconnected.");
    return NextResponse.json({
      success: true,
      message: "WhatsApp Business App coexistence disconnected.",
      coexistence: disconnectedState,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to disconnect coexistence";
    console.error("[Embedded Signup] DELETE error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
