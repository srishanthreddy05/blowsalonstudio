export type CallingPermissionStatus =
  | "UNKNOWN"
  | "PENDING"
  | "GRANTED"
  | "PERMANENT"
  | "TEMPORARY"
  | "DENIED"
  | "EXPIRED";

export type CallStatus =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "PERMISSION_GRANTED"
  | "CONNECTING"
  | "CALLING"
  | "RINGING"
  | "ACCEPTED"
  | "CONNECTED"
  | "REJECTED"
  | "TERMINATED"
  | "FAILED";

export type WebRTCConnectionStage =
  | "NOT_STARTED"
  | "GENERATING_OFFER"
  | "OFFER_SENT"
  | "ANSWER_RECEIVED"
  | "CONNECTING"
  | "CONNECTED"
  | "FAILED"
  | "CLOSED";

export interface CallingSession {
  callId: string;
  customerNumber: string;
  permission: CallingPermissionStatus;
  status: CallStatus;
  sdpOffer?: string;
  sdpAnswer?: string;
  direction?: "business_initiated" | "user_initiated";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MetaCallEvent {
  id: string;
  event: "connect" | "ringing" | "accepted" | "rejected" | "terminated";
  session?: {
    sdp_type?: "offer" | "answer";
    sdp?: string;
  };
  direction?: string;
  status?: string;
  reason?: string;
  timestamp?: string;
}

export interface PermissionCheckResult {
  success: boolean;
  status: CallingPermissionStatus;
  canStartCall: boolean;
  raw?: any;
  error?: string;
}
