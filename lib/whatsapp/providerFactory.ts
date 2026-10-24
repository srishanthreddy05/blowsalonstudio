import type { IWhatsAppProvider } from "./types";
import { CloudWhatsAppProvider, MetaCloudWhatsAppProvider } from "./cloudProvider";

/**
 * Returns the WhatsApp provider for the current salon.
 * Always uses the Meta Cloud API provider backed by the Coexistence-connected account.
 * The provider lazily resolves its WABA and phone-number IDs from Firestore on first use.
 */
export function getWhatsAppProvider(): IWhatsAppProvider {
  return new CloudWhatsAppProvider();
}

export { MetaCloudWhatsAppProvider, CloudWhatsAppProvider };
