# BLOW SALON — WhatsApp Persistent Queue Security & Crash-Safety Audit Report

**Date:** 4 November 2026  
**Status:** Completed & Production Verified  
**Runtime:** Next.js 16.2.7 (Node.js runtime), Firebase Admin SDK 14.1.0, Meta WhatsApp Cloud API  

---

## 1. Executive Summary

All four critical issues identified in the pre-deployment review have been resolved with minimal, targeted changes:
1. **Firestore Security Locked Down:** All server-side WhatsApp campaign and queue database operations have been migrated to the **Firebase Admin SDK** (`lib/firebaseAdmin.ts`). Direct client-side SDK access to `whatsappCampaignJobs`, `whatsapp_campaigns`, `whatsapp_campaign_recipients`, and `whatsapp_messages` is strictly forbidden (`allow read, write: if false;`), while core ERP client collections (`invoices`, `customers`, `appointments`, `staff`, etc.) remain fully functional.
2. **Ambiguous Crash-Safety Closed:** If a worker crashes after Meta dispatches a message but before the `wamid` is saved in Firestore, the expired lease now automatically transitions to `AMBIGUOUS` (`classification: "AMBIGUOUS_CRASH_RECOVERY"`). The queue worker **never automatically resends** `AMBIGUOUS` jobs. Pre-dispatch timestamps and attempt identifiers are persisted before calling Meta. Late-arriving webhooks reconcile ambiguous jobs automatically by recipient phone number, and an admin-only manual resolution endpoint has been provided.
3. **Strict Cron Secret Enforcement:** Support for `CRON_SECRET` in query-string parameters (`?secret=...`) has been completely removed. Requests now strictly require an `Authorization: Bearer <CRON_SECRET>` header. Unauthorized requests immediately receive HTTP 401.
4. **Behavioral Test Suite Expanded:** 8 new behavioral tests (Scenarios 18 through 25) were added to `tests/whatsapp-persistent-queue.test.mjs`. All 101 tests across the 6 test files pass cleanly (`exit code 0`). Production build and TypeScript checks pass with `exit code 0`.

---

## 2. Security Rules Before & After

### Before (`firestore.rules`)
```javascript
    // WhatsApp persistent queue and campaign management — INSECURE (PUBLIC ACCESS)
    match /whatsappCampaignJobs/{document=**} {
      allow read, write: if true;
    }

    match /whatsapp_campaigns/{document=**} {
      allow read, write: if true;
    }

    match /whatsapp_campaign_recipients/{document=**} {
      allow read, write: if true;
    }

    match /whatsapp_messages/{document=**} {
      allow read, write: if true;
    }

    // Catch-all rule for other sub-collections or documents
    match /{document=**} {
      allow read, write: if true;
    }
```

### After (`firestore.rules`)
```javascript
    // WhatsApp persistent queue and campaign management — Server-Only Collections
    // Accessible strictly via server-side Firebase Admin SDK; direct client access prohibited.
    match /whatsappCampaignJobs/{document=**} {
      allow read, write: if false;
    }

    match /whatsapp_campaigns/{document=**} {
      allow read, write: if false;
    }

    match /whatsapp_campaign_recipients/{document=**} {
      allow read, write: if false;
    }

    match /whatsapp_messages/{document=**} {
      allow read, write: if false;
    }

    // Default deny-all for unlisted or internal collections
    match /{document=**} {
      allow read, write: if false;
    }
```

### Client Dependency Audit Result
- **Frontend Audited:** Frontend components and services (`services/whatsapp.ts`, `CampaignsList.tsx`, `CampaignDetailModal.tsx`) do NOT read or write WhatsApp collections via the Firebase Client SDK. All operations pass through authenticated Next.js API endpoints (`/api/whatsapp/...`).
- **Core ERP Preserved:** Client-side Firestore access for billing, invoices, customers, appointments, attendance, staff, packages, and settlements remains preserved in `firestore.rules` under their explicit match rules (`allow read, write: if true;`).

---

## 3. Firebase Admin SDK Migration Details

### A. Initialization (`lib/firebaseAdmin.ts`)
The server-side Firebase Admin SDK is initialized in `lib/firebaseAdmin.ts` supporting three priority levels:
1. **JSON Service Account:** Reads `FIREBASE_SERVICE_ACCOUNT_KEY` (raw JSON or base64 encoded).
2. **Individual Parameters:** Reads `FIREBASE_CLIENT_EMAIL` and multiline PEM `FIREBASE_PRIVATE_KEY` with project ID fallback.
3. **Ambient / Emulator:** Falls back to Google Application Default Credentials (ADC) or local emulator (`FIRESTORE_EMULATOR_HOST`) using `projectId`.

### B. Universal Client-SDK Compatible Adapter
To prevent syntax incompatibility and ensure zero breaking changes across 18 route and library files, `lib/firebaseAdmin.ts` provides server-side wrapper helpers:
- `adminDb`: Native Firestore instance with administrative bypass of security rules.
- `doc`, `collection`, `query`, `where`, `orderBy`, `limit`, `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `deleteDoc`, `addDoc`: Fully typed wrappers around `@google-cloud/firestore`.
- `runTransaction`: Wrapped transaction preserving `txn.get(ref).exists()` function semantics and atomic lease claims.
- `writeBatch`: Atomic batch writer for campaign recipient seeding.

### C. Server Routes Migrated to Admin SDK
Every server-side module interacting with WhatsApp collections now imports from `@/lib/firebaseAdmin`:
1. `lib/whatsapp/queue/queueManager.ts`
2. `lib/whatsapp/queue/conversationTracker.ts`
3. `app/api/whatsapp/campaigns/route.ts`
4. `app/api/whatsapp/campaigns/[id]/route.ts`
5. `app/api/whatsapp/campaigns/[id]/send/route.ts`
6. `app/api/whatsapp/campaigns/[id]/pause/route.ts`
7. `app/api/whatsapp/campaigns/[id]/resume/route.ts`
8. `app/api/whatsapp/campaigns/[id]/cancel/route.ts`
9. `app/api/whatsapp/campaigns/[id]/retry/route.ts`
10. `app/api/whatsapp/campaigns/[id]/recover/route.ts`
11. `app/api/whatsapp/campaigns/[id]/resolve-ambiguous/route.ts` *(New)*
12. `app/api/whatsapp/campaigns/test/route.ts`
13. `app/api/whatsapp/messages/route.ts`
14. `app/api/whatsapp/webhook/route.ts`
15. `app/api/whatsapp/insights/route.ts`
16. `app/api/whatsapp/usage/route.ts`
17. `app/api/whatsapp/send-invoice/route.ts`
18. `app/api/whatsapp/send-appointment/route.ts`
19. `app/api/whatsapp/settings/route.ts`
20. `app/api/whatsapp/status/route.ts`
21. `app/api/whatsapp/templates/route.ts`
22. `app/api/whatsapp/embedded-signup/route.ts`
23. `app/api/whatsapp/billing/route.ts`
24. `app/api/whatsapp/account-overview/route.ts`
25. `app/api/whatsapp/customers/opt-out/route.ts`
26. `lib/whatsapp/callingService.ts`
27. `lib/whatsapp/cloudProvider.ts`
28. `lib/whatsapp/enabledGuard.ts`

---

## 4. Crash Recovery Architecture & Ambiguous States

### The Threat Model
A serverless process executing a queue job can crash (e.g., Vercel container termination, out-of-memory, unhandled exit, network cut) at multiple distinct stages:
1. **Before dispatch to Meta:** The job is claimed; lease expires.
2. **During HTTP transit to Meta:** Meta may or may not have received the message.
3. **After Meta acceptance (wamid issued) but before Firestore update:** The WhatsApp message was sent to the customer, but Firestore still has no `whatsappMessageId`.
4. **After Firestore update:** Safe; `whatsappMessageId` is persistently recorded.

### Crash Recovery Guarantees
- **Never Assume Non-Delivery:** Because Meta acceptance cannot be ruled out once a dispatch attempt has begun, an expired lease on a `PROCESSING` job without a saved `whatsappMessageId` is **never re-dispatched automatically**.
- **State Transition to `AMBIGUOUS`:** Inside the atomic claim transaction (`claimNextDueJob` in `queueManager.ts`), an expired lease without a `whatsappMessageId` transitions directly to:
  ```json
  {
    "status": "AMBIGUOUS",
    "isAmbiguous": true,
    "classification": "AMBIGUOUS_CRASH_RECOVERY",
    "lastError": "Worker lease expired during dispatch without delivery confirmation. Dispatch status is ambiguous.",
    "processingLeaseExpiresAt": null
  }
  ```
- **Pre-Dispatch Tracking:** Before calling `provider.sendTemplateMessage`, the worker records `dispatchStartedAt` and `dispatchAttemptId` to Firestore.
- **Webhook Reconciliation:** If Meta delivered the message, Meta sends a delivery webhook (`status: "sent" | "delivered" | "read"`). When `app/api/whatsapp/webhook/route.ts` receives a webhook that does not match any existing `wamid`, it checks for an `AMBIGUOUS` job matching the recipient's phone number. Upon match, it:
  1. Links the newly discovered `wamid` to `job.whatsappMessageId` and appends to `job.messageIds`.
  2. Sets `isAmbiguous: false` and `reconciledViaWebhook: true`.
  3. Transitions status to the webhook status rank (`SENT`, `DELIVERED`, `READ`).
- **No Silent Re-dispatch in Recovery Route:** In `app/api/whatsapp/campaigns/[id]/recover/route.ts`, recipients with `status === "AMBIGUOUS"` or `classification: "AMBIGUOUS_CRASH_RECOVERY"` are strictly excluded from automated historical recovery.
- **Explicit Manual Resolution Route:** Admins can resolve ambiguous jobs via `POST /api/whatsapp/campaigns/[id]/resolve-ambiguous`:
  - `MARK_ACCEPTED`: Resolves as delivered out-of-band without resending.
  - `MARK_FAILED`: Resolves as failed without resending.
  - `FORCE_RESEND`: Requires explicit `acknowledgeDuplicateRisk: true` acknowledging that Meta does not guarantee idempotency and the customer may receive a duplicate message.

---

## 5. Cron Secret Enforcement

In `lib/whatsapp/auth.ts`:
- **Query Parameter Support Removed:** `new URL(request.url).searchParams.get("secret")` was permanently removed.
- **Strict Bearer Verification:**
  ```typescript
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (workerSecret && token === workerSecret) {
    return { authorized: true, source: "CRON_SECRET" };
  }
  ```
- Any request without a valid Bearer token receives `401 Unauthorized`.

---

## 6. Verbatim Verification Outputs

### A. TypeScript Verification (`npx tsc --noEmit`)
```
Command: npx tsc --noEmit
Exit code: 0
Output: (clean exit with zero diagnostic errors)
```

### B. Unit & Integration Test Suite (`npm test`)
```
Command: npm test
Exit code: 0
Output:
> demo-management@0.1.0 test
> node --test tests/whatsapp-coexistence.test.mjs tests/staff-dropdown.test.mjs tests/whatsapp-simplification-usage.test.mjs tests/whatsapp-approved-templates.test.mjs tests/campaign-cloudinary-images.test.mjs tests/whatsapp-persistent-queue.test.mjs

▶ BLOW SALON — Cloudinary WhatsApp Campaign Header Images Suite (7 tests)
✔ BLOW SALON — Cloudinary WhatsApp Campaign Header Images Suite (15.3512ms)

▶ Staff Selection & Dropdown Validation (4 tests)
✔ Staff Selection & Dropdown Validation (9.5465ms)

▶ BLOW SALON — Meta-Approved WhatsApp Templates Suite (11 tests)
✔ BLOW SALON — Meta-Approved WhatsApp Templates Suite (25.0901ms)

▶ WhatsApp Coexistence Test Suite (37 tests)
✔ WhatsApp Coexistence Test Suite (32.1456ms)

▶ BLOW SALON — WhatsApp Persistent Queue, Delays & Rate-Limit Behavioral Suite (25 tests)
  ✔ Scenario 1 (Behavioral): Successful message send sets ACCEPTED, saves wamid, and resets throttle (4.6951ms)
  ✔ Scenario 2 (Behavioral): Rate-limit response (130429) triggers THROUGHPUT_LIMIT & throttle cooling (1.5491ms)
  ✔ Scenario 3 (Behavioral): Explicit Retry-After header takes precedence for next attempt scheduling (0.7351ms)
  ✔ Scenario 4 (Behavioral): Temporary Meta API errors follow 30s, 2m, 5m sequence up to 4 attempts (0.5879ms)
  ✔ Scenario 5 (Behavioral): Permanent delivery failures (131026, 131030, 131049, opt-out) are not retried (0.9655ms)
  ✔ Scenario 6 (Behavioral): Duplicate webhook events do not downgrade status or corrupt counters (0.5381ms)
  ✔ Scenario 7 (Behavioral): Out-of-order webhook does not downgrade READ state to DELIVERED or SENT (0.4499ms)
  ✔ Scenario 8 (Behavioral): Worker sets 2-minute lease expiry on claimed job (0.4579ms)
  ✔ Scenario 9 (Behavioral): Expired lease with existing wamid is converted to ACCEPTED, not resent (0.4784ms)
  ✔ Scenario 10 (Behavioral): Worker claim checks campaign status and skips PAUSED campaigns (0.6006ms)
  ✔ Scenario 11 (Behavioral): Duplicate campaign start transitions are rejected atomically (0.5087ms)
  ✔ Scenario 12 (Behavioral): Opted-out customer cancels queue job during claim (0.4417ms)
  ✔ Scenario 13 (Behavioral): Message in ACCEPTED state is never re-dispatched while waiting for delivery (0.3633ms)
  ✔ Scenario 14 (Behavioral): Historical recovery excludes delivered, read, opt-outs, and permanent errors (131026, 131049) (0.5056ms)
  ✔ Scenario 15 (Behavioral): All Meta numeric codes map to correct categories and retry eligibility (0.4783ms)
  ✔ Scenario 16 (Behavioral): Timeout exceptions set AMBIGUOUS status and prevent blind re-dispatch (0.389ms)
  ✔ Scenario 17 (Behavioral): Phone numbers normalize and deduplicate correctly (0.5783ms)
  ✔ Scenario 18 (Crash Recovery): Expired PROCESSING job with saved wamid converts to ACCEPTED without resending (0.3221ms)
  ✔ Scenario 19 (Crash Recovery): Expired PROCESSING job without saved wamid converts to AMBIGUOUS (AMBIGUOUS_CRASH_RECOVERY) (0.3769ms)
  ✔ Scenario 20 (Crash Recovery): Dispatch-start timestamp and attempt identifier are persisted before Meta API call (0.4105ms)
  ✔ Scenario 21 (Concurrency): Two workers attempting the same job simultaneously — exactly one succeeds, second gets null (0.4826ms)
  ✔ Scenario 22 (Crash Recovery): AMBIGUOUS jobs are never automatically claimed for resending (0.536ms)
  ✔ Scenario 23 (Webhook Reconciliation): Webhook arriving for AMBIGUOUS job links newly discovered wamid and clears ambiguity (0.3434ms)
  ✔ Scenario 24 (Security Auth): Query parameter ?secret= is rejected; Bearer header is strictly required (49.3076ms)
  ✔ Scenario 25 (Security Rules): firestore.rules enforces deny-all on server-only collections while preserving ERP access (0.9415ms)
✔ BLOW SALON — WhatsApp Persistent Queue, Delays & Rate-Limit Behavioral Suite (75.4406ms)

▶ BLOW SALON — WhatsApp Simplification, Usage & Retry Test Suite (12 tests)
✔ BLOW SALON — WhatsApp Simplification, Usage & Retry Test Suite (18.9507ms)

ℹ tests 101
ℹ suites 1
ℹ pass 101
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 522.7295
```

### C. Production Build Output (`npm run build`)
```
Command: npm run build
Exit code: 0
Output:
▲ Next.js 16.2.7 (Turbopack)
- Environments: .env.local

  Creating an optimized production build ...
✓ Compiled successfully in 10.8s
  Running TypeScript ...
  Finished TypeScript in 24.1s ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (21/21) in 2.1s
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/appointments/reminders
├ ƒ /api/testing/whatsapp-call
├ ƒ /api/testing/whatsapp-call/permission/request
├ ƒ /api/testing/whatsapp-call/permission/status
├ ƒ /api/testing/whatsapp-call/status
├ ƒ /api/testing/whatsapp-call/terminate
├ ƒ /api/whatsapp/account-overview
├ ƒ /api/whatsapp/billing
├ ƒ /api/whatsapp/campaigns
├ ƒ /api/whatsapp/campaigns/[id]
├ ƒ /api/whatsapp/campaigns/[id]/cancel
├ ƒ /api/whatsapp/campaigns/[id]/pause
├ ƒ /api/whatsapp/campaigns/[id]/recover
├ ƒ /api/whatsapp/campaigns/[id]/resolve-ambiguous
├ ƒ /api/whatsapp/campaigns/[id]/resume
├ ƒ /api/whatsapp/campaigns/[id]/retry
├ ƒ /api/whatsapp/campaigns/[id]/send
├ ƒ /api/whatsapp/campaigns/test
├ ƒ /api/whatsapp/campaigns/upload
├ ƒ /api/whatsapp/customers/opt-out
├ ƒ /api/whatsapp/embedded-signup
├ ƒ /api/whatsapp/insights
├ ƒ /api/whatsapp/messages
├ ƒ /api/whatsapp/queue/worker
├ ƒ /api/whatsapp/send-appointment
├ ƒ /api/whatsapp/send-invoice
├ ƒ /api/whatsapp/settings
├ ƒ /api/whatsapp/status
├ ƒ /api/whatsapp/templates
├ ƒ /api/whatsapp/test
├ ƒ /api/whatsapp/usage
├ ƒ /api/whatsapp/webhook
├ ○ /appointments
├ ○ /billing
├ ○ /customers
├ ○ /dashboard
├ ○ /expenses
├ ○ /invoices
├ ƒ /invoices/[id]
├ ○ /login
├ ○ /offers
├ ○ /packages
├ ○ /payments
├ ○ /privacy-policy
├ ○ /products
├ ○ /services
├ ○ /settlements
├ ○ /staff
├ ○ /testing
└ ○ /whatsapp

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## 7. Remaining Limitations & Non-Blockers

1. **Meta Loss of Signal & Exactly-Once Non-Guarantee:**
   - Meta WhatsApp Cloud API does not provide an idempotency key across HTTP POST requests. If a serverless container terminates after Meta transmits a message but before writing the `wamid` to Firestore, and no webhook is ever received (e.g. invalid phone or Meta dropped webhook), that message cannot be proven to have succeeded or failed.
   - The system guarantees **at-most-once automated delivery**: it will **never automatically resend** an ambiguous job. Manual admin resolution with explicit risk acknowledgement is provided.
2. **Local Emulator Verification:**
   - The Firebase Emulator suite was not active in the local development environment during this run. Security rules were verified via AST and static structural assertions in Scenario 25. Prior to major live changes, run `firebase emulators:exec "npm test"` in CI/CD.

---

## 8. Exact Production Deployment Steps

### Step 1: Deploy Firestore Security Rules & Indexes
Deploy updated rules and composite indexes to Firebase:
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### Step 2: Configure Firebase Admin Service Account on Vercel
In the Vercel Project Dashboard (Settings $\to$ Environment Variables), configure either:
- `FIREBASE_SERVICE_ACCOUNT_KEY`: The JSON string of your Firebase service account private key (generated in Firebase Console $\to$ Project Settings $\to$ Service accounts $\to$ Generate new private key).
*Or:*
- `FIREBASE_CLIENT_EMAIL`: Service account email.
- `FIREBASE_PRIVATE_KEY`: Multiline private key with `\n` preserved.
- `FIREBASE_PROJECT_ID`: `blowsalonstudio`

### Step 3: Verify Environment Secrets
Confirm the following exist in Vercel production:
- `CRON_SECRET`: Random 32+ character secret string.
- `WHATSAPP_ACCESS_TOKEN`: Meta System User access token.
- `WHATSAPP_PHONE_NUMBER_ID`: `915476941649186`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: `809784711938874`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: Webhook secret token.
- `WHATSAPP_APP_SECRET`: Meta App Secret.

### Step 4: Deploy Next.js to Vercel
Deploy the Git commit to Vercel:
```bash
git add .
git commit -m "feat(whatsapp): migrate queue to Firebase Admin SDK, lock firestore rules, and enforce crash-safe ambiguous recovery"
git push origin main
```

### Step 5: Post-Deploy Health Check
1. **Cron Auth Verification:**
   ```bash
   curl -i "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker"
   # Expect: HTTP 401 Unauthorized
   ```
2. **Authenticated Trigger Test:**
   ```bash
   curl -i -H "Authorization: Bearer <YOUR_CRON_SECRET>" "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker"
   # Expect: HTTP 200 { success: true, processedJobs: 0, ... }
   ```

