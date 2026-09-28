import type { IWhatsAppProvider } from "./types";
import { QRWhatsAppProvider } from "./qrProvider";
import { CloudWhatsAppProvider, MetaCloudWhatsAppProvider } from "./cloudProvider";

let activeQrProvider: IWhatsAppProvider | null = null;

export function getWhatsAppProvider(): IWhatsAppProvider {
  const providerType = (process.env.WHATSAPP_PROVIDER || "meta_cloud").toLowerCase().trim();

  if (providerType === "qr" || providerType === "qr_whatsapp") {
    if (!activeQrProvider) {
      activeQrProvider = new QRWhatsAppProvider();
    }
    return activeQrProvider;
  }

  // Meta WhatsApp Cloud API Provider
  return new CloudWhatsAppProvider();
}

export { MetaCloudWhatsAppProvider, CloudWhatsAppProvider, QRWhatsAppProvider };
