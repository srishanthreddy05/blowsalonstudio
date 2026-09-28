export interface Customer {
  id?: string;
  name: string;
  phone: string;
  customerType: "regular" | "membership";
  createdAt?: string;
  membershipAmount?: number | null;
  membershipDuration?: number | null;
  membershipStart?: string | null;
  membershipEnd?: string | null;
  // WhatsApp Marketing & Communication Consent
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string | null;
  whatsappOptOut?: boolean;
  whatsappOptOutAt?: string | null;
}
