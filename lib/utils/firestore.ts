import type { WhatsAppCampaign } from "@/types/whatsapp";

/**
 * Defensive utility to recursively strip any 'undefined' properties before passing to Firestore.
 * Recursively sanitizes arrays and plain objects at all nesting levels.
 * Correctly preserves Firebase FieldValue sentinel objects (increment, serverTimestamp, etc.), Dates, and nulls.
 */
export function sanitizeFirestoreValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    const sanitizedArr: unknown[] = [];
    for (const item of value) {
      if (item !== undefined) {
        const sanitizedItem = sanitizeFirestoreValue(item);
        if (sanitizedItem !== undefined) {
          sanitizedArr.push(sanitizedItem);
        }
      }
    }
    return sanitizedArr;
  }

  // Preserve non-plain objects (e.g. FieldValue, Timestamp, Date)
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) {
    return value;
  }

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) {
      continue;
    }
    const sanitizedVal = sanitizeFirestoreValue(val);
    if (sanitizedVal !== undefined) {
      result[key] = sanitizedVal;
    }
  }
  return result;
}

export function sanitizeFirestoreDoc<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  return sanitizeFirestoreValue(obj) as T;
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
    headerImageUrl: raw.headerImageUrl ? parseStr(raw.headerImageUrl) : null,
    headerImageMetadata:
      raw.headerImageMetadata && typeof raw.headerImageMetadata === "object" && !Array.isArray(raw.headerImageMetadata)
        ? raw.headerImageMetadata
        : null,
    createdAt: parseStr(raw.createdAt, new Date().toISOString()),
    startedAt: raw.startedAt ? parseStr(raw.startedAt) : null,
    completedAt: raw.completedAt ? parseStr(raw.completedAt) : null,
    errorMessage: raw.errorMessage ? parseStr(raw.errorMessage) : null,
  };
}
