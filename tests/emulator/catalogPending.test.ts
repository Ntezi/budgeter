// BUDG-43 on the emulator: pending catalog shapes (AC-1), chef item -> pending entry from two household
// clients (AC-2), Approve / Use existing / Remove (AC-3), and rules for the chef's catalog copy (AC-4, AC-5).
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, terminate,
  updateDoc, type Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { emulatorPorts } from '../../lib/emulatorPorts';
import {
  approvePendingIn, createPendingCatalogItemIn, ensureChefPendingIn, mergePendingIntoIn, removePendingIn, syncCatalogCopyIn,
} from '../../lib/repo/catalogPendingOps';
import { revokeShareIn, shareListWithChefIn } from '../../lib/repo/sharedListsOps';
import { chefPendingId } from '../../lib/rules/catalogPending';

const ports = emulatorPorts();
const OWNER = 'seed-owner';
const SHARE = 'share-weekly'; // seeded ACTIVE share of "Weekly groceries" to seed-chef
const apps: FirebaseApp[] = [];
const dbs: Firestore[] = [];
const run = Date.now().toString(36);

async function actor(name: string, email: string, password: string) {
  const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `b43-${name}-${run}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', ports.firestore);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
  const uid = (await signInWithEmailAndPassword(auth, email, password)).user.uid;
  apps.push(app);
  dbs.push(db);
  return { db, uid };
}
const allowed = async (p: Promise<unknown>, what: string) => { await assert.doesNotReject(p, what); };
const denied = async (p: Promise<unknown>, what: string) => {
  await assert.rejects(p, (e: any) => e?.code === 'permission-denied', `${what} should be denied`);
};
const catalogOf = async (db: Firestore) => (await getDocs(collection(db, 'users', OWNER, 'shoppingCatalog'))).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

let owner: Awaited<ReturnType<typeof actor>>;
let ownerDevice2: Awaited<ReturnType<typeof actor>>;
let member: Awaited<ReturnType<typeof actor>>;
let chef: Awaited<ReturnType<typeof actor>>;
let otherChef: Awaited<ReturnType<typeof actor>>;
let stranger: Awaited<ReturnType<typeof actor>>;

before(async () => {
  owner = await actor('owner', 'owner@example.test', 'seed-owner-pass');
  ownerDevice2 = await actor('owner2', 'owner@example.test', 'seed-owner-pass');
  member = await actor('member', 'member@example.test', 'seed-member-pass');
  chef = await actor('chef', 'chef@example.test', 'seed-chef-pass');
  otherChef = await actor('other-chef', 'other-chef@example.test', 'seed-other-chef-pass');
  stranger = await actor('stranger', 'stranger@example.test', 'seed-stranger-pass');
});
after(async () => {
  await Promise.all(dbs.map((d) => terminate(d)));
  await Promise.all(apps.map((a) => deleteApp(a)));
});

describe('AC-1 pending entry from a list', () => {
  test('new item is saved with additive pending fields; existing catalog docs untouched', async () => {
    const before = await getDoc(doc(owner.db, 'users', OWNER, 'shoppingCatalog', 'tomatoes'));
    const id = await createPendingCatalogItemIn(owner.db, OWNER, { name: `Mango ${run}`, category: 'Produce', unit: 'kg' },
      { addedFrom: 'shopping-list', addedBy: owner.uid, sourceListId: 'list-weekly', sourceListName: 'Weekly groceries' });
    const d = (await getDoc(doc(owner.db, 'users', OWNER, 'shoppingCatalog', id))).data()!;
    assert.equal(d.pending, true);
    assert.equal(d.addedFrom, 'shopping-list');
    assert.equal(d.addedBy, owner.uid);
    assert.ok(d.addedAt?.toDate);
    assert.equal(d.sourceListName, 'Weekly groceries');
    assert.deepEqual(d.variant, { unit: 'kg' });
    assert.equal('lastPrice' in d, false);
    const after = await getDoc(doc(owner.db, 'users', OWNER, 'shoppingCatalog', 'tomatoes'));
    assert.deepEqual(after.data(), before.data(), 'C-10: an existing catalog doc keeps its exact shape');
    await approvePendingIn(owner.db, OWNER, id);
    const approved = (await getDoc(doc(owner.db, 'users', OWNER, 'shoppingCatalog', id))).data()!;
    assert.equal(approved.pending, false);
    assert.equal(approved.addedFrom, 'shopping-list', 'Approve keeps addedFrom');
  });
});

describe('AC-2 chef item -> pending entry, created by household clients', () => {
  test('two household devices at once create exactly one entry; a catalog name creates none', async () => {
    const itemId = `chefitem${run}`;
    await setDoc(doc(chef.db, 'sharedLists', SHARE, 'items', itemId), {
      name: `Ginger ${run}`, quantity: 1, unit: 'g', status: 'TO_BUY', createdBy: chef.uid, updatedBy: chef.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    const share = { shareId: SHARE, chefUid: chef.uid, listId: 'list-weekly', listName: 'Weekly groceries' };
    const item = { id: itemId, name: `Ginger ${run}`, unit: 'g', createdBy: chef.uid };
    const cat = await catalogOf(owner.db);
    const results = await Promise.all([
      ensureChefPendingIn(owner.db, OWNER, share, item, cat),
      ensureChefPendingIn(ownerDevice2.db, OWNER, share, item, cat),
      ensureChefPendingIn(member.db, OWNER, share, item, cat),
    ]);
    assert.deepEqual(results.filter((r) => r === 'created').length, 1, JSON.stringify(results));
    const id = chefPendingId(SHARE, itemId);
    const rows = (await catalogOf(owner.db)).filter((r) => r.name === `Ginger ${run}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].addedFrom, 'chef');
    assert.equal(rows[0].addedBy, chef.uid);
    assert.equal(rows[0].sourceShareId, SHARE);
    assert.equal(rows[0].pending, true);
    assert.equal(await ensureChefPendingIn(ownerDevice2.db, OWNER, share, item, await catalogOf(owner.db)), 'exists');
    // a chef item named like a catalog item (alias spelling) creates nothing
    const n = (await catalogOf(owner.db)).length;
    assert.equal(await ensureChefPendingIn(owner.db, OWNER, share, { id: `tom${run}`, name: 'tomato', createdBy: chef.uid }, await catalogOf(owner.db)), 'matched');
    assert.equal((await catalogOf(owner.db)).length, n);
    // Remove leaves a tombstone: the same chef item is never recreated
    await removePendingIn(owner.db, OWNER, id);
    assert.equal(await ensureChefPendingIn(ownerDevice2.db, OWNER, share, item, await catalogOf(owner.db)), 'dismissed');
    assert.equal((await catalogOf(owner.db)).some((r) => r.id === id), false);
  });
  test('the chef cannot write the owner catalog nor read users/{owner}/**', async () => {
    await denied(setDoc(doc(chef.db, 'users', OWNER, 'shoppingCatalog', `x${run}`), { name: 'x' }), 'chef catalog write');
    await denied(getDocs(collection(chef.db, 'users', OWNER, 'shoppingCatalog')), 'chef catalog read');
  });
});

describe('AC-3 Use existing and Remove', () => {
  test('Use existing repoints list items, keeps the alias, removes the entry; price history untouched', async () => {
    const id = await createPendingCatalogItemIn(owner.db, OWNER, { name: `Tomatos ${run}` }, { addedFrom: 'shopping-list', addedBy: owner.uid });
    const itemRef = doc(owner.db, 'users', OWNER, 'shoppingLists', 'list-weekly', 'items', `b43-${run}`);
    await setDoc(itemRef, { name: `Tomatos ${run}`, quantity: 1, catalogItemId: id, ownerUid: OWNER });
    const histBefore = (await getDocs(collection(owner.db, 'users', OWNER, 'shoppingCatalog', 'tomatoes', 'priceHistory'))).size;
    const lastPriceBefore = (await getDoc(doc(owner.db, 'users', OWNER, 'shoppingCatalog', 'tomatoes'))).data()!.lastPrice;
    assert.equal(await mergePendingIntoIn(owner.db, OWNER, { id, name: `Tomatos ${run}` }, 'tomatoes'), 1);
    assert.equal((await getDoc(itemRef)).data()!.catalogItemId, 'tomatoes');
    assert.equal((await getDoc(itemRef)).data()!.name, `Tomatos ${run}`);
    assert.equal((await getDoc(doc(owner.db, 'users', OWNER, 'shoppingCatalog', id))).exists(), false);
    const tom = (await getDoc(doc(owner.db, 'users', OWNER, 'shoppingCatalog', 'tomatoes'))).data()!;
    assert.ok(tom.aliases.includes(`Tomatos ${run}`));
    assert.equal(tom.lastPrice, lastPriceBefore);
    assert.equal((await getDocs(collection(owner.db, 'users', OWNER, 'shoppingCatalog', 'tomatoes', 'priceHistory'))).size, histBefore);
    await deleteDoc(itemRef);
  });
  test('Remove deletes the entry; list items keep their name and lose the link', async () => {
    const id = await createPendingCatalogItemIn(owner.db, OWNER, { name: `Leeks ${run}` }, { addedFrom: 'shopping-list', addedBy: owner.uid });
    const itemRef = doc(owner.db, 'users', OWNER, 'shoppingLists', 'list-weekly', 'items', `b43r-${run}`);
    await setDoc(itemRef, { name: `Leeks ${run}`, quantity: 1, catalogItemId: id, ownerUid: OWNER });
    assert.equal(await removePendingIn(owner.db, OWNER, id), 1);
    const it = (await getDoc(itemRef)).data()!;
    assert.equal(it.name, `Leeks ${run}`);
    assert.equal('catalogItemId' in it, false);
    await deleteDoc(itemRef);
  });
});

describe('AC-4/AC-5 rules for sharedLists/{shareId}/catalog', () => {
  const ref = (db: Firestore, id = 'rice 5 kg') => doc(db, 'sharedLists', SHARE, 'catalog', id);
  const ok = (extra: Record<string, unknown> = {}) => ({ name: 'Rice 5 kg', unit: '', category: 'Pantry', updatedAt: serverTimestamp(), ...extra });

  test('household writes a valid copy; sync is a no-op when in step; no price ever lands', async () => {
    await allowed(setDoc(ref(owner.db), ok()), 'owner copy write');
    await allowed(setDoc(ref(member.db), ok()), 'member copy write');
    const cat = await catalogOf(owner.db);
    await syncCatalogCopyIn(owner.db, SHARE, cat);
    assert.equal(await syncCatalogCopyIn(owner.db, SHARE, cat), 0, 'no write when nothing changed');
    const copy = await getDocs(collection(owner.db, 'sharedLists', SHARE, 'catalog'));
    assert.ok(copy.size >= 3);
    copy.forEach((d) => assert.deepEqual(Object.keys(d.data()).filter((k) => !['name', 'unit', 'category', 'updatedAt'].includes(k)), [], d.id));
  });
  test('active chef reads; stranger and another chef are denied; chef cannot write', async () => {
    await allowed(getDocs(collection(chef.db, 'sharedLists', SHARE, 'catalog')), 'active chef read');
    await denied(getDocs(collection(stranger.db, 'sharedLists', SHARE, 'catalog')), 'stranger read');
    await denied(getDoc(ref(otherChef.db)), 'other chef read');
    await denied(setDoc(ref(chef.db, `c${run}`), ok({ name: 'Chef item' })), 'chef create');
    await denied(updateDoc(ref(chef.db), { name: 'Renamed', updatedAt: serverTimestamp() }), 'chef update');
    await denied(deleteDoc(ref(chef.db)), 'chef delete');
  });
  test('household: extra key, price key, oversized name, bad unit, client time are denied', async () => {
    await denied(setDoc(ref(owner.db, `p${run}`), ok({ lastPrice: 60 })), 'price key');
    await denied(setDoc(ref(owner.db, `p${run}`), ok({ price: 60 })), 'price key 2');
    await denied(setDoc(ref(owner.db, `e${run}`), ok({ note: 'x' })), 'extra key');
    await denied(setDoc(ref(owner.db, `n${run}`), ok({ name: 'n'.repeat(121) })), 'oversized name');
    await denied(setDoc(ref(owner.db, `n${run}`), ok({ name: '' })), 'empty name');
    await denied(setDoc(ref(owner.db, `c${run}`), ok({ category: 'c'.repeat(61) })), 'oversized category');
    await denied(setDoc(ref(owner.db, `u${run}`), ok({ unit: 'crate' })), 'bad unit');
    await denied(setDoc(ref(owner.db, `t${run}`), ok({ updatedAt: new Date() })), 'client time');
    await denied(setDoc(ref(stranger.db, `s${run}`), ok()), 'stranger write');
  });
  test('share writes the copy; revoke removes it and the revoked chef cannot read; household cannot write while REVOKED', async () => {
    const shareId = await shareListWithChefIn(owner.db, OWNER, owner.uid, { id: 'list-party', name: 'Weekend party' }, otherChef.uid, 'Other');
    const copy = await getDocs(collection(otherChef.db, 'sharedLists', shareId, 'catalog'));
    assert.ok(copy.size >= 3, 'copy written at share time and readable by its chef');
    const rice = copy.docs.find((d) => d.id === 'rice 5 kg')!.data();
    assert.deepEqual(Object.keys(rice).sort(), ['category', 'name', 'unit', 'updatedAt']);
    assert.equal(JSON.stringify(copy.docs.map((d) => d.data())).includes('60'), false, 'no seeded price value');
    await revokeShareIn(owner.db, OWNER, 'list-party', shareId);
    await denied(getDocs(collection(otherChef.db, 'sharedLists', shareId, 'catalog')), 'revoked chef read');
    assert.equal((await getDocs(collection(owner.db, 'sharedLists', shareId, 'catalog'))).size, 0, 'copy deleted on revoke');
    await denied(setDoc(doc(owner.db, 'sharedLists', shareId, 'catalog', 'x'), ok()), 'household write after revoke');
  });
});
