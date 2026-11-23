// Emulator tests (BUDG-1 AC-3/AC-4). Run after `npm run emulators:up` (seeded).
// Client SDK signed in as the seeded owner, so firestore.rules apply.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, terminate } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { resolveFirebaseTarget } from '../../lib/firebaseEmulator';
import { createPeriodDocIfAbsent } from '../../lib/repo/periodCreateCore';
import { addMonthsToId, monthIdFromDate } from '../../lib/rules/months';

const target = resolveFirebaseTarget({ useEmulators: '1', projectId: 'demo-budgeta', host: '127.0.0.1' });
if (!target.useEmulators) throw new Error('emulator target required');
const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `emu-test-${Date.now()}`);
const db = getFirestore(app);
connectFirestoreEmulator(db, target.host, target.firestorePort);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${target.host}:${target.authPort}`, { disableWarnings: true });
let uid = '';

before(async () => {
  const cred = await signInWithEmailAndPassword(auth, 'owner@example.test', 'seed-owner-pass');
  uid = cred.user.uid;
});
after(async () => {
  await terminate(db);
  await deleteApp(app);
});

const count = async (...path: string[]) => (await getDocs(collection(db, 'users', uid, ...path))).size;

test('AC-3 double submit / two tabs create one period only', async () => {
  const pid = '2031-05';
  const before = await count('periods');
  const results = await Promise.all([1, 2, 3].map(() => createPeriodDocIfAbsent(db, uid, pid, pid, 'May 2031')));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(await count('periods'), before + 1);
  const again = await createPeriodDocIfAbsent(db, uid, pid, pid, 'May 2031');
  assert.deepEqual(again, { created: false, status: 'DRAFT' });
  assert.equal(await count('periods'), before + 1);
});

test('AC-4 a new month starts blank', async () => {
  const pid = '2031-06';
  await createPeriodDocIfAbsent(db, uid, pid, pid, 'June 2031');
  for (const sub of ['planItems', 'incomeItems', 'allocations', 'transactions']) {
    assert.equal(await count('periods', pid, sub), 0, sub);
  }
  const snap = await getDoc(doc(db, 'users', uid, 'periods', pid));
  assert.equal(snap.data()?.status, 'DRAFT');
  assert.equal(snap.data()?.incomeTotal, 0);
});

test('AC-3 existing locked month is returned untouched, never reseeded', async () => {
  const prev = addMonthsToId(monthIdFromDate(new Date()), -1);
  const planBefore = await count('periods', prev, 'planItems');
  const dataBefore = (await getDoc(doc(db, 'users', uid, 'periods', prev))).data();
  const res = await createPeriodDocIfAbsent(db, uid, prev, prev, 'ignored');
  assert.deepEqual(res, { created: false, status: 'DECIDED' });
  assert.equal(await count('periods', prev, 'planItems'), planBefore);
  assert.deepEqual((await getDoc(doc(db, 'users', uid, 'periods', prev))).data(), dataBefore);
});
