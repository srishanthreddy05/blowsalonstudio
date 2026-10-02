"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { ActionButtons } from "@/components/salon-dashboard/action-buttons";
import { BillingTable } from "@/components/salon-dashboard/billing-table";
import { ProductTable } from "@/components/salon-dashboard/product-table";
import { SummaryCard } from "@/components/salon-dashboard/summary-card";
import type { ProductRow, ServiceRow } from "@/components/salon-dashboard/types";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { ClearableNumberInput } from "../ui/ClearableNumberInput";
import { X, UserX, AlertCircle, Wallet, Search } from "lucide-react";
import { Timestamp } from "firebase/firestore";

import * as customerService from "@/services/customers";
import * as productsService from "@/services/products";
import * as invoicesService from "@/services/invoices";
import * as creditBalancesService from "@/services/creditBalances";
import * as advanceBalancesService from "@/services/advanceBalances";
import * as appointmentService from "@/services/appointments";
import * as whatsappService from "@/services/whatsapp";
import type { CreditBalance } from "@/types/creditBalance";
import type { Appointment } from "@/types/appointment";
import { useAppData } from "@/context/AppDataContext";
import { toLocalDateString, formatDisplayDate } from "@/lib/utils/date";
import { calculateBillTotals, SERVICE_TAX_RATE } from "@/lib/utils/billing";
import { generateWhatsAppReceiptText } from "@/lib/utils/whatsappReceipt";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { toast } from "react-hot-toast";

import type { Invoice } from "@/types/invoice";
import type { Customer } from "@/types/customer";
import type { Service } from "@/types/service";
import type { Product } from "@/types/product";
import type { Staff } from "@/types/staff";
import { normalizeStaffRole } from "@/types/staff";
import type { Offer } from "@/types/offer";

interface BillingTerminalProps {
  onClose?: () => void;
  onSuccess?: () => void;
  editInvoiceId?: string;
  initialCustomerId?: string;
  initialCustomerName?: string;
  initialCustomerMobile?: string;
  initialServiceId?: string;
  initialStaffId?: string;
  initialStaffName?: string;
  initialAppointmentId?: string;
}

export function BillingTerminal({
  onClose,
  onSuccess,
  editInvoiceId,
  initialCustomerId,
  initialCustomerName,
  initialCustomerMobile,
  initialServiceId,
  initialStaffId,
  initialStaffName,
  initialAppointmentId,
}: BillingTerminalProps) {
  const { services: servicesContextData, products: productsContextData, packages: packagesContextData, staff: staffContextData, offers: offersContextData, settings, refreshProducts, loadingAppData } = useAppData();

  const servicesList = servicesContextData;
  const productsList = productsContextData;
  const packagesList = packagesContextData || [];
  const staffList = useMemo(
    () =>
      staffContextData.filter(
        (s) =>
          s.status === "Active" &&
          s.dutyStatus === "onDuty" &&
          normalizeStaffRole(s.role) !== "MANAGER"
      ),
    [staffContextData]
  );
  const offersList = offersContextData;
  const loading = loadingAppData;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<Invoice | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [whatsappNotice, setWhatsappNotice] = useState<{
    status: "SENDING" | "SENT" | "FAILED" | "NOT_SENT";
    text: string;
    invoiceId?: string;
  } | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  // Invoice Form Fields
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [clientStatus, setClientStatus] = useState<"regular" | "membership" | "new" | null>(null);
  const [foundCustomerId, setFoundCustomerId] = useState<string | null>(null);
  const [linkedAppointment, setLinkedAppointment] = useState<Appointment | null>(null);

  // Live Customer Search
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Load all customers for instant local search
  useEffect(() => {
    let active = true;
    const loadCustomers = async () => {
      try {
        const list = await customerService.getAll();
        if (active) {
          setAllCustomers(list);
        }
      } catch (err) {
        console.error("Failed to load customers list for billing search:", err);
      }
    };
    loadCustomers();
    return () => {
      active = false;
    };
  }, []);

  // Filter customers live by name (case-insensitive) or phone (partial digits)
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return allCustomers
      .filter((c) => {
        const nameMatch = (c.name || "").toLowerCase().includes(q);
        const phoneMatch = (c.phone || "").toLowerCase().includes(q);
        return nameMatch || phoneMatch;
      })
      .slice(0, 10);
  }, [customerSearchQuery, allCustomers]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerName(customer.name);
    setCustomerMobile(customer.phone);
    setClientStatus((customer.customerType as "regular" | "membership") || "regular");
    setFoundCustomerId(customer.id || null);
    setCustomerSearchQuery("");
    setShowCustomerDropdown(false);
  };

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
            setLastSavedInvoice(inv);
            
            setDateString(toLocalDateString(inv.date));

            // Populate services
            const mappedServices: ServiceRow[] = (inv.services || []).map((s: any, idx: number) => ({
              id: idx + 1,
              serviceId: s.serviceId || undefined,
              service: s.serviceName || s.service || "",
              category: s.category || undefined,
              selectedVariant: s.selectedVariant || undefined,
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

  useEffect(() => {
    let active = true;
    if (!editInvoiceId) {
      if (initialCustomerName) setCustomerName(initialCustomerName);
      if (initialCustomerMobile) setCustomerMobile(initialCustomerMobile);
      if (initialCustomerId) setFoundCustomerId(initialCustomerId);

      if (initialAppointmentId) {
        appointmentService.getById(initialAppointmentId).then((appt) => {
          if (!active || !appt) return;
          setLinkedAppointment(appt);
          if (appt.customerName && !initialCustomerName) setCustomerName(appt.customerName);
          if (appt.customerPhone && !initialCustomerMobile) setCustomerMobile(appt.customerPhone);
          if (appt.customerId && !initialCustomerId) setFoundCustomerId(appt.customerId);

          // If service/staff was not passed via props but is in appointment, prefill service row
          const sId = initialServiceId || appt.serviceId;
          const stfId = initialStaffId || appt.staffId;
          if ((sId || stfId) && services.length === 0) {
            const matchedService = servicesList.find((s) => s.id === sId || s.name === sId);
            const matchedStaff = staffContextData.find(
              (stf) => (stfId && stf.id === stfId) || (stf.name === stfId)
            );
            if (matchedService || matchedStaff) {
              const newRow: ServiceRow = {
                id: 1,
                serviceId: matchedService?.id,
                service: matchedService?.name || "",
                category: matchedService?.category,
                staff: matchedStaff?.name || "",
                price: matchedService?.price || 0,
                quantity: 1,
                discount: 0,
              };
              setServices([newRow]);
            }
          }
        }).catch((err) => {
          console.error("Failed to load linked appointment:", err);
        });
      }

      if (initialServiceId || initialStaffId || initialStaffName) {
        const matchedService = servicesList.find((s) => s.id === initialServiceId || s.name === initialServiceId);
        const matchedStaff = staffContextData.find(
          (stf) => (initialStaffId && stf.id === initialStaffId) || (initialStaffName && stf.name === initialStaffName)
        );

        if (matchedService || matchedStaff) {
          const newRow: ServiceRow = {
            id: 1,
            serviceId: matchedService?.id,
            service: matchedService?.name || "",
            category: matchedService?.category,
            staff: matchedStaff?.name || "",
            price: matchedService?.price || 0,
            quantity: 1,
            discount: 0,
          };
          setServices([newRow]);
        }
      }
    }
    return () => {
      active = false;
    };
  }, [
    editInvoiceId,
    initialCustomerId,
    initialCustomerName,
    initialCustomerMobile,
    initialServiceId,
    initialStaffId,
    initialStaffName,
    initialAppointmentId,
    servicesList,
    staffContextData,
  ]);


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

      // Eligible service amount check: offers apply ONLY to services
      const hasServiceScope = !!offer.applicableServiceIds?.length;
      let eligibleServiceSubtotal = 0;
      if (hasServiceScope) {
        eligibleServiceSubtotal = services.reduce((sum, row) => {
          const matched = servicesList.find((s) => s.name === row.service);
          if (matched?.id && offer.applicableServiceIds!.includes(matched.id)) {
            return sum + Math.max(Number(row.price) || 0, 0);
          }
          return sum;
        }, 0);
      } else {
        eligibleServiceSubtotal = services.reduce((sum, row) => {
          return sum + Math.max(Number(row.price) || 0, 0);
        }, 0);
      }

      // If bill has no eligible services, offer cannot apply
      if (eligibleServiceSubtotal <= 0) return false;

      // Minimum bill amount check: evaluated strictly against eligible SERVICE amount
      if (offer.minBillAmount && offer.minBillAmount > 0) {
        if (eligibleServiceSubtotal < offer.minBillAmount) return false;
      }

      return true;
    });
  }, [offersList, dateString, clientStatus, services, servicesList]);

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
    return calculateBillTotals({
      services,
      products,
      billDiscount,
      selectedOffer,
      taxRate: SERVICE_TAX_RATE,
    });
  }, [services, products, selectedOffer, billDiscount]);

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

  const amountToCollect = Math.max(0, Math.round(totals.grandTotal - advanceApplied));

  // Sync amountPaid with amountToCollect by default when not manually edited
  useEffect(() => {
    if (!isAmountPaidEdited) {
      console.log("[AmountPaid WRITE]", {
        value: amountToCollect,
        source: "UNEDITED_SYNC_EFFECT",
        grandTotal: totals.grandTotal,
        advanceApplied,
      });
      setAmountPaid(amountToCollect);
    }
  }, [amountToCollect, isAmountPaidEdited]);

  // Sync default UPI amount when amountPaid changes and user has not customized splits
  useEffect(() => {
    const amt = Math.round(Number(amountPaid) || 0);
    if (!isSplitEdited && amt > 0) {
      setUpiAmount(amt);
      setCashAmount("");
      setCardAmount("");
    } else if (amt === 0 && !isSplitEdited) {
      setUpiAmount("");
      setCashAmount("");
      setCardAmount("");
    }
  }, [amountPaid, isSplitEdited]);

  const cashVal = cashAmount === "" ? 0 : Math.round(Number(cashAmount));
  const upiVal = upiAmount === "" ? 0 : Math.round(Number(upiAmount));
  const cardVal = cardAmount === "" ? 0 : Math.round(Number(cardAmount));
  const totalPaid = cashVal + upiVal + cardVal;
  const paymentDiff = amountToCollect - totalPaid;
  const change = Math.max(0, (Math.round(Number(amountPaid) || 0)) - amountToCollect);
  
  // Reset advanceToAdd if change becomes 0
  useEffect(() => {
    if (change === 0) {
      setAdvanceToAdd(0);
    }
  }, [change]);

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

  // Auto-clear or update validation errors dynamically as the user fills in fields
  useEffect(() => {
    if (validationErrors.length > 0) {
      const currentErrors: string[] = [];
      const trimmedName = customerName.trim();
      const trimmedMobile = customerMobile.trim();

      if (!trimmedName) {
        currentErrors.push("Customer name is required.");
      }

      if (!trimmedMobile) {
        currentErrors.push("Customer mobile number is required.");
      } else if (trimmedMobile.length < 10) {
        currentErrors.push("Please enter a valid 10-digit mobile number.");
      }

      if (services.length === 0 && products.length === 0) {
        currentErrors.push("Please add at least one service or product.");
      }

      services.forEach((s) => {
        if (!s.isCreditSettle && !s.isSystemService && s.service !== "Membership Fee" && !s.staff?.trim()) {
          currentErrors.push(`Please select staff for ${s.service}.`);
        }
      });

      setValidationErrors(currentErrors);
    }
  }, [customerName, customerMobile, services, products, validationErrors.length]);

  const handleSaveBill = async () => {
    const errors: string[] = [];
    const trimmedName = customerName.trim();
    const trimmedMobile = customerMobile.trim();

    if (!trimmedName) {
      errors.push("Customer name is required.");
    }

    if (!trimmedMobile) {
      errors.push("Customer mobile number is required.");
    } else if (trimmedMobile.length < 10) {
      errors.push("Please enter a valid 10-digit mobile number.");
    }

    if (services.length === 0 && products.length === 0) {
      errors.push("Please add at least one service or product.");
    }

    services.forEach((s) => {
      if (!s.isCreditSettle && !s.isSystemService && s.service !== "Membership Fee" && !s.staff?.trim()) {
        errors.push(`Please select staff for ${s.service}.`);
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setSaving(true);
    setMessage(null);

    try {
      const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

      // Step 1: Resolve or create customer (real customer only)
      let customerId = foundCustomerId;
      let resolvedCustomerType: "regular" | "membership" | "new" = 
        clientStatus ?? "new";

      if (!customerId) {
        const existing = await customerService.getByPhone(trimmedMobile);
        if (existing && existing.id) {
          customerId = existing.id;
          resolvedCustomerType = existing.customerType || "regular";
        } else {
          customerId = await customerService.create({
            name: trimmedName,
            phone: trimmedMobile,
            customerType: "regular",
          });
          resolvedCustomerType = "regular";
        }
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
      
      const totalServiceBillDiscount = billDiscount + totals.offerDiscount;
      const serviceBillDiscountFactor = rawNonCreditServiceTotal > 0 
        ? Math.max(rawNonCreditServiceTotal - totalServiceBillDiscount, 0) / rawNonCreditServiceTotal 
        : 1;

      const enrichedServices = services.map((row: any) => {
        const matchedService = servicesList.find((s) => s.id === row.serviceId || s.name === row.service || row.service.startsWith(`${s.name} (`));
        const matchedPackage = !matchedService ? packagesList.find((p) => p.id === row.serviceId || p.name === row.service) : null;
        const matchedStaff = staffContextData.find((s) => s.name === row.staff);
        const serviceBaseAmount = Math.max((Number(row.price) || 0) - (Number(row.discount) || 0), 0);
        const serviceAmount = row.isCreditSettle
          ? Math.round(serviceBaseAmount)
          : Math.round(serviceBaseAmount * serviceBillDiscountFactor);
        
        // Use original staff metadata if it's a credit settlement row
        const staffId = row.isCreditSettle ? (row.originalStaffId || matchedStaff?.id || "system") : (matchedStaff?.id ?? "");
        const staffRole = row.isCreditSettle 
          ? (row.originalStaffRole || (row.staff === "System" ? "Owner" : (matchedStaff?.role || "Stylist")))
          : (row.staff === "System" ? "Owner" : (matchedStaff?.role || "Stylist"));
          
        const isSystemService = matchedService ? (matchedService.isSystemService === true || matchedService.id === "membership_fee") : (row.service === "Membership Fee");
        const resolvedServiceId = row.serviceId || matchedService?.id || matchedPackage?.id || "";

        return {
          serviceId: resolvedServiceId,
          serviceName: row.service,
          category: row.category || matchedService?.category || (matchedPackage ? "Packages" : undefined) || null,
          selectedVariant: row.selectedVariant || null,
          staffId,
          staffName: row.staff,
          price: Math.round(Number(row.price) || 0),
          discount: Math.round(Number(row.discount) || 0),
          amount: serviceAmount,
          staffRole,
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
          price: Math.round(Number(row.price) || 0),
          discount: Math.round(Number(row.discount) || 0),
          amount: Math.round(Math.max((Number(row.price) || 0) * (Number(row.quantity) || 1) - (Number(row.discount) || 0), 0)),
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
      const invoicePaymentStatus = markAsCredit
        ? ((totalPaid + advanceApplied) === 0 ? "unpaid" : "partial")
        : "paid";

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

          totalServices: totals.serviceTotal,
          totalProducts: totals.productTotal,
          totalMemberships: totals.membershipTotal || 0,
          subtotal: totals.subtotal,
          totalDiscount: totals.totalDiscount ?? 0,
          billDiscount: billDiscount,
          billDiscountPercent: billDiscountPercent,
          taxableServiceAmount: totals.taxableServiceAmount ?? 0,
          taxRate: totals.taxRate ?? SERVICE_TAX_RATE,
          taxAmount: totals.taxAmount ?? 0,
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
        savedInvoiceId = await invoicesService.create({
          invoiceNumber,
          dateString,

          customerId,
          customerName: customerName.trim(),
          customerPhone: customerMobile.trim(),
          customerType: resolvedCustomerType,

          appointmentId: initialAppointmentId || undefined,
          appointmentDate: linkedAppointment?.date || undefined,
          appointmentTime: linkedAppointment?.startTime || undefined,

          services: enrichedServices as any,
          products: enrichedProducts as any,

          totalServices: totals.serviceTotal,
          totalProducts: totals.productTotal,
          totalMemberships: totals.membershipTotal || 0,
          subtotal: totals.subtotal,
          totalDiscount: totals.totalDiscount ?? 0,
          billDiscount: billDiscount,
          billDiscountPercent: billDiscountPercent,
          taxableServiceAmount: totals.taxableServiceAmount ?? 0,
          taxRate: totals.taxRate ?? SERVICE_TAX_RATE,
          taxAmount: totals.taxAmount ?? 0,
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
      const finalInvoiceNum = invoiceNumberDisplay === "Auto-assigned on save" ? invoiceNumber : invoiceNumberDisplay;
      if (initialAppointmentId && invId) {
        try {
          await appointmentService.updateStatus(initialAppointmentId, "completed", {
            completedInvoiceId: invId,
            completedInvoiceNumber: finalInvoiceNum,
            completedInvoiceAmount: Math.round(totals.grandTotal),
          });
        } catch (appErr) {
          console.warn("Failed to link appointment to invoice:", appErr);
        }
      }
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
            const roundedServiceCredit = Math.round(serviceCredit);
            
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
                originalServiceAmount: Math.round(serviceFinalAmount),
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
            const roundedProductCredit = Math.round(productCredit);
            
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
                originalServiceAmount: Math.round(productFinalAmount),
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

      // Snapshot saved invoice for reliable manual WhatsApp invoice generation
      const savedInvoicePayload: any = {
        id: savedInvoiceId || editInvoiceId || "",
        invoiceNumber: finalInvoiceNum,
        date: new Date(dateString),
        billDate: new Date(dateString),
        dateString,
        customerId,
        customerName: customerName.trim(),
        customerPhone: customerMobile.trim(),
        customerType: resolvedCustomerType,
        services: enrichedServices,
        products: enrichedProducts,
        totalServices: totals.serviceTotal,
        totalProducts: totals.productTotal,
        totalMemberships: totals.membershipTotal || 0,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount ?? 0,
        billDiscount,
        billDiscountPercent,
        taxableServiceAmount: totals.taxableServiceAmount ?? 0,
        taxRate: totals.taxRate ?? SERVICE_TAX_RATE,
        taxAmount: totals.taxAmount ?? 0,
        grandTotal: totals.grandTotal,
        paymentSplit: {
          cash: savedCash,
          upi: savedUpi,
          card: savedCard,
        },
        paymentMethod: invoicePaymentMethod,
        paymentStatus: invoicePaymentStatus,
        balanceDue: markAsCredit ? Math.max(0, totals.grandTotal - totalPaid) : 0,
        receivedAmount: totalPaid,
        advanceAdded: advanceToAdd,
        advanceUsed: advanceApplied,
      };
      setLastSavedInvoice(savedInvoicePayload);

      let successMsg = isOnline 
        ? `Invoice ${msgNum} saved successfully!`
        : `Invoice ${msgNum} saved locally — will sync when online!`;

      if (advanceApplied > 0 && customerAdvance) {
        const newAdvanceBalance = Math.max(0, Math.round(customerAdvance.balance - advanceApplied));
        if (newAdvanceBalance > 0) {
          successMsg += ` Advance remaining for ${customerName.trim()}: ${formatCurrency(newAdvanceBalance)}`;
        } else if (amountToCollect === 0) {
          successMsg += ` Bill fully covered by advance.`;
        }
      }
      setMessage({ type: "success", text: successMsg });
      setSaved(true);

      // Trigger automated WhatsApp receipt dispatch (non-blocking) - ONLY for new invoices, NOT on edit/update
      if (!editInvoiceId && savedInvoiceId && isOnline) {
        setWhatsappNotice({ status: "SENDING", text: "Sending WhatsApp receipt..." });
        whatsappService
          .sendInvoiceWhatsApp(savedInvoiceId)
          .then((waRes) => {
            // If WhatsApp is globally disabled, show a quiet informational notice (not an error)
            if ((waRes as any).disabled) {
              setWhatsappNotice({
                status: "NOT_SENT",
                text: "WhatsApp messaging is currently disabled.",
              });
              return;
            }
            if (waRes.status === "SENT") {
              setWhatsappNotice({
                status: "SENT",
                text: `WhatsApp receipt sent to ${customerName.trim()}`,
              });
            } else if (waRes.status === "FAILED") {
              setWhatsappNotice({
                status: "FAILED",
                text: waRes.error || "WhatsApp receipt failed. Is WhatsApp connected?",
                invoiceId: savedInvoiceId,
              });
            } else {
              setWhatsappNotice({
                status: "NOT_SENT",
                text: waRes.error || "Receipt not sent via WhatsApp",
              });
            }
          })
          .catch((waErr) => {
            console.warn("Background WhatsApp dispatch warning:", waErr);
            setWhatsappNotice({
              status: "FAILED",
              text: "WhatsApp dispatch error",
              invoiceId: savedInvoiceId,
            });
          });
      }

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
    setValidationErrors([]);
    setWhatsappNotice(null);
    setSaved(false);
    setLastSavedInvoice(null);
    setCashAmount("");
    setUpiAmount("");
    setCardAmount("");
    setIsSplitEdited(false);
    setInvoiceNumberDisplay("Auto-assigned on save");
    setSelectedOfferId("");
    setBillDiscount(0);
    setBillDiscountPercent(0);
    console.log("[AmountPaid WRITE]", {
      value: 0,
      source: "HANDLE_CLOSE_RESET",
    });
    setAmountPaid(0);
    setIsAmountPaidEdited(false);
    setAdvanceToAdd(0);
    setCustomerAdvance(null);
    setAdvanceApplied(0);

    if (onClose) {
      onClose();
    }
  };

  /**
   * Temporary manual WhatsApp invoice dispatch flow for Billing Terminal.
   *
   * Flow:
   * 1. Validates that the bill is successfully saved first.
   * 2. Extracts and validates the customer phone number (converts Indian 10-digits to 91XXXXXXXXXX).
   * 3. Generates the exact formatted WhatsApp invoice receipt text.
   * 4. URL-encodes the message safely.
   * 5. Opens https://wa.me/<phone>?text=<encoded_msg> in a new window/tab for manual staff send.
   *
   * Future Compatibility:
   * When Meta App Review / WhatsApp Coexistence completes, this handler can be switched
   * to direct API dispatch (e.g., whatsappService.sendInvoiceWhatsApp) without changing UI structure.
   */
  const handleWhatsApp = () => {
    // 1. Make sure the bill has been successfully saved first
    if (!saved) {
      toast.error("Please save the bill first before opening WhatsApp.");
      setMessage({ type: "error", text: "Please save the bill first before opening WhatsApp." });
      return;
    }

    // 2. Get customer's phone number from saved invoice or form state
    const targetPhone = (lastSavedInvoice?.customerPhone || customerMobile || "").trim();
    if (!targetPhone) {
      toast.error("No phone number found for this customer. Please enter a valid 10-digit mobile number.");
      setMessage({ type: "error", text: "Customer phone number is missing. Cannot open WhatsApp." });
      return;
    }

    // Validate phone number and clean for Indian WhatsApp (8125902036 -> 918125902036, no '+', spaces, dashes)
    const normalized = normalizePhoneNumber(targetPhone);
    if (!normalized.isValid || !normalized.digits) {
      toast.error(`Invalid customer mobile number "${targetPhone}". Please enter a valid 10-digit number.`);
      setMessage({ type: "error", text: `Invalid phone number "${targetPhone}". WhatsApp cannot be opened.` });
      return;
    }

    const cleanWhatsAppNumber = normalized.whatsappNumber;

    // 3. Generate the formatted invoice message (reusing centralized generateWhatsAppReceiptText)
    const invoiceForReceipt: Invoice = lastSavedInvoice || ({
      customerName: customerName.trim() || "Valued Customer",
      customerPhone: targetPhone,
      invoiceNumber: invoiceNumberDisplay === "Auto-assigned on save" ? "INV" : invoiceNumberDisplay,
      date: new Date(dateString) as any,
      billDate: new Date(dateString) as any,
      services: services.map((s) => ({
        serviceName: s.service,
        price: Math.round(Number(s.price) || 0),
        discount: Math.round(Number(s.discount) || 0),
        amount: Math.round(Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0)),
        isSystemService: s.isSystemService || s.serviceId === "membership_fee",
        serviceId: s.serviceId,
      })) as any,
      products: products.map((p) => ({
        productName: p.product,
        quantity: Number(p.quantity) || 1,
        price: Math.round(Number(p.price) || 0),
        discount: Math.round(Number(p.discount) || 0),
        amount: Math.round(Math.max((Number(p.price) || 0) * (Number(p.quantity) || 1) - (Number(p.discount) || 0), 0)),
      })) as any,
      totalServices: totals.serviceTotal,
      totalProducts: totals.productTotal,
      totalMemberships: totals.membershipTotal || 0,
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount ?? 0,
      taxAmount: totals.taxAmount ?? 0,
      taxRate: totals.taxRate ?? SERVICE_TAX_RATE,
      grandTotal: totals.grandTotal,
      paymentMethod:
        cashVal === amountToCollect && amountToCollect > 0
          ? "Cash"
          : upiVal === amountToCollect && amountToCollect > 0
            ? "UPI"
            : cardVal === amountToCollect && amountToCollect > 0
              ? "Card"
              : "Split",
      paymentStatus: markAsCredit ? "unpaid" : "paid",
      balanceDue: markAsCredit ? Math.max(0, totals.grandTotal - totalPaid) : 0,
      receivedAmount: totalPaid,
      advanceUsed: advanceApplied,
    } as any);

    const messageText = generateWhatsAppReceiptText(invoiceForReceipt);

    // 4. URL-encode complete message
    const encodedMessage = encodeURIComponent(messageText);

    // 5. Open WhatsApp using wa.me URL
    const waUrl = `https://wa.me/${cleanWhatsAppNumber}?text=${encodedMessage}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");

    toast.success("WhatsApp opened with pre-filled invoice message!");
  };

  const mappedServicesList = [
    ...servicesList.map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      category: s.category || "General",
      gender: s.gender || "both",
      startingPrice: s.startingPrice,
      priceLabel: s.priceLabel,
      priceUnit: s.priceUnit,
      variants: s.variants,
    })),
    ...packagesList.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      price: pkg.price,
      category: "Packages",
      gender: pkg.gender || "both",
      isPackage: true,
    })),
  ];

  const mappedProductsList = productsList.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
  }));

  const staffOptions = staffList.map((s) => s.name);

  if (loading || loadingInvoice) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[#2F352F]">
            {editInvoiceId ? `Edit Invoice (${invoiceNumberDisplay})` : "New Billing"}
          </h1>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-2.5 text-[#747A72] hover:text-[#2F352F] hover:border-[#6F776D] hover:bg-[#E8ECE5] transition shadow-xs cursor-pointer"
            title="Close Terminal (ESC)"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {message && (
        <div
          className={`mb-5 rounded-2xl border p-4 text-sm max-w-4xl font-medium ${message.type === "success"
            ? "border-[#CCD2C8] bg-[#E8ECE5] text-[#2F352F]"
            : "border-[#FBEBEB] bg-[#FBEBEB] text-[#B55B5B]"
            }`}
        >
          {message.text}
        </div>
      )}

      {whatsappNotice && (
        <div
          className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs font-medium max-w-4xl ${
            whatsappNotice.status === "SENT"
              ? "border-[#5F7A62]/30 bg-[#E8ECE5] text-[#5F7A62]"
              : whatsappNotice.status === "FAILED"
              ? "border-[#F8D7D7] bg-[#FBEBEB] text-[#B55B5B]"
              : "border-[#CCD2C8] bg-[#F7F7F4] text-[#747A72]"
          }`}
        >
          <div className="flex items-center gap-2">
            {whatsappNotice.status === "SENT" ? (
              <span className="font-bold text-[#5F7A62]">✓ WhatsApp:</span>
            ) : whatsappNotice.status === "FAILED" ? (
              <span className="font-bold text-[#B55B5B]">⚠ WhatsApp:</span>
            ) : (
              <span className="font-bold text-[#747A72]">ℹ WhatsApp:</span>
            )}
            <span>{whatsappNotice.text}</span>
          </div>

          {whatsappNotice.status === "FAILED" && whatsappNotice.invoiceId && (
            <button
              type="button"
              onClick={() => {
                if (!whatsappNotice.invoiceId) return;
                setWhatsappNotice({ status: "SENDING", text: "Retrying WhatsApp receipt..." });
                whatsappService.sendInvoiceWhatsApp(whatsappNotice.invoiceId, true).then((res) => {
                  if (res.status === "SENT") {
                    setWhatsappNotice({
                      status: "SENT",
                      text: `WhatsApp receipt sent to ${customerName.trim()}`,
                    });
                  } else {
                    setWhatsappNotice({
                      status: "FAILED",
                      text: res.error || "Retry failed. Check WhatsApp connection in Settings.",
                      invoiceId: whatsappNotice.invoiceId,
                    });
                  }
                });
              }}
              className="h-7 px-3 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] hover:bg-[#E8ECE5] text-xs font-bold text-[#2F352F] shadow-2xs transition cursor-pointer"
            >
              Retry WhatsApp
            </button>
          )}
        </div>
      )}

      {dateString !== toLocalDateString(new Date()) && (
        <div className="mb-5 rounded-2xl border border-[#B18A45]/30 bg-[#FAF4E8] p-4 text-sm font-semibold text-[#B18A45] flex items-center gap-2 max-w-4xl">
          <AlertCircle size={16} />
          <span>You are adding/editing a bill for {dateString}. This will not affect today's records.</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 shadow-xs sm:p-5 text-[#292D29]">
          {linkedAppointment && (
            <div className="mb-4 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5]/60 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 font-bold text-[#5F7A62]">
                  ● Linked to Appointment
                </span>
                <span className="text-[#2F352F] font-semibold">
                  {linkedAppointment.date ? formatDisplayDate(linkedAppointment.date) : ""} • {linkedAppointment.startTime}
                </span>
              </div>
              <span className="text-[11px] text-[#747A72]">
                Customer: <strong className="text-[#2F352F]">{linkedAppointment.customerName || customerName}</strong>
              </span>
            </div>
          )}

          {/* Quick Customer Search */}
          <div className="relative mb-4" ref={customerDropdownRef}>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#747A72] mb-1.5">
              Quick Customer Search (Name or Phone)
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#747A72]">
                <Search size={15} />
              </div>
              <input
                type="text"
                value={customerSearchQuery}
                disabled={saved}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => {
                  if (customerSearchQuery.trim().length > 0) {
                    setShowCustomerDropdown(true);
                  }
                }}
                placeholder="Search customer by name or phone..."
                className="h-11 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] pl-10 pr-10 text-xs text-[#292D29] outline-none transition focus:border-[#6F776D] focus:bg-[#FFFFFF] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72] disabled:text-[#747A72]"
              />
              {customerSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerSearchQuery("");
                    setShowCustomerDropdown(false);
                  }}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#747A72] hover:text-[#2F352F] cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Live Dropdown Menu */}
            {showCustomerDropdown && customerSearchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-1.5 shadow-xl">
                {filteredCustomers.length === 0 ? (
                  <div className="px-4 py-3 text-center text-xs text-[#747A72] italic">
                    No customers found matching "{customerSearchQuery}"
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredCustomers.map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => handleSelectCustomer(cust)}
                        className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs transition hover:bg-[#F7F7F4] group cursor-pointer"
                      >
                        <div>
                          <div className="font-bold text-[#2F352F] group-hover:text-[#5F7A62]">
                            {cust.name}
                          </div>
                          <div className="text-[11px] font-mono text-[#747A72]">
                            {cust.phone}
                          </div>
                        </div>
                        <div>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                              cust.customerType === "membership"
                                ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                                : "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                            }`}
                          >
                            {cust.customerType === "membership" ? "Membership" : "Regular"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#747A72]">Invoice Number</span>
              <input
                readOnly
                type="text"
                value={invoiceNumberDisplay}
                className="mt-2 h-11 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3.5 text-xs font-bold text-[#747A72] outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#747A72]">Date</span>
              <input
                type="date"
                value={dateString}
                disabled={saved}
                max={toLocalDateString(new Date())}
                onChange={(e) => setDateString(e.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3.5 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] disabled:text-[#747A72]"
              />
            </label>

            <div className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#747A72]">Customer Mobile</span>
              <input
                required
                type="text"
                value={customerMobile}
                disabled={saved}
                onChange={(e) => setCustomerMobile(e.target.value)}
                placeholder="Type 10-digit phone number..."
                className="mt-2 h-11 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3.5 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72] disabled:text-[#747A72]"
              />
              {clientStatus && (
                <div className="mt-2 flex justify-start">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-bold tracking-wider uppercase border ${clientStatus === "membership"
                      ? "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                      : clientStatus === "regular"
                        ? "bg-[#F7F7F4] text-[#747A72] border-[#E0E4DD]"
                        : "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30"
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
              <span className="text-xs font-semibold uppercase tracking-wider text-[#747A72]">Customer Name</span>
              <input
                required
                type="text"
                value={customerName}
                disabled={saved}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter customer name..."
                className="mt-2 h-11 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3.5 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72] disabled:text-[#747A72]"
              />
            </div>
          </div>

          {/* Customer Advance Balance Banner */}
          {customerAdvance && customerAdvance.balance > 0 && (
            <div className="mt-4 rounded-2xl border border-[#CCD2C8] bg-[#E8ECE5] p-4 text-xs text-[#2F352F] space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#5F7A62]">
                <Wallet size={16} />
                <span>Advance Balance Available: {formatCurrency(customerAdvance.balance)}</span>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2 pl-6">
                <span>
                  This customer has a positive advance balance of <b>{formatCurrency(customerAdvance.balance)}</b>.
                </span>
                {advanceApplied > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CCD2C8] bg-[#FFFFFF] px-3 text-xs font-bold text-[#2F352F]">
                      Applied: {formatCurrency(advanceApplied)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAdvanceApplied(0)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#F7F7F4] border border-[#E0E4DD] px-3 text-xs font-bold text-[#747A72] hover:bg-[#FFFFFF] hover:text-[#292D29] transition cursor-pointer shadow-xs"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const maxAppliable = Math.min(customerAdvance.balance, totals.grandTotal);
                      setAdvanceApplied(maxAppliable);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#6F776D] px-3 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition cursor-pointer shadow-xs"
                  >
                    Apply Advance
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Outstanding Credit Warning Banner */}
          {!loadingCredits && pendingCreditsToShow.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[#B18A45]/30 bg-[#FAF4E8] p-4 text-xs text-[#B18A45] space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#B18A45]">
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
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#6F776D] px-3 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition cursor-pointer shadow-xs"
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
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#6F776D] px-3 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition cursor-pointer shadow-xs"
                      >
                        <Wallet size={12} />
                        Collect All ({formatCurrency(pendingCreditsToShow.reduce((sum, c) => sum + (c.remainingAmount !== undefined ? c.remainingAmount : (c.amount ?? 0)), 0))})
                      </button>
                    </div>
                    <ul className="mt-2 space-y-1.5 border-t border-[#B18A45]/20 pt-2 text-xs text-[#747A72]">
                      {pendingCreditsToShow.map((credit) => (
                        <li key={credit.id} className="flex items-center justify-between">
                          <span>
                            • {formatCurrency(credit.remainingAmount !== undefined ? credit.remainingAmount : (credit.amount ?? 0))} since {new Date(credit.createdAt).toLocaleDateString()} — {credit.invoiceNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCollectCredit(credit)}
                            className="text-[10px] font-bold text-[#6F776D] hover:text-[#2F352F] underline cursor-pointer"
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
            disabled={saved}
          />

          <ProductTable
            rows={products}
            onRowsChange={setProducts}
            productOptions={mappedProductsList}
            disabled={saved}
          />

          <div className="grid gap-5 md:grid-cols-2 mt-6 pt-6 border-t border-[#E0E4DD]">
            {/* Offers Selector */}
            <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29] flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-[#292D29] mb-3">Apply Offer</h2>
                {offersList.length === 0 ? (
                  <p className="text-xs text-[#747A72]">No offers have been created yet.</p>
                ) : eligibleOffers.length === 0 ? (
                  <p className="text-xs text-[#747A72]">
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
                    className="h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs font-semibold text-[#292D29] outline-none transition focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] disabled:text-[#747A72]"
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
                <p className="mt-3 text-xs font-semibold text-[#5F7A62]">
                  Discount applied: -{formatCurrency(totals.offerDiscount)}
                </p>
              )}
            </section>

            {/* Dedicated Validation Errors Area */}
            {validationErrors.length > 0 && (
              <div className="rounded-2xl border border-[#F8D7D7] bg-[#FBEBEB] p-4 text-[#B55B5B] shadow-2xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider mb-2.5">
                  <AlertCircle size={15} className="shrink-0 text-[#B55B5B]" />
                  <span>Validation Errors</span>
                </div>
                <div className="space-y-1.5 text-xs font-semibold max-h-40 overflow-y-auto pl-1">
                  {validationErrors.map((err, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-[#B55B5B] shrink-0 font-bold">⚠</span>
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <ActionButtons
              onSave={handleSaveBill}
              onClose={handleClose}
              onWhatsApp={handleWhatsApp}
              disabled={saved || saving || !isPaymentValid}
              saved={saved}
              isEdit={!!editInvoiceId}
              saving={saving}
            />
          </div>
        </section>

        <aside className="space-y-5">
          {(() => {
            console.log("[AmountPaid RENDER]", {
              amountPaid,
              grandTotal: totals.grandTotal,
              taxableAmount: totals.taxableServiceAmount ?? 0,
              taxAmount: totals.taxAmount ?? 0,
              advanceApplied,
            });
            return null;
          })()}
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
              const parsedVal = val === "" ? "" : Math.round(Math.max(0, Number(val)));
              console.log("[AmountPaid WRITE]", {
                value: parsedVal,
                source: "USER_MANUAL_INPUT_SUMMARY_CARD",
              });
              setAmountPaid(parsedVal);
              setIsAmountPaidEdited(true);
            }}
            advanceToAdd={advanceToAdd}
            onAddAdvance={setAdvanceToAdd}
            advanceApplied={advanceApplied}
          />

          <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-5 shadow-xs text-[#292D29]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#292D29]">Payment Details</h2>
              {isSplitEdited && (
                <button
                  type="button"
                  disabled={saved}
                  onClick={() => {
                    setIsSplitEdited(false);
                    setIsAmountPaidEdited(false);
                    const resetAmt = amountToCollect;
                    console.log("[AmountPaid WRITE]", {
                      value: resetAmt,
                      source: "RESET_TO_FULL_UPI",
                    });
                    setAmountPaid(resetAmt);
                    setUpiAmount(resetAmt);
                    setCashAmount("");
                    setCardAmount("");
                  }}
                  className="text-xs font-semibold text-[#747A72] hover:text-[#292D29] transition underline cursor-pointer disabled:opacity-50 disabled:no-underline"
                >
                  Reset to Full UPI
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E0E4DD] pb-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-[#747A72]">Grand Total</span>
                <span className="text-base font-extrabold text-[#2F352F]">{formatCurrency(totals.grandTotal)}</span>
              </div>

              {/* Horizontal Payment Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(["cash", "upi", "card"] as const).map((method) => {
                  const val = method === "cash" ? cashAmount : method === "upi" ? upiAmount : cardAmount;
                  const setFn = method === "cash" ? setCashAmount : method === "upi" ? setUpiAmount : setCardAmount;
                  return (
                    <label key={method} className="block">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-[#747A72] font-bold capitalize">{method} Amount</span>
                      <div className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 flex items-center transition focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D]">
                        <ClearableNumberInput
                          min="0"
                          step="1"
                          value={val}
                          placeholder="0"
                          disabled={saved}
                          onChange={(newVal) => {
                            setIsSplitEdited(true);
                            setFn(newVal === "" ? "" : Math.round(Math.max(0, Number(newVal))));
                          }}
                          className="text-[#292D29] text-xs font-bold disabled:text-[#747A72]"
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Mark as Credit Checkbox */}
              {customerMobile.trim().length >= 10 && (
                <div className="border-t border-[#E0E4DD] pt-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-[#747A72] hover:text-[#292D29] transition">
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
                      className="size-4 rounded border-[#E0E4DD] bg-[#F7F7F4] text-[#6F776D] focus:ring-0 cursor-pointer accent-[#6F776D]"
                    />
                    <span>Mark as Credit (Customer will pay later)</span>
                  </label>
                </div>
              )}

              <div className="border-t border-[#E0E4DD] pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#747A72]">Total Paid</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-[#292D29]">{formatCurrency(totalPaid)}</span>
                    {isPaymentValid && (
                      <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#E8ECE5] text-[#5F7A62] text-[10px] font-bold">
                        ✓
                      </span>
                    )}
                  </div>
                </div>
                {totals.grandTotal > 0 && (
                  <div className="text-xs font-semibold text-right">
                    {isPaymentValid ? (
                      <span className="text-[#5F7A62]">
                        {markAsCredit && paymentDiff > 0 ? `Credit Balance: ${formatCurrency(paymentDiff)}` : "Payment matches bill total"}
                      </span>
                    ) : paymentDiff > 0 ? (
                      <span className="text-[#B18A45]">Remaining {formatCurrency(paymentDiff)}</span>
                    ) : (
                      <span className="text-[#B55B5B]">Exceeds total by {formatCurrency(Math.abs(paymentDiff))}</span>
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
