/**
 * Safe phone normalization utilities for WhatsApp messaging and customer records.
 */

export interface NormalizedPhone {
  raw: string;
  digits: string;
  e164: string; // e.g. "+919876543210"
  whatsappNumber: string; // e.g. "919876543210"
  whatsappJid: string; // e.g. "919876543210@s.whatsapp.net"
  display: string; // e.g. "+91 98765 43210"
  isValid: boolean;
}

export function normalizePhoneNumber(phoneInput?: string | null): NormalizedPhone {
  const raw = (phoneInput || "").trim();
  if (!raw) {
    return {
      raw: "",
      digits: "",
      e164: "",
      whatsappNumber: "",
      whatsappJid: "",
      display: "No Phone",
      isValid: false,
    };
  }

  // Extract only digits
  const digitsOnly = raw.replace(/\D/g, "");

  if (!digitsOnly) {
    return {
      raw,
      digits: "",
      e164: "",
      whatsappNumber: "",
      whatsappJid: "",
      display: raw,
      isValid: false,
    };
  }

  let finalDigits = digitsOnly;

  // Case 1: 10 digit Indian number (e.g. 9876543210)
  if (digitsOnly.length === 10) {
    finalDigits = `91${digitsOnly}`;
  }
  // Case 2: 11 digit starting with 0 (e.g. 09876543210)
  else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    finalDigits = `91${digitsOnly.slice(1)}`;
  }
  // Case 3: 12 digit starting with 91 (e.g. 919876543210)
  else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    finalDigits = digitsOnly;
  }
  // Case 4: International numbers with existing country codes (>= 10 digits)
  else if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    finalDigits = digitsOnly;
  }

  const isValid = finalDigits.length >= 10 && finalDigits.length <= 15;
  const e164 = `+${finalDigits}`;
  const whatsappNumber = finalDigits;
  const whatsappJid = `${finalDigits}@s.whatsapp.net`;

  // Pretty display format
  let display = e164;
  if (finalDigits.startsWith("91") && finalDigits.length === 12) {
    const mainPart = finalDigits.slice(2);
    display = `+91 ${mainPart.slice(0, 5)} ${mainPart.slice(5)}`;
  }

  return {
    raw,
    digits: finalDigits,
    e164,
    whatsappNumber,
    whatsappJid,
    display,
    isValid,
  };
}
