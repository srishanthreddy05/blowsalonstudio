import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Read environment variables from .env.local
const dotenvPath = path.resolve(__dirname, '../.env.local');
const env = {};
if (fs.existsSync(dotenvPath)) {
  const content = fs.readFileSync(dotenvPath, 'utf8');
  content.split('\n').forEach((line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
}

const EXPECTED_PROJECT_ID = "blowsalonstudio";
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

console.log("==================================================");
console.log("BLOW SALON SERVICE CATALOG SEED / IMPORT SCRIPT");
console.log("==================================================");
console.log(`Detected Firebase Project ID: ${projectId}`);

if (!projectId || !projectId.toLowerCase().includes("blowsalon")) {
  console.error(`ERROR: Target project "${projectId}" is not the Blow Salon Firebase project. Aborting!`);
  process.exit(1);
}

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const BUSINESS_ID = "blow-salon";

// 21 Categories
const CATEGORIES_DATA = [
  { name: "Men's Haircut", gender: "men" },
  { name: "Men's Hairstyle", gender: "men" },
  { name: "Men's Hair Treatments", gender: "men" },
  { name: "Men's Straightening & Keratin", gender: "men" },
  { name: "Women's Haircut", gender: "women" },
  { name: "Women's Hairstyle", gender: "women" },
  { name: "Women's Hair Treatments", gender: "women" },
  { name: "Women's Straightening & Keratin", gender: "women" },
  { name: "Men's Colour Services", gender: "men" },
  { name: "Women's Colour Services", gender: "women" },
  { name: "Detan Services", gender: "both" },
  { name: "Body Polishing", gender: "both" },
  { name: "Waxing Services", gender: "both" },
  { name: "Threading Services", gender: "both" },
  { name: "Cleanup", gender: "both" },
  { name: "Facials", gender: "both" },
  { name: "VIP Facials", gender: "both" },
  { name: "Facial Add-ons", gender: "both" },
  { name: "Manicure Services", gender: "both" },
  { name: "Pedicure Services", gender: "both" },
  { name: "Nail Art & Nail Extensions", gender: "both" },
];

// Complete Service Catalog
const SERVICES_DATA = [
  // ==================== MEN'S SERVICES ====================
  // Category: Men's Haircut
  { name: "Creative Stylist", category: "Men's Haircut", gender: "men", price: 999 },
  { name: "Top Stylist", category: "Men's Haircut", gender: "men", price: 799 },
  { name: "Hair Stylist", category: "Men's Haircut", gender: "men", price: 499 },
  { name: "VIP Room Haircut", category: "Men's Haircut", gender: "men", price: 1299 },
  { name: "Beard Trim", category: "Men's Haircut", gender: "men", price: 199 },
  { name: "Beard Styling", category: "Men's Haircut", gender: "men", price: 450 },
  { name: "Zero Trim", category: "Men's Haircut", gender: "men", price: 199 },
  { name: "Head Shave", category: "Men's Haircut", gender: "men", price: 450 },
  { name: "Beard Colour and Mustache", category: "Men's Haircut", gender: "men", price: 999 },
  { name: "Kids Haircut", category: "Men's Haircut", gender: "men", price: 399 },

  // Category: Men's Hairstyle
  { name: "Wash + Blow Dry + Styling", category: "Men's Hairstyle", gender: "men", price: 999, startingPrice: 999, priceLabel: "onwards" },
  { name: "Hair Wash & Splash Blow Dry", category: "Men's Hairstyle", gender: "men", price: 599 },

  // Category: Men's Hair Treatments
  { name: "Basic Hair Spa", category: "Men's Hair Treatments", gender: "men", price: 1899, startingPrice: 1899, priceLabel: "onwards" },
  { name: "Hair Spa Moroccan", category: "Men's Hair Treatments", gender: "men", price: 2899 },
  { name: "Oil Massage", category: "Men's Hair Treatments", gender: "men", price: 599 },
  { name: "Luxury Hair Spa", category: "Men's Hair Treatments", gender: "men", price: 3099, startingPrice: 3099, priceLabel: "onwards" },
  { name: "Olaplex (Repair, reverse damage and strengthen elasticity)", category: "Men's Hair Treatments", gender: "men", price: 2899, startingPrice: 2899, priceLabel: "onwards" },
  { name: "Hairfall Treatment", category: "Men's Hair Treatments", gender: "men", price: 2899, startingPrice: 2899, priceLabel: "onwards" },
  { name: "Purifying Treatment for Dandruff", category: "Men's Hair Treatments", gender: "men", price: 2899, startingPrice: 2899, priceLabel: "onwards" },
  { name: "Korean Spa", category: "Men's Hair Treatments", gender: "men", price: 4999 },

  // Category: Men's Straightening & Keratin
  { name: "Hair Straightening", category: "Men's Straightening & Keratin", gender: "men", price: 4999, startingPrice: 4999, priceLabel: "onwards" },
  { name: "Men Keratin", category: "Men's Straightening & Keratin", gender: "men", price: 5999, startingPrice: 5999, priceLabel: "onwards" },

  // ==================== WOMEN'S SERVICES ====================
  // Category: Women's Haircut
  { name: "Creative Stylist", category: "Women's Haircut", gender: "women", price: 1699 },
  { name: "Top Stylist", category: "Women's Haircut", gender: "women", price: 1399 },
  { name: "Hair Stylist", category: "Women's Haircut", gender: "women", price: 1199 },
  { name: "Fringe Cut", category: "Women's Haircut", gender: "women", price: 799 },
  { name: "VIP Room Haircut", category: "Women's Haircut", gender: "women", price: 1599 },
  { name: "Kids Haircut (up to 10 years)", category: "Women's Haircut", gender: "women", price: 899 },

  // Category: Women's Hairstyle
  {
    name: "Wash + Blow Dry",
    category: "Women's Hairstyle",
    gender: "women",
    price: 999,
    variants: [
      { name: "Regular", price: 999 },
      { name: "Small", price: 999 },
      { name: "Medium", price: 1299 },
      { name: "Long", price: 1499 },
    ],
  },
  {
    name: "Ironing",
    category: "Women's Hairstyle",
    gender: "women",
    price: 1599,
    variants: [
      { name: "Regular", price: 1599 },
      { name: "Small", price: 1599 },
      { name: "Medium", price: 1799 },
      { name: "Long", price: 1999 },
    ],
  },
  {
    name: "Tonging",
    category: "Women's Hairstyle",
    gender: "women",
    price: 1699,
    variants: [
      { name: "Regular", price: 1699 },
      { name: "Small", price: 1699 },
      { name: "Medium", price: 1899 },
      { name: "Long", price: 2099 },
    ],
  },
  {
    name: "Straight Blow Dry",
    category: "Women's Hairstyle",
    gender: "women",
    price: 1099,
    variants: [
      { name: "Regular", price: 1099 },
      { name: "Small", price: 1099 },
      { name: "Medium", price: 1299 },
      { name: "Long", price: 1499 },
    ],
  },
  {
    name: "Curling Out/In",
    category: "Women's Hairstyle",
    gender: "women",
    price: 899,
    variants: [
      { name: "Regular", price: 899 },
      { name: "Small", price: 899 },
      { name: "Medium", price: 1099 },
      { name: "Long", price: 1299 },
    ],
  },
  {
    name: "Hair Wash & Splash Blow Dry",
    category: "Women's Hairstyle",
    gender: "women",
    price: 599,
    priceLabel: "up to neck",
    variants: [
      { name: "Regular", price: 599, priceLabel: "up to neck" },
      { name: "Small", price: 599, priceLabel: "up to neck" },
      { name: "Medium", price: 799 },
      { name: "Long", price: 999 },
    ],
  },

  // Category: Women's Hair Treatments
  {
    name: "Basic Hair Spa",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 1899,
    startingPrice: 1899,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 1899, startingPrice: 1899, priceLabel: "onwards" },
      { name: "Small", price: 1899 },
      { name: "Medium", price: 2099 },
      { name: "Long", price: 2299 },
    ],
  },
  {
    name: "Hair Spa Moroccan",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 2999,
    startingPrice: 2999,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 2999, startingPrice: 2999, priceLabel: "onwards" },
      { name: "Small", price: 2999 },
      { name: "Medium", price: 3399 },
      { name: "Long", price: 3699 },
    ],
  },
  {
    name: "Oil Massage",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 899,
  },
  {
    name: "Luxury Hair Spa",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 3100,
    startingPrice: 3100,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 3100, startingPrice: 3100, priceLabel: "onwards" },
      { name: "Small", price: 3100 },
      { name: "Medium", price: 3599 },
      { name: "Long", price: 3999 },
    ],
  },
  {
    name: "Olaplex",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 2899,
    startingPrice: 2899,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 2899, startingPrice: 2899, priceLabel: "onwards" },
      { name: "Small", price: 2899 },
      { name: "Medium", price: 3099 },
      { name: "Long", price: 3399 },
    ],
  },
  {
    name: "Hairfall Treatment",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 2899,
    startingPrice: 2899,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 2899, startingPrice: 2899, priceLabel: "onwards" },
      { name: "Small", price: 2899 },
      { name: "Medium", price: 3099 },
      { name: "Long", price: 3399 },
    ],
  },
  {
    name: "Purifying Treatment for Dandruff",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 2899,
    startingPrice: 2899,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 2899, startingPrice: 2899, priceLabel: "onwards" },
      { name: "Small", price: 2899 },
      { name: "Medium", price: 3099 },
      { name: "Long", price: 3399 },
    ],
  },
  {
    name: "Korean Spa",
    category: "Women's Hair Treatments",
    gender: "women",
    price: 4999,
    startingPrice: 4999,
    priceLabel: "onwards",
  },

  // Category: Women's Straightening & Keratin
  {
    name: "Hair Straightening",
    category: "Women's Straightening & Keratin",
    gender: "women",
    price: 8999,
    variants: [
      { name: "Regular", price: 8999 },
      { name: "Small", price: 8999 },
      { name: "Medium", price: 10999 },
      { name: "Long", price: 12999 },
    ],
  },
  {
    name: "Women Keratin",
    category: "Women's Straightening & Keratin",
    gender: "women",
    price: 8999,
    variants: [
      { name: "Regular", price: 8999 },
      { name: "Small", price: 8999 },
      { name: "Medium", price: 10999 },
      { name: "Long", price: 12999 },
    ],
  },

  // ==================== COLOUR SERVICES ====================
  // Category: Men's Colour Services
  { name: "Root Touch Up", category: "Men's Colour Services", gender: "men", price: 1299, startingPrice: 1299, priceLabel: "onwards" },
  { name: "Root Touch Up (No Ammonia)", category: "Men's Colour Services", gender: "men", price: 1699 },
  { name: "Highlight Streaks (Per Streak)", category: "Men's Colour Services", gender: "men", price: 300, priceUnit: "per streak" },
  { name: "Global Highlights", category: "Men's Colour Services", gender: "men", price: 5999, startingPrice: 5999, priceLabel: "onwards" },
  { name: "Blonde", category: "Men's Colour Services", gender: "men", price: 1399, startingPrice: 1399, priceLabel: "onwards" },

  // Category: Women's Colour Services
  {
    name: "Root Touch Up",
    category: "Women's Colour Services",
    gender: "women",
    price: 1799,
    variants: [
      { name: "Regular", price: 1799 },
      { name: "1 Inch", price: 1799 },
      { name: "2 Inch", price: 2199 },
    ],
  },
  {
    name: "Root Touch Up (No Ammonia)",
    category: "Women's Colour Services",
    gender: "women",
    price: 1999,
    variants: [
      { name: "Regular", price: 1999 },
      { name: "1 Inch", price: 1999 },
      { name: "2 Inch", price: 2399 },
    ],
  },
  {
    name: "Global",
    category: "Women's Colour Services",
    gender: "women",
    price: 4999,
    startingPrice: 4999,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 4999, startingPrice: 4999, priceLabel: "onwards" },
      { name: "Small", price: 4999 },
      { name: "Medium", price: 5999 },
      { name: "Long", price: 6999 },
    ],
  },
  {
    name: "Global (No Ammonia)",
    category: "Women's Colour Services",
    gender: "women",
    price: 5999,
    startingPrice: 5999,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 5999, startingPrice: 5999, priceLabel: "onwards" },
      { name: "Small", price: 5999 },
      { name: "Medium", price: 6999 },
      { name: "Long", price: 7999 },
    ],
  },
  { name: "Highlight Streaks", category: "Women's Colour Services", gender: "women", price: 500, priceUnit: "per streak" },
  {
    name: "Global Highlights",
    category: "Women's Colour Services",
    gender: "women",
    price: 7999,
    startingPrice: 7999,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 7999, startingPrice: 7999, priceLabel: "onwards" },
      { name: "Small", price: 7999 },
      { name: "Medium", price: 8999 },
      { name: "Long", price: 9999 },
    ],
  },
  {
    name: "Balayage",
    category: "Women's Colour Services",
    gender: "women",
    price: 6999,
    startingPrice: 6999,
    priceLabel: "onwards",
    variants: [
      { name: "Regular", price: 6999, startingPrice: 6999, priceLabel: "onwards" },
      { name: "Small", price: 6999 },
      { name: "Medium", price: 7999 },
      { name: "Long", price: 8999 },
    ],
  },
  { name: "Blonde", category: "Women's Colour Services", gender: "women", price: 1699 },

  // ==================== GENERAL SERVICES (gender: "both") ====================
  // Category: Detan Services
  { name: "Face and Neck", category: "Detan Services", gender: "both", price: 499 },
  { name: "Full Hands", category: "Detan Services", gender: "both", price: 799 },
  { name: "Full Legs", category: "Detan Services", gender: "both", price: 1099 },
  { name: "Front Detan", category: "Detan Services", gender: "both", price: 799 },
  { name: "Back Detan", category: "Detan Services", gender: "both", price: 799 },
  { name: "Full Body Detan", category: "Detan Services", gender: "both", price: 2999 },
  { name: "Half Hands", category: "Detan Services", gender: "both", price: 599 },
  { name: "Half Legs", category: "Detan Services", gender: "both", price: 799 },
  { name: "Feet", category: "Detan Services", gender: "both", price: 299 },

  // Category: Body Polishing
  { name: "Back", category: "Body Polishing", gender: "both", price: 1799 },
  { name: "Full Hands", category: "Body Polishing", gender: "both", price: 1899 },
  { name: "Full Legs", category: "Body Polishing", gender: "both", price: 2199 },
  { name: "Full Body", category: "Body Polishing", gender: "both", price: 4999 },

  // Category: Waxing Services
  { name: "Half Legs", category: "Waxing Services", gender: "both", price: 799 },
  { name: "Full Legs", category: "Waxing Services", gender: "both", price: 1099 },
  { name: "Half Arms", category: "Waxing Services", gender: "both", price: 599 },
  { name: "Full Arms", category: "Waxing Services", gender: "both", price: 699 },
  { name: "Back", category: "Waxing Services", gender: "both", price: 899 },
  { name: "Stomach", category: "Waxing Services", gender: "both", price: 699 },
  { name: "Front (Chest + Stomach)", category: "Waxing Services", gender: "both", price: 1099 },
  { name: "Lower Face", category: "Waxing Services", gender: "both", price: 299 },
  { name: "Under Arms", category: "Waxing Services", gender: "both", price: 399 },
  { name: "Upper Lips", category: "Waxing Services", gender: "both", price: 99 },
  { name: "Chin", category: "Waxing Services", gender: "both", price: 99 },
  { name: "Sides", category: "Waxing Services", gender: "both", price: 149 },
  { name: "Full Face", category: "Waxing Services", gender: "both", price: 499 },
  { name: "Neck", category: "Waxing Services", gender: "both", price: 199 },
  { name: "Forehead", category: "Waxing Services", gender: "both", price: 149 },
  { name: "Bikini Wax", category: "Waxing Services", gender: "both", price: 3599 },
  { name: "Full Body", category: "Waxing Services", gender: "both", price: 4999 },

  // Category: Threading Services
  { name: "Eyebrows", category: "Threading Services", gender: "both", price: 80 },
  { name: "Upper Lip", category: "Threading Services", gender: "both", price: 49 },
  { name: "Lower Lip", category: "Threading Services", gender: "both", price: 49 },
  { name: "Chin", category: "Threading Services", gender: "both", price: 49 },
  { name: "Forehead", category: "Threading Services", gender: "both", price: 49 },
  { name: "Sides", category: "Threading Services", gender: "both", price: 79 },
  { name: "Neck", category: "Threading Services", gender: "both", price: 99 },
  { name: "Full Face", category: "Threading Services", gender: "both", price: 299 },

  // Category: Cleanup
  { name: "Basic Cleanup", category: "Cleanup", gender: "both", price: 1299 },
  { name: "Illuminating and Hydrating", category: "Cleanup", gender: "both", price: 1999 },
  { name: "Soothing & Remedy", category: "Cleanup", gender: "both", price: 2099 },
  { name: "Hydrating", category: "Cleanup", gender: "both", price: 1699 },

  // Category: Facials
  { name: "Basic Facials", category: "Facials", gender: "both", price: 1499 },
  { name: "Golden Glow Facial", category: "Facials", gender: "both", price: 2599 },
  { name: "Acne Sensitive Facial", category: "Facials", gender: "both", price: 2799 },
  { name: "Red Carpet", category: "Facials", gender: "both", price: 2999 },
  { name: "Soothing Facial", category: "Facials", gender: "both", price: 3200 },
  { name: "The Blow Signature Facial", category: "Facials", gender: "both", price: 3699 },

  // Category: VIP Facials
  { name: "Party Perfect Facial", category: "VIP Facials", gender: "both", price: 4199 },
  { name: "Bridal Glow Brightening", category: "VIP Facials", gender: "both", price: 4499 },
  { name: "Korean Facial", category: "VIP Facials", gender: "both", price: 4599 },
  { name: "Skin Bright Boosting Facial Space (Fire & Ice Facial)", category: "VIP Facials", gender: "both", price: 4799 },
  { name: "Hydra Facial", category: "VIP Facials", gender: "both", price: 4999 },

  // Category: Facial Add-ons
  { name: "Sublime Eye Treatment", category: "Facial Add-ons", gender: "both", price: 999 },
  { name: "Add On Peel Off Mask", category: "Facial Add-ons", gender: "both", price: 299 },
  { name: "Add On Creamy Mask", category: "Facial Add-ons", gender: "both", price: 399 },

  // Category: Manicure Services
  { name: "Basic Manicure", category: "Manicure Services", gender: "both", price: 799 },
  { name: "Manicure Premium", category: "Manicure Services", gender: "both", price: 999 },
  { name: "Manicure Algae", category: "Manicure Services", gender: "both", price: 1199 },
  { name: "The Blow Signature Manicure", category: "Manicure Services", gender: "both", price: 1599 },
  { name: "Cut And File", category: "Manicure Services", gender: "both", price: 159 },
  { name: "Nail Polish", category: "Manicure Services", gender: "both", price: 159 },
  { name: "French Polish", category: "Manicure Services", gender: "both", price: 899 },

  // Category: Pedicure Services
  { name: "Regular Pedicure", category: "Pedicure Services", gender: "both", price: 1099 },
  { name: "Pedicure Premium (Cut & File, Cuticle, Scrub, Massage & Pack)", category: "Pedicure Services", gender: "both", price: 1499 },
  { name: "Pedicure Heel Peel (Cut & File, Cuticle, Clean, Scrub, Massage & Pack)", category: "Pedicure Services", gender: "both", price: 1899 },
  { name: "TBS Pedicure", category: "Pedicure Services", gender: "both", price: 2500 },

  // Category: Nail Art & Nail Extensions
  { name: "Nail Extensions", category: "Nail Art & Nail Extensions", gender: "both", price: 1399 },
  { name: "Nail Extensions + Gel Polish Plain", category: "Nail Art & Nail Extensions", gender: "both", price: 1999 },
  { name: "Refill", category: "Nail Art & Nail Extensions", gender: "both", price: 899 },
  { name: "Refill + Gel Polish (Any Plain Gel Polish)", category: "Nail Art & Nail Extensions", gender: "both", price: 1299 },
  { name: "Overlay", category: "Nail Art & Nail Extensions", gender: "both", price: 999 },
  { name: "Overlay + Gel Polish (Any Plain Colour of Gel Polish)", category: "Nail Art & Nail Extensions", gender: "both", price: 1399 },
  { name: "Hand Gel", category: "Nail Art & Nail Extensions", gender: "both", price: 399 },
  { name: "Hand Gel + Gel Polish (Any Plain Colour of Gel Polish)", category: "Nail Art & Nail Extensions", gender: "both", price: 999 },
  { name: "Extension Removal", category: "Nail Art & Nail Extensions", gender: "both", price: 350 },
  { name: "Gel Polish Removal", category: "Nail Art & Nail Extensions", gender: "both", price: 250 },
  { name: "Gel Polish Plain", category: "Nail Art & Nail Extensions", gender: "both", price: 480 },
  { name: "Gel Polish (Metallic/French/Matt)", category: "Nail Art & Nail Extensions", gender: "both", price: 999 },
  { name: "Gel Polish (Glitter/Chrome/Cateye)", category: "Nail Art & Nail Extensions", gender: "both", price: 1099 },
  { name: "Baby Boomer / Ombre Nails", category: "Nail Art & Nail Extensions", gender: "both", price: 1100 },
  { name: "Baby Boomer / Ombre With Extension", category: "Nail Art & Nail Extensions", gender: "both", price: 2900 },
  { name: "Nail Art Per Finger", category: "Nail Art & Nail Extensions", gender: "both", price: 100, startingPrice: 100, priceLabel: "onwards", priceUnit: "per finger" },
];

// Packages Data
const PACKAGES_DATA = [
  {
    name: "Pre-Bridal Package Premium",
    price: 10000,
    gender: "women",
    includes: [
      "Golden Facial",
      "Full Arms, Legs, Under Arms Waxing",
      "Detan Face & Neck",
      "Eyebrows & Upper Lip",
      "Manicure Premium",
      "Pedicure Premium",
      "Basic Hair Spa",
    ],
  },
  {
    name: "Pre-Bridal Package Luxury",
    price: 16399,
    gender: "women",
    includes: [
      "Bridal Glow Whitening",
      "Full Arms, Legs, Underarms Wax",
      "Detan Full Body (Hands, Legs, Face, Neck)",
      "Eyebrows & Upper Lip",
      "TBS Manicure",
      "TBS Pedicure",
      "Nail Extensions + Gel Polish Plain",
    ],
  },
  {
    name: "Pre Bride-Groom Premium",
    price: 8893,
    gender: "men",
    includes: [
      "Golden Glow Facial",
      "Beard Trim",
      "Detan Face & Neck",
      "Premium Manicure",
      "Premium Pedicure",
      "Antidandruff Treatment",
      "Senior Haircut + Hair Wash & Blast Dry",
    ],
  },
  {
    name: "Pre Bride-Groom Luxury",
    price: 14399,
    gender: "men",
    includes: [
      "Hydra Facial",
      "Beard Trim & Styling",
      "Detan (Face, Neck, Hands)",
      "The Blow Signature Manicure",
      "The Blow Signature Pedicure",
      "Creative Stylist Haircut + Hair Wash & Splash Blow Dry",
      "Olaplex (Repair, reverse damage and strengthen elasticity)",
    ],
  },
];

function generateDocId(name, category = "") {
  return `${category ? category + '-' : ''}${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function runImport() {
  console.log("\nStarting import to Firestore...");

  let stats = {
    categoriesCreated: 0,
    categoriesUpdated: 0,
    categoriesSkipped: 0,
    servicesCreated: 0,
    servicesUpdated: 0,
    servicesSkipped: 0,
    packagesCreated: 0,
    packagesUpdated: 0,
    packagesSkipped: 0,
    totalVariants: 0,
  };

  // 1. IMPORT CATEGORIES
  console.log("\n--- Importing Categories ---");
  const existingCatSnap = await getDocs(collection(db, "serviceCategories"));
  const existingCats = new Map();
  existingCatSnap.forEach((d) => {
    existingCats.set(d.id, d.data());
  });

  for (const cat of CATEGORIES_DATA) {
    const docId = generateDocId(cat.name);
    const existing = existingCats.get(docId);
    const docRef = doc(db, "serviceCategories", docId);
    
    const payload = {
      businessId: BUSINESS_ID,
      name: cat.name,
      gender: cat.gender,
      updatedAt: new Date().toISOString(),
    };

    if (!existing) {
      payload.createdAt = new Date().toISOString();
      await setDoc(docRef, payload);
      stats.categoriesCreated++;
      console.log(`+ Category Created: ${cat.name} (${docId})`);
    } else {
      // Check if update needed
      const isIdentical = existing.name === cat.name && existing.gender === cat.gender && existing.businessId === BUSINESS_ID;
      if (!isIdentical) {
        await setDoc(docRef, payload, { merge: true });
        stats.categoriesUpdated++;
        console.log(`~ Category Updated: ${cat.name} (${docId})`);
      } else {
        stats.categoriesSkipped++;
        console.log(`= Category Skipped (Unchanged): ${cat.name}`);
      }
    }
  }

  // 2. IMPORT SERVICES
  console.log("\n--- Importing Services ---");
  const existingSvcSnap = await getDocs(collection(db, "services"));
  const existingSvcs = new Map();
  existingSvcSnap.forEach((d) => {
    existingSvcs.set(d.id, d.data());
  });

  for (const svc of SERVICES_DATA) {
    const docId = generateDocId(svc.name, svc.category);
    const existing = existingSvcs.get(docId);
    const docRef = doc(db, "services", docId);

    const payload = {
      businessId: BUSINESS_ID,
      name: svc.name,
      category: svc.category,
      gender: svc.gender,
      price: svc.price,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    if (svc.startingPrice !== undefined) payload.startingPrice = svc.startingPrice;
    if (svc.priceLabel) payload.priceLabel = svc.priceLabel;
    if (svc.priceUnit) payload.priceUnit = svc.priceUnit;
    if (svc.variants) {
      payload.variants = svc.variants;
      stats.totalVariants += svc.variants.length;
    }

    if (!existing) {
      payload.createdAt = new Date().toISOString();
      await setDoc(docRef, payload);
      stats.servicesCreated++;
      console.log(`+ Service Created: [${svc.category}] ${svc.name} - ₹${svc.price} (${docId})`);
    } else {
      const isIdentical = 
        existing.name === svc.name &&
        existing.category === svc.category &&
        existing.gender === svc.gender &&
        existing.price === svc.price &&
        existing.priceLabel === (svc.priceLabel || undefined) &&
        existing.priceUnit === (svc.priceUnit || undefined) &&
        existing.businessId === BUSINESS_ID &&
        JSON.stringify(existing.variants || null) === JSON.stringify(svc.variants || null);

      if (!isIdentical) {
        await setDoc(docRef, payload, { merge: true });
        stats.servicesUpdated++;
        console.log(`~ Service Updated: [${svc.category}] ${svc.name} - ₹${svc.price} (${docId})`);
      } else {
        stats.servicesSkipped++;
        console.log(`= Service Skipped (Unchanged): [${svc.category}] ${svc.name}`);
      }
    }
  }

  // 3. IMPORT PACKAGES
  console.log("\n--- Importing Packages ---");
  const existingPkgSnap = await getDocs(collection(db, "packages"));
  const existingPkgs = new Map();
  existingPkgSnap.forEach((d) => {
    existingPkgs.set(d.id, d.data());
  });

  for (const pkg of PACKAGES_DATA) {
    const docId = generateDocId(pkg.name);
    const existing = existingPkgs.get(docId);
    const docRef = doc(db, "packages", docId);

    const payload = {
      businessId: BUSINESS_ID,
      name: pkg.name,
      price: pkg.price,
      gender: pkg.gender,
      includes: pkg.includes,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    if (!existing) {
      payload.createdAt = new Date().toISOString();
      await setDoc(docRef, payload);
      stats.packagesCreated++;
      console.log(`+ Package Created: ${pkg.name} - ₹${pkg.price} (${docId})`);
    } else {
      const isIdentical = 
        existing.name === pkg.name &&
        existing.price === pkg.price &&
        existing.gender === pkg.gender &&
        existing.businessId === BUSINESS_ID &&
        JSON.stringify(existing.includes || []) === JSON.stringify(pkg.includes);

      if (!isIdentical) {
        await setDoc(docRef, payload, { merge: true });
        stats.packagesUpdated++;
        console.log(`~ Package Updated: ${pkg.name} - ₹${pkg.price} (${docId})`);
      } else {
        stats.packagesSkipped++;
        console.log(`= Package Skipped (Unchanged): ${pkg.name}`);
      }
    }
  }

  console.log("\n==================================================");
  console.log("IMPORT COMPLETE SUMMARY");
  console.log("==================================================");
  console.log(`Firebase Project ID: ${projectId}`);
  console.log(`Total Categories in Catalog: ${CATEGORIES_DATA.length}`);
  console.log(`- Created: ${stats.categoriesCreated}`);
  console.log(`- Updated: ${stats.categoriesUpdated}`);
  console.log(`- Skipped: ${stats.categoriesSkipped}`);
  console.log(`Total Services in Catalog: ${SERVICES_DATA.length}`);
  console.log(`- Created: ${stats.servicesCreated}`);
  console.log(`- Updated: ${stats.servicesUpdated}`);
  console.log(`- Skipped: ${stats.servicesSkipped}`);
  console.log(`Total Multi-Price Variants: ${stats.totalVariants}`);
  console.log(`Total Packages in Catalog: ${PACKAGES_DATA.length}`);
  console.log(`- Created: ${stats.packagesCreated}`);
  console.log(`- Updated: ${stats.packagesUpdated}`);
  console.log(`- Skipped: ${stats.packagesSkipped}`);
  console.log("==================================================");
  
  process.exit(0);
}

runImport().catch((err) => {
  console.error("CRITICAL IMPORT FAILURE:", err);
  process.exit(1);
});
