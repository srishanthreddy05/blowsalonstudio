import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import {
  getFirestore,
  type Firestore,
  type DocumentReference,
  type CollectionReference,
  type Query,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
  type QuerySnapshot,
  type Transaction,
  type WriteBatch,
  type WhereFilterOp,
  type OrderByDirection,
} from "firebase-admin/firestore";

let adminApp: App;

function initFirebaseAdmin(): App {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "blowsalonstudio";

  // 1. Service Account JSON in FIREBASE_SERVICE_ACCOUNT_KEY (raw JSON or base64 encoded)
  const serviceAccountRaw =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (serviceAccountRaw) {
    try {
      let jsonStr = serviceAccountRaw.trim();
      if (!jsonStr.startsWith("{")) {
        // Base64 decode attempt
        jsonStr = Buffer.from(jsonStr, "base64").toString("utf-8");
      }
      const parsed = JSON.parse(jsonStr);
      return initializeApp({
        credential: cert(parsed),
        projectId: parsed.project_id || projectId,
      });
    } catch (err) {
      console.warn("[Firebase Admin] Failed to parse service account JSON credential:", err);
    }
  }

  // 2. Individual environment variables (FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    // Unescape newlines for multiline PEM keys stored in environment variables
    privateKey = privateKey.replace(/\\n/g, "\n");
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  // 3. Fallback: Project ID only (ambient Google Cloud environment, ADC, or Firestore emulator)
  return initializeApp({
    projectId,
  });
}

adminApp = initFirebaseAdmin();
export const adminDb: Firestore = getFirestore(adminApp);
export { adminApp };

// ── Client-SDK-compatible wrappers for server-side execution ────────────────

export interface WrappedDocumentSnapshot<T = any> {
  id: string;
  ref: DocumentReference;
  exists: () => boolean;
  data: () => T | undefined;
  get: (fieldPath: string) => any;
}

export interface WrappedQuerySnapshot<T = any> {
  docs: WrappedDocumentSnapshot<T>[];
  empty: boolean;
  size: number;
  forEach: (callback: (result: WrappedDocumentSnapshot<T>) => void) => void;
}

export function wrapDocumentSnapshot<T = any>(snap: DocumentSnapshot): WrappedDocumentSnapshot<T> {
  return {
    id: snap.id,
    ref: snap.ref,
    exists: () => snap.exists,
    data: () => snap.data() as T | undefined,
    get: (fieldPath: string) => snap.get(fieldPath),
  };
}

export function wrapQuerySnapshot<T = any>(qSnap: QuerySnapshot): WrappedQuerySnapshot<T> {
  const docs = qSnap.docs.map((d) => wrapDocumentSnapshot<T>(d));
  return {
    docs,
    empty: qSnap.empty,
    size: qSnap.size,
    forEach: (cb) => docs.forEach(cb),
  };
}

export type QueryConstraint =
  | { type: "where"; field: string; op: WhereFilterOp; value: any }
  | { type: "orderBy"; field: string; direction: OrderByDirection }
  | { type: "limit"; limit: number };

export function where(field: string, op: WhereFilterOp, value: any): QueryConstraint {
  return { type: "where", field, op, value };
}

export function orderBy(field: string, direction: OrderByDirection = "asc"): QueryConstraint {
  return { type: "orderBy", field, direction };
}

export function limit(n: number): QueryConstraint {
  return { type: "limit", limit: n };
}

export function query(
  base: CollectionReference | Query,
  ...constraints: QueryConstraint[]
): Query {
  let curr: Query = base;
  for (const c of constraints) {
    if (c.type === "where") {
      curr = curr.where(c.field, c.op, c.value);
    } else if (c.type === "orderBy") {
      curr = curr.orderBy(c.field, c.direction);
    } else if (c.type === "limit") {
      curr = curr.limit(c.limit);
    }
  }
  return curr;
}

export function collection(db: Firestore, collectionPath: string): CollectionReference {
  return db.collection(collectionPath);
}

export function doc(
  dbOrCol: Firestore | CollectionReference,
  pathOrId?: string,
  ...pathSegments: string[]
): DocumentReference {
  if (typeof (dbOrCol as Firestore).collection === "function") {
    const fullPath = [pathOrId || "", ...pathSegments].filter(Boolean).join("/");
    return (dbOrCol as Firestore).doc(fullPath);
  }
  if (!pathOrId) {
    return (dbOrCol as CollectionReference).doc();
  }
  return (dbOrCol as CollectionReference).doc(pathOrId);
}

export async function getDoc<T = any>(docRef: DocumentReference): Promise<WrappedDocumentSnapshot<T>> {
  const snap = await docRef.get();
  return wrapDocumentSnapshot<T>(snap);
}

export async function getDocs<T = any>(q: Query | CollectionReference): Promise<WrappedQuerySnapshot<T>> {
  const qSnap = await q.get();
  return wrapQuerySnapshot<T>(qSnap);
}

export async function setDoc(
  docRef: DocumentReference,
  data: any,
  options?: { merge?: boolean }
): Promise<void> {
  if (options?.merge) {
    await docRef.set(data, { merge: true });
  } else {
    await docRef.set(data);
  }
}

export async function updateDoc(
  docRef: DocumentReference,
  data: Record<string, any>
): Promise<void> {
  await docRef.update(data);
}

export async function deleteDoc(docRef: DocumentReference): Promise<void> {
  await docRef.delete();
}

export async function addDoc(
  collectionRef: CollectionReference,
  data: any
): Promise<DocumentReference> {
  return collectionRef.add(data);
}

export async function runTransaction<T>(
  _firestore: Firestore,
  updateFunction: (transaction: {
    get: (ref: DocumentReference) => Promise<WrappedDocumentSnapshot>;
    set: (ref: DocumentReference, data: any, options?: { merge?: boolean }) => void;
    update: (ref: DocumentReference, data: Record<string, any>) => void;
    delete: (ref: DocumentReference) => void;
  }) => Promise<T>
): Promise<T> {
  return adminDb.runTransaction(async (adminTxn: Transaction) => {
    const wrappedTxn = {
      get: async (ref: DocumentReference) => {
        const snap = await adminTxn.get(ref);
        return wrapDocumentSnapshot(snap);
      },
      set: (ref: DocumentReference, data: any, options?: { merge?: boolean }) => {
        if (options?.merge) {
          adminTxn.set(ref, data, { merge: true });
        } else {
          adminTxn.set(ref, data);
        }
      },
      update: (ref: DocumentReference, data: Record<string, any>) => {
        adminTxn.update(ref, data);
      },
      delete: (ref: DocumentReference) => {
        adminTxn.delete(ref);
      },
    };
    return updateFunction(wrappedTxn);
  });
}

export function writeBatch(_firestore: Firestore) {
  const batch: WriteBatch = adminDb.batch();
  return {
    set: (ref: DocumentReference, data: any, options?: { merge?: boolean }) => {
      if (options?.merge) {
        batch.set(ref, data, { merge: true });
      } else {
        batch.set(ref, data);
      }
    },
    update: (ref: DocumentReference, data: Record<string, any>) => {
      batch.update(ref, data);
    },
    delete: (ref: DocumentReference) => {
      batch.delete(ref);
    },
    commit: async () => {
      await batch.commit();
    },
  };
}
