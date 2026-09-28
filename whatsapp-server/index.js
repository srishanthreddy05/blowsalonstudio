/* eslint-disable */
/**
 * BLOW SALON — Persistent WhatsApp Backend Service
 * 
 * Standalone Node.js service for persistent QR WhatsApp Web (Baileys) sessions.
 * Can be deployed on Render, Railway, Fly.io, AWS EC2, VPS, or run locally.
 */

const http = require("http");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const PORT = parseInt(process.env.PORT || "3001", 10);
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), ".whatsapp_auth");
const SERVICE_SECRET = process.env.WHATSAPP_SERVICE_SECRET || "";

// State
let socket = null;
let connectionStatus = "DISCONNECTED"; // "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "QR_REQUIRED" | "ERROR"
let qrCodeDataUrl = null;
let connectedPhoneNumber = null;
let lastErrorMessage = null;
let isConnecting = false;
let reconnectTimeout = null;

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

function hasSavedSession() {
  if (!fs.existsSync(AUTH_DIR)) return false;
  try {
    const files = fs.readdirSync(AUTH_DIR);
    return files.length > 0 && files.some((f) => f.includes("creds.json"));
  } catch {
    return false;
  }
}

function normalizePhoneNumber(raw) {
  if (!raw) return { isValid: false, digits: "", jid: "" };
  let cleaned = String(raw).replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0")) cleaned = cleaned.replace(/^0+/, "");
  if (cleaned.length === 10) cleaned = "91" + cleaned; // default to India country code
  const isValid = cleaned.length >= 10 && cleaned.length <= 15;
  return {
    isValid,
    digits: cleaned,
    jid: cleaned + "@s.whatsapp.net",
  };
}

async function initBaileysSocket() {
  try {
    ensureAuthDir();
    isConnecting = true;
    connectionStatus = "CONNECTING";
    lastErrorMessage = null;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: "silent" });

    const sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false,
      browser: ["BLOW SALON Management Suite", "Chrome", "1.0.0"],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    socket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 320,
            color: { dark: "#292D29", light: "#FFFFFF" },
          });
          connectionStatus = "QR_REQUIRED";
          isConnecting = false;
          console.log("[WhatsApp Service] New QR Code generated ready for scan.");
        } catch (qrErr) {
          console.error("[WhatsApp Service] QR Generation error:", qrErr.message);
        }
      }

      if (connection === "connecting") {
        if (connectionStatus !== "QR_REQUIRED") {
          connectionStatus = "CONNECTING";
        }
      }

      if (connection === "open") {
        connectionStatus = "CONNECTED";
        qrCodeDataUrl = null;
        isConnecting = false;
        lastErrorMessage = null;

        const userJid = sock.user?.id || "";
        if (userJid) {
          const userPhone = userJid.split(":")[0] || userJid.split("@")[0];
          connectedPhoneNumber = "+" + userPhone;
        }
        console.log(`[WhatsApp Service] Connected successfully! Number: ${connectedPhoneNumber}`);
      }

      if (connection === "close") {
        isConnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp Service] Connection closed. Status code: ${statusCode}, shouldReconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = "DISCONNECTED";
          connectedPhoneNumber = null;
          qrCodeDataUrl = null;
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
        } else if (shouldReconnect) {
          if (connectionStatus !== "QR_REQUIRED") {
            connectionStatus = "CONNECTING";
          }
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            console.log("[WhatsApp Service] Attempting reconnection...");
            initBaileysSocket().catch((err) => {
              console.error("[WhatsApp Service] Reconnection failed:", err.message);
            });
          }, 5000);
        } else {
          connectionStatus = "DISCONNECTED";
        }
      }
    });
  } catch (err) {
    isConnecting = false;
    connectionStatus = "ERROR";
    lastErrorMessage = err.message;
    console.error("[WhatsApp Service] Init error:", err.message);
  }
}

async function disconnectSocket() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (socket) {
    try {
      await socket.logout();
    } catch (_) {}
    try {
      socket.end(undefined);
    } catch (_) {}
    socket = null;
  }
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  connectionStatus = "DISCONNECTED";
  qrCodeDataUrl = null;
  connectedPhoneNumber = null;
  lastErrorMessage = null;
  isConnecting = false;
}

// Check if saved session exists at startup
if (hasSavedSession()) {
  console.log("[WhatsApp Service] Found saved auth session. Initializing auto-connect...");
  initBaileysSocket().catch((err) => console.error("[WhatsApp Service] Startup connect error:", err.message));
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Check Secret Key if configured
  if (SERVICE_SECRET) {
    const authHeader = req.headers["authorization"] || "";
    const apiKeyHeader = req.headers["x-api-key"] || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || apiKeyHeader;
    if (token !== SERVICE_SECRET && req.url !== "/health") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Helper to parse JSON body
  const parseJsonBody = () =>
    new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });

  // Health check
  if (pathname === "/health" || pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", service: "BLOW SALON WhatsApp Service", timestamp: new Date().toISOString() }));
    return;
  }

  // Get status
  if ((pathname === "/status" || pathname === "/api/status") && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: connectionStatus,
        connectedNumber: connectedPhoneNumber,
        qrCode: connectionStatus === "QR_REQUIRED" ? qrCodeDataUrl : null,
        errorMessage: lastErrorMessage,
        updatedAt: new Date().toISOString(),
      })
    );
    return;
  }

  // Connect / Request QR
  if ((pathname === "/connect" || pathname === "/api/connect") && req.method === "POST") {
    if (connectionStatus !== "CONNECTED") {
      if (!isConnecting) {
        initBaileysSocket().catch((err) => console.error("[WhatsApp Service] Connect error:", err.message));
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        status: connectionStatus,
        connectedNumber: connectedPhoneNumber,
        qrCode: connectionStatus === "QR_REQUIRED" ? qrCodeDataUrl : null,
        errorMessage: lastErrorMessage,
      })
    );
    return;
  }

  // Disconnect
  if ((pathname === "/disconnect" || pathname === "/api/disconnect") && req.method === "POST") {
    await disconnectSocket();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, status: "DISCONNECTED", message: "Logged out and cleared credentials." }));
    return;
  }

  // Send Message
  if ((pathname === "/send-message" || pathname === "/api/send-message") && req.method === "POST") {
    try {
      const body = await parseJsonBody();
      const { phoneNumber, message } = body;

      if (!phoneNumber || !message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Missing phoneNumber or message." }));
        return;
      }

      if (connectionStatus !== "CONNECTED" || !socket) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "WhatsApp is not connected. Scan QR code to connect." }));
        return;
      }

      const normalized = normalizePhoneNumber(phoneNumber);
      if (!normalized.isValid) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: `Invalid phone number format: "${phoneNumber}".` }));
        return;
      }

      const sendResult = await socket.sendMessage(normalized.jid, { text: message });
      const messageId = sendResult?.key?.id || null;

      console.log(`[WhatsApp Service] Message dispatched to ${normalized.digits}, ID: ${messageId}`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, messageId }));
    } catch (sendErr) {
      console.error("[WhatsApp Service] Send error:", sendErr.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: sendErr.message || "Failed to send message." }));
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, () => {
  console.log(`[BLOW SALON WhatsApp Service] Running on port ${PORT}`);
  console.log(`Auth Directory: ${AUTH_DIR}`);
});
