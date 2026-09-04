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
  orderBy,
} from "firebase/firestore";
import type { CreditBalance } from "@/types/creditBalance";

const COLLECTION_NAME = "credit_balances";

export async function create(
  credit: Omit<CreditBalance, "id" | "createdAt" | "status"> & { createdAt?: string }
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...credit,
      status: "pending",
      createdAt: credit.createdAt || new Date().toISOString(),
      settledAt: null,
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating credit balance:", error);
    throw error;
  }
}

export async function getPendingByCustomerId(customerId: string): Promise<CreditBalance[]> {
  try {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where("customerId", "==", customerId),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const results: CreditBalance[] = [];
      snap.forEach((doc) => {
        results.push({
          id: doc.id,
          ...doc.data(),
        } as CreditBalance);
      });
      return results;
    } catch {
      // Fallback while composite index builds
      const fallbackQ = query(
        collection(db, COLLECTION_NAME),
        where("customerId", "==", customerId)
      );
      const snap = await getDocs(fallbackQ);
      const results: CreditBalance[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as CreditBalance;
        if (data.status === "pending") {
          results.push({
            id: doc.id,
            ...data,
          });
        }
      });
      return results.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    }
  } catch (error) {
    console.error("Error getting pending credit balances by customer:", error);
    return [];
  }
}

export async function getAllPending(): Promise<CreditBalance[]> {
  try {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const results: CreditBalance[] = [];
      snap.forEach((doc) => {
        results.push({
          id: doc.id,
          ...doc.data(),
        } as CreditBalance);
      });
      return results;
    } catch {
      // Fallback while composite index builds
      const fallbackQ = query(
        collection(db, COLLECTION_NAME),
        where("status", "==", "pending")
      );
      const snap = await getDocs(fallbackQ);
      const results: CreditBalance[] = [];
      snap.forEach((doc) => {
        results.push({
          id: doc.id,
          ...doc.data(),
        } as CreditBalance);
      });
      return results.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    }
  } catch (error) {
    console.error("Error getting all pending credit balances:", error);
    return [];
  }
}
export async function settle(id: string, collectedAmount?: number, providedBatch?: any): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    
    // Retrieve the document first to calculate the correct remainingAmount
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error(`Credit balance document ${id} not found`);
    }
    const data = snap.data();
    const currentRemaining = data.remainingAmount !== undefined ? data.remainingAmount : (data.amount ?? 0);
    const amountToSettle = collectedAmount !== undefined ? collectedAmount : currentRemaining;
    const newRemaining = Math.max(0, currentRemaining - amountToSettle);
    const isFullySettled = newRemaining <= 0;
    
    const updateData: any = {
      remainingAmount: newRemaining,
      collectionStatus: isFullySettled ? "settled" : "partial",
      status: isFullySettled ? "settled" : "pending", // fallback for legacy compatibility
      updatedAt: new Date().toISOString(),
    };
    
    if (isFullySettled) {
      updateData.settledAt = new Date().toISOString();
    }
    
    if (providedBatch) {
      providedBatch.update(docRef, updateData);
    } else {
      await updateDoc(docRef, updateData);
    }
  } catch (error) {
    console.error(`Error settling credit balance ${id}:`, error);
    throw error;
  }
}
