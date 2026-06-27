"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ActionButtons } from "@/components/salon-dashboard/action-buttons";
import { BillingTable } from "@/components/salon-dashboard/billing-table";
import { ProductTable } from "@/components/salon-dashboard/product-table";
import { SummaryCard } from "@/components/salon-dashboard/summary-card";
import type { ProductRow, ServiceRow } from "@/components/salon-dashboard/types";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { ClearableNumberInput } from "../ui/ClearableNumberInput";
import { X, UserX, AlertCircle, Wallet } from "lucide-react";
import { Timestamp } from "firebase/firestore";

import * as customerService from "@/services/customers";
import * as productsService from "@/services/products";
import * as invoicesService from "@/services/invoices";
import * as creditBalancesService from "@/services/creditBalances";
import * as advanceBalancesService from "@/services/advanceBalances";
import type { CreditBalance } from "@/types/creditBalance";
import { useAppData } from "@/context/AppDataContext";
import { toLocalDateString } from "@/lib/utils/date";
import { getServiceCommission } from "@/lib/utils/settlements";

import type { Customer } from "@/types/customer";
import type { Service } from "@/types/service";
import type { Product } from "@/types/product";
import type { Staff } from "@/types/staff";
import type { Offer } from "@/types/offer";

const GUEST_PHONE = "0000000000";
const GUEST_NAME = "Guest";

interface BillingTerminalProps {
  onClose?: () => void;
  onSuccess?: () => void;
  editInvoiceId?: string;
}

export function BillingTerminal({ onClose, onSuccess, editInvoiceId }: BillingTerminalProps) {
  const { services: servicesContextData, products: productsContextData, staff: staffContextData, offers: offersContextData, settings, refreshProducts, loadingAppData } = useAppData();

  const servicesList = servicesContextData;
  const productsList = productsContextData;
  const staffList = useMemo(() => staffContextData.filter((s) => s.status === "Active" && s.dutyStatus === "onDuty"), [staffContextData]);
  const offersList = offersContextData;
  const loading = loadingAppData;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Invoice Form Fields
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [clientStatus, setClientStatus] = useState<"regular" | "membership" | "new" | null>(null);
  const [foundCustomerId, setFoundCustomerId] = useState<string | null>(null);

  const [invoiceNumberDisplay, setInvoiceNumberDisplay] = useState("Auto-assigned on save");

  const [dateString, setDateString] = useState(toLocalDateString(new Date()));

  const [services, setServices] = useState<ServiceRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  const [cashAmount, setCashAmount] = useState<number | "">("");
  const [upiAmount, setUpiAmount] = useState<number | "">("");
  const [cardAmount, setCardAmount] = useState<number | "">("");
  const [isSplitEdited, setIsSplitEdited] = useState(false);

  // Credit customer tracking fields
  const [markAsCredit, setMarkAsCredit] = useState(false);
  const [allCustomerPendingCredits, setAllCustomerPendingCredits] = useState<CreditBalance[]>([]);
  const [collectedCredits, setCollectedCredits] = useState<string[]>([]);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Offer selection
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [manuallyDeselected, setManuallyDeselected] = useState(false);

  // Bill discount (service only)
  const [billDiscount, setBillDiscount] = useState<number>(0);
  const [billDiscountPercent, setBillDiscountPercent] = useState<number>(0);

  // Advance balance states
  const [amountPaid, setAmountPaid] = useState<number | "">(0);
  const [isAmountPaidEdited, setIsAmountPaidEdited] = useState(false);
  const [advanceToAdd, setAdvanceToAdd] = useState<number>(0);
  const [customerAdvance, setCustomerAdvance] = useState<any>(null);
  const [advanceApplied, setAdvanceApplied] = useState<number>(0);

  useEffect(() => {
    if (editInvoiceId) {
      const fetchInvoiceForEdit = async () => {
        setLoadingInvoice(true);
        try {
          const inv = await invoicesService.getById(editInvoiceId);
          if (inv) {
            setCustomerName(inv.customerName || "");
            setCustomerMobile(inv.customerPhone || "");
            setClientStatus(inv.customerType || null);
            setFoundCustomerId(inv.customerId || null);
            setInvoiceNumberDisplay(inv.invoiceNumber || "");
            
            setDateString(toLocalDateString(inv.date));

            // Populate services
            const mappedServices: ServiceRow[] = (inv.services || []).map((s: any, idx: number) => ({
              id: idx + 1,
              service: s.serviceName || s.service || "",
              staff: s.staffName || s.staff || "",
              price: s.price ?? 0,
              quantity: 1,
              discount: s.discount ?? 0,
              usedProductId: s.usedProductId || undefined,
              usedProductName: s.usedProductName || undefined,
              usedProductCost: s.usedProductCost || undefined,
            }));
            setServices(mappedServices);

            // Populate products
            const mappedProducts: ProductRow[] = (inv.products || []).map((p: any, idx: number) => ({
              id: idx + 1,
              productId: p.productId || "",
              product: p.productName || p.product || "",
              price: p.price ?? 0,
              quantity: p.quantity ?? 1,
              discount: p.discount ?? 0,
            }));
            setProducts(mappedProducts);

            // Populate payment split
            const payments = inv.paymentSplit || {};
            setCashAmount(payments.cash !== undefined ? payments.cash : "");
            setUpiAmount(payments.upi !== undefined ? payments.upi : "");
            setCardAmount(payments.card !== undefined ? payments.card : "");
            
            const isSplit = (payments.cash > 0 && (payments.upi > 0 || payments.card > 0)) || (payments.upi > 0 && payments.card > 0);
            setIsSplitEdited(isSplit || inv.paymentMethod === "Split");
            setIsAmountPaidEdited(true);

            if (inv.appliedOffer) {
              setSelectedOfferId(inv.appliedOffer.offerId || "");
            }
            setBillDiscount(inv.billDiscount || 0);
            setBillDiscountPercent(inv.billDiscountPercent || 0);
          }
        } catch (error) {
          console.error("Failed to fetch invoice for edit:", error);
          setMessage({ type: "error", text: "Failed to load invoice details." });
        } finally {
          setLoadingInvoice(false);
        }
      };
      fetchInvoiceForEdit();
    }
  }, [editInvoiceId]);

  // Customer lookup by phone
  useEffect(() => {
    setManuallyDeselected(false);
    let active = true;
    if (customerMobile.trim().length >= 10) {
      const check = async () => {
        try {
          const client = await customerService.getByPhone(customerMobile.trim());
          if (!active) return;
          if (client) {
            setClientStatus(client.customerType as "regular" | "membership");
            setFoundCustomerId(client.id ?? null);
            if (!customerName) setCustomerName(client.name);
          } else {
            setClientStatus("new");
            setFoundCustomerId(null);
          }
        } catch (err) {
          console.error("Phone lookup failed:", err);
        }
      };
      check();
    } else {
      setClientStatus(null);
      setFoundCustomerId(null);
    }
    return () => { active = false; };
  }, [customerMobile]);

  // Fetch pending credit balances and advance balances when customer is selected
  useEffect(() => {
    let active = true;
    if (foundCustomerId) {
      setLoadingCredits(true);
      const fetchCredits = async () => {
        try {
          const credits = await creditBalancesService.getPendingByCustomerId(foundCustomerId);
          if (active) {
            setAllCustomerPendingCredits(credits);
            setCollectedCredits([]); // Reset collected credits for new customer lookup
          }
        } catch (err) {
          console.error("Failed to fetch pending credits:", err);
        } finally {
          if (active) setLoadingCredits(false);
        }
      };
      fetchCredits();

      const fetchAdvance = async () => {
        try {
          const adv = await advanceBalancesService.getByCustomerId(foundCustomerId);
          if (active) {
            if (adv && adv.balance > 0) {
              setCustomerAdvance(adv);
            } else {
              setCustomerAdvance(null);
            }
            setAdvanceApplied(0); // Reset applied advance when customer changes
          }
        } catch (err) {
          console.error("Failed to fetch customer advance:", err);
        }
      };
      fetchAdvance();
    } else {
      setAllCustomerPendingCredits([]);
      setCollectedCredits([]);
      setCustomerAdvance(null);
      setAdvanceApplied(0);
    }
    return () => { active = false; };
  }, [foundCustomerId]);

  const pendingCreditsToShow = useMemo(() => {
    return allCustomerPendingCredits.filter((c) => !collectedCredits.includes(c.id || ""));
  }, [allCustomerPendingCredits, collectedCredits]);

  // Keep collectedCredits synced if the cashier deletes the Credit Settle row from either table
  useEffect(() => {
    const activeServiceCreditIds = services
      .filter((s: any) => s.isCreditSettle && s.creditBalanceId)
      .map((s: any) => s.creditBalanceId);

    const activeProductCreditIds = products
      .filter((p: any) => p.isCreditSettle && p.creditBalanceId)
      .map((p: any) => p.creditBalanceId);

    const activeCreditIds = [...activeServiceCreditIds, ...activeProductCreditIds];
    
    if (JSON.stringify(activeCreditIds) !== JSON.stringify(collectedCredits)) {
      setCollectedCredits(activeCreditIds);
    }
  }, [services, products, collectedCredits]);

  const handleCollectCredit = (credit: CreditBalance) => {
    const collectAmount = credit.remainingAmount !== undefined ? credit.remainingAmount : (credit.amount ?? 0);
    if (credit.type === "product") {
      setProducts((prev) => {
        const isAlreadyAdded = prev.some((p: any) => p.isCreditSettle && p.creditBalanceId === credit.id);
        if (isAlreadyAdded) return prev;

        const nextId = Math.max(0, ...prev.map((row) => row.id)) + 1;
        const newProductRow: ProductRow & { 
          creditBalanceId?: string;
          originalBillDate?: string;
          originalInvoiceNumber?: string;
        } = {
          id: nextId,
          productId: "",
          product: `Credit Settle (Inv #${credit.invoiceNumber})`,
          price: collectAmount,
          quantity: 1,
          discount: 0,
          isCreditSettle: true,
          creditBalanceId: credit.id,
          originalBillDate: credit.originalBillDate,
          originalInvoiceNumber: credit.originalInvoiceNumber,
        };
        return [...prev, newProductRow];
      });
    } else {
      setServices((prev) => {
        const isAlreadyAdded = prev.some((s: any) => s.isCreditSettle && s.creditBalanceId === credit.id);
        if (isAlreadyAdded) return prev;

        const nextId = Math.max(0, ...prev.map((row) => row.id)) + 1;
        const newServiceRow: ServiceRow & { 
          originalStaffId?: string; 
          originalStaffRole?: string; 
          creditBalanceId?: string;
          originalBillDate?: string;
          originalInvoiceNumber?: string;
        } = {
          id: nextId,
          service: `Credit Settle (Inv #${credit.invoiceNumber})`,
          staff: credit.originalStaffName || "System",
          price: collectAmount,
          quantity: 1,
          discount: 0,
          isCreditSettle: true,
          originalStaffId: credit.originalStaffId,
          originalStaffRole: credit.originalStaffRole,
          creditBalanceId: credit.id,
          originalBillDate: credit.originalBillDate,
          originalInvoiceNumber: credit.originalInvoiceNumber,
        };
        return [...prev, newServiceRow];
      });
    }

    setCollectedCredits((prev) => {
      if (prev.includes(credit.id!)) return prev;
      return [...prev, credit.id!];
    });
  };

  // Bill subtotal (services + products) before any offer discount
  const baseSubtotal = useMemo(() => {
    const serviceTotal = services.reduce((sum, s) => sum + Math.max(Number(s.price) || 0, 0), 0);
    const productTotal = products.reduce((sum, p) => sum + Math.max((Number(p.price) || 0) * (Number(p.quantity) || 1), 0), 0);
    return serviceTotal + productTotal;
  }, [services, products]);

  // Filter offers to those currently valid & eligible for this bill
  const eligibleOffers = useMemo(() => {
    return offersList.filter((offer) => {
      if (offer.status !== "Active") return false;

      // Validity dates: compare against the invoice date
      if (offer.startDate && dateString < offer.startDate) return false;
      if (offer.endDate && dateString > offer.endDate) return false;

      // Customer type check
      if (offer.customerType && offer.customerType !== "all") {
        const currentType = clientStatus || "regular";
        if (currentType !== offer.customerType) return false;
      }

      // Minimum bill amount check: if the offer is scoped, check against the subtotal of applicable items.
      // Otherwise, check against the entire subtotal.
      if (offer.minBillAmount) {
        const hasServiceScope = !!offer.applicableServiceIds?.length;
        const hasProductScope = !!offer.applicableProductIds?.length;
        const isScoped = hasServiceScope || hasProductScope;

        let eligibleSubtotal = baseSubtotal;
        if (isScoped) {
          eligibleSubtotal = 0;
          if (hasServiceScope) {
            eligibleSubtotal += services.reduce((sum, row) => {
              const matched = servicesList.find((s) => s.name === row.service);
              if (matched?.id && offer.applicableServiceIds!.includes(matched.id)) {
                return sum + Math.max(Number(row.price) || 0, 0);
              }
              return sum;
            }, 0);
          }
          if (hasProductScope) {
            eligibleSubtotal += products.reduce((sum, row) => {
              const matched = productsList.find((p) => p.id === row.productId || p.name === row.product);
              if (matched?.id && offer.applicableProductIds!.includes(matched.id)) {
                return sum + Math.max((Number(row.price) || 0) * (Number(row.quantity) || 1), 0);
              }
              return sum;
            }, 0);
          }
        }

        if (eligibleSubtotal < offer.minBillAmount) return false;
      }

      return true;
    });
  }, [offersList, dateString, baseSubtotal, services, products, servicesList, productsList]);

  // If the selected offer becomes ineligible, clear it
  useEffect(() => {
    if (selectedOfferId && !eligibleOffers.some((o) => o.id === selectedOfferId)) {
      setSelectedOfferId("");
    }
  }, [eligibleOffers, selectedOfferId]);

  // Auto-apply offer
  useEffect(() => {
    if (manuallyDeselected) return;
    if (eligibleOffers.length > 0) {
      if (!selectedOfferId) {
        setSelectedOfferId(eligibleOffers[0].id || "");
      }
    } else {
      setSelectedOfferId("");
    }
  }, [eligibleOffers, selectedOfferId, manuallyDeselected]);

  const selectedOffer = eligibleOffers.find((o) => o.id === selectedOfferId) || null;

  const totals = useMemo(() => {
    const serviceTotal = services.reduce((sum, s) => sum + Math.max(Number(s.price) || 0, 0), 0);
    const productTotal = products.reduce((sum, p) => sum + Math.max((Number(p.price) || 0) * (Number(p.quantity) || 1), 0), 0);
    
    // billDiscount applies ONLY to serviceTotal
    const discountedServiceTotal = Math.max(serviceTotal - billDiscount, 0);
    const subtotal = discountedServiceTotal + productTotal;

    const lineDiscount =
      services.reduce((sum, s) => sum + (Number(s.discount) || 0), 0) +
      products.reduce((sum, p) => sum + (Number(p.discount) || 0), 0);

    // Compute offer discount
    let offerDiscount = 0;
    if (selectedOffer) {
      const hasServiceScope = !!selectedOffer.applicableServiceIds?.length;
      const hasProductScope = !!selectedOffer.applicableProductIds?.length;
      const isScoped = hasServiceScope || hasProductScope;

      let offerBase = subtotal;
      if (isScoped) {
        offerBase = 0;
        if (hasServiceScope) {
          offerBase += services.reduce((sum, row) => {
            const matched = servicesList.find((s) => s.name === row.service);
            if (matched?.id && selectedOffer.applicableServiceIds!.includes(matched.id)) {
              return sum + Math.max(Number(row.price) || 0, 0);
            }
            return sum;
          }, 0);
        }
        if (hasProductScope) {
          offerBase += products.reduce((sum, row) => {
            const matched = productsList.find((p) => p.id === row.productId || p.name === row.product);
            if (matched?.id && selectedOffer.applicableProductIds!.includes(matched.id)) {
              return sum + Math.max((Number(row.price) || 0) * (Number(row.quantity) || 1), 0);
            }
            return sum;
          }, 0);
        }
      }

      if (selectedOffer.discountType === "percentage") {
        offerDiscount = (offerBase * selectedOffer.discountValue) / 100;
      } else {
        offerDiscount = Math.min(selectedOffer.discountValue, offerBase);
      }
    }

    const totalDiscount = lineDiscount + offerDiscount;
    const preTaxTotal = Math.max(subtotal - totalDiscount, 0);
    const gstAmount = Math.round(((preTaxTotal * (settings?.taxRate ?? 0)) / 100) * 100) / 100;
    const grandTotal = preTaxTotal + gstAmount;
    return {
      serviceTotal,
      productTotal,
      subtotal,
      totalDiscount: totalDiscount + billDiscount,
      billDiscount: billDiscount,
      lineDiscount: lineDiscount,
      offerDiscount,
      grandTotal,
      gst: gstAmount,
    };
  }, [services, products, selectedOffer, servicesList, productsList, billDiscount, settings]);

  // Cap bill discount if serviceTotal decreases below it
  useEffect(() => {
    const serviceTotal = services.reduce((sum, s) => sum + Math.max(Number(s.price) || 0, 0), 0);
    if (billDiscount > serviceTotal) {
      const newBillDiscount = Math.round(serviceTotal * 100) / 100;
      setBillDiscount(newBillDiscount);
      setBillDiscountPercent(serviceTotal > 0 ? 100 : 0);
    } else if (serviceTotal > 0 && billDiscount > 0) {
      const computedPercent = Math.round(((billDiscount / serviceTotal) * 100) * 100) / 100;
      setBillDiscountPercent(computedPercent);
    } else if (serviceTotal === 0) {
      setBillDiscount(0);
      setBillDiscountPercent(0);
    }
  }, [services, billDiscount]);

  const amountToCollect = Math.max(0, totals.grandTotal - advanceApplied);

  useEffect(() => {
    const amt = Number(amountPaid) || 0;
    if (!isSplitEdited && amt > 0) {
      setUpiAmount(amt);
      setCashAmount("");
      setCardAmount("");
    } else if (amt === 0) {
      setUpiAmount("");
      setCashAmount("");
      setCardAmount("");
    }
  }, [amountPaid, isSplitEdited]);

  const cashVal = cashAmount === "" ? 0 : Number(cashAmount);
  const upiVal = upiAmount === "" ? 0 : Number(upiAmount);
  const cardVal = cardAmount === "" ? 0 : Number(cardAmount);
  const totalPaid = cashVal + upiVal + cardVal;
  const paymentDiff = amountToCollect - totalPaid;
  const change = Math.max(0, (Number(amountPaid) || 0) - amountToCollect);
  
  // Reset advanceToAdd if change becomes 0
  useEffect(() => {
    if (change === 0) {
      setAdvanceToAdd(0);
    }
  }, [change]);

  // Keep amountPaid synced with amountToCollect by default
  useEffect(() => {
    if (!isAmountPaidEdited) {
      setAmountPaid(amountToCollect);
    }
  }, [amountToCollect, isAmountPaidEdited]);

  // Sync amountPaid with totalPaid if splits are edited and totalPaid exceeds amountToCollect
  useEffect(() => {
    const totalPaid = (cashAmount === "" ? 0 : Number(cashAmount)) + 
                      (upiAmount === "" ? 0 : Number(upiAmount)) + 
                      (cardAmount === "" ? 0 : Number(cardAmount));
    if (totalPaid > amountToCollect) {
      setAmountPaid(totalPaid);
      setIsAmountPaidEdited(true);
    }
  }, [cashAmount, upiAmount, cardAmount, amountToCollect]);

  // Keep advanceApplied capped by customerAdvance balance and grandTotal
  useEffect(() => {
    if (advanceApplied > 0 && customerAdvance) {
      const maxPossible = Math.min(customerAdvance.balance, totals.grandTotal);
      if (advanceApplied > maxPossible) {
        setAdvanceApplied(maxPossible);
      }
    }
  }, [totals.grandTotal, customerAdvance, advanceApplied]);

  const isPaymentValid = totals.grandTotal > 0 && (
    markAsCredit
      ? (totalPaid <= amountToCollect)
      : (totalPaid >= amountToCollect || Math.abs(paymentDiff) < 0.01)
  );

  // ESC Key Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // If onClose is provided, close the terminal
        if (onClose) {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, services, products, customerName, customerMobile, cashAmount, upiAmount, cardAmount, selectedOfferId]);

  const handleSaveBill = async () => {
    if (!customerName.trim() || !customerMobile.trim()) {
      setMessage({ type: "error", text: "Please enter customer name and mobile number." });
      return;
    }
    if (services.length === 0 && products.length === 0) {
      setMessage({ type: "error", text: "Please add at least one service or product." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

      // Step 1: Resolve or create customer
      let customerId = foundCustomerId;
      let resolvedCustomerType: "regular" | "membership" | "new" = 
        clientStatus ?? "new";

      const isGuestPhone = customerMobile.trim() === GUEST_PHONE;
      const isGuestName = customerName.trim() === GUEST_NAME || 
        customerName.trim() === "";

      if (isGuestPhone || isGuestName) {
        // Any combination where phone or name is guest
        // always resolves to the single shared Guest record
        const existingGuest = await customerService.getByPhone(GUEST_PHONE);
        if (existingGuest && existingGuest.id) {
          customerId = existingGuest.id;
        } else {
          customerId = await customerService.create({
            name: GUEST_NAME,
            phone: GUEST_PHONE,
            customerType: "regular",
          });
        }
        resolvedCustomerType = "regular";
      } else if (!customerId) {
        // Real customer — phone given, not found in DB yet
        customerId = await customerService.create({
          name: customerName.trim(),
          phone: customerMobile.trim(),
          customerType: "regular",
        });
        resolvedCustomerType = "regular";
      }

      if (!customerId) {
        throw new Error("Could not resolve customer ID");
      }

      // Step 2: Get a collision-safe invoice number via Firestore transaction (only for new invoices)
      let invoiceNumber = "Auto";
      if (!editInvoiceId) {
        if (!isOnline) {
          const now = new Date();
          const yy = String(now.getFullYear()).slice(-2);
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const dateStr = `${yy}${mm}${dd}`;
          const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          invoiceNumber = `EXP-${dateStr}-OFF-${rand}`;
        } else {
          try {
            invoiceNumber = await invoicesService.getNextInvoiceNumber(dateString);
          } catch (txErr: any) {
            console.warn("Failed to get invoice number via transaction, falling back to offline code:", txErr);
            const now = new Date();
            const yy = String(now.getFullYear()).slice(-2);
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const dateStr = `${yy}${mm}${dd}`;
            const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            invoiceNumber = `EXP-${dateStr}-OFF-${rand}`;
          }
        }
        setInvoiceNumberDisplay(invoiceNumber);
      } else {
        invoiceNumber = invoiceNumberDisplay;
      }

      // Step 3: Build correctly-shaped service and product rows
      // Revenue Integrity Rule: Deduct advanceToAdd from the split payments to ensure only invoice grandTotal is registered as revenue
      let remainingAdvanceDeduction = advanceToAdd;
      let savedCash = cashVal;
      let savedUpi = upiVal;
      let savedCard = cardVal;

      if (remainingAdvanceDeduction > 0) {
        if (savedCard >= remainingAdvanceDeduction) {
          savedCard -= remainingAdvanceDeduction;
          remainingAdvanceDeduction = 0;
        } else {
          remainingAdvanceDeduction -= savedCard;
          savedCard = 0;
        }

        if (remainingAdvanceDeduction > 0) {
          if (savedUpi >= remainingAdvanceDeduction) {
            savedUpi -= remainingAdvanceDeduction;
            remainingAdvanceDeduction = 0;
          } else {
            remainingAdvanceDeduction -= savedUpi;
            savedUpi = 0;
          }
        }

        if (remainingAdvanceDeduction > 0) {
          if (savedCash >= remainingAdvanceDeduction) {
            savedCash -= remainingAdvanceDeduction;
            remainingAdvanceDeduction = 0;
          } else {
            remainingAdvanceDeduction -= savedCash;
            savedCash = 0;
          }
        }
      }

      const invoicePaymentMethod = savedCash === amountToCollect && amountToCollect > 0
        ? "Cash" 
        : savedUpi === amountToCollect && amountToCollect > 0
          ? "UPI" 
          : savedCard === amountToCollect && amountToCollect > 0
            ? "Card" 
            : "Split";

      const rawNonCreditServiceTotal = services
        .filter((s) => !s.isCreditSettle)
        .reduce((sum, s) => sum + Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0), 0);
      
      const serviceBillDiscountFactor = rawNonCreditServiceTotal > 0 
        ? Math.max(rawNonCreditServiceTotal - billDiscount, 0) / rawNonCreditServiceTotal 
        : 1;

      const enrichedServices = services.map((row: any) => {
        const matchedService = servicesList.find((s) => s.name === row.service);
        const matchedStaff = staffContextData.find((s) => s.name === row.staff);
        let usedProductCost = 0;
        if (row.usedProductId) {
          const matchedProduct = productsList.find((p) => p.id === row.usedProductId);
          if (matchedProduct && typeof matchedProduct.costPerServing === "number") {
            usedProductCost = matchedProduct.costPerServing;
          }
        }
        const serviceBaseAmount = Math.max((Number(row.price) || 0) - (Number(row.discount) || 0), 0);
        const serviceAmount = row.isCreditSettle
          ? serviceBaseAmount
          : Math.round(serviceBaseAmount * serviceBillDiscountFactor * 100) / 100;
        
        // Use original staff metadata if it's a credit settlement row
        const staffId = row.isCreditSettle ? (row.originalStaffId || matchedStaff?.id || "system") : (matchedStaff?.id ?? "");
        const staffRole = row.isCreditSettle 
          ? (row.originalStaffRole || (row.staff === "System" ? "Owner" : (matchedStaff?.role || "Stylist")))
          : (row.staff === "System" ? "Owner" : (matchedStaff?.role || "Stylist"));
          
        const commissionRate = matchedStaff ? (matchedStaff.commissionRate ?? 50) : 50;
        const isOwner = matchedStaff ? (matchedStaff.isOwner === true) : (row.staff === "System" || staffRole === "Owner");
        const isSystemService = matchedService ? (matchedService.isSystemService === true || matchedService.id === "membership_fee") : (row.service === "Membership Fee");

        const commissionResult = getServiceCommission(
          {
            price: Number(row.price) || 0,
            discount: Number(row.discount) || 0,
            amount: serviceAmount,
            usedProductCost,
            commissionRate,
            isOwner,
            isSystemService,
            isCreditSettle: row.isCreditSettle || false,
            serviceId: matchedService?.id ?? "",
          },
          null
        );

        const stylistShare = commissionResult.stylistShare;
        const ownerShare = commissionResult.ownerShare;

        return {
          serviceId: matchedService?.id ?? "",
          serviceName: row.service,
          staffId,
          staffName: row.staff,
          price: Number(row.price) || 0,
          discount: Number(row.discount) || 0,
          amount: serviceAmount,
          usedProductId: row.usedProductId ?? null,
          usedProductName: row.usedProductName ?? null,
          usedProductCost,
          staffRole,
          stylistShare,
          ownerShare,
          commissionRate,
          isOwner,
          isSystemService,
          isCreditSettle: row.isCreditSettle || false,
          creditBalanceId: row.creditBalanceId ?? null,
          originalBillDate: row.originalBillDate ?? null,
          originalInvoiceNumber: row.originalInvoiceNumber ?? null,
          collectionDate: dateString,
          collectionMethod: row.isCreditSettle ? invoicePaymentMethod : null,
          collectedBy: row.isCreditSettle ? "System" : null,
        };
      });

      const enrichedProducts = products.map((row: any) => {
        return {
          productId: row.productId || "",
          productName: row.product,
          quantity: Number(row.quantity) || 1,
          price: Number(row.price) || 0,
          discount: Number(row.discount) || 0,
          amount: Math.max((Number(row.price) || 0) * (Number(row.quantity) || 1) - (Number(row.discount) || 0), 0),
          isCreditSettle: row.isCreditSettle || false,
          creditBalanceId: row.creditBalanceId ?? null,
          originalBillDate: row.originalBillDate ?? null,
          originalInvoiceNumber: row.originalInvoiceNumber ?? null,
          collectionDate: dateString,
          collectionMethod: row.isCreditSettle ? invoicePaymentMethod : null,
          collectedBy: row.isCreditSettle ? "System" : null,
        };
      });

      // Step 4: Save or Update invoice
      let savedInvoiceId = "";
      if (editInvoiceId) {
        const now = new Date();
        const selectedDate = new Date(dateString);
        selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        const invoiceDate = Timestamp.fromDate(selectedDate);
        const dateTs = Timestamp.fromDate(new Date(dateString));

        const yyyy = selectedDate.getFullYear();
        const mmStr = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const ddStr = String(selectedDate.getDate()).padStart(2, '0');
        const dateKey = `${yyyy}-${mmStr}-${ddStr}`;

        const invoicePaymentStatus = markAsCredit
          ? ((totalPaid + advanceApplied) === 0 ? "unpaid" : "partial")
          : "paid";

        await invoicesService.update(editInvoiceId, {
          customerId,
          customerName: customerName.trim(),
          customerPhone: customerMobile.trim(),
          customerType: resolvedCustomerType,
          date: dateTs,
          invoiceDate,
          dateKey,

          services: enrichedServices as any,
          products: enrichedProducts as any,

          totalServices: totals.serviceTotal - billDiscount,
          totalProducts: totals.productTotal,
          subtotal: totals.subtotal,
          totalDiscount: totals.totalDiscount,
          billDiscount: billDiscount,
          billDiscountPercent: billDiscountPercent,
          grandTotal: totals.grandTotal,

          appliedOffer: selectedOffer
            ? {
                offerId: selectedOffer.id ?? "",
                code: selectedOffer.code,
                name: selectedOffer.name,
                discountType: selectedOffer.discountType,
                discountValue: selectedOffer.discountValue,
                discountAmount: totals.offerDiscount,
              }
            : null as any,

          advanceAdded: advanceToAdd,
          advanceUsed: advanceApplied,
          paymentSplit: {
            cash: savedCash,
            upi: savedUpi,
            card: savedCard,
          },
          paymentMethod: invoicePaymentMethod,
          paymentStatus: invoicePaymentStatus,
        });
      } else {
        const invoicePaymentStatus = markAsCredit
          ? ((totalPaid + advanceApplied) === 0 ? "unpaid" : "partial")
          : "paid";

        savedInvoiceId = await invoicesService.create({
          invoiceNumber,
          dateString,

          customerId,
          customerName: customerName.trim(),
          customerPhone: customerMobile.trim(),
          customerType: resolvedCustomerType,

          services: enrichedServices as any,
          products: enrichedProducts as any,

          totalServices: totals.serviceTotal - billDiscount,
          totalProducts: totals.productTotal,
          subtotal: totals.subtotal,
          totalDiscount: totals.totalDiscount,
          billDiscount: billDiscount,
          billDiscountPercent: billDiscountPercent,
          grandTotal: totals.grandTotal,

          ...(selectedOffer
            ? {
              appliedOffer: {
                offerId: selectedOffer.id ?? "",
                code: selectedOffer.code,
                name: selectedOffer.name,
                discountType: selectedOffer.discountType,
                discountValue: selectedOffer.discountValue,
                discountAmount: totals.offerDiscount,
              },
            }
            : {}),

          advanceAdded: advanceToAdd,
          advanceUsed: advanceApplied,
          paymentSplit: {
            cash: savedCash,
            upi: savedUpi,
            card: savedCard,
          },
          paymentMethod: invoicePaymentMethod,
          paymentStatus: invoicePaymentStatus,
        });
      }

      const invId = savedInvoiceId || editInvoiceId || "";
      if (advanceToAdd > 0) {
        await advanceBalancesService.addCredit(customerId, customerName, customerMobile, advanceToAdd, invId);
      }
      if (advanceApplied > 0) {
        await advanceBalancesService.deductBalance(customerId, advanceApplied, invId);
      }

      // Step 5: Save or update credit balance in DB (split proportionally by services vs products at item level)
      if (markAsCredit) {
        const creditAmount = totals.grandTotal - totalPaid;
        if (creditAmount > 0) {
          const discountFactor = totals.subtotal > 0 ? totals.grandTotal / totals.subtotal : 1;
          const paidRatio = totals.grandTotal > 0 ? totalPaid / totals.grandTotal : 0;
          const invNum = invoiceNumberDisplay === "Auto-assigned on save" ? invoiceNumber : invoiceNumberDisplay;
          const invId = savedInvoiceId || editInvoiceId || "";
          
          // Allocate service-level credits and associate original stylists
          for (const s of enrichedServices) {
            const serviceFinalAmount = s.amount * discountFactor;
            const serviceCredit = Math.max(0, serviceFinalAmount * (1 - paidRatio));
            const roundedServiceCredit = Math.round(serviceCredit * 100) / 100;
            
            if (roundedServiceCredit > 0) {
              await creditBalancesService.create({
                customerId,
                customerName: customerName.trim(),
                customerPhone: customerMobile.trim(),
                originalInvoiceId: invId,
                originalInvoiceNumber: invNum,
                originalBillDate: dateString,
                originalStaffId: s.staffId || "system",
                originalStaffName: s.staffName || "System",
                originalStaffRole: s.staffRole || "Owner",
                originalServiceId: s.serviceId || "",
                originalServiceName: s.serviceName || "",
                originalServiceAmount: serviceFinalAmount,
                originalServiceCommission: s.stylistShare,
                creditAmount: roundedServiceCredit,
                remainingAmount: roundedServiceCredit,
                collectionStatus: "pending",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                // compatibility fields
                invoiceId: invId,
                invoiceNumber: invNum,
                amount: roundedServiceCredit,
                type: "service"
              });
            }
          }

          // Allocate product-level credits
          for (const p of enrichedProducts) {
            const productFinalAmount = p.amount * discountFactor;
            const productCredit = Math.max(0, productFinalAmount * (1 - paidRatio));
            const roundedProductCredit = Math.round(productCredit * 100) / 100;
            
            if (roundedProductCredit > 0) {
              await creditBalancesService.create({
                customerId,
                customerName: customerName.trim(),
                customerPhone: customerMobile.trim(),
                originalInvoiceId: invId,
                originalInvoiceNumber: invNum,
                originalBillDate: dateString,
                originalStaffId: "system",
                originalStaffName: "System",
                originalStaffRole: "Owner",
                originalServiceId: p.productId || "",
                originalServiceName: p.productName || "",
                originalServiceAmount: productFinalAmount,
                originalServiceCommission: 0,
                creditAmount: roundedProductCredit,
                remainingAmount: roundedProductCredit,
                collectionStatus: "pending",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                // compatibility fields
                invoiceId: invId,
                invoiceNumber: invNum,
                amount: roundedProductCredit,
                type: "product"
              });
            }
          }
        }
      }

      // Settle any previously collected outstanding credits
      if (collectedCredits.length > 0) {
        const creditSettlesMap: Record<string, number> = {};
        enrichedServices.forEach((s: any) => {
          if (s.isCreditSettle && s.creditBalanceId) {
            creditSettlesMap[s.creditBalanceId] = (creditSettlesMap[s.creditBalanceId] || 0) + s.amount;
          }
        });
        enrichedProducts.forEach((p: any) => {
          if (p.isCreditSettle && p.creditBalanceId) {
            creditSettlesMap[p.creditBalanceId] = (creditSettlesMap[p.creditBalanceId] || 0) + p.amount;
          }
        });

        for (const [creditId, collectedAmount] of Object.entries(creditSettlesMap)) {
          await creditBalancesService.settle(creditId, collectedAmount);
        }
      }

      await refreshProducts();

      const msgNum = editInvoiceId ? invoiceNumberDisplay : invoiceNumber;
      if (isOnline) {
        setMessage({ type: "success", text: `Invoice ${msgNum} saved successfully!` });
      } else {
        setMessage({ type: "success", text: `Invoice ${msgNum} saved locally — will sync when online!` });
      }

      let successMsg = isOnline 
        ? `Invoice ${msgNum} saved successfully!`
        : `Invoice ${msgNum} saved locally — will sync when online!`;

      if (advanceApplied > 0 && customerAdvance) {
        const newAdvanceBalance = Math.round((customerAdvance.balance - advanceApplied) * 100) / 100;
        if (newAdvanceBalance > 0) {
          successMsg += ` Advance remaining for ${customerName.trim()}: ₹${newAdvanceBalance}`;
        } else if (amountToCollect === 0) {
          successMsg += ` Bill fully covered by advance.`;
        }
      }
      setMessage({ type: "success", text: successMsg });
      setSaved(true);

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, isOnline ? 0 : 2000);
      }
    } catch (error: any) {
      console.error("Failed to save bill:", error);
      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
      if (error?.code === "unavailable" || error?.message?.includes("unavailable") || !isOnline) {
        // Local persistent cache handles offline writes, let cashier proceed
        setMessage({ type: "success", text: `Saved locally — will sync when online!` });
        setSaved(true);
        await refreshProducts();
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 2000);
        }
      } else {
        setMessage({ type: "error", text: error?.message || "Failed to submit invoice. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setMarkAsCredit(false);
    setAllCustomerPendingCredits([]);
    setCollectedCredits([]);
    setServices([]);
    setProducts([]);
    setCustomerName("");
    setCustomerMobile("");
    setClientStatus(null);
    setFoundCustomerId(null);
    setMessage(null);
    setSaved(false);
    setCashAmount("");
    setUpiAmount("");
    setCardAmount("");
    setIsSplitEdited(false);
    setInvoiceNumberDisplay("Auto-assigned on save");
    setSelectedOfferId("");
    setBillDiscount(0);
    setBillDiscountPercent(0);
    setAmountPaid(0);
    setIsAmountPaidEdited(false);
    setAdvanceToAdd(0);
    setCustomerAdvance(null);
    setAdvanceApplied(0);

    if (onClose) {
      onClose();
    }
  };

  const handleWhatsApp = () => {
    if (!customerMobile.trim()) {
      alert("Please enter a customer mobile number first.");
      return;
    }

    const formattedServices = services
      .map((s) => `• ${s.service} - ₹${(Number(s.price) || 0) - (Number(s.discount) || 0)}`)
      .join("\n");
    const formattedProducts = products
      .map((p) => {
        const qty = Number(p.quantity) || 1;
        const price = Number(p.price) || 0;
        const discount = Number(p.discount) || 0;
        return `• ${p.product} (x${qty}) - ₹${price * qty - discount}`;
      })
      .join("\n");

    const greeting = `Hello ${customerName},\n\nThank you for choosing Demo Salon ✨\n\n`;

    let itemsText = "";
    if (formattedServices) {
      itemsText += `Services:\n${formattedServices}\n\n`;
    }
    if (formattedProducts) {
      itemsText += `Products:\n${formattedProducts}\n\n`;
    }

    const grandTotal = totals.grandTotal;
    const discountAmount = totals.totalDiscount;
    const offerDiscount = totals.offerDiscount;
    const billDiscountVal = totals.billDiscount;
    const lineDiscountVal = totals.lineDiscount || 0;
    const subtotal = totals.subtotal;

    const hasDiscountOrOffer = discountAmount > 0;

    let pricingText = "";
    if (hasDiscountOrOffer) {
      pricingText += `Subtotal: ₹${subtotal}\n`;
      if (lineDiscountVal > 0) {
        pricingText += `Item Discount: -₹${lineDiscountVal}\n`;
      }
      if (billDiscountVal > 0) {
        pricingText += `Bill Discount: -₹${billDiscountVal}\n`;
      }
      if (selectedOffer && offerDiscount > 0) {
        pricingText += `Offer Applied: ${selectedOffer.code} (-₹${offerDiscount})\n`;
      }
    }
    pricingText += `Total Amount: ₹${grandTotal}\n\n`;

    const closing =
      `Invoice No: ${invoiceNumberDisplay}\n` +
      `We look forward to serving you again.\n\n` +
      `Demo Salon`;

    const msg = `${greeting}${itemsText}${pricingText}${closing}`;

    const digits = customerMobile.trim().replace(/\D/g, "");
    const e164 = digits.startsWith("91") && digits.length === 12 ? digits : `91${digits}`;
    window.open(`https://wa.me/${e164}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const mappedServicesList = servicesList.map((s) => ({
    name: s.name,
    price: s.price,
    category: s.category || "General",
  }));

  const mappedProductsList = productsList
    .filter((p) => !p.type || p.type === "retail")
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
    }));

  const serviceProductOptions = useMemo(() => {
    return productsList
      .filter((p) => p.type === "service")
      .map((p) => ({
        id: p.id || "",
        name: p.name,
        noOfServings: p.noOfServings || 0,
      }));
  }, [productsList]);

  const staffOptions = staffList.map((s) => s.name);

  if (loading || loadingInvoice) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-black border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F5F0E8]">
            {editInvoiceId ? `Edit Invoice (${invoiceNumberDisplay})` : "New Billing"}
          </h1>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-[#2E2B24] bg-[#131210] p-2.5 text-[#A89F8C] hover:text-[#B8962E] hover:border-[#B8962E] hover:-translate-y-0.5 transition shadow-sm cursor-pointer"
            title="Close Terminal (ESC)"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {message && (
        <div
          className={`mb-5 rounded-2xl border p-4 text-sm max-w-4xl font-medium ${message.type === "success"
            ? "border-[#4A3A10] bg-[#2A2310] text-[#D4A935]"
            : "border-red-900 bg-red-950/20 text-[#E57373]"
            }`}
        >
          {message.text}
        </div>
      )}

      {dateString !== toLocalDateString(new Date()) && (
        <div className="mb-5 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm font-semibold text-[#D4A935] flex items-center gap-2 max-w-4xl">
          <AlertCircle size={16} />
          <span>You are adding/editing a bill for {dateString}. This will not affect today's records.</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        <section className="rounded-2xl border border-[#2E2B24] bg-[#131210] p-4 shadow-md sm:p-5 text-[#A89F8C]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Invoice Number</span>
              <input
                readOnly
                type="text"
                value={invoiceNumberDisplay}
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#131210] px-4 text-sm text-[#6B6358] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Date</span>
              <input
                type="date"
                value={dateString}
                disabled={saved}
                max={toLocalDateString(new Date())}
                onChange={(e) => setDateString(e.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E] focus:ring-1 focus:ring-[#B8962E] disabled:bg-stone-900 disabled:text-[#6B6358]"
              />
            </label>

            <div className="block">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#A89F8C]">Customer Mobile</span>
                <button
                  type="button"
                  disabled={saved}
                  title="Customer didn't share number — use guest number"
                  onClick={() => setCustomerMobile(GUEST_PHONE)}
                  className="flex items-center gap-1 rounded-lg border border-[#2E2B24] bg-[#131210] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A89F8C] hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1F1A0F] transition disabled:opacity-50 disabled:pointer-events-none"
                >
                  <UserX size={11} />
                  Guest #
                </button>
              </div>
              <input
                required
                type="text"
                value={customerMobile}
                disabled={saved}
                onChange={(e) => setCustomerMobile(e.target.value)}
                placeholder="Type phone number..."
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E] focus:ring-1 focus:ring-[#B8962E] placeholder-[#6B6358] disabled:bg-stone-900 disabled:text-[#6B6358]"
              />
              {clientStatus && (
                <div className="mt-2 flex justify-start">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-[10px] font-bold tracking-wide uppercase border ${clientStatus === "membership"
                      ? "bg-[#2A2310] text-[#D4A935] border-[#4A3A10]"
                      : clientStatus === "regular"
                        ? "bg-[#1C1A16] text-[#A89F8C] border-[#2E2B24]"
                        : "bg-[#1A1C2A] text-[#818CF8] border-[#2E3154] animate-pulse"
                      }`}
                  >
                    {clientStatus === "membership"
                      ? "Membership Customer"
                      : clientStatus === "regular"
                        ? "Regular Customer"
                        : "New Customer"}
                  </span>
                </div>
              )}
            </div>

            <div className="block">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#A89F8C]">Customer Name</span>
                <button
                  type="button"
                  disabled={saved}
                  title="Customer didn't share name — use guest name"
                  onClick={() => setCustomerName(GUEST_NAME)}
                  className="flex items-center gap-1 rounded-lg border border-[#2E2B24] bg-[#131210] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A89F8C] hover:border-[#B8962E] hover:text-[#B8962E] hover:bg-[#1F1A0F] transition disabled:opacity-50 disabled:pointer-events-none"
                >
                  <UserX size={11} />
                  Guest Name
                </button>
              </div>
              <input
                required
                type="text"
                value={customerName}
                disabled={saved}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name..."
                className="mt-2 h-12 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E] focus:ring-1 focus:ring-[#B8962E] placeholder-[#6B6358] disabled:bg-stone-900 disabled:text-[#6B6358]"
              />
            </div>
          </div>

          {/* Customer Advance Balance Banner */}
          {customerAdvance && customerAdvance.balance > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-900 bg-emerald-950/20 p-4 text-sm text-emerald-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-emerald-400">
                <Wallet size={16} />
                <span>💰 Advance Balance Available: {formatCurrency(customerAdvance.balance)}</span>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2 pl-6">
                <span>
                  This customer has a positive advance balance of <b>{formatCurrency(customerAdvance.balance)}</b>.
                </span>
                {advanceApplied > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950 px-3 text-xs font-bold text-emerald-400">
                      Applied: {formatCurrency(advanceApplied)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAdvanceApplied(0)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-stone-850 border border-stone-705 px-3 text-xs font-bold text-stone-300 hover:bg-stone-800 hover:text-white transition cursor-pointer shadow-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const applied = Math.min(customerAdvance.balance, totals.grandTotal);
                      setAdvanceApplied(applied);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500 transition cursor-pointer shadow-sm"
                  >
                    Apply Advance to this Bill
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Outstanding Credit Warning Banner */}
          {!loadingCredits && pendingCreditsToShow.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-[#D4A935] space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-500">
                <AlertCircle size={16} />
                <span>Outstanding Credit Warning</span>
              </div>
              <div className="space-y-1.5 pl-6">
                {pendingCreditsToShow.length === 1 ? (
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span>
                      Customer has outstanding credit of <b>{formatCurrency(pendingCreditsToShow[0].remainingAmount !== undefined ? pendingCreditsToShow[0].remainingAmount : (pendingCreditsToShow[0].amount ?? 0))}</b> since{" "}
                      <b>{new Date(pendingCreditsToShow[0].createdAt).toLocaleDateString()}</b> — Invoice #{pendingCreditsToShow[0].invoiceNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCollectCredit(pendingCreditsToShow[0])}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#B8962E] px-3 text-xs font-bold text-[#0E0D0B] hover:bg-[#D4A935] transition cursor-pointer shadow-sm"
                    >
                      <Wallet size={12} />
                      Collect Now
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between flex-wrap gap-2 font-semibold">
                      <span>
                        Total Outstanding Credit: <b>{formatCurrency(pendingCreditsToShow.reduce((sum, c) => sum + (c.remainingAmount !== undefined ? c.remainingAmount : (c.amount ?? 0)), 0))}</b> ({pendingCreditsToShow.length} invoices)
                      </span>
                      <button
                        type="button"
                        onClick={() => pendingCreditsToShow.forEach(handleCollectCredit)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#B8962E] px-3 text-xs font-bold text-[#0E0D0B] hover:bg-[#D4A935] transition cursor-pointer shadow-sm animate-pulse"
                      >
                        <Wallet size={12} />
                        Collect All ({formatCurrency(pendingCreditsToShow.reduce((sum, c) => sum + (c.remainingAmount !== undefined ? c.remainingAmount : (c.amount ?? 0)), 0))})
                      </button>
                    </div>
                    <ul className="mt-2 space-y-1.5 border-t border-amber-900/20 pt-2 text-xs text-stone-400">
                      {pendingCreditsToShow.map((credit) => (
                        <li key={credit.id} className="flex items-center justify-between">
                          <span>
                            • {formatCurrency(credit.remainingAmount !== undefined ? credit.remainingAmount : (credit.amount ?? 0))} since {new Date(credit.createdAt).toLocaleDateString()} — {credit.invoiceNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCollectCredit(credit)}
                            className="text-[10px] font-bold text-[#B8962E] hover:text-[#D4A935] underline cursor-pointer"
                          >
                            Collect
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          <BillingTable
            rows={services}
            onRowsChange={setServices}
            serviceOptions={mappedServicesList}
            staffOptions={staffOptions}
            serviceProductOptions={serviceProductOptions}
            disabled={saved}
          />

          <ProductTable
            rows={products}
            onRowsChange={setProducts}
            productOptions={mappedProductsList}
            disabled={saved}
          />

          <div className="grid gap-5 md:grid-cols-2 mt-6 pt-6 border-t border-[#2E2B24]">
            {/* Offers Selector */}
            <section className="rounded-2xl border border-[#2E2B24] bg-[#131210] p-5 shadow-sm text-[#A89F8C] flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#F5F0E8] mb-3">Apply Offer</h2>
                {offersList.length === 0 ? (
                  <p className="text-sm text-[#6B6358]">No offers have been created yet.</p>
                ) : eligibleOffers.length === 0 ? (
                  <p className="text-sm text-[#6B6358]">
                    No active offers are eligible for this bill right now.
                  </p>
                ) : (
                  <select
                    value={selectedOfferId}
                    disabled={saved}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedOfferId(val);
                      if (val === "") {
                        setManuallyDeselected(true);
                      } else {
                        setManuallyDeselected(false);
                      }
                    }}
                    className="h-11 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-3 text-sm text-[#F5F0E8] outline-none transition focus:border-[#B8962E] focus:ring-1 focus:ring-[#B8962E] disabled:bg-stone-900 disabled:text-[#6B6358]"
                  >
                    <option value="">No offer applied</option>
                    {eligibleOffers.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offer.code} — {offer.name} (
                        {offer.discountType === "percentage"
                          ? `${offer.discountValue}% off`
                          : `${formatCurrency(offer.discountValue)} off`}
                        )
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedOffer && (
                <p className="mt-3 text-xs font-semibold text-[#B8962E]">
                  Discount applied: -{formatCurrency(totals.offerDiscount)}
                </p>
              )}
            </section>

            {/* Action Buttons */}
            <ActionButtons
              onSave={handleSaveBill}
              onClose={handleClose}
              onWhatsApp={handleWhatsApp}
              disabled={saved || saving || !isPaymentValid}
              saved={saved}
              isEdit={!!editInvoiceId}
            />
          </div>
        </section>

        <aside className="space-y-5">
          <SummaryCard
            totals={totals}
            billDiscount={billDiscount}
            billDiscountPercent={billDiscountPercent}
            onChangeDiscount={(val, percent) => {
              setBillDiscount(val);
              setBillDiscountPercent(percent);
            }}
            amountPaid={amountPaid}
            onChangeAmountPaid={(val) => {
              setAmountPaid(val);
              setIsAmountPaidEdited(true);
            }}
            advanceToAdd={advanceToAdd}
            onAddAdvance={setAdvanceToAdd}
            advanceApplied={advanceApplied}
          />

          <section className="rounded-2xl border border-[#2E2B24] bg-[#131210] p-5 shadow-md text-[#A89F8C]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#F5F0E8]">Payment Information</h2>
              {isSplitEdited && (
                <button
                  type="button"
                  disabled={saved}
                  onClick={() => setIsSplitEdited(false)}
                  className="text-xs font-semibold text-[#6B6358] hover:text-[#B8962E] transition underline cursor-pointer disabled:opacity-50 disabled:no-underline"
                >
                  Reset to Full UPI
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#2E2B24] pb-3">
                <span className="text-sm font-semibold text-[#A89F8C]">Grand Total</span>
                <span className="text-lg font-bold text-[#F5F0E8]">{formatCurrency(totals.grandTotal)}</span>
              </div>

              {/* Horizontal Payment Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(["cash", "upi", "card"] as const).map((method) => {
                  const val = method === "cash" ? cashAmount : method === "upi" ? upiAmount : cardAmount;
                  const setFn = method === "cash" ? setCashAmount : method === "upi" ? setUpiAmount : setCardAmount;
                  return (
                    <label key={method} className="block">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-[#6B6358] capitalize">{method} Amount</span>
                      <div className="mt-1.5 h-10 w-full rounded-xl border border-[#2E2B24] bg-[#0E0D0B] px-2 flex items-center transition focus-within:border-[#B8962E] focus-within:ring-1 focus-within:ring-[#B8962E] disabled:bg-stone-900">
                        <ClearableNumberInput
                          min="0"
                          value={val}
                          placeholder="0"
                          disabled={saved}
                          onChange={(newVal) => {
                            setIsSplitEdited(true);
                            setFn(newVal === "" ? "" : Math.max(0, newVal));
                          }}
                          className="text-[#F5F0E8] text-sm disabled:text-[#6B6358]"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Mark as Credit Checkbox */}
              {customerMobile.trim().length >= 10 && customerMobile.trim() !== GUEST_PHONE && (
                <div className="border-t border-[#2E2B24] pt-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-[#A89F8C] hover:text-[#F5F0E8] transition">
                    <input
                      type="checkbox"
                      checked={markAsCredit}
                      disabled={saved}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setMarkAsCredit(isChecked);
                        if (isChecked) {
                          setCashAmount("");
                          setUpiAmount("");
                          setCardAmount("");
                          setIsSplitEdited(true);
                        } else {
                          setIsSplitEdited(false);
                        }
                      }}
                      className="size-4 rounded border-[#2E2B24] bg-[#0E0D0B] text-[#B8962E] focus:ring-0 cursor-pointer accent-[#B8962E]"
                    />
                    <span>Mark as Credit (Customer will pay later)</span>
                  </label>
                </div>
              )}

              <div className="border-t border-[#2E2B24] pt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#A89F8C]">Total Paid</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-[#F5F0E8]">{formatCurrency(totalPaid)}</span>
                    {isPaymentValid && (
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#2A2310] text-[#D4A935] border border-[#4A3A10] text-[10px] font-bold">
                        ✓
                      </span>
                    )}
                  </div>
                </div>
                {totals.grandTotal > 0 && (
                  <div className="text-xs font-semibold text-right">
                    {isPaymentValid ? (
                      <span className="text-[#B8962E]">
                        {markAsCredit && paymentDiff > 0 ? `Credit Balance: ${formatCurrency(paymentDiff)}` : "Payment matches bill total"}
                      </span>
                    ) : paymentDiff > 0 ? (
                      <span className="text-[#B8962E]">Remaining {formatCurrency(paymentDiff)}</span>
                    ) : (
                      <span className="text-[#E57373]">Exceeds total by {formatCurrency(Math.abs(paymentDiff))}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
