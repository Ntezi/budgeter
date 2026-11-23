// SEC-1 (BUDG-4 / BUDG-7): workspaceMembers ids are bound to their fields, keys are
// allowlisted and ownerUid/memberUid are immutable, so no one can forge {owner}_{me}.
// Client SDK per actor so firestore.rules apply. Run after `npm run emulators:up` (seeded).
// Self-contained on purpose (cherry-pickable): ports from BUDGETA_EMULATOR_PORT_OFFSET, default 0.
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, setDoc, terminate, updateDoc, type Firestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';

const offset = Number(process.env.BUDGETA_EMULATOR_PORT_OFFSET || 0);
if (!Number.isInteger(offset) || offset < 0 || offset > 1000) throw new Error('BUDGETA_EMULATOR_PORT_OFFSET must be 0..1000');
const OWNER = 'seed-owner';
const apps: FirebaseApp[] = [];
const dbs: Firestore[] = [];
const run = Date.now().toString(36);

async function actor(name: string, creds: [string, string] | 'anonymous') {
  const app = initializeApp({ projectId: 'demo-budgeta', apiKey: 'demo-api-key' }, `sec1-${name}-${run}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080 + offset);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${9099 + offset}`, { disableWarnings: true });
  const uid = creds === 'anonymous' ? (await signInAnonymously(auth)).user.uid : (await signInWithEmailAndPassword(auth, creds[0], creds[1])).user.uid;
  apps.push(app);
  dbs.push(db);
  return { db, uid };
}
const allowed = async (p: Promise<unknown>, what: string) => { await assert.doesNotReject(p, what); };
const denied = async (p: Promise<unknown>, what: string) => {
  await assert.rejects(p, (e: any) => e?.code === 'permission-denied', `${what} should be denied`);
};

let owner: Awaited<ReturnType<typeof actor>>;
let stranger: Awaited<ReturnType<typeof actor>>;
let anon: Awaited<ReturnType<typeof actor>>;
before(async () => {
  owner = await actor('owner', ['owner@example.test', 'seed-owner-pass']);
  // Any second non-member account works; the seeded chef is not a member of the owner.
  stranger = await actor('stranger', ['chef@example.test', 'seed-chef-pass']);
  anon = await actor('anon', 'anonymous');
});
after(async () => {
  for (const db of dbs) await terminate(db);
  for (const app of apps) await deleteApp(app);
});

describe('SEC-1 workspaceMembers cannot be forged', () => {
  test('stranger creating {owner}_{stranger} with ownerUid=stranger is denied', async () => {
    await denied(setDoc(doc(stranger.db, 'workspaceMembers', `${OWNER}_${stranger.uid}`), {
      ownerUid: stranger.uid, memberUid: stranger.uid, status: 'ACTIVE', role: 'MEMBER',
    }), 'forged membership');
    await denied(setDoc(doc(stranger.db, 'workspaceMembers', `${OWNER}_${stranger.uid}`), {
      ownerUid: stranger.uid, memberUid: 'x', status: 'ACTIVE',
    }), 'id not bound to fields');
    await denied(getDocs(collection(stranger.db, 'users', OWNER, 'accounts')), 'stranger reads owner accounts');
  });
  test('a correct {stranger}_{owner} doc gives the stranger nothing on users/owner', async () => {
    await allowed(setDoc(doc(stranger.db, 'workspaceMembers', `${stranger.uid}_${OWNER}`), {
      ownerUid: stranger.uid, memberUid: OWNER, status: 'ACTIVE', role: 'MEMBER', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }), 'own membership doc');
    await denied(getDocs(collection(stranger.db, 'users', OWNER, 'shoppingLists')), 'stranger reads owner lists');
    await allowed(deleteDoc(doc(stranger.db, 'workspaceMembers', `${stranger.uid}_${OWNER}`)), 'cleanup');
  });
  test('owner invite (setDoc merge, existing shape) passes; extra keys, self-invite and identity changes are denied', async () => {
    const id = `${OWNER}_invitee-${run}`;
    const body = { ownerUid: OWNER, ownerEmail: 'owner@example.test', ownerName: 'Test Owner', memberUid: `invitee-${run}`, memberEmail: '', memberName: '', role: 'MEMBER', status: 'ACTIVE', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await allowed(setDoc(doc(owner.db, 'workspaceMembers', id), body, { merge: true }), 'invite');
    await allowed(setDoc(doc(owner.db, 'workspaceMembers', id), body, { merge: true }), 're-invite (update)');
    await denied(updateDoc(doc(owner.db, 'workspaceMembers', id), { memberUid: 'someone-else' }), 'memberUid change');
    await denied(updateDoc(doc(owner.db, 'workspaceMembers', id), { ownerUid: 'x' }), 'ownerUid change');
    await denied(setDoc(doc(owner.db, 'workspaceMembers', `${OWNER}_extra-${run}`), { ...body, memberUid: `extra-${run}`, isAdmin: true }), 'extra key');
    await denied(setDoc(doc(owner.db, 'workspaceMembers', `${OWNER}_${OWNER}`), { ...body, memberUid: OWNER }), 'self-invite');
    await denied(setDoc(doc(owner.db, 'workspaceMembers', `${OWNER}_r-${run}`), { ...body, memberUid: `r-${run}`, status: 'REMOVED' }), 'create non-ACTIVE');
    await allowed(deleteDoc(doc(owner.db, 'workspaceMembers', id)), 'remove');
  });
});

test('SEC-1 anonymous-provider accounts cannot create memberships', async () => {
  await denied(setDoc(doc(anon.db, 'workspaceMembers', `${anon.uid}_${OWNER}`), {
    ownerUid: anon.uid, memberUid: OWNER, status: 'ACTIVE', role: 'MEMBER',
  }), 'anonymous membership');
});

test('C-10 a membership in the pre-change shape (seeded like inviteWorkspaceMember) keeps full access', async () => {
  const member = await actor('member', ['member@example.test', 'seed-member-pass']);
  for (const sub of ['accounts', 'shoppingLists', 'shoppingCatalog', 'periods']) {
    await allowed(getDocs(collection(member.db, 'users', OWNER, sub)), `member reads ${sub}`);
  }
  await allowed(updateDoc(doc(member.db, 'users', OWNER, 'shoppingLists', 'list-party', 'items', 'item-drinks'), { note: 'member edit' }), 'member writes');
  // Owner re-invites the same member over the existing doc (setDoc merge = update).
  await allowed(setDoc(doc(owner.db, 'workspaceMembers', `${OWNER}_seed-member`), {
    ownerUid: OWNER, ownerEmail: 'owner@example.test', ownerName: 'Test Owner', memberUid: 'seed-member',
    memberEmail: 'member@example.test', memberName: 'Test Member', role: 'MEMBER', status: 'ACTIVE',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }, { merge: true }), 're-invite existing member');
  await allowed(getDocs(collection(member.db, 'users', OWNER, 'accounts')), 'member still reads after re-invite');
});
