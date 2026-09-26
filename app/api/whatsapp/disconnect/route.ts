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
      message: "WhatsApp session logged out and cleared successfully.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to disconnect WhatsApp";
    return NextResponse.json(
      {
        success: false,
        error: msg,
      },
      { status: 500 }
    );
  }
}
