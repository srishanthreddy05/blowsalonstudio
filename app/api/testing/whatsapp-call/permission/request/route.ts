import { NextResponse } from "next/server";
import { requestCallingPermission } from "@/lib/whatsapp/callingService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const customerNumber = (body.customerNumber || "").toString().trim();

    if (!customerNumber) {
      return NextResponse.json(
        { success: false, error: "customerNumber is required" },
        { status: 400 }
      );
    }

    const result = await requestCallingPermission(customerNumber);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : "Failed to request calling permission";
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
