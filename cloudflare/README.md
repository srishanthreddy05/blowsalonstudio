# BLOW SALON — Cloudflare WhatsApp Queue Scheduler

This directory contains the Cloudflare Worker cron scheduler (`blow-salon-queue-scheduler`) that triggers the persistent WhatsApp campaign queue on BLOW SALON's production backend.

## 1. Architecture

```text
┌─────────────────────────────────┐
│ Cloudflare Workers Cron Trigger │  (Every minute: * * * * *)
│ (blow-salon-queue-scheduler)    │
└────────────────┬────────────────┘
                 │ POST /api/whatsapp/queue/worker
                 │ Authorization: Bearer <CRON_SECRET>
                 ▼
┌─────────────────────────────────┐
│ Vercel Next.js Production API   │  (blowsalonstudio.vercel.app)
│ • Token & Kill-switch Check     │
│ • Atomic Transaction Lease      │
│ • Daily Budget & Headroom Check │
└────────────────┬────────────────┘
                 │
                 ├──▶ Firebase Firestore (Admin SDK)
                 └──▶ Meta WhatsApp Cloud API (Graph API v21.0)
```

- **Cloudflare Worker Responsibility:** Strictly scheduled HTTP invocation. Never contains database or Meta sending logic.
- **Vercel Backend Responsibility:** All queue logic, atomic claims, Firebase Admin SDK operations, campaign gating, and Meta API dispatches.

---

## 2. Worker Configuration

### Files
- [`cloudflare/worker.js`](file:///c:/clients/blow-salon/cloudflare/worker.js): Worker entry point containing `fetch` (health check & manual trigger) and `scheduled` (1-minute cron) handlers.
- [`cloudflare/wrangler.jsonc`](file:///c:/clients/blow-salon/cloudflare/wrangler.jsonc): Wrangler configuration with 1-minute cron trigger (`* * * * *`) and safety defaults.

### Environment Variables
| Variable | Required | Default | Purpose |
| :--- | :---: | :---: | :--- |
| `ENABLE_LIVE_QUEUE` | Yes | `"false"` | Master scheduler switch. When `"false"`, cron runs log and exit without calling Vercel. Set to `"true"` to enable production sending. |
| `BACKEND_URL` | Optional | `https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker` | Target Vercel queue worker endpoint. |
| `REQUEST_TIMEOUT_MS` | Optional | `"45000"` | HTTP request timeout in milliseconds (45 seconds). |

### Secrets
| Secret | Required | Description |
| :--- | :---: | :--- |
| `CRON_SECRET` | **YES** | Shared bearer authentication secret configured identically in Vercel and Cloudflare. Never commit to Git. |

---

## 3. Worker Endpoints

### Manual Health Check
- **Method:** `GET` or `HEAD`
- **URL:** `https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/`
- **Authentication:** None required (public status probe).
- **Behavior:** Returns JSON status. **Never calls Vercel, Firebase, or Meta.**
- **Sample Response:**
```json
{
  "worker": "blow-salon-queue-scheduler",
  "status": "DEPLOYED",
  "schedule": "* * * * *",
  "backendUrl": "https://blowsalonstudio.vercel.app/api/whatsapp/queue/worker",
  "isSecretConfigured": true,
  "isLiveExecutionEnabled": false,
  "timestamp": "2026-11-05T14:30:00.000Z"
}
```

### Manual Trigger / Dry-Run Verification
- **Method:** `POST`
- **URL:** `https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/`
- **Authentication:** `Authorization: Bearer <CRON_SECRET>`
- **Headers:** `x-dry-run: true` (for safe dry-run simulation)
- **Behavior:**
  - If `dryRun: true`: Forwards request to Vercel in simulation mode (zero writes, zero Meta calls).
  - If `dryRun: false` and `ENABLE_LIVE_QUEUE=false`: Rejects with HTTP 403.
  - If `dryRun: false` and `ENABLE_LIVE_QUEUE=true`: Triggers live queue batch dispatch.

---

## 4. Deployment Instructions

### Step 1: Deploy Worker to Cloudflare
From repository root:
```bash
cd cloudflare
npx wrangler deploy
```

### Step 2: Configure Secret in Cloudflare
Set the secret using Wrangler (or via Cloudflare Dashboard under **Workers & Pages > Settings > Variables and Secrets**):
```bash
npx wrangler secret put CRON_SECRET
# Paste the exact CRON_SECRET value matching your Vercel deployment
```

### Step 3: Verify Initial Health Check
```bash
curl -sS https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/
```
Confirm:
- `isSecretConfigured: true`
- `isLiveExecutionEnabled: false`

### Step 4: Perform Safe Dry-Run Verification
```bash
curl -sS -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "x-dry-run: true" \
  https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/
```
Confirm:
- HTTP 200 response with `dryRun: true` and candidate job list.
- Zero messages sent. Zero records modified.

### Step 5: Controlled 10-Recipient Live Test
1. In BLOW Salon Dashboard, create a test campaign with 10 internal numbers.
2. Click **Start Campaign** (status transitions to `SENDING`).
3. Trigger a single live batch via POST:
```bash
curl -sS -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "x-dry-run: false" \
  https://blow-salon-queue-scheduler.srishanthreddy05.workers.dev/
```
*(Note: Requires setting `ENABLE_LIVE_QUEUE=true` in Cloudflare for live execution, or testing directly against Vercel).*
4. Verify delivery status badges update in dashboard.

### Step 6: Enable Production Cron Schedule
Once live test is validated, enable automated 1-minute execution:
In Cloudflare Dashboard (**Workers & Pages > blow-salon-queue-scheduler > Settings > Variables and Secrets**):
- Set `ENABLE_LIVE_QUEUE` = `"true"`.
Or via command:
```bash
npx wrangler deploy --var ENABLE_LIVE_QUEUE:true
```
Cloudflare Workers Cron will now automatically invoke the Vercel queue worker every minute.

