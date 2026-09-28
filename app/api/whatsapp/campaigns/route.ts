import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import type {
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppAudienceType,
} from "@/types/whatsapp";
import type { Customer } from "@/types/customer";
import { normalizePhoneNumber } from "@/lib/utils/phone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAMPAIGNS_COLLECTION = "whatsapp_campaigns";
const RECIPIENTS_COLLECTION = "whatsapp_campaign_recipients";
const CUSTOMERS_COLLECTION = "customers";

/**
 * Defensive utility to recursively strip any 'undefined' properties before passing to Firestore.
 */
function sanitizeFirestoreDoc<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = sanitizeFirestoreDoc(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export async function GET() {
  try {
    const q = query(collection(db, CAMPAIGNS_COLLECTION), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const campaigns: WhatsAppCampaign[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as WhatsAppCampaign));

    return NextResponse.json({ campaigns });
  } catch (error: unknown) {
    console.error("[Campaigns API] Error fetching campaigns:", error);
    try {
      // Fallback without orderBy index if index not ready
      const snap = await getDocs(collection(db, CAMPAIGNS_COLLECTION));
      const campaigns: WhatsAppCampaign[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WhatsAppCampaign))
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return NextResponse.json({ campaigns });
    } catch {
      return NextResponse.json({ campaigns: [] });
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      templateName,
      templateLanguage = "en_US",
      templateCategory,
      audienceType = "ALL",
      customCustomerIds = [],
      templateVariables = {},
    } = body;

    if (!name || !templateName) {
      return NextResponse.json(
        { error: "Campaign name and template are required." },
        { status: 400 }
      );
    }

    // 1. Fetch all customers to build target audience segment
    const custSnap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
    const allCustomers: Customer[] = custSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Customer));

    // 2. Filter by Audience Segment
    let targetCustomers: Customer[] = [];
    if (audienceType === "ALL") {
      targetCustomers = allCustomers;
    } else if (audienceType === "REGULAR") {
      targetCustomers = allCustomers.filter((c) => c.customerType === "regular");
    } else if (audienceType === "MEMBERSHIP") {
      targetCustomers = allCustomers.filter((c) => c.customerType === "membership");
    } else if (audienceType === "CUSTOM") {
      const idSet = new Set(customCustomerIds);
      targetCustomers = allCustomers.filter((c) => c.id && idSet.has(c.id));
    }

    // 3. Separate Eligible vs Excluded based on WhatsApp Opt-in / Opt-out and Phone validity
    const nowIso = new Date().toISOString();
    const recipientRecords: Array<Omit<WhatsAppCampaignRecipient, "id">> = [];

    let eligibleCount = 0;
    let excludedCount = 0;

    for (const cust of targetCustomers) {
      const normalized = normalizePhoneNumber(cust.phone);
      const isOptedOut = cust.whatsappOptOut === true;
      const isInvalidPhone = !normalized.isValid;

      if (isOptedOut || isInvalidPhone) {
        excludedCount++;
        recipientRecords.push({
          campaignId: "", // will be set after campaign creation
          customerId: cust.id || null,
          customerName: cust.name || "Customer",
          phone: cust.phone || "",
          normalizedPhone: normalized.display || normalized.digits || "",
          status: "EXCLUDED",
          errorMessage: isOptedOut
            ? "Customer opted out of WhatsApp marketing"
            : "Invalid phone number format",
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } else {
        eligibleCount++;
        recipientRecords.push({
          campaignId: "",
          customerId: cust.id || null,
          customerName: cust.name || "Customer",
          phone: cust.phone || "",
          normalizedPhone: normalized.digits,
          status: "PENDING",
          errorMessage: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }

    // 4. Create Campaign Document
    const campaignData: Omit<WhatsAppCampaign, "id"> = {
      name: String(name).trim(),
      templateName: String(templateName).trim(),
      templateLanguage: String(templateLanguage).trim(),
      templateCategory: templateCategory || "MARKETING",
      audienceType: audienceType as WhatsAppAudienceType,
      customCustomerIds: audienceType === "CUSTOM" ? customCustomerIds : [],
      status: "DRAFT",
      totalRecipients: targetCustomers.length,
      eligibleCount,
      excludedCount,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      templateVariables: templateVariables || {},
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    };

    const campaignDocRef = await addDoc(
      collection(db, CAMPAIGNS_COLLECTION),
      sanitizeFirestoreDoc(campaignData)
    );
    const campaignId = campaignDocRef.id;

    // 5. Batch create recipients (in chunks of 400 for Firestore limit)
    const BATCH_SIZE = 400;
    for (let i = 0; i < recipientRecords.length; i += BATCH_SIZE) {
      const chunk = recipientRecords.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const rec of chunk) {
        const newRecRef = doc(collection(db, RECIPIENTS_COLLECTION));
        rec.campaignId = campaignId;
        batch.set(newRecRef, sanitizeFirestoreDoc(rec));
      }

      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaignId,
        ...campaignData,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : "Failed to create campaign";
    console.error("[Campaigns API] Error creating campaign:", error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
