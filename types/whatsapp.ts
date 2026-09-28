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
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "NOT_SENT";

export type WhatsAppProviderType =
  | "QR_WHATSAPP"
  | "WHATSAPP_CLOUD_API";

export type WhatsAppErrorCode =
  | "WHATSAPP_NOT_CONFIGURED"
  | "WHATSAPP_AUTH_ERROR"
  | "WHATSAPP_PHONE_NOT_REGISTERED"
  | "WHATSAPP_API_ERROR"
  | "WHATSAPP_TEMPLATE_ERROR"
  | "WHATSAPP_RATE_LIMIT"
  | "WHATSAPP_WEBHOOK_ERROR";

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
  errorCode?: WhatsAppErrorCode | string | null;
  messageId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  retryCount?: number;
}

export interface WhatsAppSettings {
  autoSendInvoice: boolean;
  provider: WhatsAppProviderType;
  customTemplateHeader?: string;
  customTemplateFooter?: string;
  templateName?: string;
  templateLanguage?: string;
  updatedAt?: string;
}

export interface WhatsAppStatusResponse {
  status: WhatsAppConnectionStatus;
  connectedNumber?: string;
  qrCode?: string; // Data URL format e.g. "data:image/png;base64,..."
  provider: WhatsAppProviderType;
  errorMessage?: string;
  errorCode?: WhatsAppErrorCode | string;
  autoSendInvoice: boolean;
  updatedAt: string;
  metaCloudConfigured?: boolean;
}
