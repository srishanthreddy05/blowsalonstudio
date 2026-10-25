/**
 * BLOW SALON — Centralized WhatsApp Application-Level Pricing & Rate Configuration
 * 
 * Configured application-level message rates:
 * - Utility message: ₹0.15 per message (invoices, transaction alerts, reminders)
 * - Marketing message: ₹0.90 per message (promotions, offers, seasonal campaigns)
 * 
 * Note: These are BLOW SALON's configured application rates, not Meta's internal charges.
 */

export const WHATSAPP_APPLICATION_RATES = {
  UTILITY: 0.15,
  MARKETING: 0.90,
} as const;

export type WhatsAppMessageCategory = "UTILITY" | "MARKETING";

export interface CategoryPricingDetails {
  category: WhatsAppMessageCategory;
  ratePerMessage: number;
  label: string;
  description: string;
  examples: string[];
}

export const WHATSAPP_CATEGORY_CONFIG: Record<WhatsAppMessageCategory, CategoryPricingDetails> = {
  UTILITY: {
    category: "UTILITY",
    ratePerMessage: WHATSAPP_APPLICATION_RATES.UTILITY,
    label: "Utility",
    description: "Transactional communications, invoice receipts, appointment reminders, and account alerts.",
    examples: [
      "blow_salon_invoices",
      "blow_salon_appointment_confirmation",
      "blow_salon_appointment_reminder",
    ],
  },
  MARKETING: {
    category: "MARKETING",
    ratePerMessage: WHATSAPP_APPLICATION_RATES.MARKETING,
    label: "Marketing",
    description: "Promotional campaigns, seasonal discounts, festival offers, and customer retention broadcasts.",
    examples: ["blow_salon_campaign", "blow_salon_offer"],
  },
};

/**
 * Determines message category (UTILITY vs MARKETING) from message parameters.
 */
export function getMessageCategory(
  messageType?: string | null,
  templateName?: string | null,
  templateCategory?: string | null
): WhatsAppMessageCategory {
  if (templateCategory) {
    const catUpper = templateCategory.toUpperCase();
    if (catUpper === "UTILITY") return "UTILITY";
    if (catUpper === "MARKETING") return "MARKETING";
  }

  const tName = (templateName || "").toLowerCase();
  const mType = (messageType || "").toUpperCase();

  if (
    mType === "INVOICE_RECEIPT" ||
    mType === "APPOINTMENT_REMINDER" ||
    mType === "APPOINTMENT_CONFIRMATION" ||
    tName.includes("invoice") ||
    tName.includes("reminder") ||
    tName.includes("confirmation") ||
    tName === "blow_salon_invoices" ||
    tName === "blow_salon_appointment_confirmation" ||
    tName === "blow_salon_appointment_reminder"
  ) {
    return "UTILITY";
  }

  return "MARKETING";
}

/**
 * Calculates estimated application usage charge for a given category and count.
 */
export function calculateCategoryUsageCharge(
  category: WhatsAppMessageCategory,
  count: number
): number {
  const rate = WHATSAPP_APPLICATION_RATES[category] ?? 0;
  return Math.round(count * rate * 100) / 100;
}
