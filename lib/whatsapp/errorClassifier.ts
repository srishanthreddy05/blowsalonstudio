/**
 * WhatsApp Delivery Failure Classifier & Formatter
 * Standardizes failure reasons across tables and modals while preserving original technical logs.
 */

export interface ParsedWhatsAppFailure {
  shortReason: string;
  details: string;
  metaErrorCode?: string | number | null;
  rawErrorMessage?: string | null;
}

/**
 * Classifies raw WhatsApp/Meta error strings and error codes into concise, human-readable labels
 * and structured detail explanations.
 */
export function parseWhatsAppFailure(
  errorMessage?: string | null,
  errorCode?: string | number | null
): ParsedWhatsAppFailure {
  const rawMsg = (errorMessage || "").trim();
  const codeStr = errorCode ? String(errorCode).trim() : "";

  // 1. Detect Meta Error Code if embedded in errorMessage or provided in errorCode
  let extractedCode: string | null = codeStr && !codeStr.startsWith("WHATSAPP_") ? codeStr : null;
  if (!extractedCode && rawMsg) {
    const codeMatch =
      rawMsg.match(/(?:code\s*[:#]?\s*|#)(\d{3,6})/i) ||
      rawMsg.match(/\b(131049|131030|131042|131000|131026|131005|130429|132\d{3}|190|102|10|80007|4)\b/);
    if (codeMatch) {
      extractedCode = codeMatch[1];
    }
  }

  const lowerMsg = rawMsg.toLowerCase();

  // 2. Meta Marketing Delivery Restriction (131049 / Ecosystem Engagement)
  // CRITICAL: Must NOT classify as "Opted out", "Invalid number", or "Technical failure"
  if (
    extractedCode === "131049" ||
    lowerMsg.includes("131049") ||
    lowerMsg.includes("healthy ecosystem engagement") ||
    lowerMsg.includes("ecosystem engagement") ||
    (lowerMsg.includes("delivery restricted") && lowerMsg.includes("marketing"))
  ) {
    return {
      shortReason: "Marketing delivery restricted",
      details:
        "WhatsApp temporarily restricted delivery of this marketing message to this recipient to maintain healthy ecosystem engagement.",
      metaErrorCode: extractedCode || "131049",
      rawErrorMessage: rawMsg || "This message was not delivered to maintain healthy ecosystem engagement.",
    };
  }

  // 3. Customer Opted Out
  if (
    lowerMsg.includes("opted out") ||
    lowerMsg.includes("opt-out") ||
    lowerMsg.includes("opt out") ||
    lowerMsg.includes("unsubscribed") ||
    lowerMsg.includes("consent revoked")
  ) {
    return {
      shortReason: "Customer opted out",
      details: "Customer has opted out of receiving promotional and marketing WhatsApp messages.",
      metaErrorCode: extractedCode,
      rawErrorMessage: rawMsg,
    };
  }

  // 4. Invalid recipient / Not on WhatsApp
  if (
    extractedCode === "131030" ||
    extractedCode === "131042" ||
    extractedCode === "131000" ||
    extractedCode === "131026" ||
    extractedCode === "131005" ||
    codeStr === "WHATSAPP_PHONE_NOT_REGISTERED" ||
    lowerMsg.includes("not registered") ||
    lowerMsg.includes("invalid recipient") ||
    lowerMsg.includes("invalid whatsapp number") ||
    lowerMsg.includes("invalid phone") ||
    lowerMsg.includes("invalid number") ||
    lowerMsg.includes("not a valid whatsapp") ||
    lowerMsg.includes("phone number is missing")
  ) {
    return {
      shortReason: "Invalid WhatsApp number",
      details: "The destination phone number is invalid or not registered with an active WhatsApp account.",
      metaErrorCode: extractedCode,
      rawErrorMessage: rawMsg,
    };
  }

  // 5. Authentication / API / Service Error
  if (
    extractedCode === "190" ||
    extractedCode === "102" ||
    extractedCode === "10" ||
    codeStr === "WHATSAPP_AUTH_ERROR" ||
    lowerMsg.includes("auth") ||
    lowerMsg.includes("access token") ||
    lowerMsg.includes("service unavailable") ||
    lowerMsg.includes("backend service unreachable") ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("credentials")
  ) {
    return {
      shortReason: "WhatsApp service error",
      details: "WhatsApp API authentication failed or the service is temporarily unreachable.",
      metaErrorCode: extractedCode,
      rawErrorMessage: rawMsg,
    };
  }

  // 6. Rate Limit
  if (
    extractedCode === "130429" ||
    extractedCode === "80007" ||
    extractedCode === "4" ||
    codeStr === "WHATSAPP_RATE_LIMIT" ||
    lowerMsg.includes("rate limit")
  ) {
    return {
      shortReason: "Rate limit reached",
      details: "Meta WhatsApp API throughput or messaging rate limit was reached.",
      metaErrorCode: extractedCode,
      rawErrorMessage: rawMsg,
    };
  }

  // 7. Template Error
  if (
    (extractedCode && Number(extractedCode) >= 132000 && Number(extractedCode) <= 132099) ||
    codeStr === "WHATSAPP_TEMPLATE_ERROR" ||
    lowerMsg.includes("template")
  ) {
    return {
      shortReason: "Template error",
      details: "Meta template mismatch, parameter formatting, or approval issue.",
      metaErrorCode: extractedCode,
      rawErrorMessage: rawMsg,
    };
  }

  // 8. Fallback for generic or unknown errors
  return {
    shortReason: "Message delivery failed",
    details: rawMsg || "Message could not be delivered to the recipient by WhatsApp.",
    metaErrorCode: extractedCode,
    rawErrorMessage: rawMsg || "Unknown delivery error",
  };
}

export type WhatsAppFailureClassification =
  | "TRANSIENT_API_ERROR"
  | "INVALID_RECIPIENT"
  | "TEMPLATE_ERROR"
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "OPT_OUT"
  | "UNKNOWN";

export interface RetryEligibilityResult {
  eligible: boolean;
  classification: WhatsAppFailureClassification;
  reason: string;
  actionAdvice: string;
}

/**
 * Evaluates whether a failed WhatsApp recipient is safe and eligible for automated/batch retry.
 * Prevents invalid numbers, opted-out customers, and auth failures from being blindly retried.
 */
export function classifyRetryEligibility(
  errorMessage?: string | null,
  errorCode?: string | number | null,
  retryCount: number = 0,
  maxAutomaticRetries: number = 2
): RetryEligibilityResult {
  if (retryCount >= maxAutomaticRetries) {
    return {
      eligible: false,
      classification: "UNKNOWN",
      reason: `Maximum automatic retry limit (${maxAutomaticRetries}) reached for this recipient.`,
      actionAdvice: "Manual individual retry required if recipient requests resend.",
    };
  }

  const parsed = parseWhatsAppFailure(errorMessage, errorCode);

  if (parsed.shortReason === "Invalid WhatsApp number") {
    return {
      eligible: false,
      classification: "INVALID_RECIPIENT",
      reason: "Recipient phone number is invalid or not registered on WhatsApp.",
      actionAdvice: "Update the customer's phone number before attempting to message them.",
    };
  }

  if (parsed.shortReason === "Customer opted out") {
    return {
      eligible: false,
      classification: "OPT_OUT",
      reason: "Customer has opted out of promotional WhatsApp communications.",
      actionAdvice: "Do not resend unless the customer explicitly re-opts into communications.",
    };
  }

  if (parsed.shortReason === "Template error") {
    return {
      eligible: false,
      classification: "TEMPLATE_ERROR",
      reason: "Meta WhatsApp template issue or formatting parameter mismatch.",
      actionAdvice: "Check template approval status in WhatsApp Manager before retrying.",
    };
  }

  if (parsed.shortReason === "WhatsApp service error") {
    return {
      eligible: false,
      classification: "AUTH_ERROR",
      reason: "WhatsApp authentication or service connection failure.",
      actionAdvice: "Check Meta access token and connection status in WhatsApp Settings.",
    };
  }

  if (parsed.shortReason === "Rate limit reached") {
    return {
      eligible: true,
      classification: "RATE_LIMIT",
      reason: "Meta messaging rate limit reached.",
      actionAdvice: "Wait for cooldown before dispatching.",
    };
  }

  // Marketing restriction (131049) or transient delivery error
  return {
    eligible: true,
    classification: "TRANSIENT_API_ERROR",
    reason: parsed.details || "Temporary network or delivery issue.",
    actionAdvice: "Eligible for delayed retry.",
  };
}

