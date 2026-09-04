import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { Settings } from "@/types/settings";
import { readCache, writeCache, clearCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";
import { toTitleCase } from "@/lib/utils/text";

const COLLECTION_NAME = "settings";
const DOCUMENT_ID = "salon-settings";

const defaultSettings: Settings = {
  salonName: "THEA SALON",
  phoneNumber: "+91 98765 43210",
  invoicePrefix: "INV",
  currencyCode: "INR",
  currencyLocale: "en-IN",
  taxRate: 0,
};

export async function getSettings(): Promise<Settings> {
  try {
    const cached = readCache<Settings>(CACHE_KEYS.settings, CACHE_TTL.settings);
    if (cached && cached.length > 0) {
      return cached[0];
    }
    const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      let salonName = data.salonName || "THEA SALON";
      if (!salonName || salonName.toLowerCase().includes("demo")) {
        salonName = "THEA SALON";
        setDoc(docRef, { salonName: "THEA SALON" }, { merge: true }).catch(() => {});
      }
      const settings = {
        ...defaultSettings,
        ...data,
        salonName,
      } as Settings;
      writeCache(CACHE_KEYS.settings, [settings]);
      return settings;
    }
    // Seed settings if not found
    await setDoc(docRef, defaultSettings);
    writeCache(CACHE_KEYS.settings, [defaultSettings]);
    return defaultSettings;
  } catch (error) {
    console.error("Error getting settings from Firestore:", error);
    return defaultSettings;
  }
}

export async function updateSettings(data: Partial<Settings>): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
    const normalizedData = { ...data };
    if (normalizedData.salonName) {
      normalizedData.salonName = toTitleCase(normalizedData.salonName);
    }
    // Sanitize any undefined properties to avoid Firestore errors
    Object.keys(normalizedData).forEach((key) => {
      const k = key as keyof typeof normalizedData;
      if (normalizedData[k] === undefined) {
        delete normalizedData[k];
      }
    });
    await setDoc(docRef, normalizedData, { merge: true });
    clearCache(CACHE_KEYS.settings);
  } catch (error) {
    console.error("Error updating settings in Firestore:", error);
    throw error;
  }
}

export function subscribeSettings(onUpdate: (settings: Settings) => void): () => void {
  getSettings().then(onUpdate).catch((err) => console.error("Error subscribing to settings:", err));
  return () => {};
}
