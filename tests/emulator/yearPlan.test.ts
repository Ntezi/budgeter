// BUDG-2 emulator tests (AC-2…AC-6; SEC-13 rules, SEC-14, SEC-20; C-10).
// Run after `npm run emulators:up` (seeded). Client SDK signed in as the seeded owner, so
// firestore.rules apply. Writes to months 2032-xx, new yearItems and the seeded DRAFT month.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, terminate, updateDoc, type Firestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { resolveFirebaseTarget } from '../../lib/firebaseEmulator';
import { createPeriodDocIfAbsent } from '../../lib/repo/periodCreateCore';
import {
  applyYearItemEdit,
  createYearItem,
  includeYearItem,
  previewYearItemEdit,
  removeYearLine,
  saveYearOutline,
  skipYearItem,
  type YearCtx,
} from '../../lib/repo/yearPlanCore';
import { offersForDraft, yearTotals, type YearItemInput } from '../../lib/rules/yearPlan';
import { addMonthsToId, monthIdFromDate } from '../../lib/rules/months';

const target = resolveFirebaseTarget({ useEmulators: '1', projectId: 'demo-budgeta', host: '127.0.0.1' });
if (!target.useEmulators) throw new Error('emulator target required');
const EVIDENCE = process.env.BUDG_EVIDENCE_DIR || path.resolve('test-results/evidence');
const apps: { app: FirebaseApp; db: Firestore }[] = [];

async function client(email: string, password: string) {
  const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `emu-yp-${email}-${Date.now()}`);
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
const CUR = monthIdFromDate(new Date()); // seeded DRAFT month, pre-change shape
const LOCKED = addMonthsToId(CUR, -1); // seeded DECIDED month
const P1 = '2032-05';
const P2 = '2032-06';
let c: YearCtx;
let preChange: Record<string, unknown> = {};

function plain(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && typeof x.toMillis === 'function' ? `ts:${x.toMillis()}` : x)));
}
/** Every doc of the workspace that existed before BUDG-2 kinds: periods and their subcollections, sources, accounts. */
async function snapshot() {
  const out: Record<string, unknown> = {};
  for (const p of (await getDocs(collection(db, 'users', uid, 'periods'))).docs) {
    out[`periods/${p.id}`] = plain(p.data());
    for (const sub of ['planItems', 'allocations', 'transactions', 'incomeItems', 'yearDecisions']) {
      (await getDocs(collection(db, 'users', uid, 'periods', p.id, sub))).forEach((r) => (out[`periods/${p.id}/${sub}/${r.id}`] = plain(r.data())));
    }
  }
  for (const col of ['expenses', 'recurring', 'accounts', 'yearItems']) {
    (await getDocs(collection(db, 'users', uid, col))).forEach((r) => (out[`${col}/${r.id}`] = plain(r.data())));
  }
  return out;
}
const diffKeys = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
const counts = (s: Record<string, unknown>) => ({
  periods: Object.keys(s).filter((k) => /^periods\/[^/]+$/.test(k)).length,
  transactions: Object.keys(s).filter((k) => k.includes('/transactions/')).length,
});
function evidence(name: string, data: unknown) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(data, null, 2));
}
const get = async (...p: string[]) => (await getDoc(doc(db, 'users', uid, ...p))).data() as any;
const lineIds = async (pid: string) => (await getDocs(collection(db, 'users', uid, 'periods', pid, 'planItems'))).docs.map((d) => d.id);

const renewal: YearItemInput = { title: 'Passport renewal', dueDate: '2032-06-14', budgetInPeriodId: P1, estimateMinor: 15050, group: 'NEED', fundingAccountId: 'acc-household' };
let itemId = '';
let start: Record<string, unknown> = {};

before(async () => {
  ({ db, uid } = await client('owner@example.test', 'seed-owner-pass'));
  assert.equal(uid, OWNER);
  preChange = await snapshot();
  c = { firestore: db, userId: uid, appCurrency: 'GHS' };
  for (const p of [P1, P2]) await createPeriodDocIfAbsent(db, uid, p, p, p);
  start = await snapshot();
});
after(async () => {
  for (const { app, db: d } of apps) {
    await terminate(d);
    await deleteApp(app);
  }
});

test('AC-2 dated item: date-only and estimate items; due date and Budget-in month stored and read back separately', async () => {
  itemId = await createYearItem(c, renewal);
  const item = await get('yearItems', itemId);
  assert.equal(item.dueDate, '2032-06-14');
  assert.equal(item.budgetInPeriodId, '2032-05');
  assert.equal(item.estimateMinor, 15050);
  assert.ok(Number.isInteger(item.estimateMinor));
  assert.equal(item.fundingAccountId, 'acc-household');
  assert.equal(item.revision, 1);
  const dateOnlyId = await createYearItem(c, { title: 'Residence card appointment', dueDate: '2032-05-20' });
  const d = await get('yearItems', dateOnlyId);
  assert.equal(d.estimateMinor, undefined);
  assert.equal(d.budgetInPeriodId, '2032-05');
  assert.equal(d.kind, 'EVENT');
  await assert.rejects(createYearItem(c, { title: '', dueDate: '2032-02-30' }), /Title is required/);
  await saveYearOutline(c, 2032, 'Renew documents early.');
  assert.equal((await get('yearOutline', '2032')).notes, 'Renew documents early.');
});

test('AC-4/SEC-20 include x2 sequential, x2 concurrent and reopen → one line, one decision', async () => {
  const input = { itemId, accountId: 'acc-household', suggestedAccountId: 'acc-household', group: 'NEED', tag: 'NEEDS' };
  const first = await includeYearItem(c, P1, input);
  const again = await includeYearItem(c, P1, input);
  assert.deepEqual([first.created, again.created], [true, false]);
  const line = await get('periods', P1, 'planItems', `year_${itemId}`);
  assert.equal(line.amount, 150.5);
  assert.equal(line.sourceType, 'YEAR_ITEM');
  assert.equal(line.sourceId, itemId);
  assert.equal(line.sourceRevision, 1);
  assert.equal(line.plannedAccountId, 'acc-household');
  assert.equal((await get('periods', P1, 'allocations', `item_plan_year_${itemId}`)).amount, 150.5);
  // concurrent: a second item in P1
  const other = await createYearItem(c, { ...renewal, title: 'Car tax', estimateMinor: 9000, fundingAccountId: undefined });
  const both = await Promise.all([1, 2].map(() => includeYearItem(c, P1, { ...input, itemId: other, accountId: '', suggestedAccountId: '' })));
  assert.equal(both.filter((r) => r.created).length, 1);
  // reopen: a fresh client reads the month and sees no offers left
  const re = await client('owner@example.test', 'seed-owner-pass');
  const lines = (await getDocs(collection(re.db, 'users', uid, 'periods', P1, 'planItems'))).docs.map((x) => ({ id: x.id }));
  const decisions = (await getDocs(collection(re.db, 'users', uid, 'periods', P1, 'yearDecisions'))).docs.map((x) => ({ id: x.id, ...(x.data() as any) }));
  const items = (await getDocs(collection(re.db, 'users', uid, 'yearItems'))).docs.map((x) => ({ id: x.id, ...(x.data() as any) }));
  assert.deepEqual(offersForDraft(P1, { status: 'DRAFT' }, items, lines, decisions).map((i) => i.id).filter((id) => id === itemId || id === other), []);
  assert.equal(lines.filter((l) => l.id === `year_${itemId}` || l.id === `year_${other}`).length, 2);
  assert.equal(decisions.filter((x) => x.id === itemId).length, 1);
  assert.deepEqual((await get('yearItems', itemId)).linkedPeriodIds, [P1]);
  evidence('AC-4-idempotent-include.json', { sequential: [first.created, again.created], concurrent: both.map((r) => r.created), linesForItem: 1, decisionsForItem: 1 });
});

test('AC-3 skip and not-offered: skip is stored once; another month or a missing month is refused', async () => {
  const gift = await createYearItem(c, { title: 'Gift', dueDate: '2032-05-28', estimateMinor: 5000, group: 'WANT' });
  assert.deepEqual(await skipYearItem(c, P1, gift), { skipped: true });
  assert.deepEqual(await skipYearItem(c, P1, gift), { skipped: true });
  assert.equal((await get('periods', P1, 'yearDecisions', gift)).decision, 'SKIPPED');
  await assert.rejects(includeYearItem(c, P2, { itemId: gift, accountId: '', suggestedAccountId: '', tag: 'WANTS' }), /not planned for this month/);
  await assert.rejects(includeYearItem(c, '2032-09', { itemId: gift, accountId: '', suggestedAccountId: '', tag: 'WANTS' }), /no budget yet/);
  assert.equal((await getDoc(doc(db, 'users', uid, 'periods', '2032-09'))).exists(), false, 'never creates a month');
});

test('AC-6 edit after inclusion: preview first; apply updates the DRAFT line only; locked month unchanged', async () => {
  const edited = { ...renewal, estimateMinor: 18000 };
  const s0 = await snapshot();
  const preview = await previewYearItemEdit(c, itemId, edited);
  assert.deepEqual(diffKeys(s0, await snapshot()), [], 'preview writes nothing');
  assert.deepEqual(preview.map((r) => [r.pid, r.action, r.from, r.to]), [[P1, 'update', 150.5, 180]]);
  // the item is also linked to the seeded locked month (simulated old inclusion) – it must not change
  await updateDoc(doc(db, 'users', uid, 'yearItems', itemId), { linkedPeriodIds: [P1, LOCKED] });
  const lockedBefore = await snapshot();
  const r = await applyYearItemEdit(c, itemId, edited, { expectedRevision: 1, applyToDrafts: true });
  assert.deepEqual(r.updated, [P1]);
  assert.equal((await get('periods', P1, 'planItems', `year_${itemId}`)).amount, 180);
  assert.equal((await get('periods', P1, 'planItems', `year_${itemId}`)).sourceRevision, 2);
  assert.equal((await get('periods', P1, 'allocations', `item_plan_year_${itemId}`)).amount, 180);
  const changed = diffKeys(lockedBefore, await snapshot());
  assert.deepEqual(changed.filter((k) => k.includes(`periods/${LOCKED}`)), [], 'DECIDED month docs identical');
  await assert.rejects(applyYearItemEdit(c, itemId, edited, { expectedRevision: 1, applyToDrafts: true }), /changed meanwhile/);
  // locked seeded year line: editing the seeded item never touches it
  const schoolBefore = await get('periods', LOCKED, 'planItems', 'year_yr-school');
  const pv = await previewYearItemEdit(c, 'yr-school', { title: 'School fees', dueDate: `${LOCKED}-05`, budgetInPeriodId: LOCKED, estimateMinor: 25000, group: 'NEED' });
  assert.deepEqual(pv.map((x) => x.action), ['locked-unchanged']);
  await applyYearItemEdit(c, 'yr-school', { title: 'School fees', dueDate: `${LOCKED}-05`, budgetInPeriodId: LOCKED, estimateMinor: 25000, group: 'NEED' }, { expectedRevision: 1, applyToDrafts: true });
  assert.deepEqual(await get('periods', LOCKED, 'planItems', 'year_yr-school'), schoolBefore);
  await assert.rejects(includeYearItem(c, LOCKED, { itemId: 'yr-school', accountId: '', suggestedAccountId: '', tag: 'NEEDS' }), /DECIDED/);
  // moved Budget-in month: line stays, offered for removal, removed only on request
  const moved = { ...edited, budgetInPeriodId: P2 };
  assert.deepEqual((await previewYearItemEdit(c, itemId, moved)).map((x) => [x.pid, x.action]), [[P1, 'move-offer']]);
  await applyYearItemEdit(c, itemId, moved, { expectedRevision: 2, applyToDrafts: true });
  assert.ok((await lineIds(P1)).includes(`year_${itemId}`), 'old draft line stays until removed');
  await removeYearLine(c, P1, itemId);
  assert.ok(!(await lineIds(P1)).includes(`year_${itemId}`));
  assert.equal(await get('periods', P1, 'allocations', `item_plan_year_${itemId}`), undefined);
  evidence('AC-6-edit-preview-and-lock.json', { preview, applied: r, lockedMonthChangedDocs: changed.filter((k) => k.includes(`periods/${LOCKED}`)) });
});

test('AC-6 totals: annual amount and linked monthly line never counted twice', async () => {
  const items = (await getDocs(collection(db, 'users', uid, 'yearItems'))).docs.map((x) => ({ id: x.id, ...(x.data() as any) }));
  const lines: any[] = [];
  for (const it of items) for (const pid of it.linkedPeriodIds ?? []) {
    const l = await get('periods', pid, 'planItems', `year_${it.id}`);
    if (l) lines.push({ id: `year_${it.id}`, ...l, periodId: pid });
  }
  const t = yearTotals(items, lines);
  const naive = items.reduce((s, i) => s + (i.estimateMinor ?? 0), 0) + lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
  const once = t.rows.reduce((s, r) => s + r.minor, 0);
  assert.equal(t.totalMinor, once);
  assert.ok(t.totalMinor < naive);
  for (const row of t.rows) if (row.basis === 'LINES') assert.equal(row.minor, lines.filter((l) => l.sourceId === row.itemId).reduce((s, l) => s + Math.round(l.amount * 100), 0));
  evidence('AC-6-totals.json', { totalMinor: t.totalMinor, inBudgetsMinor: t.inBudgetsMinor, estimatesMinor: t.estimatesMinor, naiveDoubleCountMinor: naive });
});

test('AC-5 nothing auto-created: period and transaction counts unchanged by every year-plan operation', async () => {
  const end = await snapshot();
  assert.deepEqual(counts(end), counts(start));
  evidence('AC-5-counts.json', { before: counts(start), after: counts(end) });
});

test('C-10 pre-change documents: never rewritten, moved or deleted; old shapes still work', async () => {
  // Include a seeded item into the seeded DRAFT month (period doc in the pre-change shape).
  const r = await includeYearItem(c, CUR, { itemId: 'yr-gift', accountId: '', suggestedAccountId: '', tag: 'WANTS' });
  assert.equal(r.created, true);
  const now = await snapshot();
  const report: Record<string, string> = {};
  for (const k of Object.keys(preChange)) {
    if (k.startsWith('yearItems/') || k.includes('/yearDecisions/') || k.includes('year_')) continue; // BUDG-2 kinds
    assert.ok(k in now, `${k} still exists`);
    assert.deepEqual(now[k], preChange[k], `${k} unchanged`);
    report[k] = 'unchanged';
  }
  // a minimal legacy-like item (only title + dueDate + estimate) is still offered and includable
  await setDoc(doc(db, 'users', uid, 'yearItems', 'yr-minimal'), { title: 'Minimal', dueDate: `${P2}-02`, estimateMinor: 1000 });
  const minimal = { id: 'yr-minimal', ...(await get('yearItems', 'yr-minimal')) };
  assert.deepEqual(offersForDraft(P2, { status: 'DRAFT' }, [minimal], [], []).map((i) => i.id), ['yr-minimal']);
  assert.equal((await includeYearItem(c, P2, { itemId: 'yr-minimal', accountId: '', suggestedAccountId: '', tag: 'NEEDS' })).created, true);
  evidence('C-10-pre-change-shape.json', { checkedDocs: Object.keys(report).length, allUnchanged: true });
});

test('SEC-13/SEC-14 rules: non-member (chef on this stack) denied yearItems and yearOutline; member allowed (wildcard)', async () => {
  const chef = await client('chef@example.test', 'seed-chef-pass');
  await assert.rejects(getDocs(collection(chef.db, 'users', OWNER, 'yearItems')), /permission/i);
  await assert.rejects(getDoc(doc(chef.db, 'users', OWNER, 'yearOutline', '2032')), /permission/i);
  await assert.rejects(setDoc(doc(chef.db, 'users', OWNER, 'yearItems', 'x'), { title: 'x', dueDate: '2032-01-01' }), /permission/i);
  await assert.rejects(setDoc(doc(chef.db, 'users', OWNER, 'yearOutline', '2032'), { notes: 'x' }), /permission/i);
  const member = await client('member@example.test', 'seed-member-pass');
  assert.ok((await getDocs(collection(member.db, 'users', OWNER, 'yearItems'))).size > 0);
});
