/**
 * BLOW SALON — WhatsApp Status Transition & Downgrade Validator
 * Centralized, authoritative rules for message and queue status lifecycles across:
 * - whatsapp_messages
 * - whatsappCampaignJobs
 * - whatsapp_campaign_recipients
 */

export type StatusTransitionAction = "APPLY_UPDATE" | "IDEMPOTENT_NOOP" | "SKIP_DOWNGRADE";

export interface StatusTransitionDecision {
  allowed: boolean;
  action: StatusTransitionAction;
  reason: string;
}

/**
 * Forward delivery progression ranks.
 * Used exclusively for progressing messages along the delivery lifecycle:
 * PENDING / QUEUED / RETRY_WAIT / AMBIGUOUS -> PROCESSING -> ACCEPTED -> SENT -> DELIVERED -> READ
 */
export const FORWARD_DELIVERY_RANK: Record<string, number> = {
  PENDING: 1,
  QUEUED: 1,
  RETRY_WAIT: 1,
  AMBIGUOUS: 1,
  NOT_SENT: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  SENT: 4,
  DELIVERED: 5,
  READ: 6,
};

/**
 * Masks a WhatsApp Message ID (WAMID) for safe structured logging.
 * Preserves prefix and suffix while obscuring payload hash digits.
 */
export function maskWamid(id: string | null | undefined): string {
  if (!id) return "N/A";
  const str = String(id).trim();
  if (str.length <= 16) return str;
  return `${str.substring(0, 10)}...${str.substring(str.length - 6)}`;
}

/**
 * Validates whether an incoming status update can be applied over an existing status.
 *
 * Requirements:
 * 1. ACCEPTED -> FAILED must be allowed.
 * 2. SENT -> FAILED must be allowed.
 * 3. PROCESSING -> FAILED must be allowed.
 * 4. SENT -> DELIVERED must be allowed.
 * 5. DELIVERED -> READ must be allowed.
 * 6. DELIVERED -> FAILED must NOT be allowed (cannot downgrade confirmed delivery).
 * 7. READ -> FAILED must NOT be allowed (cannot downgrade confirmed read).
 * 8. Duplicate webhook events must be idempotent (IDEMPOTENT_NOOP).
 * 9. Older events must not overwrite newer confirmed delivery states (SKIP_DOWNGRADE).
 */
export function canTransitionStatus(
  currentStatus: string | null | undefined,
  incomingStatus: string | null | undefined
): StatusTransitionDecision {
  const current = (currentStatus || "").trim().toUpperCase();
  const incoming = (incomingStatus || "").trim().toUpperCase();

  if (!incoming) {
    return {
      allowed: false,
      action: "IDEMPOTENT_NOOP",
      reason: "Incoming status is empty",
    };
  }

  if (!current) {
    return {
      allowed: true,
      action: "APPLY_UPDATE",
      reason: "Initial status assignment",
    };
  }

  // 1. Idempotency: exact duplicate status
  if (current === incoming) {
    return {
      allowed: false,
      action: "IDEMPOTENT_NOOP",
      reason: `Duplicate status event: ${current}`,
    };
  }

  // 2. Protected states that should not be touched by webhooks
  if (current === "EXCLUDED" || current === "CANCELLED") {
    return {
      allowed: false,
      action: "SKIP_DOWNGRADE",
      reason: `Cannot modify ${current} record via webhook event`,
    };
  }

  // 3. READ is the highest terminal confirmed delivery state. Nothing can downgrade it.
  if (current === "READ") {
    return {
      allowed: false,
      action: "SKIP_DOWNGRADE",
      reason: `Cannot downgrade READ state to ${incoming}`,
    };
  }

  // 4. DELIVERED is a confirmed device delivery state.
  // Only progression to READ is allowed. Never downgrade to FAILED, SENT, ACCEPTED, etc.
  if (current === "DELIVERED") {
    if (incoming === "READ") {
      return {
        allowed: true,
        action: "APPLY_UPDATE",
        reason: "Progression from DELIVERED to READ",
      };
    }
    return {
      allowed: false,
      action: "SKIP_DOWNGRADE",
      reason: `Cannot downgrade confirmed DELIVERED state to ${incoming}`,
    };
  }

  // 5. Incoming FAILED:
  // Allowed from any non-delivered state (ACCEPTED, SENT, PROCESSING, PENDING, QUEUED, RETRY_WAIT, AMBIGUOUS)
  if (incoming === "FAILED") {
    return {
      allowed: true,
      action: "APPLY_UPDATE",
      reason: `Delivery failure applied over unconfirmed ${current} state`,
    };
  }

  // 6. Incoming DELIVERED or READ when current is FAILED:
  // If a message was temporarily marked FAILED (e.g. timeout) but Meta confirmed delivery/read:
  if (current === "FAILED") {
    if (incoming === "DELIVERED" || incoming === "READ") {
      return {
        allowed: true,
        action: "APPLY_UPDATE",
        reason: `Confirmed ${incoming} overrides prior unconfirmed FAILED state`,
      };
    }
    return {
      allowed: false,
      action: "SKIP_DOWNGRADE",
      reason: `Cannot transition FAILED to ${incoming}`,
    };
  }

  // 7. General forward delivery progression (e.g. ACCEPTED -> SENT -> DELIVERED -> READ)
  const currentRank = FORWARD_DELIVERY_RANK[current] || 0;
  const incomingRank = FORWARD_DELIVERY_RANK[incoming] || 0;

  if (incomingRank > currentRank) {
    return {
      allowed: true,
      action: "APPLY_UPDATE",
      reason: `Forward progression from ${current} (rank ${currentRank}) to ${incoming} (rank ${incomingRank})`,
    };
  }

  return {
    allowed: false,
    action: "SKIP_DOWNGRADE",
    reason: `Cannot downgrade from ${current} (rank ${currentRank}) to ${incoming} (rank ${incomingRank})`,
  };
}

