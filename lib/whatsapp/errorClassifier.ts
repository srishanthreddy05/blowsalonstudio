/**
 * WhatsApp Delivery Failure Classifier & Formatter
 * Standardizes failure reasons, Meta numeric error codes, and retry eligibility.
 */

export type WhatsAppFailureClassification =
  | "THROUGHPUT_LIMIT"         // 130429, 80007 (Meta throughput rate limit)
  | "PAIR_RATE_LIMIT"          // 131056 (Too many messages to recipient in short window)
  | "SPAM_RATE_LIMIT"          // 131048 (Spam rate limit reached)
  | "APP_LEVEL_LIMIT"          // Code 4 (Graph app-level API rate limit)
  | "ECOSYSTEM_DECLINE"        // 131049 (Declined for ecosystem health - NOT retryable)
  | "RECIPIENT_UNDELIVERABLE"  // 131026 (Recipient undeliverable - permanent)
  | "INVALID_RECIPIENT"        // 131030, 131042, 131000, 131005, WHATSAPP_PHONE_NOT_REGISTERED
  | "TEMPLATE_ERROR"           // 132000-132099, WHATSAPP_TEMPLATE_ERROR
  | "AUTH_ERROR"               // 190, 102, 10, WHATSAPP_AUTH_ERROR
  | "AMBIGUOUS_TIMEOUT"        // Network/Abort timeout after dispatch - needs webhook reconciliation
  | "TRANSIENT_API_ERROR"      // 500, 502, 503, 504 server errors
  | "RATE_LIMIT"               // Legacy alias for THROUGHPUT_LIMIT compatibility
  | "OPT_OUT"                  // Customer opted out
  | "UNKNOWN";

export interface ParsedWhatsAppFailure {
  shortReason: string;
  details: string;
  metaErrorCode?: string | number | null;
  rawErrorMessage?: string | null;
  classification: WhatsAppFailureClassification;
  isAmbiguous?: boolean;
}

/**
 * Classifies raw WhatsApp/Meta error strings and error codes into concise, human-readable labels
 * and structured classifications.
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
      rawMsg.match(/\b(131056|131048|131049|131030|131042|131000|131026|131005|130429|132\d{3}|190|102|10|80007|4)\b/);
    if (codeMatch) {
      extractedCode = codeMatch[1];
    }
  }

  const lowerMsg = rawMsg.toLowerCase();

  // 2. Ambiguous Timeouts (Network abort / timeout after HTTP dispatch)
  if (
    lowerMsg.includes("abort") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("etimedout") ||
    lowerMsg.includes("econnreset") ||
    codeStr === "WHATSAPP_AMBIGUOUS_TIMEOUT"
  ) {
    return {
      shortReason: "Dispatch timeout (Ambiguous)",
      details:
        "Request timed out or disconnected after sending. Message may have reached Meta; awaiting webhook confirmation before any retry.",
      metaErrorCode: extractedCode,
      rawErrorMessage: rawMsg,
      classification: "AMBIGUOUS_TIMEOUT",
      isAmbiguous: true,
    };
  }

  // 3. Meta Marketing Delivery Restriction (131049 / Healthy Ecosystem Engagement)
  // CRITICAL: Declined by Meta to protect recipient from marketing fatigue. NOT automatically retryable.
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
        "Meta declined delivery of this marketing template to this recipient to maintain healthy ecosystem engagement. Do not automatically retry.",
      metaErrorCode: extractedCode || "131049",
      rawErrorMessage: rawMsg || "Message declined by Meta to maintain healthy ecosystem engagement.",
      classification: "ECOSYSTEM_DECLINE",
    };
  }

  // 4. Pair Rate Limit (131056: Too many messages sent to same recipient in short window)
  if (extractedCode === "131056" || lowerMsg.includes("131056") || lowerMsg.includes("pair rate limit")) {
    return {
      shortReason: "Recipient pair rate limit",
      details: "Too many messages sent to this specific recipient phone number within a short window.",
      metaErrorCode: extractedCode || "131056",
      rawErrorMessage: rawMsg,
      classification: "PAIR_RATE_LIMIT",
    };
  }

  // 5. Spam Rate Limit (131048: Spam rate limit reached)
  if (extractedCode === "131048" || lowerMsg.includes("131048") || lowerMsg.includes("spam rate limit")) {
    return {
      shortReason: "Spam rate limit",
      details: "Meta flagged messaging activity under spam rate-limiting rules.",
      metaErrorCode: extractedCode || "131048",
      rawErrorMessage: rawMsg,
      classification: "SPAM_RATE_LIMIT",
    };
  }

  // 6. Recipient Undeliverable (131026: Permanent recipient delivery failure)
  if (extractedCode === "131026" || lowerMsg.includes("131026") || lowerMsg.includes("undeliverable")) {
    return {
      shortReason: "Message delivery failed",
      details: "Message undeliverable. The destination number could not receive this message.",
      metaErrorCode: extractedCode || "131026",
      rawErrorMessage: rawMsg,
      classification: "RECIPIENT_UNDELIVERABLE",
    };
  }

  // 7. Customer Opted Out
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
      classification: "OPT_OUT",
    };
  }

  // 8. Invalid recipient / Not on WhatsApp
  if (
    extractedCode === "131030" ||
    extractedCode === "131042" ||
    extractedCode === "131000" ||
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
      classification: "INVALID_RECIPIENT",
    };
  }

  // 9. Authentication / Service Error
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
      classification: "AUTH_ERROR",
    };
  }

  // 10. Graph App-Level API Rate Limit (Code 4)
  if (extractedCode === "4") {
    return {
      shortReason: "Application rate limit",
      details: "Meta Graph application-level API call volume limit reached.",
      metaErrorCode: "4",
      rawErrorMessage: rawMsg,
      classification: "APP_LEVEL_LIMIT",
    };
  }

  // 11. Throughput Rate Limit (130429 / 80007)
  if (
    extractedCode === "130429" ||
    extractedCode === "80007" ||
    codeStr === "WHATSAPP_RATE_LIMIT" ||
    lowerMsg.includes("rate limit")
  ) {
    return {
      shortReason: "Rate limit reached",
      details: "Meta WhatsApp API throughput or messaging rate limit was reached.",
      metaErrorCode: extractedCode || "130429",
      rawErrorMessage: rawMsg,
      classification: "THROUGHPUT_LIMIT",
    };
  }

  // 12. Template Error
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
      classification: "TEMPLATE_ERROR",
    };
  }

  // 13. Fallback for generic delivery failures / transient issues
  return {
    shortReason: "Message delivery failed",
    details: rawMsg || "Message could not be delivered to the recipient by WhatsApp.",
    metaErrorCode: extractedCode,
    rawErrorMessage: rawMsg || "Unknown delivery error",
    classification: "TRANSIENT_API_ERROR",
  };
}

export interface RetryEligibilityResult {
  eligible: boolean;
  classification: WhatsAppFailureClassification;
  reason: string;
  actionAdvice: string;
  isAmbiguous?: boolean;
}

/**
 * Evaluates whether a failed WhatsApp recipient is safe and eligible for automated/batch retry.
 * Prevents invalid numbers, opted-out customers, auth failures, 131049 ecosystem declines,
 * 131026 undeliverable numbers, and ambiguous timeouts from being blindly retried.
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

  // 1. Ambiguous Timeouts: NEVER automatically resend without webhook reconciliation
  if (parsed.classification === "AMBIGUOUS_TIMEOUT") {
    return {
      eligible: false,
      classification: "AMBIGUOUS_TIMEOUT",
      reason: "Request timed out during dispatch. Awaiting webhook reconciliation before any resend.",
      actionAdvice: "Check webhook status or perform manual resend only after confirming message was not delivered.",
      isAmbiguous: true,
    };
  }

  // 2. Ecosystem Engagement Decline (131049): Meta explicitly declined. NOT retryable.
  if (parsed.classification === "ECOSYSTEM_DECLINE") {
    return {
      eligible: false,
      classification: "ECOSYSTEM_DECLINE",
      reason: "Meta declined this marketing message for ecosystem health. Do not automatically retry.",
      actionAdvice: "Flag for manual review. Wait 24-48 hours before messaging customer.",
    };
  }

  // 3. Recipient Undeliverable (131026): Permanent recipient delivery failure.
  if (parsed.classification === "RECIPIENT_UNDELIVERABLE") {
    return {
      eligible: false,
      classification: "RECIPIENT_UNDELIVERABLE",
      reason: "Message was undeliverable to this recipient phone number.",
      actionAdvice: "Verify recipient WhatsApp account availability before manual retry.",
    };
  }

  // 4. Invalid recipient phone number
  if (parsed.classification === "INVALID_RECIPIENT") {
    return {
      eligible: false,
      classification: "INVALID_RECIPIENT",
      reason: "Recipient phone number is invalid or not registered on WhatsApp.",
      actionAdvice: "Update the customer's phone number before attempting to message them.",
    };
  }

  // 5. Customer opted out
  if (parsed.classification === "OPT_OUT") {
    return {
      eligible: false,
      classification: "OPT_OUT",
      reason: "Customer has opted out of promotional WhatsApp communications.",
      actionAdvice: "Do not resend unless the customer explicitly re-opts into communications.",
    };
  }

  // 6. Template Error
  if (parsed.classification === "TEMPLATE_ERROR") {
    return {
      eligible: false,
      classification: "TEMPLATE_ERROR",
      reason: "Meta WhatsApp template issue or formatting parameter mismatch.",
      actionAdvice: "Check template approval status in WhatsApp Manager before retrying.",
    };
  }

  // 7. Authentication / Service error
  if (parsed.classification === "AUTH_ERROR") {
    return {
      eligible: false,
      classification: "AUTH_ERROR",
      reason: "WhatsApp authentication or service connection failure.",
      actionAdvice: "Check Meta access token and connection status in WhatsApp Settings. Campaign paused.",
    };
  }

  // 8. Spam Rate Limit (131048: Do NOT automatically retry)
  if (parsed.classification === "SPAM_RATE_LIMIT") {
    return {
      eligible: false,
      classification: "SPAM_RATE_LIMIT",
      reason: "Meta spam rate limit reached for this phone number. Do not automatically retry.",
      actionAdvice: "Flag for review. Check recipient messaging velocity and template quality score.",
    };
  }

  // 9. Rate Limits (Throughput, Pair, App Level)
  if (
    parsed.classification === "THROUGHPUT_LIMIT" ||
    parsed.classification === "PAIR_RATE_LIMIT" ||
    parsed.classification === "APP_LEVEL_LIMIT" ||
    parsed.classification === "RATE_LIMIT"
  ) {
    return {
      eligible: true,
      classification: parsed.classification,
      reason: parsed.details || "Meta rate limit reached.",
      actionAdvice: "Wait for cooldown before dispatching.",
    };
  }

  // 9. Transient server/network error
  return {
    eligible: true,
    classification: "TRANSIENT_API_ERROR",
    reason: parsed.details || "Temporary network or server delivery issue.",
    actionAdvice: "Eligible for delayed retry.",
  };
}
