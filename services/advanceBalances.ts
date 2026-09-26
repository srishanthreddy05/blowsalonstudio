import { db } from "@/lib/firebase";
import { doc, getDoc, runTransaction, Timestamp } from "firebase/firestore";
import type { AdvanceBalance, AdvanceTransaction } from "@/types/advanceBalance";

const COLLECTION = "advance_balances";

/**
 * Fetches the advance balance record for a customer by customerId.
 * Returns null if no record exists.
 */
export async function getByCustomerId(customerId: string): Promise<AdvanceBalance | null> {
  try {
    const docRef = doc(db, COLLECTION, customerId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as AdvanceBalance;
    }
    return null;
  } catch (error) {
    console.error(`Error getting advance balance for customer ${customerId}:`, error);
    throw error;
  }
}

/**
 * Adds credit to a customer's advance balance. If the document doesn't exist, it is created.
 * Operates inside a Firestore transaction for concurrency safety.
 */
export async function addCredit(
  customerId: string,
  customerName: string,
  customerPhone: string,
  amount: number,
  invoiceId: string
): Promise<void> {
  if (amount <= 0) return;
  const docRef = doc(db, COLLECTION, customerId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      let currentBalance = 0;
      let transactions: AdvanceTransaction[] = [];

      if (snap.exists()) {
        const data = snap.data();
        currentBalance = data.balance ?? 0;
        transactions = data.transactions ?? [];
      }

      const newBalance = Math.round(currentBalance + amount);
      const newTx: AdvanceTransaction = {
        invoiceId,
        type: "credit",
        amount: Math.round(amount),
        balanceAfter: newBalance,
        date: Timestamp.now(),
        note: `Added ₹${Math.round(amount).toLocaleString("en-IN")} advance from invoice #${invoiceId || "unknown"}`
      };

      tx.set(
        docRef,
        {
          customerId,
          customerName,
          customerPhone,
          balance: newBalance,
          lastUpdated: Timestamp.now(),
          transactions: [...transactions, newTx]
        },
        { merge: true }
      );
    });
  } catch (error) {
    console.error(`Error adding advance credit for customer ${customerId}:`, error);
    throw error;
  }
}

/**
 * Deducts amount from a customer's advance balance.
 * Throws an error if document doesn't exist or balance is insufficient.
 * Operates inside a Firestore transaction.
 */
export async function deductBalance(
  customerId: string,
  amount: number,
  invoiceId: string
): Promise<void> {
  if (amount <= 0) return;
  const docRef = doc(db, COLLECTION, customerId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) {
        throw new Error(`No advance balance document exists for customer ${customerId}`);
      }

      const data = snap.data();
      const currentBalance = data.balance ?? 0;
      const transactions = data.transactions ?? [];

      if (currentBalance < amount) {
        throw new Error(`Insufficient advance balance. Required: ₹${Math.round(amount).toLocaleString("en-IN")}, Available: ₹${Math.round(currentBalance).toLocaleString("en-IN")}`);
      }

      const newBalance = Math.max(0, Math.round(currentBalance - amount));
      const newTx: AdvanceTransaction = {
        invoiceId,
        type: "debit",
        amount: Math.round(amount),
        balanceAfter: newBalance,
        date: Timestamp.now(),
        note: `Deducted ₹${Math.round(amount).toLocaleString("en-IN")} advance for invoice #${invoiceId || "unknown"}`
      };

      tx.set(
        docRef,
        {
          balance: newBalance,
          lastUpdated: Timestamp.now(),
          transactions: [...transactions, newTx]
        },
        { merge: true }
      );
    });
  } catch (error) {
    console.error(`Error deducting advance balance for customer ${customerId}:`, error);
    throw error;
  }
}
