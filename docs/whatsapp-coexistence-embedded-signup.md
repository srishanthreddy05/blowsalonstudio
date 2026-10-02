# WhatsApp Business App Coexistence & Meta Embedded Signup (Phase 1)

## Overview
This document outlines the foundation for **WhatsApp Business App ↔ Cloud API Coexistence** in BLOW SALON ERP. Coexistence allows the salon to keep using its official WhatsApp Business mobile/desktop application for real-time customer conversations while the ERP dispatches official receipts, automated reminders, and marketing campaigns via Meta Cloud API using the same phone number.

---

## 1. Key Meta Configuration Assets

| Parameter | Value | Location / Usage |
|---|---|---|
| **Meta App ID** | `2308689169962503` | `NEXT_PUBLIC_META_APP_ID` (used by Facebook JavaScript SDK) |
| **Meta App Name** | `BLOW SALON` | Registered Meta Developer App |
| **Login Configuration ID** | `1744937289890566` | Facebook Login for Business configuration for Coexistence |
| **Feature Type** | `whatsapp_business_app_onboarding` | Embedded Signup extras parameter |
| **Session Info Version** | `"3"` | Meta Embedded Signup session messaging format |
| **Response Type** | `"code"` | `override_default_response_type: true` |

---

## 2. Architecture & Flow

```
[BLOW SALON Settings UI]
        │
        ▼ (User clicks "Connect WhatsApp Business App")
[Meta Facebook JavaScript SDK]
        │
        ▼ (FB.login with config_id: 1744937289890566)
[Meta Embedded Signup Popup]
        │ (Salon authorizes existing WhatsApp Business App number)
        ▼
[Window Session Listener: WA_EMBEDDED_SIGNUP]
        │ (Receives FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING event)
        ▼ (POST /api/whatsapp/embedded-signup with code & sessionData)
[BLOW SALON Dedicated Backend Endpoint]
        │ (Exchanges code server-side if app secret configured; resolves WABA & Phone ID)
        │ (DOES NOT call phone registration API - coexistence numbers are already registered)
        ▼
[Firestore Settings Storage]
        ├── settings/whatsapp_coexistence (Dedicated coexistence record)
        └── settings/whatsapp.coexistence (Merged non-secret overview)
        │
        ▼
[BLOW SALON UI Updates to CONNECTED]
```

---

## 3. Implementation Files

| File | Purpose |
|---|---|
| [lib/whatsapp/embeddedSignup.ts](file:///c:/clients/blow-salon/lib/whatsapp/embeddedSignup.ts) | Client-side SDK loader, `WA_EMBEDDED_SIGNUP` window listener, and `launchWhatsAppBusinessOnboarding()` helper. |
| [app/api/whatsapp/embedded-signup/route.ts](file:///c:/clients/blow-salon/app/api/whatsapp/embedded-signup/route.ts) | Dedicated server-side onboarding endpoint (`GET`, `POST`, `DELETE`). Validates assets, avoids phone registration, and securely persists metadata. |
| [services/whatsapp.ts](file:///c:/clients/blow-salon/services/whatsapp.ts) | Frontend service helpers: `getCoexistenceStatus()`, `completeEmbeddedSignup()`, and `disconnectCoexistence()`. |
| [types/whatsapp.ts](file:///c:/clients/blow-salon/types/whatsapp.ts) | `WhatsAppCoexistenceAccount` interface and coexistence state definitions. |
| [app/api/whatsapp/status/route.ts](file:///c:/clients/blow-salon/app/api/whatsapp/status/route.ts) | Augments status endpoint to report coexistence account status alongside provider state. |
| [components/whatsapp/WhatsAppSettingsView.tsx](file:///c:/clients/blow-salon/components/whatsapp/WhatsAppSettingsView.tsx) | Clean settings UI section: "Connect WhatsApp Business" with status badge, action button, and connection details. |
| [app/api/whatsapp/webhook/route.ts](file:///c:/clients/blow-salon/app/api/whatsapp/webhook/route.ts) | Architectural foundation for Phase 2 coexistence events (`smb_message_echoes`, `history`, `account_update`, `smb_app_state_sync`). |

---

## 4. Security & Privacy Rules

1. **Zero Client Secret Exposure**:
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, system tokens, and authorization codes are NEVER exposed to client JavaScript, `localStorage`, `sessionStorage`, or browser logs.
2. **Safe Structured Logging**:
   - Only non-sensitive lifecycle events are logged (e.g. `"Embedded Signup started"`, `"Embedded Signup completed"`, `"WABA onboarding completed"`, `"WhatsApp phone discovered"`).
3. **No Phone Registration**:
   - Because this flow is specifically for existing WhatsApp Business App coexistence, the endpoint explicitly skips calling `POST /{phone_number_id}/register`. Calling registration would break coexistence or unregister the mobile app.
4. **Production Independence**:
   - The existing production Cloud API configuration (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`) remains untouched and active.

---

## 5. How to Test the Flow

1. Open the BLOW SALON ERP and navigate to **WhatsApp** → **Settings**.
2. Locate the **Connect WhatsApp Business** section.
   - Status should read `NOT CONNECTED`.
3. Click **Connect WhatsApp Business App**.
   - The Meta Embedded Signup popup will open with configuration `1744937289890566`.
4. If the popup is closed or cancelled:
   - UI gracefully shows: `"WhatsApp connection was cancelled."`
5. When the authorization flow finishes in Meta:
   - The window listener captures `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
   - The authorization code and session data are transmitted to `/api/whatsapp/embedded-signup`.
   - The UI updates to `CONNECTED` and displays the verified business number and WABA status.
6. Verify existing messaging:
   - Dispatch an invoice receipt from **Billing** or send a test template message from **Campaigns** to confirm existing Cloud API dispatch is unaffected.

---

## 6. Meta Dashboard Settings Required

In the [Meta App Dashboard](https://developers.facebook.com/apps/2308689169962503/):
1. **Facebook Login for Business**:
   - Ensure Configuration `1744937289890566` has the feature `whatsapp_business_app_onboarding` enabled.
   - Ensure valid OAuth Redirect URIs includes your domain: `https://<your-domain>/` and `http://localhost:3000/` for local testing.
2. **WhatsApp Product**:
   - Webhook URL should point to: `https://<your-domain>/api/whatsapp/webhook`.
   - Webhook fields for coexistence: `messages`, `smb_message_echoes`, `history`, `account_update`.
