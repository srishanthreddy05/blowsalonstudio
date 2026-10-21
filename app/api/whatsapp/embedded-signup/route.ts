import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { WhatsAppCoexistenceAccount } from "@/types/whatsapp";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";

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
    wabaId?: string;
    phone_number_id?: string;
    phoneNumberId?: string;
    current_step?: string;
    data?: {
      waba_id?: string;
      wabaId?: string;
      phone_number_id?: string;
      phoneNumberId?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

/**
 * Safely extracts a non-empty string ID from various input types.
 */
function extractSafeId(val: unknown): string | undefined {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof val === "number" && !isNaN(val)) {
    return String(val);
  }
  return undefined;
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
 * validates required fields, stores coexistence metadata, and skips phone registration.
 */
export async function POST(request: Request) {
  try {
    const body: EmbeddedSignupRequestBody = await request.json().catch(() => ({}));
    const { code, wabaId: directWabaId, phoneNumberId: directPhoneId, sessionData } = body;

    console.log("[Embedded Signup] Processing onboarding completion request");

    // 1. Resolve WABA ID and Phone Number ID from input parameters or session listener data
    // Handles both snake_case, camelCase, and nested data formats
    let resolvedWabaId =
      extractSafeId(directWabaId) ||
      extractSafeId(sessionData?.waba_id) ||
      extractSafeId(sessionData?.wabaId) ||
      extractSafeId(sessionData?.data?.waba_id) ||
      extractSafeId(sessionData?.data?.wabaId);

    let resolvedPhoneNumberId =
      extractSafeId(directPhoneId) ||
      extractSafeId(sessionData?.phone_number_id) ||
      extractSafeId(sessionData?.phoneNumberId) ||
      extractSafeId(sessionData?.data?.phone_number_id) ||
      extractSafeId(sessionData?.data?.phoneNumberId);

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
    // IMPORTANT: Meta's debug_token requires an App Access Token (appId|appSecret) or System User Token
    // as the inspecting token. A user access token cannot inspect itself.
    const inspectingToken = appSecret
      ? `${appId}|${appSecret}`
      : process.env.WHATSAPP_ACCESS_TOKEN?.trim();

    if (!resolvedWabaId && exchangedUserToken && inspectingToken) {
      try {
        const debugTokenUrl = `https://graph.facebook.com/${META_API_VERSION}/debug_token?input_token=${encodeURIComponent(
          exchangedUserToken
        )}&access_token=${encodeURIComponent(inspectingToken)}`;

        const debugRes = await fetch(debugTokenUrl, { method: "GET" });
        const debugData = await debugRes.json().catch(() => ({}));

        if (debugRes.ok && debugData.data?.granular_scopes) {
          const scopes = debugData.data.granular_scopes as Array<{ scope: string; target_ids?: string[] }>;
          const waScope = scopes.find((s) => s.scope === "whatsapp_business_management");
          if (waScope && Array.isArray(waScope.target_ids) && waScope.target_ids.length > 0) {
            resolvedWabaId = extractSafeId(waScope.target_ids[0]);
            if (resolvedWabaId) {
              console.log("[Embedded Signup] WABA ID resolved from debug_token granular scopes");
            }
          }
        }
      } catch (debugErr) {
        console.warn(
          "[Embedded Signup] Asset inspection error:",
          debugErr instanceof Error ? debugErr.message : debugErr
        );
      }
    }

    // Fallback: Query /me/whatsapp_business_accounts with exchanged user token if WABA still unknown
    if (!resolvedWabaId && exchangedUserToken) {
      try {
        const meWabaUrl = `https://graph.facebook.com/${META_API_VERSION}/me/whatsapp_business_accounts`;
        const meRes = await fetch(meWabaUrl, {
          headers: { Authorization: `Bearer ${exchangedUserToken}` },
        });
        const meData = await meRes.json().catch(() => ({}));
        if (meRes.ok && Array.isArray(meData.data) && meData.data.length > 0) {
          resolvedWabaId = extractSafeId(meData.data[0].id);
          if (resolvedWabaId) {
            console.log("[Embedded Signup] WABA ID resolved from user accounts endpoint");
          }
        }
      } catch (meErr) {
        console.warn(
          "[Embedded Signup] Accounts query error:",
          meErr instanceof Error ? meErr.message : meErr
        );
      }
    }

    // 4. Discover phone numbers from WABA if phone ID is not yet resolved
    const activeTokenForAssetQuery = exchangedUserToken || process.env.WHATSAPP_ACCESS_TOKEN?.trim();

    let businessPhoneNumber: string | undefined;
    let verifiedName: string | undefined;

    if (resolvedWabaId && !resolvedPhoneNumberId && activeTokenForAssetQuery) {
      try {
        const phoneListUrl = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(
          resolvedWabaId
        )}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`;

        const phoneRes = await fetch(phoneListUrl, {
          headers: { Authorization: `Bearer ${activeTokenForAssetQuery}` },
        });
        const phoneData = await phoneRes.json().catch(() => ({}));

        if (phoneRes.ok && Array.isArray(phoneData.data) && phoneData.data.length > 0) {
          const phoneAsset = phoneData.data[0];
          resolvedPhoneNumberId = extractSafeId(phoneAsset.id);
          businessPhoneNumber = extractSafeId(phoneAsset.display_phone_number);
          verifiedName = extractSafeId(phoneAsset.verified_name);
          console.log("[Embedded Signup] WhatsApp phone discovered from WABA assets");
        }
      } catch (phoneErr) {
        console.warn(
          "[Embedded Signup] Phone discovery error:",
          phoneErr instanceof Error ? phoneErr.message : phoneErr
        );
      }
    }

    // 5. Retrieve phone metadata if phone ID is known but details are missing
    if (resolvedPhoneNumberId && (!businessPhoneNumber || !verifiedName) && activeTokenForAssetQuery) {
      try {
        const phoneDetailUrl = `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(
          resolvedPhoneNumberId
        )}?fields=display_phone_number,verified_name,code_verification_status,quality_rating`;

        const detailRes = await fetch(phoneDetailUrl, {
          headers: { Authorization: `Bearer ${activeTokenForAssetQuery}` },
        });
        const detailData = await detailRes.json().catch(() => ({}));

        if (detailRes.ok) {
          businessPhoneNumber = businessPhoneNumber || extractSafeId(detailData.display_phone_number);
          verifiedName = verifiedName || extractSafeId(detailData.verified_name);
          console.log("[Embedded Signup] WhatsApp phone details verified");
        }
      } catch (detailErr) {
        console.warn(
          "[Embedded Signup] Phone details query warning:",
          detailErr instanceof Error ? detailErr.message : detailErr
        );
      }
    }

    // 6. STRICT FIRESTORE VALIDATION
    // Before writing to Firestore, validate that the WABA ID exists and is a non-empty string.
    // If missing, preserve existing configuration and return clear error. Never persist undefined.
    if (!resolvedWabaId) {
      console.warn("[Embedded Signup] Onboarding failed: Missing WhatsApp Business Account (WABA) ID from Meta.");
      return NextResponse.json(
        {
          success: false,
          error: "WhatsApp connection could not be completed. Missing WhatsApp Business Account (WABA) ID from Meta onboarding response. Please retry.",
        },
        { status: 400 }
      );
    }

    // 7. CRITICAL: DO NOT REGISTER THE PHONE NUMBER
    // For WhatsApp Business App coexistence, the number is already active in the app.
    // Automatic call to POST /{phone_number_id}/register is intentionally skipped.

    // 8. Safe Structured Logging & Sanitized Firestore Record
    console.log("[Embedded Signup] WABA onboarding completed successfully");

    const nowIso = new Date().toISOString();
    const coexistenceRecord: WhatsAppCoexistenceAccount = {
      status: "CONNECTED",
      wabaId: resolvedWabaId,
      configurationId: CONFIGURATION_ID,
      featureType: "whatsapp_business_app_onboarding",
      onboardedAt: nowIso,
      updatedAt: nowIso,
    };

    if (resolvedPhoneNumberId) {
      coexistenceRecord.phoneNumberId = resolvedPhoneNumberId;
    }
    if (businessPhoneNumber) {
      coexistenceRecord.businessPhoneNumber = businessPhoneNumber;
    }
    if (verifiedName) {
      coexistenceRecord.verifiedName = verifiedName;
    }

    // Defensive stripping of any undefined properties before passing to Firestore
    const sanitizedRecord = sanitizeFirestoreDoc(coexistenceRecord);

    await setDoc(SETTINGS_COEXISTENCE_DOC, sanitizedRecord, { merge: true });
    await setDoc(
      SETTINGS_WHATSAPP_DOC,
      {
        coexistence: sanitizedRecord,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    // 9. Return ONLY non-secret safe info to the frontend
    return NextResponse.json({
      success: true,
      message: "WhatsApp Business App connection completed.",
      coexistence: sanitizedRecord,
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

    const sanitizedState = sanitizeFirestoreDoc(disconnectedState);

    await setDoc(SETTINGS_COEXISTENCE_DOC, sanitizedState, { merge: false });
    await setDoc(
      SETTINGS_WHATSAPP_DOC,
      {
        coexistence: sanitizedState,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    console.log("[Embedded Signup] WhatsApp Business App coexistence disconnected.");
    return NextResponse.json({
      success: true,
      message: "WhatsApp Business App coexistence disconnected.",
      coexistence: sanitizedState,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to disconnect coexistence";
    console.error("[Embedded Signup] DELETE error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
