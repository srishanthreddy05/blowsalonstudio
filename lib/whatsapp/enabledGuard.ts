/**
 * Server-side WhatsApp master enable/disable guard.
 *
 * Reads `settings/whatsapp.whatsappEnabled` from Firestore.
 * Default is `true` so existing deployments without the field continue working.
 *
 * Use this in EVERY API route that sends WhatsApp messages:
 *
 *   const check = await assertWhatsAppEnabled();
 *   if (!check.enabled) return check.response;
 */

import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { NextResponse } from "next/server";
import type { WhatsAppSettings } from "@/types/whatsapp";

const SETTINGS_DOC_PATH = { collection: "settings", id: "whatsapp" };

export async function isWhatsAppEnabled(): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, SETTINGS_DOC_PATH.collection, SETTINGS_DOC_PATH.id));
    if (snap.exists()) {
      const data = snap.data() as Partial<WhatsAppSettings>;
      // Default true – preserves existing behaviour before the field was introduced
      if (typeof data.whatsappEnabled === "boolean") {
        return data.whatsappEnabled;
      }
    }
    return true;
  } catch {
    // On Firestore error, fail-open (allow) to avoid breaking the app
    return true;
  }
}

export async function assertWhatsAppEnabled(): Promise<
  | { enabled: true }
  | { enabled: false; response: ReturnType<typeof NextResponse.json> }
> {
  const enabled = await isWhatsAppEnabled();
  if (enabled) return { enabled: true };

  return {
    enabled: false,
    response: NextResponse.json(
      {
        success: false,
        status: "NOT_SENT",
        error: "WhatsApp messaging is currently disabled. Turn it on in the WhatsApp settings to send messages.",
        disabled: true,
      },
      { status: 200 } // 200 so the UI treats it as a soft non-error
    ),
  };
}
