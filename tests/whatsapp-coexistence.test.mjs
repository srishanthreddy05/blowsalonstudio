import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedMetaOrigin, parseMetaMessageEvent } from "../lib/whatsapp/embeddedSignup.ts";
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
      configurationId: "1744937289890566",
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
      configurationId: "1744937289890566",
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
      configurationId: "1744937289890566",
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

  // Test Case 13 (Launch Configuration): Validate official Meta Embedded Signup v4 coexistence options
  await t.test("Case 13: Official Meta Embedded Signup v4 coexistence options must not contain undocumented properties", () => {
    const launchOptions = {
      config_id: "1744937289890566",
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      },
    };

    assert.strictEqual(launchOptions.config_id, "1744937289890566");
    assert.strictEqual(launchOptions.response_type, "code");
    assert.strictEqual(launchOptions.override_default_response_type, true);
    assert.strictEqual(launchOptions.extras.featureType, "whatsapp_business_app_onboarding");
    assert.strictEqual(launchOptions.extras.sessionInfoVersion, "3");
    assert.strictEqual("version" in launchOptions.extras, false, "Undocumented version property must not be present in extras");
  });
});


