import type { Invoice } from "@/types/invoice";
import type {
  WhatsAppConnectionStatus,
  WhatsAppMessageStatus,
  WhatsAppProviderType,
  WhatsAppErrorCode,
} from "@/types/whatsapp";

export interface SendMessageResult {
  success: boolean;
  messageId?: string | null;
  error?: string | null;
  errorCode?: WhatsAppErrorCode | null;
}

export interface SendInvoiceResult {
  success: boolean;
  status: WhatsAppMessageStatus;
  messageId?: string | null;
  error?: string | null;
  errorCode?: WhatsAppErrorCode | null;
  formattedMessage?: string;
  recipientPhone?: string;
}

export interface ProviderStatusResult {
  status: WhatsAppConnectionStatus;
  provider: WhatsAppProviderType;
  connectedNumber?: string;
  qrCode?: string;
  errorMessage?: string;
  errorCode?: WhatsAppErrorCode;
}

export interface IWhatsAppProvider {
  readonly providerType: WhatsAppProviderType;

  /**
   * Initializes or tests connection for the provider.
   */
  connect(): Promise<void>;

  /**
   * Disconnects the session (if applicable).
   */
  disconnect(): Promise<void>;

  /**
   * Retrieves the current connection/configuration status.
   */
  getStatus(): Promise<ProviderStatusResult>;

  /**
   * Sends a plain text message to a recipient phone number.
   */
  sendMessage(phoneNumber: string, message: string): Promise<SendMessageResult>;

  /**
   * Sends an approved Meta WhatsApp template message (Cloud API).
   */
  sendTemplateMessage?(
    phoneNumber: string,
    templateName: string,
    languageCode?: string,
    components?: Array<Record<string, unknown>>
  ): Promise<SendMessageResult>;

  /**
   * Formats and sends an invoice receipt message for a given Invoice.
   */
  sendInvoiceReceipt(invoice: Invoice, customerPhone?: string): Promise<SendInvoiceResult>;
}

export type WhatsAppProvider = IWhatsAppProvider;
