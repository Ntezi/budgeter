// BUDG-43 writes for catalog items "to approve" and the chef's price-free catalog copy.
// Takes the Firestore instance so emulator tests run the same code as the app.
// The chef never writes under users/{owner}/**: every write here runs on a household client.
import {
  collection, deleteField, doc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  arrayUnion, type Firestore,
} from 'firebase/firestore';
import {
  chefPendingId, diffCatalogCopy, exactCatalogMatch, pendingFields, type CatalogSource, type PendingInput,
} from '../rules/catalogPending';
import { normalizeShoppingItemName } from '../shopping/import/normalizeShoppingItemName';

const CHUNK = 400; // same limit as sharedListsOps (R-2)
const catalogCol = (db: Firestore, uid: string) => collection(db, 'users', uid, 'shoppingCatalog');
export const catalogCopyCol = (db: Firestore, shareId: string) => collection(db, 'sharedLists', shareId, 'catalog');
const dismissedRef = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'catalogDismissed', id);

/** AC-1: a new catalog item marked pending; fully usable on lists right away. */
export async function createPendingCatalogItemIn(
  db: Firestore,
  uid: string,
  input: { name: string; category?: string; unit?: string; workspaceId?: string },
  origin: PendingInput
) {
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw new Error('Shopping item name is required.');
  const ref = doc(catalogCol(db, uid));
  await setDoc(ref, {
    name,
    normalizedName: normalizeShoppingItemName(name),
    category: String(input.category || '').trim(),
    tags: [],
    aliases: [],
    ...(input.unit ? { variant: { unit: input.unit } } : {}),
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    ...pendingFields(origin, serverTimestamp()),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export type ChefItem = { id: string; name: string; unit?: string; category?: string; createdBy?: string };
export type ChefPendingResult = 'created' | 'exists' | 'matched' | 'dismissed';

/**
 * AC-2: the household client turns a chef-added item into a pending catalog entry.
 * Deterministic id + a transaction that only creates when absent, so two household devices
 * never create two entries; a name that matches the catalog creates none; an entry the
 * household removed or merged (tombstone in users/{owner}/catalogDismissed) is never recreated.
 */
export async function ensureChefPendingIn(
  db: Firestore,
  ownerUid: string,
  share: { shareId: string; chefUid: string; listId?: string; listName?: string },
  item: ChefItem,
  catalog: CatalogSource[],
  workspaceId?: string
): Promise<ChefPendingResult> {
  const name = String(item.name || '').trim().slice(0, 120);
  if (!name || !item.id) return 'matched';
  const id = chefPendingId(share.shareId, item.id);
  if (exactCatalogMatch(name, catalog.filter((row) => row.id !== id))) return 'matched';
  const ref = doc(catalogCol(db, ownerUid), id);
  return runTransaction(db, async (tx) => {
    const [cur, gone] = await Promise.all([tx.get(ref), tx.get(dismissedRef(db, ownerUid, id))]);
    if (gone.exists()) return 'dismissed' as const;
    if (cur.exists()) return 'exists' as const;
    tx.set(ref, {
      name,
      normalizedName: normalizeShoppingItemName(name),
      category: String(item.category || '').trim(),
      tags: [],
      aliases: [],
      ...(item.unit ? { variant: { unit: item.unit } } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...pendingFields(
        { addedFrom: 'chef', addedBy: share.chefUid, sourceShareId: share.shareId, sourceListId: share.listId, sourceListName: share.listName },
        serverTimestamp()
      ),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'created' as const;
  });
}

/** AC-3 Approve: pending false; addedFrom and the rest stay as a record. */
export async function approvePendingIn(db: Firestore, uid: string, id: string) {
  await updateDoc(doc(catalogCol(db, uid), id), { pending: false, updatedAt: serverTimestamp() });
}

async function listItemsLinkedTo(db: Firestore, uid: string, catalogId: string) {
  const lists = await getDocs(collection(db, 'users', uid, 'shoppingLists'));
  const out: ReturnType<typeof doc>[] = [];
  for (const l of lists.docs) {
    const snap = await getDocs(query(collection(db, 'users', uid, 'shoppingLists', l.id, 'items'), where('catalogItemId', '==', catalogId)));
    snap.forEach((d) => out.push(d.ref));
  }
  return out;
}

async function commitChunks(db: Firestore, ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }
}

/**
 * AC-3 Use existing: list items that point at the pending entry are repointed to the chosen item,
 * the pending name is kept as an alias of it, the pending entry is removed. The chosen item's
 * price history is not touched.
 */
export async function mergePendingIntoIn(db: Firestore, uid: string, pending: { id: string; name: string }, existingId: string) {
  if (!existingId || existingId === pending.id) throw new Error('Choose another catalog item.');
  const refs = await listItemsLinkedTo(db, uid, pending.id);
  await commitChunks(db, refs.map((ref) => (b) => b.update(ref, { catalogItemId: existingId, updatedAt: serverTimestamp() })));
  const batch = writeBatch(db);
  const alias = String(pending.name || '').trim().slice(0, 120);
  if (alias) batch.update(doc(catalogCol(db, uid), existingId), { aliases: arrayUnion(alias), updatedAt: serverTimestamp() });
  batch.set(dismissedRef(db, uid, pending.id), { reason: 'use-existing', catalogItemId: existingId, at: serverTimestamp() });
  batch.delete(doc(catalogCol(db, uid), pending.id));
  await batch.commit();
  return refs.length;
}

/** AC-3 Remove: the pending entry goes; list items keep their name and lose the link. */
export async function removePendingIn(db: Firestore, uid: string, pendingId: string) {
  const refs = await listItemsLinkedTo(db, uid, pendingId);
  await commitChunks(db, refs.map((ref) => (b) => b.update(ref, { catalogItemId: deleteField(), updatedAt: serverTimestamp() })));
  const batch = writeBatch(db);
  batch.set(dismissedRef(db, uid, pendingId), { reason: 'removed', at: serverTimestamp() });
  batch.delete(doc(catalogCol(db, uid), pendingId));
  await batch.commit();
  return refs.length;
}

/** AC-4: bring sharedLists/{shareId}/catalog in step with the catalog; returns the number of writes (0 = nothing changed). */
export async function syncCatalogCopyIn(db: Firestore, shareId: string, catalog: CatalogSource[]) {
  const snap = await getDocs(catalogCopyCol(db, shareId));
  const copy = snap.docs.map((d) => ({ id: d.id, ...(d.data() as { name?: string; unit?: string; category?: string }) }));
  const { upserts, deletes } = diffCatalogCopy(catalog, copy);
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [
    ...upserts.map((u) => (b: ReturnType<typeof writeBatch>) => b.set(doc(catalogCopyCol(db, shareId), u.id), { ...u.data, updatedAt: serverTimestamp() })),
    ...deletes.map((id) => (b: ReturnType<typeof writeBatch>) => b.delete(doc(catalogCopyCol(db, shareId), id))),
  ];
  await commitChunks(db, ops);
  return ops.length;
}

/** AC-4: whole copy at share time, read from the owner's catalog. */
export async function writeCatalogCopyIn(db: Firestore, ownerUid: string, shareId: string) {
  const snap = await getDocs(catalogCol(db, ownerUid));
  const catalog = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CatalogSource[];
  return syncCatalogCopyIn(db, shareId, catalog);
}

/** Revoke cleanup: the copy goes with the share (rules allow the household to delete while REVOKED). */
export async function deleteCatalogCopyIn(db: Firestore, shareId: string) {
  const snap = await getDocs(catalogCopyCol(db, shareId));
  await commitChunks(db, snap.docs.map((d) => (b) => b.delete(d.ref)));
  return snap.size;
}

