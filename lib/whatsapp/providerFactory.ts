import type { IWhatsAppProvider } from "./types";
import { QRWhatsAppProvider } from "./qrProvider";
import { CloudWhatsAppProvider, MetaCloudWhatsAppProvider } from "./cloudProvider";

let activeProvider: IWhatsAppProvider | null = null;

export function getWhatsAppProvider(): IWhatsAppProvider {
  if (activeProvider) {
    return activeProvider;
  }

  const providerType = (process.env.WHATSAPP_PROVIDER || "meta_cloud").toLowerCase().trim();

  if (providerType === "qr" || providerType === "qr_whatsapp") {
    activeProvider = new QRWhatsAppProvider();
  } else {
    // Default to Meta WhatsApp Cloud API Provider
    activeProvider = new CloudWhatsAppProvider();
  }

  return activeProvider;
}

export { MetaCloudWhatsAppProvider, CloudWhatsAppProvider, QRWhatsAppProvider };
