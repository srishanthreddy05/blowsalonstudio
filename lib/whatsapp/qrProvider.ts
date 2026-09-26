import type { Invoice } from "@/types/invoice";
import type {
  IWhatsAppProvider,
  ProviderStatusResult,
  SendMessageResult,
  SendInvoiceResult,
} from "./types";
import { baileysManager } from "./baileysManager";
import { generateWhatsAppReceiptText } from "../utils/whatsappReceipt";
import { normalizePhoneNumber } from "../utils/phone";

export class QRWhatsAppProvider implements IWhatsAppProvider {
  public readonly providerType = "QR_WHATSAPP" as const;

  public async connect(): Promise<void> {
    await baileysManager.connect();
  }

  public async disconnect(): Promise<void> {
    await baileysManager.disconnect();
  }

  public async getStatus(): Promise<ProviderStatusResult> {
    const statusInfo = await baileysManager.getStatus();
    return {
      status: statusInfo.status,
      provider: this.providerType,
      connectedNumber: statusInfo.connectedNumber,
      qrCode: statusInfo.qrCode,
      errorMessage: statusInfo.errorMessage,
    };
  }

  public async sendMessage(phoneNumber: string, message: string): Promise<SendMessageResult> {
    return baileysManager.sendTextMessage(phoneNumber, message);
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
        error: "WhatsApp is not connected. Please connect in Settings.",
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
