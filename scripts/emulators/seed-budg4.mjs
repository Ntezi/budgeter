// BUDG-4 seed additions (lane-owned, called from seed.mjs with one line).
// Synthetic only: two more fictional accounts and one ACTIVE share of
// "Weekly groceries" to the seeded chef, with chef-visible fields only (no prices).
export const BUDG4_USERS = {
  stranger: { uid: 'seed-stranger', email: 'stranger@example.test', password: 'seed-stranger-pass', displayName: 'Test Stranger' },
  otherChef: { uid: 'seed-other-chef', email: 'other-chef@example.test', password: 'seed-other-chef-pass', displayName: 'Test Other Chef' },
};

export async function seedBudg4({ auth, db, owner, FieldValue }) {
  for (const u of Object.values(BUDG4_USERS)) await auth.createUser(u);
  const ts = FieldValue.serverTimestamp();
  const shareId = 'share-weekly';
  const listRef = db.collection('users').doc(owner).collection('shoppingLists').doc('list-weekly');
  const batch = db.batch();
  batch.set(db.collection('sharedLists').doc(shareId), {
    ownerUid: owner, listId: 'list-weekly', listName: 'Weekly groceries', chefUid: 'seed-chef', chefLabel: 'Chef',
    status: 'ACTIVE', createdBy: owner, createdAt: ts,
  });
  const items = await listRef.collection('items').get();
  items.forEach((d) => {
    const it = d.data();
    batch.set(db.collection('sharedLists').doc(shareId).collection('items').doc(d.id), {
      name: it.name, quantity: it.quantity ?? 1, category: it.category || '', status: it.bought ? 'GOT_IT' : 'TO_BUY',
      createdBy: owner, updatedBy: owner, createdAt: ts, updatedAt: ts,
    });
  });
  batch.update(listRef, { shareId, sharedWithLabel: 'Chef' });
  await batch.commit();
  console.log('[seed] BUDG-4: 2 more users, 1 ACTIVE share (Weekly groceries -> chef)');
}
