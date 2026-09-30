/**
 * Centralized WhatsApp Template Configuration Registry for Meta WhatsApp Cloud API.
 * 
 * Official BLOW SALON Approved Templates:
 * 1. blow_salon_invoice (Category: Utility, Language: "en", 8 Body Parameters)
 * 2. blow_salon_campaign (Category: Marketing, Language: "en", 2 Body Parameters)
 * 3. 3p_direct_integration_test_template (Category: Utility, Language: "en_US", 0 Body Parameters)
 * 
 * Unexposed / Test Templates:
 * 4. hello_world (Language: "en_US", NEVER exposed in BLOW SALON UI)
 */

export interface TemplateDefinition {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  expectedParamCount: number;
  exposedInUI: boolean;
  purpose?: "invoice" | "campaign" | "test";
  description?: string;
}

export const META_WHATSAPP_TEMPLATES: Record<string, TemplateDefinition> = {
  blow_salon_invoice: {
    name: "blow_salon_invoice",
    language: "en",
    category: "UTILITY",
    expectedParamCount: 8,
    exposedInUI: true,
    purpose: "invoice",
    description: "BLOW SALON official invoice receipt template (8 parameters)",
  },
  blow_salon_campaign: {
    name: "blow_salon_campaign",
    language: "en",
    category: "MARKETING",
    expectedParamCount: 2,
    exposedInUI: true,
    purpose: "campaign",
    description: "BLOW SALON promotional campaign template (2 parameters)",
  },
  "3p_direct_integration_test_template": {
    name: "3p_direct_integration_test_template",
    language: "en_US",
    category: "UTILITY",
    expectedParamCount: 0,
    exposedInUI: true,
    purpose: "test",
    description: "Meta integration test template (0 parameters)",
  },
  hello_world: {
    name: "hello_world",
    language: "en_US",
    category: "UTILITY",
    expectedParamCount: 0,
    exposedInUI: false,
    description: "Default Meta test template (hidden from UI)",
  },
};

/**
 * Returns the exact centralized language code for a template name.
 * For registered official templates, enforce their exact Meta language code
 * so language cannot accidentally become en_US for invoice or campaign templates.
 */
export function getTemplateLanguage(templateName: string, fallbackLanguage?: string): string {
  const registered = META_WHATSAPP_TEMPLATES[templateName];
  if (registered) {
    return registered.language;
  }
  return fallbackLanguage?.trim() || "en";
}

/**
 * Returns the expected body parameter count for a template.
 */
export function getTemplateExpectedParamCount(templateName: string): number | null {
  const registered = META_WHATSAPP_TEMPLATES[templateName];
  if (registered) {
    return registered.expectedParamCount;
  }
  return null;
}

/**
 * Checks if a template should be visible in the user interface.
 */
export function isTemplateExposedInUI(templateName: string): boolean {
  const registered = META_WHATSAPP_TEMPLATES[templateName];
  if (!registered) {
    return false;
  }
  return registered.exposedInUI;
}

/**
 * Retrieves the template configuration definition.
 */
export function getTemplateDefinition(templateName: string): TemplateDefinition | undefined {
  return META_WHATSAPP_TEMPLATES[templateName];
}

/**
 * Sanitizes template variables for Meta WhatsApp Cloud API compliance.
 * - Converts null/undefined to fallback
 * - Removes \r, \n, \t
 * - Replaces multiple consecutive spaces with a single space
 * - Trims whitespace
 * - Ensures non-empty return value (never returns empty string)
 */
export function sanitizeTemplateVariable(val: unknown, fallback = "-"): string {
  if (val === null || val === undefined) {
    return fallback;
  }
  let str = String(val);
  // Remove \r, \n, \t and replace with space
  str = str.replace(/[\r\n\t]+/g, " ");
  // Replace multiple consecutive whitespace with a single space
  str = str.replace(/\s{2,}/g, " ");
  // Trim leading and trailing whitespace
  str = str.trim();
  if (!str) {
    return fallback;
  }
  return str;
}

