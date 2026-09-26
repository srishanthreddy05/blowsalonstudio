import type { Invoice } from "@/types/invoice";
import type {
  WhatsAppConnectionStatus,
  WhatsAppMessageStatus,
  WhatsAppProviderType,
} from "@/types/whatsapp";

export interface SendMessageResult {
  success: boolean;
  messageId?: string | null;
  error?: string | null;
}

export interface SendInvoiceResult {
  success: boolean;
  status: WhatsAppMessageStatus;
  messageId?: string | null;
  error?: string | null;
  formattedMessage?: string;
  recipientPhone?: string;
}

export interface ProviderStatusResult {
  status: WhatsAppConnectionStatus;
  provider: WhatsAppProviderType;
  connectedNumber?: string;
  qrCode?: string;
  errorMessage?: string;
}

export interface IWhatsAppProvider {
  readonly providerType: WhatsAppProviderType;

  /**
   * Initializes or wakes up the provider connection.
   */
  connect(): Promise<void>;

  /**
   * Disconnects the session and clears authentication state.
   */
  disconnect(): Promise<void>;

  /**
   * Retrieves the current connection status and QR code if required.
   */
  getStatus(): Promise<ProviderStatusResult>;

  /**
   * Sends a plain text message to a normalized recipient phone number.
   */
  sendMessage(phoneNumber: string, message: string): Promise<SendMessageResult>;

  /**
   * Formats and sends an invoice receipt message for a given Invoice.
   */
  sendInvoiceReceipt(invoice: Invoice, customerPhone?: string): Promise<SendInvoiceResult>;
}
