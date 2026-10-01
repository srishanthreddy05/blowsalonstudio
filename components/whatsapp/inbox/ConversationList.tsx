"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  MessageSquare,
  Plus,
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  User,
  Crown,
  X,
  Phone,
  ArrowRight,
  UserPlus,
} from "lucide-react";
import type { WhatsAppConversation, WhatsAppMessageStatus } from "@/types/whatsapp";
import type { Customer } from "@/types/customer";
import { searchCustomers, getRecentCustomers } from "@/services/customers";
import { formatDisplayDate } from "@/lib/utils/date";
import { normalizePhoneNumber } from "@/lib/utils/phone";

interface ConversationListProps {
  conversations: WhatsAppConversation[];
  customers?: Customer[];
  activeConversationId: string | null;
  onSelectConversation: (conversation: WhatsAppConversation) => void;
  onSelectCustomerContact: (customer: Customer) => void;
  onStartNewConversation: (phone: string, name?: string) => void;
  loading?: boolean;
}

function StatusIcon({ status }: { status?: WhatsAppMessageStatus }) {
  if (!status) return null;
  if (status === "READ") {
    return (
      <span title="Read by customer">
        <CheckCheck size={14} className="text-[#38503B] shrink-0" />
      </span>
    );
  }
  if (status === "DELIVERED") {
    return (
      <span title="Delivered to customer">
        <CheckCheck size={14} className="text-[#747A72] shrink-0" />
      </span>
    );
  }
  if (status === "SENT") {
    return (
      <span title="Sent from salon">
        <Check size={14} className="text-[#747A72] shrink-0" />
      </span>
    );
  }
  if (status === "SENDING" || status === "PENDING") {
    return (
      <span title="Sending...">
        <Clock size={13} className="text-[#B18A45] shrink-0 animate-spin" />
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span title="Delivery failed">
        <AlertTriangle size={13} className="text-[#B55B5B] shrink-0" />
      </span>
    );
  }
  return null;
}

function formatConversationTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return formatDisplayDate(isoString);
  } catch {
    return "";
  }
}

export function ConversationList({
  conversations,
  customers = [],
  activeConversationId,
  onSelectConversation,
  onSelectCustomerContact,
  onStartNewConversation,
  loading = false,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [modalCustomerSearch, setModalCustomerSearch] = useState("");
  const [showManualPhoneInput, setShowManualPhoneInput] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");

  // On-demand customer search states
  const [contactSearchResults, setContactSearchResults] = useState<Customer[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [modalCustomers, setModalCustomers] = useState<Customer[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Debounced search for sidebar search input
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setContactSearchResults([]);
      setIsSearchingContacts(false);
      return;
    }

    setIsSearchingContacts(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchCustomers(q, 20);
        setContactSearchResults(results);
      } catch (err) {
        console.error("Error searching customers:", err);
      } finally {
        setIsSearchingContacts(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load modal customers when modal opens or modal search query changes
  useEffect(() => {
    if (!newChatModalOpen) return;

    const q = modalCustomerSearch.trim();
    setModalLoading(true);

    const timer = setTimeout(async () => {
      try {
        if (!q) {
          const recent = await getRecentCustomers(20);
          setModalCustomers(recent);
        } else {
          const results = await searchCustomers(q, 20);
          setModalCustomers(results);
        }
      } catch (err) {
        console.error("Error loading modal customers:", err);
      } finally {
        setModalLoading(false);
      }
    }, q ? 250 : 0);

    return () => clearTimeout(timer);
  }, [newChatModalOpen, modalCustomerSearch]);

  // Map conversations for easy lookup by phone digits
  const conversationPhoneMap = useMemo(() => {
    const map = new Map<string, WhatsAppConversation>();
    conversations.forEach((c) => {
      if (c.normalizedPhone) map.set(c.normalizedPhone, c);
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [conversations]);

  // Combined Search Results
  const { matchedConversations, matchedContacts } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    if (!q) {
      const filtered = filterUnread
        ? conversations.filter((c) => (c.unreadCount || 0) > 0)
        : conversations;
      return { matchedConversations: filtered, matchedContacts: [] };
    }

    // 1. Filter existing conversations
    const convMatches = conversations.filter((conv) => {
      const matchName = conv.customerName?.toLowerCase().includes(q);
      const matchPhone =
        conv.phoneNumber?.toLowerCase().includes(q) ||
        conv.normalizedPhone?.includes(q);
      const matchMsg = conv.lastMessage?.toLowerCase().includes(q);

      const matches = matchName || matchPhone || matchMsg;
      return filterUnread ? matches && (conv.unreadCount || 0) > 0 : matches;
    });

    const existingConvCustomerIds = new Set(
      convMatches.map((c) => c.customerId).filter(Boolean)
    );
    const existingConvPhones = new Set(
      convMatches.map((c) => c.normalizedPhone).filter(Boolean)
    );

    // 2. Search existing BLOW SALON customers who don't already appear in convMatches
    const sourceContacts = contactSearchResults.length > 0 ? contactSearchResults : customers;
    const contactMatches = sourceContacts.filter((cust) => {
      if (!cust.name && !cust.phone) return false;

      const norm = normalizePhoneNumber(cust.phone);
      const matchName = cust.name?.toLowerCase().includes(q);
      const matchPhone =
        cust.phone?.toLowerCase().includes(q) ||
        (norm.isValid && norm.digits.includes(q));

      if (!matchName && !matchPhone) return false;

      // Exclude if already shown in conversation matches
      if (cust.id && existingConvCustomerIds.has(cust.id)) return false;
      if (norm.isValid && existingConvPhones.has(norm.digits)) return false;

      return true;
    });

    return {
      matchedConversations: convMatches,
      matchedContacts: filterUnread ? [] : contactMatches,
    };
  }, [conversations, contactSearchResults, customers, searchQuery, filterUnread]);

  // Modal customer list
  const displayedModalCustomers = useMemo(() => {
    if (modalCustomers.length > 0) return modalCustomers;
    if (customers.length > 0) {
      const q = modalCustomerSearch.toLowerCase().trim();
      if (!q) return customers.slice(0, 20);
      return customers
        .filter((cust) => {
          const norm = normalizePhoneNumber(cust.phone);
          return (
            cust.name?.toLowerCase().includes(q) ||
            cust.phone?.toLowerCase().includes(q) ||
            (norm.isValid && norm.digits.includes(q))
          );
        })
        .slice(0, 20);
    }
    return [];
  }, [modalCustomers, customers, modalCustomerSearch]);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  }, [conversations]);

  const handleManualPhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;
    onStartNewConversation(newPhone.trim(), newName.trim() || undefined);
    setNewPhone("");
    setNewName("");
    setShowManualPhoneInput(false);
    setNewChatModalOpen(false);
  };

  const handleSelectCustomerFromModal = (cust: Customer) => {
    onSelectCustomerContact(cust);
    setNewChatModalOpen(false);
    setModalCustomerSearch("");
  };

  return (
    <div className="flex flex-col h-full bg-[#FFFFFF] border-r border-[#E0E4DD]">
      {/* Header with Search and New Chat button */}
      <div className="p-3.5 border-b border-[#E0E4DD] space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-base font-bold text-[#2F352F]">Inbox</h2>
            {totalUnreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#5F7A62] text-white text-[11px] font-bold">
                {totalUnreadCount} unread
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setNewChatModalOpen(true);
              setShowManualPhoneInput(false);
              setModalCustomerSearch("");
            }}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            title="Start new conversation"
          >
            <Plus size={14} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-[#747A72]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers or conversations..."
            className="w-full h-9 pl-9 pr-8 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-xs text-[#2F352F] placeholder-[#747A72] focus:outline-none focus:border-[#5F7A62] transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-[#747A72] hover:text-[#2F352F]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterUnread(false)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              !filterUnread
                ? "bg-[#E8ECE5] text-[#2F352F] font-semibold"
                : "text-[#747A72] hover:bg-[#F7F7F4]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterUnread(true)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              filterUnread
                ? "bg-[#E8ECE5] text-[#2F352F] font-semibold"
                : "text-[#747A72] hover:bg-[#F7F7F4]"
            }`}
          >
            <span>Unread</span>
            {totalUnreadCount > 0 && (
              <span className="size-4 rounded-full bg-[#5F7A62] text-white text-[10px] grid place-items-center font-bold">
                {totalUnreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Conversations & Contacts List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E0E4DD]/60 [scrollbar-width:thin]">
        {loading && conversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#747A72]">
            <Clock size={20} className="mx-auto mb-2 text-[#747A72] animate-spin" />
            Loading conversations...
          </div>
        ) : matchedConversations.length === 0 && matchedContacts.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#747A72] space-y-2">
            <MessageSquare size={24} className="mx-auto text-[#CCD2C8]" />
            <p className="font-semibold text-[#2F352F]">
              {searchQuery || filterUnread ? "No results found" : "No WhatsApp messages yet"}
            </p>
            <p className="text-[11px]">
              {searchQuery
                ? `No customer or conversation matched "${searchQuery}". Click New Chat to start.`
                : "Incoming customer messages will appear here automatically."}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* 1. Existing Active Conversations Section */}
            {matchedConversations.length > 0 && (
              <div>
                {searchQuery && (
                  <p className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6F776D] bg-[#F7F7F4]">
                    Conversations ({matchedConversations.length})
                  </p>
                )}
                <div className="divide-y divide-[#E0E4DD]/40">
                  {matchedConversations.map((conv) => {
                    const isSelected = conv.id === activeConversationId;
                    const hasUnread = (conv.unreadCount || 0) > 0;

                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => onSelectConversation(conv)}
                        className={`w-full text-left p-3.5 flex items-start gap-3 transition cursor-pointer ${
                          isSelected
                            ? "bg-[#E8ECE5]/70 border-l-4 border-l-[#5F7A62]"
                            : "hover:bg-[#F7F7F4]"
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`size-10 rounded-full shrink-0 grid place-items-center font-bold text-xs uppercase ${
                            hasUnread
                              ? "bg-[#5F7A62] text-white"
                              : isSelected
                              ? "bg-[#2F352F] text-[#FAF4E8]"
                              : "bg-[#E8ECE5] text-[#2F352F]"
                          }`}
                        >
                          {(conv.customerName || "U").charAt(0)}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span
                              className={`text-xs truncate ${
                                hasUnread
                                  ? "font-bold text-[#2F352F]"
                                  : "font-semibold text-[#2F352F]"
                              }`}
                            >
                              {conv.customerName || conv.phoneNumber || "Customer"}
                            </span>
                            <span className="text-[10px] text-[#747A72] shrink-0 font-mono">
                              {formatConversationTime(conv.lastMessageAt)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 text-xs text-[#747A72]">
                              {conv.lastMessageDirection === "OUTBOUND" && (
                                <StatusIcon status={conv.lastMessageStatus} />
                              )}
                              <p
                                className={`truncate text-[11px] ${
                                  hasUnread ? "font-semibold text-[#2F352F]" : "text-[#747A72]"
                                }`}
                              >
                                {conv.lastMessage || "No messages"}
                              </p>
                            </div>

                            {hasUnread && (
                              <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#5F7A62] text-white text-[10px] font-bold grid place-items-center">
                                {conv.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Existing BLOW SALON Contacts Section (Search Results) */}
            {matchedContacts.length > 0 && (
              <div>
                <p className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6F776D] bg-[#F7F7F4] flex items-center justify-between">
                  <span>BLOW SALON Contacts ({matchedContacts.length})</span>
                  <span className="text-[9px] font-normal lowercase">click to start chat</span>
                </p>
                <div className="divide-y divide-[#E0E4DD]/40">
                  {matchedContacts.map((cust) => {
                    const norm = normalizePhoneNumber(cust.phone);
                    const isSelected = norm.digits === activeConversationId;
                    const isMembership = cust.customerType === "membership";

                    return (
                      <button
                        key={cust.id || cust.phone}
                        type="button"
                        onClick={() => onSelectCustomerContact(cust)}
                        className={`w-full text-left p-3.5 flex items-center justify-between gap-3 transition cursor-pointer ${
                          isSelected
                            ? "bg-[#E8ECE5]/70 border-l-4 border-l-[#5F7A62]"
                            : "hover:bg-[#F7F7F4]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-9 rounded-full bg-[#E8ECE5] text-[#2F352F] grid place-items-center font-bold text-xs uppercase shrink-0">
                            {(cust.name || "U").charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#2F352F] truncate">
                                {cust.name}
                              </span>
                              {isMembership && (
                                <Crown size={12} className="text-[#B18A45] shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-[#747A72] font-mono truncate">
                              {norm.display || cust.phone}
                            </p>
                          </div>
                        </div>

                        <span className="shrink-0 text-[11px] font-semibold text-[#5F7A62] flex items-center gap-1 hover:underline">
                          <span>Chat</span>
                          <ArrowRight size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Chat Modal with Customer Search */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/50 backdrop-blur-xs"
            onClick={() => setNewChatModalOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl z-10 animate-in zoom-in-95 duration-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-xl bg-[#E8ECE5] text-[#5F7A62]">
                  <MessageSquare size={16} />
                </div>
                <h3 className="font-serif text-base font-bold text-[#2F352F]">
                  Start WhatsApp Conversation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNewChatModalOpen(false)}
                className="text-[#747A72] hover:text-[#2F352F]"
              >
                <X size={16} />
              </button>
            </div>

            {!showManualPhoneInput ? (
              /* Search Existing Customers Mode (Default) */
              <div className="space-y-3 flex-1 flex flex-col min-h-0">
                <div className="relative shrink-0">
                  <Search size={14} className="absolute left-3 top-3 text-[#747A72]" />
                  <input
                    type="text"
                    autoFocus
                    value={modalCustomerSearch}
                    onChange={(e) => setModalCustomerSearch(e.target.value)}
                    placeholder="Search existing customer by name or phone..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-xs text-[#2F352F] placeholder-[#747A72] focus:outline-none focus:border-[#5F7A62]"
                  />
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[#E0E4DD]/60 border border-[#E0E4DD] rounded-2xl p-1 [scrollbar-width:thin]">
                  {modalLoading && displayedModalCustomers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#747A72]">
                      <Clock size={16} className="mx-auto mb-2 text-[#747A72] animate-spin" />
                      Loading customers...
                    </div>
                  ) : displayedModalCustomers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#747A72] space-y-1">
                      <p className="font-semibold text-[#2F352F]">No matching customer found</p>
                      <p className="text-[11px]">
                        You can enter an unlisted phone number below.
                      </p>
                    </div>
                  ) : (
                    displayedModalCustomers.map((cust) => {
                      const norm = normalizePhoneNumber(cust.phone);
                      const isMembership = cust.customerType === "membership";

                      return (
                        <button
                          key={cust.id || cust.phone}
                          type="button"
                          onClick={() => handleSelectCustomerFromModal(cust)}
                          className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-[#F7F7F4] rounded-xl transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-9 rounded-full bg-[#E8ECE5] text-[#2F352F] grid place-items-center font-bold text-xs shrink-0 uppercase">
                              {(cust.name || "U").charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-[#2F352F] truncate">
                                  {cust.name}
                                </span>
                                {isMembership && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-[#FAF4E8] text-[#B18A45] text-[10px] font-bold">
                                    Membership
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#747A72] font-mono">
                                {norm.display || cust.phone}
                              </p>
                            </div>
                          </div>

                          <span className="text-xs font-semibold text-[#5F7A62] shrink-0">
                            Open Chat →
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E0E4DD] shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowManualPhoneInput(true)}
                    className="font-semibold text-[#5F7A62] hover:underline flex items-center gap-1"
                  >
                    <UserPlus size={14} />
                    <span>Enter an unlisted phone number</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewChatModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[#CCD2C8] text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4]"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* Manual Phone Number Entry Mode */
              <form onSubmit={handleManualPhoneSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-[#6F776D] uppercase tracking-wider block mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    autoFocus
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="e.g. 9876543210 or +91 98765 43210"
                    className="w-full h-10 px-3 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-xs text-[#2F352F] focus:outline-none focus:border-[#5F7A62]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#6F776D] uppercase tracking-wider block mb-1">
                    Customer Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full h-10 px-3 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-xs text-[#2F352F] focus:outline-none focus:border-[#5F7A62]"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E0E4DD]">
                  <button
                    type="button"
                    onClick={() => setShowManualPhoneInput(false)}
                    className="text-xs font-semibold text-[#5F7A62] hover:underline"
                  >
                    ← Back to customer search
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNewChatModalOpen(false)}
                      className="px-4 py-2 rounded-xl border border-[#CCD2C8] text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-[#5F7A62] hover:bg-[#4E6450] text-white text-xs font-semibold shadow-xs"
                    >
                      Open Chat
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
