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
  | "APPOINTMENT_REMINDER"
  | "APPOINTMENT_CONFIRMATION";




export type WhatsAppTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "IN_REVIEW"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "APPEAL_REQUESTED";

export interface WhatsAppTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  text?: string;
  example?: {
    header_text?: string[];
    header_handle?: string[];
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
  status: WhatsAppTemplateStatus;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: WhatsAppTemplateComponent[];
  bodyText?: string;
  headerText?: string;
  footerText?: string;
  variableCount: number;
  variableKeys?: string[];
  variableSampleMap?: Record<string, string>;
  qualityScore?: {
    score?: string;
  };
  rejectedReason?: string;
}

export interface CreateWhatsAppTemplateRequest {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  components: WhatsAppTemplateComponent[];
}

export interface WhatsAppAccountOverview {
  connected: boolean;
  status: WhatsAppConnectionStatus;
  businessPhoneNumber?: string;
  verifiedName?: string;
  wabaId?: string;
  phoneNumberId?: string;
  qualityRating?: string;
  messagingLimitTier?: string;
  codeVerificationStatus?: string;
  nameStatus?: string;
  platformType?: string;
  throughput?: { level?: string };
  waba?: {
    id?: string;
    name?: string;
    currency?: string;
    timezoneId?: string;
    accountReviewStatus?: string;
    messageTemplateNamespace?: string;
  } | null;
  lastSync: string;
  errors?: Array<{
    scope: string;
    code?: number;
    message: string;
    actionableAdvice: string;
  }>;
}

export interface WhatsAppBillingInfo {
  wabaId: string;
  currency: string | null;
  timezoneId: string | null;
  accountReviewStatus: string | null;
  paymentStatus: "ACTIVE" | "PENDING" | "RESTRICTED" | "UNKNOWN";
  balanceAvailable: boolean;
  balance: number | null;
  balanceUnavailableReason: string;
  directBillingUrl: string;
  lastSync: string;
}

export interface WhatsAppInsightsData {
  totalSent30d: number;
  deliveredRate: number;
  readRate: number;
  failedRate: number;
  deliveryBreakdown: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  phoneQuality: string;
  messagingLimitTier: string;
  webhookStatus: "HEALTHY" | "DEGRADED" | "UNKNOWN";
  lastWebhookEvent: string | null;
  recentEvents: Array<{
    id: string;
    recipient: string;
    type: string;
    status: string;
    timestamp: string;
    error?: string | null;
  }>;
  lastSync: string;
}

export interface WhatsAppCampaignImageMetadata {
  publicId?: string | null;
  format?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  resourceType?: string | null;
  originalFilename?: string | null;
  uploadedAt?: string | null;
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
  headerImageUrl?: string | null;
  headerImageMetadata?: WhatsAppCampaignImageMetadata | null;
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

export type WhatsAppMessageCategory = "UTILITY" | "MARKETING";

export interface WhatsAppMessageRecord {
  id?: string;
  conversationId?: string | null;
  direction?: WhatsAppMessageDirection;
  messageType?: WhatsAppMessageType;
  category?: WhatsAppMessageCategory;
  campaignId?: string | null;
  campaignName?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  appointmentId?: string | null;
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
  isRetry?: boolean;
  retryAttemptNumber?: number;
  costPerMessage?: number;
  estimatedCharge?: number;
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

export interface CategoryUsageMetric {
  messagesSent: number;
  uniqueRecipients: number;
  rate: number;
  estimatedCharges: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
}

export interface MonthlyUsageSummary {
  month: string; // YYYY-MM
  monthLabel: string; // e.g. "October 2026"
  timezone: string;
  totalMessagesSent: number;
  totalUniqueRecipients: number;
  totalAttempts: number;
  utilitySent: number;
  marketingSent: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  pendingCount: number;
  estimatedCharges: {
    utilityRate: number;
    marketingRate: number;
    utilityCharges: number;
    marketingCharges: number;
    totalCharges: number;
  };
  breakdown: {
    utility: CategoryUsageMetric;
    marketing: CategoryUsageMetric;
  };
  availableMonths: Array<{ value: string; label: string }>;
  lastUpdated: string;
}


