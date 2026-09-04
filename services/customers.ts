import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  setDoc,
  increment,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import type { Customer } from "@/types/customer";
import { toTitleCase } from "@/lib/utils/text";

const COLLECTION_NAME = "customers";
const STATS_DOC = doc(db, "stats", "customers");

export async function getStats(): Promise<{ regularCount: number; membershipCount: number }> {
  try {
    const snap = await getDoc(STATS_DOC);
    if (snap.exists()) {
      const data = snap.data();
      return {
        regularCount: data.regularCount || 0,
        membershipCount: data.membershipCount || 0,
      };
    }
    return { regularCount: 0, membershipCount: 0 };
  } catch (error) {
    console.error("Error getting customer stats:", error);
    return { regularCount: 0, membershipCount: 0 };
  }
}

export async function create(customer: Omit<Customer, "id">): Promise<string> {
  try {
    const newDocRef = doc(collection(db, COLLECTION_NAME));
    const isMembership = customer.customerType === "membership";
    const counterField = isMembership ? "membershipCount" : "regularCount";

    const batch = writeBatch(db);
    batch.set(newDocRef, {
      name: toTitleCase(customer.name),
      phone: customer.phone,
      customerType: customer.customerType,
      createdAt: customer.createdAt || new Date().toISOString(),
      ...(customer.customerType === "membership" ? {
        membershipAmount: customer.membershipAmount ?? null,
        membershipDuration: customer.membershipDuration ?? null,
        membershipStart: customer.membershipStart ?? null,
        membershipEnd: customer.membershipEnd ?? null,
      } : {})
    });

    // Increment stats counter in the same batch
    batch.set(STATS_DOC, {
      [counterField]: increment(1)
    }, { merge: true });

    await batch.commit();

    return newDocRef.id;
  } catch (error) {
    console.error("Error creating customer in Firestore:", error);
    throw error;
  }
}

export async function getAll(): Promise<Customer[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    const customers: Customer[] = [];
    querySnapshot.forEach((doc) => {
      customers.push({
        id: doc.id,
        ...doc.data(),
      } as Customer);
    });
    return customers;
  } catch (error) {
    console.error("Error getting all customers from Firestore:", error);
    throw error;
  }
}

export async function getById(id: string): Promise<Customer | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Customer;
    }
    return null;
  } catch (error) {
    console.error(`Error getting customer by ID (${id}) from Firestore:`, error);
    throw error;
  }
}

export async function getByPhone(phone: string): Promise<Customer | null> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("phone", "==", phone));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const firstDoc = querySnapshot.docs[0];
      return {
        id: firstDoc.id,
        ...firstDoc.data(),
      } as Customer;
    }
    return null;
  } catch (error) {
    console.error(`Error getting customer by phone (${phone}) from Firestore:`, error);
    throw error;
  }
}

export async function update(
  id: string,
  data: Partial<Omit<Customer, "id">>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const normalizedData = { ...data };
    if (normalizedData.name) {
      normalizedData.name = toTitleCase(normalizedData.name);
    }

    await runTransaction(db, async (transaction) => {
      // 1. Transaction read
      const oldDocSnap = await transaction.get(docRef);
      if (!oldDocSnap.exists()) {
        throw new Error("Customer document does not exist");
      }

      const oldType = oldDocSnap.data().customerType || "regular";
      const newType = normalizedData.customerType;

      // 2. Transaction writes
      if (newType && oldType !== newType) {
        const oldField = oldType === "membership" ? "membershipCount" : "regularCount";
        const newField = newType === "membership" ? "membershipCount" : "regularCount";
        transaction.set(STATS_DOC, {
          [oldField]: increment(-1),
          [newField]: increment(1)
        }, { merge: true });
      }

      transaction.update(docRef, normalizedData as Record<string, any>);
    });
  } catch (error) {
    console.error(`Error updating customer (${id}) in Firestore:`, error);
    throw error;
  }
}

async function deleteCustomer(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);

    // 1. Fresh getDoc to verify doc existence
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      // If customer doesn't exist, we consider it a failed-precondition (already deleted)
      const error = new Error("This customer was already removed");
      (error as any).code = "failed-precondition";
      throw error;
    }

    const customer = docSnap.data();
    const isMembership = customer.customerType === "membership";
    const counterField = isMembership ? "membershipCount" : "regularCount";

    // 2. Verify stats counter won't go negative
    const statsSnap = await getDoc(STATS_DOC);
    let currentCount = 0;
    if (statsSnap.exists()) {
      currentCount = statsSnap.data()[counterField] || 0;
    }

    // 3. Perform batch delete
    const batch = writeBatch(db);
    batch.delete(docRef);

    if (currentCount > 0) {
      batch.set(STATS_DOC, {
        [counterField]: increment(-1)
      }, { merge: true });
    }

    await batch.commit();
  } catch (error: any) {
    console.error(`Error deleting customer (${id}) from Firestore:`, error);
    throw error;
  }
}

export async function getMemberships(): Promise<Customer[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("customerType", "==", "membership")
    );
    const snap = await getDocs(q);
    const list: Customer[] = [];
    snap.forEach((doc) => {
      list.push({
        id: doc.id,
        ...doc.data(),
      } as Customer);
    });
    return list;
  } catch (error) {
    console.error("Error getting membership customers:", error);
    throw error;
  }
}

export async function checkAndExpireMemberships(): Promise<Customer[]> {
  try {
    if (typeof window !== "undefined") {
      const todayStr = new Date().toISOString().split("T")[0];
      const lastCheck = localStorage.getItem("lastMembershipExpiryCheck");
      if (lastCheck === todayStr) {
        return [];
      }
    }

    const nowStr = new Date().toISOString();
    let snap: any;
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where("customerType", "==", "membership"),
        where("membershipEnd", "<", nowStr)
      );
      snap = await getDocs(q);
    } catch {
      const fallbackQuery = query(
        collection(db, COLLECTION_NAME),
        where("customerType", "==", "membership")
      );
      const allMemberships = await getDocs(fallbackQuery);
      const docs = allMemberships.docs.filter((d) => {
        const data = d.data() as Customer;
        return data.membershipEnd && data.membershipEnd < nowStr;
      });
      snap = { empty: docs.length === 0, docs };
    }
    const expiredCustomers: Customer[] = [];
    
    if (!snap.empty) {
      const batch = writeBatch(db);
      let expiredCount = 0;

      for (const docSnap of snap.docs) {
        const id = docSnap.id;
        const data = docSnap.data() as Customer;
        
        // 1. Queue customer update in batch
        const docRef = doc(db, COLLECTION_NAME, id);
        batch.update(docRef, {
          customerType: "regular",
          membershipAmount: null,
          membershipDuration: null,
          membershipStart: null,
          membershipEnd: null,
        });
        
        // 2. Queue notification in batch
        const notifRef = doc(collection(db, "notifications"));
        batch.set(notifRef, {
          title: "Membership Expired",
          message: `Membership for ${data.name} (${data.phone}) has expired and has been reverted to Regular.`,
          type: "alert",
          read: false,
          createdAt: new Date().toISOString(),
        });
        
        expiredCustomers.push({
          id,
          ...data,
          customerType: "regular",
        });
        expiredCount++;
      }

      // 3. Update stats counters in batch to ensure consistency
      const statsSnap = await getDoc(STATS_DOC);
      let currentRegularCount = 0;
      let currentMembershipCount = 0;
      if (statsSnap.exists()) {
        const statsData = statsSnap.data();
        currentRegularCount = statsData.regularCount || 0;
        currentMembershipCount = statsData.membershipCount || 0;
      }

      const regularDelta = expiredCount;
      const membershipDelta = -expiredCount;

      batch.set(STATS_DOC, {
        regularCount: increment(regularDelta),
        membershipCount: increment(membershipDelta)
      }, { merge: true });

      await batch.commit();
    }
    
    if (typeof window !== "undefined") {
      const todayStr = new Date().toISOString().split("T")[0];
      localStorage.setItem("lastMembershipExpiryCheck", todayStr);
    }
    
    return expiredCustomers;
  } catch (error) {
    console.error("Error checking and expiring memberships:", error);
    return [];
  }
}

export { deleteCustomer as delete };
