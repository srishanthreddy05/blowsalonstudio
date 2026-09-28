import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CUSTOMERS_COLLECTION = "customers";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, optOut } = body;

    if (!customerId) {
      return NextResponse.json({ error: "Missing customerId." }, { status: 400 });
    }

    const custRef = doc(db, CUSTOMERS_COLLECTION, customerId);
    const snap = await getDoc(custRef);

    if (!snap.exists()) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const isOptedOut = Boolean(optOut);

    await updateDoc(custRef, {
      whatsappOptOut: isOptedOut,
      whatsappOptOutAt: isOptedOut ? nowIso : null,
      whatsappOptIn: !isOptedOut,
      whatsappOptInAt: !isOptedOut ? nowIso : null,
      updatedAt: nowIso,
    });

    return NextResponse.json({
      success: true,
      message: isOptedOut
        ? "Customer marked as opted out from WhatsApp campaigns."
        : "Customer marked as opted in for WhatsApp campaigns.",
      whatsappOptOut: isOptedOut,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update customer opt-out status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
