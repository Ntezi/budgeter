// BUDG-3 emulator tests (AC-1, AC-3, AC-4, AC-6; SEC-14, SEC-20, SEC-21).
// Run after `npm run emulators:up` (seeded). Client SDK signed in as the seeded
// owner, so firestore.rules apply. Writes only to months 2031-xx and the seeded sources.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  terminate,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { resolveFirebaseTarget } from '../../lib/firebaseEmulator';
import { emulatorPorts } from '../../lib/emulatorPorts';
import { createPeriodDocIfAbsent } from '../../lib/repo/periodCreateCore';
import {
  addLinkedExpenseLine,
  applySuggestedAccounts,
  setLinkedLineAccount,
  setSourceDefaultAccount,
  type Ctx,
} from '../../lib/repo/planLinesCore';
import { addMonthsToId, monthIdFromDate } from '../../lib/rules/months';

const target = resolveFirebaseTarget({ useEmulators: '1', projectId: 'demo-budgeta', host: '127.0.0.1', authPort: String(emulatorPorts().auth), firestorePort: String(emulatorPorts().firestore) });
if (!target.useEmulators) throw new Error('emulator target required');
const EVIDENCE = process.env.BUDG_EVIDENCE_DIR || path.resolve('test-results/evidence');
const apps: { app: FirebaseApp; db: Firestore }[] = [];

async function client(email: string, password: string) {
  const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `emu-da-${email}-${Date.now()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, target.host, target.firestorePort);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${target.host}:${target.authPort}`, { disableWarnings: true });
  const cred = await signInWithEmailAndPassword(auth, email, password);
  apps.push({ app, db });
  return { db, uid: cred.user.uid };
}

let db: Firestore;
let uid = '';
const OWNER = 'seed-owner';
const LOCKED_PID = addMonthsToId(monthIdFromDate(new Date()), -1); // seeded DECIDED month
const P1 = '2031-07';
const P2 = '2031-08';

let preChange: Record<string, unknown> = {};

before(async () => {
  ({ db, uid } = await client('owner@example.test', 'seed-owner-pass'));
  preChange = await snapshot(); // C-10: seeded docs in today's (pre-BUDG-3) shape
  assert.equal(uid, OWNER);
  for (const p of [P1, P2]) await createPeriodDocIfAbsent(db, uid, p, p, p);
  await setDoc(doc(db, 'users', uid, 'accounts', 'acc-usd-test'), { name: 'USD test', openingBalance: 0, currencyCode: 'USD', archived: false });
});
after(async () => {
  for (const { app, db: d } of apps) {
    await terminate(d);
    await deleteApp(app);
  }
});

const ctx = (pid: string): Ctx => ({ firestore: db, userId: uid, periodDocId: pid, periodId: pid, appCurrency: 'GHS' });
const water = (accountId: string, suggested = 'acc-household') => ({
  expenseItemId: 'exp-water', name: 'Water bill', amount: 30, group: 'NEED', tag: 'NEEDS', accountId, suggestedAccountId: suggested,
});

function plain(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && typeof x.toMillis === 'function' ? `ts:${x.toMillis()}` : x)));
}

/** Snapshot of every money-relevant doc of the workspace: periods + planItems + allocations + transactions + sources + accounts. */
async function snapshot() {
  const out: Record<string, unknown> = {};
  const periods = await getDocs(collection(db, 'users', uid, 'periods'));
  for (const p of periods.docs) {
    out[`periods/${p.id}`] = plain(p.data());
    for (const sub of ['planItems', 'allocations', 'transactions', 'incomeItems']) {
      const rows = await getDocs(collection(db, 'users', uid, 'periods', p.id, sub));
      rows.forEach((r) => (out[`periods/${p.id}/${sub}/${r.id}`] = plain(r.data())));
    }
  }
  for (const c of ['expenses', 'recurring', 'accounts']) {
    (await getDocs(collection(db, 'users', uid, c))).forEach((r) => (out[`${c}/${r.id}`] = plain(r.data())));
  }
  return out;
}
function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}
function evidence(name: string, data: unknown) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(data, null, 2));
}
const get = async (...p: string[]) => (await getDoc(doc(db, 'users', uid, ...p))).data() as any;

test('AC-1/AC-2 linked line by doc id, suggested default applied on Add; rename keeps the link', async () => {
  const r = await addLinkedExpenseLine(ctx(P1), water('acc-household'));
  assert.deepEqual(r, { created: true, lineId: 'exp_exp-water' });
  await updateDoc(doc(db, 'users', uid, 'expenses', 'exp-water'), { name: 'Water and sewage' });
  const line = await get('periods', P1, 'planItems', 'exp_exp-water');
  assert.equal(line.sourceType, 'EXPENSE_ITEM');
  assert.equal(line.sourceId, 'exp-water');
  assert.equal(line.plannedAccountId, 'acc-household');
  assert.equal(line.accountChoice, 'DEFAULT');
  const alloc = await get('periods', P1, 'allocations', 'item_plan_exp_exp-water');
  assert.equal(alloc.accountId, 'acc-household');
  assert.equal(alloc.amount, 30);
  await updateDoc(doc(db, 'users', uid, 'expenses', 'exp-water'), { name: 'Water bill' });
});

test('SEC-20 x2 sequential and x2 concurrent adds of one item in one month -> one line', async () => {
  const again = await addLinkedExpenseLine(ctx(P1), water('acc-household'));
  assert.equal(again.created, false);
  const both = await Promise.all([addLinkedExpenseLine(ctx(P2), water('acc-household')), addLinkedExpenseLine(ctx(P2), water('acc-household'))]);
  assert.equal(both.filter((x) => x.created).length, 1);
  const lines = await getDocs(collection(db, 'users', uid, 'periods', P2, 'planItems'));
  assert.equal(lines.docs.filter((d) => d.id === 'exp_exp-water').length, 1);
});

test('AC-6 two months reuse one default; changing it (Expenses screen) writes the source doc only', async () => {
  const s0 = await snapshot();
  assert.equal((s0[`periods/${P1}/allocations/item_plan_exp_exp-water`] as any).accountId, 'acc-household');
  assert.equal((s0[`periods/${P2}/allocations/item_plan_exp_exp-water`] as any).accountId, 'acc-household');
  await setSourceDefaultAccount(db, uid, 'expenses', 'exp-water', 'acc-savings', 'GHS');
  const s1 = await snapshot();
  const changed = diffKeys(s0, s1);
  evidence('AC-6-default-change-snapshot-diff.json', { action: 'setSourceDefaultAccount exp-water -> acc-savings', docsBefore: Object.keys(s0).length, docsAfter: Object.keys(s1).length, changed });
  assert.deepEqual(changed, ['expenses/exp-water']);
});

test('AC-3/AC-6 "Only this month" changes this line only; "Also future" adds the source default; locked month and transactions identical', async () => {
  await setSourceDefaultAccount(db, uid, 'expenses', 'exp-water', 'acc-household', 'GHS');
  const s0 = await snapshot();
  await setLinkedLineAccount(ctx(P1), { lineId: 'exp_exp-water', accountId: 'acc-cash', scope: 'LINE', tag: 'NEEDS' });
  const s1 = await snapshot();
  const onlyLine = diffKeys(s0, s1);
  assert.deepEqual(onlyLine, [`periods/${P1}/allocations/item_plan_exp_exp-water`, `periods/${P1}/planItems/exp_exp-water`]);
  assert.equal((s1[`periods/${P1}/planItems/exp_exp-water`] as any).accountChoice, 'EXPLICIT');
  assert.equal((s1['expenses/exp-water'] as any).defaultAccountId, 'acc-household');

  await setLinkedLineAccount(ctx(P2), { lineId: 'exp_exp-water', accountId: 'acc-savings', scope: 'FUTURE', tag: 'NEEDS' });
  const s2 = await snapshot();
  const future = diffKeys(s1, s2);
  assert.deepEqual(future, ['expenses/exp-water', `periods/${P2}/allocations/item_plan_exp_exp-water`, `periods/${P2}/planItems/exp_exp-water`]);
  assert.equal((s2['expenses/exp-water'] as any).defaultAccountId, 'acc-savings');
  assert.equal((s2[`periods/${P1}/planItems/exp_exp-water`] as any).plannedAccountId, 'acc-cash', 'other month untouched');
  // Amounts never change; no transaction anywhere changed; the locked month is byte-identical.
  for (const k of [...onlyLine, ...future].filter((x) => x.includes('/allocations/'))) assert.equal((s2[k] as any).amount, 30);
  const txOrLocked = (s: Record<string, unknown>) => Object.fromEntries(Object.entries(s).filter(([k]) => k.includes('/transactions/') || k.startsWith(`periods/${LOCKED_PID}`)));
  assert.deepEqual(txOrLocked(s2), txOrLocked(s0));
  evidence('AC-3-AC-6-line-vs-future-snapshot-diff.json', {
    onlyThisMonth: onlyLine,
    alsoFuture: future,
    transactionsAndLockedMonthDocs: Object.keys(txOrLocked(s0)).length,
    transactionsAndLockedMonthIdentical: true,
  });
});

test('AC-6 locked (DECIDED) month: add and account change abort with zero writes', async () => {
  const s0 = await snapshot();
  await assert.rejects(addLinkedExpenseLine(ctx(LOCKED_PID), { ...water('acc-household'), expenseItemId: 'exp-phone' }), /DECIDED/);
  await assert.rejects(setLinkedLineAccount(ctx(LOCKED_PID), { lineId: 'exp_exp-water', accountId: 'acc-cash', scope: 'FUTURE', tag: 'NEEDS' }), /DECIDED/);
  assert.deepEqual(diffKeys(s0, await snapshot()), []);
});

test('AC-4 missing, archived, other-currency account: refused, never switched', async () => {
  const s0 = await snapshot();
  for (const acc of ['acc-gone', 'acc-old', 'acc-usd-test']) {
    await assert.rejects(setLinkedLineAccount(ctx(P1), { lineId: 'exp_exp-water', accountId: acc, scope: 'LINE', tag: 'NEEDS' }), /cannot be used/);
    await assert.rejects(setSourceDefaultAccount(db, uid, 'expenses', 'exp-water', acc, 'GHS'), /cannot be used/);
  }
  assert.deepEqual(diffKeys(s0, await snapshot()), []);
});

test('SEC-21 suggestion-only template line gets an allocation only through the explicit Review apply', async () => {
  const P3 = '2031-09';
  await createPeriodDocIfAbsent(db, uid, P3, P3, P3);
  const lineId = `recbudget_plan_rec-internet_${P3}`;
  await setDoc(doc(db, 'users', uid, 'periods', P3, 'planItems', lineId), {
    name: 'Internet', amount: 45, group: 'NEED', sourceType: 'RECURRING', sourceId: 'rec-internet', suggestedAccountId: 'acc-household', periodId: P3,
  });
  assert.equal((await getDocs(collection(db, 'users', uid, 'periods', P3, 'allocations'))).size, 0);
  const res = await applySuggestedAccounts(ctx(P3), { lineIds: [lineId, lineId], tagFor: () => 'NEEDS' });
  assert.deepEqual(res.applied, [lineId]);
  assert.equal(res.skipped[0].reason, 'already assigned');
  const allocs = await getDocs(collection(db, 'users', uid, 'periods', P3, 'allocations'));
  assert.equal(allocs.size, 1);
  assert.equal(allocs.docs[0].data().accountId, 'acc-household');
});

test('SEC-20 concurrent lock: add racing a DECIDED lock never writes after the lock', async () => {
  const P4 = '2031-10';
  await createPeriodDocIfAbsent(db, uid, P4, P4, P4);
  const results = await Promise.allSettled([
    addLinkedExpenseLine(ctx(P4), water('acc-household')),
    updateDoc(doc(db, 'users', uid, 'periods', P4), { status: 'DECIDED' }),
    addLinkedExpenseLine(ctx(P4), { ...water('acc-household'), expenseItemId: 'exp-phone' }),
  ]);
  for (const r of results) if (r.status === 'rejected') assert.match(String(r.reason), /DECIDED/);
  const lines = (await getDocs(collection(db, 'users', uid, 'periods', P4, 'planItems'))).docs.map((d) => d.id);
  const allocs = (await getDocs(collection(db, 'users', uid, 'periods', P4, 'allocations'))).docs.map((d) => d.data().sourceItemId);
  assert.deepEqual([...allocs].sort(), [...lines].sort(), 'every line written has its allocation, nothing half-written');
  // After the lock nothing more can be written.
  await assert.rejects(addLinkedExpenseLine(ctx(P4), { ...water('acc-household'), expenseItemId: 'exp-late' }), /DECIDED/);
  assert.equal((await getDocs(collection(db, 'users', uid, 'periods', P4, 'planItems'))).size, lines.length);
  evidence('AC-6-concurrent-lock.json', { outcomes: results.map((r) => r.status), linesWrittenBeforeLock: lines.length });
});

test('SEC-14 rules: a non-member cannot write defaultAccountId; a member can (wildcard, documented)', async () => {
  const chef = await client('chef@example.test', 'seed-chef-pass');
  await assert.rejects(updateDoc(doc(chef.db, 'users', OWNER, 'expenses', 'exp-water'), { defaultAccountId: 'acc-cash' }), /permission/i);
  const member = await client('member@example.test', 'seed-member-pass');
  await updateDoc(doc(member.db, 'users', OWNER, 'recurring', 'rec-internet'), { defaultAccountId: 'acc-household' });
});

test('C-10 pre-change documents: never rewritten, moved or deleted; still resolve as before', async () => {
  const now = await snapshot();
  const PRE_SHAPE = /\/planItems\/plan-|\/transactions\/|\/incomeItems\/|^accounts\/acc-(household|savings|cash|old)$|^periods\/[0-9-]+$|^recurring\/|^expenses\//;
  const report: Record<string, string> = {};
  for (const [key, before] of Object.entries(preChange)) {
    if (!PRE_SHAPE.test(key) || key.includes('2031-')) continue;
    const after = now[key] as Record<string, unknown> | undefined;
    assert.ok(after, `${key} still exists`);
    // Every field that existed keeps its value; only new optional BUDG-3 fields may appear on sources.
    for (const [field, value] of Object.entries(before as Record<string, unknown>)) {
      if (['defaultAccountId', 'defaultAccountUpdatedAt', 'updatedAt'].includes(field)) continue;
      assert.deepEqual(after[field], value, `${key}.${field} unchanged`);
    }
    const added = Object.keys(after).filter((f) => !(f in (before as object)));
    assert.ok(added.every((f) => ['defaultAccountId', 'defaultAccountUpdatedAt'].includes(f)), `${key} gained only optional fields: ${added}`);
    if (key.includes('/planItems/plan-') || key.includes('/transactions/')) assert.deepEqual(after, before, `${key} byte-identical`);
    report[key] = added.length ? `kept + optional ${added.join(',')}` : 'identical';
  }
  // An unlinked pre-change line is refused by the linked-line writer (no write), so the existing selector path stays in charge.
  const cur = monthIdFromDate(new Date());
  await assert.rejects(setLinkedLineAccount(ctx(cur), { lineId: 'plan-rent', accountId: 'acc-cash', scope: 'LINE', tag: 'NEEDS' }), /stable link/);
  assert.deepEqual(diffKeys(now, await snapshot()), []);
  evidence('C-10-pre-change-shape.json', { checkedDocs: Object.keys(report).length, report });
});
