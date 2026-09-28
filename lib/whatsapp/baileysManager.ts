import path from "path";
import fs from "fs";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
  ConnectionState,
} from "@whiskeysockets/baileys";
import type { WhatsAppConnectionStatus } from "@/types/whatsapp";
import { normalizePhoneNumber } from "../utils/phone";

export function extractWhatsAppMessageId(result: unknown): string | null {
  if (!result) return null;
  if (typeof result === "string" && result.trim()) return result.trim();
  if (typeof result === "object") {
    const obj = result as Record<string, any>;
    if (obj.key?.id && typeof obj.key.id === "string") return obj.key.id;
    if (obj.messageId && typeof obj.messageId === "string") return obj.messageId;
    if (obj.id && typeof obj.id === "string") return obj.id;
    if (Array.isArray(obj.messages) && obj.messages[0]) {
      const first = obj.messages[0];
      if (first.key?.id && typeof first.key.id === "string") return first.key.id;
      if (first.id && typeof first.id === "string") return first.id;
    }
  }
  return null;
}

interface BaileysManagerState {
  status: WhatsAppConnectionStatus;
  qrCode?: string; // Data URL image
  connectedNumber?: string;
  errorMessage?: string;
  socket: WASocket | null;
  isConnecting: boolean;
  authFolder: string;
}

const AUTH_DIR = path.join(process.cwd(), ".whatsapp_auth");

class BaileysManager {
  private state: BaileysManagerState = {
    status: "DISCONNECTED",
    authFolder: AUTH_DIR,
    socket: null,
    isConnecting: false,
  };

  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor() {
    try {
      this.ensureAuthDir();
      if (this.hasSavedSession()) {
        this.initSocket().catch((err) => {
          console.error("[WhatsApp Baileys] Auto-connect error:", err instanceof Error ? err.message : err);
        });
      }
    } catch (initErr) {
      console.warn("[WhatsApp Baileys] In-process storage warning:", initErr instanceof Error ? initErr.message : initErr);
    }
  }

  private ensureAuthDir() {
    try {
      if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
    } catch (fsErr) {
      console.warn("[WhatsApp Baileys] Cannot create auth directory in current environment:", fsErr instanceof Error ? fsErr.message : fsErr);
    }
  }

  private hasSavedSession(): boolean {
    try {
      if (!fs.existsSync(AUTH_DIR)) return false;
      const files = fs.readdirSync(AUTH_DIR);
      return files.length > 0 && files.some((f) => f.includes("creds.json"));
    } catch {
      return false;
    }
  }

  public async getStatus(): Promise<{
    status: WhatsAppConnectionStatus;
    connectedNumber?: string;
    qrCode?: string;
    errorMessage?: string;
  }> {
    return {
      status: this.state.status,
      connectedNumber: this.state.connectedNumber,
      qrCode: this.state.status === "QR_REQUIRED" ? this.state.qrCode : undefined,
      errorMessage: this.state.errorMessage,
    };
  }

  public async connect(): Promise<void> {
    if (this.state.status === "CONNECTED" && this.state.socket) {
      return;
    }
    if (this.state.isConnecting && this.state.status === "CONNECTING") {
      return;
    }
    await this.initSocket();
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      if (this.state.socket) {
        try {
          await this.state.socket.logout();
        } catch {
          // Socket might already be closed
        }
        this.state.socket.end(undefined);
        this.state.socket = null;
      }

      // Clear auth directory
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }

      this.state.status = "DISCONNECTED";
      this.state.qrCode = undefined;
      this.state.connectedNumber = undefined;
      this.state.errorMessage = undefined;
      this.state.isConnecting = false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error disconnecting WhatsApp";
      console.error("[WhatsApp Baileys] Disconnect error:", msg);
      this.state.status = "DISCONNECTED";
    }
  }

  private async initSocket(): Promise<void> {
    try {
      this.ensureAuthDir();
      this.state.isConnecting = true;
      this.state.status = "CONNECTING";
      this.state.errorMessage = undefined;

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      const logger = pino({ level: "silent" });

      const socketFactory = (makeWASocket as any).default || makeWASocket;

      const sock: WASocket = socketFactory({
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

      this.state.socket = sock;

      // Handle Credentials update
      sock.ev.on("creds.update", saveCreds);

      // Handle Connection update
      sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 300,
              color: {
                dark: "#292D29",
                light: "#FFFFFF",
              },
            });
            this.state.qrCode = qrDataUrl;
            this.state.status = "QR_REQUIRED";
            this.state.isConnecting = false;
          } catch (qrErr) {
            console.error("[WhatsApp Baileys] QR Generation error:", qrErr);
          }
        }

        if (connection === "connecting") {
          if (this.state.status !== "QR_REQUIRED") {
            this.state.status = "CONNECTING";
          }
        }

        if (connection === "open") {
          this.state.status = "CONNECTED";
          this.state.qrCode = undefined;
          this.state.isConnecting = false;
          this.state.errorMessage = undefined;

          // Extract connected WhatsApp number
          const userJid = sock.user?.id || "";
          if (userJid) {
            const userPhone = userJid.split(":")[0] || userJid.split("@")[0];
            const normalized = normalizePhoneNumber(userPhone);
            this.state.connectedNumber = normalized.display || normalized.e164;
          }
        }

        if (connection === "close") {
          this.state.isConnecting = false;
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          if (statusCode === DisconnectReason.loggedOut) {
            this.state.status = "DISCONNECTED";
            this.state.connectedNumber = undefined;
            this.state.qrCode = undefined;
            // Clear credentials
            if (fs.existsSync(AUTH_DIR)) {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            }
          } else if (shouldReconnect) {
            if (this.state.status !== "QR_REQUIRED") {
              this.state.status = "CONNECTING";
            }
            // Schedule reconnect
            if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = setTimeout(() => {
              this.initSocket().catch((err) => {
                console.error("[WhatsApp Baileys] Reconnect failed:", err);
              });
            }, 5000);
          } else {
            this.state.status = "DISCONNECTED";
          }
        }
      });
    } catch (err: unknown) {
      this.state.isConnecting = false;
      this.state.status = "ERROR";
      const errorMsg = err instanceof Error ? err.message : "Failed to initialize WhatsApp connection";
      this.state.errorMessage = errorMsg;
      console.error("[WhatsApp Baileys] Init error:", err);
    }
  }

  public async sendTextMessage(
    phoneNumber: string,
    messageText: string
  ): Promise<{ success: boolean; messageId?: string | null; error?: string | null }> {
    try {
      if (this.state.status !== "CONNECTED" || !this.state.socket) {
        return {
          success: false,
          messageId: null,
          error: "WhatsApp is not connected. Please connect via QR code in Settings.",
        };
      }

      const normalized = normalizePhoneNumber(phoneNumber);
      if (!normalized.isValid) {
        return {
          success: false,
          messageId: null,
          error: `Invalid phone number: "${phoneNumber}".`,
        };
      }

      const jid = normalized.whatsappJid;

      // Send text message
      const result = await this.state.socket.sendMessage(jid, {
        text: messageText,
      });

      const messageId = extractWhatsAppMessageId(result);

      return {
        success: true,
        messageId: messageId,
        error: null,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to send WhatsApp message";
      console.error("[WhatsApp Baileys] Send error:", errorMsg);
      return {
        success: false,
        messageId: null,
        error: errorMsg,
      };
    }
  }
}

// Global Singleton to survive Hot Reload / Route invocations
const globalForBaileys = globalThis as unknown as {
  __blowSalonBaileysManager?: BaileysManager;
};

export const baileysManager =
  globalForBaileys.__blowSalonBaileysManager || new BaileysManager();

if (process.env.NODE_ENV !== "production") {
  globalForBaileys.__blowSalonBaileysManager = baileysManager;
}
