import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import type { Package } from "@/types/package";
import { toTitleCase } from "@/lib/utils/text";

const COLLECTION_NAME = "packages";
const DEFAULT_BUSINESS_ID = "blow-salon";

export async function create(pkg: Omit<Package, "id">): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      businessId: pkg.businessId || DEFAULT_BUSINESS_ID,
      name: toTitleCase(pkg.name),
      price: Number(pkg.price) || 0,
      gender: pkg.gender || "both",
      includes: pkg.includes || [],
      isActive: pkg.isActive !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating package in Firestore:", error);
    throw error;
  }
}

export async function getAll(includeInactive = false): Promise<Package[]> {
  try {
    const packages: Package[] = [];
    if (includeInactive) {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      snap.forEach((d) => {
        packages.push({ id: d.id, ...d.data() } as Package);
      });
    } else {
      try {
        const q = query(
          collection(db, COLLECTION_NAME),
          where("isActive", "==", true)
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          packages.push({ id: d.id, ...d.data() } as Package);
        });
      } catch {
        const snap = await getDocs(collection(db, COLLECTION_NAME));
        snap.forEach((d) => {
          const data = d.data();
          if (data.isActive !== false) {
            packages.push({ id: d.id, ...data } as Package);
          }
        });
      }
    }
    return packages.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (error) {
    console.error("Error getting packages from Firestore:", error);
    throw error;
  }
}

export async function getById(id: string): Promise<Package | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Package;
    }
    return null;
  } catch (error) {
    console.error(`Error getting package by ID (${id}):`, error);
    throw error;
  }
}

export async function update(
  id: string,
  data: Partial<Omit<Package, "id">>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const normalizedData: Record<string, any> = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    if (normalizedData.name) {
      normalizedData.name = toTitleCase(normalizedData.name);
    }
    if (normalizedData.price !== undefined) {
      normalizedData.price = Number(normalizedData.price) || 0;
    }
    await updateDoc(docRef, normalizedData);
  } catch (error) {
    console.error(`Error updating package (${id}):`, error);
    throw error;
  }
}

export async function remove(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      isActive: false,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`Error soft-deleting package (${id}):`, error);
    throw error;
  }
}

export { remove as delete };
