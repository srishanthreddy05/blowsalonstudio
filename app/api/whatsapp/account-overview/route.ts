import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import type { WhatsAppAccountOverview, WhatsAppCoexistenceAccount } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API_VERSION = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^v?/, "v");

export async function GET() {
  const errors: Array<{ scope: string; code?: number; message: string; actionableAdvice: string }> = [];

  try {
    // 1. Resolve Coexistence record from Firestore
    let coexData: Partial<WhatsAppCoexistenceAccount> | null = null;
    try {
      const snap = await getDoc(doc(db, "settings", "whatsapp_coexistence"));
      if (snap.exists()) {
        coexData = snap.data() as Partial<WhatsAppCoexistenceAccount>;
      }
    } catch (fsErr) {
      console.error("[Account Overview API] Failed to read Firestore:", fsErr);
    }

    if (!coexData || coexData.status !== "CONNECTED") {
      const disconnectedOverview: WhatsAppAccountOverview = {
        connected: false,
        status: "DISCONNECTED",
        businessPhoneNumber: coexData?.businessPhoneNumber,
        verifiedName: coexData?.verifiedName,
        wabaId: coexData?.wabaId,
        phoneNumberId: coexData?.phoneNumberId,
        lastSync: new Date().toISOString(),
        errors: [
          {
            scope: "CONNECTION",
            message: "WhatsApp Business App coexistence is not connected.",
            actionableAdvice: "Connect your WhatsApp Business number via Embedded Signup in Settings.",
          },
        ],
      };
      return NextResponse.json({ overview: disconnectedOverview });
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    if (!token) {
      errors.push({
        scope: "AUTHENTICATION",
        message: "WHATSAPP_ACCESS_TOKEN is missing on server.",
        actionableAdvice: "Configure WHATSAPP_ACCESS_TOKEN with whatsapp_business_messaging permissions in environment settings.",
      });
    }

    const phoneNumberId = coexData.phoneNumberId?.trim();
    const wabaId = coexData.wabaId?.trim();

    let phoneData: any = null;
    let wabaData: any = null;

    // 2. Fetch Phone details from Meta Graph API
    if (phoneNumberId && token) {
      try {
        const phoneUrl = `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(
          phoneNumberId
        )}?fields=id,verified_name,display_phone_number,quality_rating,messaging_limit_tier,code_verification_status,status,name_status,platform_type,throughput`;

        const pRes = await fetch(phoneUrl, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 0 },
        });

        const pJson = await pRes.json().catch(() => ({}));
        if (pRes.ok) {
          phoneData = pJson;
        } else {
          const err = pJson.error || {};
          console.warn("[Account Overview API] Meta phone fetch error:", err.message);
          errors.push({
            scope: "PHONE_NUMBER",
            code: err.code,
            message: err.message || "Failed to retrieve phone number details from Meta.",
            actionableAdvice: "Verify that the phone number ID is active and authorized for your Meta System User token.",
          });
        }
      } catch (err: unknown) {
        errors.push({
          scope: "PHONE_NUMBER_NETWORK",
          message: err instanceof Error ? err.message : "Network error contacting Meta Graph API.",
          actionableAdvice: "Check outbound network connectivity to graph.facebook.com.",
        });
      }
    }

    // 3. Fetch WABA details from Meta Graph API
    if (wabaId && token) {
      try {
        const wabaUrl = `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(
          wabaId
        )}?fields=id,name,currency,timezone_id,account_review_status,message_template_namespace`;

        const wRes = await fetch(wabaUrl, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 0 },
        });

        const wJson = await wRes.json().catch(() => ({}));
        if (wRes.ok) {
          wabaData = wJson;
        } else {
          const err = wJson.error || {};
          console.warn("[Account Overview API] Meta WABA fetch error:", err.message);
          let advice = "Verify that your Meta System User has access to this WhatsApp Business Account in Meta Business Manager.";
          if (err.code === 100 && err.error_subcode === 33) {
            advice = `WABA ID ${wabaId} requires whatsapp_business_management permission assigned to your System User token in Meta Business Manager.`;
          }
          errors.push({
            scope: "WABA_ACCOUNT",
            code: err.code,
            message: err.message || "Failed to retrieve WABA details from Meta.",
            actionableAdvice: advice,
          });
        }
      } catch (err: unknown) {
        errors.push({
          scope: "WABA_NETWORK",
          message: err instanceof Error ? err.message : "Network error contacting Meta Graph API.",
          actionableAdvice: "Check outbound network connectivity to graph.facebook.com.",
        });
      }
    }

    const overview: WhatsAppAccountOverview = {
      connected: true,
      status: "CONNECTED",
      businessPhoneNumber: phoneData?.display_phone_number || coexData.businessPhoneNumber,
      verifiedName: phoneData?.verified_name || coexData.verifiedName,
      wabaId,
      phoneNumberId,
      qualityRating: phoneData?.quality_rating || "UNKNOWN",
      messagingLimitTier: phoneData?.messaging_limit_tier || "TIER_250",
      codeVerificationStatus: phoneData?.code_verification_status || "UNKNOWN",
      nameStatus: phoneData?.name_status || "UNKNOWN",
      platformType: phoneData?.platform_type || "CLOUD_API",
      throughput: phoneData?.throughput,
      waba: wabaData
        ? {
            id: wabaData.id,
            name: wabaData.name,
            currency: wabaData.currency,
            timezoneId: wabaData.timezone_id,
            accountReviewStatus: wabaData.account_review_status,
            messageTemplateNamespace: wabaData.message_template_namespace,
          }
        : null,
      lastSync: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json({ overview });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Internal error fetching account overview";
    console.error("[Account Overview API] Fatal error:", errorMsg);
    return NextResponse.json(
      {
        overview: {
          connected: false,
          status: "ERROR",
          lastSync: new Date().toISOString(),
          errors: [
            {
              scope: "INTERNAL",
              message: errorMsg,
              actionableAdvice: "Check application server logs for further diagnostic detail.",
            },
          ],
        },
      },
      { status: 500 }
    );
  }
}
