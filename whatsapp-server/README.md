# BLOW SALON — Persistent WhatsApp Backend Service

This is the standalone Node.js service for managing the salon's persistent WhatsApp Web QR session.

## Architecture

```
NEXT.JS FRONTEND (Vercel)
        ↓  (HTTP REST via WHATSAPP_BACKEND_URL)
WHATSAPP BACKEND SERVICE (Render / Railway / VPS / Local Node)
        ↓  (Baileys Persistent WebSocket & .whatsapp_auth)
SALON WHATSAPP NUMBER
```

## Running Locally

```bash
# In the root directory or whatsapp-server directory
npm run whatsapp:server
# or
node whatsapp-server/index.js
```
Runs on `http://localhost:3001`.

## Deployment Options (Render / Railway / VPS)

### 1. Render.com / Railway / Fly.io (Recommended)
1. Deploy this repository or the `whatsapp-server` folder as a Node.js Web Service.
2. Build command: `npm install`
3. Start command: `node whatsapp-server/index.js`
4. Set Environment Variables:
   - `PORT`: `3001` (or assigned by platform)
   - `WHATSAPP_SERVICE_SECRET`: `your_random_secret_token`
5. Copy the public service URL (e.g. `https://blow-whatsapp-service.onrender.com`).
6. Add to Vercel Environment Variables:
   - `WHATSAPP_BACKEND_URL`: `https://blow-whatsapp-service.onrender.com`
   - `WHATSAPP_SERVICE_SECRET`: `your_random_secret_token`

### 2. VPS (Ubuntu / Debian with PM2)
```bash
pm2 start whatsapp-server/index.js --name "blow-whatsapp"
pm2 save
pm2 startup
```

## API Endpoints

- `GET /health` — Health check
- `GET /api/status` — Returns current status (`CONNECTED`, `CONNECTING`, `QR_REQUIRED`, `DISCONNECTED`)
- `POST /api/connect` — Initiates connection & generates QR code data URL
- `POST /api/disconnect` — Clears auth session & disconnects
- `POST /api/send-message` — Dispatches WhatsApp text message (`{ phoneNumber, message }`)
