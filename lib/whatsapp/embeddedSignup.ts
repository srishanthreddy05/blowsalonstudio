/**
 * Meta Facebook Login for Business & WhatsApp Embedded Signup Client Utility
 * Dedicated for WhatsApp Business App <-> Cloud API Coexistence Onboarding.
 * 
 * IMPORTANT:
 * - Uses exact Meta Configuration ID: 1744937289890566
 * - Feature: "whatsapp_business_app_onboarding"
 * - sessionInfoVersion: "3"
 * - Response type: "code" (override_default_response_type: true)
 * - Never logs or exposes access tokens or secrets.
 */

export const META_COEXISTENCE_CONFIG_ID = "1744937289890566";
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
  cancelled?: boolean;
  httpsRequired?: boolean;
}

// Global declaration for Facebook JS SDK
declare global {
  interface Window {
    FB?: {
      init: (params: {
        appId: string;
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
          autoLogAppEvents: true,
          xfbml: false,
          version: "v21.0",
        });
        console.log("[Meta SDK] Facebook JavaScript SDK initialized successfully.");
        resolve();
      } catch (err) {
        console.error("[Meta SDK] FB.init error:", err instanceof Error ? err.message : err);
        reject(err);
      }
    };

    // Check if the script tag already exists in the document
    const existingScript = document.getElementById("facebook-jssdk");
    if (existingScript) {
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
      host.endsWith(".fb.com")
    );
  } catch {
    const clean = origin.toLowerCase().replace(/^https?:\/\//, "").replace(/:\d+.*$/, "");
    return (
      clean === "facebook.com" ||
      clean.endsWith(".facebook.com") ||
      clean === "fb.com" ||
      clean.endsWith(".fb.com")
    );
  }
}

export interface ParsedMetaMessageEvent {
  eventType?: string;
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
    };

    return {
      eventType,
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
 * Launches Meta Facebook Login for Business with Embedded Signup
 * configured specifically for WhatsApp Business App Coexistence.
 *
 * IMPORTANT: Meta enforces HTTPS for FB.login() as of June 2018.
 * This will NOT work on plain http://localhost. You must use HTTPS:
 *   - Production: works automatically (HTTPS)
 *   - Local dev: use `ngrok http 3000` and open the ngrok HTTPS URL
 * Reference: https://developers.facebook.com/blog/post/2018/06/08/enforce-https-facebook-login/
 */
export async function launchWhatsAppBusinessOnboarding(): Promise<LaunchEmbeddedSignupResult> {
  if (typeof window === "undefined") {
    return { success: false, error: "Window is not available." };
  }

  // Meta enforces HTTPS for FB.login(). Detect HTTP early and return a clear error.
  if (window.location.protocol === "http:") {
    return {
      success: false,
      httpsRequired: true,
      error:
        "Meta Embedded Signup requires HTTPS. " +
        "For local testing, use ngrok: run `ngrok http 3000` and open the https:// URL it provides. " +
        "In production this works automatically.",
    };
  }

  try {
    await loadFacebookSdk();
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not load Facebook SDK.",
    };
  }

  const fb = window.FB;
  if (!fb) {
    return {
      success: false,
      error: "Meta SDK is not initialized. Please refresh and try again.",
    };
  }

  console.log("[Embedded Signup] Embedded Signup started");

  return new Promise<LaunchEmbeddedSignupResult>((resolve) => {
    let capturedSessionData: EmbeddedSignupSessionData | null = null;
    let isFinished = false;

    // Listen to session postMessages from Meta popup
    const messageListener = (event: MessageEvent) => {
      const parsed = parseMetaMessageEvent(event.origin, event.data);
      if (!parsed) return;

      const { eventType, fullPayload } = parsed;

      // Handle coexistence completion, standard finish, cancel, and error
      if (
        eventType === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" ||
        eventType === "FINISH"
      ) {
        console.log("[Embedded Signup] Embedded Signup completed (Event: " + eventType + ")");
        capturedSessionData = fullPayload || null;
      } else if (eventType === "CANCEL") {
        console.log("[Embedded Signup] Embedded Signup session was cancelled by user.");
      } else if (eventType === "ERROR") {
        console.warn("[Embedded Signup] Embedded Signup returned error state.");
      }
    };

    window.addEventListener("message", messageListener);

    const cleanup = () => {
      if (!isFinished) {
        isFinished = true;
        window.removeEventListener("message", messageListener);
      }
    };

    try {
      fb.login(
        async (response) => {
          if (!response || response.status === "unknown" || !response.authResponse) {
            cleanup();
            console.log("[Embedded Signup] Facebook login cancelled or window closed.");
            return resolve({
              success: false,
              cancelled: true,
              error: "WhatsApp connection was cancelled.",
            });
          }

          const authCode = response.authResponse.code;

          // If session event has not been processed yet, give a brief 600ms grace period
          // for the postMessage event loop before removing listener and resolving
          if (!capturedSessionData?.waba_id) {
            await new Promise((r) => setTimeout(r, 600));
          }

          cleanup();

          const wabaId = capturedSessionData?.waba_id;
          const phoneNumberId = capturedSessionData?.phone_number_id;

          console.log("[Embedded Signup] Authorization response received successfully.");

          return resolve({
            success: true,
            code: authCode,
            wabaId: typeof wabaId === "string" ? wabaId : undefined,
            phoneNumberId: typeof phoneNumberId === "string" ? phoneNumberId : undefined,
            sessionData: capturedSessionData || undefined,
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
          },
        }
      );
    } catch (err: unknown) {
      cleanup();
      const msg = err instanceof Error ? err.message : "Error launching Meta Embedded Signup";
      console.error("[Embedded Signup] Launch error:", msg);
      return resolve({
        success: false,
        error: "WhatsApp connection could not be completed: " + msg,
      });
    }
  });
}
