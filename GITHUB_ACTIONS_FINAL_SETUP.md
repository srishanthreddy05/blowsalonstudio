# BLOW SALON — GitHub Actions Scheduler & Production Environment Setup Guide

**Document Version:** 1.0.0  
**Audit Date:** November 4, 2026  
**Auditor:** DeepMind Antigravity Engineering Agent  
**Target Environment:** Next.js 16.2.7 (Vercel Hobby Plan) + GitHub Actions + Firebase Firestore + Meta WhatsApp Cloud API  
**Target Repository:** `srishanthreddyy/blow-salon` (`c:\clients\blow-salon`)  
**Production Domain:** `https://blowsalonstudio.vercel.app`

---

## 1. Files Inspected

1. `app/api/whatsapp/queue/worker/route.ts` — Worker HTTP handlers (`GET` & `POST`), execution bounds, authentication check.
2. `lib/whatsapp/queue/queueManager.ts` — Batch execution loop, atomic transaction claims, lease recovery, execution headroom, dry-run mode.
3. `lib/whatsapp/auth.ts` — Authentication validator, Bearer token verification, query-string rejection, admin email whitelist.
4. `lib/firebaseAdmin.ts` — Firebase Admin SDK singleton, service-account credential parsing, private key formatting.
5. `lib/whatsapp/cloudProvider.ts` — Meta WhatsApp Cloud API client, 10s timeout, error classification.
6. `lib/whatsapp/templateRegistry.ts` — Meta-approved template mappings (`blow_salon_campaign`, `blow_salon_invoices`, `blow_salon_appointments_confirm`).
7. `lib/whatsapp/enabledGuard.ts` — Master WhatsApp kill-switch checking `settings/whatsapp_settings`.
8. `lib/whatsapp/historicalCampaignGuard.ts` — Guard protecting historical campaigns (`DIWALI OFFER`, `35% DISCOUNT`).
9. `app/api/whatsapp/webhook/route.ts` — Webhook verification, delivery receipts, monotonic rank, crash recovery reconciliation.
10. `app/api/whatsapp/campaigns/upload/route.ts` — Cloudinary image upload handler for campaign header images.
11. `.env.example` & `.env.local` — Environment variable templates and local developer configurations.
12. `package.json` & `vercel.json` — Project scripts, build dependencies, Vercel cron configuration.

---

## 2. Files Modified

| File | Nature of Changes |
| :--- | :--- |
| [`.github/workflows/whatsapp-queue-worker.yml`](file:///c:/clients/blow-salon/.github/workflows/whatsapp-queue-worker.yml) | **Created**: Production GitHub Actions workflow supporting 5-minute schedule, manual `workflow_dispatch`, `dry_run` simulation toggle, concurrency group lock, 5-minute timeout, and curl with `--fail-with-body`. |
| [`lib/whatsapp/queue/queueManager.ts`](file:///c:/clients/blow-salon/lib/whatsapp/queue/queueManager.ts#L711-L865) | **Enhanced**: Added genuine `dryRun` simulation mode to `processQueueBatch`. Queries due jobs, simulates campaign and opt-out checks, masks customer phone numbers, calls zero Meta APIs, and performs zero Firestore writes. |
| [`app/api/whatsapp/queue/worker/route.ts`](file:///c:/clients/blow-salon/app/api/whatsapp/queue/worker/route.ts#L30-L55) | **Enhanced**: Added `x-dry-run` header and JSON body `{ "dryRun": true }` detection. Bypasses Meta Cloud API live socket verification during dry-run simulation. |
| [`lib/firebaseAdmin.ts`](file:///c:/clients/blow-salon/lib/firebaseAdmin.ts#L25-L29) | **Fortified**: Added support for `FIREBASE_ADMIN_PROJECT_ID` alongside `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. |
| [`tests/whatsapp-persistent-queue.test.mjs`](file:///c:/clients/blow-salon/tests/whatsapp-persistent-queue.test.mjs#L1030-L1130) | **Expanded**: Added Scenarios 36, 37, and 38 testing GitHub Actions Bearer auth, dry-run simulation invariance, and workflow YAML configuration integrity. |

---

## 3. GitHub Actions Workflow Contents

**Path:** `.github/workflows/whatsapp-queue-worker.yml`

```yaml
name: WhatsApp Persistent Queue Worker

on:
  schedule:
    # AUTOMATIC SCHEDULE: Runs every 5 minutes on GitHub Actions runners.
    # INSTRUCTION TO ACTIVATE:
    # 1. Complete manual dry-run testing using the 'Run workflow' button in GitHub Actions tab.
    # 2. To start automatic 5-minute production execution, uncomment the cron line below:
    # - cron: '*/5 * * * *'
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry Run Mode (Simulate queue without sending WhatsApp messages or mutating database)'
        required: true
        type: boolean
        default: true

# Concurrency group ensures only one worker run executes at any time
concurrency:
  group: whatsapp-queue-worker
  cancel-in-progress: false

jobs:
  dispatch-queue:
    name: Trigger Persistent Queue Worker
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Validate Secrets Configuration
        env:
          CRON_SECRET_VALUE: ${{ secrets.CRON_SECRET }}
        run: |
          if [ -z "$CRON_SECRET_VALUE" ]; then
            echo "::error::CRON_SECRET secret is not configured in repository Settings > Secrets and variables > Actions."
            exit 1
          fi
          echo "Authentication secret is present and configured."

      - name: Execute Queue Worker Batch
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          # Target worker URL from GitHub Actions Variable or default to production Vercel deployment
          TARGET_URL: ${{ vars.WORKER_URL || 'https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker' }}
          # Determine dry-run mode: defaults to true on manual dispatch unless unchecked; false on scheduled runs
          IS_DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run == true }}
        run: |
          echo "=========================================================="
          echo "BLOW SALON — WhatsApp Persistent Queue Scheduler"
          echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
          echo "Target Endpoint: ${TARGET_URL}"
          echo "Trigger Source: ${{ github.event_name }}"
          echo "Dry Run Mode: ${IS_DRY_RUN}"
          echo "=========================================================="

          # Construct JSON payload and custom header for dry-run support
          PAYLOAD="{\"dryRun\": ${IS_DRY_RUN}}"
          
          # Execute POST request with bearer authentication
          # Flags:
          #   -sS: Silent mode (suppresses progress meters, prints errors)
          #   --fail-with-body: Fails (exit code != 0) on HTTP 4xx/5xx while displaying server response
          #   Do NOT pass -v, -x, or --trace to avoid leaking Authorization header in runner logs
          RESPONSE=$(curl -sS --fail-with-body \
            -X POST \
            -H "Authorization: Bearer ${CRON_SECRET}" \
            -H "Content-Type: application/json" \
            -H "x-dry-run: ${IS_DRY_RUN}" \
            -d "${PAYLOAD}" \
            "${TARGET_URL}")

          CURL_EXIT=$?
          if [ $CURL_EXIT -ne 0 ]; then
            echo "::error::Worker execution failed with exit code $CURL_EXIT"
            exit $CURL_EXIT
          fi

          echo "=========================================================="
          echo "Worker Execution Summary:"
          echo "${RESPONSE}"
          echo "=========================================================="
```

---

## 4. Exact GitHub Secrets to Add

Go to **GitHub Repository $\to$ Settings $\to$ Secrets and variables $\to$ Actions $\to$ New repository secret**:

| Secret Name | Required? | Purpose | Value to Enter |
| :--- | :---: | :--- | :--- |
| **`CRON_SECRET`** | **REQUIRED** | Authenticates the GitHub runner with the Vercel worker endpoint via `Authorization: Bearer <token>`. | Exact secret string configured in Vercel for `CRON_SECRET` (e.g. 32+ character random hex string). |

> [!IMPORTANT]
> **Zero Other Secrets Needed in GitHub Actions:**  
> Do **NOT** add Firebase service-account private keys, Meta Cloud API tokens, or Cloudinary credentials to GitHub Actions. The GitHub runner never accesses Firestore or Meta directly; it exclusively triggers your authenticated Vercel worker endpoint. All application credentials remain safely isolated inside Vercel.

---

## 5. Exact GitHub Variables to Add

Go to **GitHub Repository $\to$ Settings $\to$ Secrets and variables $\to$ Actions $\to$ Variables tab $\to$ New repository variable**:

| Variable Name | Required? | Default Fallback if Omitted | Purpose |
| :--- | :---: | :--- | :--- |
| **`WORKER_URL`** | **OPTIONAL** | `https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker` | Allows overriding the destination endpoint without editing workflow code (e.g. if switching to a custom domain like `https://salon.blow.com/api/whatsapp/queue/worker`). |

---

## 6. Complete Vercel Environment-Variable Checklist

Configured in **Vercel Dashboard $\to$ Settings $\to$ Environment Variables**:

| Variable Name | Required? | Environments | Sensitive? | Purpose | Existing Value Retained? | Redeploy Required? |
| :--- | :---: | :---: | :---: | :--- | :---: | :---: |
| **`CRON_SECRET`** | **REQUIRED** | Production, Preview | **YES** | Authorizes external scheduler and internal worker calls. Must match GitHub Actions `CRON_SECRET`. | Can retain if known, otherwise generate new. | **YES** |
| **`FIREBASE_SERVICE_ACCOUNT_KEY`**<br>*(or Option B below)* | **REQUIRED** | Production, Preview | **YES** | Full stringified JSON or base64 service account key for Firebase Admin SDK privileged database operations. | Retain existing. | **YES** |
| **`FIREBASE_CLIENT_EMAIL`** *(Option B)* | Required if Option A empty | Production, Preview | No | Firebase service account email (e.g. `firebase-adminsdk-...@blowsalonstudio.iam.gserviceaccount.com`). | Retain existing. | **YES** |
| **`FIREBASE_PRIVATE_KEY`** *(Option B)* | Required if Option A empty | Production, Preview | **YES** | RSA Private key with newline characters (`\n`) for Firebase Admin SDK. | Retain existing. | **YES** |
| **`FIREBASE_PROJECT_ID`** | **REQUIRED** | Production, Preview | No | Firebase Project ID (`blowsalonstudio`). | Retain existing. | **YES** |
| **`NEXT_PUBLIC_FIREBASE_API_KEY`** | **REQUIRED** | All Environments | Public | Firebase Web API Key for client authentication & ID token verification. | Retain existing. | **YES** |
| **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`** | **REQUIRED** | All Environments | Public | Firebase Auth Domain (`blowsalonstudio.firebaseapp.com`). | Retain existing. | **YES** |
| **`NEXT_PUBLIC_FIREBASE_PROJECT_ID`** | **REQUIRED** | All Environments | Public | Firebase Project ID (`blowsalonstudio`). | Retain existing. | **YES** |
| **`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`**| **REQUIRED** | All Environments | Public | Cloud Storage bucket (`blowsalonstudio.firebasestorage.app`). | Retain existing. | **YES** |
| **`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`**| **REQUIRED** | All Environments | Public | Firebase Cloud Messaging Sender ID. | Retain existing. | **YES** |
| **`NEXT_PUBLIC_FIREBASE_APP_ID`** | **REQUIRED** | All Environments | Public | Firebase Web Application ID. | Retain existing. | **YES** |
| **`WHATSAPP_ACCESS_TOKEN`** | **REQUIRED** | Production, Preview | **YES** | Meta WhatsApp Cloud API Permanent System User Access Token. | Retain existing. | **YES** |
| **`WHATSAPP_PHONE_NUMBER_ID`** | **REQUIRED** | Production, Preview | No | Meta Phone Number ID (e.g. `915476941649186`). | Retain existing. | **YES** |
| **`WHATSAPP_BUSINESS_ACCOUNT_ID`** | Optional | Production, Preview | No | Meta WABA ID (resolved dynamically from `settings/whatsapp_coexistence`). | Retain existing. | **YES** |
| **`WHATSAPP_VERIFY_TOKEN`** | **REQUIRED** | Production, Preview | **YES** | Webhook handshake verification token configured in Meta App Dashboard. | Retain existing. | **YES** |
| **`WHATSAPP_APP_SECRET`** | Optional | Production, Preview | **YES** | Meta App Secret for validating webhook HMAC signatures. | Retain existing. | **YES** |
| **`WHATSAPP_TEMPLATE_HEADER_IMAGE_URL`**| **REQUIRED** | All Environments | Public | Fallback image URL for `blow_salon_campaign` header (`https://blowsalonstudio.vercel.app/blowtemplate.png`). | Retain existing. | **YES** |
| **`CLOUDINARY_CLOUD_NAME`** | Optional | All Environments | Public | Cloudinary cloud name for custom campaign header images (`dakgppa8o`). | Retain existing. | **YES** |
| **`CLOUDINARY_UPLOAD_PRESET`** | Optional | All Environments | Public | Cloudinary unsigned preset (`blow_salon_campaigns`). | Retain existing. | **YES** |
| **`WHATSAPP_SEND_DELAY_MS`** | Optional | Production, Preview | No | Pacing delay between campaign messages (defaults to `3000` = 3s). | Retain existing. | **YES** |
| **`WHATSAPP_MAX_RETRIES`** | Optional | Production, Preview | No | Maximum retry attempts for temporary failures (defaults to `3`). | Retain existing. | **YES** |
| **`WHATSAPP_DAILY_SAFETY_BUDGET`**| Optional | Production, Preview | No | Daily 24h conversation guard threshold (defaults to `1800` for 2K tier). | Retain existing. | **YES** |

---

## 7. Categorized Environment Variable Inventory

### A. Required in Vercel Production
1. `CRON_SECRET`
2. `FIREBASE_SERVICE_ACCOUNT_KEY` (or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_PROJECT_ID`)
3. `NEXT_PUBLIC_FIREBASE_API_KEY`
4. `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
5. `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
6. `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
7. `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
8. `NEXT_PUBLIC_FIREBASE_APP_ID`
9. `WHATSAPP_ACCESS_TOKEN`
10. `WHATSAPP_PHONE_NUMBER_ID`
11. `WHATSAPP_VERIFY_TOKEN`
12. `WHATSAPP_TEMPLATE_HEADER_IMAGE_URL`

### B. Required in GitHub Actions Secrets
1. `CRON_SECRET` (Must match Vercel `CRON_SECRET`)

### C. Required in GitHub Actions Variables
1. `WORKER_URL` (Optional override; defaults to `https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker`)

### D. Optional Variables (Safe Defaults Built-in)
1. `WHATSAPP_BUSINESS_ACCOUNT_ID` (Defaults from Firestore coexistence doc)
2. `WHATSAPP_APP_SECRET` (Meta App Secret for webhook HMAC validation)
3. `WHATSAPP_CLOUD_API_VERSION` (Defaults to `v21.0`)
4. `CLOUDINARY_CLOUD_NAME` (Defaults to `dakgppa8o`)
5. `CLOUDINARY_UPLOAD_PRESET` (Defaults to `blow_salon_campaigns`)
6. `WHATSAPP_SEND_DELAY_MS` (Defaults to `3000`)
7. `WHATSAPP_MAX_CONCURRENCY` (Defaults to `1`)
8. `WHATSAPP_MAX_RETRIES` (Defaults to `3`)
9. `WHATSAPP_MIN_DELAY_MS` (Defaults to `1000`)
10. `WHATSAPP_MAX_DELAY_MS` (Defaults to `30000`)
11. `WHATSAPP_DAILY_SAFETY_BUDGET` (Defaults to `1800`)
12. `WHATSAPP_WORKER_SECRET` (Fallback alias for `CRON_SECRET`)
13. `WHATSAPP_SERVICE_SECRET` (Fallback alias for service calls)
14. `NEXTAUTH_SECRET` (Fallback alias for service calls)
15. `NEXT_PUBLIC_META_APP_ID` / `NEXT_PUBLIC_FACEBOOK_APP_ID` (Embedded signup modal)

### E. Local Development Only
1. `NODE_ENV` (Managed automatically by Next.js)
2. `NODE_TEST_CONTEXT` (Set automatically by Node.js test runner)
3. `WHATSAPP_DEBUG_AUTH` (Enables diagnostic header logs during local testing)

### F. Deprecated / Unused Variables (Safely Ignored)
- `FIREBASE_ADMIN_PROJECT_ID`: Previously noted in old documentation; code has now been updated so both `FIREBASE_ADMIN_PROJECT_ID` and `FIREBASE_PROJECT_ID` are supported interchangeably.

---

## 8. Worker Authentication Audit Summary

- **Method Verification:** `POST /api/whatsapp/queue/worker` and `GET /api/whatsapp/queue/worker` both invoke `verifyWhatsAppCampaignAuth(request)`.
- **Header Parsing:** Strictly reads `request.headers.get("authorization")`. Strips `Bearer ` prefix and compares against `CRON_SECRET`.
- **Query String Protection:** Requests with query parameters like `?secret=...` or `?token=...` are **strictly rejected with HTTP 401**.
- **Role Assignment:** A valid `CRON_SECRET` caller is assigned `{ role: "CRON_WORKER" }`.
- **Concurrency Protection:** Worker acquisition uses Firestore atomic transactions (`claimNextDueJob`) assigning unique `workerId` and 2-minute lease. Multiple simultaneous runners cannot claim the same job.
- **Fail-Safe Headroom:** If execution time remaining in the batch is below 12 seconds (`MIN_JOB_EXECUTION_HEADROOM_MS = 12000`), the worker loop halts cleanly before calling Meta, preventing unhandled serverless function timeouts.

---

## 9. Testing & Dry-Run Procedure

### How to Run a Safe Dry-Run Simulation

1. Go to your GitHub repository on github.com.
2. Click the **Actions** tab.
3. In the left sidebar, click **WhatsApp Persistent Queue Worker**.
4. Click the **Run workflow** dropdown on the right.
5. Leave the checkbox **"Dry Run Mode"** **CHECKED** (`true`).
6. Click the green **Run workflow** button.
7. Click on the running job and inspect the log output:
   - The runner sends `POST /api/whatsapp/queue/worker` with `x-dry-run: true`.
   - The worker inspects the database, counts due jobs, verifies customer opt-outs and campaign status.
   - The log will display:
     ```json
     {
       "success": true,
       "dryRun": true,
       "candidateCount": 0,
       "simulatedJobs": [],
       "message": "[DRY-RUN] Inspected queue. Found 0 due jobs. Zero messages sent. Zero records modified."
     }
     ```
   - **Zero WhatsApp messages are dispatched to Meta.**
   - **Zero database records are modified.**

### How to Execute a Live Batch Manually

1. Follow steps 1–4 above.
2. **UNCHECK** the **"Dry Run Mode"** box (`false`).
3. Click **Run workflow**.
4. The worker will claim up to 10 due jobs, send messages via Meta Cloud API with 3.0s pacing delay, and update recipient statuses to `SENT`/`ACCEPTED`.

---

## 10. How to Enable & Disable Automatic 5-Minute Scheduling

### Enabling Automatic Scheduling
Once you have verified that the dry run passes and you are ready for automatic background dispatch:
1. Open `.github/workflows/whatsapp-queue-worker.yml`.
2. Locate the `schedule:` block:
   ```yaml
   on:
     schedule:
       # AUTOMATIC SCHEDULE: Runs every 5 minutes on GitHub Actions runners.
       # - cron: '*/5 * * * *'
   ```
3. Uncomment the cron line:
   ```yaml
   on:
     schedule:
       - cron: '*/5 * * * *'
   ```
4. Commit and push the file to your `main` branch. GitHub Actions will now trigger your queue worker every 5 minutes automatically.

### Disabling Automatic Scheduling Quickly
If you need to pause or stop automatic execution:
- **Option A (Instant - via GitHub UI):**
  1. Go to repository **Actions** tab.
  2. Click **WhatsApp Persistent Queue Worker** in the sidebar.
  3. Click the **`...`** (three dots) icon near the top right and select **Disable workflow**.
- **Option B (Emergency WhatsApp Kill-Switch):**
  Turn off the master kill-switch in your salon application under **Settings $\to$ WhatsApp Settings** (sets `whatsapp_settings.enabled = false`). All worker invocations will immediately exit with:
  `"WhatsApp messaging is disabled by master kill-switch. Worker paused."`

---

## 11. Automated Test & Build Results

Executed on November 4, 2026:

### Test Suite Execution
```
> node --test tests/whatsapp-coexistence.test.mjs tests/staff-dropdown.test.mjs tests/whatsapp-simplification-usage.test.mjs tests/whatsapp-approved-templates.test.mjs tests/campaign-cloudinary-images.test.mjs tests/whatsapp-persistent-queue.test.mjs

ℹ tests 114
ℹ suites 1
ℹ pass 114
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 671.8ms
```
- **Scenario 36:** Confirmed Bearer `CRON_SECRET` succeeds on POST; missing/invalid secret receives 401; `?secret=` query strings rejected.
- **Scenario 37:** Confirmed dry-run simulation mode reports candidate jobs without calling Meta or mutating Firestore.
- **Scenario 38:** Confirmed `.github/workflows/whatsapp-queue-worker.yml` file contains required concurrency group, timeout, secret references, and production URL.

### TypeScript Compilation
- **Command:** `npx tsc --noEmit`
- **Result:** **0 errors (Exit code 0)**.

### Production Build Compilation
- **Command:** `npm run build`
- **Result:** **Clean Turbopack production build (Exit code 0)**. All 22 dynamic API endpoints and 21 static pages generated successfully.

---

## 12. Final Recommendation

**PROCEED WITH GITHUB ACTIONS WORKFLOW DEPLOYMENT**

1. Set `CRON_SECRET` in GitHub Actions Secrets (**Settings $\to$ Secrets and variables $\to$ Actions**).
2. Commit and push `.github/workflows/whatsapp-queue-worker.yml` to GitHub.
3. Trigger a manual test in the **Actions** tab with **Dry Run Mode checked**.
4. Confirm the worker responds with `"dryRun": true` and HTTP 200.
5. When ready for live campaigns, uncomment `# - cron: '*/5 * * * *'` in `.github/workflows/whatsapp-queue-worker.yml`.

