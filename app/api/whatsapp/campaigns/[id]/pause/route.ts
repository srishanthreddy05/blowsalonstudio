import { NextResponse } from "next/server";
import { adminDb as db, doc, getDoc, updateDoc } from "@/lib/firebaseAdmin";
import type { WhatsAppCampaign } from "@/types/whatsapp";
import { sanitizeFirestoreDoc } from "@/lib/utils/firestore";
import { verifyWhatsAppCampaignAuth } from "@/lib/whatsapp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyWhatsAppCampaignAuth(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || "Unauthorized campaign access." }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing campaign ID." }, { status: 400 });
    }

    const campaignRef = doc(db, CAMPAIGNS_COLLECTION, id);
    const campaignSnap = await getDoc(campaignRef);

    if (!campaignSnap.exists()) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const campaign = campaignSnap.data() as WhatsAppCampaign;

    if (campaign.status !== "SENDING" && campaign.status !== "QUEUED") {
      return NextResponse.json(
        { error: `Cannot pause campaign in "${campaign.status}" state.` },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    await updateDoc(
      campaignRef,
      sanitizeFirestoreDoc({
        status: "PAUSED",
        isPaused: true,
        updatedAt: nowIso,
      })
    );

    return NextResponse.json({
      success: true,
      message: "Campaign paused successfully. Queue worker will skip remaining jobs until resumed.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to pause campaign";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

