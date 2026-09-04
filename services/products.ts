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
  serverTimestamp,
} from "firebase/firestore";
import type { Product } from "@/types/product";
import { toTitleCase } from "@/lib/utils/text";

const COLLECTION = "products";

function sanitizeData<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return clean;
}

export async function create(product: Omit<Product, "id">): Promise<string> {
  try {
    const rawData = {
      ...product,
      name: toTitleCase(product.name),
      isActive: true,
      createdAt: serverTimestamp(),
    };
    const cleanData = sanitizeData(rawData);
    const docRef = await addDoc(collection(db, COLLECTION), cleanData);
    return docRef.id;
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
}

/**
 * Returns only active (non-deleted) products, ordered by name.
 */
export async function getAll(): Promise<Product[]> {
  try {
    try {
      const q = query(
        collection(db, COLLECTION),
        where("isActive", "==", true),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
    } catch {
      // Graceful fallback while composite index is building on Firestore
      const fallbackQuery = query(
        collection(db, COLLECTION),
        where("isActive", "==", true)
      );
      const snap = await getDocs(fallbackQuery);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
      return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
}

export async function getById(id: string): Promise<Product | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Product;
  } catch (error) {
    console.error(`Error fetching product ${id}:`, error);
    throw error;
  }
}

export async function update(
  id: string,
  data: Partial<Omit<Product, "id">>
): Promise<void> {
  try {
    const normalizedData = { ...data };
    if (normalizedData.name) {
      normalizedData.name = toTitleCase(normalizedData.name);
    }
    const cleanData = sanitizeData(normalizedData);
    await updateDoc(doc(db, COLLECTION, id), cleanData);
  } catch (error) {
    console.error(`Error updating product ${id}:`, error);
    throw error;
  }
}

/**
 * Soft delete — sets isActive: false so historical invoice lines still resolve.
 * The product disappears from getAll() but its data is preserved in Firestore.
 */
async function deleteProduct(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, id), { isActive: false });
  } catch (error) {
    console.error(`Error soft-deleting product ${id}:`, error);
    throw error;
  }
}

export { deleteProduct as delete };