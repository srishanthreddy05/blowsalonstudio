import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const provider = getWhatsAppProvider();
    await provider.disconnect();

    return NextResponse.json({
      success: true,
      status: "DISCONNECTED",
      message: "WhatsApp session logged out successfully.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to disconnect WhatsApp";
    console.error("[WhatsApp Disconnect] Error:", msg);
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
