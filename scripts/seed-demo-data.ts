import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  writeBatch,
  getDocs
} from 'firebase/firestore';

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
  console.error("Error: Project ID not found in .env.local. Make sure you run this script in the root folder.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedDemoData() {
  console.log("Seeding BLOW SALON default data in Firestore...");
  console.log("Target Project ID:", firebaseConfig.projectId);

  try {
    const batch = writeBatch(db);

    // 1. Seed Business Settings
    console.log("Creating default settings...");
    await setDoc(doc(db, "settings", "general"), {
      salonName: "BLOW SALON",
      phone: "9876543210",
      address: "Metro Plaza",
      gstNumber: "36AAAAA0000A1Z5",
      taxRate: 18,
      currency: "INR",
      currencySymbol: "₹",
      invoicePrefix: "BLOW-",
      receiptFooterText: "Thank you for visiting BLOW SALON! We look forward to seeing you again.",
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // 2. Seed Staff Members
    const staffList = [
      { id: "alex_stylist", name: "Alex", role: "Senior Stylist", salary: 30000, status: "Active", dutyStatus: "onDuty" },
      { id: "jordan_stylist", name: "Jordan", role: "Stylist", salary: 25000, status: "Active", dutyStatus: "onDuty" },
      { id: "sam_stylist", name: "Sam", role: "Specialist", salary: 28000, status: "Active", dutyStatus: "onDuty" },
      { id: "owner_admin", name: "Manager", role: "Salon Manager", salary: 40000, status: "Active", dutyStatus: "onDuty" },
    ];

    staffList.forEach((s) => {
      const { id, ...data } = s;
      const ref = doc(db, "staff", id);
      batch.set(ref, {
        ...data,
        createdAt: new Date().toISOString()
      });
    });
    console.log("- Queued default team staff (Alex, Jordan, Sam, Owner).");

    // 3. Seed Service Categories
    const categories = ["Hair", "Skin", "Nails", "Spa", "Body", "Other"];
    categories.forEach((cat) => {
      const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const ref = doc(db, "serviceCategories", slug);
      batch.set(ref, {
        name: cat,
        createdAt: new Date().toISOString()
      });
    });
    console.log("- Queued service categories (Hair, Skin, Nails, Spa, Body, Other).");

    // 4. Seed Services
    const services = [
      { id: "hair_cut", name: "Hair Cut", category: "Hair", price: 500, isSystemService: false },
      { id: "facial_treatment", name: "Facial Treatment", category: "Skin", price: 1200, isSystemService: false },
      { id: "manicure", name: "Manicure", category: "Nails", price: 400, isSystemService: false },
      { id: "relaxing_massage", name: "Relaxing Massage", category: "Spa", price: 1800, isSystemService: false },
      { id: "body_scrub", name: "Body Scrub", category: "Body", price: 1500, isSystemService: false },
      { id: "special_combo", name: "Special Combo", category: "Other", price: 2500, isSystemService: false },
      { id: "membership_fee", name: "Membership Fee", category: "Other", price: 1000, isSystemService: true },
    ];

    services.forEach((svc) => {
      const { id, ...data } = svc;
      const ref = doc(db, "services", id);
      batch.set(ref, {
        ...data,
        isActive: true,
        createdAt: new Date().toISOString()
      });
    });
    console.log("- Queued generic template services.");

    await batch.commit();
    console.log("\nDemo Salon database seed completed successfully!");
  } catch (error) {
    console.error("Database seed failed:", error);
  }
}

seedDemoData();
