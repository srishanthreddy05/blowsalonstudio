import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import type { WhatsAppCampaign } from "@/types/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const campaignSnap = await getDoc(campaignRef);

    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    // Reset failed recipients to PENDING
    const q = query(
      collection(db, RECIPIENTS_COLLECTION),
      where("campaignId", "==", id),
      where("status", "==", "FAILED")
    );
    const recSnap = await getDocs(q);

    if (recSnap.empty) {
      return NextResponse.json({
        success: true,
        message: "No failed recipients found to retry.",
      });
    }

    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    for (const d of recSnap.docs) {
      batch.update(d.ref, {
        status: "PENDING",
        errorMessage: null,
        updatedAt: nowIso,
      });
    }
    await batch.commit();

    // Mark Campaign as QUEUED for retry
    await updateDoc(campaignRef, {
      status: "QUEUED",
      updatedAt: nowIso,
    });

    return NextResponse.json({
      success: true,
      message: `Reset ${recSnap.docs.length} failed recipients to pending. You can now execute send.`,
      retriedCount: recSnap.docs.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to prepare retry";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
