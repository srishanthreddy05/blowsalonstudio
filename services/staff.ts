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
  orderBy,
} from "firebase/firestore";
import type { Staff } from "@/types/staff";
import { normalizeStaffRole } from "@/types/staff";
import { toTitleCase } from "@/lib/utils/text";

const COLLECTION_NAME = "staff";

export async function create(member: Omit<Staff, "id">): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...member,
      name: toTitleCase(member.name),
      role: normalizeStaffRole(member.role),
      dutyStatus: member.dutyStatus || "offDuty",
      createdAt: member.createdAt || new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating staff member:", error);
    throw error;
  }
}

export async function getAll(): Promise<Staff[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);
    const staffList: Staff[] = [];
    querySnapshot.forEach((doc) => {
      staffList.push({
        id: doc.id,
        ...doc.data(),
      } as Staff);
    });
    return staffList;
  } catch (error) {
    console.error("Error getting all staff members:", error);
    throw error;
  }
}

export async function getById(id: string): Promise<Staff | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Staff;
    }
    return null;
  } catch (error) {
    console.error(`Error getting staff by ID (${id}):`, error);
    throw error;
  }
}

export async function update(
  id: string,
  data: Partial<Omit<Staff, "id">>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const normalizedData = { ...data };
    if (normalizedData.name) {
      normalizedData.name = toTitleCase(normalizedData.name);
    }
    if (normalizedData.role !== undefined) {
      normalizedData.role = normalizeStaffRole(normalizedData.role);
    }
    await updateDoc(docRef, normalizedData);
  } catch (error) {
    console.error(`Error updating staff member (${id}):`, error);
    throw error;
  }
}

async function deleteStaff(id: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`Error deleting staff member (${id}):`, error);
    throw error;
  }
}

export { deleteStaff as delete };
