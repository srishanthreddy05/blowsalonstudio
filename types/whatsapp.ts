export type WhatsAppConnectionStatus =
  | "CONNECTED"
  | "CONNECTING"
  | "DISCONNECTED"
  | "QR_REQUIRED"
  | "ERROR";

export type WhatsAppMessageStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "NOT_SENT";

export type WhatsAppProviderType =
  | "QR_WHATSAPP"
  | "WHATSAPP_CLOUD_API";

export interface WhatsAppMessageRecord {
  id?: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId?: string | null;
  customerName: string;
  phoneNumber: string;
  normalizedPhone?: string;
  message: string;
  status: WhatsAppMessageStatus;
  provider: WhatsAppProviderType;
  errorMessage?: string | null;
  messageId?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  retryCount?: number;
}

export interface WhatsAppSettings {
  autoSendInvoice: boolean;
  provider: WhatsAppProviderType;
  customTemplateHeader?: string;
  customTemplateFooter?: string;
  updatedAt?: string;
}

export interface WhatsAppStatusResponse {
  status: WhatsAppConnectionStatus;
  connectedNumber?: string;
  qrCode?: string; // Data URL format e.g. "data:image/png;base64,..."
  provider: WhatsAppProviderType;
  errorMessage?: string;
  autoSendInvoice: boolean;
  updatedAt: string;
}
