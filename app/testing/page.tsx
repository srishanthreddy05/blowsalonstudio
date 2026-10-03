"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Mic,
  Activity,
  Terminal,
  RefreshCw,
  Info,
  Radio,
} from "lucide-react";
import type {
  CallingPermissionStatus,
  CallStatus,
  WebRTCConnectionStage,
} from "@/types/calling";

interface DiagnosticLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warn" | "error";
  message: string;
  data?: any;
}

export default function WhatsAppCallingTestPage() {
  const [customerNumber, setCustomerNumber] = useState("+918125902062");
  const [permissionStatus, setPermissionStatus] =
    useState<CallingPermissionStatus>("UNKNOWN");
  const [canStartCall, setCanStartCall] = useState<boolean>(false);
  const [callStatus, setCallStatus] = useState<CallStatus>("IDLE");
  const [webrtcStage, setWebrtcStage] =
    useState<WebRTCConnectionStage>("NOT_STARTED");
  const [webrtcConnectionState, setWebrtcConnectionState] =
    useState<string>("idle");
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [isAudioReceiving, setIsAudioReceiving] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);

  // References
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const businessNumber = "+91 78422 38026";

  const addLog = (
    type: "info" | "success" | "warn" | "error",
    message: string,
    data?: any
  ) => {
    const entry: DiagnosticLog = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      data,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 49)]);
  };

  // Check permission on initial mount for default customer number
  useEffect(() => {
    handleCheckPermission(true);
    return () => {
      cleanupWebRTC();
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const cleanupWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsMicActive(false);
    setIsAudioReceiving(false);
    setWebrtcConnectionState("closed");
  };

  /**
   * Check Calling Permission Status from Meta Graph API
   */
  const handleCheckPermission = async (silent = false) => {
    if (!customerNumber || customerNumber.trim().length < 10) {
      if (!silent) setErrorMessage("Please enter a valid customer phone number.");
      return;
    }

    try {
      if (!silent) setIsLoading(true);
      setErrorMessage(null);

      const res = await fetch(
        `/api/testing/whatsapp-call/permission/status?customerNumber=${encodeURIComponent(
          customerNumber.trim()
        )}`
      );
      const data = await res.json();

      if (data.success && data.status) {
        setPermissionStatus(data.status);
        setCanStartCall(Boolean(data.canStartCall));

        if (data.status === "PERMANENT" || data.status === "GRANTED" || data.canStartCall) {
          if (!silent) {
            addLog("success", `Permission check: ${data.status} | can_start_call: YES`, data);
          }
        } else {
          if (!silent) {
            addLog("info", `Permission check: ${data.status} | can_start_call: ${data.canStartCall}`, data);
          }
        }
        return data;
      } else {
        if (!silent) {
          addLog("warn", `Permission status check failed: ${data.error || "Unknown"}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error checking permission";
      if (!silent) setErrorMessage(msg);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  /**
   * Helper to create an audio track (Microphone or synthetic audio fallback)
   */
  const getAudioStream = async (): Promise<MediaStream> => {
    try {
      addLog("info", "Requesting user microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setIsMicActive(true);
      addLog("success", "Microphone stream captured successfully.");
      return stream;
    } catch (micErr) {
      addLog(
        "warn",
        "Microphone access unavailable or denied. Using synthetic WebRTC audio oscillator...",
        micErr
      );
      // Web Audio API oscillator fallback ensuring valid RFC 8866 SDP negotiation
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.value = 0.01;
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      setIsMicActive(true);
      addLog("info", "Synthetic audio stream created for WebRTC session.");
      return dst.stream;
    }
  };

  /**
   * Initiate Call Flow
   */
  const handleCallCustomer = async () => {
    const isPermitted =
      canStartCall ||
      permissionStatus === "PERMANENT" ||
      permissionStatus === "TEMPORARY" ||
      permissionStatus === "GRANTED";

    if (!isPermitted) {
      setErrorMessage("Calling permission must be active before placing a call.");
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setCallStatus("CONNECTING");
      setWebrtcStage("GENERATING_OFFER");
      cleanupWebRTC();

      addLog("info", "Creating WebRTC RTCPeerConnection with STUN servers...");
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      peerConnectionRef.current = pc;

      // Handle ICE & Connection state changes
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setWebrtcConnectionState(state);
        addLog("info", `WebRTC Connection State: ${state}`);

        if (state === "connected") {
          setWebrtcStage("CONNECTED");
          setCallStatus("CONNECTED");
          addLog("success", "WebRTC two-way audio media connection established!");
        } else if (state === "failed") {
          setWebrtcStage("FAILED");
          addLog("warn", "WebRTC media connection failed to establish.");
        } else if (state === "connecting") {
          setWebrtcStage("CONNECTING");
        }
      };

      pc.oniceconnectionstatechange = () => {
        addLog("info", `WebRTC ICE State: ${pc.iceConnectionState}`);
      };

      pc.onsignalingstatechange = () => {
        addLog("info", `WebRTC Signaling State: ${pc.signalingState}`);
      };

      pc.onicegatheringstatechange = () => {
        addLog("info", `WebRTC ICE Gathering State: ${pc.iceGatheringState}`);
      };

      // Inbound audio stream handling
      pc.ontrack = (event) => {
        addLog("success", "Remote audio stream received from WhatsApp!", {
          kind: event.track.kind,
          id: event.track.id,
        });
        setIsAudioReceiving(true);
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch((e) => {
            console.warn("Audio autoplay blocked by browser policy:", e);
          });
        }
      };

      // Attach local audio source track (addTrack creates the single audio transceiver)
      const audioStream = await getAudioStream();
      localStreamRef.current = audioStream;
      audioStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, audioStream);
      });

      // Generate WebRTC SDP Offer
      addLog("info", "Generating RFC 8866 WebRTC SDP Offer...");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });

      await pc.setLocalDescription(offer);
      addLog("info", "Local description set with SDP offer.");

      // Wait until ICE candidate gathering is strictly complete
      addLog("info", "Gathering local ICE candidates (waiting for iceGatheringState === 'complete')...");
      if (pc.iceGatheringState !== "complete") {
        await new Promise<void>((resolve) => {
          const checkIceState = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", checkIceState);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", checkIceState);
        });
      }

      addLog("success", `ICE gathering completed (State: ${pc.iceGatheringState})`);

      const sdpOffer = pc.localDescription?.sdp;
      if (!sdpOffer) {
        throw new Error("Failed to generate valid WebRTC SDP offer.");
      }

      const mAudioCount = (sdpOffer.match(/^m=audio/gm) || []).length;
      const candidateCount = (sdpOffer.match(/^a=candidate/gm) || []).length;
      addLog("info", `SDP validation: ${mAudioCount} m=audio section(s), ${candidateCount} ICE candidate(s).`);

      setWebrtcStage("OFFER_SENT");
      addLog("info", "Calling Meta Calls API (POST /{PHONE_ID}/calls)...");

      const res = await fetch("/api/testing/whatsapp-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerNumber: customerNumber.trim(),
          sdp: sdpOffer,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Meta Calls API rejected call request.");
      }

      const callId = data.callId;
      setActiveCallId(callId);
      setCallStatus("CONNECTING");
      addLog("success", `Meta Call initiated! Call ID: ${callId}`, data);
      addLog("info", "Awaiting Meta calling webhook events (ringing / connect)...");

      // Start polling for webhook SDP answer and call status updates
      startStatusPolling(callId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error initiating call";
      setErrorMessage(msg);
      setCallStatus("FAILED");
      setWebrtcStage("FAILED");
      addLog("error", msg);
      cleanupWebRTC();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Polls backend for call events and SDP answer delivered by Meta webhook
   */
  const startStatusPolling = (callId: string) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    let answerApplied = false;

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/testing/whatsapp-call/status?callId=${callId}`);
        const data = await res.json();

        if (data.success && data.session) {
          const { status, sdpAnswer, errorMessage: sessionError } = data.session;

          if (sessionError) {
            setErrorMessage(sessionError);
          }

          // If SDP Answer has arrived and not yet applied to WebRTC
          if (sdpAnswer && !answerApplied && peerConnectionRef.current) {
            answerApplied = true;
            setWebrtcStage("ANSWER_RECEIVED");
            addLog("success", "Received SDP Answer from Meta Calling Webhook!", {
              sdpLength: sdpAnswer.length,
            });

            try {
              addLog("info", "Applying remote SDP Answer to RTCPeerConnection...");
              await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription({
                  type: "answer",
                  sdp: sdpAnswer,
                })
              );
              setWebrtcStage("CONNECTING");
              setCallStatus("ACCEPTED");
              addLog("success", "Remote SDP Answer applied! Establishing WebRTC audio media...");
            } catch (sdpErr) {
              addLog("error", "Failed to apply remote SDP Answer:", sdpErr);
              setWebrtcStage("FAILED");
            }
          }

          // Reflect webhook status if not yet in terminal state
          if (status === "RINGING" && callStatus !== "ACCEPTED" && callStatus !== "CONNECTED") {
            setCallStatus("RINGING");
          } else if (status === "ACCEPTED" && callStatus !== "CONNECTED") {
            setCallStatus("ACCEPTED");
          }

          // Handle termination / rejection
          if (status === "TERMINATED" || status === "REJECTED" || status === "FAILED") {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
            cleanupWebRTC();
            setCallStatus(status);
            addLog("info", `Call ended with status: ${status}`);
          }
        }
      } catch (err) {
        console.warn("Status polling error:", err);
      }
    }, 1500);
  };

  /**
   * Terminate Call Flow
   */
  const handleEndCall = async () => {
    if (!activeCallId) {
      cleanupWebRTC();
      setCallStatus("IDLE");
      setWebrtcStage("CLOSED");
      return;
    }

    try {
      setIsLoading(true);
      addLog("info", `Terminating call ${activeCallId} via Meta Calls API...`);

      const res = await fetch("/api/testing/whatsapp-call/terminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: activeCallId }),
      });

      const data = await res.json();
      if (data.success) {
        addLog("success", `Call ${activeCallId} terminated successfully.`);
      } else {
        addLog("warn", `Call terminate response: ${data.error || "Done"}`);
      }
    } catch (err: unknown) {
      addLog("error", "Error terminating call:", err);
    } finally {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      cleanupWebRTC();
      setCallStatus("TERMINATED");
      setWebrtcStage("CLOSED");
      setIsLoading(false);
    }
  };

  const isCallActive =
    callStatus === "CONNECTING" ||
    callStatus === "CALLING" ||
    callStatus === "RINGING" ||
    callStatus === "ACCEPTED" ||
    callStatus === "CONNECTED";

  const isPermissionPermanent =
    permissionStatus === "PERMANENT" || permissionStatus === "GRANTED";

  return (
    <div className="min-h-screen bg-[#F7F7F4] text-[#292D29] p-4 sm:p-8">
      {/* Hidden Audio Element for WebRTC Inbound Media */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white border border-[#E0E4DD] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-2 border border-emerald-200">
              <PhoneCall className="w-3.5 h-3.5" />
              Meta Cloud API Calling POC
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#2F352F]">
              WhatsApp Calling Test
            </h1>
            <p className="text-sm text-[#747A72] mt-1">
              Meta WhatsApp Business-Initiated Calling via official Cloud API Calling endpoints.
            </p>
          </div>

          <div className="bg-[#F7F7F4] border border-[#E0E4DD] rounded-xl px-4 py-3 text-right">
            <span className="text-xs uppercase tracking-wider text-[#747A72] font-semibold block">
              Business Caller ID
            </span>
            <span className="text-base font-bold text-[#2F352F] font-mono">
              {businessNumber}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Notice:</span> {errorMessage}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main 2-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Controls Card */}
          <div className="md:col-span-2 bg-white border border-[#E0E4DD] rounded-2xl p-6 shadow-xs space-y-6">
            <h2 className="text-lg font-bold text-[#2F352F] border-b border-[#E0E4DD] pb-3 flex items-center justify-between">
              <span>Calling Test Controls</span>
              <span className="text-xs font-normal text-[#747A72]">
                Isolated Testing Sandbox
              </span>
            </h2>

            {/* Input: Customer WhatsApp Number */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#2F352F] flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#5F7A62]" />
                Customer WhatsApp Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  placeholder="+918125902062"
                  disabled={isCallActive}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#5F7A62]/30 focus:border-[#5F7A62]"
                />
                <button
                  type="button"
                  onClick={() => handleCheckPermission(false)}
                  disabled={isLoading || isCallActive}
                  title="Check permission status"
                  className="px-3.5 py-2.5 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] hover:bg-[#E8ECE5] text-xs font-medium text-[#292D29] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  Check Status
                </button>
              </div>
            </div>

            {/* Calling Permission Verification Display */}
            <div className="bg-[#F7F7F4] rounded-xl p-4 border border-[#E0E4DD] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#747A72]">Customer Permission Status:</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#2F352F]">
                      Calling Permission:
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isPermissionPermanent
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : permissionStatus === "PENDING"
                          ? "bg-amber-100 text-amber-800 border border-amber-300"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {isPermissionPermanent ? "✅ PERMANENT" : permissionStatus}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 sm:text-right">
                  <div className="text-xs font-semibold text-[#747A72]">Can Start Call:</div>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      canStartCall || isPermissionPermanent
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-rose-100 text-rose-800 border border-rose-300"
                    }`}
                  >
                    {canStartCall || isPermissionPermanent ? "✅ YES" : "❌ NO"}
                  </span>
                </div>
              </div>

              {isPermissionPermanent && (
                <div className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Permission is confirmed permanent with Meta. You can initiate calls immediately.
                  </span>
                </div>
              )}
            </div>

            {/* Call Action & Real-time WebRTC Status */}
            <div className="bg-[#F7F7F4] rounded-xl p-5 border border-[#E0E4DD] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#2F352F] flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-[#5F7A62]" />
                  Call Status & Media
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                    callStatus === "CONNECTED"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : callStatus === "ACCEPTED" || callStatus === "RINGING" || callStatus === "CONNECTING"
                      ? "bg-amber-50 text-amber-800 border-amber-200 animate-pulse"
                      : callStatus === "FAILED" || callStatus === "REJECTED"
                      ? "bg-rose-50 text-rose-800 border-rose-200"
                      : "bg-zinc-100 text-zinc-700 border-zinc-200"
                  }`}
                >
                  {callStatus}
                </span>
              </div>

              {/* Status Explanation Box */}
              <div className="p-3 bg-white rounded-lg border border-[#E0E4DD] text-xs space-y-1">
                <div className="font-semibold text-[#2F352F]">Signaling & Media State:</div>
                {callStatus === "CONNECTED" && (
                  <div className="text-emerald-700 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    WebRTC media connection fully established (Two-way audio active).
                  </div>
                )}
                {callStatus === "ACCEPTED" && webrtcConnectionState !== "connected" && (
                  <div className="text-amber-700 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Call signaling successful — audio connection not established (WebRTC state: {webrtcConnectionState}).
                  </div>
                )}
                {callStatus === "RINGING" && (
                  <div className="text-amber-700 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Customer WhatsApp device is ringing...
                  </div>
                )}
                {callStatus === "CONNECTING" && (
                  <div className="text-blue-700 font-medium flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Generating WebRTC SDP offer and contacting Meta Calls API...
                  </div>
                )}
                {callStatus === "IDLE" && (
                  <div className="text-[#747A72]">
                    Ready to place call. Click CALL CUSTOMER to generate WebRTC SDP offer and initiate call.
                  </div>
                )}
                {callStatus === "TERMINATED" && (
                  <div className="text-zinc-600">
                    Call was terminated. Session closed.
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCallCustomer}
                  disabled={(!canStartCall && !isPermissionPermanent) || isCallActive || isLoading}
                  className={`px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer ${
                    (canStartCall || isPermissionPermanent) && !isCallActive
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-[#E0E4DD] text-[#747A72] cursor-not-allowed"
                  }`}
                >
                  <PhoneCall className="w-4 h-4" />
                  CALL CUSTOMER
                </button>

                <button
                  type="button"
                  onClick={handleEndCall}
                  disabled={!isCallActive}
                  className={`px-6 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer ${
                    isCallActive
                      ? "bg-rose-600 hover:bg-rose-700 text-white"
                      : "bg-[#E0E4DD] text-[#747A72] cursor-not-allowed opacity-50"
                  }`}
                >
                  <PhoneOff className="w-4 h-4" />
                  END CALL
                </button>
              </div>

              {activeCallId && (
                <div className="mt-2 text-xs font-mono text-[#747A72] bg-white p-2.5 rounded-lg border border-[#E0E4DD] truncate">
                  <span className="font-semibold text-[#2F352F]">Meta Call ID: </span>
                  {activeCallId}
                </div>
              )}
            </div>
          </div>

          {/* Test Stage Architecture Status Card */}
          <div className="bg-white border border-[#E0E4DD] rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-[#2F352F] border-b border-[#E0E4DD] pb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#5F7A62]" />
              POC Verification
            </h2>

            {/* Stage A */}
            <div className="p-3 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2F352F]">
                  Stage A: Permission
                </span>
                {isPermissionPermanent ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <p className="text-[11px] text-[#747A72]">
                Customer permanent permission verified from Meta Graph API.
              </p>
              <div className="text-xs font-mono text-[#5F7A62] font-semibold">
                Status: {permissionStatus} | Call allowed: {canStartCall || isPermissionPermanent ? "YES" : "NO"}
              </div>
            </div>

            {/* Stage B */}
            <div className="p-3 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2F352F]">
                  Stage B: Call Signaling
                </span>
                {webrtcStage === "ANSWER_RECEIVED" ||
                webrtcStage === "CONNECTING" ||
                webrtcStage === "CONNECTED" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Clock className="w-4 h-4 text-zinc-400" />
                )}
              </div>
              <p className="text-[11px] text-[#747A72]">
                SDP offer negotiation, Calls API connect, and Webhook SDP answer.
              </p>
              <div className="text-xs font-mono text-[#5F7A62] font-semibold">
                Signaling: {webrtcStage}
              </div>
            </div>

            {/* Stage C */}
            <div className="p-3 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2F352F]">
                  Stage C: WebRTC Audio Media
                </span>
                {webrtcConnectionState === "connected" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Clock className="w-4 h-4 text-zinc-400" />
                )}
              </div>
              <p className="text-[11px] text-[#747A72]">
                ICE/DTLS media transport connection.
              </p>
              <div className="text-xs font-mono text-[#5F7A62] font-semibold">
                Media state: {webrtcConnectionState}
              </div>
            </div>

            {/* Media Indicators */}
            <div className="pt-2 border-t border-[#E0E4DD] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[#747A72]">
                  <Mic className="w-3.5 h-3.5 text-[#5F7A62]" />
                  Local Audio Track
                </span>
                <span
                  className={`font-semibold ${
                    isMicActive ? "text-emerald-600" : "text-zinc-400"
                  }`}
                >
                  {isMicActive ? "ACTIVE" : "OFF"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-[#747A72]">
                  <Volume2 className="w-3.5 h-3.5 text-[#5F7A62]" />
                  Remote Inbound Audio
                </span>
                <span
                  className={`font-semibold ${
                    isAudioReceiving ? "text-emerald-600" : "text-zinc-400"
                  }`}
                >
                  {isAudioReceiving ? "STREAMING" : "OFF"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Diagnostics & Event Log Panel */}
        <div className="bg-white border border-[#E0E4DD] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
            <h2 className="text-sm font-bold text-[#2F352F] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#5F7A62]" />
              Calling POC Diagnostic Logs
            </h2>
            <button
              type="button"
              onClick={() => setLogs([])}
              className="text-xs text-[#747A72] hover:text-[#2F352F] cursor-pointer"
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-[#1E221E] text-[#E0E4DD] p-4 rounded-xl font-mono text-xs max-h-80 overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <div className="text-zinc-500 italic">
                Ready. Click CALL CUSTOMER to initiate Meta WhatsApp calling test.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 border-b border-zinc-800/50 pb-1">
                  <span className="text-zinc-500 shrink-0">[{log.timestamp}]</span>
                  <span
                    className={`font-semibold shrink-0 ${
                      log.type === "success"
                        ? "text-emerald-400"
                        : log.type === "error"
                        ? "text-rose-400"
                        : log.type === "warn"
                        ? "text-amber-400"
                        : "text-blue-400"
                    }`}
                  >
                    {log.type.toUpperCase()}:
                  </span>
                  <span className="flex-1 break-all text-zinc-300">
                    {log.message}
                    {log.data && (
                      <pre className="mt-1 text-[11px] text-zinc-400 bg-black/40 p-2 rounded max-h-32 overflow-x-auto whitespace-pre-wrap">
                        {typeof log.data === "string"
                          ? log.data
                          : JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Guidance Footer */}
        <div className="bg-white border border-[#E0E4DD] rounded-xl p-4 text-xs text-[#747A72] flex items-start gap-3">
          <Info className="w-4 h-4 text-[#5F7A62] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-[#2F352F]">Meta WhatsApp Calling Architecture Flow:</span>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                <strong>1. Calling Permission:</strong> Permanent permission already confirmed with Meta.
              </li>
              <li>
                <strong>2. SDP Offer Generation:</strong> Browser RTCPeerConnection creates an RFC 8866 compliant audio offer.
              </li>
              <li>
                <strong>3. Meta Connect:</strong> Server dispatches <code>POST /{`{PHONE_ID}`}/calls</code> with <code>action: connect</code> and the SDP offer.
              </li>
              <li>
                <strong>4. Webhook Answer:</strong> Meta calls your webhook with <code>field: calls</code> and the SDP answer, which is applied via <code>setRemoteDescription</code>.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
