import { NextResponse } from "next/server";
import {
  getCallingSession,
  getLatestSessionByCustomer,
} from "@/lib/whatsapp/callingService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const callId = (searchParams.get("callId") || "").trim();
    const customerNumber = (searchParams.get("customerNumber") || "").trim();

    if (!callId && !customerNumber) {
      return NextResponse.json(
        { success: false, error: "Either callId or customerNumber is required" },
        { status: 400 }
      );
    }

    let session = null;
    if (callId) {
      session = await getCallingSession(callId);
    } else if (customerNumber) {
      session = await getLatestSessionByCustomer(customerNumber);
    }

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found", status: "IDLE" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to retrieve call status";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
