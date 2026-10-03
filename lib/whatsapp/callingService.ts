import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import type {
  CallingPermissionStatus,
  CallStatus,
  CallingSession,
  MetaCallEvent,
  PermissionCheckResult,
} from "@/types/calling";

const CALLING_SESSIONS_COLLECTION = "whatsapp_calling_test_sessions";

// In-memory session store for fast lookup and fallback across serverless cycles
const memoryCallingSessions = new Map<string, CallingSession>();
const memoryCustomerPermissions = new Map<string, CallingPermissionStatus>();

function getMetaConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "1329685360226264";
  const apiVersion = (
    process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0"
  )
    .trim()
    .replace(/^v?/, "v");

  if (!accessToken) {
    throw new Error(
      "WHATSAPP_ACCESS_TOKEN is missing in environment variables."
    );
  }
  if (!phoneNumberId) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID is missing in environment variables."
    );
  }

  return { accessToken, phoneNumberId, apiVersion };
}

/**
 * Persists calling session to memory and Firestore (isolated collection)
 */
export async function saveCallingSession(
  session: CallingSession
): Promise<void> {
  memoryCallingSessions.set(session.callId, session);
  if (session.customerNumber) {
    memoryCustomerPermissions.set(session.customerNumber, session.permission);
  }

  try {
    const sessionDocRef = doc(db, CALLING_SESSIONS_COLLECTION, session.callId);
    await setDoc(sessionDocRef, session, { merge: true });
  } catch (err) {
    console.warn(
      "[WhatsApp Calling] Firestore session save failed, using memory:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Retrieves a calling session by callId
 */
export async function getCallingSession(
  callId: string
): Promise<CallingSession | null> {
  const fromMemory = memoryCallingSessions.get(callId);
  // If memory already has the SDP answer or terminal state, return it immediately
  if (fromMemory && (fromMemory.sdpAnswer || fromMemory.status === "TERMINATED" || fromMemory.status === "REJECTED")) {
    return fromMemory;
  }

  try {
    const sessionDocRef = doc(db, CALLING_SESSIONS_COLLECTION, callId);
    const snap = await getDoc(sessionDocRef);
    if (snap.exists()) {
      const data = snap.data() as CallingSession;
      memoryCallingSessions.set(callId, data);
      return data;
    }
  } catch (err) {
    console.warn(
      "[WhatsApp Calling] Firestore session read failed:",
      err instanceof Error ? err.message : err
    );
  }

  return fromMemory || null;
}

/**
 * Retrieves the latest calling session for a customer
 */
export async function getLatestSessionByCustomer(
  customerPhone: string
): Promise<CallingSession | null> {
  const normalized = normalizePhoneNumber(customerPhone);
  const targetPhone = normalized.isValid ? normalized.digits : customerPhone;

  // Search memory first
  for (const session of Array.from(memoryCallingSessions.values()).reverse()) {
    if (session.customerNumber === targetPhone) {
      return session;
    }
  }

  try {
    const q = query(
      collection(db, CALLING_SESSIONS_COLLECTION),
      where("customerNumber", "==", targetPhone)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      // Find the most recently updated
      let latest: CallingSession | null = null;
      for (const d of snap.docs) {
        const item = d.data() as CallingSession;
        if (!latest || item.updatedAt > latest.updatedAt) {
          latest = item;
        }
      }
      if (latest) {
        memoryCallingSessions.set(latest.callId, latest);
        return latest;
      }
    }
  } catch (err) {
    console.warn(
      "[WhatsApp Calling] Firestore search by customer failed:",
      err instanceof Error ? err.message : err
    );
  }

  return null;
}

/**
 * Request calling permission from customer via Meta Interactive message
 */
export async function requestCallingPermission(
  customerNumber: string
): Promise<{
  success: boolean;
  error?: string;
  messageId?: string;
  metaStatus?: number;
  metaError?: any;
  alreadyGranted?: boolean;
}> {
  const normalized = normalizePhoneNumber(customerNumber);
  if (!normalized.isValid) {
    return {
      success: false,
      error: `Invalid customer WhatsApp number: "${customerNumber}".`,
    };
  }

  const { accessToken, phoneNumberId, apiVersion } = getMetaConfig();
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized.digits,
    type: "interactive",
    interactive: {
      type: "call_permission_request",
      action: {
        name: "call_permission_request",
      },
      body: {
        text: "Blow Salon would like to call you regarding your appointment. Please grant permission to receive calls.",
      },
    },
  };

  try {
    console.log(`[WhatsApp Calling Diagnostics] Calling Meta Endpoint: POST ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    console.log(`[WhatsApp Calling Diagnostics] Meta HTTP Status: ${response.status}`);
    console.log(`[WhatsApp Calling Diagnostics] Meta Response JSON:`, JSON.stringify(data, null, 2));

    if (!response.ok) {
      const errInfo = data.error || {};
      console.error(`[WhatsApp Calling Diagnostics] Meta Error Details:`, {
        code: errInfo.code,
        message: errInfo.message,
        type: errInfo.type,
        error_subcode: errInfo.error_subcode,
        fbtrace_id: errInfo.fbtrace_id,
      });

      // Special case: code 138017 indicates that customer already granted permanent permission
      if (errInfo.code === 138017) {
        console.log(`[WhatsApp Calling Diagnostics] Customer ${normalized.digits} already has permanent calling permission.`);
        memoryCustomerPermissions.set(normalized.digits, "PERMANENT");
        return {
          success: true,
          messageId: undefined,
          error: undefined,
        };
      }

      const cleanMsg =
        errInfo.message ||
        errInfo.error_user_msg ||
        `Meta API error (#${errInfo.code || response.status})`;

      return {
        success: false,
        error: cleanMsg,
        metaStatus: response.status,
        metaError: {
          code: errInfo.code,
          message: errInfo.message,
          type: errInfo.type,
          error_subcode: errInfo.error_subcode,
          fbtrace_id: errInfo.fbtrace_id,
        },
      };
    }

    // Set permission in memory as PENDING
    memoryCustomerPermissions.set(normalized.digits, "PENDING");

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err: unknown) {
    console.error("[WhatsApp Calling Diagnostics] Network Exception:", err instanceof Error ? err.message : err);
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error requesting calling permission",
    };
  }
}

/**
 * Checks calling permission status directly from Meta Graph API
 */
export async function checkCallingPermission(
  customerNumber: string
): Promise<PermissionCheckResult> {
  const normalized = normalizePhoneNumber(customerNumber);
  if (!normalized.isValid) {
    return {
      success: false,
      status: "UNKNOWN",
      canStartCall: false,
      error: `Invalid phone format: "${customerNumber}"`,
    };
  }

  // Check memory permission if updated by webhook
  const cachedPerm = memoryCustomerPermissions.get(normalized.digits);

  const { accessToken, phoneNumberId, apiVersion } = getMetaConfig();
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/call_permissions?user_wa_id=${normalized.digits}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      console.log(`[WhatsApp Calling Diagnostics] Call Permissions Response:`, JSON.stringify(data, null, 2));

      const rawPermStatus = (data.permission?.status || "").toString().toLowerCase();
      const actions = Array.isArray(data.actions) ? data.actions : [];
      const startCallAction = actions.find((a: any) => a.action_name === "start_call");
      const canStartCall = Boolean(startCallAction?.can_perform_action === true);

      let mapped: CallingPermissionStatus = "UNKNOWN";
      if (rawPermStatus === "permanent") mapped = "PERMANENT";
      else if (rawPermStatus === "temporary") mapped = "TEMPORARY";
      else if (rawPermStatus === "granted") mapped = "GRANTED";
      else if (rawPermStatus === "pending") mapped = "PENDING";
      else if (rawPermStatus === "denied") mapped = "DENIED";
      else if (rawPermStatus === "expired") mapped = "EXPIRED";
      else if (canStartCall) mapped = "PERMANENT";
      else if (cachedPerm) mapped = cachedPerm;

      memoryCustomerPermissions.set(normalized.digits, mapped);

      return {
        success: true,
        status: mapped,
        canStartCall,
        raw: data,
      };
    } else {
      // If Meta call_permissions endpoint returns not found / unsupported on this account,
      // fallback to cached permission if available
      if (cachedPerm) {
        return {
          success: true,
          status: cachedPerm,
          canStartCall: cachedPerm === "PERMANENT" || cachedPerm === "TEMPORARY" || cachedPerm === "GRANTED",
          raw: data,
        };
      }

      const errInfo = data.error || {};
      return {
        success: false,
        status: "UNKNOWN",
        canStartCall: false,
        error:
          errInfo.message ||
          errInfo.error_user_msg ||
          `Failed to check call permission (#${errInfo.code || response.status})`,
        raw: data,
      };
    }
  } catch (err: unknown) {
    if (cachedPerm) {
      return {
        success: true,
        status: cachedPerm,
        canStartCall: cachedPerm === "PERMANENT" || cachedPerm === "TEMPORARY" || cachedPerm === "GRANTED",
      };
    }
    return {
      success: false,
      status: "UNKNOWN",
      canStartCall: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error checking permission",
    };
  }
}

/**
 * Initiates an outbound WhatsApp Call with WebRTC SDP offer
 */
export async function initiateWhatsAppCall(
  customerNumber: string,
  sdpOffer: string
): Promise<{ success: boolean; callId?: string; error?: string; raw?: any }> {
  const normalized = normalizePhoneNumber(customerNumber);
  if (!normalized.isValid) {
    return {
      success: false,
      error: `Invalid customer WhatsApp number: "${customerNumber}".`,
    };
  }

  if (!sdpOffer || typeof sdpOffer !== "string" || !sdpOffer.includes("m=audio")) {
    return {
      success: false,
      error: "A valid WebRTC audio SDP offer is required to initiate a call.",
    };
  }

  // 1. Verify calling permission and start_call.can_perform_action
  const permCheck = await checkCallingPermission(normalized.digits);
  const isPermitted =
    permCheck.canStartCall ||
    permCheck.status === "PERMANENT" ||
    permCheck.status === "TEMPORARY" ||
    permCheck.status === "GRANTED";

  if (!isPermitted) {
    return {
      success: false,
      error: `Calling permission not active for ${customerNumber} (status: ${permCheck.status}, canStartCall: ${permCheck.canStartCall}).`,
      raw: permCheck.raw,
    };
  }

  const { accessToken, phoneNumberId, apiVersion } = getMetaConfig();
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/calls`;

  const payload = {
    messaging_product: "whatsapp",
    to: normalized.digits,
    action: "connect",
    session: {
      sdp_type: "offer",
      sdp: sdpOffer,
    },
  };

  try {
    console.log(`[WhatsApp Calling Diagnostics] Initiating call to ${normalized.digits} via ${url}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    console.log(
      `[WhatsApp Calling Diagnostics] Call Connect Response Status: ${response.status}`,
      JSON.stringify(data, null, 2)
    );

    if (!response.ok) {
      const errInfo = data.error || {};
      const errCode = errInfo.code;
      let errorMsg =
        errInfo.message ||
        errInfo.error_user_msg ||
        `Meta Calls API error (#${errCode || response.status})`;

      if (errCode === 138006) {
        errorMsg =
          "Calling permission not granted. You must request and receive customer permission before initiating a call.";
      }

      return {
        success: false,
        error: errorMsg,
        raw: data,
      };
    }

    const callId = data.calls?.[0]?.id;
    if (!callId) {
      return {
        success: false,
        error: "Meta Calls API response did not contain a call ID.",
        raw: data,
      };
    }

    const now = new Date().toISOString();
    const session: CallingSession = {
      callId,
      customerNumber: normalized.digits,
      permission: permCheck.status,
      status: "CONNECTING",
      sdpOffer,
      direction: "business_initiated",
      createdAt: now,
      updatedAt: now,
    };

    await saveCallingSession(session);

    return {
      success: true,
      callId,
      raw: data,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error calling Meta Calls API",
    };
  }
}

/**
 * Terminates an active WhatsApp Call
 */
export async function terminateWhatsAppCall(
  callId: string
): Promise<{ success: boolean; error?: string; raw?: any }> {
  if (!callId) {
    return { success: false, error: "Call ID is required to terminate." };
  }

  const { accessToken, phoneNumberId, apiVersion } = getMetaConfig();
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/calls`;

  const payload = {
    messaging_product: "whatsapp",
    call_id: callId,
    action: "terminate",
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    // Update local session
    const existing = await getCallingSession(callId);
    if (existing) {
      existing.status = "TERMINATED";
      existing.updatedAt = new Date().toISOString();
      await saveCallingSession(existing);
    }

    if (!response.ok) {
      const errInfo = data.error || {};
      return {
        success: false,
        error:
          errInfo.message ||
          errInfo.error_user_msg ||
          `Failed to terminate call (#${errInfo.code || response.status})`,
        raw: data,
      };
    }

    return {
      success: true,
      raw: data,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Network error terminating call",
    };
  }
}

/**
 * Handles incoming call event from Meta Calling Webhook
 */
export async function handleIncomingCallWebhook(
  callEvent: MetaCallEvent
): Promise<void> {
  const callId = callEvent.id;
  if (!callId) return;

  const now = new Date().toISOString();
  let session = await getCallingSession(callId);

  const isMatch = Boolean(session);
  console.log(`[WhatsApp Calling Correlation] CALL ID MATCH: ${isMatch ? "YES" : "NO"} | Call ID: ${callId} | Event: ${callEvent.event}`);

  if (callEvent.event === "connect") {
    console.log(">>> CONNECT WEBHOOK RECEIVED <<<");
    console.log("CALL ID:", callId);
    console.log("DIRECTION:", callEvent.direction || "N/A");
    console.log("SDP TYPE:", callEvent.session?.sdp_type);
    console.log("SDP PRESENT:", Boolean(callEvent.session?.sdp) ? "YES" : "NO");
  }

  if (!session) {
    session = {
      callId,
      customerNumber: "",
      permission: "PERMANENT",
      status: "CONNECTING",
      createdAt: now,
      updatedAt: now,
    };
  }

  // Map event
  switch (callEvent.event) {
    case "connect":
      if (callEvent.session?.sdp_type === "answer" && callEvent.session.sdp) {
        session.sdpAnswer = callEvent.session.sdp;
        session.status = "ACCEPTED";
      }
      break;
    case "ringing":
      if (session.status !== "ACCEPTED") {
        session.status = "RINGING";
      }
      break;
    case "accepted":
      session.status = "ACCEPTED";
      break;
    case "rejected":
      session.status = "REJECTED";
      if (callEvent.reason) {
        session.errorMessage = `Call rejected: ${callEvent.reason}`;
      }
      break;
    case "terminated":
      session.status = "TERMINATED";
      if (callEvent.reason) {
        session.errorMessage = `Call ended: ${callEvent.reason}`;
      }
      break;
  }

  session.updatedAt = now;
  await saveCallingSession(session);
  console.log(
    `[WhatsApp Calling Webhook] Session ${callId} updated to ${session.status}${
      session.sdpAnswer ? " (SDP Answer attached)" : ""
    }`
  );
}

/**
 * Handles incoming call permission reply webhook
 */
export async function handleCallPermissionWebhook(
  fromPhone: string,
  userResponse: string
): Promise<void> {
  const normalized = normalizePhoneNumber(fromPhone);
  const digits = normalized.isValid ? normalized.digits : fromPhone;

  const status: CallingPermissionStatus =
    userResponse.toLowerCase() === "accept" ||
    userResponse.toLowerCase() === "granted"
      ? "GRANTED"
      : "DENIED";

  memoryCustomerPermissions.set(digits, status);

  // Check if there is an active session
  const latest = await getLatestSessionByCustomer(digits);
  if (latest) {
    latest.permission = status;
    if (status === "GRANTED" && latest.status === "REQUESTING_PERMISSION") {
      latest.status = "PERMISSION_GRANTED";
    }
    latest.updatedAt = new Date().toISOString();
    await saveCallingSession(latest);
  }

  console.log(
    `[WhatsApp Calling Webhook] Call permission updated for ${digits}: ${status}`
  );
}
