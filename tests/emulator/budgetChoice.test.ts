// BUDG-40 AC-2 (F-2) and F-10: the three expense writers take the budget the user chose (periodId), which may
// differ from the month of the date; the date is stored unchanged. Calls the app's own writes on the emulator.
// Months 2034-xx are created here (DRAFT/DECIDED) so the seeded household months are not touched.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, terminate, type Firestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { emulatorPorts } from '../../lib/emulatorPorts';
import { recordShoppingExpense, type ShoppingExpenseInput } from '../../lib/repo/shoppingExpense';
import { confirmReceiptAsNewExpense } from '../../lib/repo/receiptsOps';
import { newClientIdIn, writeOnceInMonthIn } from '../../lib/repo/onceWrites';
import type { Receipt } from '../../lib/repo/receiptsCore';

const ports = emulatorPorts();
const OWNER = 'seed-owner';
const run = Date.now().toString(36);
const JUNE = '2034-06';
const JULY = '2034-07';
const MAY_CLOSED = '2034-05';
const AUG_MISSING = '2034-08';
let app: FirebaseApp;
let db: Firestore;
const txs = async (pid: string) => (await getDocs(collection(db, 'users', OWNER, 'periods', pid, 'transactions'))).docs;

before(async () => {
  app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `budget-choice-${run}`);
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', ports.firestore);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, 'owner@example.test', 'seed-owner-pass');
  for (const [pid, status] of [[JUNE, 'DRAFT'], [JULY, 'DRAFT'], [MAY_CLOSED, 'DECIDED']] as const) {
    await setDoc(doc(db, 'users', OWNER, 'periods', pid), { status, periodId: pid, title: `test ${run}` });
    await setDoc(doc(db, 'users', OWNER, 'periods', pid, 'planItems', 'plan-groceries'), { name: 'Groceries', group: 'NEED', amount: 500, periodId: pid });
  }
});
after(async () => {
  await terminate(db);
  await deleteApp(app);
});

const shop = (item: string, over: Partial<ShoppingExpenseInput> = {}): ShoppingExpenseInput => ({
  listId: `list-${run}`, listName: 'Test list', itemId: item, itemName: `Item ${item}`, amount: 12.5, dateISO: `${JUNE}-27`,
  accountId: 'acc-household', planItemId: 'plan-groceries', planItemName: 'Groceries', group: 'NEED', ...over,
});

test('Add expense writer: a 27 June expense saved into the open July budget keeps its date; closed budget refused', async () => {
  const id = newClientIdIn(db);
  const data = { type: 'EXPENSE', name: 'Groceries', amount: 20, group: 'NEED', date: `${JUNE}-27`, planItemId: 'plan-groceries', categoryId: 'plan-groceries', paidFromAccountId: 'acc-household', periodId: JULY };
  assert.equal(await writeOnceInMonthIn(db, OWNER, JULY, [{ id, data }]), true);
  assert.equal(await writeOnceInMonthIn(db, OWNER, JULY, [{ id, data }]), false, 'retry in the same budget is a no-op');
  const saved = (await getDoc(doc(db, 'users', OWNER, 'periods', JULY, 'transactions', id))).data();
  assert.equal(saved?.date, `${JUNE}-27`);
  await assert.rejects(writeOnceInMonthIn(db, OWNER, MAY_CLOSED, [{ id: newClientIdIn(db), data }]), /DECIDED/);
});

test('Shopping: periodId overrides the month of the date; date stored unchanged; marker written', async () => {
  const before = (await txs(JULY)).length;
  const res = await recordShoppingExpense(db, OWNER, shop(`a-${run}`, { periodId: JULY }));
  assert.deepEqual([res.created, res.periodId], [true, JULY]);
  assert.equal((await txs(JULY)).length, before + 1);
  const tx = (await getDoc(doc(db, 'users', OWNER, 'periods', JULY, 'transactions', res.txId))).data();
  assert.equal(tx?.date, `${JUNE}-27`);
  assert.equal(tx?.periodId, JULY);
  const mark = (await getDoc(doc(db, 'users', OWNER, 'shoppingExpenseMarks', res.txId))).data();
  assert.equal(mark?.periodId, JULY);
  assert.equal(mark?.txId, res.txId);
  const noOverride = await recordShoppingExpense(db, OWNER, shop(`b-${run}`));
  assert.equal(noOverride.periodId, JUNE, 'without a choice: the month of the date, as before');
});

test('Shopping: retry same budget = no-op; retry other budget = refused (F-10); allowed again once the first expense is deleted', async () => {
  const item = `retry-${run}`;
  const first = await recordShoppingExpense(db, OWNER, shop(item, { periodId: JULY }));
  assert.equal(first.created, true);
  assert.equal((await recordShoppingExpense(db, OWNER, shop(item, { periodId: JULY }))).created, false);
  const juneBefore = (await txs(JUNE)).length;
  await assert.rejects(recordShoppingExpense(db, OWNER, shop(item, { periodId: JUNE })), /already recorded in 2034-07/);
  await assert.rejects(recordShoppingExpense(db, OWNER, shop(item)), /already recorded in 2034-07/, 'date default to June is refused too');
  assert.equal((await txs(JUNE)).length, juneBefore, 'nothing posted twice');
  await deleteDoc(doc(db, 'users', OWNER, 'periods', JULY, 'transactions', first.txId));
  const again = await recordShoppingExpense(db, OWNER, shop(item, { periodId: JUNE }));
  assert.deepEqual([again.created, again.periodId], [true, JUNE]);
});

test('Shopping: closed, missing and malformed budgets are refused with zero writes', async () => {
  await assert.rejects(recordShoppingExpense(db, OWNER, shop(`c-${run}`, { periodId: MAY_CLOSED })), /locked/);
  await assert.rejects(recordShoppingExpense(db, OWNER, shop(`m-${run}`, { periodId: AUG_MISSING })), /No budget for 2034-08/);
  await assert.rejects(recordShoppingExpense(db, OWNER, shop(`x-${run}`, { periodId: '2034-7' })), /Invalid budget month/);
  await assert.rejects(recordShoppingExpense(db, OWNER, shop(`y-${run}`, { periodId: '../x' })), /Invalid budget month/);
  assert.equal((await txs(MAY_CLOSED)).length, 0);
  assert.equal((await getDoc(doc(db, 'users', OWNER, 'periods', AUG_MISSING))).exists(), false, 'nothing auto-created');
  assert.equal((await getDoc(doc(db, 'users', OWNER, 'shoppingExpenseMarks', `shop_list-${run}_c-${run}`))).exists(), false);
});

function receipt(id: string, date = `${JUNE}-27`): Receipt {
  return {
    id, status: 'DRAFT', purchaseDate: date, currencyCode: 'GHS', totalMinor: 0, createdBy: OWNER, storeName: 'Test Market',
    lines: [{ lineId: 'l1', name: 'Rice 1 kg', quantity: 1, unit: 'kg', lineTotalMinor: 1650, catalogItemId: 'rice 1 kg' }],
  };
}
const acct = (periodId?: string, planItemId = 'plan-groceries') => ({ accountId: 'acc-cash', planItemId, planItemName: 'Groceries', group: 'NEED', periodId });

test('Receipt: chosen budget overrides the purchase month; link stores it; retry is a no-op', async () => {
  const id = `rcpt-a-${run}`;
  const res = await confirmReceiptAsNewExpense(db, OWNER, receipt(id), acct(JULY));
  assert.equal(res.created, true);
  assert.equal(res.link.periodId, JULY);
  const tx = (await getDoc(doc(db, 'users', OWNER, 'periods', JULY, 'transactions', res.link.txId))).data();
  assert.equal(tx?.date, `${JUNE}-27`);
  const stored = (await getDoc(doc(db, 'users', OWNER, 'receipts', id))).data();
  assert.equal(stored?.link?.periodId, JULY);
  assert.equal((await getDoc(doc(db, 'users', OWNER, 'receiptLinks', `${JULY}_${res.link.txId}`))).data()?.periodId, JULY);
  assert.equal((await confirmReceiptAsNewExpense(db, OWNER, receipt(id), acct(JULY))).created, false);
  await assert.rejects(confirmReceiptAsNewExpense(db, OWNER, receipt(id), acct(JUNE)), /already linked/, 'another budget after a save is refused');
});

test('Receipt: closed, missing budget and a line not in the chosen budget are refused', async () => {
  await assert.rejects(confirmReceiptAsNewExpense(db, OWNER, receipt(`rcpt-c-${run}`), acct(MAY_CLOSED)), /locked/);
  await assert.rejects(confirmReceiptAsNewExpense(db, OWNER, receipt(`rcpt-m-${run}`), acct(AUG_MISSING)), /No budget for 2034-08/);
  await assert.rejects(confirmReceiptAsNewExpense(db, OWNER, receipt(`rcpt-l-${run}`), acct(JULY, `no-line-${run}`)), /not in 2034-07/);
  await assert.rejects(confirmReceiptAsNewExpense(db, OWNER, receipt(`rcpt-x-${run}`), acct('2034-13')), /Invalid budget month/);
  assert.equal((await getDoc(doc(db, 'users', OWNER, 'periods', AUG_MISSING))).exists(), false);
});
