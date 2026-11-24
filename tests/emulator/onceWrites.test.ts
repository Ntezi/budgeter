// BUDG-6 H-2: the everyday Add expense Save and Move money write once per form and never after a lock.
// Calls the app's own write (lib/repo/onceWrites.ts) on the emulator; documents in the shapes the app stores.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, terminate, updateDoc, type Firestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { emulatorPorts } from '../../lib/emulatorPorts';
import { newClientIdIn, writeOnceInMonthIn } from '../../lib/repo/onceWrites';

const ports = emulatorPorts();
const OWNER = 'seed-owner';
const run = Date.now().toString(36);
let app: FirebaseApp;
let db: Firestore;
const expense = (amount: number) => ({ type: 'EXPENSE', name: 'Groceries', amount, group: 'NEED', date: '2033-01-05', planItemId: 'plan-groceries', categoryId: 'plan-groceries', paidFromAccountId: 'acc-household', periodId: '2033-01', createdAt: serverTimestamp() });
const txCount = async (pid: string) => (await getDocs(collection(db, 'users', OWNER, 'periods', pid, 'transactions'))).size;

before(async () => {
  app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `once-${run}`);
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', ports.firestore);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, 'owner@example.test', 'seed-owner-pass');
});
after(async () => {
  await terminate(db);
  await deleteApp(app);
});

async function freshMonth(tag: string) {
  const pid = `2033-${tag}`;
  await setDoc(doc(db, 'users', OWNER, 'periods', pid), { status: 'DRAFT', name: `test ${run}` });
  return pid;
}

test('H-2 the same form saved twice (retry, second tab) writes one expense', async () => {
  const pid = await freshMonth('01');
  const before = await txCount(pid);
  const id = newClientIdIn(db);
  assert.match(id, /^[A-Za-z0-9]{20}$/, 'same id format as addDoc');
  const [a, b] = await Promise.all([writeOnceInMonthIn(db, OWNER, pid, [{ id, data: expense(12.5) }]), writeOnceInMonthIn(db, OWNER, pid, [{ id, data: expense(12.5) }])]);
  assert.deepEqual([a, b].sort(), [false, true]);
  assert.equal(await writeOnceInMonthIn(db, OWNER, pid, [{ id, data: expense(12.5) }]), false, 'a later retry is a no-op');
  assert.equal(await txCount(pid), before + 1);
  const saved = (await getDoc(doc(db, 'users', OWNER, 'periods', pid, 'transactions', id))).data();
  assert.equal(saved?.amount, 12.5);
  assert.equal(saved?.planItemId, 'plan-groceries');
});

test('H-2 a save after the month is locked writes nothing', async () => {
  const pid = await freshMonth('02');
  const id = newClientIdIn(db); // form opened while the month was DRAFT
  await updateDoc(doc(db, 'users', OWNER, 'periods', pid), { status: 'DECIDED' });
  await assert.rejects(writeOnceInMonthIn(db, OWNER, pid, [{ id, data: expense(9) }]), /DECIDED/);
  assert.equal(await txCount(pid), 0);
});

test('H-2 a save racing a lock: either it lands before the lock or nothing is written', async () => {
  const pid = await freshMonth('03');
  const id = newClientIdIn(db);
  const [save] = await Promise.allSettled([writeOnceInMonthIn(db, OWNER, pid, [{ id, data: expense(4) }]), updateDoc(doc(db, 'users', OWNER, 'periods', pid), { status: 'DECIDED' })]);
  const n = await txCount(pid);
  assert.equal(n, save.status === 'fulfilled' ? 1 : 0);
  await assert.rejects(writeOnceInMonthIn(db, OWNER, pid, [{ id: newClientIdIn(db), data: expense(4) }]), /DECIDED/, 'after the lock nothing more is written');
  assert.equal(await txCount(pid), n);
});

test('H-2 two different forms still write two expenses', async () => {
  const pid = await freshMonth('04');
  assert.equal(await writeOnceInMonthIn(db, OWNER, pid, [{ id: newClientIdIn(db), data: expense(1) }]), true);
  assert.equal(await writeOnceInMonthIn(db, OWNER, pid, [{ id: newClientIdIn(db), data: expense(1) }]), true);
  assert.equal(await txCount(pid), 2);
});

test('H-2 Move money: transfers and balance overrides land together, once per form', async () => {
  const pid = await freshMonth('05');
  const key = newClientIdIn(db).slice(0, 18);
  const transfer = (to: string, amount: number) => ({ name: 'Transfer', type: 'TRANSFER', group: 'SAVINGS_DEBT', amount, date: '2033-05-02', paidFromAccountId: 'acc-household', toAccountId: to, transferGroupId: `g-${run}-${to}`, note: 'Account transfer from Household', periodId: pid, createdAt: serverTimestamp() });
  const writes = [{ id: `${key}00`, data: transfer('acc-cash', 30) }, { id: `${key}01`, data: transfer('acc-savings', 20) }];
  const override = (accountId: string, currentManual: number) => ({ ref: doc(db, 'users', OWNER, 'accountPeriodOverrides', `${accountId}_${pid}_${run}`), data: { accountId, periodId: pid, currentManual, updatedAt: serverTimestamp() }, merge: true });
  const extra = [override('acc-household', 50), override('acc-cash', 130), override('acc-savings', 220)];
  const results = await Promise.all([writeOnceInMonthIn(db, OWNER, pid, writes, extra), writeOnceInMonthIn(db, OWNER, pid, writes, extra)]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(await txCount(pid), 2);
  assert.equal((await getDoc(extra[0].ref)).data()?.currentManual, 50);
  await updateDoc(doc(db, 'users', OWNER, 'periods', pid), { status: 'DECIDED' });
  await assert.rejects(writeOnceInMonthIn(db, OWNER, pid, [{ id: `${newClientIdIn(db).slice(0, 18)}00`, data: transfer('acc-cash', 1) }], [override('acc-household', 1)]), /DECIDED/);
  assert.equal((await getDoc(extra[0].ref)).data()?.currentManual, 50, 'no override written after the lock');
});
