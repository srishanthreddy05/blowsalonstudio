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

    // Fetch autoSend setting from Firestore
    let autoSendInvoice = true;
    try {
      const settingsDoc = await getDoc(doc(db, "settings", "whatsapp"));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as WhatsAppSettings;
        if (typeof data.autoSendInvoice === "boolean") {
          autoSendInvoice = data.autoSendInvoice;
        }
      }
    } catch (settingsErr) {
      console.warn("Could not read whatsapp settings, using default true:", settingsErr);
    }

    return NextResponse.json({
      status: statusResult.status,
      connectedNumber: statusResult.connectedNumber,
      qrCode: statusResult.qrCode,
      provider: statusResult.provider,
      errorMessage: statusResult.errorMessage,
      autoSendInvoice,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch WhatsApp status";
    return NextResponse.json(
      {
        status: "ERROR",
        provider: "QR_WHATSAPP",
        errorMessage: msg,
        autoSendInvoice: true,
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
