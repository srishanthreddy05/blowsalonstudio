import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import {
  META_WHATSAPP_TEMPLATES,
  prependTemplateImageHeader,
  DEFAULT_TEMPLATE_HEADER_IMAGE_URL,
  templateRequiresImageHeader,
} from "../lib/whatsapp/templateRegistry.ts";

import { normalizeCampaignData } from "../lib/utils/firestore.ts";

test("BLOW SALON — Cloudinary WhatsApp Campaign Header Images Suite", async (t) => {
  const CLOUDINARY_SAMPLE_URL =
    "https://res.cloudinary.com/dakgppa8o/image/upload/v1730000000/blow-salon/campaigns/festive_special.jpg";

  // ── 1. Selected-Image Precedence ──────────────────────────────────────────
  await t.test("Requirement 1: Custom Cloudinary image takes precedence over default URL", () => {
    const bodyComp = {
      type: "body",
      parameters: [
        { type: "text", text: "Rahul Sharma" },
        { type: "text", text: "20% OFF Festive Hair Spa" },
      ],
    };

    // When custom Cloudinary image URL is provided
    const components = prependTemplateImageHeader(
      "blow_salon_campaign",
      [bodyComp],
      CLOUDINARY_SAMPLE_URL
    );

    assert.strictEqual(components.length, 2, "Must have header and body components");
    assert.strictEqual(components[0].type, "header");
    assert.strictEqual(
      components[0].parameters[0].image.link,
      CLOUDINARY_SAMPLE_URL,
      "Header image must use the exact selected Cloudinary URL"
    );

    // Body parameters must remain pristine and untouched
    assert.strictEqual(components[1].type, "body");
    assert.strictEqual(components[1].parameters[0].text, "Rahul Sharma");
    assert.strictEqual(components[1].parameters[1].text, "20% OFF Festive Hair Spa");
  });

  // ── 2. Default-Image Fallback ────────────────────────────────────────────
  await t.test("Requirement 2: Falls back to default template image when no custom image is selected", () => {
    const bodyComp = {
      type: "body",
      parameters: [
        { type: "text", text: "Priya Patel" },
        { type: "text", text: "Weekend Blow Dry Special" },
      ],
    };

    // When image URL is omitted / undefined
    const componentsOmitted = prependTemplateImageHeader("blow_salon_campaign", [bodyComp]);
    assert.strictEqual(componentsOmitted.length, 2);
    assert.strictEqual(
      componentsOmitted[0].parameters[0].image.link,
      process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL || DEFAULT_TEMPLATE_HEADER_IMAGE_URL,
      "Must fallback to WHATSAPP_TEMPLATE_HEADER_IMAGE_URL / DEFAULT_TEMPLATE_HEADER_IMAGE_URL"
    );

    // When image URL is null or empty string
    const componentsEmpty = prependTemplateImageHeader("blow_salon_campaign", [bodyComp], "");
    assert.strictEqual(
      componentsEmpty[0].parameters[0].image.link,
      process.env.WHATSAPP_TEMPLATE_HEADER_IMAGE_URL || DEFAULT_TEMPLATE_HEADER_IMAGE_URL,
      "Empty string must fall back to default header image"
    );
  });

  // ── 3. Firestore Document Normalization & Persistence ───────────────────
  await t.test("Requirement 3: Campaign document normalization preserves headerImageUrl and metadata", () => {
    const rawCampaignWithImage = {
      name: "Diwali Glamour 2026",
      templateName: "blow_salon_campaign",
      templateLanguage: "en",
      headerImageUrl: CLOUDINARY_SAMPLE_URL,
      headerImageMetadata: {
        publicId: "blow-salon/campaigns/festive_special",
        format: "jpg",
        bytes: 1048576,
        width: 1200,
        height: 628,
        resourceType: "image",
        originalFilename: "festive_special.jpg",
      },
      totalRecipients: 150,
      sentCount: 150,
      deliveredCount: 145,
      readCount: 120,
      failedCount: 5,
    };

    const normalized = normalizeCampaignData(rawCampaignWithImage, "camp_123");
    assert.strictEqual(normalized.id, "camp_123");
    assert.strictEqual(normalized.headerImageUrl, CLOUDINARY_SAMPLE_URL);
    assert.ok(normalized.headerImageMetadata, "Metadata must be preserved");
    assert.strictEqual(
      normalized.headerImageMetadata.publicId,
      "blow-salon/campaigns/festive_special"
    );
    assert.strictEqual(normalized.headerImageMetadata.bytes, 1048576);

    // When campaign has no custom image
    const rawCampaignDefault = {
      name: "Default Header Campaign",
      templateName: "blow_salon_campaign",
    };
    const normalizedDefault = normalizeCampaignData(rawCampaignDefault, "camp_456");
    assert.strictEqual(normalizedDefault.headerImageUrl, null);
    assert.strictEqual(normalizedDefault.headerImageMetadata, null);
  });

  // ── 4. Upload Validation & Server Security ────────────────────────────────
  await t.test("Requirement 4: Upload endpoint enforces 5MB limit, image MIME check, and authorization", () => {
    const uploadRoutePath = path.join(
      process.cwd(),
      "app/api/whatsapp/campaigns/upload/route.ts"
    );
    assert.ok(fs.existsSync(uploadRoutePath), "Upload route file must exist");

    const content = fs.readFileSync(uploadRoutePath, "utf8");

    // 1. Checks 5MB limit (5 * 1024 * 1024 bytes)
    assert.match(
      content,
      /5\s*\*\s*1024\s*\*\s*1024/,
      "Must define 5MB (5 * 1024 * 1024) limit"
    );

    // 2. Checks allowed image MIME types (JPEG, PNG, WebP)
    assert.match(content, /image\/jpeg/, "Must accept image/jpeg");
    assert.match(content, /image\/png/, "Must accept image/png");
    assert.match(content, /image\/webp/, "Must accept image/webp");

    // 3. Reads Cloudinary env variables
    assert.match(content, /CLOUDINARY_CLOUD_NAME/, "Must read CLOUDINARY_CLOUD_NAME");
    assert.match(content, /CLOUDINARY_UPLOAD_PRESET/, "Must read CLOUDINARY_UPLOAD_PRESET");

    // 4. Never exposes API secrets (uses unsigned upload preset)
    assert.doesNotMatch(
      content,
      /CLOUDINARY_API_SECRET/,
      "Must NOT use or expose CLOUDINARY_API_SECRET"
    );

    // 5. Enforces server authorization
    assert.match(
      content,
      /verifyUploadAuthorization/,
      "Must implement server authorization check"
    );
    assert.match(content, /401/, "Must return 401 for unauthorized access");
  });

  // ── 5. Explicit Image Failure Stops Dispatch ──────────────────────────────
  await t.test("Requirement 5: Explicit upload failures stop campaign creation and do not silently fall back", () => {
    const campaignsRoutePath = path.join(
      process.cwd(),
      "app/api/whatsapp/campaigns/route.ts"
    );
    const content = fs.readFileSync(campaignsRoutePath, "utf8");

    assert.match(
      content,
      /uploadFailed/,
      "Campaign creation route must inspect uploadFailed status"
    );

    const modalPath = path.join(
      process.cwd(),
      "components/whatsapp/CreateCampaignModal.tsx"
    );
    const modalContent = fs.readFileSync(modalPath, "utf8");

    // Must prevent confirmation if upload is in progress or errored
    assert.match(
      modalContent,
      /imageUploadStatus === "UPLOADING"/,
      "Modal must block proceed when image is still uploading"
    );
    assert.match(
      modalContent,
      /imageUploadStatus === "ERROR"/,
      "Modal must block proceed and show error when upload failed"
    );
  });

  // ── 6. Retry Dispatch Preserves Image Selection ──────────────────────────
  await t.test("Requirement 6: Retry endpoint preserves and dispatches campaign-specific image selection", () => {
    const retryRoutePath = path.join(
      process.cwd(),
      "app/api/whatsapp/campaigns/[id]/retry/route.ts"
    );
    const content = fs.readFileSync(retryRoutePath, "utf8");

    assert.match(
      content,
      /campaign\.headerImageUrl/,
      "Retry route must pass campaign.headerImageUrl to provider.sendTemplateMessage"
    );

    const sendRoutePath = path.join(
      process.cwd(),
      "app/api/whatsapp/campaigns/[id]/send/route.ts"
    );
    const sendContent = fs.readFileSync(sendRoutePath, "utf8");

    assert.match(
      sendContent,
      /campaign\.headerImageUrl/,
      "Send route must pass campaign.headerImageUrl to provider.sendTemplateMessage"
    );
  });

  // ── 7. Message & Template Isolation ──────────────────────────────────────
  await t.test("Requirement 7: Non-campaign templates remain untouched and isolated", () => {
    // 1. blow_salon_invoices still requires 8 parameters and IMAGE header
    assert.strictEqual(META_WHATSAPP_TEMPLATES["blow_salon_invoices"].expectedParamCount, 8);
    assert.strictEqual(META_WHATSAPP_TEMPLATES["blow_salon_invoices"].headerFormat, "IMAGE");

    // 2. blow_salon_appointment_confirmation still requires 1 parameter
    assert.strictEqual(
      META_WHATSAPP_TEMPLATES["blow_salon_appointment_confirmation"].expectedParamCount,
      1
    );

    // 3. 3p_direct_integration_test_template still requires 0 parameters and strictly NO header
    assert.strictEqual(
      META_WHATSAPP_TEMPLATES["3p_direct_integration_test_template"].headerFormat,
      "NONE"
    );
    assert.strictEqual(
      templateRequiresImageHeader("3p_direct_integration_test_template"),
      false
    );

    // 4. blow_salon_campaign strictly maintains 2 parameters
    assert.strictEqual(META_WHATSAPP_TEMPLATES["blow_salon_campaign"].expectedParamCount, 2);
    assert.strictEqual(META_WHATSAPP_TEMPLATES["blow_salon_campaign"].headerFormat, "IMAGE");
  });
});
