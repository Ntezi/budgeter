// BUDG-42 AC-6 on the emulator, client SDK per actor so firestore.rules apply: a batched remove of N items
// (N > 500, chunked) deletes only the item docs and their sharedLists mirrors; expenses, receipts, receipt
// links, prices, catalog and expense marks are untouched; Undo restores the item exactly; a chef removes
// only the items the chef added. Run after `npm run emulators:seed`.
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, terminate, writeBatch, type Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { removeShoppingItemsIn, restoreShoppingItemsIn } from '../../lib/repo/shoppingRemoveOps';
import { shareListWithChefIn } from '../../lib/repo/sharedListsOps';

const offset = Number(process.env.BUDGETA_EMULATOR_PORT_OFFSET || 0);
const OWNER = 'seed-owner';
const CHEF = 'seed-chef';
const run = Date.now().toString(36);
const apps: FirebaseApp[] = [];
const dbs: Firestore[] = [];
const N = 520;

async function actor(name: string, email: string, password: string) {
  const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `rm-${name}-${run}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080 + offset);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${9099 + offset}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, password);
  apps.push(app);
  dbs.push(db);
  return db;
}

async function protectedState(db: Firestore) {
  const out: Record<string, unknown> = {};
  const cols = ['receipts', 'receiptLinks', 'priceObservations', 'shoppingCatalog', 'shoppingExpenseMarks'];
  for (const c of cols) out[c] = (await getDocs(collection(db, 'users', OWNER, c))).docs.map((d) => [d.id, d.data()]);
  for (const p of (await getDocs(collection(db, 'users', OWNER, 'periods'))).docs) {
    out[`periods/${p.id}/transactions`] = (await getDocs(collection(db, 'users', OWNER, 'periods', p.id, 'transactions'))).docs.map((d) => [d.id, d.data()]);
  }
  return JSON.stringify(out);
}

let owner: Firestore, chef: Firestore;
before(async () => {
  owner = await actor('owner', 'owner@example.test', 'seed-owner-pass');
  chef = await actor('chef', 'chef@example.test', 'seed-chef-pass');
});
after(async () => {
  for (const db of dbs) await terminate(db);
  for (const app of apps) await deleteApp(app);
});

describe('BUDG-42 batched remove', () => {
  const listId = `rm-list-${run}`;
  let shareId = '';
  before(async () => {
    await setDoc(doc(owner, 'users', OWNER, 'shoppingLists', listId), { name: 'Remove test', ownerUid: OWNER, status: 'active', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    for (let start = 0; start < N; start += 400) {
      const b = writeBatch(owner);
      for (let i = start; i < Math.min(N, start + 400); i++) {
        b.set(doc(owner, 'users', OWNER, 'shoppingLists', listId, 'items', `it-${i}`), { name: `Item ${i}`, quantity: 1, price: 2, category: 'Pantry', bought: i % 2 === 0, ownerUid: OWNER, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      await b.commit();
    }
    shareId = await shareListWithChefIn(owner, OWNER, OWNER, { id: listId, name: 'Remove test' }, CHEF, 'Chef');
  });

  test(`removes ${N} items and ${N} mirrors in chunks, touches nothing else`, async () => {
    const before = await protectedState(owner);
    assert.equal((await getDocs(collection(owner, 'sharedLists', shareId, 'items'))).size, N);
    const targets = Array.from({ length: N }, (_, i) => ({ id: `it-${i}`, private: true, shared: true }));
    const res = await removeShoppingItemsIn(owner, { ownerUid: OWNER, listId, shareId }, targets);
    assert.equal(res.deleted, 2 * N);
    assert.equal(res.commits, Math.ceil((2 * N) / 400));
    assert.equal((await getDocs(collection(owner, 'users', OWNER, 'shoppingLists', listId, 'items'))).size, 0);
    assert.equal((await getDocs(collection(owner, 'sharedLists', shareId, 'items'))).size, 0);
    assert.ok((await getDoc(doc(owner, 'users', OWNER, 'shoppingLists', listId))).exists(), 'the list itself stays');
    assert.equal(await protectedState(owner), before, 'expenses, receipts, links, prices, catalog, marks unchanged');
  });

  test('Undo restores the private item exactly and its mirror', async () => {
    const ref = doc(owner, 'users', OWNER, 'shoppingLists', listId, 'items', 'undo-1');
    await setDoc(ref, { name: 'Undo me', quantity: 3, unit: 'kg', price: 7, note: 'n', bought: false, ownerUid: OWNER, catalogItemId: 'x', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await setDoc(doc(owner, 'sharedLists', shareId, 'items', 'undo-1'), { name: 'Undo me', quantity: 3, unit: 'kg', note: 'n', status: 'TO_BUY', createdBy: OWNER, updatedBy: OWNER, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    const original = (await getDoc(ref)).data();
    const { snapshots } = await removeShoppingItemsIn(owner, { ownerUid: OWNER, listId, shareId }, [{ id: 'undo-1', private: true, shared: true }], { snapshot: true });
    assert.equal((await getDoc(ref)).exists(), false);
    await restoreShoppingItemsIn(owner, snapshots, OWNER);
    assert.deepEqual(JSON.stringify((await getDoc(ref)).data()), JSON.stringify(original));
    const mirror = (await getDoc(doc(owner, 'sharedLists', shareId, 'items', 'undo-1'))).data();
    assert.equal(mirror?.name, 'Undo me');
    assert.equal(mirror?.quantity, 3);
  });

  test('a chef removes only items the chef added', async () => {
    const own = doc(chef, 'sharedLists', shareId, 'items', `chef-own-${run}`);
    await setDoc(own, { name: 'Chef lemon', quantity: 1, status: 'TO_BUY', createdBy: CHEF, updatedBy: CHEF, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await assert.rejects(
      removeShoppingItemsIn(chef, { shareId }, [{ id: 'undo-1', private: false, shared: true }]),
      (e: any) => e?.code === 'permission-denied',
      'household item cannot be removed by the chef'
    );
    assert.ok((await getDoc(doc(owner, 'sharedLists', shareId, 'items', 'undo-1'))).exists());
    const { snapshots } = await removeShoppingItemsIn(chef, { shareId }, [{ id: own.id, private: false, shared: true }], { snapshot: true });
    assert.equal((await getDoc(own)).exists(), false);
    await restoreShoppingItemsIn(chef, snapshots, CHEF);
    assert.equal((await getDoc(own)).data()?.createdBy, CHEF);
  });
});
