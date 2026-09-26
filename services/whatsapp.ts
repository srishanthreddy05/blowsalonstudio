import type {
  WhatsAppStatusResponse,
  WhatsAppMessageRecord,
  WhatsAppSettings,
  WhatsAppMessageStatus,
} from "@/types/whatsapp";

export async function getStatus(): Promise<WhatsAppStatusResponse> {
  try {
    const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch status: ${res.statusText}`);
    }
    return await res.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error getting status";
    return {
      status: "ERROR",
      provider: "QR_WHATSAPP",
      errorMessage: msg,
      autoSendInvoice: true,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function connect(): Promise<WhatsAppStatusResponse> {
  const res = await fetch("/api/whatsapp/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to initiate WhatsApp connection");
  }
  return await res.json();
}

export async function disconnect(): Promise<void> {
  const res = await fetch("/api/whatsapp/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to disconnect WhatsApp");
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
    const res = await fetch("/api/whatsapp/messages", { cache: "no-store" });
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
        provider: "QR_WHATSAPP",
        updatedAt: new Date().toISOString(),
      };
    }
    return await res.json();
  } catch {
    return {
      autoSendInvoice: true,
      provider: "QR_WHATSAPP",
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
