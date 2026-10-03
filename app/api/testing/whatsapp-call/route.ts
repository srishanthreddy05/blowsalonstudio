import { NextResponse } from "next/server";
import { initiateWhatsAppCall } from "@/lib/whatsapp/callingService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const customerNumber = (body.customerNumber || "").toString().trim();
    const sdpOffer = (body.sdp || body.sdpOffer || "").toString().trim();

    if (!customerNumber) {
      return NextResponse.json(
        { success: false, error: "customerNumber is required" },
        { status: 400 }
      );
    }

    if (!sdpOffer) {
      return NextResponse.json(
        { success: false, error: "A valid WebRTC SDP offer is required (sdp or sdpOffer)." },
        { status: 400 }
      );
    }

    const result = await initiateWhatsAppCall(customerNumber, sdpOffer);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : "Failed to initiate WhatsApp call";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
