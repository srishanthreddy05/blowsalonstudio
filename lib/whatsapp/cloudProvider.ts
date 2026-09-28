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
import { logWhatsAppAction } from "./logger";

/**
 * Meta WhatsApp Cloud API Provider.
 * Server-side implementation communicating directly with Meta Graph API.
 * Compatible with Vercel Serverless / Edge-free standard Node.js runtime.
 */
export class CloudWhatsAppProvider implements IWhatsAppProvider {
  public readonly providerType = "WHATSAPP_CLOUD_API" as const;

  private apiVersion: string;
  private accessToken?: string;
  private phoneNumberId?: string;
  private businessAccountId?: string;
  private businessNumber?: string;
  private invoiceTemplateName?: string;
  private templateLanguage: string;

  constructor() {
    this.apiVersion = (process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").trim().replace(/^v?/, "v");
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
    this.businessNumber = process.env.WHATSAPP_BUSINESS_NUMBER?.trim();
    this.invoiceTemplateName = process.env.WHATSAPP_INVOICE_TEMPLATE_NAME?.trim() || "blow_salon_invoice";
    this.templateLanguage = (process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US").trim();
  }

  /**
   * Helper to classify Meta Graph API errors into standardized error categories.
   */
  private classifyMetaError(code?: number, message?: string): { errorCode: WhatsAppErrorCode; cleanMessage: string } {
    const msg = message || "WhatsApp Cloud API request failed.";

    if (code === 190 || code === 102 || code === 10) {
      return {
        errorCode: "WHATSAPP_AUTH_ERROR",
        cleanMessage: "WhatsApp authentication failed. The access token may be expired or invalid.",
      };
    }

    if (code === 131030 || code === 131042 || code === 131000 || code === 131026 || code === 131005) {
      return {
        errorCode: "WHATSAPP_PHONE_NOT_REGISTERED",
        cleanMessage: "The WhatsApp phone number is not registered or active with Meta.",
      };
    }

    if (code === 130429 || code === 80007 || code === 4) {
      return {
        errorCode: "WHATSAPP_RATE_LIMIT",
        cleanMessage: "Meta WhatsApp API rate limit reached. Please try again shortly.",
      };
    }

    if (code && code >= 132000 && code <= 132015) {
      return {
        errorCode: "WHATSAPP_TEMPLATE_ERROR",
        cleanMessage: `Meta template error: ${msg}`,
      };
    }

    return {
      errorCode: "WHATSAPP_API_ERROR",
      cleanMessage: msg,
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
        const { errorCode, cleanMessage } = this.classifyMetaError(errorInfo.code, errorInfo.message);

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
   * Sends an approved Meta WhatsApp Template Message.
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

    const lang = languageCode || this.templateLanguage || "en_US";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Validate parameters before sending to Meta Graph API
    let bodyParamCount = 0;
    if (components && Array.isArray(components)) {
      const bodyComp = components.find((c) => (c.type || "").toString().toLowerCase() === "body");
      if (bodyComp && Array.isArray(bodyComp.parameters)) {
        bodyParamCount = bodyComp.parameters.length;
      }
    }

    if (templateName === "3p_direct_integration_test_template") {
      if (bodyParamCount !== 0) {
        return {
          success: false,
          errorCode: "WHATSAPP_TEMPLATE_ERROR",
          error: `Template parameter mismatch: 3p_direct_integration_test_template expects 0 parameters but received ${bodyParamCount}.`,
        };
      }
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
        const { errorCode, cleanMessage } = this.classifyMetaError(errorInfo.code, errorInfo.message);

        logWhatsAppAction({
          provider: this.providerType,
          action: "sendTemplateMessage",
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
        action: "sendTemplateMessage",
        phone: normalized.digits,
        result: "SUCCESS",
        messageId,
      });

      return {
        success: true,
        messageId,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to dispatch template message";
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

      const allowedTemplates = new Set([
        "blow_salon_campaign",
        "blow_salon_invoice",
        "3p_direct_integration_test_template",
      ]);

      const templatesList = (data.data || [])
        .filter((t: any) => allowedTemplates.has(t.name))
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

          return {
            id: t.id || t.name,
            name: t.name,
            language: t.language,
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

    // Format {{1}} Customer name
    const customerName = (invoice.customerName || "Customer").trim();

    // Format {{2}} Invoice number
    const invoiceNumber = invoice.invoiceNumber || (invoice as any).invoiceNo || "INV";

    // Format {{3}} Invoice date
    let invoiceDate = "";
    if (invoice.billDate) {
      invoiceDate = formatDisplayDate(toLocalDateString(invoice.billDate));
    } else if (invoice.date) {
      invoiceDate = formatDisplayDate(toLocalDateString(invoice.date));
    } else {
      invoiceDate = formatDisplayDate(toLocalDateString(new Date()));
    }

    // Format {{4}} Services and retail products (NO staff names)
    const itemLines: string[] = [];
    (invoice.services || []).forEach((s: any) => {
      if (!s.isSystemService && s.serviceId !== "membership_fee") {
        const name = s.serviceName || s.service || "Service";
        const amount = Math.round(s.amount ?? Math.max(0, (Number(s.price) || 0) - (Number(s.discount) || 0)));
        itemLines.push(`${name} - ₹${amount.toLocaleString("en-IN")}`);
      }
    });
    (invoice.products || []).forEach((p: any) => {
      const name = p.productName || p.product || "Product";
      const qty = Number(p.quantity) || 1;
      const qtyStr = qty > 1 ? ` (x${qty})` : "";
      const amount = Math.round(p.amount ?? Math.max(0, (Number(p.price) || 0) * qty - (Number(p.discount) || 0)));
      itemLines.push(`${name}${qtyStr} - ₹${amount.toLocaleString("en-IN")}`);
    });
    if (invoice.totalMemberships && invoice.totalMemberships > 0) {
      itemLines.push(`Membership Enrollment - ₹${Math.round(invoice.totalMemberships).toLocaleString("en-IN")}`);
    }
    const itemsSummary = itemLines.length > 0 ? itemLines.join("\n") : "Salon Services";

    // Format {{5}} Subtotal
    const subtotal = `₹${Math.round(invoice.subtotal ?? invoice.grandTotal).toLocaleString("en-IN")}`;

    // Format {{6}} Tax
    const tax = `₹${Math.round(invoice.taxAmount ?? 0).toLocaleString("en-IN")}`;

    // Format {{7}} Total
    const total = `₹${Math.round(invoice.grandTotal).toLocaleString("en-IN")}`;

    // Format {{8}} Payment / credit / advance / balance information
    const paymentLines: string[] = [];
    const invAny = invoice as any;
    if (invAny.creditUsed && Math.round(Number(invAny.creditUsed)) > 0) {
      paymentLines.push(`Previous Credit Applied: ₹${Math.round(Number(invAny.creditUsed)).toLocaleString("en-IN")}`);
    }
    if (invoice.advanceUsed && Math.round(Number(invoice.advanceUsed)) > 0) {
      paymentLines.push(`Advance Applied: ₹${Math.round(Number(invoice.advanceUsed)).toLocaleString("en-IN")}`);
    }
    const paid = Math.round(Number(invoice.receivedAmount ?? (invoice.balanceDue ? (invoice.grandTotal - invoice.balanceDue) : invoice.grandTotal)));
    paymentLines.push(`Amount Paid: ₹${paid.toLocaleString("en-IN")}`);
    if (invoice.balanceDue && Math.round(Number(invoice.balanceDue)) > 0) {
      paymentLines.push(`Balance Due: ₹${Math.round(Number(invoice.balanceDue)).toLocaleString("en-IN")}`);
    }
    if (invAny.creditRemaining && Math.round(Number(invAny.creditRemaining)) > 0) {
      paymentLines.push(`Credit Balance: ₹${Math.round(Number(invAny.creditRemaining)).toLocaleString("en-IN")}`);
    }
    const paymentMethod = invoice.paymentMethod || "UPI";
    paymentLines.push(`Payment Method: ${paymentMethod}`);
    const paymentInfo = paymentLines.join("\n");

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
      this.templateLanguage,
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

    // If template fails, log and return clean failure
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
