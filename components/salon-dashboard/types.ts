export type ServiceRow = {
  id: number;
  service: string;
  staff: string;
  price: number | "";
  quantity: number | "";
  discount: number | "";
  usedProductId?: string;
  usedProductName?: string;
  usedProductCost?: number;
  isCreditSettle?: boolean;
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
  productTotal: number;
  subtotal: number;
  billDiscount: number;
  lineDiscount?: number;
  offerDiscount: number; // discount contributed by the selected offer
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

export const formatCurrency = (value: number) => {
  try {
    return new Intl.NumberFormat(globalCurrencyConfig.locale, {
      style: "currency",
      currency: globalCurrencyConfig.code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch (e) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  }
};