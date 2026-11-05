#!/usr/bin/env node
/**
 * BLOW SALON — WhatsApp Campaign Failure Analysis Script (Read-Only)
 * 
 * Analyzes campaign delivery metrics and groups failure reasons by errorCode and errorMessage.
 * Strictly READ-ONLY: never mutates, retries, or deletes any record.
 * Privacy-preserving: never logs full phone numbers or secrets.
 *
 * Usage:
 *   node scripts/analyze-campaign-failures.mjs <campaignId>
 *   node scripts/analyze-campaign-failures.mjs --list
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to mask phone numbers
function maskPhone(phone) {
  if (!phone) return 'N/A';
  const clean = String(phone).replace(/\s+/g, '');
  if (clean.length <= 5) return '***' + clean.slice(-2);
  return clean.slice(0, 3) + '*****' + clean.slice(-3);
}

// Load .env.local or .env
function loadEnv() {
  const env = {};
  const paths = [
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!env[key]) env[key] = val;
          }
        }
      });
    }
  }
  return env;
}

const env = loadEnv();
const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('[Error] Missing Firebase configuration in environment (.env.local or .env).');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Meta Error Classification Reference
function classifyMetaCode(code, msg) {
  const c = String(code || '').trim();
  const m = String(msg || '').toLowerCase();

  if (c === '130429') return { class: 'THROUGHPUT_LIMIT', retryable: true, desc: 'Meta API throughput limit reached' };
  if (c === '131056') return { class: 'PAIR_RATE_LIMIT', retryable: true, desc: 'Pair-rate limit hit (too many messages to same recipient in short window)' };
  if (c === '131048') return { class: 'SPAM_RATE_LIMIT', retryable: false, desc: 'Spam rate limit reached for phone number' };
  if (c === '131049') return { class: 'ECOSYSTEM_DECLINE', retryable: false, desc: 'Marketing message declined by Meta for ecosystem health (DO NOT RETRY)' };
  if (c === '131026') return { class: 'RECIPIENT_UNDELIVERABLE', retryable: false, desc: 'Message undeliverable (phone number not on WhatsApp or invalid)' };
  if (c === '131030') return { class: 'INVALID_RECIPIENT', retryable: false, desc: 'Recipient phone number not valid' };
  if (c === '4') return { class: 'APP_LEVEL_LIMIT', retryable: true, desc: 'Graph API application-level rate limit' };
  if (c === '190' || c === 'WHATSAPP_AUTH_ERROR') return { class: 'AUTH_ERROR', retryable: false, desc: 'Access token expired or invalid' };
  if (c === 'AMBIGUOUS_TIMEOUT') return { class: 'AMBIGUOUS_TIMEOUT', retryable: false, desc: 'Network timeout mid-flight; awaiting webhook confirmation' };
  
  if (m.includes('rate limit') || m.includes('throughput')) return { class: 'RATE_LIMIT', retryable: true, desc: 'Rate limit' };
  if (m.includes('undeliverable')) return { class: 'RECIPIENT_UNDELIVERABLE', retryable: false, desc: 'Undeliverable' };
  if (m.includes('opted out') || m.includes('opt-out')) return { class: 'OPT_OUT', retryable: false, desc: 'Customer opted out' };
  
  return { class: 'GENERAL_FAILURE', retryable: true, desc: 'Transient or unclassified error' };
}

async function listCampaigns() {
  console.log('\n======================================================');
  console.log('BLOW SALON — Recent WhatsApp Campaigns (Read-Only)');
  console.log('======================================================\n');
  const snap = await getDocs(query(collection(db, 'whatsapp_campaigns'), orderBy('createdAt', 'desc'), limit(15)));
  if (snap.empty) {
    console.log('No campaigns found.');
    return;
  }

  for (const d of snap.docs) {
    const data = d.data();
    console.log(`- ID: ${d.id}`);
    console.log(`  Name: ${data.name || 'Untitled'}`);
    console.log(`  Status: ${data.status || 'UNKNOWN'}`);
    console.log(`  Template: ${data.templateName || 'N/A'}`);
    console.log(`  Recipients: Total=${data.totalRecipients || 0}, Sent=${data.sentCount || 0}, Delivered=${data.deliveredCount || 0}, Read=${data.readCount || 0}, Failed=${data.failedCount || 0}`);
    console.log(`  Created: ${data.createdAt || 'N/A'}\n`);
  }
}

async function analyzeCampaign(campaignId) {
  console.log(`\nAnalyzing Campaign: ${campaignId}...\n`);

  const campRef = doc(db, 'whatsapp_campaigns', campaignId);
  const campSnap = await getDoc(campRef);

  if (!campSnap.exists()) {
    console.error(`[Error] Campaign not found: ${campaignId}`);
    process.exit(1);
  }

  const campaign = campSnap.data();

  // Fetch recipients
  const recSnap = await getDocs(
    query(collection(db, 'whatsapp_campaign_recipients'), where('campaignId', '==', campaignId))
  );

  const recipients = recSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Status breakdown
  const statusCounts = {
    PENDING: 0,
    SENT: 0,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    EXCLUDED: 0,
    OTHER: 0,
  };

  const errorGroups = new Map(); // key: `${code}:::${message}` -> { code, message, count, classification, samples: [] }

  for (const rec of recipients) {
    const status = (rec.status || 'PENDING').toUpperCase();
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    } else {
      statusCounts.OTHER++;
    }

    if (status === 'FAILED') {
      const code = rec.errorCode || 'UNKNOWN_CODE';
      const msg = rec.errorMessage || rec.metaErrorDetails || 'Unknown error';
      const key = `${code}:::${msg}`;

      if (!errorGroups.has(key)) {
        const metaInfo = classifyMetaCode(code, msg);
        errorGroups.set(key, {
          code,
          message: msg,
          count: 0,
          classification: metaInfo.class,
          retryable: metaInfo.retryable,
          desc: metaInfo.desc,
          samples: [],
        });
      }

      const group = errorGroups.get(key);
      group.count++;
      if (group.samples.length < 3) {
        group.samples.push(maskPhone(rec.phone || rec.normalizedPhone));
      }
    }
  }

  const total = recipients.length;
  const deliveredOrRead = statusCounts.DELIVERED + statusCounts.READ;
  const successfulRate = total > 0 ? ((statusCounts.SENT + deliveredOrRead) / total * 100).toFixed(1) : '0';
  const deliveryRate = total > 0 ? (deliveredOrRead / total * 100).toFixed(1) : '0';
  const readRate = deliveredOrRead > 0 ? (statusCounts.READ / deliveredOrRead * 100).toFixed(1) : '0';

  console.log('======================================================');
  console.log(`BLOW SALON CAMPAIGN AUDIT: ${campaign.name || 'Untitled'}`);
  console.log('======================================================');
  console.log(`Campaign ID:          ${campaignId}`);
  console.log(`Template:             ${campaign.templateName || 'N/A'}`);
  console.log(`Status in DB:         ${campaign.status}`);
  console.log(`Created:              ${campaign.createdAt || 'N/A'}`);
  console.log(`Completed:            ${campaign.completedAt || 'In progress or N/A'}`);
  console.log('------------------------------------------------------');
  console.log(`Total Recipients:     ${total}`);
  console.log(`  - Read:             ${statusCounts.READ}`);
  console.log(`  - Delivered:        ${statusCounts.DELIVERED}`);
  console.log(`  - Sent (Accepted):  ${statusCounts.SENT}`);
  console.log(`  - Failed:           ${statusCounts.FAILED}`);
  console.log(`  - Excluded/Opt-out: ${statusCounts.EXCLUDED}`);
  console.log(`  - Pending in Queue: ${statusCounts.PENDING}`);
  console.log('------------------------------------------------------');
  console.log(`Successful Send Rate: ${successfulRate}%`);
  console.log(`Delivery Rate:        ${deliveryRate}%`);
  console.log(`Read Rate:            ${readRate}%`);
  console.log('======================================================');
  console.log('FAILURE REASON ANALYSIS (Grouped by Code & Message)');
  console.log('======================================================\n');

  if (errorGroups.size === 0) {
    console.log('No failed messages recorded for this campaign!\n');
  } else {
    const sortedGroups = Array.from(errorGroups.values()).sort((a, b) => b.count - a.count);

    let retryableCount = 0;
    let permanentCount = 0;

    for (const g of sortedGroups) {
      if (g.retryable) retryableCount += g.count;
      else permanentCount += g.count;

      console.log(`[Code: ${g.code}] ${g.classification} — ${g.count} recipient(s) (${((g.count / total) * 100).toFixed(1)}%)`);
      console.log(`  Description: ${g.desc}`);
      console.log(`  Message:     ${g.message}`);
      console.log(`  Retryable:   ${g.retryable ? 'YES (Transient / Rate-Limit)' : 'NO (Permanent / Ecosystem decline)'}`);
      console.log(`  Sample:      ${g.samples.join(', ')}`);
      console.log('');
    }

    console.log('------------------------------------------------------');
    console.log('RECOVERY SUMMARY:');
    console.log(`- Retryable Failures:  ${retryableCount} (e.g. rate-limit 130429, temporary network timeout)`);
    console.log(`- Permanent Failures:  ${permanentCount} (e.g. ecosystem decline 131049, undeliverable 131026)`);
    console.log('------------------------------------------------------\n');
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === '--list' || arg === '-l') {
    await listCampaigns();
    console.log('To analyze a specific campaign, run:');
    console.log('  node scripts/analyze-campaign-failures.mjs <campaignId>\n');
    process.exit(0);
  }

  await analyzeCampaign(arg);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

