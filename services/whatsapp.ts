import type {
  WhatsAppStatusResponse,
  WhatsAppMessageRecord,
  WhatsAppSettings,
  WhatsAppMessageStatus,
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  WhatsAppTemplate,
  WhatsAppAudienceType,
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
      autoSendInvoice: true,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function connect(): Promise<WhatsAppStatusResponse> {
  try {
    const res = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Failed to initiate WhatsApp connection");
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to initiate WhatsApp connection";
    throw new Error(msg);
  }
}

export async function disconnect(): Promise<void> {
  try {
    const res = await fetch("/api/whatsapp/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to disconnect WhatsApp");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to disconnect WhatsApp";
    throw new Error(msg);
  }
}

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
        autoSendInvoice: true,
        provider: "WHATSAPP_CLOUD_API",
        updatedAt: new Date().toISOString(),
      };
    }
    return await res.json();
  } catch {
    return {
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

export async function createCampaign(payload: {
  name: string;
  templateName: string;
  templateLanguage?: string;
  templateCategory?: string;
  audienceType: WhatsAppAudienceType;
  customCustomerIds?: string[];
  templateVariables?: Record<string, string>;
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

export async function retryCampaign(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/whatsapp/campaigns/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

