import type {
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppCampaignStatus,
} from "@/types/whatsapp";
import { normalizeCount } from "@/lib/utils/firestore";

export interface CampaignCalculatedStats {
  totalRecipients: number;
  eligibleCount: number;
  excludedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  status?: WhatsAppCampaignStatus;
}

/**
 * Calculates WhatsApp Campaign Metrics directly from individual recipient delivery records.
 * Single Source of Truth for all campaign counter calculations across BLOW SALON.
 * 
 * Definitions:
 * - TOTAL: All recipient records in the campaign pool
 * - EXCLUDED: Never dispatched because recipient was opted-out or had invalid phone
 * - ELIGIBLE: Total recipients minus excluded
 * - SENT: Total messages successfully dispatched to Meta
 * - DELIVERED: Messages that reached the recipient's device (DELIVERED + READ, since READ implies DELIVERED)
 * - READ: Messages opened/read by the recipient
 * - FAILED: Delivery or dispatch failure
 */
export function calculateCampaignStats(
  recipients: Array<Partial<WhatsAppCampaignRecipient> & { status?: string }>
): CampaignCalculatedStats {
  const totalRecipients = recipients.length;
  let excludedCount = 0;
  let sentCount = 0;
  let deliveredOnlyCount = 0;
  let readCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let sendingCount = 0;

  for (const r of recipients) {
    const s = (r.status || "").toUpperCase();
    if (s === "EXCLUDED") {
      excludedCount++;
    } else if (s === "READ") {
      readCount++;
      sentCount++;
    } else if (s === "DELIVERED") {
      deliveredOnlyCount++;
      sentCount++;
    } else if (s === "SENT") {
      sentCount++;
    } else if (s === "FAILED") {
      failedCount++;
      sentCount++;
    } else if (s === "SENDING") {
      sendingCount++;
    } else if (s === "PENDING") {
      pendingCount++;
    }
  }

  // A READ message was already DELIVERED
  const deliveredCount = deliveredOnlyCount + readCount;
  const eligibleCount = Math.max(0, totalRecipients - excludedCount);

  let status: WhatsAppCampaignStatus | undefined = undefined;
  if (totalRecipients > 0) {
    if (sendingCount > 0) {
      status = "SENDING";
    } else if (pendingCount === eligibleCount && eligibleCount > 0) {
      status = "QUEUED";
    } else if (pendingCount === 0 && eligibleCount > 0) {
      if (failedCount > 0 && deliveredCount === 0 && sentCount === failedCount) {
        status = "FAILED";
      } else if (failedCount > 0) {
        status = "COMPLETED_WITH_ERRORS";
      } else if (sentCount > 0) {
        status = "COMPLETED";
      }
    }
  }

  return {
    totalRecipients,
    eligibleCount,
    excludedCount,
    sentCount,
    deliveredCount,
    readCount,
    failedCount,
    status,
  };
}

/**
 * Merges calculated recipient stats into a campaign object.
 */
export function applyStatsToCampaign(
  campaign: WhatsAppCampaign,
  stats: CampaignCalculatedStats
): WhatsAppCampaign {
  return {
    ...campaign,
    totalRecipients: stats.totalRecipients,
    eligibleCount: stats.eligibleCount,
    excludedCount: stats.excludedCount,
    sentCount: stats.sentCount,
    deliveredCount: stats.deliveredCount,
    readCount: stats.readCount,
    failedCount: stats.failedCount,
    status: stats.status || campaign.status,
  };
}

/**
 * Loads recipient records for a campaign from Firestore and calculates aggregation metrics.
 */
export async function getCampaignStats(
  campaignId: string,
  firestoreDb?: any
): Promise<CampaignCalculatedStats> {
  const { db } = await import("@/lib/firebase");
  const { collection, getDocs, query, where } = await import("firebase/firestore");
  const targetDb = firestoreDb || db;
  
  const q = query(
    collection(targetDb, "whatsapp_campaign_recipients"),
    where("campaignId", "==", campaignId)
  );
  const snap = await getDocs(q);
  const recipients = snap.docs.map((doc) => doc.data() as Partial<WhatsAppCampaignRecipient>);
  return calculateCampaignStats(recipients);
}
