// BUDG-4 rules tests on the emulator (SEC-1, SEC-8..SEC-13, AC-4..AC-7, SEC-20, SEC-22).
// Client SDK per actor so firestore.rules apply. Run after `npm run emulators:up` (seeded).
// Actors: owner, household member, chef (active, then revoked), other signed-in user,
// anonymous-provider user, unauthenticated.
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query,
  serverTimestamp, setDoc, terminate, updateDoc, where, type Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { audienceFor } from '../../lib/shell/nav';
import { emulatorPorts } from '../../lib/emulatorPorts';
import { recordShoppingExpense } from '../../lib/repo/shoppingExpense';
import { revokeShareIn, shareListWithChefIn } from '../../lib/repo/sharedListsOps';
import { writeBatch } from 'firebase/firestore';
import { localDateISO } from '../../lib/rules/postingMonth';
import { addMonthsToId, monthIdFromDate } from '../../lib/rules/months';

const ports = emulatorPorts();
const OWNER = 'seed-owner';
const apps: FirebaseApp[] = [];
const dbs: Firestore[] = [];

async function actor(name: string, creds?: [string, string] | 'anonymous') {
  const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `rules-${name}-${Date.now()}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', ports.firestore);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
  let uid = '';
  if (creds === 'anonymous') uid = (await signInAnonymously(auth)).user.uid;
  else if (creds) uid = (await signInWithEmailAndPassword(auth, creds[0], creds[1])).user.uid;
  apps.push(app);
  dbs.push(db);
  return { db, uid };
}

const allowed = async (p: Promise<unknown>, what: string) => { await assert.doesNotReject(p, what); };
const denied = async (p: Promise<unknown>, what: string) => {
  await assert.rejects(p, (e: any) => e?.code === 'permission-denied', `${what} should be denied`);
};

let owner: Awaited<ReturnType<typeof actor>>;
let member: Awaited<ReturnType<typeof actor>>;
let chef: Awaited<ReturnType<typeof actor>>;
let stranger: Awaited<ReturnType<typeof actor>>;
let anon: Awaited<ReturnType<typeof actor>>;
let unauth: Awaited<ReturnType<typeof actor>>;
let shareId = '';
let otherShareId = '';
const run = Date.now().toString(36);

const shareDoc = (chefUid: string, extra: Record<string, unknown> = {}) => ({
  ownerUid: OWNER, listId: 'list-party', listName: 'Weekend party', chefUid, chefLabel: 'Chef',
  status: 'ACTIVE', createdBy: OWNER, createdAt: serverTimestamp(), ...extra,
});
const item = (by: string, extra: Record<string, unknown> = {}) => ({
  name: 'Onions', quantity: 2, unit: 'kg', category: 'Produce', note: 'red ones', status: 'TO_BUY',
  createdBy: by, updatedBy: by, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

before(async () => {
  owner = await actor('owner', ['owner@example.test', 'seed-owner-pass']);
  member = await actor('member', ['member@example.test', 'seed-member-pass']);
  chef = await actor('chef', ['chef@example.test', 'seed-chef-pass']);
  stranger = await actor('stranger', ['stranger@example.test', 'seed-stranger-pass']);
  anon = await actor('anon', 'anonymous');
  unauth = await actor('unauth');
});
after(async () => {
  for (const db of dbs) await terminate(db);
  for (const app of apps) await deleteApp(app);
});

// SEC-1 membership forgery tests live in workspaceMembers.rules.test.ts (own commit, BUDG-7).

describe('SEC-8 share doc', () => {
  test('owner shares one list with the chef; member may share too', async () => {
    const ref = doc(collection(owner.db, 'sharedLists'));
    await allowed(setDoc(ref, shareDoc(chef.uid)), 'owner creates share');
    shareId = ref.id;
    const other = doc(collection(member.db, 'sharedLists'));
    await allowed(setDoc(other, shareDoc('seed-other-chef', { createdBy: member.uid })), 'member creates share');
    otherShareId = other.id;
  });
  test('invalid shares are denied', async () => {
    const c = () => doc(collection(owner.db, 'sharedLists'));
    await denied(setDoc(c(), shareDoc(member.uid)), 'chef who is a household member');
    await denied(setDoc(c(), shareDoc(OWNER)), 'chef == owner');
    await denied(setDoc(c(), shareDoc(chef.uid, { listId: 'no-such-list' })), 'non-existent list');
    await denied(setDoc(c(), shareDoc(chef.uid, { plannedTotal: 10 })), 'money field on share');
    await denied(setDoc(c(), shareDoc(chef.uid, { status: 'REVOKED' })), 'create not ACTIVE');
    await denied(setDoc(doc(collection(stranger.db, 'sharedLists')), shareDoc(chef.uid, { createdBy: stranger.uid })), 'stranger shares owner list');
    await denied(setDoc(doc(collection(chef.db, 'sharedLists')), shareDoc(chef.uid, { createdBy: chef.uid })), 'chef shares to self');
    await denied(updateDoc(doc(owner.db, 'sharedLists', shareId), { chefUid: stranger.uid }), 'chefUid change');
    await denied(updateDoc(doc(owner.db, 'sharedLists', shareId), { listId: 'list-weekly' }), 'listId change');
    await denied(deleteDoc(doc(owner.db, 'sharedLists', shareId)), 'delete (revoke instead)');
  });
});

describe('SEC-10/11/13 chef while ACTIVE', () => {
  let chefItemId = '';
  test('household mirrors an item; chef reads share and items, adds, edits allowed fields and checks off', async () => {
    await allowed(setDoc(doc(owner.db, 'sharedLists', shareId, 'items', 'item-drinks'), item(OWNER, { name: 'Juice', unit: 'pc', quantity: 6 })), 'household mirror');
    await allowed(getDoc(doc(chef.db, 'sharedLists', shareId)), 'chef get share');
    await allowed(getDocs(query(collection(chef.db, 'sharedLists'), where('chefUid', '==', chef.uid), where('status', '==', 'ACTIVE'))), 'chef query own shares');
    await allowed(getDocs(collection(chef.db, 'sharedLists', shareId, 'items')), 'chef list items');
    const ref = doc(collection(chef.db, 'sharedLists', shareId, 'items'));
    await allowed(setDoc(ref, item(chef.uid)), 'chef adds item');
    chefItemId = ref.id;
    await allowed(updateDoc(ref, { quantity: 3, unit: 'kg', note: 'for soup', category: 'Produce', updatedBy: chef.uid, updatedAt: serverTimestamp() }), 'chef edits allowed fields');
    await allowed(updateDoc(doc(chef.db, 'sharedLists', shareId, 'items', 'item-drinks'), { status: 'GOT_IT', updatedBy: chef.uid, updatedAt: serverTimestamp() }), 'chef checks off');
  });
  test('household (owner and member) sees the chef updates', async () => {
    const snap = await getDoc(doc(member.db, 'sharedLists', shareId, 'items', 'item-drinks'));
    assert.equal(snap.data()?.status, 'GOT_IT');
    assert.equal((await getDoc(doc(owner.db, 'sharedLists', shareId, 'items', chefItemId))).data()?.note, 'for soup');
  });
  test('chef denied price fields, extra keys, oversize values, identity changes', async () => {
    const r = () => doc(collection(chef.db, 'sharedLists', shareId, 'items'));
    for (const key of ['price', 'actualPrice', 'assignedPlanItemId', 'assignedTxId', 'plannedTotal', 'cost', 'extra']) {
      await denied(setDoc(r(), item(chef.uid, { [key]: 1 })), `create with ${key}`);
      await denied(updateDoc(doc(chef.db, 'sharedLists', shareId, 'items', chefItemId), { [key]: 1, updatedBy: chef.uid, updatedAt: serverTimestamp() }), `update ${key}`);
    }
    await denied(setDoc(r(), item(chef.uid, { name: 'x'.repeat(121) })), 'name > 120');
    await denied(setDoc(r(), item(chef.uid, { note: 'x'.repeat(501) })), 'note > 500');
    await denied(setDoc(r(), item(chef.uid, { quantity: 10000 })), 'quantity > 9999');
    await denied(setDoc(r(), item(chef.uid, { unit: 'barrel' })), 'unknown unit');
    await denied(setDoc(r(), item(chef.uid, { status: 'PAID' })), 'unknown status');
    await denied(setDoc(r(), item(chef.uid, { createdBy: OWNER })), 'createdBy someone else');
    await denied(updateDoc(doc(chef.db, 'sharedLists', shareId, 'items', 'item-drinks'), { createdBy: chef.uid, updatedBy: chef.uid, updatedAt: serverTimestamp() }), 'createdBy change');
    await denied(updateDoc(doc(chef.db, 'sharedLists', shareId, 'items', 'item-drinks'), { status: 'TO_BUY', updatedBy: OWNER, updatedAt: serverTimestamp() }), 'updatedBy spoof');
    await denied(setDoc(doc(owner.db, 'sharedLists', shareId, 'items', 'p'), item(OWNER, { price: 5 })), 'household cannot put prices in sharedLists either');
  });
  test('chef deletes only own items', async () => {
    await denied(deleteDoc(doc(chef.db, 'sharedLists', shareId, 'items', 'item-drinks')), 'delete household item');
    const ref = doc(collection(chef.db, 'sharedLists', shareId, 'items'));
    await allowed(setDoc(ref, item(chef.uid, { name: 'Tmp' })), 'add tmp');
    await allowed(deleteDoc(ref), 'delete own');
  });
  test('chef denied other shares, unconstrained and collection-group queries', async () => {
    await denied(getDoc(doc(chef.db, 'sharedLists', otherShareId)), 'other share');
    await denied(getDocs(collection(chef.db, 'sharedLists', otherShareId, 'items')), 'other share items');
    await denied(getDocs(collection(chef.db, 'sharedLists')), 'unconstrained sharedLists query');
    await denied(getDocs(query(collection(chef.db, 'sharedLists'), where('ownerUid', '==', OWNER))), 'query by owner');
    await denied(getDocs(collectionGroup(chef.db, 'items')), 'collection group items');
    await denied(updateDoc(doc(chef.db, 'sharedLists', shareId), { status: 'REVOKED' }), 'chef updates share');
  });
  test('chef denied everything under users/{owner}/** and owner top-level money', async () => {
    const pid = monthIdFromDate(new Date());
    const paths: string[][] = [
      ['users', OWNER, 'shoppingLists'], ['users', OWNER, 'shoppingLists', 'list-party', 'items'],
      ['users', OWNER, 'shoppingCatalog'], ['users', OWNER, 'shoppingCatalog', 'tomatoes', 'priceHistory'],
      ['users', OWNER, 'accounts'], ['users', OWNER, 'periods'], ['users', OWNER, 'periods', pid, 'allocations'],
      ['users', OWNER, 'periods', pid, 'transactions'], ['users', OWNER, 'periods', pid, 'planItems'],
      ['users', OWNER, 'receipts'], ['users', OWNER, 'receiptLinks'], ['users', OWNER, 'priceObservations'],
      ['users', OWNER, 'yearItems'], ['users', OWNER, 'settings'],
    ];
    for (const p of paths) await denied(getDocs(collection(chef.db, p[0], ...p.slice(1))), `chef reads ${p.join('/')}`);
    await denied(getDoc(doc(chef.db, 'users', OWNER)), 'chef reads owner doc');
    await denied(setDoc(doc(chef.db, 'users', OWNER, 'periods', pid, 'transactions', 'chef-tx'), { amount: 1 }), 'chef writes a transaction');
    await denied(getDocs(query(collection(chef.db, 'budgets'), where('ownerId', '==', OWNER))), 'owner budgets');
    await denied(getDocs(query(collection(chef.db, 'transactions'), where('ownerId', '==', OWNER))), 'owner top-level transactions');
    await denied(getDoc(doc(chef.db, 'workspaceMembers', `${OWNER}_seed-member`)), 'owner membership doc');
    await denied(setDoc(doc(chef.db, 'workspaceMembers', `${OWNER}_${chef.uid}`), { ownerUid: OWNER, memberUid: chef.uid, status: 'ACTIVE' }), 'chef creates membership naming owner');
    await denied(setDoc(doc(chef.db, 'workspaceMembers', `${OWNER}_${chef.uid}`), { ownerUid: chef.uid, memberUid: chef.uid, status: 'ACTIVE' }), 'chef forges membership');
  });
});

describe('other signed-in user, anonymous, unauthenticated', () => {
  for (const [name, get] of [['stranger', () => stranger], ['anonymous', () => anon], ['unauthenticated', () => unauth]] as const) {
    test(`${name} denied share, items, writes and owner data`, async () => {
      const a = get();
      await denied(getDoc(doc(a.db, 'sharedLists', shareId)), 'get share');
      await denied(getDocs(collection(a.db, 'sharedLists', shareId, 'items')), 'list items');
      await denied(setDoc(doc(collection(a.db, 'sharedLists', shareId, 'items')), item(a.uid || 'x')), 'add item');
      await denied(updateDoc(doc(a.db, 'sharedLists', shareId, 'items', 'item-drinks'), { status: 'TO_BUY', updatedBy: a.uid || 'x', updatedAt: serverTimestamp() }), 'check off');
      await denied(getDocs(query(collection(a.db, 'sharedLists'), where('chefUid', '==', chef.uid), where('status', '==', 'ACTIVE'))), 'query chef shares');
      await denied(getDocs(collection(a.db, 'users', OWNER, 'shoppingLists')), 'owner lists');
      await denied(setDoc(doc(collection(a.db, 'sharedLists')), shareDoc(a.uid || 'x', { createdBy: a.uid || 'x' })), 'create share');
      await denied(setDoc(doc(a.db, 'workspaceMembers', `${OWNER}_${a.uid || 'x'}`), { ownerUid: a.uid || 'x', memberUid: a.uid || 'x', status: 'ACTIVE' }), 'forge membership');
    });
  }
  test('anonymous cannot be the chef even with a matching uid', async () => {
    const ref = doc(collection(owner.db, 'sharedLists'));
    await allowed(setDoc(ref, shareDoc(anon.uid)), 'share to an anonymous uid (rules allow the doc)');
    await denied(getDoc(doc(anon.db, 'sharedLists', ref.id)), 'anonymous chef reads');
    await denied(setDoc(doc(collection(anon.db, 'sharedLists', ref.id, 'items')), item(anon.uid)), 'anonymous chef adds');
  });
});

describe('AC-5 revoke', () => {
  test('member revokes; chef loses read and write at once; re-activation denied; household keeps items', async () => {
    await allowed(updateDoc(doc(member.db, 'sharedLists', shareId), { status: 'REVOKED', revokedAt: serverTimestamp() }), 'revoke');
    await denied(getDoc(doc(chef.db, 'sharedLists', shareId)), 'revoked chef get share');
    await denied(getDocs(collection(chef.db, 'sharedLists', shareId, 'items')), 'revoked chef read items');
    await denied(setDoc(doc(collection(chef.db, 'sharedLists', shareId, 'items')), item(chef.uid)), 'revoked chef add');
    await denied(updateDoc(doc(chef.db, 'sharedLists', shareId, 'items', 'item-drinks'), { status: 'TO_BUY', updatedBy: chef.uid, updatedAt: serverTimestamp() }), 'revoked chef check off');
    await denied(updateDoc(doc(chef.db, 'sharedLists', shareId), { status: 'ACTIVE' }), 'chef re-activates');
    await denied(updateDoc(doc(owner.db, 'sharedLists', shareId), { status: 'ACTIVE' }), 'household re-activates (new share instead)');
    const shares = await getDocs(query(collection(chef.db, 'sharedLists'), where('chefUid', '==', chef.uid), where('status', '==', 'ACTIVE')));
    assert.ok(shares.docs.every((d) => d.id !== shareId), 'revoked share no longer listed');
    assert.ok((await getDocs(collection(owner.db, 'sharedLists', shareId, 'items'))).size >= 2, 'household still reads items');
  });
});

describe('AC-7 / SEC-20 / SEC-22 money', () => {
  const pid = monthIdFromDate(new Date());
  const txCount = async () => (await getDocs(collection(owner.db, 'users', OWNER, 'periods', pid, 'transactions'))).size;
  const input = (itemId: string, dateISO = localDateISO()) => ({
    listId: 'list-party', listName: 'Weekend party', itemId, itemName: 'Juice', amount: 18, dateISO,
    accountId: 'acc-household', planItemId: 'plan-groceries', planItemName: 'Groceries', group: 'NEED',
  });
  test('check-off (private bought + shared status) writes no transaction', async () => {
    const before = await txCount();
    await allowed(updateDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', 'list-party', 'items', 'item-drinks'), { bought: true }), 'private check-off');
    await allowed(updateDoc(doc(owner.db, 'sharedLists', 'share-weekly', 'items', 'item-tomatoes'), { status: 'GOT_IT', updatedBy: OWNER, updatedAt: serverTimestamp() }), 'household shared check-off (seeded share)');
    await allowed(updateDoc(doc(chef.db, 'sharedLists', 'share-weekly', 'items', 'item-tomatoes'), { status: 'TO_BUY', updatedBy: chef.uid, updatedAt: serverTimestamp() }), 'chef shared check-off (seeded share)');
    assert.equal(await txCount(), before);
  });
  test('Record expense x2 sequential and x2 concurrent -> one transaction per item', async () => {
    const before = await txCount();
    const a = await recordShoppingExpense(owner.db, OWNER, input(`seq-${run}`));
    const b = await recordShoppingExpense(owner.db, OWNER, input(`seq-${run}`));
    assert.deepEqual([a.created, b.created], [true, false]);
    const both = await Promise.allSettled([recordShoppingExpense(owner.db, OWNER, input(`con-${run}`)), recordShoppingExpense(member.db, OWNER, input(`con-${run}`))]);
    const created = both.filter((r) => r.status === 'fulfilled' && r.value.created).length;
    assert.equal(created, 1);
    assert.equal(await txCount(), before + 2);
    const tx = (await getDoc(doc(owner.db, 'users', OWNER, 'periods', pid, 'transactions', `shop_list-party_seq-${run}`))).data();
    assert.equal(tx?.accountId, 'acc-household');
    assert.equal(tx?.amount, 18);
    assert.equal(tx?.date, localDateISO());
  });
  test('locked (DECIDED) month aborts with zero writes; chef cannot record', async () => {
    const prev = addMonthsToId(pid, -1);
    const prevCount = (await getDocs(collection(owner.db, 'users', OWNER, 'periods', prev, 'transactions'))).size;
    await assert.rejects(recordShoppingExpense(owner.db, OWNER, input(`lock-${run}`, `${prev}-15`)), /locked/);
    assert.equal((await getDocs(collection(owner.db, 'users', OWNER, 'periods', prev, 'transactions'))).size, prevCount);
    await assert.rejects(recordShoppingExpense(chef.db, OWNER, input(`chef-${run}`)), (e: any) => e?.code === 'permission-denied');
  });
});

describe('C-10 existing data stays intact (pre-change shapes)', () => {
  const strip = (o: Record<string, unknown> | undefined) => {
    const { updatedAt: _u, ...rest } = o || {};
    return rest;
  };
  test('legacy list, items and catalog load for owner and member; share then revoke changes only what the chef edited', async () => {
    const { shareListWithChefIn, revokeShareIn } = await import('../../lib/repo/sharedListsOps');
    const itemsCol = (db: Firestore) => collection(db, 'users', OWNER, 'shoppingLists', 'list-party', 'items');
    const snap = async () => ({
      list: (await getDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', 'list-party'))).data(),
      items: Object.fromEntries((await getDocs(itemsCol(owner.db))).docs.map((d) => [d.id, d.data()])),
      catalog: Object.fromEntries((await getDocs(collection(owner.db, 'users', OWNER, 'shoppingCatalog'))).docs.map((d) => [d.id, d.data()])),
    });
    assert.ok((await getDocs(itemsCol(member.db))).size >= 1, 'member reads legacy items');
    const before = await snap();
    assert.equal(before.items['item-drinks'].price, 3, 'legacy item has its price');

    const id = await shareListWithChefIn(owner.db, OWNER, OWNER, { id: 'list-party', name: 'Weekend party' }, chef.uid, 'Chef');
    const shared = (await getDoc(doc(chef.db, 'sharedLists', id, 'items', 'item-drinks'))).data();
    const allowedKeys = ['name', 'quantity', 'unit', 'category', 'note', 'status', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt'];
    assert.ok(Object.keys(shared || {}).every((k) => allowedKeys.includes(k)), `only chef-visible keys copied: ${Object.keys(shared || {})}`);
    assert.equal(shared?.price, undefined, 'no price copied');
    const mid = await snap();
    assert.deepEqual(mid.items, before.items, 'sharing does not touch private items');
    assert.deepEqual(mid.catalog, before.catalog, 'sharing does not touch the catalog');
    assert.deepEqual({ ...mid.list, shareId: undefined, sharedWithLabel: undefined }, { ...before.list, shareId: undefined, sharedWithLabel: undefined }, 'list doc only gains shareId/sharedWithLabel');

    await updateDoc(doc(chef.db, 'sharedLists', id, 'items', 'item-drinks'), { status: 'GOT_IT', updatedBy: chef.uid, updatedAt: serverTimestamp() });
    const added = doc(collection(chef.db, 'sharedLists', id, 'items'));
    await setDoc(added, item(chef.uid, { name: 'Ice', unit: 'pack', quantity: 1 }));
    await revokeShareIn(member.db, OWNER, 'list-party', id);

    const after = await snap();
    assert.deepEqual(after.catalog, before.catalog, 'catalog unchanged');
    assert.deepEqual(after.list, before.list, 'list doc back to its pre-share shape');
    const { bought: _b, ...drinksRest } = after.items['item-drinks'];
    const { bought: _b0, ...drinksBefore } = before.items['item-drinks'];
    assert.equal(after.items['item-drinks'].bought, true, 'chef check-off folded in');
    assert.deepEqual(drinksRest, drinksBefore, 'price, status, source, category untouched');
    for (const [k, v] of Object.entries(before.items)) if (k !== 'item-drinks') assert.deepEqual(strip(after.items[k]), strip(v), `${k} untouched`);
    assert.equal(after.items[added.id]?.name, 'Ice', 'chef-added item kept by the household');
    assert.equal(after.items[added.id]?.price, undefined, 'no price invented');
  });
});

// BUDG-6 H-1 (challenge review): a share addressed to someone is never a lock. The challenger's proof
// (stranger shares their own list naming a victim) is replayed: the lock-out is now denied, the victim
// can leave (status only), and nothing else about the share is theirs to change.
describe('H-1 forced share: the named chef can always leave; the share cannot lock them out', () => {
  test('challenger H-1 replayed: victim with own list stays household, leaves the share, then loses read', async () => {
    const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `rules-victim-${run}`);
    const vdb = getFirestore(app);
    connectFirestoreEmulator(vdb, '127.0.0.1', ports.firestore);
    const vauth = getAuth(app);
    connectAuthEmulator(vauth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    const victimUid = (await createUserWithEmailAndPassword(vauth, `victim-${run}@example.test`, `victim-${run}-pass`)).user.uid;
    apps.push(app); dbs.push(vdb);
    await allowed(setDoc(doc(vdb, 'users', victimUid, 'shoppingLists', 'mine'), { name: 'My list' }), 'victim own list');
    await allowed(setDoc(doc(stranger.db, 'users', stranger.uid, 'shoppingLists', `bait-${run}`), { name: 'x' }), 'stranger own list');
    const ref = doc(collection(stranger.db, 'sharedLists'));
    // A share of a list the creator owns is valid (no consent step exists); what changes is that it can no longer lock anyone.
    await allowed(setDoc(ref, { ownerUid: stranger.uid, listId: `bait-${run}`, listName: 'Your bank asks you to verify', chefUid: victimUid, chefLabel: 'Chef', status: 'ACTIVE', createdBy: stranger.uid, createdAt: serverTimestamp() }), 'stranger shares own list');
    const shared = await getDocs(query(collection(vdb, 'sharedLists'), where('chefUid', '==', victimUid), where('status', '==', 'ACTIVE')));
    const months = await getDocs(collection(vdb, 'users', victimUid, 'periods'));
    const lists = await getDocs(collection(vdb, 'users', victimUid, 'shoppingLists'));
    assert.equal(shared.size, 1);
    assert.equal(months.size, 0);
    // Lock-out denied: a user with household data of their own is never classed as a chef.
    assert.equal(audienceFor({ sharedWithMe: shared.size, ownMonths: months.size, memberships: 0, ownLists: lists.size }), 'household');
    // The victim may change nothing but the status: not the label, not the name, not a re-point.
    await denied(updateDoc(doc(vdb, 'sharedLists', ref.id), { chefLabel: 'Me' }), 'victim edits label');
    await denied(updateDoc(doc(vdb, 'sharedLists', ref.id), { status: 'REVOKED', revokedAt: serverTimestamp(), listName: 'y' }), 'victim leaves and renames');
    await denied(updateDoc(doc(vdb, 'sharedLists', ref.id), { status: 'REVOKED' }), 'leave without revokedAt');
    await denied(updateDoc(doc(stranger.db, 'sharedLists', shareId), { status: 'REVOKED', revokedAt: serverTimestamp() }), 'a non-chef ends someone else\'s share');
    // Leave: status ACTIVE -> REVOKED with revokedAt, allowed for the named chef.
    await allowed(updateDoc(doc(vdb, 'sharedLists', ref.id), { status: 'REVOKED', revokedAt: serverTimestamp() }), 'victim leaves');
    await denied(getDoc(doc(vdb, 'sharedLists', ref.id)), 'victim reads the share after leaving');
    await denied(updateDoc(doc(vdb, 'sharedLists', ref.id), { status: 'ACTIVE' }), 'victim re-activates');
    await denied(setDoc(doc(vdb, 'sharedLists', ref.id, 'items', 'x'), item(victimUid)), 'victim writes items after leaving');
    const after = await getDocs(query(collection(vdb, 'sharedLists'), where('chefUid', '==', victimUid), where('status', '==', 'ACTIVE')));
    assert.equal(after.size, 0);
    // A user with no data of their own who left keeps the chef view only until "Start my own budget".
    assert.equal(audienceFor({ sharedWithMe: 0, ownMonths: 0, memberships: 0, ownLists: 0 }, true), 'chef');
    assert.equal(audienceFor({ sharedWithMe: 0, ownMonths: 0, memberships: 0, ownLists: 0 }, true, true), 'household');
  });

  test('a share is valid only for a list of the creator\'s own household', async () => {
    await denied(setDoc(doc(collection(stranger.db, 'sharedLists')), { ...shareDoc(chef.uid), createdBy: stranger.uid }), 'stranger shares the owner\'s list');
    await denied(setDoc(doc(collection(stranger.db, 'sharedLists')), { ...shareDoc(chef.uid), ownerUid: stranger.uid, listId: `no-such-${run}`, createdBy: stranger.uid }), 'share of a list that does not exist');
  });
});

// BUDG-6 R-2: share and revoke stay under the 500-write batch limit; revoke cuts the chef first.
describe('R-2 large lists: share and revoke in chunks', () => {
  const N = 450;
  async function bigList(id: string) {
    await setDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', id), { name: `Big ${id}`, ownerUid: OWNER });
    for (let start = 0; start < N; start += 400) {
      const b = writeBatch(owner.db);
      for (let i = start; i < Math.min(N, start + 400); i++) {
        b.set(doc(owner.db, 'users', OWNER, 'shoppingLists', id, 'items', `it${String(i).padStart(3, '0')}`), { name: `Item ${i}`, quantity: 1, bought: false, status: 'planned' });
      }
      await b.commit();
    }
  }

  test(`share and revoke a list of ${N} items`, async () => {
    const listId = `big-${run}`;
    await bigList(listId);
    const id = await shareListWithChefIn(owner.db, OWNER, owner.uid, { id: listId, name: 'Big list' }, chef.uid, 'Chef');
    const items = await getDocs(collection(chef.db, 'sharedLists', id, 'items'));
    assert.equal(items.size, N, 'chef sees every item');
    const listDoc = await getDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', listId));
    assert.equal(listDoc.data()?.shareId, id, 'list marked shared last');
    await allowed(updateDoc(doc(chef.db, 'sharedLists', id, 'items', 'it007'), { status: 'GOT_IT', updatedBy: chef.uid, updatedAt: serverTimestamp() }), 'chef ticks one');
    await allowed(revokeShareIn(owner.db, OWNER, listId, id), `revoke a ${N}-item share`);
    await denied(getDoc(doc(chef.db, 'sharedLists', id)), 'chef reads the share after revoke');
    await denied(getDocs(collection(chef.db, 'sharedLists', id, 'items')), 'chef reads items after revoke');
    const folded = await getDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', listId, 'items', 'it007'));
    assert.equal(folded.data()?.bought, true, 'chef tick folded back');
    const after = await getDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', listId));
    assert.equal(after.data()?.shareId, undefined, 'share fields removed last');
    assert.equal((await getDocs(collection(owner.db, 'users', OWNER, 'shoppingLists', listId, 'items'))).size, N, 'no private item lost');
  });

  test('a share that fails midway leaves the chef without access and the list not shared', async () => {
    const listId = `big-fail-${run}`;
    await bigList(listId);
    let shareSeen = '';
    await assert.rejects(
      shareListWithChefIn(owner.db, OWNER, owner.uid, { id: listId, name: 'Big list' }, chef.uid, 'Chef', {
        beforeChunk: async (i) => {
          if (i === 1) {
            const live = await getDocs(query(collection(chef.db, 'sharedLists'), where('chefUid', '==', chef.uid), where('status', '==', 'ACTIVE')));
            shareSeen = live.docs.find((d) => d.data().listId === listId)?.id || '';
            throw new Error('injected failure after the first chunk');
          }
        },
      }),
      /injected failure/
    );
    assert.ok(shareSeen, 'the share was live during the write');
    await denied(getDoc(doc(chef.db, 'sharedLists', shareSeen)), 'chef reads the failed share');
    const live = await getDocs(query(collection(chef.db, 'sharedLists'), where('chefUid', '==', chef.uid), where('status', '==', 'ACTIVE')));
    assert.equal(live.docs.some((d) => d.data().listId === listId), false, 'no live share for the list');
    assert.equal((await getDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', listId))).data()?.shareId, undefined);
  });

  test('a revoke that fails midway has already cut the chef off', async () => {
    const listId = `big-rfail-${run}`;
    await bigList(listId);
    const id = await shareListWithChefIn(owner.db, OWNER, owner.uid, { id: listId, name: 'Big list' }, chef.uid, 'Chef');
    await allowed(updateDoc(doc(chef.db, 'sharedLists', id, 'items', 'it001'), { note: 'from chef', updatedBy: chef.uid, updatedAt: serverTimestamp() }), 'chef edits');
    await assert.rejects(revokeShareIn(owner.db, OWNER, listId, id, { beforeChunk: () => { throw new Error('injected'); } }), /injected/);
    await denied(getDoc(doc(chef.db, 'sharedLists', id)), 'chef after a failed revoke');
    await allowed(revokeShareIn(owner.db, OWNER, listId, id), 'retry completes the fold');
    assert.equal((await getDoc(doc(owner.db, 'users', OWNER, 'shoppingLists', listId, 'items', 'it001'))).data()?.note, 'from chef');
  });
});

// BUDG-6 H-3: the challenger's proof turned into a pass: a chef cannot create an item with an odd id,
// and a recorded household id re-created by the chef posts a separate expense, never a silent no-op.
describe('H-3 chef-created item ids', () => {
  test('odd ids denied for the chef; plain ids allowed', async () => {
    const live = await getDocs(query(collection(chef.db, 'sharedLists'), where('chefUid', '==', chef.uid), where('status', '==', 'ACTIVE')));
    const activeId = live.docs.find((d) => d.data().listId === 'list-weekly')?.id || '';
    assert.ok(activeId, 'seeded active share');
    await denied(setDoc(doc(chef.db, 'sharedLists', activeId, 'items', `odd id.${run}`), item(chef.uid, { name: 'Tomatoes' })), 'odd id');
    const ok = `ok_${run}-1`;
    await allowed(setDoc(doc(chef.db, 'sharedLists', activeId, 'items', ok), item(chef.uid)), 'plain id');
    await allowed(deleteDoc(doc(chef.db, 'sharedLists', activeId, 'items', ok)), 'chef deletes own item');
  });

  test('a chef item with an already-recorded id is posted under a household key', async () => {
    const dateISO = localDateISO();
    const base = { listId: 'list-weekly', listName: 'Weekly groceries', itemName: 'Milk', amount: 3.25, dateISO, accountId: 'acc-household', planItemId: 'plan-groceries', planItemName: 'Groceries' };
    const itemId = `h3-${run}`;
    const first = await recordShoppingExpense(owner.db, OWNER, { ...base, itemId });
    assert.equal(first.created, true);
    const replay = await recordShoppingExpense(owner.db, OWNER, { ...base, itemId });
    assert.equal(replay.created, false, 'same household id: the app now reports it and keeps the item');
    const keyed = await recordShoppingExpense(owner.db, OWNER, { ...base, itemId, householdKey: `k${run}` });
    assert.equal(keyed.created, true);
    assert.notEqual(keyed.txId, first.txId);
  });
});
