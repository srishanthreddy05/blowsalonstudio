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
      // Validate origin from facebook.com
      if (!event.origin || (!event.origin.endsWith("facebook.com") && !event.origin.endsWith("fb.com"))) {
        return;
      }

      try {
        const rawData = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!rawData || typeof rawData !== "object") return;

        // Meta WhatsApp Embedded Signup sends messages with type === 'WA_EMBEDDED_SIGNUP'
        if (rawData.type === "WA_EMBEDDED_SIGNUP") {
          const eventType = rawData.event;
          const payloadData = (rawData.data || {}) as EmbeddedSignupSessionData;

          // Safe structured logging (NEVER logs secrets/tokens)
          if (eventType === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || eventType === "FINISH") {
            console.log("[Embedded Signup] Embedded Signup completed (Event: " + eventType + ")");
            capturedSessionData = payloadData;
          } else if (eventType === "CANCEL") {
            console.log("[Embedded Signup] Embedded Signup session was cancelled by user.");
          } else if (eventType === "ERROR") {
            console.warn("[Embedded Signup] Embedded Signup returned error state.");
          }
        }
      } catch {
        // Ignore unparseable non-JSON messages from other extensions or window communications
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
        (response) => {
          cleanup();

          if (!response || response.status === "unknown" || !response.authResponse) {
            console.log("[Embedded Signup] Facebook login cancelled or window closed.");
            return resolve({
              success: false,
              cancelled: true,
              error: "WhatsApp connection was cancelled.",
            });
          }

          const authCode = response.authResponse.code;
          const wabaId = capturedSessionData?.waba_id;
          const phoneNumberId = capturedSessionData?.phone_number_id;

          // Safe structured notification without printing credentials
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
