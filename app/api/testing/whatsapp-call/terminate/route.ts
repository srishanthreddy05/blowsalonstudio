import { NextResponse } from "next/server";
import { terminateWhatsAppCall } from "@/lib/whatsapp/callingService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const callId = (body.callId || "").toString().trim();

    if (!callId) {
      return NextResponse.json(
        { success: false, error: "callId is required to terminate call" },
        { status: 400 }
      );
    }

    const result = await terminateWhatsAppCall(callId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to terminate call";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
