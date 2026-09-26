export type ServiceRow = {
  id: number;
  serviceId?: string;
  service: string;
  category?: string;
  selectedVariant?: string;
  priceLabel?: string;
  priceUnit?: string;
  staff: string;
  price: number | "";
  quantity: number | "";
  discount: number | "";
  isCreditSettle?: boolean;
  isSystemService?: boolean;
};


export type ProductRow = {
  id: number;
  productId?: string;
  product: string;
  price: number | "";
  quantity: number | "";
  discount: number | "";
  isCreditSettle?: boolean;
};

export type BillTotals = {
  serviceTotal: number;
  serviceDiscount?: number;
  taxableServiceAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  productTotal: number;
  rawProductTotal?: number;
  membershipTotal?: number;
  subtotal: number;
  billDiscount: number;
  lineDiscount?: number;
  offerDiscount: number; // discount contributed by the selected offer
  eligibleServiceAmount?: number;
  totalDiscount?: number;
  gst: number;
  grandTotal: number;
};

export let globalCurrencyConfig = {
  locale: "en-IN",
  code: "INR"
};

export const setGlobalCurrencyConfig = (locale: string, code: string) => {
  globalCurrencyConfig.locale = locale;
  globalCurrencyConfig.code = code;
};

export const formatCurrency = (value: number | string | undefined | null) => {
  const num = typeof value === "number" ? value : Number(value) || 0;
  const rounded = Math.round(num);
  try {
    return new Intl.NumberFormat(globalCurrencyConfig.locale, {
      style: "currency",
      currency: globalCurrencyConfig.code,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(rounded);
  } catch {
    return `₹${rounded.toLocaleString("en-IN")}`;
  }
};