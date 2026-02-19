#!/usr/bin/env node

/**
 * Sends daily balance reminder emails for accounts with daily reminders enabled.
 *
 * Required env:
 * - SMTP_HOST
 * - SMTP_PORT
 * - SMTP_USER
 * - SMTP_PASS
 * Optional:
 * - SMTP_SECURE=true|false (default false)
 * - SMTP_FROM (default SMTP_USER)
 * - FIREBASE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json
 * - REMINDER_FORCE=true (ignore hour + lastSentDate checks)
 */

const path = require('path');
const nodemailer = require('nodemailer');
const { getApps, initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function env(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function mustEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function initFirebaseAdmin() {
  if (getApps().length) return;
  const serviceAccountPath = env('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (serviceAccountPath) {
    const resolved = path.resolve(serviceAccountPath);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const serviceAccount = require(resolved);
    initializeApp({ credential: cert(serviceAccount) });
    return;
  }
  initializeApp({ credential: applicationDefault() });
}

function createTransport() {
  const host = mustEnv('SMTP_HOST');
  const port = Number(mustEnv('SMTP_PORT'));
  const user = mustEnv('SMTP_USER');
  const pass = mustEnv('SMTP_PASS');
  const secure = String(env('SMTP_SECURE', 'false')).toLowerCase() === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(
    Number(value) || 0
  );
}

async function run() {
  initFirebaseAdmin();
  const db = getFirestore();
  const transporter = createTransport();
  const from = env('SMTP_FROM', mustEnv('SMTP_USER'));
  const now = new Date();
  const currentUtcHour = now.getUTCHours();
  const currentDateUtc = now.toISOString().slice(0, 10);
  const force = String(env('REMINDER_FORCE', 'false')).toLowerCase() === 'true';

  const usersSnap = await db.collection('users').get();
  let sent = 0;
  let scanned = 0;

  for (const userDoc of usersSnap.docs) {
    scanned += 1;
    const uid = userDoc.id;
    const reminderRef = db.doc(`users/${uid}/settings/reminders`);
    const reminderSnap = await reminderRef.get();
    const settings = reminderSnap.exists ? reminderSnap.data() || {} : {};

    if (!settings.dailyBalanceReminderEnabled) continue;
    const to = String(settings.dailyBalanceReminderEmail || '').trim();
    if (!to) continue;

    const targetHour = Number(settings.dailyBalanceReminderHourUtc ?? 7);
    if (!force && targetHour !== currentUtcHour) continue;

    const lastSentDateUtc = settings.lastSentDateUtc;
    if (!force && lastSentDateUtc === currentDateUtc) continue;

    const accountsSnap = await db.collection(`users/${uid}/accounts`).get();
    const activeReminderAccounts = accountsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((row) => row.dailyReminderEnabled === true && row.archived !== true);

    if (!activeReminderAccounts.length) continue;

    const lines = activeReminderAccounts
      .map((row) => `• ${row.name || row.id}: opening ${formatMoney(row.openingBalance || 0)}`)
      .join('\n');

    const subject = 'Budgeter reminder: update account remaining balances';
    const text = `Hi,\n\nPlease update today’s remaining balances for your accounts:\n${lines}\n\nSent by Budgeter.`;

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });

    await reminderRef.set(
      {
        lastSentDateUtc: currentDateUtc,
        lastSentAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    sent += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`[daily-reminders] scanned=${scanned} sent=${sent} hour=${currentUtcHour}UTC date=${currentDateUtc}`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[daily-reminders] failed:', error);
  process.exitCode = 1;
});
