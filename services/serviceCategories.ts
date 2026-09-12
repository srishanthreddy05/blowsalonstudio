import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import type { ServiceCategory } from "@/types/serviceCategory";
import { toTitleCase } from "@/lib/utils/text";

const COLLECTION_NAME = "serviceCategories";
const DEFAULT_BUSINESS_ID = "blow-salon";

export async function getAll(): Promise<ServiceCategory[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    const categories: ServiceCategory[] = [];
    querySnapshot.forEach((doc) => {
      categories.push({ id: doc.id, ...doc.data() } as ServiceCategory);
    });
    return categories;
  } catch (error) {
    console.error("Error getting service categories:", error);
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const categories: ServiceCategory[] = [];
      snap.forEach((doc) => {
        categories.push({ id: doc.id, ...doc.data() } as ServiceCategory);
      });
      return categories.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } catch {
      throw error;
    }
  }
}

export async function create(name: string, gender: "men" | "women" | "both" = "both"): Promise<string> {
  try {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Category name cannot be empty");
    }

    const titleCased = toTitleCase(trimmed);

    // Fetch existing categories to perform case-insensitive duplicate check
    const categories = await getAll();
    const exists = categories.some(
      (c) => c.name.toLowerCase() === titleCased.toLowerCase()
    );

    if (exists) {
      throw new Error(`Category "${titleCased}" already exists.`);
    }

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      businessId: DEFAULT_BUSINESS_ID,
      name: titleCased,
      gender,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating service category in Firestore:", error);
    throw error;
  }
}

export async function remove(id: string): Promise<void> {
  try {
    const { doc, deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    console.error("Error deleting service category:", error);
    throw error;
  }
}

export async function update(id: string, name: string, gender?: "men" | "women" | "both"): Promise<void> {
  try {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Category name cannot be empty");
    }
    const titleCased = toTitleCase(trimmed);
    const { doc, updateDoc } = await import("firebase/firestore");
    const updateData: Record<string, any> = {
      name: titleCased,
    };
    if (gender) {
      updateData.gender = gender;
    }
    await updateDoc(doc(db, COLLECTION_NAME, id), updateData);
  } catch (error) {
    console.error("Error updating service category:", error);
    throw error;
  }
}
