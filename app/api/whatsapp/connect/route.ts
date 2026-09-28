import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const provider = getWhatsAppProvider();
    await provider.connect();
    const statusResult = await provider.getStatus();

    return NextResponse.json({
      success: true,
      status: statusResult.status,
      connectedNumber: statusResult.connectedNumber || null,
      qrCode: statusResult.qrCode || null,
      provider: statusResult.provider,
      errorMessage: statusResult.errorMessage || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to initiate WhatsApp connection";
    console.error("[WhatsApp Connect] Error:", msg);
    return NextResponse.json(
      {
        success: false,
        status: "DISCONNECTED",
        error: msg,
      },
      { status: 200 }
    );
  }
}
