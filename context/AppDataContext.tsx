"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import type { Service } from "@/types/service";
import type { Product } from "@/types/product";
import type { Staff } from "@/types/staff";
import { normalizeStaffRole } from "@/types/staff";
import type { Offer } from "@/types/offer";
import type { Settings } from "@/types/settings";
import type { ServiceCategory } from "@/types/serviceCategory";
import type { Package } from "@/types/package";
import { getSettings } from "@/services/settings";
import { setGlobalCurrencyConfig } from "@/components/salon-dashboard/types";

interface AppDataContextType {
  services: Service[];
  products: Product[];
  packages: Package[];
  staff: Staff[];
  offers: Offer[];
  settings: Settings | null;
  categories: ServiceCategory[];
  loadingAppData: boolean;
  refreshServices: () => Promise<Service[]>;
  refreshProducts: () => Promise<Product[]>;
  refreshPackages: () => Promise<Package[]>;
  refreshStaff: () => Promise<Staff[]>;
  refreshOffers: () => Promise<Offer[]>;
  refreshSettings: () => Promise<Settings | null>;
  refreshCategories: () => Promise<ServiceCategory[]>;
  invalidateCache: (key: "services" | "products" | "settings" | "serviceCategories" | "packages") => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loadingAppData, setLoadingAppData] = useState(true);

  // Clear any residual localStorage caches from previous versions on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const keysToRemove = [
        "cache_services_v1",
        "cache_products_v1",
        "cache_offers_v1",
        "cache_settings_v1",
        "cache_service_categories_v1",
      ];
      keysToRemove.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
    }
  }, []);

  const loadCategories = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      const q = query(
        collection(db, "serviceCategories"),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q);
      const result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceCategory));
      setCategories(result);
      return result;
    } catch (err) {
      console.error("Error loading categories from Firestore:", err);
      // Fallback query without orderBy if index is building
      try {
        const fallbackSnap = await getDocs(collection(db, "serviceCategories"));
        const fallbackResult = fallbackSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ServiceCategory))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setCategories(fallbackResult);
        return fallbackResult;
      } catch {
        setCategories([]);
        return [];
      }
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadServices = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      let result: Service[] = [];
      try {
        const q = query(
          collection(db, "services"),
          where("isActive", "==", true),
          orderBy("name", "asc")
        );
        const snap = await getDocs(q);
        result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Service));
      } catch {
        const fallbackQuery = query(
          collection(db, "services"),
          where("isActive", "==", true)
        );
        const snap = await getDocs(fallbackQuery);
        result = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Service))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      }

      setServices(result);
      return result;
    } catch (err) {
      console.error("Error loading services from Firestore:", err);
      setServices([]);
      return [];
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadProducts = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      let result: Product[] = [];
      try {
        const q = query(
          collection(db, "products"),
          where("isActive", "==", true),
          orderBy("name", "asc")
        );
        const snap = await getDocs(q);
        result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
      } catch {
        const fallbackQuery = query(
          collection(db, "products"),
          where("isActive", "==", true)
        );
        const snap = await getDocs(fallbackQuery);
        result = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Product))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      }

      setProducts(result);
      return result;
    } catch (err) {
      console.error("Error loading products from Firestore:", err);
      setProducts([]);
      return [];
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadOffers = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      const snap = await getDocs(collection(db, "offers"));
      const result = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Offer))
        .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      setOffers(result);
      return result;
    } catch (err) {
      console.error("Error loading offers from Firestore:", err);
      setOffers([]);
      return [];
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadStaff = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      const snap = await getDocs(collection(db, "staff"));
      const result = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Staff))
        .sort((a, b) => {
          if (a.role === "Owner" && b.role !== "Owner") return -1;
          if (a.role !== "Owner" && b.role === "Owner") return 1;
          const aIsManager = normalizeStaffRole(a.role) === "MANAGER";
          const bIsManager = normalizeStaffRole(b.role) === "MANAGER";
          if (aIsManager && !bIsManager) return -1;
          if (!aIsManager && bIsManager) return 1;
          return (a.name || "").localeCompare(b.name || "");
        });
      setStaff(result);
      return result;
    } catch (err) {
      console.error("Error loading staff from Firestore:", err);
      setStaff([]);
      return [];
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadSettings = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      const data = await getSettings();
      setSettings(data);
      if (data) {
        setGlobalCurrencyConfig(data.currencyLocale || "en-IN", data.currencyCode || "INR");
      }
      return data;
    } catch (err) {
      console.error("Error loading settings in context:", err);
      setSettings(null);
      return null;
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadPackages = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      let result: Package[] = [];
      try {
        const q = query(
          collection(db, "packages"),
          where("isActive", "==", true)
        );
        const snap = await getDocs(q);
        result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Package));
      } catch {
        const snap = await getDocs(collection(db, "packages"));
        result = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Package))
          .filter((p) => p.isActive !== false);
      }
      result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setPackages(result);
      return result;
    } catch (err) {
      console.error("Error loading packages from Firestore:", err);
      setPackages([]);
      return [];
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const refreshServices = useCallback(() => {
    return loadServices(false);
  }, [loadServices]);

  const refreshProducts = useCallback(() => {
    return loadProducts(false);
  }, [loadProducts]);

  const refreshPackages = useCallback(() => {
    return loadPackages(false);
  }, [loadPackages]);

  const refreshStaff = useCallback(() => {
    return loadStaff(false);
  }, [loadStaff]);

  const refreshOffers = useCallback(() => {
    return loadOffers(false);
  }, [loadOffers]);

  const refreshSettings = useCallback(() => {
    return loadSettings(false);
  }, [loadSettings]);

  const refreshCategories = useCallback(() => {
    return loadCategories(false);
  }, [loadCategories]);

  const invalidateCache = useCallback(() => {
    // No-op since cache is removed and Firestore is the direct source of truth
  }, []);

  useEffect(() => {
    async function initLoad() {
      setLoadingAppData(true);
      try {
        await Promise.all([
          loadServices(false),
          loadProducts(false),
          loadPackages(false),
          loadOffers(false),
          loadStaff(false),
          loadSettings(false),
          loadCategories(false),
        ]);
      } catch (err) {
        console.error("Failed initialization load from Firestore:", err);
      } finally {
        setLoadingAppData(false);
      }
    }
    initLoad();
  }, [loadServices, loadProducts, loadPackages, loadOffers, loadStaff, loadSettings, loadCategories]);

  // Real-time listener for staff duty status
  useEffect(() => {
    if (loadingAppData) return;

    const unsubStaff = onSnapshot(
      collection(db, "staff"),
      (snapshot) => {
        setStaff((prevStaff) => {
          let hasChanges = false;
          const updated = prevStaff.map((member) => {
            const change = snapshot.docChanges().find(
              (c) => c.doc.id === member.id && c.type === "modified"
            );
            if (change) {
              hasChanges = true;
              return {
                ...member,
                ...change.doc.data(),
                id: change.doc.id,
              } as Staff;
            }
            return member;
          });

          // Handle newly added staff
          const currentIds = new Set(prevStaff.map((s) => s.id));
          const addedStaff: Staff[] = [];
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added" && !currentIds.has(change.doc.id)) {
              hasChanges = true;
              addedStaff.push({
                id: change.doc.id,
                ...change.doc.data(),
              } as Staff);
            }
          });

          // Handle deleted staff
          const removedIds = new Set(
            snapshot.docChanges()
              .filter((c) => c.type === "removed")
              .map((c) => c.doc.id)
          );
          if (removedIds.size > 0) {
            hasChanges = true;
          }

          if (!hasChanges && addedStaff.length === 0 && removedIds.size === 0) {
            return prevStaff;
          }

          let finalStaff = updated;
          if (removedIds.size > 0) {
            finalStaff = finalStaff.filter((s) => !s.id || !removedIds.has(s.id));
          }
          if (addedStaff.length > 0) {
            finalStaff = [...finalStaff, ...addedStaff];
          }

          return finalStaff.sort((a, b) => {
            if (a.role === "Owner" && b.role !== "Owner") return -1;
            if (a.role !== "Owner" && b.role === "Owner") return 1;
            const aIsManager = normalizeStaffRole(a.role) === "MANAGER";
            const bIsManager = normalizeStaffRole(b.role) === "MANAGER";
            if (aIsManager && !bIsManager) return -1;
            if (!aIsManager && bIsManager) return 1;
            return (a.name || "").localeCompare(b.name || "");
          });
        });
      },
      (err) => console.error("Staff real-time listener error:", err)
    );

    return () => {
      unsubStaff();
    };
  }, [loadingAppData]);

  const contextValue = useMemo(() => ({
    services,
    products,
    packages,
    staff,
    offers,
    settings,
    categories,
    loadingAppData,
    refreshServices,
    refreshProducts,
    refreshPackages,
    refreshStaff,
    refreshOffers,
    refreshSettings,
    refreshCategories,
    invalidateCache,
  }), [
    services,
    products,
    packages,
    staff,
    offers,
    settings,
    categories,
    loadingAppData,
    refreshServices,
    refreshProducts,
    refreshPackages,
    refreshStaff,
    refreshOffers,
    refreshSettings,
    refreshCategories,
    invalidateCache,
  ]);

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }
  return context;
}
