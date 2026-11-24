// BUDG-5 seed additions (lane-owned, called from seed.mjs with one line). Synthetic only
// (SEC-19: no real receipts): two receipts in last month linked to seeded expenses, mixed
// units (5 kg pack, 1 kg, 500 g), one return line, one receipt in another currency.
const line = (lineId, name, quantity, unit, lineTotalMinor, extra = {}) => ({ lineId, name, quantity, unit, lineTotalMinor, ...extra });

export async function seedBudg5({ db, owner, FieldValue, prevPid, day, currency }) {
  const ts = FieldValue.serverTimestamp();
  const u = db.collection('users').doc(owner);
  const receipts = [
    { id: 'seed-rcpt-a', storeName: 'Test Market', purchaseDate: day(5), currencyCode: currency, txId: 'tx-shop-1', lines: [
      line('l1', 'Rice 5 kg', 1, 'pack', 6000, { catalogItemId: 'rice 5 kg', variant: { packSize: 5, unit: 'kg' } }),
      line('l2', 'Tomatoes', 1, 'kg', 450, { catalogItemId: 'tomatoes' }),
      line('l3', 'Tomatoes', 500, 'g', 225, { catalogItemId: 'tomatoes', isReturn: true }),
    ] },
    { id: 'seed-rcpt-b', storeName: 'Border Stall', purchaseDate: day(6), currencyCode: currency === 'USD' ? 'EUR' : 'USD', txId: 'tx-shop-2', lines: [
      line('l1', 'Rice 1 kg', 1, 'kg', 150, { catalogItemId: 'rice 1 kg', promo: true }),
    ] },
  ];
  const batch = db.batch();
  for (const r of receipts) {
    const totalMinor = r.lines.reduce((a, l) => a + (l.isReturn ? -l.lineTotalMinor : l.lineTotalMinor), 0);
    const link = { periodId: prevPid, txId: r.txId, mode: 'EXISTING' };
    const { id, txId, ...rest } = r;
    batch.set(u.collection('receipts').doc(id), { ...rest, status: 'CONFIRMED', totalMinor, link, createdBy: owner, createdAt: ts, updatedAt: ts });
    batch.set(u.collection('receiptLinks').doc(`${prevPid}_${txId}`), { receiptId: id, periodId: prevPid, txId, createdAt: ts });
    for (const l of r.lines) {
      const g = { g: 1, kg: 1000 }[l.variant?.unit || l.unit];
      const baseQty = l.unit === 'pack' ? l.quantity * l.variant.packSize * 1000 : l.quantity * (g || 1);
      batch.set(u.collection('priceObservations').doc(`${id}_${l.lineId}`), {
        receiptId: id, catalogItemId: l.catalogItemId, variantKey: '', currencyCode: r.currencyCode, observedOn: r.purchaseDate,
        lineTotalMinor: l.lineTotalMinor, baseUnit: 'g', baseQty, isReturn: Boolean(l.isReturn), promo: Boolean(l.promo),
        quantity: l.quantity, unit: l.unit, packSize: l.variant?.packSize ?? null, storeName: r.storeName, createdAt: ts,
      });
    }
  }
  await batch.commit();
  console.log('[seed] BUDG-5: 2 receipts (one return line, one other currency), links and price observations');
}
