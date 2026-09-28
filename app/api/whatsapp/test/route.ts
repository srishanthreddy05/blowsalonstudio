import { NextResponse } from "next/server";
import { getWhatsAppProvider } from "@/lib/whatsapp/providerFactory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/whatsapp/test
 * Safe development/diagnostic test endpoint.
 * Protected against public arbitrary execution.
 */
export async function POST(request: Request) {
  // 1. Guard: Check environment or admin secret
  const isDev = process.env.NODE_ENV !== "production";
  const adminKey = request.headers.get("x-admin-key");
  const expectedSecret = process.env.WHATSAPP_SERVICE_SECRET || process.env.NEXTAUTH_SECRET;

  const isAuthorized = isDev || (expectedSecret && adminKey === expectedSecret);

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized. WhatsApp test endpoint is only accessible in development mode or with admin key." },
      { status: 403 }
    );
  }

  try {
    const provider = getWhatsAppProvider();
    const status = await provider.getStatus();

    return NextResponse.json({
      success: true,
      provider: provider.providerType,
      status: status.status,
      connectedNumber: status.connectedNumber || null,
      errorMessage: status.errorMessage || null,
      errorCode: status.errorCode || null,
      environmentConfig: {
        apiVersion: process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0 (default)",
        hasAccessToken: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
        hasPhoneNumberId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
        hasBusinessAccountId: Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
        hasVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
        hasAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
        templateName: process.env.WHATSAPP_INVOICE_TEMPLATE_NAME || "Not configured (using text receipts)",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Test execution failed";
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
