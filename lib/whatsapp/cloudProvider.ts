import type { Invoice } from "@/types/invoice";
import type {
  IWhatsAppProvider,
  ProviderStatusResult,
  SendMessageResult,
  SendInvoiceResult,
} from "./types";
import type { WhatsAppErrorCode } from "@/types/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { formatDisplayDate, toLocalDateString } from "@/lib/utils/date";
import { logWhatsAppAction, maskPhoneNumber } from "./logger";
import {
  getTemplateLanguage,
  isTemplateExposedInUI,
  sanitizeTemplateVariable,
  META_WHATSAPP_TEMPLATES,
} from "./templateRegistry";

/**
 * Meta WhatsApp Cloud API Provider.
 * Server-side implementation communicating directly with Meta Graph API.
 * Uses centralized template registry for exact language codes and safe parameter logging.
 */
export class CloudWhatsAppProvider implements IWhatsAppProvider {
  public readonly providerType = "WHATSAPP_CLOUD_API" as const;

  private apiVersion: string;
  private accessToken?: string;
  private phoneNumberId?: string;
  private businessAccountId?: string;
  private businessNumber?: string;
  private invoiceTemplateName: string;

  constructor() {
    this.apiVersion = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^v?/, "v");
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "1329685360226264";
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || "1755242905734759";
    this.businessNumber = process.env.WHATSAPP_BUSINESS_NUMBER?.trim();
    this.invoiceTemplateName = "blow_salon_invoice";
  }

  /**
   * Helper to classify Meta Graph API errors into standardized error categories.
   * Extracts error_data.details and error_user_msg if present for deep debugging.
   */
  private classifyMetaError(
    code?: number,
    message?: string,
    rawError?: Record<string, any>
  ): { errorCode: WhatsAppErrorCode; cleanMessage: string } {
    const msg = message || "WhatsApp Cloud API request failed.";
    const errorData = rawError?.error_data || (rawError as any)?.error?.error_data;
    const details = errorData?.details || rawError?.error_user_msg || (rawError as any)?.error_user_title;
    const detailsSuffix = details ? ` (Meta Details: ${details})` : "";

    if (code === 190 || code === 102 || code === 10) {
      return {
        errorCode: "WHATSAPP_AUTH_ERROR",
        cleanMessage: `WhatsApp authentication failed: ${msg}${detailsSuffix}`,
      };
    }

    if (code === 131030 || code === 131042 || code === 131000 || code === 131026 || code === 131005) {
      return {
        errorCode: "WHATSAPP_PHONE_NOT_REGISTERED",
        cleanMessage: `The WhatsApp phone number is not registered or active with Meta: ${msg}${detailsSuffix}`,
      };
    }

    if (code === 130429 || code === 80007 || code === 4) {
      return {
        errorCode: "WHATSAPP_RATE_LIMIT",
        cleanMessage: `Meta WhatsApp API rate limit reached: ${msg}${detailsSuffix}`,
      };
    }

    if (code && code >= 132000 && code <= 132099) {
      return {
        errorCode: "WHATSAPP_TEMPLATE_ERROR",
        cleanMessage: `Meta template error (#${code}): ${msg}${detailsSuffix}`,
      };
    }

    return {
      errorCode: "WHATSAPP_API_ERROR",
      cleanMessage: `${msg}${detailsSuffix}`,
    };
  }

  public async connect(): Promise<void> {
    // Cloud API uses HTTP bearer tokens — validation happens during getStatus/sendMessage
    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error("WhatsApp Cloud API credentials not configured in environment variables.");
    }
  }

  public async disconnect(): Promise<void> {
    // No persistent connection to close
  }

  public async getStatus(): Promise<ProviderStatusResult> {
    const isConfigured = Boolean(this.accessToken && this.phoneNumberId);

    if (!isConfigured) {
      return {
        status: "DISCONNECTED",
        provider: this.providerType,
        errorCode: "WHATSAPP_NOT_CONFIGURED",
        errorMessage: "WhatsApp Cloud API not configured. Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID.",
      };
    }

    return {
      status: "CONNECTED",
      provider: this.providerType,
      connectedNumber: this.businessNumber || undefined,
      errorMessage: undefined,
    };
  }

  public async sendMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
    const status = await this.getStatus();
    if (status.status !== "CONNECTED" || !this.accessToken || !this.phoneNumberId) {
      logWhatsAppAction({
        provider: this.providerType,
        action: "sendMessage",
        phone: phoneNumber,
        result: "UNCONFIGURED",
        errorCode: "WHATSAPP_NOT_CONFIGURED",
        error: "WhatsApp Cloud API is not configured.",
      });
      return {
        success: false,
        errorCode: "WHATSAPP_NOT_CONFIGURED",
        error: "WhatsApp Cloud API is not configured.",
      };
    }

    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized.isValid) {
      return {
        success: false,
        errorCode: "WHATSAPP_API_ERROR",
        error: `Invalid phone number format: "${phoneNumber}".`,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalized.digits,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorInfo = data.error || {};
        const { errorCode, cleanMessage } = this.classifyMetaError(errorInfo.code, errorInfo.message, errorInfo);

        logWhatsAppAction({
          provider: this.providerType,
          action: "sendMessage",
          phone: normalized.digits,
          result: "FAILED",
          errorCode,
          error: errorInfo.message || cleanMessage,
        });

        return {
          success: false,
          errorCode,
          error: cleanMessage,
        };
      }

      const messageId = data.messages?.[0]?.id || null;

      logWhatsAppAction({
        provider: this.providerType,
        action: "sendMessage",
        phone: normalized.digits,
        result: "SUCCESS",
        messageId,
      });

      return {
        success: true,
        messageId,
      };
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const errorMsg = isAbort ? "WhatsApp Cloud API request timed out (10s)." : err instanceof Error ? err.message : "Error calling Meta Cloud API";

      logWhatsAppAction({
        provider: this.providerType,
        action: "sendMessage",
        phone: normalized.digits,
        result: "FAILED",
        errorCode: "WHATSAPP_API_ERROR",
        error: errorMsg,
      });

      return {
        success: false,
        errorCode: "WHATSAPP_API_ERROR",
        error: errorMsg,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Helper to inspect and debug template parameters safely without exposing secrets.
   */
  private logTemplateDebugInspection(
    templateName: string,
    lang: string,
    parameters: Array<{ type?: string; text?: string }>
  ) {
    console.log("\n================ [Meta WhatsApp Template Inspection] ================");
    console.log(`Template:\n${templateName}\n`);
    console.log(`Language:\n${lang}\n`);
    console.log(`Parameter count:\n${parameters.length}\n`);
    console.log("Parameter values:");

    let hasNewline = false;
    let hasTab = false;
    let hasEmpty = false;
    let hasExcessiveSpaces = false;

    parameters.forEach((p, idx) => {
      const val = p.text ?? "";
      if (/[\r\n]/.test(val)) hasNewline = true;
      if (/\t/.test(val)) hasTab = true;
      if (val.length === 0) hasEmpty = true;
      if (/\s{2,}/.test(val)) hasExcessiveSpaces = true;

      console.log(`${idx + 1}: ${val}`);
    });

    console.log("\nParameter Validation Details:");
    console.log(`- Contains newline: ${hasNewline ? "⚠️ YES (INVALID for single-line variable)" : "None (Clean)"}`);
    console.log(`- Contains tab: ${hasTab ? "⚠️ YES (INVALID)" : "None (Clean)"}`);
    console.log(`- Contains empty string: ${hasEmpty ? "⚠️ YES (INVALID - Meta requires non-empty text)" : "None (Clean)"}`);
    console.log(`- Excessive consecutive spaces: ${hasExcessiveSpaces ? "⚠️ YES" : "None (Clean)"}`);
    console.log("======================================================================\n");
  }

  /**
   * Sends an approved Meta WhatsApp Template Message.
   * Enforces exact template language codes from centralized registry and sanitizes all variables.
   */
  public async sendTemplateMessage(
    phoneNumber: string,
    templateName: string,
    languageCode?: string,
    components?: Array<Record<string, unknown>>
  ): Promise<SendMessageResult> {
    const status = await this.getStatus();
    if (status.status !== "CONNECTED" || !this.accessToken || !this.phoneNumberId) {
      return {
        success: false,
        errorCode: "WHATSAPP_NOT_CONFIGURED",
        error: "WhatsApp Cloud API is not configured.",
      };
    }

    const normalized = normalizePhoneNumber(phoneNumber);
    if (!normalized.isValid) {
      return {
        success: false,
        errorCode: "WHATSAPP_API_ERROR",
        error: `Invalid phone number format: "${phoneNumber}".`,
      };
    }

    // Resolve exact template language from centralized registry
    const lang = getTemplateLanguage(templateName, languageCode);

    // Validate parameters before sending to Meta Graph API
    let bodyParameters: Array<{ type: string; text: string }> = [];
    if (components && Array.isArray(components)) {
      const bodyComp = components.find((c) => (c.type || "").toString().toLowerCase() === "body");
      if (bodyComp && Array.isArray(bodyComp.parameters)) {
        // Sanitize every body parameter to guarantee no newlines, tabs, or empty strings
        bodyParameters = bodyComp.parameters.map((p: any) => ({
          type: "text",
          text: sanitizeTemplateVariable(p.text, "-"),
        }));
        bodyComp.parameters = bodyParameters;
      }
    }

    const bodyParamCount = bodyParameters.length;

    if (templateName === "3p_direct_integration_test_template") {
      if (bodyParamCount !== 0) {
        return {
          success: false,
          errorCode: "WHATSAPP_TEMPLATE_ERROR",
          error: `Template parameter mismatch: 3p_direct_integration_test_template expects 0 parameters but received ${bodyParamCount}.`,
        };
      }
      // Guarantee zero components sent for 3p_direct_integration_test_template
      components = undefined;
    } else if (templateName === "blow_salon_invoice") {
      if (bodyParamCount !== 8) {
        return {
          success: false,
          errorCode: "WHATSAPP_TEMPLATE_ERROR",
          error: `Template parameter mismatch: blow_salon_invoice expects 8 parameters but received ${bodyParamCount}.`,
        };
      }
    } else if (templateName === "blow_salon_campaign") {
      if (bodyParamCount !== 2) {
        return {
          success: false,
          errorCode: "WHATSAPP_TEMPLATE_ERROR",
          error: `Template parameter mismatch: blow_salon_campaign expects 2 parameters but received ${bodyParamCount}.`,
        };
      }
    }

    // Safe debug inspection log (NEVER logs access tokens)
    this.logTemplateDebugInspection(templateName, lang, bodyParameters);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

      const payload: Record<string, unknown> = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalized.digits,
        type: "template",
        template: {
          name: templateName,
          language: { code: lang },
          ...(components && components.length > 0 ? { components } : {}),
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorInfo = data.error || {};
        const { errorCode, cleanMessage } = this.classifyMetaError(errorInfo.code, errorInfo.message, errorInfo);

        logWhatsAppAction({
          provider: this.providerType,
          action: "sendTemplateMessage",
          phone: normalized.digits,
          templateName,
          templateLanguage: lang,
          paramCount: bodyParamCount,
          result: "FAILED",
          errorCode,
          error: cleanMessage,
        });

        return {
          success: false,
          errorCode,
          error: cleanMessage,
        };
      }

      const messageId = data.messages?.[0]?.id || null;

      logWhatsAppAction({
        provider: this.providerType,
        action: "sendTemplateMessage",
        phone: normalized.digits,
        templateName,
        templateLanguage: lang,
        paramCount: bodyParamCount,
        result: "SUCCESS",
        messageId,
      });

      return {
        success: true,
        messageId,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to dispatch template message";

      logWhatsAppAction({
        provider: this.providerType,
        action: "sendTemplateMessage",
        phone: normalized.digits,
        templateName,
        templateLanguage: lang,
        paramCount: bodyParamCount,
        result: "FAILED",
        errorCode: "WHATSAPP_TEMPLATE_ERROR",
        error: errorMsg,
      });

      return {
        success: false,
        errorCode: "WHATSAPP_TEMPLATE_ERROR",
        error: errorMsg,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Retrieves message templates from Meta Cloud API (WABA).
   * Only returns the official BLOW SALON approved templates.
   * Explicitly excludes 'hello_world' and any unapproved templates from the UI.
   */
  public async getTemplates(): Promise<any[]> {
    if (!this.accessToken) {
      return [];
    }
    const wabaId = this.businessAccountId || "1755242905734759";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${wabaId}/message_templates?limit=100`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorInfo = data.error || {};
        console.warn("[WhatsApp Cloud Provider] Could not fetch templates from Meta:", errorInfo.message || response.statusText);
        return [];
      }

      const templatesList = (data.data || [])
        .filter((t: any) => isTemplateExposedInUI(t.name))
        .map((t: any) => {
          let bodyText = "";
          let headerText = "";
          let footerText = "";
          let variableCount = 0;
          const variableIndices = new Set<number>();

          if (Array.isArray(t.components)) {
            for (const comp of t.components) {
              if (comp.type === "BODY") {
                bodyText = comp.text || "";
                const matches = bodyText.match(/\{\{(\d+)\}\}/g);
                if (matches) {
                  for (const m of matches) {
                    const num = parseInt(m.replace(/\D/g, ""), 10);
                    if (!isNaN(num)) {
                      variableIndices.add(num);
                    }
                  }
                }
              } else if (comp.type === "HEADER") {
                headerText = comp.text || "";
              } else if (comp.type === "FOOTER") {
                footerText = comp.text || "";
              }
            }
          }

          variableCount = t.name === "3p_direct_integration_test_template" ? 0 : variableIndices.size;
          const variableKeys = Array.from(variableIndices).sort((a, b) => a - b).map(String);

          // Use exact language code from centralized registry
          const langCode = getTemplateLanguage(t.name, t.language);

          return {
            id: t.id || t.name,
            name: t.name,
            language: langCode,
            status: t.status,
            category: t.category,
            components: t.components || [],
            bodyText,
            headerText,
            footerText,
            variableCount,
            variableKeys,
          };
        });

      return templatesList;
    } catch (err: unknown) {
      console.warn("[WhatsApp Cloud Provider] Template fetch error:", err instanceof Error ? err.message : err);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Formats and delivers the official BLOW SALON invoice receipt template.
   * Guarantees 8 single-line sanitized parameters with no staff names and no independent total recalculations.
   */
  public async sendInvoiceReceipt(
    invoice: Invoice,
    overridePhone?: string
  ): Promise<SendInvoiceResult> {
    const targetPhone = overridePhone || invoice.customerPhone || "";
    const normalized = normalizePhoneNumber(targetPhone);

    if (!normalized.isValid) {
      return {
        success: false,
        status: "NOT_SENT",
        errorCode: "WHATSAPP_API_ERROR",
        error: "Customer does not have a valid WhatsApp phone number.",
        recipientPhone: targetPhone,
      };
    }

    const currentStatus = await this.getStatus();
    if (currentStatus.status !== "CONNECTED") {
      logWhatsAppAction({
        provider: this.providerType,
        action: "sendInvoiceReceipt",
        phone: normalized.digits,
        invoiceNumber: invoice.invoiceNumber,
        result: "UNCONFIGURED",
        errorCode: currentStatus.errorCode || "WHATSAPP_NOT_CONFIGURED",
        error: currentStatus.errorMessage,
      });

      return {
        success: false,
        status: "NOT_SENT",
        errorCode: currentStatus.errorCode || "WHATSAPP_NOT_CONFIGURED",
        error: currentStatus.errorMessage || "WhatsApp Cloud API is not configured.",
        recipientPhone: normalized.display,
      };
    }

    // Automatic invoice receipt must ALWAYS use blow_salon_invoice
    const templateNameToUse = this.invoiceTemplateName || "blow_salon_invoice";
    const templateLang = getTemplateLanguage(templateNameToUse); // Guaranteed "en"

    // Format {{1}} Customer name (sanitized, non-empty)
    const customerName = sanitizeTemplateVariable(invoice.customerName || "Customer", "Customer");

    // Format {{2}} Invoice number (sanitized, non-empty)
    const invoiceNumber = sanitizeTemplateVariable(
      invoice.invoiceNumber || (invoice as any).invoiceNo || "INV",
      "INV"
    );

    // Format {{3}} Invoice date (sanitized, non-empty)
    let rawDate = "";
    if (invoice.billDate) {
      rawDate = formatDisplayDate(toLocalDateString(invoice.billDate));
    } else if (invoice.date) {
      rawDate = formatDisplayDate(toLocalDateString(invoice.date));
    } else {
      rawDate = formatDisplayDate(toLocalDateString(new Date()));
    }
    const invoiceDate = sanitizeTemplateVariable(rawDate, formatDisplayDate(toLocalDateString(new Date())));

    // Format {{4}} Services and retail products (NO staff names, single-line joined by " | ")
    const itemLines: string[] = [];
    (invoice.services || []).forEach((s: any) => {
      if (!s.isSystemService && s.serviceId !== "membership_fee") {
        const name = sanitizeTemplateVariable(s.serviceName || s.service || "Service", "Service");
        const amount = Math.round(s.amount ?? Math.max(0, (Number(s.price) || 0) - (Number(s.discount) || 0)));
        itemLines.push(`${name} - Rs. ${amount.toLocaleString("en-IN")}`);
      }
    });
    (invoice.products || []).forEach((p: any) => {
      const name = sanitizeTemplateVariable(p.productName || p.product || "Product", "Product");
      const qty = Number(p.quantity) || 1;
      const qtyStr = qty > 1 ? ` (x${qty})` : "";
      const amount = Math.round(p.amount ?? Math.max(0, (Number(p.price) || 0) * qty - (Number(p.discount) || 0)));
      itemLines.push(`${name}${qtyStr} - Rs. ${amount.toLocaleString("en-IN")}`);
    });
    if (invoice.totalMemberships && invoice.totalMemberships > 0) {
      itemLines.push(`Membership Enrollment - Rs. ${Math.round(invoice.totalMemberships).toLocaleString("en-IN")}`);
    }
    const itemsRaw = itemLines.length > 0 ? itemLines.join(" | ") : "Salon Services";
    const itemsSummary = sanitizeTemplateVariable(itemsRaw, "Salon Services");

    // Format {{5}} Subtotal (from actual saved invoice, single-line)
    const subtotalVal = invoice.subtotal !== undefined && invoice.subtotal !== null ? invoice.subtotal : invoice.grandTotal;
    const subtotal = sanitizeTemplateVariable(`Rs. ${Math.round(Number(subtotalVal) || 0).toLocaleString("en-IN")}`, "Rs. 0");

    // Format {{6}} Tax (from actual saved invoice, single-line)
    const taxVal = invoice.taxAmount !== undefined && invoice.taxAmount !== null ? invoice.taxAmount : 0;
    const tax = sanitizeTemplateVariable(`Rs. ${Math.round(Number(taxVal) || 0).toLocaleString("en-IN")}`, "Rs. 0");

    // Format {{7}} Total (from actual saved invoice, single-line)
    const totalVal = invoice.grandTotal !== undefined && invoice.grandTotal !== null ? invoice.grandTotal : 0;
    const total = sanitizeTemplateVariable(`Rs. ${Math.round(Number(totalVal) || 0).toLocaleString("en-IN")}`, "Rs. 0");

    // Format {{8}} Payment / credit / advance / balance information (single-line joined by ", ")
    const paymentLines: string[] = [];
    const invAny = invoice as any;
    if (invAny.creditUsed && Math.round(Number(invAny.creditUsed)) > 0) {
      paymentLines.push(`Previous Credit Applied: Rs. ${Math.round(Number(invAny.creditUsed)).toLocaleString("en-IN")}`);
    }
    if (invoice.advanceUsed && Math.round(Number(invoice.advanceUsed)) > 0) {
      paymentLines.push(`Advance Applied: Rs. ${Math.round(Number(invoice.advanceUsed)).toLocaleString("en-IN")}`);
    }
    const paid = Math.round(Number(invoice.receivedAmount ?? (invoice.balanceDue ? (invoice.grandTotal - invoice.balanceDue) : invoice.grandTotal)));
    paymentLines.push(`Amount Paid: Rs. ${paid.toLocaleString("en-IN")}`);
    if (invoice.balanceDue && Math.round(Number(invoice.balanceDue)) > 0) {
      paymentLines.push(`Balance Due: Rs. ${Math.round(Number(invoice.balanceDue)).toLocaleString("en-IN")}`);
    }
    if (invAny.creditRemaining && Math.round(Number(invAny.creditRemaining)) > 0) {
      paymentLines.push(`Credit Balance: Rs. ${Math.round(Number(invAny.creditRemaining)).toLocaleString("en-IN")}`);
    }
    const paymentMethod = sanitizeTemplateVariable(invoice.paymentMethod || "UPI", "UPI");
    paymentLines.push(`Payment Method: ${paymentMethod}`);

    const paymentRaw = paymentLines.join(", ");
    const paymentInfo = sanitizeTemplateVariable(
      paymentRaw,
      `Amount Paid: Rs. ${paid.toLocaleString("en-IN")}, Payment Method: ${paymentMethod}`
    );

    // Exactly 8 parameters mapped for blow_salon_invoice
    const bodyParameters = [
      { type: "text", text: customerName },
      { type: "text", text: invoiceNumber },
      { type: "text", text: invoiceDate },
      { type: "text", text: itemsSummary },
      { type: "text", text: subtotal },
      { type: "text", text: tax },
      { type: "text", text: total },
      { type: "text", text: paymentInfo },
    ];

    const templateResult = await this.sendTemplateMessage(
      normalized.digits,
      templateNameToUse,
      templateLang,
      [
        {
          type: "body",
          parameters: bodyParameters,
        },
      ]
    );

    if (templateResult.success) {
      logWhatsAppAction({
        provider: this.providerType,
        action: "sendInvoiceReceipt[Template]",
        phone: normalized.digits,
        invoiceNumber: invoice.invoiceNumber,
        templateName: templateNameToUse,
        templateLanguage: templateLang,
        paramCount: 8,
        messageId: templateResult.messageId,
        result: "SUCCESS",
      });

      return {
        success: true,
        status: "SENT",
        messageId: templateResult.messageId,
        formattedMessage: `[Meta Template: ${templateNameToUse}]`,
        recipientPhone: normalized.display,
      };
    }

    // If template fails, log and return clean failure with exact Meta details
    return {
      success: false,
      status: "FAILED",
      errorCode: templateResult.errorCode,
      error: templateResult.error || "Failed to deliver WhatsApp template receipt.",
      recipientPhone: normalized.display,
    };
  }
}

export { CloudWhatsAppProvider as MetaCloudWhatsAppProvider };
