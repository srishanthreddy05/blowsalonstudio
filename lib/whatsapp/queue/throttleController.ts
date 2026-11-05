/**
 * WhatsApp Campaign Queue Throttle & Pacing Controller
 * Manages configurable message delays, adaptive throttling, and backoff calculations.
 */

export interface QueueConfig {
  sendDelayMs: number;
  maxConcurrency: number;
  maxRetries: number;
  minDelayMs: number;
  maxDelayMs: number;
  dailySafetyBudget: number;
}

export interface ThrottleState {
  currentDelayMs: number;
  consecutiveRateLimits: number;
  consecutiveSuccesses: number;
  pausedUntilMs: number;
  updatedAt: string;
}

// In-memory cache for fast local access, synchronized with Firestore
let inMemoryThrottleState: ThrottleState = {
  currentDelayMs: 3000,
  consecutiveRateLimits: 0,
  consecutiveSuccesses: 0,
  pausedUntilMs: 0,
  updatedAt: new Date().toISOString(),
};

/**
 * Returns configurable queue settings with safe fallbacks.
 * Never hardcodes delays or limits throughout the codebase.
 */
export function getQueueConfig(): QueueConfig {
  const sendDelayMs = parseInt(process.env.WHATSAPP_SEND_DELAY_MS || "3000", 10);
  const maxConcurrency = parseInt(process.env.WHATSAPP_MAX_CONCURRENCY || "1", 10);
  const maxRetries = parseInt(process.env.WHATSAPP_MAX_RETRIES || "3", 10);
  const minDelayMs = parseInt(process.env.WHATSAPP_MIN_DELAY_MS || "1000", 10);
  const maxDelayMs = parseInt(process.env.WHATSAPP_MAX_DELAY_MS || "30000", 10);
  const dailySafetyBudget = parseInt(process.env.WHATSAPP_DAILY_SAFETY_BUDGET || "1800", 10);

  return {
    sendDelayMs: isNaN(sendDelayMs) || sendDelayMs < 0 ? 3000 : sendDelayMs,
    maxConcurrency: isNaN(maxConcurrency) || maxConcurrency < 1 ? 1 : maxConcurrency,
    maxRetries: isNaN(maxRetries) || maxRetries < 0 ? 3 : maxRetries,
    minDelayMs: isNaN(minDelayMs) || minDelayMs < 500 ? 1000 : minDelayMs,
    maxDelayMs: isNaN(maxDelayMs) || maxDelayMs < 5000 ? 30000 : maxDelayMs,
    dailySafetyBudget: isNaN(dailySafetyBudget) || dailySafetyBudget < 100 ? 1800 : dailySafetyBudget,
  };
}

/**
 * Standard retry intervals per attempt number:
 * Attempt 1 failure -> 30s delay
 * Attempt 2 failure -> 2m (120s) delay
 * Attempt 3 failure -> 5m (300s) delay
 */
export const STANDARD_RETRY_DELAYS_MS: Record<number, number> = {
  1: 30 * 1000,       // 30 seconds
  2: 2 * 60 * 1000,   // 2 minutes
  3: 5 * 60 * 1000,   // 5 minutes
};

/**
 * Calculates the next attempt timestamp.
 * Respects Retry-After when provided by Meta.
 * Otherwise uses configured retry delays or exponential backoff with jitter.
 */
export function calculateNextAttemptAt(
  attemptNumber: number,
  options?: {
    isRateLimit?: boolean;
    retryAfterSeconds?: number | null;
  }
): string {
  const nowMs = Date.now();

  // 1. Explicit Retry-After header takes highest priority
  if (options?.retryAfterSeconds && options.retryAfterSeconds > 0) {
    const jitter = Math.floor(Math.random() * 2000); // 0-2s jitter
    const delayMs = (options.retryAfterSeconds * 1000) + jitter;
    return new Date(nowMs + delayMs).toISOString();
  }

  // 2. Rate-limit backoff: exponential backoff with jitter
  if (options?.isRateLimit) {
    const baseDelay = (STANDARD_RETRY_DELAYS_MS[attemptNumber] || 60 * 1000);
    // Add 20% random jitter to avoid thundering herd
    const jitterFactor = 0.8 + Math.random() * 0.4;
    const delayMs = Math.round(baseDelay * jitterFactor);
    return new Date(nowMs + delayMs).toISOString();
  }

  // 3. Standard configured retry delays
  const defaultDelay = STANDARD_RETRY_DELAYS_MS[attemptNumber] || (5 * 60 * 1000);
  return new Date(nowMs + defaultDelay).toISOString();
}

/**
 * Updates adaptive throttle state upon successful message delivery.
 * Gradually decays delay back to baseline after sustained successes.
 */
export function recordThrottleSuccess(): ThrottleState {
  const config = getQueueConfig();
  const state = inMemoryThrottleState;

  state.consecutiveSuccesses += 1;
  state.consecutiveRateLimits = 0;

  // After 5 consecutive successes, decay delay towards baseline
  if (state.consecutiveSuccesses >= 5 && state.currentDelayMs > config.sendDelayMs) {
    const step = 500;
    state.currentDelayMs = Math.max(config.sendDelayMs, state.currentDelayMs - step);
    state.consecutiveSuccesses = 0;
  }

  state.updatedAt = new Date().toISOString();
  inMemoryThrottleState = state;
  return state;
}

/**
 * Updates adaptive throttle state upon receiving a rate-limit error.
 * Increases the delay exponentially and sets a cooling pause.
 */
export function recordThrottleRateLimit(retryAfterSeconds?: number | null): ThrottleState {
  const config = getQueueConfig();
  const state = inMemoryThrottleState;

  state.consecutiveRateLimits += 1;
  state.consecutiveSuccesses = 0;

  // Multiply delay by 1.5 - 2x up to maxDelayMs
  const multiplier = 2;
  state.currentDelayMs = Math.min(config.maxDelayMs, Math.max(state.currentDelayMs * multiplier, 6000));

  const pauseDurationMs = retryAfterSeconds && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : Math.min(60000, state.currentDelayMs * 2);

  state.pausedUntilMs = Date.now() + pauseDurationMs;
  state.updatedAt = new Date().toISOString();
  inMemoryThrottleState = state;
  return state;
}

/**
 * Returns current effective send delay in milliseconds.
 */
export function getCurrentSendDelayMs(): number {
  const config = getQueueConfig();
  return inMemoryThrottleState.currentDelayMs || config.sendDelayMs;
}

/**
 * Checks whether the queue is currently in a cooling pause due to rate limits.
 */
export function getQueueCoolingStatus(): { isCooling: boolean; remainingMs: number } {
  const now = Date.now();
  const remainingMs = Math.max(0, inMemoryThrottleState.pausedUntilMs - now);
  return {
    isCooling: remainingMs > 0,
    remainingMs,
  };
}

/**
 * Resets throttle state (e.g. for testing).
 */
export function resetThrottleState(): void {
  const config = getQueueConfig();
  inMemoryThrottleState = {
    currentDelayMs: config.sendDelayMs,
    consecutiveRateLimits: 0,
    consecutiveSuccesses: 0,
    pausedUntilMs: 0,
    updatedAt: new Date().toISOString(),
  };
}

