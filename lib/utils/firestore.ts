import type { WhatsAppCampaign } from "@/types/whatsapp";

/**
 * Defensive utility to recursively strip any 'undefined' properties before passing to Firestore.
 * Correctly preserves Firebase FieldValue sentinel objects (increment, serverTimestamp, etc.)
 */
export function sanitizeFirestoreDoc<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Preserve non-plain objects (e.g. FieldValue, Timestamp, Date)
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && proto !== Object.prototype) {
    return obj;
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      const valProto = Object.getPrototypeOf(value);
      if (valProto === null || valProto === Object.prototype) {
        // Plain JS object - recurse
        result[key] = sanitizeFirestoreDoc(value);
      } else {
        // FieldValue (increment, serverTimestamp, etc.) - keep as-is
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Safely extracts a primitive number from any value, including legacy Firestore FieldValue Sentinel maps.
 */
export function normalizeCount(val: unknown, fallback = 0): number {
  if (typeof val === "number" && !isNaN(val)) {
    return val;
  }
  if (val && typeof val === "object") {
    const obj = val as Record<string, any>;
    if (typeof obj._operand === "number") return obj._operand;
    if (typeof obj.operand === "number") return obj.operand;
  }
  if (typeof val === "string") {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Normalizes campaign data from Firestore to guarantee all count fields are primitive numbers
 * and cannot cause React runtime "Objects are not valid as a React child" errors.
 */
export function normalizeCampaignData(raw: Record<string, any>, id: string): WhatsAppCampaign {
  const parseStr = (v: unknown, fallback = ""): string => {
    if (typeof v === "string") return v;
    if (v === null || v === undefined || typeof v === "object") return fallback;
    return String(v);
  };

  return {
    id,
    name: parseStr(raw.name, "Campaign"),
    templateName: parseStr(raw.templateName, "blow_salon_campaign"),
    templateLanguage: parseStr(raw.templateLanguage, "en"),
    templateCategory: parseStr(raw.templateCategory, "MARKETING"),
    audienceType: (raw.audienceType || "ALL") as any,
    customCustomerIds: Array.isArray(raw.customCustomerIds) ? raw.customCustomerIds : [],
    status: (raw.status || "DRAFT") as any,
    totalRecipients: normalizeCount(raw.totalRecipients),
    eligibleCount: normalizeCount(raw.eligibleCount),
    excludedCount: normalizeCount(raw.excludedCount),
    sentCount: normalizeCount(raw.sentCount),
    deliveredCount: normalizeCount(raw.deliveredCount),
    readCount: normalizeCount(raw.readCount),
    failedCount: normalizeCount(raw.failedCount),
    templateVariables:
      raw.templateVariables && typeof raw.templateVariables === "object" && !Array.isArray(raw.templateVariables)
        ? raw.templateVariables
        : {},
    createdAt: parseStr(raw.createdAt, new Date().toISOString()),
    startedAt: raw.startedAt ? parseStr(raw.startedAt) : null,
    completedAt: raw.completedAt ? parseStr(raw.completedAt) : null,
    errorMessage: raw.errorMessage ? parseStr(raw.errorMessage) : null,
  };
}
