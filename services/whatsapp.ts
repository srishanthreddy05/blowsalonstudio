import type {
  WhatsAppStatusResponse,
  WhatsAppMessageRecord,
  WhatsAppSettings,
  WhatsAppMessageStatus,
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppTemplate,
  WhatsAppAudienceType,
  WhatsAppCoexistenceAccount,
} from "@/types/whatsapp";

export async function getStatus(): Promise<WhatsAppStatusResponse> {
  try {
    const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        status: "DISCONNECTED",
        provider: "WHATSAPP_CLOUD_API",
        errorMessage: errData.errorMessage || "WhatsApp service is unavailable.",
        whatsappEnabled: true,
        autoSendInvoice: true,
        updatedAt: new Date().toISOString(),
      };
    }
    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "WhatsApp service is unavailable";
    return {
      status: "DISCONNECTED",
      provider: "WHATSAPP_CLOUD_API",
      errorMessage: msg,
      whatsappEnabled: true,
      autoSendInvoice: true,
      updatedAt: new Date().toISOString(),
    };
  }
}

// Legacy connect() and disconnect() removed — WhatsApp connection is managed
// exclusively through the Coexistence embedded-signup flow (completeEmbeddedSignup / disconnectCoexistence).

export async function sendInvoiceWhatsApp(
  invoiceId: string,
  forceResend = false,
  overridePhone?: string
): Promise<{
  success: boolean;
  status: WhatsAppMessageStatus;
  messageRecord?: WhatsAppMessageRecord;
  error?: string;
}> {
  try {
    const res = await fetch("/api/whatsapp/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId,
        forceResend,
        overridePhone,
      }),
    });

    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error sending WhatsApp receipt";
    return {
      success: false,
      status: "FAILED",
      error: msg,
    };
  }
}

export async function sendAppointmentWhatsApp(
  appointmentId: string,
  type: "confirmation" | "reminder",
  overridePhone?: string
): Promise<{
  success: boolean;
  status: WhatsAppMessageStatus;
  messageRecord?: WhatsAppMessageRecord;
  error?: string;
  disabled?: boolean;
}> {
  try {
    const res = await fetch("/api/whatsapp/send-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId,
        type,
        overridePhone,
      }),
    });

    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : `Network error sending WhatsApp appointment ${type}`;
    return {
      success: false,
      status: "FAILED",
      error: msg,
    };
  }
}

export async function getInvoiceMessages(invoiceId: string): Promise<WhatsAppMessageRecord[]> {
  try {
    const res = await fetch(`/api/whatsapp/messages?invoiceId=${encodeURIComponent(invoiceId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch {
    return [];
  }
}

export async function getRecentMessages(): Promise<WhatsAppMessageRecord[]> {
  try {
    const res = await fetch("/api/whatsapp/messages?limit=50", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch {
    return [];
  }
}

export async function getFilteredMessages(params?: {
  messageType?: string;
  status?: string;
  campaignId?: string;
  invoiceId?: string;
  limit?: number;
}): Promise<WhatsAppMessageRecord[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.messageType) searchParams.set("messageType", params.messageType);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.campaignId) searchParams.set("campaignId", params.campaignId);
    if (params?.invoiceId) searchParams.set("invoiceId", params.invoiceId);
    if (params?.limit) searchParams.set("limit", String(params.limit));

    const res = await fetch(`/api/whatsapp/messages?${searchParams.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch {
    return [];
  }
}

export async function getSettings(): Promise<WhatsAppSettings> {
  try {
    const res = await fetch("/api/whatsapp/settings", { cache: "no-store" });
    if (!res.ok) {
      return {
        whatsappEnabled: true,
        autoSendInvoice: true,
        provider: "WHATSAPP_CLOUD_API",
        updatedAt: new Date().toISOString(),
      };
    }
    return await res.json();
  } catch {
    return {
      whatsappEnabled: true,
      autoSendInvoice: true,
      provider: "WHATSAPP_CLOUD_API",
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function updateSettings(
  settings: Partial<WhatsAppSettings>
): Promise<WhatsAppSettings> {
  const res = await fetch("/api/whatsapp/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update WhatsApp settings");
  }
  const data = await res.json();
  return data.settings;
}

// ==================== DASHBOARD MANAGEMENT METHODS ====================

export async function getAccountOverview(): Promise<import("@/types/whatsapp").WhatsAppAccountOverview> {
  const res = await fetch("/api/whatsapp/account-overview", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.overview) {
    throw new Error(data.error || "Failed to load WhatsApp account overview");
  }
  return data.overview;
}

export async function getBillingInfo(): Promise<import("@/types/whatsapp").WhatsAppBillingInfo> {
  const res = await fetch("/api/whatsapp/billing", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to fetch WhatsApp billing details");
  }
  return data.billing;
}

export async function getMonthlyUsage(
  month?: string,
  timezone?: string
): Promise<import("@/types/whatsapp").MonthlyUsageSummary> {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (timezone) params.set("timezone", timezone);
  const url = params.toString() ? `/api/whatsapp/usage?${params.toString()}` : "/api/whatsapp/usage";
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to fetch WhatsApp usage data");
  }
  return data.usage;
}


export async function getInsights(): Promise<import("@/types/whatsapp").WhatsAppInsightsData> {
  const res = await fetch("/api/whatsapp/insights", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to fetch WhatsApp insights");
  }
  return data.insights;
}

// ==================== CAMPAIGN & TEMPLATE SERVICE METHODS ====================

export async function getTemplates(purpose?: "campaign" | "invoice" | "test"): Promise<WhatsAppTemplate[]> {
  try {
    const url = purpose ? `/api/whatsapp/templates?purpose=${encodeURIComponent(purpose)}` : "/api/whatsapp/templates";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.templates || [];
  } catch {
    return [];
  }
}

export async function getTemplatesDetailed(params?: {
  purpose?: string;
  status?: string;
  category?: string;
  limit?: number;
  after?: string;
  before?: string;
}): Promise<{
  templates: WhatsAppTemplate[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string; previous?: string };
  error?: string;
  lastSync?: string;
  isStale?: boolean;
}> {
  const searchParams = new URLSearchParams();
  if (params?.purpose) searchParams.set("purpose", params.purpose);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.after) searchParams.set("after", params.after);
  if (params?.before) searchParams.set("before", params.before);

  const res = await fetch(`/api/whatsapp/templates?${searchParams.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({ templates: [] }));
  return data;
}

export async function createTemplate(
  payload: import("@/types/whatsapp").CreateWhatsAppTemplateRequest
): Promise<{
  success: boolean;
  id?: string;
  status?: string;
  category?: string;
  message?: string;
  error?: string;
}> {
  const res = await fetch("/api/whatsapp/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to submit template to Meta");
  }
  return data;
}

export async function getCampaigns(): Promise<WhatsAppCampaign[]> {
  try {
    const res = await fetch("/api/whatsapp/campaigns", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.campaigns || [];
  } catch {
    return [];
  }
}

export async function getCampaignById(
  id: string
): Promise<{ campaign: WhatsAppCampaign; recipients: WhatsAppCampaignRecipient[] }> {
  const res = await fetch(`/api/whatsapp/campaigns/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load campaign details");
  }
  return await res.json();
}

export async function uploadCampaignImage(
  file: File,
  idToken?: string
): Promise<{
  success: boolean;
  secure_url?: string;
  metadata?: {
    publicId?: string | null;
    format?: string | null;
    bytes?: number | null;
    width?: number | null;
    height?: number | null;
    resourceType?: string | null;
    originalFilename?: string | null;
    uploadedAt?: string | null;
  };
  error?: string;
}> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const res = await fetch("/api/whatsapp/campaigns/upload", {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to upload image to Cloudinary");
  }

  return data;
}

export async function createCampaign(payload: {
  name: string;
  templateName: string;
  templateLanguage?: string;
  templateCategory?: string;
  audienceType: WhatsAppAudienceType;
  customCustomerIds?: string[];
  templateVariables?: Record<string, string>;
  headerImageUrl?: string | null;
  headerImageMetadata?: Record<string, unknown> | null;
  uploadFailed?: boolean;
  uploadError?: string | null;
}): Promise<{ success: boolean; campaign: WhatsAppCampaign }> {
  const res = await fetch("/api/whatsapp/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to create campaign");
  }
  return data;
}

export async function sendCampaign(id: string): Promise<{
  success: boolean;
  status: string;
  sentCount: number;
  failedCount: number;
}> {
  const res = await fetch(`/api/whatsapp/campaigns/${encodeURIComponent(id)}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to send campaign");
  }
  return data;
}

export async function cancelCampaign(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/whatsapp/campaigns/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to cancel campaign");
  }
  return data;
}

export async function getCampaignRetryEligibility(id: string): Promise<{
  campaignId: string;
  campaignName: string;
  isCurrentlySending: boolean;
  totalFailed: number;
  retryEligibleCount: number;
  nonRetryableCount: number;
  coolingCount: number;
  maxCooldownRemainingMinutes: number;
  defaultDelayMinutes: number;
  rate: number;
  estimatedCharge: number;
  breakdown: Record<string, number>;
  recipients: Array<{
    id: string;
    customerName: string;
    phone: string;
    retryCount: number;
    eligible: boolean;
    classification: string;
    reason: string;
    actionAdvice: string;
    isCooling: boolean;
    coolingMinutesRemaining: number;
  }>;
}> {
  const res = await fetch(`/api/whatsapp/campaigns/${encodeURIComponent(id)}/retry`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to check retry eligibility");
  }
  return data;
}

export async function retryCampaign(
  id: string,
  options?: { bypassDelay?: boolean; manualRecipientId?: string }
): Promise<{
  success: boolean;
  message: string;
  retriedCount?: number;
  retriedSuccessCount?: number;
  retriedFailedCount?: number;
  applicationCharges?: number;
}> {
  const res = await fetch(`/api/whatsapp/campaigns/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to retry campaign");
  }
  return data;
}

export async function sendTestTemplate(payload: {
  testPhone: string;
  templateName: string;
  templateLanguage?: string;
  templateVariables?: Record<string, string>;
  sampleCustomerName?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const res = await fetch("/api/whatsapp/campaigns/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Test message dispatch failed");
  }
  return data;
}

export async function optOutCustomer(
  customerId: string,
  optOut: boolean
): Promise<{ success: boolean; message: string }> {
  const res = await fetch("/api/whatsapp/customers/opt-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, optOut }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to update customer opt-out status");
  }
  return data;
}

export async function deleteCampaign(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/whatsapp/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || "Failed to delete campaign");
  }
  return data;
}


// ==================== COEXISTENCE & EMBEDDED SIGNUP SERVICE METHODS ====================

export async function getCoexistenceStatus(): Promise<{
  connected: boolean;
  coexistence: WhatsAppCoexistenceAccount;
}> {
  try {
    const res = await fetch("/api/whatsapp/embedded-signup", { cache: "no-store" });
    if (!res.ok) {
      return {
        connected: false,
        coexistence: { status: "DISCONNECTED", configurationId: "1534814405338722" },
      };
    }
    return await res.json();
  } catch {
    return {
      connected: false,
      coexistence: { status: "DISCONNECTED", configurationId: "1534814405338722" },
    };
  }
}

export async function completeEmbeddedSignup(payload: {
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
  sessionData?: Record<string, unknown>;
}): Promise<{
  success: boolean;
  message?: string;
  coexistence?: WhatsAppCoexistenceAccount;
  error?: string;
}> {
  try {
    const res = await fetch("/api/whatsapp/embedded-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Failed to complete WhatsApp onboarding");
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to complete WhatsApp onboarding";
    return {
      success: false,
      error: msg,
    };
  }
}

export async function disconnectCoexistence(): Promise<void> {
  const res = await fetch("/api/whatsapp/embedded-signup", {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to disconnect WhatsApp coexistence");
  }
}


