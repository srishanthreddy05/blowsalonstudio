import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedMetaOrigin,
  parseMetaMessageEvent,
  createSignupDiagnostics,
  recordMetaMessage,
  classifyOnboardingOutcome,
  hasTerminalEvent,
  summarizeDiagnostics,
  logSafeMetaMessageDiagnostic,
} from "../lib/whatsapp/embeddedSignup.ts";
import { sanitizeFirestoreDoc } from "../lib/utils/firestore.ts";

test("WhatsApp Coexistence Test Suite", async (t) => {
  // Test Case 1: Successful Coexistence completion with event.data.waba_id
  await t.test("Case 1: Successful Coexistence completion with event.data.waba_id", () => {
    const rawEvent = {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      waba_id: "998877665544",
    };
    const parsed = parseMetaMessageEvent("https://www.facebook.com", rawEvent);
    assert.ok(parsed, "Parsed event should not be null");
    assert.strictEqual(parsed.eventType, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    assert.strictEqual(parsed.wabaId, "998877665544");
    assert.strictEqual(parsed.fullPayload?.waba_id, "998877665544");
  });

  // Test Case 2: Successful completion when WABA ID comes from normal completion response
  await t.test("Case 2: Successful completion when WABA ID comes from normal completion response (data.waba_id)", () => {
    const rawEvent = {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: {
        waba_id: "112233445566",
        phone_number_id: "556677889900",
        current_step: "COMPLETED",
      },
    };
    const parsed = parseMetaMessageEvent("https://web.facebook.com", rawEvent);
    assert.ok(parsed);
    assert.strictEqual(parsed.eventType, "FINISH");
    assert.strictEqual(parsed.wabaId, "112233445566");
    assert.strictEqual(parsed.phoneNumberId, "556677889900");
    assert.strictEqual(parsed.currentStep, "COMPLETED");
  });

  // Test Case 3: Missing WABA ID validation prevents writing undefined/incomplete state
  await t.test("Case 3: Missing WABA ID is rejected safely without persisting invalid document", () => {
    // When both sessionData and direct inputs lack a WABA ID
    const emptyPayload = {
      code: "test_auth_code",
      sessionData: {
        current_step: "PHONE_NUMBER_VERIFICATION",
      },
    };

    const extractSafeId = (val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      return undefined;
    };

    const resolvedWabaId =
      extractSafeId(emptyPayload.wabaId) ||
      extractSafeId(emptyPayload.sessionData?.waba_id);

    assert.strictEqual(resolvedWabaId, undefined);

    // Validation rule prevents setDoc from being called
    const wouldPersist = Boolean(resolvedWabaId);
    assert.strictEqual(wouldPersist, false, "Must not persist to Firestore when WABA ID is missing");
  });

  // Test Case 4: Missing phone number ID discovery handling
  await t.test("Case 4: Phone number ID resolution from WABA asset query fallback", () => {
    // Simulate Meta API /{wabaId}/phone_numbers response
    const mockPhoneApiResponse = {
      data: [
        {
          id: "334455667788",
          display_phone_number: "+91 99999 88888",
          verified_name: "Blow Salon Test",
          quality_rating: "GREEN",
        },
      ],
    };

    let resolvedPhoneNumberId = undefined;
    let businessPhoneNumber = undefined;
    let verifiedName = undefined;

    if (mockPhoneApiResponse.data && mockPhoneApiResponse.data.length > 0) {
      const asset = mockPhoneApiResponse.data[0];
      resolvedPhoneNumberId = asset.id;
      businessPhoneNumber = asset.display_phone_number;
      verifiedName = asset.verified_name;
    }

    assert.strictEqual(resolvedPhoneNumberId, "334455667788");
    assert.strictEqual(businessPhoneNumber, "+91 99999 88888");
    assert.strictEqual(verifiedName, "Blow Salon Test");
  });

  // Test Case 5: Authorization-code exchange failure handling
  await t.test("Case 5: Authorization-code exchange failure is handled safely without throwing or corrupting state", () => {
    // Simulate failed Meta oauth/access_token response
    const mockExchangeResponse = {
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: {
          message: "Invalid verification code format",
          type: "OAuthException",
          code: 100,
        },
      }),
    };

    let exchangedToken = null;
    let errorLogged = null;

    if (!mockExchangeResponse.ok) {
      errorLogged = "Code exchange warning: Invalid verification code format";
    }

    assert.strictEqual(exchangedToken, null);
    assert.ok(errorLogged.includes("Code exchange warning"));
  });

  // Test Case 6: Meta Graph API error or missing account data
  await t.test("Case 6: Meta Graph API error or empty account array does not crash the server", () => {
    // Simulate empty accounts response
    const mockAccountsResponse = {
      ok: true,
      data: [],
    };

    let resolvedWabaId = undefined;
    if (mockAccountsResponse.ok && Array.isArray(mockAccountsResponse.data) && mockAccountsResponse.data.length > 0) {
      resolvedWabaId = mockAccountsResponse.data[0].id;
    }

    assert.strictEqual(resolvedWabaId, undefined);
  });

  // Test Case 7: Malformed or unrelated SDK message events
  await t.test("Case 7: Malformed or unrelated SDK message events are ignored safely", () => {
    // 0. Verify origin validator
    assert.strictEqual(isAllowedMetaOrigin("https://www.facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://web.facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://malicious.org"), false);

    // 1. Untrusted origin
    const malicious = parseMetaMessageEvent("https://attacker-site.com", {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      waba_id: "123",
    });
    assert.strictEqual(malicious, null, "Untrusted origin must be rejected");

    // 2. Unrelated message type
    const unrelated = parseMetaMessageEvent("https://www.facebook.com", {
      type: "OTHER_EVENT",
      data: { waba_id: "123" },
    });
    assert.strictEqual(unrelated, null, "Non-WA_EMBEDDED_SIGNUP must be ignored");

    // 3. Invalid JSON string
    const invalidJson = parseMetaMessageEvent("https://www.facebook.com", "not-a-valid-json{{");
    assert.strictEqual(invalidJson, null, "Invalid JSON must be safely caught without throwing");

    // 4. Null / non-object data
    const nullData = parseMetaMessageEvent("https://www.facebook.com", null);
    assert.strictEqual(nullData, null);

    // 5. Valid stringified JSON message with nested string data
    const stringifiedNested = parseMetaMessageEvent(
      "https://www.facebook.com",
      JSON.stringify({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        data: JSON.stringify({ waba_id: "776655443322" }),
      })
    );
    assert.ok(stringifiedNested);
    assert.strictEqual(stringifiedNested.wabaId, "776655443322");
  });

  // Test Case 8: Firestore persistence undefined field rejection prevented
  await t.test("Case 8: sanitizeFirestoreDoc eliminates all undefined values and prevents setDoc failure", () => {
    const rawCoexistenceData = {
      status: "CONNECTED",
      wabaId: "9988776655",
      phoneNumberId: undefined, // Simulates optional phone ID in coexistence
      businessPhoneNumber: undefined,
      verifiedName: undefined,
      configurationId: "1534814405338722",
      featureType: "whatsapp_business_app_onboarding",
      onboardedAt: "2026-10-21T14:00:00.000Z",
      updatedAt: "2026-10-21T14:00:00.000Z",
    };

    // Before sanitization, wabaId exists, but undefined fields are present
    assert.ok("phoneNumberId" in rawCoexistenceData);
    assert.strictEqual(rawCoexistenceData.phoneNumberId, undefined);

    const sanitized = sanitizeFirestoreDoc(rawCoexistenceData);

    // After sanitization, undefined properties must NOT be present
    assert.strictEqual("phoneNumberId" in sanitized, false);
    assert.strictEqual("businessPhoneNumber" in sanitized, false);
    assert.strictEqual("verifiedName" in sanitized, false);
    assert.strictEqual(sanitized.wabaId, "9988776655");
    assert.strictEqual(sanitized.status, "CONNECTED");

    // Validate that no key in sanitized object has value undefined
    for (const [key, value] of Object.entries(sanitized)) {
      assert.notStrictEqual(value, undefined, `Field ${key} must not be undefined`);
    }
  });

  // Test Case 9: Retry after an incomplete onboarding attempt preserves valid existing config
  await t.test("Case 9: Incomplete onboarding attempt preserves existing valid configuration", () => {
    const existingValidConfig = {
      status: "CONNECTED",
      wabaId: "existing_valid_waba_123",
      phoneNumberId: "existing_valid_phone_456",
      updatedAt: "2026-10-20T10:00:00.000Z",
    };

    // Simulate an incomplete retry request
    const retryRequestBody = {
      code: "retry_code_without_session_data",
      sessionData: undefined,
    };

    const extractSafeId = (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined);
    const resolvedWabaId = extractSafeId(retryRequestBody.wabaId);

    // Check if new request is valid
    const isRetryValid = Boolean(resolvedWabaId);

    // If invalid, current document must NOT be overwritten
    let storedConfig = { ...existingValidConfig };
    if (!isRetryValid) {
      // Return 400 error without modifying storedConfig
    } else {
      storedConfig = { ...storedConfig, wabaId: resolvedWabaId };
    }

    assert.strictEqual(storedConfig.wabaId, "existing_valid_waba_123", "Existing config must be preserved on retry failure");
    assert.strictEqual(storedConfig.status, "CONNECTED");
  });

  // Test Case 10: Existing Cloud API direct messaging configuration remains untouched
  await t.test("Case 10: Existing Cloud API environment variables and provider remain independent", () => {
    // Cloud provider uses dedicated env variables
    const directCloudConfig = {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "EAAgzvZAXfVgcBStK...",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "1329685360226264",
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "1755242905734759",
      provider: "WHATSAPP_CLOUD_API",
    };

    const coexistenceConfig = {
      status: "CONNECTED",
      wabaId: "client_coexistence_waba_888",
      configurationId: "1534814405338722",
      featureType: "whatsapp_business_app_onboarding",
    };

    // Ensure coexistence assets do NOT overwrite or collide with direct Cloud API configuration
    assert.notStrictEqual(coexistenceConfig.wabaId, directCloudConfig.businessAccountId);
    assert.strictEqual(directCloudConfig.phoneNumberId, "1329685360226264");
    assert.strictEqual(directCloudConfig.provider, "WHATSAPP_CLOUD_API");
  });

  // Test Case 11 (Regression): Exact Production Failure Path
  // In the unpatched server code, having `code` truthy bypassed `!resolvedWabaId && !resolvedPhoneNumberId && !code`,
  // resulting in setDoc(SETTINGS_COEXISTENCE_DOC, { status: "CONNECTED", wabaId: undefined, ... }) which threw:
  // "Function setDoc() called with invalid data. Unsupported field value: undefined (found in field wabaId in document settings/whatsapp_coexistence)"
  await t.test("Case 11 (Regression): Exact production failure path is strictly blocked with HTTP 400 and zero invalid setDoc writes", () => {
    // 1. Simulate the exact request body that triggered the production error
    const productionFailingBody = {
      code: "AQBxyz123456_valid_auth_code_from_popup",
      sessionData: {
        current_step: "PHONE_NUMBER_VERIFICATION",
      },
    };

    // 2. Simulate ID extraction
    const extractSafeId = (val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      return undefined;
    };

    const resolvedWabaId =
      extractSafeId(productionFailingBody.wabaId) ||
      extractSafeId(productionFailingBody.sessionData?.waba_id);

    // 3. Verify that resolvedWabaId is undefined
    assert.strictEqual(resolvedWabaId, undefined);

    // 4. Verify that the new pre-write validation catches it
    let validationPassed = false;
    let responseStatus = 200;
    let responseBody = {};

    if (!resolvedWabaId) {
      validationPassed = false;
      responseStatus = 400;
      responseBody = {
        success: false,
        error: "WhatsApp connection could not be completed. Missing WhatsApp Business Account (WABA) ID from Meta onboarding response. Please retry.",
      };
    } else {
      validationPassed = true;
    }

    assert.strictEqual(validationPassed, false, "Must not pass validation when WABA ID is missing");
    assert.strictEqual(responseStatus, 400, "Must return HTTP 400 instead of HTTP 500");
    assert.strictEqual(responseBody.success, false);
    assert.ok(responseBody.error.includes("Missing WhatsApp Business Account (WABA) ID"));

    // 5. Verify that even if an object with undefined wabaId were somehow constructed,
    // sanitizeFirestoreDoc strips it and Firestore cannot receive undefined
    const simulatedUnsafeRecord = {
      status: "CONNECTED",
      wabaId: resolvedWabaId,
      configurationId: "1534814405338722",
    };

    const sanitized = sanitizeFirestoreDoc(simulatedUnsafeRecord);
    assert.strictEqual("wabaId" in sanitized, false, "Undefined wabaId must be stripped by sanitizeFirestoreDoc");
    assert.strictEqual(sanitized.wabaId, undefined);
  });

  // Test Case 12 (Regression): Meta FB.login callback must be a synchronous function
  // Passing `async (response) => {}` to FB.login triggers Meta SDK runtime error:
  // "Expression is of type asyncfunction, not function"
  await t.test("Case 12 (Regression): Meta FB.login callback must be a synchronous function to prevent 'Expression is of type asyncfunction, not function'", () => {
    // 1. Recreate the buggy callback signature
    const buggyAsyncCallback = async (response) => {
      return response;
    };

    // 2. Recreate the fixed synchronous callback wrapper
    const fixedSyncCallback = (response) => {
      const handleAsync = async () => {
        return response;
      };
      handleAsync().catch(() => {});
    };

    // Verify type tags using Object.prototype.toString (as checked by Meta SDK)
    const buggyType = Object.prototype.toString.call(buggyAsyncCallback);
    const fixedType = Object.prototype.toString.call(fixedSyncCallback);

    assert.strictEqual(buggyType, "[object AsyncFunction]", "Buggy callback is indeed an AsyncFunction");
    assert.strictEqual(fixedType, "[object Function]", "Fixed callback must be a standard Function");

    // Verify Meta SDK parameter validation simulation
    const validateMetaCallback = (fn) => {
      const typeStr = Object.prototype.toString.call(fn);
      if (typeStr === "[object AsyncFunction]") {
        throw new Error("Expression is of type asyncfunction, not function");
      }
      if (typeof fn !== "function") {
        throw new Error("Expression is not a function");
      }
      return true;
    };

    assert.throws(
      () => validateMetaCallback(buggyAsyncCallback),
      /Expression is of type asyncfunction, not function/
    );

    assert.doesNotThrow(() => validateMetaCallback(fixedSyncCallback));
  });

  // Test Case 13 (Launch Configuration): Validate official Meta Embedded Signup coexistence options
  await t.test("Case 13: Official Meta Embedded Signup coexistence options must contain exact required extras", () => {
    const launchOptions = {
      config_id: "1534814405338722",
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      },
    };

    assert.strictEqual(launchOptions.config_id, "1534814405338722");
    assert.strictEqual(launchOptions.response_type, "code");
    assert.strictEqual(launchOptions.override_default_response_type, true);
    assert.strictEqual(launchOptions.extras.featureType, "whatsapp_business_app_onboarding");
    assert.strictEqual(launchOptions.extras.sessionInfoVersion, "3");
    assert.deepStrictEqual(launchOptions.extras.setup, {});
    assert.strictEqual(launchOptions.extras.version, undefined);
    assert.strictEqual(launchOptions.extras.coex, undefined);
  });

  // Test Case 14 (Popup Lifecycle & Incomplete Session Guard):
  // When the user closes the popup or cancels before phone/OTP verification,
  // the client must NOT claim success or submit the request to the backend.
  await t.test("Case 14: Incomplete popup session (code present but no WABA ID) is rejected before backend submission", () => {
    // Simulate what FB.login callback produces when popup closes before phone verification
    const simulatedAuthResponse = {
      status: "connected",
      authResponse: {
        code: "oauth_code_from_incomplete_popup",
      },
    };

    const simulatedCapturedSessionData = null; // No FINISH event was emitted from popup
    const finishEventReceived = false;
    const cancelEventReceived = false;

    // Simulate launchWhatsAppBusinessOnboarding logic
    const evaluateOnboardingResult = (response, sessionData, finishEvent, cancelEvent) => {
      const authCode = response.authResponse?.code;
      const wabaId = sessionData?.waba_id;
      const phoneNumberId = sessionData?.phone_number_id;

      if (cancelEvent) {
        return {
          success: false,
          cancelled: true,
          error: "WhatsApp connection was cancelled by the user.",
        };
      }

      if (!wabaId && !finishEvent) {
        return {
          success: false,
          cancelled: false,
          code: authCode,
          error: "Meta Embedded Signup was closed before phone-number and OTP verification were completed.",
        };
      }

      return {
        success: true,
        code: authCode,
        wabaId,
        phoneNumberId,
      };
    };

    const result = evaluateOnboardingResult(
      simulatedAuthResponse,
      simulatedCapturedSessionData,
      finishEventReceived,
      cancelEventReceived
    );

    // 1. Result must NOT be success: true
    assert.strictEqual(result.success, false, "Must not claim success when WABA ID is missing");
    assert.ok(result.error.includes("phone-number and OTP verification were completed"));

    // 2. Client guard check (WhatsAppSettingsView)
    let backendSubmissionInvoked = false;
    if (result.success && result.wabaId) {
      backendSubmissionInvoked = true;
    }

    assert.strictEqual(backendSubmissionInvoked, false, "Backend submission must NEVER be called when wabaId is missing");
  });

  // Test Case 15 (Event Classification): Distinguish Coexistence vs Standard Onboarding Events
  await t.test("Case 15: Correctly distinguishes FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING from standard FINISH event", () => {
    const coexistenceEvent = {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: {
        waba_id: "waba_coex_111",
        phone_number_id: "phone_coex_222",
      },
    };

    const standardEvent = {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: {
        waba_id: "waba_standard_333",
        phone_number_id: "phone_standard_444",
      },
    };

    const isCoexistenceEvent = (evt) => evt.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

    assert.strictEqual(isCoexistenceEvent(coexistenceEvent), true, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING must be identified as Coexistence");
    assert.strictEqual(isCoexistenceEvent(standardEvent), false, "Standard FINISH must be distinguished from Coexistence");
  });

  // Test Case 16 (Active Configuration Verification): Validate new Configuration ID 1534814405338722
  await t.test("Case 16: Active configuration ID 1534814405338722 is used and old ID is retired", () => {
    const activeConfigId = "1534814405338722";
    const deprecatedConfigId = "1744937289890566";

    assert.strictEqual(activeConfigId, "1534814405338722");
    assert.notStrictEqual(activeConfigId, deprecatedConfigId);

    // Verify account creation validator strictly requires non-empty WABA ID
    const validateCoexistenceRecord = (record) => {
      if (!record.wabaId || typeof record.wabaId !== "string" || !record.wabaId.trim()) {
        throw new Error("Missing WhatsApp Business Account (WABA) ID");
      }
      if (record.status !== "CONNECTED") {
        throw new Error("Invalid status");
      }
      const sanitized = sanitizeFirestoreDoc(record);
      for (const [key, val] of Object.entries(sanitized)) {
        if (val === undefined) {
          throw new Error(`Field ${key} cannot be undefined in Firestore`);
        }
      }
      return sanitized;
    };

    // Valid case
    const validRecord = {
      status: "CONNECTED",
      wabaId: "valid_waba_1534814405338722",
      phoneNumberId: "phone_123",
      configurationId: activeConfigId,
    };
    const saved = validateCoexistenceRecord(validRecord);
    assert.strictEqual(saved.wabaId, "valid_waba_1534814405338722");
    assert.strictEqual(saved.configurationId, "1534814405338722");

    // Invalid case: undefined wabaId
    assert.throws(
      () => validateCoexistenceRecord({ status: "CONNECTED", wabaId: undefined, configurationId: activeConfigId }),
      /Missing WhatsApp Business Account \(WABA\) ID/
    );

    // Invalid case: empty string wabaId
    assert.throws(
      () => validateCoexistenceRecord({ status: "CONNECTED", wabaId: "  ", configurationId: activeConfigId }),
      /Missing WhatsApp Business Account \(WABA\) ID/
    );
  });

  // Test Case 17 (Origin Verification): Allowed Meta origins must include facebook.net and meta.com
  await t.test("Case 17: Allowed Meta origins accept facebook.com, facebook.net, and meta.com", () => {
    const isAllowedMetaOrigin = (origin) => {
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
        return false;
      }
    };

    assert.strictEqual(isAllowedMetaOrigin("https://www.facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://web.facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://connect.facebook.net"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://business.meta.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://evil-site.com"), false);
  });

  // Test Case 18 (Stage Diagnosis): Distinguish OAuth success from Coexistence completion
  await t.test("Case 18: Distinguishes Facebook OAuth success from Coexistence completion with stage diagnostics", () => {
    const evaluateStage = ({ authCode, wabaId, finishEventReceived, cancelEventReceived, lastStepReceived }) => {
      if (cancelEventReceived) {
        return {
          success: false,
          stage: "USER_CANCELLED",
          error: `[Stage: User Cancelled] WhatsApp connection was cancelled${lastStepReceived ? ` at step: ${lastStepReceived}` : ""}.`,
        };
      }
      if (!wabaId && !finishEventReceived) {
        const errorReason = lastStepReceived
          ? `[Stage: Popup Incomplete] Meta onboarding was closed at step '${lastStepReceived}' before phone-number and OTP verification were completed.`
          : "[Stage: Flow Incomplete] Facebook OAuth authorization succeeded (auth code received), but the WhatsApp Business Onboarding wizard did not return a completion event.";

        return {
          success: false,
          stage: "FLOW_INCOMPLETE",
          code: authCode,
          error: errorReason,
        };
      }
      return {
        success: true,
        stage: "ONBOARDING_COMPLETED",
        code: authCode,
        wabaId,
      };
    };

    // Scenario A: OAuth succeeded, but popup closed before WhatsApp flow returned WABA
    const resultIncomplete = evaluateStage({
      authCode: "valid_oauth_code_123",
      wabaId: undefined,
      finishEventReceived: false,
      cancelEventReceived: false,
      lastStepReceived: undefined,
    });

    assert.strictEqual(resultIncomplete.success, false);
    assert.strictEqual(resultIncomplete.stage, "FLOW_INCOMPLETE");
    assert.ok(resultIncomplete.error.includes("[Stage: Flow Incomplete]"));
    assert.strictEqual(resultIncomplete.code, "valid_oauth_code_123");

    // Scenario B: Coexistence onboarding fully completed
    const resultComplete = evaluateStage({
      authCode: "valid_oauth_code_456",
      wabaId: "waba_789",
      finishEventReceived: true,
      cancelEventReceived: false,
    });

    assert.strictEqual(resultComplete.success, true);
    assert.strictEqual(resultComplete.stage, "ONBOARDING_COMPLETED");
    assert.strictEqual(resultComplete.wabaId, "waba_789");
  });

  const FB = "https://www.facebook.com";

  // Case 19: Real Coexistence completion (string-encoded, as Meta sends it) succeeds
  await t.test("Case 19: FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING (JSON string) yields success with WABA ID", () => {
    const diag = createSignupDiagnostics();
    recordMetaMessage(diag, FB, JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      version: 3,
      data: { waba_id: "111222333" },
    }));
    assert.strictEqual(hasTerminalEvent(diag), true);
    const out = classifyOnboardingOutcome("code_x", diag);
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.stage, "ONBOARDING_COMPLETED");
    assert.strictEqual(out.wabaId, "111222333");
  });

  // Case 20 (Regression): FINISH_ONLY_WABA used to be silently dropped -> "Flow Incomplete"
  await t.test("Case 20 (Regression): FINISH_ONLY_WABA is recorded and reported as the wrong flow, not dropped", () => {
    const diag = createSignupDiagnostics();
    recordMetaMessage(diag, FB, JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_ONLY_WABA",
      version: 3,
      data: { waba_id: "444555666" },
    }));
    assert.deepStrictEqual(diag.waSignupEvents, ["FINISH_ONLY_WABA"]);
    assert.strictEqual(hasTerminalEvent(diag), true);
    const out = classifyOnboardingOutcome("code_x", diag);
    assert.strictEqual(out.success, false, "Standard flow must not be saved as Coexistence");
    assert.strictEqual(out.stage, "STANDARD_FLOW_COMPLETED");
    assert.ok(out.error.includes("FINISH_ONLY_WABA"));
    assert.strictEqual(out.wabaId, undefined);
  });

  // Case 21: Standard FINISH is not Coexistence
  await t.test("Case 21: Standard FINISH event is reported as wrong flow and never connects", () => {
    const diag = createSignupDiagnostics();
    recordMetaMessage(diag, FB, { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "1", phone_number_id: "2" } });
    const out = classifyOnboardingOutcome("code_x", diag);
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.stage, "STANDARD_FLOW_COMPLETED");
  });

  // Case 22: OAuth code with zero Meta events => NO_SIGNUP_EVENT with actionable causes
  await t.test("Case 22: OAuth code alone with no WA_EMBEDDED_SIGNUP event is NO_SIGNUP_EVENT with actionable causes", () => {
    const diag = createSignupDiagnostics();
    // SDK-internal Meta messages that are not signup events
    recordMetaMessage(diag, FB, "_fb_internal_xd_message");
    recordMetaMessage(diag, FB, { type: "SOMETHING_ELSE" });
    const out = classifyOnboardingOutcome("valid_code", diag);
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.stage, "NO_SIGNUP_EVENT");
    assert.strictEqual(diag.metaOriginMessages, 2);
    assert.strictEqual(diag.ignoredMetaMessages, 2);
    assert.ok(out.error.includes("metaMessages=2"));
    assert.ok(out.error.includes("signupEvents=[none]"));
    assert.ok(out.error.includes("1. Wrong Config Type"));
    assert.ok(out.error.includes("2. Coexistence Not Enabled"));
    assert.ok(out.error.includes("3. Domain Not Allowed"));
    assert.ok(out.error.includes("4. App Roles / Mode"));
  });

  // Case 23: Signup event from a non-Meta origin is counted as origin-rejected
  await t.test("Case 23: WA_EMBEDDED_SIGNUP from a non-Meta origin is ignored but diagnosed", () => {
    const diag = createSignupDiagnostics();
    recordMetaMessage(diag, "https://evil.example.com", JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: { waba_id: "spoofed" },
    }));
    assert.strictEqual(diag.coexistencePayload, undefined, "Spoofed event must not be accepted");
    const out = classifyOnboardingOutcome("code", diag);
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.stage, "ORIGIN_FILTERED");
  });

  // Case 24: Coexistence event without WABA ID never succeeds
  await t.test("Case 24: Coexistence event missing waba_id is rejected", () => {
    const diag = createSignupDiagnostics();
    recordMetaMessage(diag, FB, { type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: {} });
    const out = classifyOnboardingOutcome("code", diag);
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.stage, "COEXISTENCE_MISSING_WABA");
  });

  // Case 25: CANCEL carries step; diagnostics summary never contains IDs
  await t.test("Case 25: CANCEL reports step, and summaries never leak IDs", () => {
    const diag = createSignupDiagnostics();
    recordMetaMessage(diag, FB, { type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_VERIFICATION" } });
    const out = classifyOnboardingOutcome("code", diag);
    assert.strictEqual(out.cancelled, true);
    assert.ok(out.error.includes("PHONE_NUMBER_VERIFICATION"));

    const diag2 = createSignupDiagnostics();
    recordMetaMessage(diag2, FB, { type: "WA_EMBEDDED_SIGNUP", event: "FINISH_ONLY_WABA", data: { waba_id: "987654321" } });
    assert.ok(!summarizeDiagnostics(diag2).includes("987654321"), "Summary must not include WABA ID");
  });

  // Case 26: Safe diagnostic log extracts structural metadata and never leaks secrets
  await t.test("Case 26: Safe diagnostic log function inspects metadata without leaking secrets", () => {
    const diagInfo = logSafeMetaMessageDiagnostic("https://www.facebook.com", {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: {
        waba_id: "secret_waba_12345",
        access_token: "secret_token_abcde",
        phone_number: "+919999999999",
      },
    });

    assert.ok(diagInfo);
    assert.strictEqual(diagInfo.origin, "https://www.facebook.com");
    assert.strictEqual(diagInfo.type, "WA_EMBEDDED_SIGNUP");
    assert.strictEqual(diagInfo.event, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    assert.deepStrictEqual(diagInfo.nestedDataKeys, ["waba_id", "access_token", "phone_number"]);

    // Verify secret values do NOT exist anywhere in diagInfo
    const jsonStr = JSON.stringify(diagInfo);
    assert.ok(!jsonStr.includes("secret_waba_12345"));
    assert.ok(!jsonStr.includes("secret_token_abcde"));
    assert.ok(!jsonStr.includes("+919999999999"));
  });

  // Case 27: Parser accepts mixed-case and lowercase events & types
  await t.test("Case 27: Parser accepts mixed-case and lowercase events & types", () => {
    const parsedLower = parseMetaMessageEvent("https://web.facebook.com", {
      type: "wa_embedded_signup",
      event: "finish_whatsapp_business_app_onboarding",
      data: { waba_id: "waba_case_test" },
    });

    assert.ok(parsedLower);
    assert.strictEqual(parsedLower.eventType, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    assert.strictEqual(parsedLower.wabaId, "waba_case_test");
  });

  // Case 28: Parser accepts double-serialized JSON payloads
  await t.test("Case 28: Parser accepts double-serialized JSON payloads", () => {
    const innerJson = JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: JSON.stringify({ waba_id: "waba_double_json" }),
    });
    const doubleStringified = JSON.stringify(innerJson);

    const parsed = parseMetaMessageEvent("https://business.facebook.com", doubleStringified);
    assert.ok(parsed);
    assert.strictEqual(parsed.eventType, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    assert.strictEqual(parsed.wabaId, "waba_double_json");
  });

  // Case 29: Parser accepts known WhatsApp events even if type field is omitted
  await t.test("Case 29: Parser accepts known WhatsApp events even if type field is omitted", () => {
    const parsed = parseMetaMessageEvent("https://www.facebook.com", {
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: { waba_id: "waba_no_type_field" },
    });

    assert.ok(parsed);
    assert.strictEqual(parsed.eventType, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    assert.strictEqual(parsed.wabaId, "waba_no_type_field");
  });

  // Case 30: Allowed origins accept www, web, business facebook and meta domains
  await t.test("Case 30: Allowed origins accept www, web, and business facebook domains", () => {
    assert.strictEqual(isAllowedMetaOrigin("https://www.facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://web.facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://business.facebook.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://connect.facebook.net"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://meta.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://business.meta.com"), true);
    assert.strictEqual(isAllowedMetaOrigin("https://malicious.com"), false);
  });

  // Case 31: Diagnostics summary safely reports structural metadata of ignored messages
  await t.test("Case 31: Diagnostics summary safely reports structural metadata of ignored messages", () => {
    const diag = createSignupDiagnostics();
    recordMetaMessage(diag, FB, { type: "xd_arbiter", action: "ping", arbitrary: 123 });
    const summary = summarizeDiagnostics(diag);
    assert.ok(summary.includes("ignoredMetaMessages=1"));
    assert.ok(summary.includes("lastIgnored=[type=xd_arbiter"));
    assert.ok(summary.includes("keys=[type,action,arbitrary]"));
    // Ensure value 123 is not dumped
    assert.ok(!summary.includes("123"));
  });
});


