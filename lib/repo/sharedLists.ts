// Chef access to exactly one list (BUDG-4, ADR-3 option d, SEC-8..SEC-12).
// Top-level sharedLists/{shareId} + items with chef-visible fields only; the private
// twin under users/{owner}/shoppingLists/{listId}/items/{itemId} keeps price and links.
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '../firebase';
import { revokeShareIn, shareListWithChefIn } from './sharedListsOps';
import {
  SHARED_ITEM_FIELDS,
  toSharedItemFields,
  type SharedItem,
  type SharedList,
} from './sharedListsCore';

export * from './sharedListsCore';

export function sharedListsCol() {
  return collection(db, 'sharedLists');
}

export function sharedItemsCol(shareId: string) {
  return collection(db, 'sharedLists', shareId, 'items');
}

function pickAllowed(patch: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of SHARED_ITEM_FIELDS) if (patch[key] !== undefined) out[key] = patch[key];
  return out;
}

/** Household: share one list with a chef account (explicit action only; nothing migrates by itself). */
export function shareListWithChef(ownerUid: string, actorUid: string, list: { id: string; name: string }, chefUid: string, chefLabel: string) {
  return shareListWithChefIn(db, ownerUid, actorUid, list, chefUid, chefLabel);
}

/** Household: revoke (status REVOKED); chef edits are folded back into the private list. */
export function revokeShare(ownerUid: string, listId: string, shareId: string) {
  return revokeShareIn(db, ownerUid, listId, shareId);
}

export function watchShare(shareId: string, cb: (row: SharedList | null) => void, onError: (e: FirestoreError) => void) {
  return onSnapshot(
    doc(sharedListsCol(), shareId),
    (snap) => cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as SharedList) }) : null),
    onError
  );
}

/** Chef: shares where I am the chef and the share is ACTIVE (SEC-11 constrained query). */
export function watchSharedWithMe(myUid: string, cb: (rows: SharedList[]) => void, onError?: (e: FirestoreError) => void) {
  const q = query(sharedListsCol(), where('chefUid', '==', myUid), where('status', '==', 'ACTIVE'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SharedList) }))),
    (e) => {
      cb([]);
      onError?.(e);
    }
  );
}

export function watchSharedItems(shareId: string, cb: (rows: SharedItem[]) => void, onError: (e: FirestoreError) => void) {
  return onSnapshot(
    sharedItemsCol(shareId),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SharedItem) }));
      rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      cb(rows);
    },
    onError
  );
}

/** Chef or household: add an item with allowed fields only. Optional id keeps the private twin's id. */
export async function addSharedItem(shareId: string, actorUid: string, input: Partial<SharedItem>, itemId?: string) {
  const ref = itemId ? doc(sharedItemsCol(shareId), itemId) : doc(sharedItemsCol(shareId));
  const fields = toSharedItemFields(input as any);
  if (!fields.name) throw new Error('Item name is required.');
  await setDoc(ref, {
    ...fields,
    createdBy: actorUid,
    updatedBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSharedItem(shareId: string, actorUid: string, itemId: string, patch: Partial<SharedItem>) {
  const allowed = pickAllowed(patch as any);
  if ('name' in allowed && !String(allowed.name || '').trim()) throw new Error('Item name is required.');
  return updateDoc(doc(sharedItemsCol(shareId), itemId), { ...allowed, updatedBy: actorUid, updatedAt: serverTimestamp() });
}

export async function deleteSharedItem(shareId: string, itemId: string) {
  return deleteDoc(doc(sharedItemsCol(shareId), itemId));
}
