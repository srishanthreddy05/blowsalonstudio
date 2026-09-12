import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import type { Service } from "@/types/service";
import { toTitleCase } from "@/lib/utils/text";

const COLLECTION_NAME = "services";
const DEFAULT_BUSINESS_ID = "blow-salon";

export async function create(service: Omit<Service, "id">): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...service,
      businessId: service.businessId || DEFAULT_BUSINESS_ID,
      name: toTitleCase(service.name),
      gender: service.gender || "both",
      price: Number(service.price) || 0,
      ...(service.startingPrice !== undefined ? { startingPrice: Number(service.startingPrice) } : {}),
      ...(service.priceLabel ? { priceLabel: service.priceLabel } : {}),
      ...(service.priceUnit ? { priceUnit: service.priceUnit } : {}),
      ...(service.variants ? { variants: service.variants } : {}),
      ...(service.category ? { category: toTitleCase(service.category) } : {}),
      isActive: service.isActive !== false,
      createdAt: service.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating service in Firestore:", error);
    throw error;
  }
}

export async function getAll(includeInactive = false): Promise<Service[]> {
  try {
    if (includeInactive) {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const services: Service[] = [];
      snap.forEach((d) => {
        services.push({ id: d.id, ...d.data() } as Service);
      });
      return services.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where("isActive", "==", true),
        orderBy("name", "asc")
      );
      const querySnapshot = await getDocs(q);
      const services: Service[] = [];
      querySnapshot.forEach((doc) => {
        services.push({ id: doc.id, ...doc.data() } as Service);
      });
      return services;
    } catch {
      // Fallback while composite index is building on Firestore
      const fallbackQuery = query(
        collection(db, COLLECTION_NAME),
        where("isActive", "==", true)
      );
      const querySnapshot = await getDocs(fallbackQuery);
      const services: Service[] = [];
      querySnapshot.forEach((doc) => {
        services.push({ id: doc.id, ...doc.data() } as Service);
      });
      return services.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
  } catch (error) {
    console.error("Error getting all services from Firestore:", error);
    throw error;
  }
}

async function deleteService(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Error soft-deleting service (${id}):`, error);
    throw error;
  }
}

export async function getById(id: string): Promise<Service | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Service;
    }
    return null;
  } catch (error) {
    console.error(`Error getting service by ID (${id}) from Firestore:`, error);
    throw error;
  }
}

export async function update(
  id: string,
  data: Partial<Omit<Service, "id">>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const normalizedData: Record<string, any> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    if (normalizedData.name) {
      normalizedData.name = toTitleCase(normalizedData.name);
    }
    if (normalizedData.category) {
      normalizedData.category = toTitleCase(normalizedData.category);
    }
    if (normalizedData.price !== undefined) {
      normalizedData.price = Number(normalizedData.price) || 0;
    }
    await updateDoc(docRef, normalizedData);
  } catch (error) {
    console.error(`Error updating service (${id}) in Firestore:`, error);
    throw error;
  }
}

export { deleteService as delete };