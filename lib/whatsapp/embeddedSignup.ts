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

  console.log(
    `[Embedded Signup] Embedded Signup starting (App ID: ${META_APP_ID}, Config ID: ${META_COEXISTENCE_CONFIG_ID})`
  );

  return new Promise<LaunchEmbeddedSignupResult>((resolve) => {
    let capturedSessionData: EmbeddedSignupSessionData | null = null;
    let finishEventReceived = false;
    let cancelEventReceived = false;
    let errorEventReceived = false;
    let lastStepReceived: string | undefined = undefined;
    let isFinished = false;

    // Listen to session postMessages from Meta popup
    const messageListener = (event: MessageEvent) => {
      if (!isAllowedMetaOrigin(event.origin)) {
        return;
      }

      const parsed = parseMetaMessageEvent(event.origin, event.data);
      if (!parsed) return;

      const { eventType, eventVersion, wabaId, phoneNumberId, currentStep, fullPayload } = parsed;
      lastStepReceived = currentStep;

      // Safe structured diagnostic log (NEVER logs tokens, secrets, or PII)
      console.log(
        `[Embedded Signup:Client] Meta postMessage received: event=${eventType || "UNKNOWN"}, version=${eventVersion || "N/A"}, hasWabaId=${Boolean(
          wabaId
        )}, hasPhoneNumberId=${Boolean(phoneNumberId)}${currentStep ? `, step=${currentStep}` : ""}`
      );

      // Handle coexistence completion, standard finish, cancel, and error
      if (eventType === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        finishEventReceived = true;
        capturedSessionData = fullPayload || null;
        console.log(`[Embedded Signup:Client] Coexistence Onboarding COMPLETED successfully! (Event: ${eventType}, Version: ${eventVersion || "N/A"}, hasWabaId: ${Boolean(wabaId)})`);
      } else if (eventType === "FINISH") {
        finishEventReceived = true;
        capturedSessionData = fullPayload || null;
        console.warn(`[Embedded Signup:Client] Standard Cloud API onboarding event (FINISH) was received instead of Coexistence (FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING). (Version: ${eventVersion || "N/A"}, hasWabaId: ${Boolean(wabaId)})`);
      } else if (eventType === "CANCEL") {
        cancelEventReceived = true;
        console.log(`[Embedded Signup:Client] Session cancelled by user (Step: ${currentStep || "UNKNOWN"}, Version: ${eventVersion || "N/A"})`);
      } else if (eventType === "ERROR") {
        errorEventReceived = true;
        console.warn("[Embedded Signup:Client] Session returned error state.");
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
      console.log(
        `[Embedded Signup:Client] Invoking FB.login popup (config_id=${META_COEXISTENCE_CONFIG_ID}, featureType=whatsapp_business_app_onboarding, sessionInfoVersion=3, coex=true)`
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
            }

            if (!response || response.status === "unknown" || !response.authResponse) {
              cleanup();
              console.log("[Embedded Signup:Client] Facebook login cancelled or window closed.");
              return resolve({
                success: false,
                cancelled: true,
                error: "WhatsApp connection was cancelled.",
              });
            }

            const authCode = response.authResponse.code;

            // If session event has not been processed yet, give a brief 600ms grace period
            // for the postMessage event loop before removing listener and resolving
            if (!capturedSessionData?.waba_id && !finishEventReceived) {
              console.log("[Embedded Signup:Client] Waiting brief grace window for postMessage event...");
              await new Promise((r) => setTimeout(r, 600));
            }

            cleanup();

            const wabaId = capturedSessionData?.waba_id;
            const phoneNumberId = capturedSessionData?.phone_number_id;

            console.log(
              `[Embedded Signup:Client] Authorization response processed: hasAuthCode=${Boolean(
                authCode
              )}, finishEventReceived=${finishEventReceived}, cancelEventReceived=${cancelEventReceived}, hasWabaId=${Boolean(
                wabaId
              )}, hasPhoneNumberId=${Boolean(phoneNumberId)}`
            );

            // CRITICAL: If user cancelled or popup closed early, do not claim success or send to backend
            if (cancelEventReceived) {
              return resolve({
                success: false,
                cancelled: true,
                error: `WhatsApp connection was cancelled by the user${lastStepReceived ? ` at step: ${lastStepReceived}` : ""}.`,
              });
            }

            if (errorEventReceived) {
              return resolve({
                success: false,
                error: "Meta Embedded Signup returned an error state during onboarding.",
              });
            }

            // CRITICAL: Do NOT claim success if onboarding did not complete or WABA ID was never received
            if (!wabaId && !finishEventReceived) {
              const errorReason = lastStepReceived
                ? `Meta onboarding was closed at step '${lastStepReceived}' before phone-number and OTP verification were completed.`
                : "Meta Facebook Login authorized, but the WhatsApp Business onboarding flow did not open. Please ensure in Meta App Dashboard (App ID: " +
                  META_APP_ID +
                  ") that Configuration " +
                  META_COEXISTENCE_CONFIG_ID +
                  " has the 'WhatsApp Embedded Signup' variation selected with WhatsApp Accounts and https://blowsalonstudio.vercel.app in Allowed Domains for JavaScript SDK.";

              return resolve({
                success: false,
                cancelled: false,
                code: authCode,
                error: errorReason,
              });
            }

            return resolve({
              success: true,
              code: authCode,
              wabaId: typeof wabaId === "string" ? wabaId : undefined,
              phoneNumberId: typeof phoneNumberId === "string" ? phoneNumberId : undefined,
              sessionData: capturedSessionData || undefined,
            });
          };

          handleLoginResponse().catch((err) => {
            cleanup();
            const msg = err instanceof Error ? err.message : "Error handling login response";
            console.error("[Embedded Signup:Client] Handler error:", msg);
            resolve({
              success: false,
              error: "WhatsApp connection could not be completed: " + msg,
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
        error: "WhatsApp connection could not be completed: " + msg,
      });
    }
  });
}
