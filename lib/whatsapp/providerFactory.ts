import type { IWhatsAppProvider } from "./types";
import { QRWhatsAppProvider } from "./qrProvider";
import { CloudWhatsAppProvider } from "./cloudProvider";

let activeProvider: IWhatsAppProvider | null = null;

export function getWhatsAppProvider(): IWhatsAppProvider {
  if (activeProvider) {
    return activeProvider;
  }

  const providerType = (process.env.WHATSAPP_PROVIDER || "qr").toLowerCase();

  if (providerType === "cloud" || providerType === "whatsapp_cloud_api") {
    activeProvider = new CloudWhatsAppProvider();
  } else {
    activeProvider = new QRWhatsAppProvider();
  }

  return activeProvider;
}
