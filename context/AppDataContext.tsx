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
  doc,
  setDoc,
} from "firebase/firestore";
import type { Service } from "@/types/service";
import type { Product } from "@/types/product";
import type { Staff } from "@/types/staff";
import type { Offer } from "@/types/offer";
import type { Settings } from "@/types/settings";
import type { ServiceCategory } from "@/types/serviceCategory";
import { getSettings } from "@/services/settings";
import { toTitleCase } from "@/lib/utils/text";
import { setGlobalCurrencyConfig } from "@/components/salon-dashboard/types";
import {
  CACHE_TTL,
  CACHE_KEYS,
  readCache,
  writeCache,
  clearCache,
  isCacheExpired,
} from "@/lib/cache";

interface AppDataContextType {
  services: Service[];
  products: Product[];
  staff: Staff[];
  offers: Offer[];
  settings: Settings | null;
  categories: ServiceCategory[];
  loadingAppData: boolean;
  refreshServices: () => Promise<Service[]>;
  refreshProducts: () => Promise<Product[]>;
  refreshStaff: () => Promise<Staff[]>;
  refreshOffers: () => Promise<Offer[]>;
  refreshSettings: () => Promise<Settings | null>;
  refreshCategories: () => Promise<ServiceCategory[]>;
  invalidateCache: (key: "services" | "products" | "settings" | "serviceCategories") => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loadingAppData, setLoadingAppData] = useState(true);

  const loadCategories = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      const cached = readCache<ServiceCategory>(CACHE_KEYS.serviceCategories, CACHE_TTL.serviceCategories);
      if (cached) {
        setCategories(cached);
        return cached;
      }
      const q = query(
        collection(db, "serviceCategories"),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q);
      const result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceCategory));
      
      // Seeding / migration first-run grace handler
      if (result.length === 0) {
        // Fetch only active services to extract categories
        const servicesSnap = await getDocs(
          query(collection(db, "services"), where("isActive", "==", true))
        );
        const uniqueCats = new Set<string>();
        servicesSnap.forEach((d) => {
          const data = d.data();
          if (data.category) {
            uniqueCats.add(data.category.trim());
          }
        });
        
        // Replace with your salon's categories before seeding
        const DEFAULT_CATEGORIES = [
          "Hair", "Skin", "Nails", "Spa", "Body", "Other"
        ];
        
        const catsToSeed = uniqueCats.size > 0 
          ? Array.from(uniqueCats).map(c => toTitleCase(c))
          : DEFAULT_CATEGORIES;
          
        const seeded: ServiceCategory[] = [];
        for (const catName of catsToSeed) {
          const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const docRef = doc(collection(db, "serviceCategories"), slug || undefined);
          await setDoc(docRef, {
            name: catName,
            createdAt: new Date().toISOString(),
          });
          seeded.push({ id: docRef.id, name: catName, createdAt: new Date().toISOString() });
        }
        
        seeded.sort((a, b) => a.name.localeCompare(b.name));
        writeCache(CACHE_KEYS.serviceCategories, seeded);
        setCategories(seeded);
        return seeded;
      }

      writeCache(CACHE_KEYS.serviceCategories, result);
      setCategories(result);
      return result;
    } catch (err) {
      console.error("Error loading categories:", err);
      const fallback = readCache<ServiceCategory>(CACHE_KEYS.serviceCategories, Infinity);
      if (fallback) {
        setCategories(fallback);
        return fallback;
      } else {
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
      const cached = readCache<Service>(CACHE_KEYS.services, CACHE_TTL.services);
      if (cached) {
        setServices(cached);
        return cached;
      }
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

      writeCache(CACHE_KEYS.services, result);
      setServices(result);
      return result;
    } catch (err) {
      console.error("Error loading services:", err);
      const fallback = readCache<Service>(CACHE_KEYS.services, Infinity);
      if (fallback) {
        setServices(fallback);
        return fallback;
      } else {
        setServices([]);
        return [];
      }
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadProducts = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      const cached = readCache<Product>(CACHE_KEYS.products, CACHE_TTL.products);
      if (cached) {
        setProducts(cached);
        return cached;
      }
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

      writeCache(CACHE_KEYS.products, result);
      setProducts(result);
      return result;
    } catch (err) {
      console.error("Error loading products:", err);
      const fallback = readCache<Product>(CACHE_KEYS.products, Infinity);
      if (fallback) {
        setProducts(fallback);
        return fallback;
      } else {
        setProducts([]);
        return [];
      }
    } finally {
      if (showLoading) setLoadingAppData(false);
    }
  }, []);

  const loadOffers = useCallback(async (showLoading = false) => {
    if (showLoading) setLoadingAppData(true);
    try {
      const q = query(
        collection(db, "offers"),
        orderBy("code", "asc")
      );
      const snap = await getDocs(q);
      const result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Offer));
      setOffers(result);
      return result;
    } catch (err) {
      console.error("Error loading offers:", err);
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
      const result = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Staff)).sort((a, b) => a.name.localeCompare(b.name));
      setStaff(result);
      return result;
    } catch (err) {
      console.error("Error loading staff:", err);
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

  const refreshServices = useCallback(() => {
    clearCache(CACHE_KEYS.services);
    return loadServices(false);
  }, [loadServices]);

  const refreshProducts = useCallback(() => {
    clearCache(CACHE_KEYS.products);
    return loadProducts(false);
  }, [loadProducts]);

  const refreshStaff = useCallback(() => {
    return loadStaff(false);
  }, [loadStaff]);

  const refreshOffers = useCallback(() => {
    return loadOffers(false);
  }, [loadOffers]);

  const refreshSettings = useCallback(() => {
    clearCache(CACHE_KEYS.settings);
    return loadSettings(false);
  }, [loadSettings]);

  const refreshCategories = useCallback(() => {
    clearCache(CACHE_KEYS.serviceCategories);
    return loadCategories(false);
  }, [loadCategories]);

  const invalidateCache = useCallback((key: "services" | "products" | "settings" | "serviceCategories") => {
    clearCache(CACHE_KEYS[key]);
  }, []);

  useEffect(() => {
    async function initLoad() {
      setLoadingAppData(true);
      try {
        await Promise.all([
          loadServices(false),
          loadProducts(false),
          loadOffers(false),
          loadStaff(false),
          loadSettings(false),
          loadCategories(false),
        ]);
      } catch (err) {
        console.error("Failed parallel initialization load:", err);
      } finally {
        setLoadingAppData(false);
      }
    }
    initLoad();
  }, [loadServices, loadProducts, loadOffers, loadStaff, loadSettings, loadCategories]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (isCacheExpired(CACHE_KEYS.services, CACHE_TTL.services)) {
          refreshServices();
        }
        if (isCacheExpired(CACHE_KEYS.products, CACHE_TTL.products)) {
          refreshProducts();
        }
        if (isCacheExpired(CACHE_KEYS.settings, CACHE_TTL.settings)) {
          refreshSettings();
        }
        if (isCacheExpired(CACHE_KEYS.serviceCategories, CACHE_TTL.serviceCategories)) {
          refreshCategories();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshServices, refreshProducts, refreshSettings, refreshCategories]);

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
              const newData = change.doc.data();
              const dutyChanged = member.dutyStatus !== newData.dutyStatus;
              const logsChanged = JSON.stringify(member.clockLogs) !== JSON.stringify(newData.clockLogs);

              if (dutyChanged || logsChanged) {
                hasChanges = true;
                return {
                  ...member,
                  dutyStatus: newData.dutyStatus,
                  clockLogs: newData.clockLogs,
                } as Staff;
              }
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

          return finalStaff.sort((a, b) => a.name.localeCompare(b.name));
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
    staff,
    offers,
    settings,
    categories,
    loadingAppData,
    refreshServices,
    refreshProducts,
    refreshStaff,
    refreshOffers,
    refreshSettings,
    refreshCategories,
    invalidateCache,
  }), [
    services,
    products,
    staff,
    offers,
    settings,
    categories,
    loadingAppData,
    refreshServices,
    refreshProducts,
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
