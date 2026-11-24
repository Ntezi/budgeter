// BUDG-43 seed addition (lane-owned, one line in seed.mjs): the price-free catalog copy of the
// seeded share (name, unit, category, updatedAt only), as the household client writes it at share time.
export async function seedBudg43({ db, owner, FieldValue }) {
  const units = ['pc', 'g', 'kg', 'ml', 'l', 'pack'];
  const catalog = await db.collection('users').doc(owner).collection('shoppingCatalog').get();
  const batch = db.batch();
  catalog.forEach((d) => {
    const c = d.data();
    const unit = units.includes(c.variant?.unit) ? c.variant.unit : '';
    batch.set(db.collection('sharedLists').doc('share-weekly').collection('catalog').doc(d.id), {
      name: String(c.name || '').slice(0, 120), unit, category: String(c.category || '').slice(0, 60), updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  console.log(`[seed] BUDG-43: catalog copy of share-weekly (${catalog.size} items, no prices)`);
}
