import { NextResponse } from "next/server";
import { checkCallingPermission } from "@/lib/whatsapp/callingService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerNumber = (searchParams.get("customerNumber") || "").trim();

    if (!customerNumber) {
      return NextResponse.json(
        { success: false, status: "UNKNOWN", error: "customerNumber query param is required" },
        { status: 400 }
      );
    }

    const result = await checkCallingPermission(customerNumber);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : "Failed to check calling permission status";
    return NextResponse.json(
      { success: false, status: "UNKNOWN", error: errorMsg },
      { status: 500 }
    );
  }
}
