export const ALLOWED_ADMIN_EMAILS = [
  "theblowstudiosalon@gmail.com",
  "srishanthreddyy05@gmail.com",
  "thrivexreview@gmail.com",
].map((e) => e.toLowerCase().trim());

/**
 * Server-side authorization check for WhatsApp Campaign Management and Queue operations.
 * Validates Firebase ID tokens, Service Secrets (x-admin-key), or Worker Cron Secrets.
 */
export async function verifyWhatsAppCampaignAuth(request: Request): Promise<{
  authorized: boolean;
  error?: string;
  source?: "FIREBASE_TOKEN" | "ADMIN_KEY" | "CRON_SECRET" | "DEV_FALLBACK";
  user?: {
    uid?: string;
    email?: string;
    role?: string;
  };
}> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const adminKey = request.headers.get("x-admin-key")?.trim();

  const workerSecret = process.env.CRON_SECRET?.trim() || process.env.WHATSAPP_WORKER_SECRET?.trim();
  const serviceSecret =
    process.env.WHATSAPP_SERVICE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.WHATSAPP_APP_SECRET?.trim() ||
    workerSecret;

  // 1. Worker / Cron Secret match (Bearer token ONLY — query parameters strictly rejected)
  if (workerSecret && token === workerSecret) {
    return { authorized: true, source: "CRON_SECRET", user: { role: "CRON_WORKER" } };
  }

  // 2. Admin Key Header match (x-admin-key)
  if (adminKey && serviceSecret && adminKey === serviceSecret) {
    return { authorized: true, source: "ADMIN_KEY", user: { role: "SYSTEM_ADMIN" } };
  }

  // 3. Firebase ID Token Verification via Identity Toolkit
  if (token) {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (apiKey) {
      try {
        const verifyRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: token }),
          }
        );
        if (verifyRes.ok) {
          const data = await verifyRes.json();
          const userObj = data.users?.[0];
          const email = (userObj?.email || "").toLowerCase().trim();
          const isAllowed = ALLOWED_ADMIN_EMAILS.includes(email);

          if (isAllowed) {
            return {
              authorized: true,
              source: "FIREBASE_TOKEN",
              user: {
                uid: userObj?.localId,
                email,
                role: "ADMIN",
              },
            };
          } else {
            return {
              authorized: false,
              error: `Access denied. Email "${email}" is not an authorized salon administrator.`,
            };
          }
        }
      } catch (err) {
        console.warn("[WhatsApp Auth] Firebase ID token verification network error:", err);
      }
    }
  }

  // 4. In development mode or unconfigured environments, allow safe local testing
  if (!serviceSecret && !workerSecret && process.env.NODE_ENV !== "production") {
    return { authorized: true, source: "DEV_FALLBACK", user: { role: "DEV_ADMIN" } };
  }

  return {
    authorized: false,
    error: "Unauthorized: Valid Firebase user session or admin authorization key required.",
  };
}

