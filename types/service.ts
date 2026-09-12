export interface ServiceVariant {
  id?: string;
  name: string; // e.g., "Regular", "Small", "Medium", "Long", "1 Inch", "2 Inch"
  price: number;
  startingPrice?: number;
  priceLabel?: string; // e.g., "onwards", "up to neck", "per streak", "per finger"
  priceUnit?: string; // e.g., "per streak", "per finger"
}

export interface Service {
  id?: string;
  businessId: string;
  name: string;
  category: string;
  gender: "men" | "women" | "both";
  price: number;
  startingPrice?: number;
  priceLabel?: string; // e.g., "onwards", "up to neck", "per streak", "per finger"
  priceUnit?: string; // e.g., "per streak", "per finger"
  variants?: ServiceVariant[];
  duration?: number; // in minutes
  isActive?: boolean;
  isSystemService?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
