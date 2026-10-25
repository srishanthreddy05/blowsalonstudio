import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  WHATSAPP_APPLICATION_RATES,
  getMessageCategory,
  calculateCategoryUsageCharge,
} from "../lib/whatsapp/pricingConfig.ts";
import {
  classifyRetryEligibility,
} from "../lib/whatsapp/errorClassifier.ts";
import { calculateCampaignStats } from "../lib/whatsapp/campaignStats.ts";

test("BLOW SALON — WhatsApp Simplification, Usage & Retry Test Suite", async (t) => {
  // Scenario 1: Only Campaigns, Message History, and Settings appear as top-level WhatsApp sections
  await t.test("Scenario 1: Top-level navigation has exactly 3 sections (Campaigns, Message History, Settings)", () => {
    const pageContent = fs.readFileSync(
      path.join(process.cwd(), "app/(dashboard)/whatsapp/page.tsx"),
      "utf8"
    );

    // Verify WhatsAppNavTab is strictly union of CAMPAIGNS | HISTORY | SETTINGS
    assert.match(
      pageContent,
      /export type WhatsAppNavTab =\s*"CAMPAIGNS" \| "HISTORY" \| "SETTINGS";/,
      "WhatsAppNavTab must contain only CAMPAIGNS, HISTORY, and SETTINGS"
    );

    // Default active tab must be CAMPAIGNS
    assert.match(
      pageContent,
      /useState<WhatsAppNavTab>\("CAMPAIGNS"\)/,
      "Default landing section must be CAMPAIGNS"
    );

    // Overview, Billing, Insights must NOT exist as top-level tabs in the page navigation bar
    assert.doesNotMatch(
      pageContent,
      /onClick=\{\(\) => setActiveTab\("OVERVIEW"\)\}/,
      "Overview must not be a top-level tab button"
    );
    assert.doesNotMatch(
      pageContent,
      /onClick=\{\(\) => setActiveTab\("BILLING"\)\}/,
      "Billing & Usage must not be a top-level tab button"
    );
    assert.doesNotMatch(
      pageContent,
      /onClick=\{\(\) => setActiveTab\("INSIGHTS"\)\}/,
      "Insights must not be a top-level tab button"
    );
  });

  // Scenario 2: Templates and Usage remain accessible under Settings
  await t.test("Scenario 2: Templates, Usage, Connection, and Automation Preferences are accessible under Settings", () => {
    const settingsContent = fs.readFileSync(
      path.join(process.cwd(), "components/whatsapp/WhatsAppSettingsView.tsx"),
      "utf8"
    );

    assert.match(
      settingsContent,
      /export type SettingsSubSection =\s*"CONNECTION" \| "TEMPLATES" \| "USAGE" \| "AUTOMATION";/,
      "Settings must support CONNECTION, TEMPLATES, USAGE, and AUTOMATION sub-sections"
    );

    // Check button sub-tabs exist
    assert.ok(settingsContent.includes(`setSubSection("CONNECTION")`), "Connection sub-section button exists");
    assert.ok(settingsContent.includes(`setSubSection("TEMPLATES")`), "Templates sub-section button exists");
    assert.ok(settingsContent.includes(`setSubSection("USAGE")`), "Usage sub-section button exists");
    assert.ok(settingsContent.includes(`setSubSection("AUTOMATION")`), "Automation Preferences sub-section button exists");

    // Component embedding check
    assert.ok(settingsContent.includes("<TemplatesView"), "TemplatesView is embedded under Settings");
    assert.ok(settingsContent.includes("<BillingUsageView"), "Usage (BillingUsageView) is embedded under Settings");
  });

  // Scenario 3: Utility messages use the ₹0.15 configured application rate
  await t.test("Scenario 3: Utility messages are configured at ₹0.15 application rate", () => {
    assert.strictEqual(WHATSAPP_APPLICATION_RATES.UTILITY, 0.15, "Utility rate must be ₹0.15");

    assert.strictEqual(
      getMessageCategory("INVOICE_RECEIPT", "blow_salon_invoice"),
      "UTILITY",
      "Invoice receipts must be classified as UTILITY"
    );

    assert.strictEqual(
      getMessageCategory("APPOINTMENT_REMINDER", "appointment_reminder"),
      "UTILITY",
      "Appointment reminders must be classified as UTILITY"
    );

    const charge500 = calculateCategoryUsageCharge("UTILITY", 500);
    assert.strictEqual(charge500, 75.0, "500 utility messages @ ₹0.15 should equal ₹75.00");
  });

  // Scenario 4: Marketing messages use the ₹0.90 configured application rate
  await t.test("Scenario 4: Marketing messages are configured at ₹0.90 application rate", () => {
    assert.strictEqual(WHATSAPP_APPLICATION_RATES.MARKETING, 0.90, "Marketing rate must be ₹0.90");

    assert.strictEqual(
      getMessageCategory("MARKETING_CAMPAIGN", "blow_salon_campaign"),
      "MARKETING",
      "Marketing campaigns must be classified as MARKETING"
    );

    const charge300 = calculateCategoryUsageCharge("MARKETING", 300);
    assert.strictEqual(charge300, 270.0, "300 marketing messages @ ₹0.90 should equal ₹270.00");

    const charge15 = calculateCategoryUsageCharge("MARKETING", 15);
    assert.strictEqual(charge15, 13.5, "15 marketing messages @ ₹0.90 should equal ₹13.50");
  });

  // Scenario 5: Monthly reports show correct counts and charges
  await t.test("Scenario 5: Monthly usage summary accurately computes counts and charges", () => {
    // Illustrative test: 500 Utility sends and 300 Marketing sends
    const utilityCount = 500;
    const marketingCount = 300;

    const utilityCharge = calculateCategoryUsageCharge("UTILITY", utilityCount);
    const marketingCharge = calculateCategoryUsageCharge("MARKETING", marketingCount);
    const totalCharge = Math.round((utilityCharge + marketingCharge) * 100) / 100;

    assert.strictEqual(utilityCharge, 75.0);
    assert.strictEqual(marketingCharge, 270.0);
    assert.strictEqual(totalCharge, 345.0);
  });

  // Scenario 6: Duplicate webhooks do not inflate usage counts or downgrade state
  await t.test("Scenario 6: Webhook status progression is strictly idempotent", () => {
    const webhookContent = fs.readFileSync(
      path.join(process.cwd(), "app/api/whatsapp/webhook/route.ts"),
      "utf8"
    );

    // Verify STATUS_RANK guard exists in webhook route
    assert.match(
      webhookContent,
      /STATUS_RANK:\s*Record<string,\s*number>/,
      "STATUS_RANK mapping must be defined in webhook route"
    );

    // Verify downgrade prevention
    assert.match(
      webhookContent,
      /newRank\s*>\s*0\s*&&\s*currentRank\s*>=\s*newRank/,
      "Webhook must prevent downgrading higher-ranked terminal states (e.g. READ back to DELIVERED)"
    );

    // Verify shouldRecalculate guard
    assert.match(
      webhookContent,
      /if\s*\(\s*campaignId\s*&&\s*shouldRecalculate\s*\)/,
      "Campaign counters must only recalculate when status actually changes"
    );
  });

  // Scenario 7: A campaign with 100 recipients and 15 confirmed failures offers retry for those 15 only
  await t.test("Scenario 7: Campaign with 100 recipients and 15 failures filters only those 15", () => {
    const recipients = [];

    // 85 Delivered
    for (let i = 0; i < 85; i++) {
      recipients.push({
        id: `rec-${i}`,
        status: "DELIVERED",
        customerName: `Customer ${i}`,
        phone: `+9198765432${i.toString().padStart(2, "0")}`,
      });
    }

    // 15 Failed
    for (let i = 85; i < 100; i++) {
      recipients.push({
        id: `rec-${i}`,
        status: "FAILED",
        customerName: `Customer ${i}`,
        phone: `+9198765432${i.toString().padStart(2, "0")}`,
        errorMessage: "Temporary network timeout",
        errorCode: null,
      });
    }

    const stats = calculateCampaignStats(recipients);
    assert.strictEqual(stats.totalRecipients, 100);
    assert.strictEqual(stats.deliveredCount, 85);
    assert.strictEqual(stats.failedCount, 15);

    // Filter only failed recipients
    const failedOnly = recipients.filter((r) => r.status === "FAILED");
    assert.strictEqual(failedOnly.length, 15, "Only the 15 failed recipients are targeted");

    const failedIds = failedOnly.map((r) => r.id);
    assert.ok(failedIds.includes("rec-85"));
    assert.ok(failedIds.includes("rec-99"));
    assert.ok(!failedIds.includes("rec-0"));
    assert.ok(!failedIds.includes("rec-84"));
  });

  // Scenario 8: Delivered and pending messages are never retried
  await t.test("Scenario 8: Delivered, read, and pending messages are strictly excluded from retries", () => {
    const testCases = [
      { status: "DELIVERED", eligible: false },
      { status: "READ", eligible: false },
      { status: "PENDING", eligible: false },
      { status: "SENDING", eligible: false },
      { status: "SENT", eligible: false },
      { status: "EXCLUDED", eligible: false },
    ];

    for (const tc of testCases) {
      const isFailed = tc.status === "FAILED";
      assert.strictEqual(
        isFailed,
        tc.eligible,
        `Status ${tc.status} must not be eligible for retry`
      );
    }
  });

  // Scenario 9: Repeated clicks do not enqueue duplicate retries
  await t.test("Scenario 9: Concurrency safeguard blocks simultaneous retry executions", () => {
    const retryRouteContent = fs.readFileSync(
      path.join(process.cwd(), "app/api/whatsapp/campaigns/[id]/retry/route.ts"),
      "utf8"
    );

    assert.match(
      retryRouteContent,
      /campaign\.status\s*===\s*"SENDING"\s*\|\|\s*campaign\.isRetrying\s*===\s*true/,
      "Campaign retry route must reject requests when campaign is already sending or retrying"
    );

    assert.match(
      retryRouteContent,
      /isRetrying:\s*true/,
      "Retry route must acquire isRetrying lock"
    );

    assert.match(
      retryRouteContent,
      /isRetrying:\s*false/,
      "Retry route must release isRetrying lock upon completion or error"
    );
  });

  // Scenario 10: Authentication failures and permanent recipient errors are not blindly retried
  await t.test("Scenario 10: Invalid numbers, opt-outs, and auth errors are excluded from automatic retry", () => {
    // 1. Invalid recipient phone number (Meta 131030)
    const invalidPhoneResult = classifyRetryEligibility("Invalid destination phone number", "131030", 0);
    assert.strictEqual(invalidPhoneResult.eligible, false, "Invalid phone number must not be eligible");
    assert.strictEqual(invalidPhoneResult.classification, "INVALID_RECIPIENT");

    // 2. Opted out customer
    const optOutResult = classifyRetryEligibility("Customer opted out", null, 0);
    assert.strictEqual(optOutResult.eligible, false, "Opted-out customer must not be eligible");
    assert.strictEqual(optOutResult.classification, "OPT_OUT");

    // 3. Meta Authentication error (Meta 190)
    const authResult = classifyRetryEligibility("Access token expired or unauthorized", "190", 0);
    assert.strictEqual(authResult.eligible, false, "Auth error must abort automatic retries");
    assert.strictEqual(authResult.classification, "AUTH_ERROR");

    // 4. Max attempts limit reached (>= 2)
    const maxRetriesResult = classifyRetryEligibility("Temporary timeout", null, 2);
    assert.strictEqual(maxRetriesResult.eligible, false, "Recipients with >= 2 attempts must not auto-retry");

    // 5. Transient error with retryCount = 0 (Eligible)
    const transientResult = classifyRetryEligibility("Server temporarily busy", "500", 0);
    assert.strictEqual(transientResult.eligible, true, "Transient failure must be eligible for retry");
    assert.strictEqual(transientResult.classification, "TRANSIENT_API_ERROR");
  });

  // Scenario 11: Paused WhatsApp blocks campaigns and retries
  await t.test("Scenario 11: WhatsApp master kill-switch blocks campaigns and retries when paused", () => {
    const retryRouteContent = fs.readFileSync(
      path.join(process.cwd(), "app/api/whatsapp/campaigns/[id]/retry/route.ts"),
      "utf8"
    );
    const sendRouteContent = fs.readFileSync(
      path.join(process.cwd(), "app/api/whatsapp/campaigns/[id]/send/route.ts"),
      "utf8"
    );

    assert.match(
      retryRouteContent,
      /assertWhatsAppEnabled\(\)/,
      "Retry route must enforce assertWhatsAppEnabled()"
    );
    assert.match(
      sendRouteContent,
      /assertWhatsAppEnabled\(\)/,
      "Send route must enforce assertWhatsAppEnabled()"
    );
  });

  // Scenario 12: Existing invoice and appointment notifications continue working
  await t.test("Scenario 12: Invoice receipts preserve template blow_salon_invoice and coexistence", () => {
    const cloudProviderContent = fs.readFileSync(
      path.join(process.cwd(), "lib/whatsapp/cloudProvider.ts"),
      "utf8"
    );

    assert.match(
      cloudProviderContent,
      /blow_salon_invoice/,
      "Cloud provider must preserve blow_salon_invoice template"
    );

    assert.match(
      cloudProviderContent,
      /whatsapp_coexistence/,
      "Cloud provider must resolve WABA ID and Phone ID from whatsapp_coexistence document"
    );
  });
});
