// BUDG-42: batched removal of shopping list items, and the Undo of a single removal.
// Takes the Firestore instance so emulator tests run the app's own code. AC-6: it deletes only
// users/{owner}/shoppingLists/{list}/items/{id} and its mirror sharedLists/{share}/items/{id};
// never a transaction, receipt, receipt link, price, catalog item or expense mark.
import { doc, getDoc, serverTimestamp, writeBatch, type DocumentData, type Firestore } from 'firebase/firestore';
import { chunk, REMOVE_CHUNK, removalWrites, type RemoveTarget } from '../rules/shoppingRemoval';
import { SHARED_ITEM_FIELDS } from './sharedListsCore';

export type RemoveScope = { ownerUid?: string; listId?: string; shareId?: string };
export type RemovedSnapshot = { scope: RemoveScope; id: string; privateData?: DocumentData; sharedData?: DocumentData };
export type RemoveOptions = { chunkSize?: number; /** read the docs first so the removal can be undone */ snapshot?: boolean };

function refFor(db: Firestore, scope: RemoveScope, where: 'private' | 'shared', id: string) {
  if (where === 'private') {
    if (!scope.ownerUid || !scope.listId) throw new Error('A private item needs its owner and list.');
    return doc(db, 'users', scope.ownerUid, 'shoppingLists', scope.listId, 'items', id);
  }
  if (!scope.shareId) throw new Error('A shared item needs its share.');
  return doc(db, 'sharedLists', scope.shareId, 'items', id);
}

/** Deletes the targets in batches of at most `chunkSize` (<= 400) writes. Returns snapshots when asked. */
export async function removeShoppingItemsIn(db: Firestore, scope: RemoveScope, targets: RemoveTarget[], opts: RemoveOptions = {}) {
  const writes = removalWrites(targets);
  const snapshots: RemovedSnapshot[] = [];
  if (opts.snapshot) {
    for (const t of targets) {
      const snap: RemovedSnapshot = { scope, id: t.id };
      if (t.private) {
        const d = await getDoc(refFor(db, scope, 'private', t.id));
        if (d.exists()) snap.privateData = d.data();
      }
      if (t.shared) {
        const d = await getDoc(refFor(db, scope, 'shared', t.id));
        if (d.exists()) snap.sharedData = d.data();
      }
      snapshots.push(snap);
    }
  }
  const size = Math.max(1, Math.min(opts.chunkSize ?? REMOVE_CHUNK, REMOVE_CHUNK));
  let commits = 0;
  for (const part of chunk(writes, size)) {
    const batch = writeBatch(db);
    part.forEach((w) => batch.delete(refFor(db, scope, w.where, w.id)));
    await batch.commit();
    commits += 1;
  }
  return { deleted: writes.length, commits, snapshots };
}

/**
 * Undo: the private item comes back exactly (same id, same fields). The mirror comes back with the same
 * chef-visible fields; firestore.rules require createdBy/updatedBy = the actor and the times = now on create.
 */
export async function restoreShoppingItemsIn(db: Firestore, snapshots: RemovedSnapshot[], actorUid: string) {
  const batch = writeBatch(db);
  let writes = 0;
  for (const s of snapshots) {
    if (s.privateData) {
      batch.set(refFor(db, s.scope, 'private', s.id), s.privateData);
      writes += 1;
    }
    if (s.sharedData) {
      const fields: Record<string, unknown> = {};
      for (const key of SHARED_ITEM_FIELDS) if (s.sharedData[key] !== undefined) fields[key] = s.sharedData[key];
      batch.set(refFor(db, s.scope, 'shared', s.id), {
        ...fields,
        createdBy: actorUid,
        updatedBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writes += 1;
    }
  }
  if (writes) await batch.commit();
  return writes;
}
