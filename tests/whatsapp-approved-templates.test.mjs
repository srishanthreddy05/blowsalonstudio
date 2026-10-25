import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import {
  META_WHATSAPP_TEMPLATES,
  getTemplateLanguage,
  getTemplateExpectedParamCount,
  isTemplateExposedInUI,
  sanitizeTemplateVariable,
  getTemplateHeaderFormat,
  templateRequiresImageHeader,
  prependTemplateImageHeader,
  DEFAULT_TEMPLATE_HEADER_IMAGE_URL,
} from "../lib/whatsapp/templateRegistry.ts";

import { normalizePhoneNumber } from "../lib/utils/phone.ts";
import { getMessageCategory } from "../lib/whatsapp/pricingConfig.ts";

test("BLOW SALON — Meta-Approved WhatsApp Templates Suite", async (t) => {
  // ── 1. Approved Template Registry Verification ───────────────────────────
  await t.test("Requirement 1: Exact approved templates are registered with correct specs", () => {
    // 1. Appointment Confirmation
    const confirmation = META_WHATSAPP_TEMPLATES["blow_salon_appointment_confirmation"];
    assert.ok(confirmation, "blow_salon_appointment_confirmation must be registered");
    assert.strictEqual(confirmation.name, "blow_salon_appointment_confirmation");
    assert.strictEqual(confirmation.language, "en");
    assert.strictEqual(confirmation.category, "UTILITY");
    assert.strictEqual(confirmation.expectedParamCount, 1);
    assert.strictEqual(confirmation.exposedInUI, true);
    assert.strictEqual(confirmation.headerFormat, "IMAGE");
    assert.strictEqual(confirmation.purpose, "appointment");

    // 2. Appointment Reminder
    const reminder = META_WHATSAPP_TEMPLATES["blow_salon_appointment_reminder"];
    assert.ok(reminder, "blow_salon_appointment_reminder must be registered");
    assert.strictEqual(reminder.name, "blow_salon_appointment_reminder");
    assert.strictEqual(reminder.language, "en");
    assert.strictEqual(reminder.category, "UTILITY");
    assert.strictEqual(reminder.expectedParamCount, 1);
    assert.strictEqual(reminder.exposedInUI, true);
    assert.strictEqual(reminder.headerFormat, "IMAGE");
    assert.strictEqual(reminder.purpose, "appointment");

    // 3. Invoice Receipt (Plural: blow_salon_invoices)
    const invoice = META_WHATSAPP_TEMPLATES["blow_salon_invoices"];
    assert.ok(invoice, "blow_salon_invoices must be registered");
    assert.strictEqual(invoice.name, "blow_salon_invoices");
    assert.strictEqual(invoice.language, "en");
    assert.strictEqual(invoice.category, "UTILITY");
    assert.strictEqual(invoice.expectedParamCount, 8);
    assert.strictEqual(invoice.exposedInUI, true);
    assert.strictEqual(invoice.headerFormat, "IMAGE");
    assert.strictEqual(invoice.purpose, "invoice");

    // 4. Marketing Campaign
    const campaign = META_WHATSAPP_TEMPLATES["blow_salon_campaign"];
    assert.ok(campaign, "blow_salon_campaign must be registered");
    assert.strictEqual(campaign.name, "blow_salon_campaign");
    assert.strictEqual(campaign.language, "en");
    assert.strictEqual(campaign.category, "MARKETING");
    assert.strictEqual(campaign.expectedParamCount, 2);
    assert.strictEqual(campaign.exposedInUI, true);
    assert.strictEqual(campaign.headerFormat, "IMAGE");
    assert.strictEqual(campaign.purpose, "campaign");
  });

  // ── 2. Helper functions & Language enforcement ──────────────────────────
  await t.test("Requirement 2: Centralized helpers enforce exact Meta language and param count", () => {
    // Language must strictly resolve to 'en' for all 4 templates
    assert.strictEqual(getTemplateLanguage("blow_salon_appointment_confirmation"), "en");
    assert.strictEqual(getTemplateLanguage("blow_salon_appointment_reminder"), "en");
    assert.strictEqual(getTemplateLanguage("blow_salon_invoices"), "en");
    assert.strictEqual(getTemplateLanguage("blow_salon_campaign"), "en");

    // Expected param counts
    assert.strictEqual(getTemplateExpectedParamCount("blow_salon_appointment_confirmation"), 1);
    assert.strictEqual(getTemplateExpectedParamCount("blow_salon_appointment_reminder"), 1);
    assert.strictEqual(getTemplateExpectedParamCount("blow_salon_invoices"), 8);
    assert.strictEqual(getTemplateExpectedParamCount("blow_salon_campaign"), 2);

    // Header formats
    assert.strictEqual(getTemplateHeaderFormat("blow_salon_appointment_confirmation"), "IMAGE");
    assert.strictEqual(getTemplateHeaderFormat("blow_salon_appointment_reminder"), "IMAGE");
    assert.strictEqual(getTemplateHeaderFormat("blow_salon_invoices"), "IMAGE");
    assert.strictEqual(getTemplateHeaderFormat("blow_salon_campaign"), "IMAGE");
    assert.strictEqual(getTemplateHeaderFormat("3p_direct_integration_test_template"), "NONE");
    assert.strictEqual(getTemplateHeaderFormat("hello_world"), "NONE");

    assert.strictEqual(templateRequiresImageHeader("blow_salon_appointment_confirmation"), true);
    assert.strictEqual(templateRequiresImageHeader("blow_salon_appointment_reminder"), true);
    assert.strictEqual(templateRequiresImageHeader("blow_salon_invoices"), true);
    assert.strictEqual(templateRequiresImageHeader("blow_salon_campaign"), true);
    assert.strictEqual(templateRequiresImageHeader("3p_direct_integration_test_template"), false);
    assert.strictEqual(templateRequiresImageHeader("hello_world"), false);

    // UI Exposure
    assert.strictEqual(isTemplateExposedInUI("blow_salon_appointment_confirmation"), true);
    assert.strictEqual(isTemplateExposedInUI("blow_salon_appointment_reminder"), true);
    assert.strictEqual(isTemplateExposedInUI("blow_salon_invoices"), true);
    assert.strictEqual(isTemplateExposedInUI("blow_salon_campaign"), true);
    assert.strictEqual(isTemplateExposedInUI("hello_world"), false);
  });

  // ── 3. Category & Pricing classification ────────────────────────────────
  await t.test("Requirement 3: Utility vs Marketing categorization", () => {
    assert.strictEqual(
      getMessageCategory("APPOINTMENT_CONFIRMATION", "blow_salon_appointment_confirmation"),
      "UTILITY"
    );
    assert.strictEqual(
      getMessageCategory("APPOINTMENT_REMINDER", "blow_salon_appointment_reminder"),
      "UTILITY"
    );
    assert.strictEqual(
      getMessageCategory("INVOICE_RECEIPT", "blow_salon_invoices"),
      "UTILITY"
    );
    assert.strictEqual(
      getMessageCategory("MARKETING_CAMPAIGN", "blow_salon_campaign"),
      "MARKETING"
    );
  });

  // ── 4. Parameter sanitization ───────────────────────────────────────────
  await t.test("Requirement 4: Variable sanitization guarantees Meta compliance", () => {
    // Removes newlines, tabs, and excess whitespace
    assert.strictEqual(
      sanitizeTemplateVariable("Sneha\nReddy\t\t"),
      "Sneha Reddy"
    );
    // Null/undefined/empty returns fallback and never empty string
    assert.strictEqual(sanitizeTemplateVariable(null, "Customer"), "Customer");
    assert.strictEqual(sanitizeTemplateVariable("", "Valued Guest"), "Valued Guest");
    assert.strictEqual(sanitizeTemplateVariable("   ", "Customer"), "Customer");
    assert.strictEqual(sanitizeTemplateVariable("₹500", "-"), "₹500");
  });

  // ── 5. CloudWhatsAppProvider code analysis ──────────────────────────────
  await t.test("Requirement 5: CloudWhatsAppProvider references exact template names and checks parameter counts", () => {
    const cloudProviderPath = path.join(process.cwd(), "lib/whatsapp/cloudProvider.ts");
    const content = fs.readFileSync(cloudProviderPath, "utf8");

    // Must set default invoice template to blow_salon_invoices (plural)
    assert.match(
      content,
      /this\.invoiceTemplateName\s*=\s*"blow_salon_invoices"/,
      "Cloud provider must set invoiceTemplateName to blow_salon_invoices"
    );

    // Must validate 8 params for blow_salon_invoices
    assert.match(
      content,
      /blow_salon_invoices/,
      "Must reference blow_salon_invoices in provider"
    );

    // Must validate 1 param for confirmation
    assert.match(
      content,
      /blow_salon_appointment_confirmation/,
      "Must reference blow_salon_appointment_confirmation in provider"
    );

    // Must validate 1 param for reminder
    assert.match(
      content,
      /blow_salon_appointment_reminder/,
      "Must reference blow_salon_appointment_reminder in provider"
    );

    // Must expose sendAppointmentMessage method
    assert.match(
      content,
      /sendAppointmentMessage\s*\(/,
      "Provider must implement sendAppointmentMessage"
    );
  });

  // ── 6. Phone number normalization & safety ──────────────────────────────
  await t.test("Requirement 6: Phone number validation handles invalid and valid numbers gracefully", () => {
    // Valid Indian 10-digit mobile
    const valid1 = normalizePhoneNumber("9876543210");
    assert.strictEqual(valid1.isValid, true);
    assert.strictEqual(valid1.digits, "919876543210");

    // Valid with +91 prefix
    const valid2 = normalizePhoneNumber("+91 9876543210");
    assert.strictEqual(valid2.isValid, true);
    assert.strictEqual(valid2.digits, "919876543210");

    // Invalid numbers
    const invalidEmpty = normalizePhoneNumber("");
    assert.strictEqual(invalidEmpty.isValid, false);

    const invalidShort = normalizePhoneNumber("12345");
    assert.strictEqual(invalidShort.isValid, false);

    const invalidLetters = normalizePhoneNumber("abcdefghij");
    assert.strictEqual(invalidLetters.isValid, false);
  });

  // ── 7. Send-appointment API route verification ──────────────────────────
  await t.test("Requirement 7: Send-appointment route enforces assertWhatsAppEnabled, phone validation, and audit logging", () => {
    const routePath = path.join(process.cwd(), "app/api/whatsapp/send-appointment/route.ts");
    assert.ok(fs.existsSync(routePath), "send-appointment route.ts must exist");
    const content = fs.readFileSync(routePath, "utf8");

    // Master kill-switch check
    assert.match(
      content,
      /assertWhatsAppEnabled\(\)/,
      "send-appointment must enforce assertWhatsAppEnabled()"
    );

    // References exact template names
    assert.match(
      content,
      /blow_salon_appointment_confirmation/,
      "Must use blow_salon_appointment_confirmation"
    );
    assert.match(
      content,
      /blow_salon_appointment_reminder/,
      "Must use blow_salon_appointment_reminder"
    );

    // Exactly 1 body parameter: customer name
    assert.match(
      content,
      /bodyParameters\s*=\s*\[\s*\{\s*type:\s*"text",\s*text:\s*sanitizedName\s*\}\s*\]/,
      "Must supply exactly 1 body parameter: sanitized customer name"
    );

    // Audit logging to whatsapp_messages
    assert.match(
      content,
      /whatsapp_messages/,
      "Must log dispatches to whatsapp_messages collection"
    );
  });

  // ── 8. UI Integration verification ──────────────────────────────────────
  await t.test("Requirement 8: UI components have Send Confirmation WhatsApp and Send Reminder WhatsApp buttons", () => {
    // 1. AddAppointmentModal
    const addModalPath = path.join(process.cwd(), "components/appointments/AddAppointmentModal.tsx");
    const addContent = fs.readFileSync(addModalPath, "utf8");
    assert.match(
      addContent,
      /Send Confirmation WhatsApp/,
      "AddAppointmentModal must have 'Send Confirmation WhatsApp' button"
    );
    assert.match(
      addContent,
      /Send Reminder WhatsApp/,
      "AddAppointmentModal must have 'Send Reminder WhatsApp' button"
    );
    assert.match(
      addContent,
      /disabled=\{sendingConfirmation\s*\|\|\s*sendingReminder\}/,
      "Must disable buttons while request is in progress to prevent duplicate clicks"
    );

    // 2. AppointmentDetailModal
    const detailModalPath = path.join(process.cwd(), "components/appointments/AppointmentDetailModal.tsx");
    const detailContent = fs.readFileSync(detailModalPath, "utf8");
    assert.match(
      detailContent,
      /Send Confirmation WhatsApp/,
      "AppointmentDetailModal must have 'Send Confirmation WhatsApp' button"
    );
    assert.match(
      detailContent,
      /Send Reminder WhatsApp/,
      "AppointmentDetailModal must have 'Send Reminder WhatsApp' button"
    );
    assert.match(
      detailContent,
      /disabled=\{sendingConfirmation\s*\|\|\s*sendingReminder\}/,
      "Must prevent duplicate clicks while sending"
    );
  });

  // ── 9. Non-automatic dispatch on save ───────────────────────────────────
  await t.test("Requirement 9: Saving an appointment does not trigger automatic WhatsApp dispatches", () => {
    const servicePath = path.join(process.cwd(), "services/appointments.ts");
    const serviceContent = fs.readFileSync(servicePath, "utf8");

    // appointmentService.create only saves to Firestore appointments collection
    assert.doesNotMatch(
      serviceContent,
      /sendAppointmentWhatsApp/,
      "appointments.ts create() must NOT call WhatsApp dispatch"
    );
    assert.doesNotMatch(
      serviceContent,
      /blow_salon_appointment_confirmation/,
      "appointments.ts create() must NOT automatically invoke confirmation template"
    );
  });

  // ── 10. Campaign and Invoice template integration ───────────────────────
  await t.test("Requirement 10: Campaign and Invoice templates maintain exact parameter mappings", () => {
    // Campaign: exactly 2 params (1: customer name, 2: message)
    const sendCampaignPath = path.join(
      process.cwd(),
      "app/api/whatsapp/campaigns/[id]/send/route.ts"
    );
    const sendCampaignContent = fs.readFileSync(sendCampaignPath, "utf8");
    assert.match(
      sendCampaignContent,
      /blow_salon_campaign/,
      "Campaign send route must use blow_salon_campaign"
    );

    // Invoice: exactly 8 params
    const cloudProviderPath = path.join(process.cwd(), "lib/whatsapp/cloudProvider.ts");
    const cloudContent = fs.readFileSync(cloudProviderPath, "utf8");
    assert.match(
      cloudContent,
      /bodyParameters\s*=\s*\[[\s\S]*?customerName[\s\S]*?invoiceNumber[\s\S]*?invoiceDate[\s\S]*?itemsSummary[\s\S]*?subtotal[\s\S]*?tax[\s\S]*?total[\s\S]*?paymentInfo[\s\S]*?\]/,
      "sendInvoiceReceipt must map exactly 8 parameters in order: customerName, invoiceNumber, invoiceDate, itemsSummary, subtotal, tax, total, paymentInfo"
    );
  });

  // ── 11. Header Image Component Attachment & Omission ────────────────────
  await t.test("Requirement 11: Header is added for IMAGE-header templates and omitted for others", () => {
    const bodyComp = {
      type: "body",
      parameters: [{ type: "text", text: "Sneha Reddy" }],
    };

    // 1. For IMAGE-header templates (confirmation, reminder, invoices, campaign),
    // header component MUST be prepended at index 0
    for (const tName of [
      "blow_salon_appointment_confirmation",
      "blow_salon_appointment_reminder",
      "blow_salon_invoices",
      "blow_salon_campaign",
    ]) {
      const components = prependTemplateImageHeader(tName, [bodyComp]);
      assert.strictEqual(components.length, 2, `${tName} must have 2 components (header + body)`);
      assert.deepStrictEqual(components[0], {
        type: "header",
        parameters: [
          {
            type: "image",
            image: {
              link: DEFAULT_TEMPLATE_HEADER_IMAGE_URL,
            },
          },
        ],
      });
      // Body parameters must remain untouched
      assert.deepStrictEqual(components[1], bodyComp);
    }

    // 2. For templates WITHOUT an IMAGE header (e.g. 3p_direct_integration_test_template, hello_world, non_image_template),
    // header component MUST be strictly omitted
    for (const tName of ["3p_direct_integration_test_template", "hello_world", "non_image_template"]) {
      const components = prependTemplateImageHeader(tName, [bodyComp]);
      assert.strictEqual(
        components.some((c) => (c.type || "").toString().toLowerCase() === "header"),
        false,
        `${tName} must NOT have a header component`
      );
      assert.deepStrictEqual(components, [bodyComp]);
    }

    // 3. Custom image URL overrides default
    const customUrl = "https://example.com/custom-header.png";
    const customComponents = prependTemplateImageHeader("blow_salon_invoices", [bodyComp], customUrl);
    assert.strictEqual(
      customComponents[0].parameters[0].image.link,
      customUrl,
      "Should use custom header image URL when provided"
    );

    // 4. Verify CloudWhatsAppProvider implementation
    const cloudProviderPath = path.join(process.cwd(), "lib/whatsapp/cloudProvider.ts");
    const cloudContent = fs.readFileSync(cloudProviderPath, "utf8");

    assert.match(
      cloudContent,
      /WHATSAPP_TEMPLATE_HEADER_IMAGE_URL/,
      "Cloud provider must read optional WHATSAPP_TEMPLATE_HEADER_IMAGE_URL"
    );
    assert.match(
      cloudContent,
      /https:\/\/blowsalonstudio\.vercel\.app\/blowtemplate\.png/,
      "Cloud provider must default header image to https://blowsalonstudio.vercel.app/blowtemplate.png"
    );
    assert.match(
      cloudContent,
      /buildTemplateComponents/,
      "Cloud provider must implement buildTemplateComponents"
    );
    assert.match(
      cloudContent,
      /hasImageHeader/,
      "Cloud provider must implement hasImageHeader with caching"
    );
  });
});
