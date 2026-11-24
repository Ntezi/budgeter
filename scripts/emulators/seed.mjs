#!/usr/bin/env node
// Synthetic seed for the local emulators (BUDG-1 AC-1). Refuses unless both
// emulator hosts are loopback and the project is demo-*. Clears emulator data
// first. Usage: node scripts/emulators/seed.mjs [--today=YYYY-MM-DD]
// All people are fictional (*@example.test); amounts are round numbers.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { PROJECT_ID, assertLoopback, childEnv } from './env.mjs';
import { seedDefaultAccounts } from './seed.default-accounts.mjs';
import { seedYearPlan } from './seed.year-plan.mjs';

const env = childEnv();
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'GCLOUD_PROJECT']) {
  process.env[key] = process.env[key] || env[key];
}
assertLoopback(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST');
assertLoopback(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'FIREBASE_AUTH_EMULATOR_HOST');
if (!String(process.env.GCLOUD_PROJECT).startsWith('demo-')) throw new Error('seed: project must be demo-*');

export const SEED_USERS = {
  owner: { uid: 'seed-owner', email: 'owner@example.test', password: 'seed-owner-pass', displayName: 'Test Owner' },
  member: { uid: 'seed-member', email: 'member@example.test', password: 'seed-member-pass', displayName: 'Test Member' },
  chef: { uid: 'seed-chef', email: 'chef@example.test', password: 'seed-chef-pass', displayName: 'Test Chef' },
};

const todayArg = process.argv.find((a) => a.startsWith('--today='))?.slice(8);
const today = todayArg ? new Date(`${todayArg}T12:00:00`) : new Date();
const pid = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const day = (d, n) => `${pid(d)}-${String(n).padStart(2, '0')}`;
const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
const cur = new Date(today.getFullYear(), today.getMonth(), 1);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const title = (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

async function clear() {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const a = await fetch(`http://${fsHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  const b = await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  if (!a.ok || !b.ok) throw new Error(`seed: clearing emulators failed (${a.status}/${b.status})`);
}

async function main() {
  initializeApp({ projectId: PROJECT_ID });
  await clear();
  const auth = getAuth();
  for (const u of Object.values(SEED_USERS)) await auth.createUser(u);

  const db = getFirestore();
  const owner = SEED_USERS.owner.uid;
  const u = db.collection('users').doc(owner);
  const batch = db.batch();
  const ts = FieldValue.serverTimestamp();

  batch.set(db.collection('workspaceMembers').doc(`${owner}_${SEED_USERS.member.uid}`), {
    ownerUid: owner, ownerEmail: SEED_USERS.owner.email, ownerName: 'Test Owner',
    memberUid: SEED_USERS.member.uid, memberEmail: SEED_USERS.member.email, memberName: 'Test Member',
    status: 'ACTIVE', role: 'MEMBER', createdAt: ts, updatedAt: ts,
  });

  const accounts = [
    ['acc-household', 'Household account', 'BANK', 1000],
    ['acc-savings', 'Savings account', 'BANK', 5000],
    ['acc-cash', 'Cash wallet', 'CASH', 200],
    ['acc-old', 'Old card', 'CARD', 0, true],
  ];
  for (const [id, name, type, openingBalance, archived] of accounts) {
    batch.set(u.collection('accounts').doc(id), { name, type, openingBalance, archived: !!archived, createdAt: ts, updatedAt: ts });
  }

  const months = [
    { d: prev, status: 'DECIDED' },
    { d: cur, status: 'DRAFT' },
  ];
  for (const { d, status } of months) {
    const p = u.collection('periods').doc(pid(d));
    batch.set(p, { title: title(d), periodId: pid(d), status, incomeTotal: 3000, targetPct: { needs: 0.5, wants: 0.3, sd: 0.2 }, createdAt: ts });
    batch.set(p.collection('incomeItems').doc('inc-salary'), { name: 'Salary', amount: 3000, active: true, periodId: pid(d) });
    const plan = [
      ['plan-rent', 'NEED', 'Rent', 1000, 'acc-household'],
      ['plan-groceries', 'NEED', 'Groceries', 400, 'acc-household'],
      ['plan-transport', 'NEED', 'Transport with a deliberately long budget line label', 150, 'acc-cash'],
      ['plan-dining', 'WANT', 'Dining out', 200, 'acc-household'],
      ['plan-savings', 'SAVINGS_DEBT', 'Emergency fund', 500, 'acc-savings'],
    ];
    for (const [id, group, name, amount, plannedAccountId] of plan) {
      batch.set(p.collection('planItems').doc(id), { group, name, amount, plannedAccountId, periodId: pid(d) });
    }
    const txs = [
      ['tx-rent', 'Rent', 1000, 'NEED', day(d, 1), 'acc-household', 'plan-rent', {}],
      ['tx-bus', 'Bus pass', 50, 'NEED', day(d, 3), 'acc-cash', 'plan-transport', {}],
      ['tx-shop-1', 'Rice 5 kg', 60, 'NEED', day(d, 5), 'acc-household', 'plan-groceries', { shoppingListId: 'list-weekly', shoppingListName: 'Weekly groceries', shoppingItemId: 'item-rice', shoppingItemName: 'Rice 5 kg' }],
      ['tx-shop-2', 'Rice 1 kg', 15, 'NEED', day(d, 6), 'acc-household', 'plan-groceries', { shoppingListId: 'list-weekly', shoppingListName: 'Weekly groceries', shoppingItemId: 'item-rice-small', shoppingItemName: 'Rice 1 kg' }],
      ['tx-dinner', 'Dinner', 40, 'WANT', day(d, 7), 'acc-household', 'plan-dining', {}],
    ];
    for (const [id, name, amount, group, date, acc, planItemId, extra] of txs) {
      batch.set(p.collection('transactions').doc(id), { name, amount, group, type: 'EXPENSE', date, accountId: acc, paidFromAccountId: acc, planItemId, periodId: pid(d), ...extra });
    }
  }

  // BUDG-40 F-1: one account with a hand-set balance for the current month (Cash wallet); the others have
  // none, so Accounts and Home must show their calculated balance. Same id and fields as setAccountPeriodCurrentManual.
  batch.set(u.collection('accountPeriodOverrides').doc(`acc-cash__${pid(cur)}`), { accountId: 'acc-cash', periodId: pid(cur), currentManual: 180, updatedAt: ts, updatedBy: owner });

  batch.set(u.collection('expenses').doc('exp-water'), { name: 'Water bill', amount: 30, group: 'NEED', active: true, createdAt: ts, updatedAt: ts });
  batch.set(u.collection('expenses').doc('exp-phone'), { name: 'Phone plan', amount: 25, group: 'NEED', active: true, createdAt: ts, updatedAt: ts });
  batch.set(u.collection('recurring').doc('rec-internet'), { flow: 'EXPENSE', name: 'Internet', amount: 45, group: 'NEED', dayOfMonth: 10, active: true });

  batch.set(u.collection('shoppingCategories').doc('cat-pantry'), { name: 'Pantry', createdAt: ts, updatedAt: ts });
  batch.set(u.collection('shoppingCategories').doc('cat-produce'), { name: 'Produce', createdAt: ts, updatedAt: ts });
  batch.set(u.collection('shoppingCatalog').doc('rice 5 kg'), { name: 'Rice 5 kg', category: 'Pantry', lastPrice: 60, createdAt: ts, updatedAt: ts });
  batch.set(u.collection('shoppingCatalog').doc('rice 1 kg'), { name: 'Rice 1 kg', category: 'Pantry', lastPrice: 15, createdAt: ts, updatedAt: ts });
  batch.set(u.collection('shoppingCatalog').doc('tomatoes'), { name: 'Tomatoes', category: 'Produce', lastPrice: 5, createdAt: ts, updatedAt: ts });
  const lists = [
    ['list-weekly', 'Weekly groceries', [['item-rice', 'Rice 5 kg', 1, 60, 'Pantry', true], ['item-rice-small', 'Rice 1 kg', 1, 15, 'Pantry', true], ['item-tomatoes', 'Tomatoes', 4, 5, 'Produce', false]]],
    ['list-party', 'Weekend party', [['item-drinks', 'Juice', 6, 3, 'Pantry', false]]],
  ];
  for (const [id, name, items] of lists) {
    const l = u.collection('shoppingLists').doc(id);
    batch.set(l, { name, status: 'open', archived: false, periodId: pid(cur), createdAt: ts, updatedAt: ts });
    for (const [iid, iname, quantity, price, category, bought] of items) {
      batch.set(l.collection('items').doc(iid), { name: iname, quantity, price, category, bought, status: bought ? 'purchased' : 'planned', source: 'manual', createdAt: ts, updatedAt: ts });
    }
  }
  seedDefaultAccounts({ batch, u, ts, prevId: pid(prev), curId: pid(cur) }); // BUDG-3
  seedYearPlan({ batch, u, ts, prevId: pid(prev), curId: pid(cur) }); // BUDG-2
  await batch.commit();
  await (await import('./seed-budg4.mjs')).seedBudg4({ auth, db, owner, FieldValue }); // BUDG-4 lane
  await (await import('./seed-budg5.mjs')).seedBudg5({ db, owner, FieldValue, prevPid: pid(prev), day: (n) => day(prev, n), currency: process.env.EXPO_PUBLIC_APP_CURRENCY || 'GHS' }); // BUDG-5 lane
  await (await import('./seed-budg43.mjs')).seedBudg43({ db, owner, FieldValue }); // BUDG-43 lane
  console.log(`[seed] demo-budgeta seeded: 3 users, 4 accounts, periods ${pid(prev)} (DECIDED) and ${pid(cur)} (DRAFT), 2 shopping lists`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
