// BUDG-5 on the emulator, client SDK per actor so firestore.rules apply.
// AC-2 idempotency, AC-3 drafts never post, AC-4 / SEC-19 privacy, SEC-18 delete cascade,
// SEC-20 locked month, C-10 pre-change documents untouched. Run after `npm run emulators:up` (seeded).
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, setDoc, terminate, type Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import {
  confirmReceiptAsNewExpense, confirmReceiptToExisting, deleteReceiptIn, listPriceObservationsIn, saveReceiptDraft,
} from '../../lib/repo/receiptsOps';
import type { Receipt } from '../../lib/repo/receiptsCore';

const offset = Number(process.env.BUDGETA_EMULATOR_PORT_OFFSET || 0);
const OWNER = 'seed-owner';
const apps: FirebaseApp[] = [];
const dbs: Firestore[] = [];
const run = Date.now().toString(36);
const now = new Date();
const pid = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const prevPid = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;

async function actor(name: string, creds: [string, string] | 'anonymous') {
  const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `rcpt-${name}-${run}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080 + offset);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${9099 + offset}`, { disableWarnings: true });
  if (creds === 'anonymous') await signInAnonymously(auth); else await signInWithEmailAndPassword(auth, creds[0], creds[1]);
  apps.push(app);
  dbs.push(db);
  return db;
}
const denied = async (p: Promise<unknown>, what: string) => {
  await assert.rejects(p, (e: any) => e?.code === 'permission-denied', `${what} should be denied`);
};
function receipt(id: string, date = `${pid}-05`): Receipt {
  return {
    id, status: 'DRAFT', purchaseDate: date, currencyCode: 'GHS', totalMinor: 0, createdBy: OWNER, storeName: 'Test Market',
    lines: [
      { lineId: 'l1', name: 'Rice 1 kg', quantity: 1, unit: 'kg', lineTotalMinor: 1650, catalogItemId: 'rice 1 kg' },
      { lineId: 'l2', name: 'Tomatoes', quantity: 500, unit: 'g', lineTotalMinor: 275, catalogItemId: 'tomatoes', promo: true },
    ],
  };
}
const count = async (db: Firestore, ...path: string[]) => (await getDocs(collection(db, path[0], ...path.slice(1)))).size;

let owner: Firestore, member: Firestore, chef: Firestore, stranger: Firestore, anon: Firestore;
before(async () => {
  owner = await actor('owner', ['owner@example.test', 'seed-owner-pass']);
  member = await actor('member', ['member@example.test', 'seed-member-pass']);
  chef = await actor('chef', ['chef@example.test', 'seed-chef-pass']);
  stranger = await actor('stranger', ['stranger@example.test', 'seed-stranger-pass']);
  anon = await actor('anon', 'anonymous');
});
after(async () => {
  for (const db of dbs) await terminate(db);
  for (const app of apps) await deleteApp(app);
});

describe('AC-4 / SEC-19 receipts are private to the household', () => {
  test('household member reads and writes; chef, stranger and anonymous are denied on all three collections', async () => {
    const id = `priv-${run}`;
    await saveReceiptDraft(member, OWNER, receipt(id));
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'receipts', id))).exists(), true);
    for (const sub of ['receipts', 'receiptLinks', 'priceObservations']) {
      await getDocs(collection(member, 'users', OWNER, sub));
      for (const [who, db] of [['chef', chef], ['stranger', stranger], ['anonymous', anon]] as const) {
        await denied(getDocs(collection(db, 'users', OWNER, sub)), `${who} lists ${sub}`);
        await denied(setDoc(doc(db, 'users', OWNER, sub, `x-${run}`), { receiptId: id }), `${who} writes ${sub}`);
      }
    }
    await denied(getDoc(doc(chef, 'users', OWNER, 'receipts', id)), 'chef reads one receipt');
    await denied(saveReceiptDraft(chef, OWNER, receipt(`chef-${run}`)), 'chef saves a receipt');
    await deleteReceiptIn(owner, OWNER, id);
  });
});

describe('AC-2 / AC-3 / SEC-20 idempotent confirm, drafts never post', () => {
  test('draft saved twice is one receipt and posts nothing', async () => {
    const id = `draft-${run}`;
    const before = await count(owner, 'users', OWNER, 'periods', pid, 'transactions');
    await saveReceiptDraft(owner, OWNER, receipt(id));
    await saveReceiptDraft(owner, OWNER, receipt(id));
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'receipts', id))).data()?.status, 'DRAFT');
    assert.equal(await count(owner, 'users', OWNER, 'periods', pid, 'transactions'), before, 'no transaction from a draft');
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'periods', pid, 'transactions', `rcpt_${id}`))).exists(), false);
    assert.equal((await listPriceObservationsIn(owner, OWNER)).filter((o) => o.receiptId === id).length, 0, 'no observations from a draft');
    await deleteReceiptIn(owner, OWNER, id);
  });

  test('new expense: x2 sequential and x2 concurrent -> one receipt, one tx, one link; exact amount', async () => {
    for (const mode of ['sequential', 'concurrent'] as const) {
      const id = `new-${mode}-${run}`;
      const r = receipt(id);
      const before = await count(owner, 'users', OWNER, 'periods', pid, 'transactions');
      const acct = { accountId: 'acc-cash', planItemId: 'plan-groceries' };
      const results = mode === 'sequential'
        ? [await confirmReceiptAsNewExpense(owner, OWNER, r, acct), await confirmReceiptAsNewExpense(owner, OWNER, r, acct)]
        : await Promise.all([confirmReceiptAsNewExpense(owner, OWNER, r, acct), confirmReceiptAsNewExpense(member, OWNER, r, acct)]);
      assert.equal(results.filter((x) => x.created).length, 1, `${mode}: exactly one write`);
      assert.equal(await count(owner, 'users', OWNER, 'periods', pid, 'transactions'), before + 1, `${mode}: one tx`);
      const tx = (await getDoc(doc(owner, 'users', OWNER, 'periods', pid, 'transactions', `rcpt_${id}`))).data();
      assert.equal(tx?.amount, 19.25);
      assert.equal(tx?.date, `${pid}-05`);
      assert.equal(tx?.accountId, 'acc-cash');
      const link = (await getDoc(doc(owner, 'users', OWNER, 'receiptLinks', `${pid}_rcpt_${id}`))).data();
      assert.equal(link?.receiptId, id);
      const saved = (await getDoc(doc(owner, 'users', OWNER, 'receipts', id))).data();
      assert.equal(saved?.status, 'CONFIRMED');
      assert.equal(saved?.totalMinor, 1925);
      assert.equal((await listPriceObservationsIn(owner, OWNER)).filter((o) => o.receiptId === id).length, 2);
    }
  });

  test('link existing: tx unchanged, x2 is a no-op, a second receipt on the same tx is rejected', async () => {
    const txs = await getDocs(collection(owner, 'users', OWNER, 'periods', pid, 'transactions'));
    const target = txs.docs.find((d) => !d.id.startsWith('rcpt_') && !d.id.startsWith('shop_'))!;
    const beforeTx = JSON.stringify(target.data());
    const id = `link-${run}`;
    const a = await confirmReceiptToExisting(owner, OWNER, receipt(id), { periodId: pid, txId: target.id });
    const b = await confirmReceiptToExisting(owner, OWNER, receipt(id), { periodId: pid, txId: target.id });
    assert.deepEqual([a.created, b.created], [true, false]);
    await assert.rejects(confirmReceiptToExisting(owner, OWNER, receipt(`other-${run}`), { periodId: pid, txId: target.id }), /already has a receipt/);
    const afterTx = (await getDoc(doc(owner, 'users', OWNER, 'periods', pid, 'transactions', target.id))).data();
    assert.equal(JSON.stringify(afterTx), beforeTx, 'posted expense not modified');
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'receipts', `other-${run}`))).exists(), false);
    await assert.rejects(confirmReceiptAsNewExpense(owner, OWNER, receipt(id), { accountId: 'acc-cash', planItemId: 'plan-groceries' }), /already linked/);
    await deleteReceiptIn(owner, OWNER, id);
  });

  test('locked (DECIDED) month: new expense aborts with zero writes', async () => {
    const id = `locked-${run}`;
    const before = await count(owner, 'users', OWNER, 'periods', prevPid, 'transactions');
    await assert.rejects(confirmReceiptAsNewExpense(owner, OWNER, receipt(id, `${prevPid}-10`), { accountId: 'acc-cash', planItemId: 'plan-groceries' }), /locked/);
    assert.equal(await count(owner, 'users', OWNER, 'periods', prevPid, 'transactions'), before);
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'receipts', id))).exists(), false);
  });
});

describe('SEC-18 delete cascade', () => {
  test('deleting a confirmed receipt removes its link and observations, keeps the expense', async () => {
    const id = `del-${run}`;
    await confirmReceiptAsNewExpense(owner, OWNER, receipt(id), { accountId: 'acc-cash', planItemId: 'plan-groceries' });
    assert.equal((await listPriceObservationsIn(owner, OWNER)).filter((o) => o.receiptId === id).length, 2);
    await deleteReceiptIn(member, OWNER, id);
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'receipts', id))).exists(), false);
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'receiptLinks', `${pid}_rcpt_${id}`))).exists(), false);
    assert.equal((await listPriceObservationsIn(owner, OWNER)).filter((o) => o.id.startsWith(`${id}_`)).length, 0);
    assert.equal((await getDoc(doc(owner, 'users', OWNER, 'periods', pid, 'transactions', `rcpt_${id}`))).exists(), true, 'expense kept');
  });
});

describe('C-10 pre-change shape', () => {
  test('existing transactions, lists and catalog (no receipt fields) read and stay byte-identical after receipt work', async () => {
    const snap = async () => JSON.stringify(await Promise.all([
      getDocs(collection(owner, 'users', OWNER, 'periods', prevPid, 'transactions')).then((s) => s.docs.map((d) => [d.id, d.data()])),
      getDocs(collection(owner, 'users', OWNER, 'shoppingCatalog')).then((s) => s.docs.map((d) => [d.id, d.data()])),
      getDocs(collection(owner, 'users', OWNER, 'shoppingLists', 'list-weekly', 'items')).then((s) => s.docs.map((d) => [d.id, d.data()])),
    ]));
    const before = await snap();
    assert.ok(before.includes('Rice 5 kg'));
    const id = `c10-${run}`;
    await confirmReceiptAsNewExpense(owner, OWNER, receipt(id), { accountId: 'acc-cash', planItemId: 'plan-groceries' });
    await deleteReceiptIn(owner, OWNER, id);
    assert.equal(await snap(), before);
  });
});

// BUDG-6 H-4: a receipt recorded as a new expense counts against a budget line of its month, like
// every other expense path; without a line (or with a line of another month) nothing is written.
describe('H-4 receipt new expense needs a budget line', () => {
  const spent = async () => {
    const snap = await getDocs(collection(owner, 'users', OWNER, 'periods', pid, 'transactions'));
    return snap.docs.filter((d) => d.data().planItemId === 'plan-groceries').reduce((acc, d) => acc + Math.round(Number(d.data().amount) * 100), 0);
  };
  test("the line's Spent changes by the receipt amount; no line or a foreign line writes nothing", async () => {
    const before = await spent();
    const txBefore = await count(owner, 'users', OWNER, 'periods', pid, 'transactions');
    await assert.rejects(confirmReceiptAsNewExpense(owner, OWNER, receipt(`h4a-${run}`), { accountId: 'acc-cash' }), /budget line/);
    await assert.rejects(confirmReceiptAsNewExpense(owner, OWNER, receipt(`h4b-${run}`), { accountId: 'acc-cash', planItemId: `no-line-${run}` }), /not in/);
    assert.equal(await count(owner, 'users', OWNER, 'periods', pid, 'transactions'), txBefore, 'nothing written without a valid line');
    const r = receipt(`h4c-${run}`);
    const res = await confirmReceiptAsNewExpense(owner, OWNER, r, { accountId: 'acc-cash', planItemId: 'plan-groceries', planItemName: 'Groceries', group: 'NEED' });
    assert.equal(res.created, true);
    const after = await spent();
    assert.ok(after > before, 'Spent on the line went up');
    const tx = (await getDocs(collection(owner, 'users', OWNER, 'periods', pid, 'transactions'))).docs.find((d) => d.id === res.link.txId)?.data();
    assert.equal(tx?.planItemId, 'plan-groceries');
    assert.equal(tx?.categoryId, 'plan-groceries');
    assert.equal(after - before, Math.round(Number(tx?.amount) * 100));
  });
});
