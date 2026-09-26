import type { Invoice } from "@/types/invoice";
import type {
  IWhatsAppProvider,
  ProviderStatusResult,
  SendMessageResult,
  SendInvoiceResult,
} from "./types";
import { generateWhatsAppReceiptText } from "../utils/whatsappReceipt";
import { normalizePhoneNumber } from "../utils/phone";

/**
 * Future Provider: Official WhatsApp Business Cloud API.
 * Configured via environment variables (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID).
 */
export class CloudWhatsAppProvider implements IWhatsAppProvider {
  public readonly providerType = "WHATSAPP_CLOUD_API" as const;

  private accessToken?: string;
  private phoneNumberId?: string;

  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  public async connect(): Promise<void> {
    // Cloud API uses bearer token authentication, always ready if credentials are configured
  }

  public async disconnect(): Promise<void> {
    // Cloud API has no persistent web socket session to disconnect
  }

  public async getStatus(): Promise<ProviderStatusResult> {
    const isConfigured = Boolean(this.accessToken && this.phoneNumberId);
    return {
      status: isConfigured ? "CONNECTED" : "DISCONNECTED",
      provider: this.providerType,
      connectedNumber: process.env.WHATSAPP_BUSINESS_NUMBER || undefined,
      errorMessage: isConfigured ? undefined : "WhatsApp Cloud API credentials not configured in environment variables.",
    };
  }

  public async sendMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
    const status = await this.getStatus();
    if (status.status !== "CONNECTED") {
      return {
        success: false,
        error: "WhatsApp Cloud API is not configured.",
      };
    }

    try {
      const normalized = normalizePhoneNumber(phoneNumber);
      const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;

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
          text: { preview_url: false, body: message },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          success: false,
          error: data.error?.message || "Cloud API message dispatch failed.",
        };
      }

      return {
        success: true,
        messageId: data.messages?.[0]?.id,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error calling WhatsApp Cloud API";
      return {
        success: false,
        error: msg,
      };
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
        error: "Customer does not have a valid WhatsApp phone number.",
        recipientPhone: targetPhone,
      };
    }

    const messageText = generateWhatsAppReceiptText(invoice);
    const sendResult = await this.sendMessage(normalized.digits, messageText);

    if (sendResult.success) {
      return {
        success: true,
        status: "SENT",
        messageId: sendResult.messageId,
        formattedMessage: messageText,
        recipientPhone: normalized.display,
      };
    } else {
      return {
        success: false,
        status: "FAILED",
        error: sendResult.error || "Failed to deliver Cloud API WhatsApp receipt.",
        formattedMessage: messageText,
        recipientPhone: normalized.display,
      };
    }
  }
}
