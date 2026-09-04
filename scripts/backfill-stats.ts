import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch
} from 'firebase/firestore';
import { getInvoicePayments, getInvoicePaymentRatio, getInvoiceSalesBreakdown } from '../lib/utils/settlements';

// Load environment variables from .env.local
const dotenvPath = path.resolve(__dirname, '../.env.local');
const env: Record<string, string> = {};
if (fs.existsSync(dotenvPath)) {
  const content = fs.readFileSync(dotenvPath, 'utf8');
  content.split('\n').forEach((line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
}

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error("Error: Project ID not found in .env.local. Make sure you run this in the root workspace folder.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function getInvoiceDateKeys(invoice: any) {
  let dateKey = invoice.dateKey;
  if (!dateKey) {
    let d = new Date();
    if (invoice.date) {
      d = typeof invoice.date.toDate === 'function' ? invoice.date.toDate() : new Date(invoice.date);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dateKey = `${yyyy}-${mm}-${dd}`;
  }
  return {
    dateKey,
    monthKey: dateKey.slice(0, 7),
  };
}

async function runMigration() {
  console.log("Starting backfill migration...");
  console.log("Using configuration for project:", firebaseConfig.projectId);

  try {
    // 1. Fetch all invoices
    const invoicesSnap = await getDocs(collection(db, 'invoices'));
    console.log(`Fetched ${invoicesSnap.size} invoices.`);

    const monthlyStats: Record<string, any> = {};
    const dailyStats: Record<string, any> = {};
    const staffStats: Record<string, any> = {};

    invoicesSnap.forEach((docSnap) => {
      const inv: any = docSnap.data();
      const { dateKey, monthKey } = getInvoiceDateKeys(inv);
      const payments = getInvoicePayments(inv);
      const grandTotal = inv.grandTotal || 0;
      const collected = (payments.cash || 0) + (payments.upi || 0) + (payments.card || 0) + (inv.advanceUsed || 0);
      const ratio = getInvoicePaymentRatio(inv);

      // Initialize monthly stats
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { totalRevenue: 0, totalVisits: 0, cash: 0, upi: 0, card: 0 };
      }
      monthlyStats[monthKey].totalRevenue += collected;
      monthlyStats[monthKey].totalVisits += 1;
      monthlyStats[monthKey].cash += payments.cash;
      monthlyStats[monthKey].upi += payments.upi;
      monthlyStats[monthKey].card += payments.card;

      // Initialize daily stats
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = {
          totalRevenue: 0,
          totalVisits: 0,
          cash: 0,
          upi: 0,
          card: 0,
          serviceRevenue: 0,
          totalMembershipAmount: 0,
          retailProductsRevenue: 0
        };
      }
      dailyStats[dateKey].totalRevenue += collected;
      dailyStats[dateKey].totalVisits += 1;
      dailyStats[dateKey].cash += payments.cash;
      dailyStats[dateKey].upi += payments.upi;
      dailyStats[dateKey].card += payments.card;

      const breakdown = getInvoiceSalesBreakdown(inv);
      dailyStats[dateKey].serviceRevenue += breakdown.serviceSales * ratio;
      dailyStats[dateKey].retailProductsRevenue += breakdown.retailSales * ratio;
      dailyStats[dateKey].totalMembershipAmount += breakdown.membershipSales * ratio;

      // Staff monthly splits (informational)
      const staffInvoiceSummary: Record<string, any> = {};
      (inv.services || []).forEach((s: any) => {
        if (s.serviceId === 'membership_fee' || s.isSystemService === true) return;
        const staffId = s.staffId || 'unassigned';
        if (staffId === 'system' || staffId === 'unassigned') return;
        if (!staffInvoiceSummary[staffId]) {
          staffInvoiceSummary[staffId] = { revenue: 0, servicesCount: 0 };
        }
        const serviceAmount = s.amount !== undefined 
          ? Number(s.amount) || 0 
          : Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);
        staffInvoiceSummary[staffId].revenue += serviceAmount;
        staffInvoiceSummary[staffId].servicesCount += 1;
      });

      Object.entries(staffInvoiceSummary).forEach(([staffId, summary]) => {
        const staffMonthKey = `${staffId}_${monthKey}`;
        if (!staffStats[staffMonthKey]) {
          staffStats[staffMonthKey] = { revenue: 0, servicesCount: 0, visits: 0 };
        }
        staffStats[staffMonthKey].revenue += summary.revenue * ratio;
        staffStats[staffMonthKey].servicesCount += summary.servicesCount;
        staffStats[staffMonthKey].visits += 1;
      });

    });

    console.log("Aggregation complete. Writing to stats collection in Firestore...");

    // 2. Write aggregated documents in batches of 500
    const ops: Array<{ ref: any; data: any }> = [];

    Object.entries(monthlyStats).forEach(([monthKey, stats]) => {
      ops.push({
        ref: doc(db, 'stats', `revenue_${monthKey}`),
        data: stats,
      });
    });

    Object.entries(dailyStats).forEach(([dateKey, stats]) => {
      ops.push({
        ref: doc(db, 'stats', `daily_${dateKey}`),
        data: stats,
      });
    });

    Object.entries(staffStats).forEach(([staffMonthKey, stats]) => {
      const [staffId, monthKey] = staffMonthKey.split('_');
      ops.push({
        ref: doc(db, 'stats', `staff_${staffId}_${monthKey}`),
        data: stats,
      });
    });

    console.log(`Writing ${ops.length} stats documents...`);

    let batch = writeBatch(db);
    let count = 0;

    for (const op of ops) {
      batch.set(op.ref, op.data, { merge: true });
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
        console.log(`Committed ${count} writes...`);
      }
    }

    if (count % 400 !== 0) {
      await batch.commit();
    }

    console.log("Migration backfill completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

runMigration();
