// Share / revoke writes (BUDG-4, ADR-3, C-10). Takes the Firestore instance so emulator
// tests can run them. C-10: the private list stays the source of truth; sharing only
// adds docs under sharedLists and two fields on the list doc; nothing is moved or deleted.
import { collection, deleteField, doc, getDocs, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { SHARED_ITEM_FIELDS, toSharedItemFields, type SharedItem, type SharedList } from './sharedListsCore';

export async function shareListWithChefIn(
  db: Firestore,
  ownerUid: string,
  actorUid: string,
  list: { id: string; name: string },
  chefUid: string,
  chefLabel: string
) {
  const label = String(chefLabel || 'Chef').trim().slice(0, 60) || 'Chef';
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
  const privateItems = await getDocs(collection(db, 'users', ownerUid, 'shoppingLists', list.id, 'items'));
  const batch = writeBatch(db);
  privateItems.forEach((d) => {
    batch.set(doc(db, 'sharedLists', shareRef.id, 'items', d.id), {
      ...toSharedItemFields(d.data() as any),
      createdBy: actorUid,
      updatedBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  batch.update(doc(db, 'users', ownerUid, 'shoppingLists', list.id), { shareId: shareRef.id, sharedWithLabel: label });
  await batch.commit();
  return shareRef.id;
}

/**
 * Revoke: status REVOKED (rules deny the chef on the next request). Chef edits are folded
 * back into the private list: existing items get only the chef-visible fields that changed
 * plus `bought`; their price, plan, tx links and status are untouched. Chef-added items get
 * a private twin. Share docs are kept (household can still read them).
 */
export async function revokeShareIn(db: Firestore, ownerUid: string, listId: string, shareId: string) {
  const [shared, priv] = await Promise.all([
    getDocs(collection(db, 'sharedLists', shareId, 'items')),
    getDocs(collection(db, 'users', ownerUid, 'shoppingLists', listId, 'items')),
  ]);
  const privateById = new Map(priv.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const batch = writeBatch(db);
  batch.update(doc(db, 'sharedLists', shareId), { status: 'REVOKED', revokedAt: serverTimestamp() });
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
      if (Object.keys(patch).length) batch.set(ref, patch, { merge: true });
    } else {
      const fields: Record<string, unknown> = {};
      for (const key of SHARED_ITEM_FIELDS) if ((data as any)[key] !== undefined && key !== 'status') fields[key] = (data as any)[key];
      batch.set(ref, { ...fields, bought, status: bought ? 'purchased' : 'planned', ownerUid, source: 'manual', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  });
  batch.update(doc(db, 'users', ownerUid, 'shoppingLists', listId), { shareId: deleteField(), sharedWithLabel: deleteField() });
  await batch.commit();
}
