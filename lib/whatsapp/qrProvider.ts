import type { Invoice } from "@/types/invoice";
import type {
  IWhatsAppProvider,
  ProviderStatusResult,
  SendMessageResult,
  SendInvoiceResult,
} from "./types";
import { generateWhatsAppReceiptText } from "@/lib/utils/whatsappReceipt";
import { normalizePhoneNumber } from "@/lib/utils/phone";

export class QRWhatsAppProvider implements IWhatsAppProvider {
  public readonly providerType = "QR_WHATSAPP" as const;

  private backendUrl?: string;
  private backendSecret?: string;

  constructor() {
    this.backendUrl = (
      process.env.WHATSAPP_BACKEND_URL ||
      process.env.WHATSAPP_SERVER_URL ||
      process.env.NEXT_PUBLIC_WHATSAPP_BACKEND_URL ||
      ""
    ).trim().replace(/\/+$/, "");
    this.backendSecret = process.env.WHATSAPP_SERVICE_SECRET;
  }

  private get isServerless(): boolean {
    return Boolean(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
    );
  }

  private async fetchBackend(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.backendUrl) {
      throw new Error("WHATSAPP_BACKEND_URL is not configured.");
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.backendSecret ? { "x-api-key": this.backendSecret } : {}),
      ...((options.headers as Record<string, string>) || {}),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `${this.backendUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async connect(): Promise<void> {
    if (this.backendUrl) {
      try {
        const res = await this.fetchBackend("/api/connect", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `WhatsApp backend service returned HTTP ${res.status}`);
        }
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to connect to WhatsApp backend";
        console.error("[QR WhatsApp Provider] Backend connect error:", msg);
        throw new Error(msg);
      }
    }

    if (this.isServerless) {
      throw new Error(
        "Direct WhatsApp Web session requires a persistent Node process. Please configure WHATSAPP_BACKEND_URL to link your WhatsApp backend service."
      );
    }

    // Local in-process fallback
    const { baileysManager } = await import("./baileysManager");
    await baileysManager.connect();
  }

  public async disconnect(): Promise<void> {
    if (this.backendUrl) {
      try {
        const res = await this.fetchBackend("/api/disconnect", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `WhatsApp backend service returned HTTP ${res.status}`);
        }
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to disconnect WhatsApp backend";
        console.error("[QR WhatsApp Provider] Backend disconnect error:", msg);
        throw new Error(msg);
      }
    }

    if (this.isServerless) {
      return;
    }

    const { baileysManager } = await import("./baileysManager");
    await baileysManager.disconnect();
  }

  public async getStatus(): Promise<ProviderStatusResult> {
    if (this.backendUrl) {
      try {
        const res = await this.fetchBackend("/api/status", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          return {
            status: data.status || "DISCONNECTED",
            provider: this.providerType,
            connectedNumber: data.connectedNumber || undefined,
            qrCode: data.qrCode || undefined,
            errorMessage: data.errorMessage || undefined,
          };
        } else {
          return {
            status: "DISCONNECTED",
            provider: this.providerType,
            errorMessage: `WhatsApp backend service unreachable (HTTP ${res.status}).`,
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Cannot reach WhatsApp backend service";
        console.error("[QR WhatsApp Provider] Backend status error:", msg);
        return {
          status: "DISCONNECTED",
          provider: this.providerType,
          errorMessage: "WhatsApp service is unavailable. Please verify the WhatsApp backend server is running.",
        };
      }
    }

    if (this.isServerless) {
      return {
        status: "DISCONNECTED",
        provider: this.providerType,
        errorMessage: "WhatsApp backend service is unavailable. Set WHATSAPP_BACKEND_URL in Vercel to connect.",
      };
    }

    try {
      const { baileysManager } = await import("./baileysManager");
      const statusInfo = await baileysManager.getStatus();
      return {
        status: statusInfo.status,
        provider: this.providerType,
        connectedNumber: statusInfo.connectedNumber,
        qrCode: statusInfo.qrCode,
        errorMessage: statusInfo.errorMessage,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get local WhatsApp status";
      console.error("[QR WhatsApp Provider] Local status error:", msg);
      return {
        status: "DISCONNECTED",
        provider: this.providerType,
        errorMessage: msg,
      };
    }
  }

  public async sendMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
    if (this.backendUrl) {
      try {
        const res = await this.fetchBackend("/api/send-message", {
          method: "POST",
          body: JSON.stringify({ phoneNumber, message }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          return {
            success: true,
            messageId: data.messageId || null,
          };
        }
        return {
          success: false,
          error: data.error || `Failed to send WhatsApp message (HTTP ${res.status})`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to dispatch message to WhatsApp backend";
        console.error("[QR WhatsApp Provider] Backend send error:", msg);
        return {
          success: false,
          error: msg,
        };
      }
    }

    if (this.isServerless) {
      return {
        success: false,
        error: "WhatsApp service is unavailable. Please configure WHATSAPP_BACKEND_URL.",
      };
    }

    const { baileysManager } = await import("./baileysManager");
    return baileysManager.sendTextMessage(phoneNumber, message);
  }

  public async sendTemplateMessage(
    phoneNumber: string,
    templateName: string
  ): Promise<SendMessageResult> {
    return {
      success: false,
      error: `Template messaging ("${templateName}") is exclusively supported on Meta WhatsApp Cloud API.`,
    };
  }

  public async getTemplates(): Promise<any[]> {
    return [];
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
        messageId: null,
        error: "Customer does not have a valid WhatsApp phone number.",
        recipientPhone: targetPhone,
      };
    }

    const currentStatus = await this.getStatus();
    if (currentStatus.status !== "CONNECTED") {
      return {
        success: false,
        status: "FAILED",
        messageId: null,
        error: currentStatus.errorMessage || "WhatsApp is not connected. Please connect in Settings.",
        recipientPhone: normalized.display,
      };
    }

    const messageText = generateWhatsAppReceiptText(invoice);
    const sendResult = await this.sendMessage(normalized.digits, messageText);

    if (sendResult.success) {
      return {
        success: true,
        status: "SENT",
        messageId: sendResult.messageId || null,
        error: null,
        formattedMessage: messageText,
        recipientPhone: normalized.display,
      };
    } else {
      return {
        success: false,
        status: "FAILED",
        messageId: null,
        error: sendResult.error || "Failed to deliver WhatsApp receipt.",
        formattedMessage: messageText,
        recipientPhone: normalized.display,
      };
    }
  }
}
