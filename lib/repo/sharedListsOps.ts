// Share / revoke writes (BUDG-4, ADR-3, C-10). Takes the Firestore instance so emulator
// tests can run them. C-10: the private list stays the source of truth; sharing only
// adds docs under sharedLists and two fields on the list doc; nothing is moved or deleted.
import { collection, deleteField, doc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { deleteCatalogCopyIn, writeCatalogCopyIn } from './catalogPendingOps';
import { SHARED_ITEM_FIELDS, toSharedItemFields, type SharedItem, type SharedList } from './sharedListsCore';

/** R-2: a Firestore batch holds at most 500 writes; 400 leaves room and keeps each commit small. */
export const SHARE_CHUNK = 400;
export type ShareWriteOptions = { chunkSize?: number; /** test hook: runs before each item chunk commits */ beforeChunk?: (index: number) => void | Promise<void> };

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export async function shareListWithChefIn(
  db: Firestore,
  ownerUid: string,
  actorUid: string,
  list: { id: string; name: string },
  chefUid: string,
  chefLabel: string,
  opts: ShareWriteOptions = {}
) {
  const label = String(chefLabel || 'Chef').trim().slice(0, 60) || 'Chef';
  const size = Math.max(1, Math.min(opts.chunkSize ?? SHARE_CHUNK, SHARE_CHUNK));
  const shareRef = doc(collection(db, 'sharedLists'));
  // Step 1: the share doc (item rules read it, so items follow in step 2).
  await setDoc(shareRef, {
    ownerUid,
    listId: list.id,
    listName: String(list.name || '').slice(0, 120),
    chefUid: chefUid.trim(),
    chefLabel: label,
    status: 'ACTIVE',
    createdBy: actorUid,
    createdAt: serverTimestamp(),
  } satisfies Omit<SharedList, 'id'>);
  try {
    // Step 2 (R-2): items in chunks under the batch limit.
    const privateItems = await getDocs(collection(db, 'users', ownerUid, 'shoppingLists', list.id, 'items'));
    let index = 0;
    for (const part of chunks(privateItems.docs, size)) {
      await opts.beforeChunk?.(index++);
      const batch = writeBatch(db);
      part.forEach((d) => {
        batch.set(doc(db, 'sharedLists', shareRef.id, 'items', d.id), {
          ...toSharedItemFields(d.data() as any),
          createdBy: actorUid,
          updatedBy: actorUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
    // Step 2b (BUDG-43 AC-4): the price-free copy of the owner's catalog (name, unit, category) for the chef's search.
    await writeCatalogCopyIn(db, ownerUid, shareRef.id);
    // Step 3: the list is marked shared last, only once every item landed.
    await updateDoc(doc(db, 'users', ownerUid, 'shoppingLists', list.id), { shareId: shareRef.id, sharedWithLabel: label });
  } catch (e) {
    // A failure midway must not leave a live share the list does not show: end it so the chef has no access.
    await updateDoc(shareRef, { status: 'REVOKED', revokedAt: serverTimestamp() }).catch(() => undefined);
    throw e;
  }
  return shareRef.id;
}

/**
 * Revoke: status REVOKED first, alone (rules deny the chef on the next request), so a large list can never
 * keep the chef in. Then chef edits are folded back into the private list in chunks under the batch limit:
 * existing items get only the chef-visible fields that changed plus `bought`; their price, plan, tx links
 * and status are untouched. Chef-added items get a private twin. The list's share fields go last. Share
 * docs are kept (household can still read them). A retry repeats the fold safely (same patches).
 */
export async function revokeShareIn(db: Firestore, ownerUid: string, listId: string, shareId: string, opts: ShareWriteOptions = {}) {
  const size = Math.max(1, Math.min(opts.chunkSize ?? SHARE_CHUNK, SHARE_CHUNK));
  await updateDoc(doc(db, 'sharedLists', shareId), { status: 'REVOKED', revokedAt: serverTimestamp() });
  const [shared, priv] = await Promise.all([
    getDocs(collection(db, 'sharedLists', shareId, 'items')),
    getDocs(collection(db, 'users', ownerUid, 'shoppingLists', listId, 'items')),
  ]);
  const privateById = new Map(priv.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const writes: { ref: ReturnType<typeof doc>; data: Record<string, unknown> }[] = [];
  shared.forEach((d) => {
    const data = d.data() as SharedItem;
    const bought = data.status === 'GOT_IT';
    const twin = privateById.get(d.id);
    const ref = doc(db, 'users', ownerUid, 'shoppingLists', listId, 'items', d.id);
    if (twin) {
      const patch: Record<string, unknown> = {};
      for (const key of SHARED_ITEM_FIELDS) {
        if (key === 'status') continue;
        const value = (data as any)[key];
        if (value !== undefined && value !== twin[key] && !(key === 'category' && value === '' && twin[key] === undefined)) patch[key] = value;
      }
      if (Boolean(twin.bought) !== bought) patch.bought = bought;
      if (Object.keys(patch).length) writes.push({ ref, data: patch });
    } else {
      const fields: Record<string, unknown> = {};
      for (const key of SHARED_ITEM_FIELDS) if ((data as any)[key] !== undefined && key !== 'status') fields[key] = (data as any)[key];
      writes.push({ ref, data: { ...fields, bought, status: bought ? 'purchased' : 'planned', ownerUid, source: 'manual', createdAt: serverTimestamp(), updatedAt: serverTimestamp() } });
    }
  });
  let index = 0;
  for (const part of chunks(writes, size)) {
    await opts.beforeChunk?.(index++);
    const batch = writeBatch(db);
    part.forEach((w) => batch.set(w.ref, w.data, { merge: true }));
    await batch.commit();
  }
  await updateDoc(doc(db, 'users', ownerUid, 'shoppingLists', listId), { shareId: deleteField(), sharedWithLabel: deleteField() });
  // BUDG-43: the chef's catalog copy goes with the share (already unreadable to the chef once REVOKED).
  await deleteCatalogCopyIn(db, shareId);
}

/** BUDG-6 H-1: the chef ends a share addressed to them (rules allow only ACTIVE -> REVOKED with revokedAt). */
export async function leaveShareIn(db: Firestore, shareId: string) {
  await updateDoc(doc(db, 'sharedLists', shareId), { status: 'REVOKED', revokedAt: serverTimestamp() });
}
