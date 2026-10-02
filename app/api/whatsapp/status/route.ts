import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import type { WhatsAppSettings } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const provider = getWhatsAppProvider();
    const statusResult = await provider.getStatus();

    const isMetaConfigured = Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    );

    // Fetch settings from Firestore
    let autoSendInvoice = true;
    let whatsappEnabled = true;
    let coexistence = null;
    try {
      const settingsDoc = await getDoc(doc(db, "settings", "whatsapp"));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as Partial<WhatsAppSettings>;
        if (typeof data.autoSendInvoice === "boolean") autoSendInvoice = data.autoSendInvoice;
        if (typeof data.whatsappEnabled === "boolean") whatsappEnabled = data.whatsappEnabled;
        if (data.coexistence) coexistence = data.coexistence;
      }

      if (!coexistence) {
        const coexDoc = await getDoc(doc(db, "settings", "whatsapp_coexistence"));
        if (coexDoc.exists()) {
          coexistence = coexDoc.data();
        }
      }
    } catch (settingsErr) {
      console.warn(
        "[WhatsApp Status] Could not read whatsapp settings, using defaults:",
        settingsErr instanceof Error ? settingsErr.message : settingsErr
      );
    }

    return NextResponse.json({
      status: statusResult.status,
      connectedNumber: statusResult.connectedNumber || null,
      qrCode: statusResult.qrCode || null,
      provider: statusResult.provider,
      errorMessage: statusResult.errorMessage || null,
      errorCode: statusResult.errorCode || null,
      metaCloudConfigured: isMetaConfigured,
      whatsappEnabled,
      autoSendInvoice,
      coexistence: coexistence || null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to fetch WhatsApp status";
    console.error("[WhatsApp Status] Error:", errorMsg);

    return NextResponse.json(
      {
        status: "DISCONNECTED",
        connectedNumber: null,
        qrCode: null,
        provider: "WHATSAPP_CLOUD_API",
        errorMessage: "WhatsApp service is currently unavailable.",
        errorCode: "WHATSAPP_NOT_CONFIGURED",
        whatsappEnabled: true,
        autoSendInvoice: true,
        updatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
