"use client";

import React, { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import type {
  WhatsAppConversation,
  WhatsAppMessageRecord,
} from "@/types/whatsapp";
import type { Customer } from "@/types/customer";
import * as whatsappService from "@/services/whatsapp";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { ConversationList } from "./ConversationList";
import { ChatThread } from "./ChatThread";
import { CustomerDetailsPanel } from "./CustomerDetailsPanel";
import { MessageSquare } from "lucide-react";
import { toast } from "react-hot-toast";

interface WhatsAppInboxViewProps {
  whatsappEnabled: boolean;
}

export function WhatsAppInboxView({ whatsappEnabled }: WhatsAppInboxViewProps) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [temporaryConversation, setTemporaryConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessageRecord[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCustomerPanel, setShowCustomerPanel] = useState(true);

  // 1. Real-time listener for Conversations collection (limited to 50 most recent)
  useEffect(() => {
    setLoadingConversations(true);
    const q = query(
      collection(db, "whatsapp_conversations"),
      orderBy("lastMessageAt", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const convList: WhatsAppConversation[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as WhatsAppConversation));

        setConversations(convList);
        setLoadingConversations(false);

        // Auto-select first if none is active
        setActiveConversationId((prev) => {
          if (!prev && convList.length > 0) {
            return convList[0].id;
          }
          return prev;
        });
      },
      (err) => {
        console.error("Error listening to WhatsApp conversations:", err);
        whatsappService.getConversations().then((res) => {
          setConversations(res);
          setLoadingConversations(false);
          if (res.length > 0 && !activeConversationId) {
            setActiveConversationId(res[0].id);
          }
        });
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute active conversation (either from saved conversations or temporary placeholder)
  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ||
    (temporaryConversation?.id === activeConversationId ? temporaryConversation : null);

  // 2. Real-time listener for Messages in the Active Conversation (limited to 30)
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);

    // Reset unread count if there are unread messages
    if (activeConversation?.unreadCount && activeConversation.unreadCount > 0) {
      whatsappService.markConversationAsRead(activeConversationId);
    }

    const q = query(
      collection(db, "whatsapp_messages"),
      where("conversationId", "==", activeConversationId),
      orderBy("createdAt", "asc"),
      limit(30)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgList: WhatsAppMessageRecord[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as WhatsAppMessageRecord));

        setMessages(msgList);
        setLoadingMessages(false);
      },
      (err) => {
        console.error("Error listening to WhatsApp messages:", err);
        whatsappService.getConversationMessages(activeConversationId).then((res) => {
          setMessages(res);
          setLoadingMessages(false);
        });
      }
    );

    return () => unsubscribe();
  }, [activeConversationId]);

  const handleSelectConversation = useCallback((conv: WhatsAppConversation) => {
    setActiveConversationId(conv.id);
    setTemporaryConversation(null);
    if (conv.unreadCount > 0) {
      whatsappService.markConversationAsRead(conv.id);
    }
  }, []);

  const handleSelectCustomerContact = useCallback(
    (customer: Customer) => {
      const norm = normalizePhoneNumber(customer.phone);
      if (!norm.isValid) {
        toast.error(`Customer "${customer.name}" does not have a valid phone number.`);
        return;
      }

      const digits = norm.digits;
      const existing = conversations.find((c) => c.id === digits || c.normalizedPhone === digits);

      if (existing) {
        setActiveConversationId(existing.id);
        setTemporaryConversation(null);
        if (existing.unreadCount > 0) {
          whatsappService.markConversationAsRead(existing.id);
        }
      } else {
        const newPlaceholder: WhatsAppConversation = {
          id: digits,
          phoneNumber: norm.display,
          normalizedPhone: digits,
          customerId: customer.id || null,
          customerName: customer.name,
          lastMessage: "No previous messages",
          lastMessageAt: new Date().toISOString(),
          lastMessageDirection: "OUTBOUND",
          lastInboundAt: null, // 24-hr window requires template
          unreadCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setTemporaryConversation(newPlaceholder);
        setActiveConversationId(digits);
      }
    },
    [conversations]
  );

  const handleStartNewConversation = useCallback(
    (rawPhone: string, name?: string) => {
      const normalized = normalizePhoneNumber(rawPhone);
      if (!normalized.isValid) {
        toast.error("Please enter a valid phone number (10-15 digits).");
        return;
      }

      const digits = normalized.digits;
      const existing = conversations.find((c) => c.id === digits || c.normalizedPhone === digits);

      if (existing) {
        setActiveConversationId(existing.id);
        setTemporaryConversation(null);
      } else {
        const newPlaceholder: WhatsAppConversation = {
          id: digits,
          phoneNumber: normalized.display,
          normalizedPhone: digits,
          customerName: name || "New WhatsApp Contact",
          lastMessage: "Conversation created",
          lastMessageAt: new Date().toISOString(),
          lastMessageDirection: "OUTBOUND",
          lastInboundAt: null,
          unreadCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setTemporaryConversation(newPlaceholder);
        setActiveConversationId(digits);
      }
    },
    [conversations]
  );

  const handleSendMessage = async (payload: {
    message?: string;
    type?: "text" | "template";
    templateName?: string;
    templateLanguage?: string;
    templateVariables?: Record<string, string>;
  }): Promise<boolean> => {
    if (!activeConversation) return false;

    try {
      const result = await whatsappService.sendInboxMessage({
        conversationId: activeConversation.id,
        phoneNumber: activeConversation.phoneNumber,
        ...payload,
      });

      if (!result.success) {
        toast.error(result.error || "Failed to deliver WhatsApp message.");
        return false;
      }

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error sending message";
      toast.error(msg);
      return false;
    }
  };

  return (
    <div
      className="w-full rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-sm flex overflow-hidden"
      style={{ height: "calc(100dvh - 310px)", minHeight: "480px" }}
    >
      {/* Column 1: Conversations & Contacts List */}
      <div className="w-80 md:w-88 shrink-0 h-full">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onSelectCustomerContact={handleSelectCustomerContact}
          onStartNewConversation={handleStartNewConversation}
          loading={loadingConversations}
        />
      </div>

      {/* Column 2: Active Chat Thread */}
      <div className="flex-1 h-full min-w-0">
        {activeConversation ? (
          <ChatThread
            conversation={activeConversation}
            messages={messages}
            loadingMessages={loadingMessages}
            whatsappEnabled={whatsappEnabled}
            onSendMessage={handleSendMessage}
            onToggleCustomerPanel={() => setShowCustomerPanel(!showCustomerPanel)}
            showCustomerPanel={showCustomerPanel}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#747A72] bg-[#FAF4E8]/10 space-y-3">
            <div className="grid size-16 place-items-center rounded-2xl bg-[#F7F7F4] text-[#CCD2C8]">
              <MessageSquare size={32} />
            </div>
            <div>
              <h3 className="font-serif text-base font-bold text-[#2F352F]">
                BLOW SALON WhatsApp Inbox
              </h3>
              <p className="text-xs max-w-sm mt-1 text-[#747A72]">
                Select a conversation on the left or search any client to send a message.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Column 3: Customer Details Panel */}
      {activeConversation && showCustomerPanel && (
        <div className="shrink-0 h-full hidden lg:block">
          <CustomerDetailsPanel
            conversation={activeConversation}
            onClose={() => setShowCustomerPanel(false)}
          />
        </div>
      )}
    </div>
  );
}
