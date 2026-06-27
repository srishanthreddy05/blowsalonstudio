import * as fs from 'fs';
import * as path from 'path';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  writeBatch,
  Timestamp,
  query,
  where
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
  console.error("Error: Project ID not found in .env.local.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Text title case helper
function toTitleCase(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// Replace with your salon's categories before seeding
const DEFAULT_CATEGORIES = [
  "Hair",
  "Skin",
  "Nails",
  "Spa",
  "Body",
  "Other"
];

async function runCategoryMigration() {
  console.log("Starting service categories migration script...");
  console.log("Using configuration for project:", firebaseConfig.projectId);

  try {
    // 1. Fetch all existing categories from the 'serviceCategories' collection to avoid duplicates
    const catCol = collection(db, 'serviceCategories');
    const existingCatsSnap = await getDocs(catCol);
    const existingCatNames = new Set<string>();
    existingCatsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.name) {
        existingCatNames.add(data.name.trim().toLowerCase());
      }
    });
    console.log(`Found ${existingCatNames.size} existing categories in serviceCategories collection.`);

    // 2. Fetch only active services to extract their category names
    const servicesCol = collection(db, 'services');
    const servicesSnap = await getDocs(
      query(servicesCol, where("isActive", "==", true))
    );
    const servicesCategories = new Set<string>();
    servicesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.category) {
        servicesCategories.add(data.category.trim());
      }
    });
    console.log(`Extracted ${servicesCategories.size} unique categories from existing services.`);

    // 3. Combine default categories and service categories
    const categoriesToSeed = new Set<string>();
    DEFAULT_CATEGORIES.forEach((cat) => categoriesToSeed.add(toTitleCase(cat)));
    servicesCategories.forEach((cat) => categoriesToSeed.add(toTitleCase(cat)));

    // 4. Batch write new categories
    const batch = writeBatch(db);
    let seedCount = 0;

    categoriesToSeed.forEach((catName) => {
      if (!existingCatNames.has(catName.toLowerCase())) {
        // Create a collision-safe ID from the name (e.g. hair-care) or let Firestore auto-generate.
        // We'll let Firestore generate an auto ID, or generate one based on the slug.
        const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const docRef = doc(catCol, slug || undefined); // use slug as doc ID if valid, otherwise auto-generate
        
        batch.set(docRef, {
          name: catName,
          createdAt: Timestamp.now(),
        });
        seedCount++;
        console.log(`Queueing category to seed: "${catName}" (ID: ${slug})`);
      }
    });

    if (seedCount > 0) {
      await batch.commit();
      console.log(`Successfully seeded ${seedCount} categories to serviceCategories collection!`);
    } else {
      console.log("No new categories to seed.");
    }

    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runCategoryMigration();
