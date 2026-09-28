/**
 * Safe structured logging utilities for WhatsApp integration.
 * NEVER logs access tokens, verify tokens, app secrets, or unmasked phone numbers.
 */

export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "[NO_PHONE]";
  const cleaned = String(phone).trim();
  if (cleaned.length <= 5) return "***";
  const start = cleaned.slice(0, 4);
  const end = cleaned.slice(-3);
  return `${start}***${end}`;
}

export interface WhatsAppLogPayload {
  provider: string;
  action: string;
  phone?: string | null;
  invoiceNumber?: string | null;
  result: "SUCCESS" | "FAILED" | "SKIPPED" | "RECEIVED" | "UNCONFIGURED";
  messageId?: string | null;
  errorCode?: string | null;
  error?: string | null;
}

export function logWhatsAppAction(payload: WhatsAppLogPayload) {
  const parts = [
    `[WhatsApp]`,
    `Provider: ${payload.provider}`,
    `Action: ${payload.action}`,
  ];

  if (payload.phone) {
    parts.push(`Phone: ${maskPhoneNumber(payload.phone)}`);
  }
  if (payload.invoiceNumber) {
    parts.push(`Invoice: ${payload.invoiceNumber}`);
  }
  if (payload.messageId) {
    parts.push(`MessageId: ${payload.messageId}`);
  }

  parts.push(`Result: ${payload.result}`);

  if (payload.errorCode) {
    parts.push(`ErrorCode: ${payload.errorCode}`);
  }
  if (payload.error) {
    // Strip any accidental tokens from error strings
    const safeError = String(payload.error)
      .replace(/EA[A-Za-z0-9_-]{20,}/g, "[REDACTED_TOKEN]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
    parts.push(`Error: ${safeError}`);
  }

  if (payload.result === "FAILED") {
    console.error(parts.join(" | "));
  } else if (payload.result === "UNCONFIGURED") {
    console.warn(parts.join(" | "));
  } else {
    console.log(parts.join(" | "));
  }
}
