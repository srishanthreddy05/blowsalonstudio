"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";

export interface StaffDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  isCreditSettle?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
}

export function StaffDropdown({
  value,
  onChange,
  options = [],
  disabled = false,
  isCreditSettle = false,
  placeholder = "Select Staff...",
  id,
  className = "",
}: StaffDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [dropdownPos, setDropdownPos] = useState({
    top: 0,
    left: 0,
    width: 180,
    openUp: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Build combined options list including System / Credit overrides
  const combinedOptions = useMemo(() => {
    const list: string[] = [];
    if (isCreditSettle || value === "System") {
      list.push("System");
    }
    if (isCreditSettle && value && value !== "System" && !options.includes(value)) {
      list.push(value);
    }
    for (const opt of options) {
      if (!list.includes(opt)) {
        list.push(opt);
      }
    }
    return list;
  }, [isCreditSettle, value, options]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return combinedOptions;
    return combinedOptions.filter((opt) => opt.toLowerCase().includes(q));
  }, [combinedOptions, searchQuery]);

  // Recalculate dropdown position whenever opening or scrolling
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      setIsOpen(false);
      return;
    }

    const dropdownHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    const width = Math.max(rect.width, 180);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = openUp ? rect.top - 4 : rect.bottom + 4;

    setDropdownPos({
      top,
      left,
      width,
      openUp,
    });
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setSearchQuery("");
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Reposition on window resize and scroll
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Focus search input when dropdown opens with search
  useEffect(() => {
    if (isOpen && combinedOptions.length > 6) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, combinedOptions.length]);

  const displayLabel = useMemo(() => {
    if (value) return value;
    if (combinedOptions.length === 0 && !isCreditSettle) {
      return "No Staff Available";
    }
    return placeholder;
  }, [value, combinedOptions.length, isCreditSettle, placeholder]);

  return (
    <div className={`relative w-full ${className}`}>
      {/* Hidden native select for accessibility and automated test compatibility */}
      <select
        id={id ? `${id}-native-select` : undefined}
        value={value || ""}
        disabled={disabled || isCreditSettle}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only pointer-events-none absolute h-0 w-0 opacity-0"
      >
        <option value="" disabled hidden={Boolean(value)}>
          {placeholder}
        </option>
        {combinedOptions.length === 0 && !isCreditSettle && (
          <option value="" disabled>
            No Staff Available
          </option>
        )}
        {combinedOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      {/* Primary Trigger Button */}
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled || isCreditSettle}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`h-9 w-full rounded-xl border px-2.5 outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] text-xs font-semibold flex items-center justify-between gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:bg-[#F7F7F4] disabled:text-[#747A72] disabled:border-[#E0E4DD] ${
          !value && !isCreditSettle
            ? "border-[#CCD2C8] bg-[#FFFFFF] text-[#747A72] hover:border-[#6F776D]"
            : "border-[#E0E4DD] bg-[#F7F7F4] text-[#292D29] hover:border-[#6F776D]"
        }`}
        title={displayLabel}
      >
        <span className="truncate text-left flex-1">{displayLabel}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-[#747A72] transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#292D29]" : ""
          }`}
        />
      </button>

      {/* Portaled Dropdown Menu */}
      {mounted && isOpen && typeof document !== "undefined" && createPortal(
        <>
          {/* Backdrop for click outside */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />

          {/* Floating Dropdown Panel */}
          <div
            ref={dropdownRef}
            role="listbox"
            aria-label="Staff selection"
            className="fixed z-[9999] rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col text-[#292D29]"
            style={{
              top: dropdownPos.openUp ? undefined : `${dropdownPos.top}px`,
              bottom: dropdownPos.openUp
                ? `${window.innerHeight - dropdownPos.top}px`
                : undefined,
              left: `${dropdownPos.left}px`,
              width: `${dropdownPos.width}px`,
            }}
          >
            {/* Optional search filter for long lists (> 6 staff) */}
            {combinedOptions.length > 6 && (
              <div className="p-1 mb-1 border-b border-[#E0E4DD]">
                <div className="relative flex items-center">
                  <Search
                    size={13}
                    className="absolute left-2.5 text-[#747A72] pointer-events-none"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search staff..."
                    className="h-7 w-full rounded-lg border border-[#E0E4DD] bg-[#F7F7F4] pl-7 pr-2 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:bg-[#FFFFFF]"
                  />
                </div>
              </div>
            )}

            {/* Scrollable Staff List with sensible max height */}
            <div className="max-h-56 overflow-y-auto space-y-0.5 overscroll-contain pr-0.5">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-center text-xs text-[#747A72] italic">
                  {combinedOptions.length === 0
                    ? "No Staff Available"
                    : `No match for "${searchQuery}"`}
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = value === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(option)}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition cursor-pointer ${
                        isSelected
                          ? "bg-[#E8ECE5] text-[#2F352F] font-bold"
                          : "text-[#292D29] hover:bg-[#F7F7F4] hover:text-[#5F7A62]"
                      }`}
                    >
                      <span className="truncate">{option}</span>
                      {isSelected && (
                        <Check size={14} className="text-[#5F7A62] shrink-0 ml-1.5" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
