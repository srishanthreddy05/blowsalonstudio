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
  | "NOT_SENT"
  | "EXCLUDED";

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

export type WhatsAppCampaignStatus =
  | "DRAFT"
  | "QUEUED"
  | "SENDING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED"
  | "CANCELLED";

export type WhatsAppAudienceType =
  | "ALL"
  | "REGULAR"
  | "MEMBERSHIP"
  | "CUSTOM";

export type WhatsAppMessageDirection = "INBOUND" | "OUTBOUND";

export type WhatsAppMessageType =
  | "INVOICE_RECEIPT"
  | "MARKETING_CAMPAIGN"
  | "TEST_MESSAGE"
  | "APPOINTMENT_REMINDER";




export interface WhatsAppTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
  };
  buttons?: Array<{
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: WhatsAppTemplateComponent[];
  bodyText?: string;
  headerText?: string;
  footerText?: string;
  variableCount: number;
  variableKeys?: string[];
  variableSampleMap?: Record<string, string>;
}

export interface WhatsAppCampaign {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  templateCategory?: string;
  audienceType: WhatsAppAudienceType;
  customCustomerIds?: string[];
  status: WhatsAppCampaignStatus;
  totalRecipients: number;
  eligibleCount: number;
  excludedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  templateVariables: Record<string, string>; // e.g. { "1": "customer_name", "2": "20% OFF" }
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
}

export interface WhatsAppDeliveryAttempt {
  attempt: number;
  status: WhatsAppMessageStatus;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  metaMessageId?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
}

export interface WhatsAppCampaignRecipient {
  id: string;
  campaignId: string;
  customerId?: string | null;
  customerName: string;
  phone: string;
  normalizedPhone: string;
  status: WhatsAppMessageStatus;
  metaMessageId?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  retryCount?: number;
  attempts?: WhatsAppDeliveryAttempt[];
  createdAt: string;
  updatedAt?: string;
}

export interface WhatsAppMessageRecord {
  id?: string;
  conversationId?: string | null;
  direction?: WhatsAppMessageDirection;
  messageType?: WhatsAppMessageType;
  campaignId?: string | null;
  campaignName?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  customerId?: string | null;
  customerName: string;
  phoneNumber: string;
  recipientPhone?: string;
  normalizedPhone?: string;
  templateName?: string | null;
  templateLanguage?: string | null;
  message?: string;
  contentSummary?: string;
  status: WhatsAppMessageStatus;
  provider: WhatsAppProviderType;
  errorMessage?: string | null;
  errorCode?: WhatsAppErrorCode | string | null;
  messageId?: string | null;
  metaMessageId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  retryCount?: number;
}

export interface WhatsAppCoexistenceAccount {
  status: "CONNECTED" | "CONNECTING" | "DISCONNECTED";
  wabaId?: string;
  phoneNumberId?: string;
  businessPhoneNumber?: string;
  verifiedName?: string;
  configurationId?: string;
  featureType?: string;
  onboardedAt?: string;
  updatedAt?: string;
}

export interface WhatsAppSettings {
  whatsappEnabled: boolean;
  autoSendInvoice: boolean;
  provider: WhatsAppProviderType;
  customTemplateHeader?: string;
  customTemplateFooter?: string;
  templateName?: string;
  templateLanguage?: string;
  coexistence?: WhatsAppCoexistenceAccount;
  updatedAt?: string;
}

export interface WhatsAppStatusResponse {
  status: WhatsAppConnectionStatus;
  connectedNumber?: string;
  qrCode?: string; // Data URL format e.g. "data:image/png;base64,..."
  provider: WhatsAppProviderType;
  errorMessage?: string;
  errorCode?: WhatsAppErrorCode | string;
  whatsappEnabled: boolean;
  autoSendInvoice: boolean;
  updatedAt: string;
  metaCloudConfigured?: boolean;
  coexistence?: WhatsAppCoexistenceAccount | null;
}

