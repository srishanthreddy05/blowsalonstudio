/**
 * Meta Facebook Login for Business & WhatsApp Embedded Signup Client Utility
 * Dedicated for WhatsApp Business App <-> Cloud API Coexistence Onboarding.
 * 
 * IMPORTANT:
 * - Uses exact Meta Configuration ID: 1534814405338722
 * - Feature: "whatsapp_business_app_onboarding"
 * - sessionInfoVersion: "3"
 * - Response type: "code" (override_default_response_type: true)
 * - Never logs or exposes access tokens or secrets.
 */

export const META_COEXISTENCE_CONFIG_ID = "1534814405338722";
export const META_APP_ID =
  process.env.NEXT_PUBLIC_META_APP_ID ||
  process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ||
  "2308689169962503";

export interface EmbeddedSignupSessionData {
  phone_number_id?: string;
  waba_id?: string;
  current_step?: string;
  [key: string]: unknown;
}

export interface LaunchEmbeddedSignupResult {
  success: boolean;
  code?: string;
  wabaId?: string;
  phoneNumberId?: string;
  sessionData?: EmbeddedSignupSessionData;
  error?: string;
  stage?: string;
  cancelled?: boolean;
  httpsRequired?: boolean;
}

// Global declaration for Facebook JS SDK
declare global {
  interface Window {
    FB?: {
      init: (params: {
        appId: string;
        cookie?: boolean;
        autoLogAppEvents?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: {
          authResponse?: {
            code?: string;
            accessToken?: string;
            expiresIn?: number;
            [key: string]: unknown;
          };
          status?: string;
          error?: unknown;
        }) => void,
        options: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<void> | null = null;

/**
 * Cleanly loads and initializes the Facebook JavaScript SDK.
 * Ensures the SDK script is injected only once across components.
 */
export function loadFacebookSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.FB) {
    return Promise.resolve();
  }

  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = new Promise<void>((resolve, reject) => {
    // Set up the initialization callback before script injects
    window.fbAsyncInit = function () {
      try {
        window.FB?.init({
          appId: META_APP_ID,
          cookie: true,
          autoLogAppEvents: true,
          xfbml: false,
          version: "v21.0",
        });
        console.log(`[Meta SDK] Facebook JavaScript SDK initialized successfully (App ID: ${META_APP_ID}, Version: v21.0).`);
        resolve();
      } catch (err) {
        console.error("[Meta SDK] FB.init error:", err instanceof Error ? err.message : err);
        reject(err);
      }
    };

    // Check if the script tag already exists in the document
    const existingScript = document.getElementById("facebook-jssdk");
    if (existingScript) {
      if (window.FB) {
        try {
          window.FB.init({
            appId: META_APP_ID,
            cookie: true,
            autoLogAppEvents: true,
            xfbml: false,
            version: "v21.0",
          });
          resolve();
        } catch (e) {
          console.warn("[Meta SDK] FB re-init notice:", e);
          resolve();
        }
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Failed to load Meta Facebook SDK. Please check network or ad-blocker."));
    };

    document.head.appendChild(script);
  });

  return sdkPromise;
}

export function isAllowedMetaOrigin(origin: string): boolean {
  if (!origin || typeof origin !== "string") return false;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.com" ||
      host.endsWith(".fb.com") ||
      host === "facebook.net" ||
      host.endsWith(".facebook.net") ||
      host === "meta.com" ||
      host.endsWith(".meta.com")
    );
  } catch {
    const clean = origin.toLowerCase().replace(/^https?:\/\//, "").replace(/:\d+.*$/, "");
    return (
      clean === "facebook.com" ||
      clean.endsWith(".facebook.com") ||
      clean === "fb.com" ||
      clean.endsWith(".fb.com") ||
      clean === "facebook.net" ||
      clean.endsWith(".facebook.net") ||
      clean === "meta.com" ||
      clean.endsWith(".meta.com")
    );
  }
}

export interface ParsedMetaMessageEvent {
  eventType?: string;
  eventVersion?: number | string;
  wabaId?: string;
  phoneNumberId?: string;
  currentStep?: string;
  fullPayload?: EmbeddedSignupSessionData;
}

export interface SafeMetaDiagnosticInfo {
  origin: string;
  dataType: string;
  topLevelKeys: string[];
  type?: string;
  event?: string;
  nestedDataKeys?: string[];
}

/**
 * Safely inspects and logs window message events from Facebook/Meta origins.
 * NEVER logs tokens, authorization codes, phone numbers, or secrets.
 * Only logs structural metadata: origin, typeof data, top-level keys, type, event, and nested data keys.
 */
export function logSafeMetaMessageDiagnostic(
  origin: string,
  rawDataInput: unknown
): SafeMetaDiagnosticInfo | null {
  if (!isAllowedMetaOrigin(origin)) {
    return null;
  }

  let parsed: Record<string, unknown> | null = null;
  const rawType = typeof rawDataInput;

  if (rawType === "string") {
    try {
      const obj = JSON.parse(rawDataInput as string);
      if (obj && typeof obj === "object") {
        parsed = obj as Record<string, unknown>;
      }
    } catch {
      // Non-JSON string message (e.g. SDK internal arbiter / XD string)
    }
  } else if (rawType === "object" && rawDataInput !== null) {
    parsed = rawDataInput as Record<string, unknown>;
  }

  const topLevelKeys = parsed ? Object.keys(parsed) : [];
  const dataTypeField =
    parsed && typeof parsed.type === "string"
      ? parsed.type
      : parsed && typeof parsed.action === "string"
      ? parsed.action
      : undefined;
  const dataEventField = parsed && typeof parsed.event === "string" ? parsed.event : undefined;

  let nestedKeys: string[] | undefined;
  if (parsed && parsed.data !== undefined) {
    if (typeof parsed.data === "object" && parsed.data !== null) {
      nestedKeys = Object.keys(parsed.data);
    } else if (typeof parsed.data === "string") {
      try {
        const nestedObj = JSON.parse(parsed.data);
        if (nestedObj && typeof nestedObj === "object") {
          nestedKeys = Object.keys(nestedObj);
        } else {
          nestedKeys = ["(primitive string)"];
        }
      } catch {
        nestedKeys = ["(non-json string)"];
      }
    } else {
      nestedKeys = [`(${typeof parsed.data})`];
    }
  }

  const info: SafeMetaDiagnosticInfo = {
    origin,
    dataType: rawType,
    topLevelKeys,
    type: dataTypeField,
    event: dataEventField,
    nestedDataKeys: nestedKeys,
  };

  console.log("[Embedded Signup:Diagnostic] Meta origin window message received:", info);
  return info;
}

export const KNOWN_WA_SIGNUP_EVENTS = [
  "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  "FINISH_ONLY_WABA",
  "FINISH",
  "CANCEL",
  "ERROR",
];

export function parseMetaMessageEvent(origin: string, rawDataInput: unknown): ParsedMetaMessageEvent | null {
  if (!isAllowedMetaOrigin(origin)) {
    return null;
  }

  try {
    let rawData = rawDataInput;
    if (typeof rawData === "string") {
      try {
        rawData = JSON.parse(rawData);
        // Handle double-serialized JSON
        if (typeof rawData === "string") {
          try {
            rawData = JSON.parse(rawData);
          } catch {
            // retain first parse
          }
        }
      } catch {
        return null;
      }
    }
    if (!rawData || typeof rawData !== "object") return null;

    const dataObj = rawData as Record<string, unknown>;

    // Type field check - case-insensitive; also checks action/event_type
    const rawType =
      typeof dataObj.type === "string"
        ? dataObj.type.trim()
        : typeof dataObj.action === "string"
        ? dataObj.action.trim()
        : typeof dataObj.event_type === "string"
        ? dataObj.event_type.trim()
        : "";

    const upperType = rawType.toUpperCase();

    // Event field check - case-insensitive
    const rawEvent = typeof dataObj.event === "string" ? dataObj.event.trim() : "";
    const upperEvent = rawEvent.toUpperCase();

    const isWaSignupType =
      upperType === "WA_EMBEDDED_SIGNUP" ||
      upperType === "WHATSAPP_EMBEDDED_SIGNUP" ||
      upperType === "WA_SIGNUP";

    const isKnownWaEvent = KNOWN_WA_SIGNUP_EVENTS.includes(upperEvent);

    // Accept if type matches WA_EMBEDDED_SIGNUP OR if event is a known WhatsApp onboarding event
    if (!isWaSignupType && !isKnownWaEvent) {
      return null;
    }

    const eventType = upperEvent || upperType;

    let nestedData: Record<string, unknown> = {};
    if (typeof dataObj.data === "string") {
      try {
        nestedData = JSON.parse(dataObj.data);
        if (typeof nestedData === "string") {
          try {
            nestedData = JSON.parse(nestedData);
          } catch {}
        }
      } catch {
        nestedData = {};
      }
    } else if (dataObj.data && typeof dataObj.data === "object") {
      nestedData = dataObj.data as Record<string, unknown>;
    }

    const rawVersion =
      dataObj.version ??
      nestedData.version ??
      dataObj.sessionInfoVersion ??
      nestedData.sessionInfoVersion;

    const eventVersion =
      typeof rawVersion === "number" || typeof rawVersion === "string"
        ? rawVersion
        : undefined;

    const rawWaba =
      nestedData.waba_id ??
      nestedData.wabaId ??
      nestedData.account_id ??
      nestedData.accountId ??
      nestedData.business_account_id ??
      dataObj.waba_id ??
      dataObj.wabaId ??
      dataObj.account_id ??
      dataObj.accountId ??
      dataObj.business_account_id;

    const rawPhone =
      nestedData.phone_number_id ??
      nestedData.phoneNumberId ??
      nestedData.phone_id ??
      nestedData.phoneId ??
      dataObj.phone_number_id ??
      dataObj.phoneNumberId ??
      dataObj.phone_id ??
      dataObj.phoneId;

    const rawStep =
      nestedData.current_step ??
      nestedData.currentStep ??
      nestedData.step ??
      nestedData.screen ??
      dataObj.current_step ??
      dataObj.currentStep ??
      dataObj.step ??
      dataObj.screen;

    const wabaId =
      typeof rawWaba === "string" && rawWaba.trim()
        ? rawWaba.trim()
        : typeof rawWaba === "number"
        ? String(rawWaba)
        : undefined;

    const phoneNumberId =
      typeof rawPhone === "string" && rawPhone.trim()
        ? rawPhone.trim()
        : typeof rawPhone === "number"
        ? String(rawPhone)
        : undefined;

    const currentStep =
      typeof rawStep === "string" && rawStep.trim()
        ? rawStep.trim()
        : undefined;

    const fullPayload: EmbeddedSignupSessionData = {
      ...nestedData,
      ...dataObj,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      current_step: currentStep,
      event: eventType,
      version: eventVersion,
    };

    return {
      eventType,
      eventVersion,
      wabaId,
      phoneNumberId,
      currentStep,
      fullPayload,
    };
  } catch {
    return null;
  }
}

/**
 * Per-launch diagnostics. Records WHAT arrived from Meta (event names, counts,
 * step names) without ever storing tokens, codes, IDs, or personal data in logs.
 */
export interface SignupDiagnostics {
  /** postMessages received from an allowed Meta origin */
  metaOriginMessages: number;
  /** Meta-origin messages that were not WA_EMBEDDED_SIGNUP (SDK internals etc.) */
  ignoredMetaMessages: number;
  /** Messages mentioning WA_EMBEDDED_SIGNUP that were rejected by origin filtering */
  rejectedOriginSignupMessages: number;
  /** WA_EMBEDDED_SIGNUP event names in arrival order */
  waSignupEvents: string[];
  lastStep?: string;
  /** Payload of FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING (Coexistence) */
  coexistencePayload?: EmbeddedSignupSessionData;
  /** FINISH / FINISH_ONLY_WABA — standard Embedded Signup, NOT Coexistence */
  standardFinishEvent?: string;
  cancelled: boolean;
  errored: boolean;
  errorMessage?: string;
  /** Safe diagnostic summary of the last ignored Meta message (keys and type/event only) */
  lastIgnoredMetaSummary?: string;
}

export const COEXISTENCE_FINISH_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
export const STANDARD_FINISH_EVENTS = ["FINISH", "FINISH_ONLY_WABA"];

export function createSignupDiagnostics(): SignupDiagnostics {
  return {
    metaOriginMessages: 0,
    ignoredMetaMessages: 0,
    rejectedOriginSignupMessages: 0,
    waSignupEvents: [],
    cancelled: false,
    errored: false,
  };
}

function mentionsEmbeddedSignup(data: unknown): boolean {
  try {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    return typeof text === "string" && text.includes("WA_EMBEDDED_SIGNUP");
  } catch {
    return false;
  }
}

function getSafeStructureSummary(data: unknown): string {
  try {
    let obj: Record<string, unknown> | null = null;
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === "object") obj = parsed;
        else return "non-object string";
      } catch {
        return "non-json string";
      }
    } else if (typeof data === "object" && data !== null) {
      obj = data as Record<string, unknown>;
    }
    if (!obj) return typeof data;

    const parts: string[] = [];
    if (obj.type) parts.push(`type=${String(obj.type).slice(0, 30)}`);
    if (obj.event) parts.push(`event=${String(obj.event).slice(0, 30)}`);
    const keys = Object.keys(obj).slice(0, 5);
    parts.push(`keys=[${keys.join(",")}]`);
    return parts.join(" ");
  } catch {
    return "uninspectable";
  }
}

/**
 * Records a single window `message` event into diagnostics.
 * Every WA_EMBEDDED_SIGNUP event is recorded — none are silently dropped.
 */
export function recordMetaMessage(
  diag: SignupDiagnostics,
  origin: string,
  data: unknown
): ParsedMetaMessageEvent | null {
  if (!isAllowedMetaOrigin(origin)) {
    if (mentionsEmbeddedSignup(data)) {
      diag.rejectedOriginSignupMessages += 1;
    }
    return null;
  }

  diag.metaOriginMessages += 1;
  const parsed = parseMetaMessageEvent(origin, data);
  if (!parsed) {
    diag.ignoredMetaMessages += 1;
    diag.lastIgnoredMetaSummary = getSafeStructureSummary(data);
    return null;
  }

  const eventName = parsed.eventType || "UNKNOWN";
  diag.waSignupEvents.push(eventName);
  if (parsed.currentStep) diag.lastStep = parsed.currentStep;

  if (eventName === COEXISTENCE_FINISH_EVENT) {
    diag.coexistencePayload = parsed.fullPayload;
  } else if (STANDARD_FINISH_EVENTS.includes(eventName)) {
    diag.standardFinishEvent = eventName;
  } else if (eventName === "CANCEL") {
    diag.cancelled = true;
  } else if (eventName === "ERROR") {
    diag.errored = true;
    const msg = parsed.fullPayload?.error_message;
    if (typeof msg === "string" && msg.trim()) {
      diag.errorMessage = msg.trim().slice(0, 200);
    }
  }
  return parsed;
}

/** True once Meta has sent an event that ends the session. */
export function hasTerminalEvent(diag: SignupDiagnostics): boolean {
  return Boolean(
    diag.coexistencePayload || diag.standardFinishEvent || diag.cancelled || diag.errored
  );
}

/** Safe one-line summary (event names, counts, and structural clues only). */
export function summarizeDiagnostics(diag: SignupDiagnostics): string {
  const events = diag.waSignupEvents.length ? diag.waSignupEvents.join(">") : "none";
  let summary = `metaMessages=${diag.metaOriginMessages}, signupEvents=[${events}], ignoredMetaMessages=${diag.ignoredMetaMessages}, rejectedByOrigin=${diag.rejectedOriginSignupMessages}`;
  if (diag.lastStep) {
    summary += `, lastStep=${diag.lastStep}`;
  }
  if (diag.lastIgnoredMetaSummary) {
    summary += `, lastIgnored=[${diag.lastIgnoredMetaSummary}]`;
  }
  return summary;
}

/**
 * Decides the onboarding outcome after Facebook OAuth returned an auth code.
 * An OAuth code alone is NEVER treated as completed onboarding. Success requires
 * the Coexistence completion event carrying a non-empty WABA ID.
 */
export function classifyOnboardingOutcome(
  authCode: string | undefined,
  diag: SignupDiagnostics
): LaunchEmbeddedSignupResult {
  const summary = summarizeDiagnostics(diag);

  if (diag.cancelled) {
    return {
      success: false,
      cancelled: true,
      stage: "USER_CANCELLED",
      error: `[Stage: User Cancelled] WhatsApp connection was cancelled${
        diag.lastStep ? ` at step: ${diag.lastStep}` : ""
      }.`,
    };
  }

  if (diag.errored) {
    return {
      success: false,
      stage: "POPUP_ERROR",
      error: `[Stage: Popup Error] Meta Embedded Signup reported an error${
        diag.errorMessage ? `: ${diag.errorMessage}` : ""
      }. (${summary})`,
    };
  }

  if (diag.coexistencePayload) {
    const wabaId = diag.coexistencePayload.waba_id;
    if (typeof wabaId === "string" && wabaId.trim()) {
      const phone = diag.coexistencePayload.phone_number_id;
      return {
        success: true,
        stage: "ONBOARDING_COMPLETED",
        code: authCode,
        wabaId: wabaId.trim(),
        phoneNumberId: typeof phone === "string" && phone.trim() ? phone.trim() : undefined,
        sessionData: diag.coexistencePayload,
      };
    }
    return {
      success: false,
      stage: "COEXISTENCE_MISSING_WABA",
      error: `[Stage: Coexistence Event Without WABA] Meta sent ${COEXISTENCE_FINISH_EVENT} but it contained no WhatsApp Business Account ID. Nothing was saved. (${summary})`,
    };
  }

  if (diag.standardFinishEvent) {
    return {
      success: false,
      stage: "STANDARD_FLOW_COMPLETED",
      error: `[Stage: Wrong Onboarding Flow] Meta completed the standard Embedded Signup (${diag.standardFinishEvent}) instead of WhatsApp Business App onboarding (${COEXISTENCE_FINISH_EVENT}). The existing-app option was not offered or not selected in the popup. Nothing was saved. (${summary})`,
    };
  }

  if (diag.waSignupEvents.length > 0) {
    return {
      success: false,
      stage: "POPUP_INCOMPLETE",
      error: `[Stage: Popup Incomplete] Meta onboarding events arrived but no completion event was sent${
        diag.lastStep ? ` (last step: ${diag.lastStep})` : ""
      }. (${summary})`,
    };
  }

  if (diag.rejectedOriginSignupMessages > 0) {
    return {
      success: false,
      stage: "ORIGIN_FILTERED",
      error: `[Stage: Event Rejected By Origin Filter] A WA_EMBEDDED_SIGNUP message arrived from an origin outside the Meta allow-list and was ignored. (${summary})`,
    };
  }

  const currentDomain = typeof window !== "undefined" ? window.location.origin : "https://blowsalonstudio.vercel.app";

  return {
    success: false,
    stage: "NO_SIGNUP_EVENT",
    error:
      `[Stage: No Onboarding Event] Facebook OAuth succeeded (authorization code received), but Meta sent no WhatsApp onboarding event (WA_EMBEDDED_SIGNUP). The WhatsApp Business wizard did not run inside the popup.\n\n` +
      `Check these causes in Meta App Dashboard (App ID: ${META_APP_ID}, Config ID: ${META_COEXISTENCE_CONFIG_ID}):\n` +
      `1. Wrong Config Type: The configuration must be created under 'Facebook Login for Business' with Login variation 'WhatsApp Embedded Signup' (not 'General').\n` +
      `2. Coexistence Not Enabled: WhatsApp Business App Onboarding / Coexistence must be enabled on this configuration.\n` +
      `3. Domain Not Allowed: Domain (${currentDomain}) must be added to 'Allowed Domains for the JavaScript SDK' in Facebook Login for Business settings.\n` +
      `4. App Roles / Mode: If the app is in 'Development' mode, your Meta account or Business Portfolio must have an assigned Role (Administrator, Developer, or Tester), or the app must be in 'Live' mode with required permissions.\n\n` +
      `Diagnostics: (${summary})`,
  };
}

/**
 * Launches Meta Facebook Login for Business with Embedded Signup
 * configured specifically for WhatsApp Business App Coexistence.
 *
 * CRITICAL:
 * Must be called synchronously from the user's click handler without awaiting
 * asynchronous operations first, ensuring modern browsers maintain transient
 * user activation and do not block the popup or sever window.opener cross-origin messaging.
 *
 * IMPORTANT: Meta enforces HTTPS for FB.login() as of June 2018.
 * This will NOT work on plain http://localhost. You must use HTTPS:
 *   - Production: works automatically (HTTPS)
 *   - Local dev: use `ngrok http 3000` and open the ngrok HTTPS URL
 * Reference: https://developers.facebook.com/blog/post/2018/06/08/enforce-https-facebook-login/
 */
export function launchWhatsAppBusinessOnboarding(): Promise<LaunchEmbeddedSignupResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ success: false, error: "Window is not available." });
  }

  // Meta enforces HTTPS for FB.login(). Detect HTTP early and return a clear diagnostic.
  if (window.location.protocol === "http:") {
    return Promise.resolve({
      success: false,
      httpsRequired: true,
      stage: "HTTPS_REQUIRED",
      error:
        "Meta Embedded Signup requires HTTPS. " +
        "For local testing, use ngrok: run `ngrok http 3000` and open the https:// URL it provides. " +
        "In production this works automatically.",
    });
  }

  const fb = window.FB;
  if (!fb) {
    // Trigger background load if SDK is missing, and instruct user to click again
    loadFacebookSdk().catch(() => {});
    return Promise.resolve({
      success: false,
      stage: "SDK_INITIALIZING",
      error:
        "[Stage: SDK Initializing] Meta Facebook SDK was not ready. It has now been initiated. Please click 'Connect WhatsApp Business App' again to launch the popup directly.",
    });
  }

  console.log(
    `[Embedded Signup] Launching Embedded Signup (App ID: ${META_APP_ID}, Config ID: ${META_COEXISTENCE_CONFIG_ID})`
  );

  return new Promise<LaunchEmbeddedSignupResult>((resolve) => {
    const diag = createSignupDiagnostics();
    let isFinished = false;

    // Listen to ALL window messages so we can tell "Meta sent nothing" apart from
    // "Meta sent something we ignored". Only structural metadata is logged, never payload values.
    const messageListener = (event: MessageEvent) => {
      logSafeMetaMessageDiagnostic(event.origin, event.data);
      const parsed = recordMetaMessage(diag, event.origin, event.data);
      if (!parsed) return;

      console.log(
        `[Embedded Signup:Client] WA_EMBEDDED_SIGNUP event: event=${parsed.eventType || "UNKNOWN"}, version=${
          parsed.eventVersion || "N/A"
        }, hasWabaId=${Boolean(parsed.wabaId)}, hasPhoneNumberId=${Boolean(parsed.phoneNumberId)}${
          parsed.currentStep ? `, step=${parsed.currentStep}` : ""
        }`
      );
    };

    // REGISTER LISTENER BEFORE FB.login IS CALLED
    window.addEventListener("message", messageListener);

    const cleanup = () => {
      if (!isFinished) {
        isFinished = true;
        window.removeEventListener("message", messageListener);
      }
    };

    try {
      console.log(
        `[Embedded Signup:Client] Invoking FB.login popup directly from click (config_id=${META_COEXISTENCE_CONFIG_ID}, featureType=whatsapp_business_app_onboarding, sessionInfoVersion=3)`
      );

      // Must pass a standard synchronous function to fb.login:
      // Meta Facebook JS SDK strictly validates callback type (Object.prototype.toString)
      // and throws "Expression is of type asyncfunction, not function" if passed an AsyncFunction.
      fb.login(
        (response) => {
          const handleLoginResponse = async () => {
            console.log(
              `[Embedded Signup:Client] FB.login callback invoked: status=${response?.status || "UNKNOWN"}, hasAuthResponse=${Boolean(
                response?.authResponse
              )}, hasError=${Boolean(response?.error)}`
            );

            // Wait grace window (1500ms) after the popup closes to capture any in-flight postMessage events from Meta.
            // Do NOT remove the message listener until after the popup closes plus this grace window.
            const GRACE_WINDOW_MS = 1500;
            const deadline = Date.now() + GRACE_WINDOW_MS;
            while (!hasTerminalEvent(diag) && Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 100));
            }

            // Yield an extra tick for microtasks
            await new Promise((r) => setTimeout(r, 50));

            // REMOVE LISTENER ONLY AFTER POPUP CLOSED PLUS GRACE WINDOW
            cleanup();

            if (response?.error) {
              const errDetail =
                typeof response.error === "object" && response.error !== null
                  ? (response.error as { message?: string }).message || "Meta login error"
                  : String(response.error);
              console.error("[Embedded Signup:Client] FB.login error details:", errDetail);
              return resolve({
                success: false,
                stage: "OAUTH_ERROR",
                error: `[Stage: OAuth Error] Facebook Login authorization failed: ${errDetail}`,
              });
            }

            if (!response || response.status === "unknown" || !response.authResponse) {
              console.log(
                `[Embedded Signup:Client] Facebook login cancelled or window closed. (${summarizeDiagnostics(diag)})`
              );
              if (diag.cancelled || diag.errored || diag.waSignupEvents.length > 0) {
                return resolve(classifyOnboardingOutcome(undefined, diag));
              }
              return resolve({
                success: false,
                cancelled: true,
                stage: "USER_CANCELLED",
                error: `[Stage: User Cancelled] WhatsApp connection was cancelled by the user${
                  diag.lastStep ? ` at step: ${diag.lastStep}` : ""
                }.`,
              });
            }

            const authCode = response.authResponse.code;

            console.log(
              `[Embedded Signup:Client] OAuth complete: hasAuthCode=${Boolean(authCode)}, ${summarizeDiagnostics(diag)}`
            );

            const outcome = classifyOnboardingOutcome(authCode, diag);
            if (!outcome.success) {
              console.warn(`[Embedded Signup:Client] Onboarding not completed: stage=${outcome.stage}`);
            }
            return resolve(outcome);
          };

          handleLoginResponse().catch((err) => {
            cleanup();
            const msg = err instanceof Error ? err.message : "Error handling login response";
            console.error("[Embedded Signup:Client] Handler error:", msg);
            resolve({
              success: false,
              stage: "HANDLER_ERROR",
              error: "[Stage: Handler Error] WhatsApp connection could not be completed: " + msg,
            });
          });
        },
        {
          config_id: META_COEXISTENCE_CONFIG_ID,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: "whatsapp_business_app_onboarding",
            sessionInfoVersion: "3",
          },
        }
      );
    } catch (err: unknown) {
      cleanup();
      const msg = err instanceof Error ? err.message : "Error launching Meta Embedded Signup";
      console.error("[Embedded Signup] Launch error:", msg);
      return resolve({
        success: false,
        stage: "LAUNCH_ERROR",
        error: "[Stage: Launch Error] WhatsApp connection could not be completed: " + msg,
      });
    }
  });
}
