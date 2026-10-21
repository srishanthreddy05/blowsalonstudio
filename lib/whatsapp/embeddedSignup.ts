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

export function parseMetaMessageEvent(origin: string, rawDataInput: unknown): ParsedMetaMessageEvent | null {
  if (!isAllowedMetaOrigin(origin)) {
    return null;
  }

  try {
    let rawData = rawDataInput;
    if (typeof rawData === "string") {
      try {
        rawData = JSON.parse(rawData);
      } catch {
        return null;
      }
    }
    if (!rawData || typeof rawData !== "object") return null;

    const dataObj = rawData as Record<string, unknown>;
    if (dataObj.type !== "WA_EMBEDDED_SIGNUP") {
      return null;
    }

    const eventType = typeof dataObj.event === "string" ? dataObj.event : undefined;

    let nestedData: Record<string, unknown> = {};
    if (typeof dataObj.data === "string") {
      try {
        nestedData = JSON.parse(dataObj.data);
      } catch {
        nestedData = {};
      }
    } else if (dataObj.data && typeof dataObj.data === "object") {
      nestedData = dataObj.data as Record<string, unknown>;
    }

    const rawVersion =
      dataObj.version ||
      nestedData.version ||
      dataObj.sessionInfoVersion ||
      nestedData.sessionInfoVersion;

    const eventVersion =
      typeof rawVersion === "number" || typeof rawVersion === "string"
        ? rawVersion
        : undefined;

    const rawWaba =
      nestedData.waba_id ||
      nestedData.wabaId ||
      dataObj.waba_id ||
      dataObj.wabaId;

    const rawPhone =
      nestedData.phone_number_id ||
      nestedData.phoneNumberId ||
      dataObj.phone_number_id ||
      dataObj.phoneNumberId;

    const rawStep =
      nestedData.current_step ||
      nestedData.currentStep ||
      dataObj.current_step ||
      dataObj.currentStep;

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

/** Safe one-line summary (event names and counts only). */
export function summarizeDiagnostics(diag: SignupDiagnostics): string {
  const events = diag.waSignupEvents.length ? diag.waSignupEvents.join(">") : "none";
  return `metaMessages=${diag.metaOriginMessages}, signupEvents=[${events}], ignoredMetaMessages=${diag.ignoredMetaMessages}, rejectedByOrigin=${diag.rejectedOriginSignupMessages}${
    diag.lastStep ? `, lastStep=${diag.lastStep}` : ""
  }`;
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

  return {
    success: false,
    stage: "NO_SIGNUP_EVENT",
    error: `[Stage: No Onboarding Event] Facebook OAuth succeeded, but Meta sent no WA_EMBEDDED_SIGNUP event at all, so the WhatsApp onboarding wizard did not run inside the popup. Configuration: ${META_COEXISTENCE_CONFIG_ID}. (${summary})`,
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
    `[Embedded Signup] Launching Embedded Signup (App ID: ${META_APP_ID}, Config ID: ${META_COEXISTENCE_CONFIG_ID}, Version: v4)`
  );

  return new Promise<LaunchEmbeddedSignupResult>((resolve) => {
    const diag = createSignupDiagnostics();
    let isFinished = false;

    // Listen to ALL window messages so we can tell "Meta sent nothing" apart from
    // "Meta sent something we ignored". Only names/counts are logged, never payload values.
    const messageListener = (event: MessageEvent) => {
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

    window.addEventListener("message", messageListener);

    const cleanup = () => {
      if (!isFinished) {
        isFinished = true;
        window.removeEventListener("message", messageListener);
      }
    };

    try {
      console.log(
        `[Embedded Signup:Client] Invoking FB.login popup directly from click (config_id=${META_COEXISTENCE_CONFIG_ID}, featureType=whatsapp_business_app_onboarding, version=v4, sessionInfoVersion=3, coex=true)`
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

            if (response?.error) {
              const errDetail =
                typeof response.error === "object" && response.error !== null
                  ? (response.error as { message?: string }).message || "Meta login error"
                  : String(response.error);
              console.error("[Embedded Signup:Client] FB.login error details:", errDetail);
              cleanup();
              return resolve({
                success: false,
                stage: "OAUTH_ERROR",
                error: `[Stage: OAuth Error] Facebook Login authorization failed: ${errDetail}`,
              });
            }

            if (!response || response.status === "unknown" || !response.authResponse) {
              cleanup();
              console.log(
                `[Embedded Signup:Client] Facebook login cancelled or window closed. (${summarizeDiagnostics(diag)})`
              );
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

            // The OAuth callback can fire before Meta's final postMessage is delivered.
            // Wait (up to 3s) for a terminal WA_EMBEDDED_SIGNUP event before deciding.
            const deadline = Date.now() + 3000;
            while (!hasTerminalEvent(diag) && Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 100));
            }

            cleanup();

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
            version: "v4",
            coex: true,
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
