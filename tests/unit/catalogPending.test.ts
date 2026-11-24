// BUDG-43 AC-1, AC-2, AC-4: matching, deterministic ids, pending shape, price-free copy and its diff.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chefPendingId, diffCatalogCopy, exactCatalogMatch, pendingFields, pendingOriginLabel, toCatalogCopy,
} from '../../lib/rules/catalogPending';

const catalog = [
  { id: 'rice 5 kg', name: 'Rice 5 kg', category: 'Pantry', lastPrice: 60 },
  { id: 'tomatoes', name: 'Tomatoes', category: 'Produce', lastPrice: 5, aliases: ['Inyanya'] },
  { id: 'c-oil', name: 'Sunflower oil', variant: { packSize: 1, unit: 'l' }, category: 'Pantry', lastPrice: 12 },
];

test('exactCatalogMatch: same name, alias and known spelling match; similar or other pack does not', () => {
  assert.equal(exactCatalogMatch('rice 5 KG', catalog)?.id, 'rice 5 kg');
  assert.equal(exactCatalogMatch('Tomato', catalog)?.id, 'tomatoes');
  assert.equal(exactCatalogMatch('inyanya', catalog)?.id, 'tomatoes');
  assert.equal(exactCatalogMatch('Rice 1 kg', catalog), null);
  assert.equal(exactCatalogMatch('Basmati rice 5 kg', catalog), null);
  assert.equal(exactCatalogMatch('Ice', catalog), null);
});

test('chefPendingId is deterministic per share and item and a valid Firestore id', () => {
  assert.equal(chefPendingId('share-weekly', 'abc123'), chefPendingId('share-weekly', 'abc123'));
  assert.notEqual(chefPendingId('share-weekly', 'abc123'), chefPendingId('share-other', 'abc123'));
  assert.notEqual(chefPendingId('s', 'a'), chefPendingId('s', 'b'));
  assert.ok(!chefPendingId('a/b', 'c/d').includes('/'));
});

test('pendingFields: additive marker with origin, actor and source; empty sources omitted', () => {
  assert.deepEqual(pendingFields({ addedFrom: 'shopping-list', addedBy: 'u1', sourceListId: 'l1', sourceListName: 'Weekly' }, 'TS'), {
    pending: true, addedFrom: 'shopping-list', addedBy: 'u1', addedAt: 'TS', sourceListId: 'l1', sourceListName: 'Weekly',
  });
  assert.deepEqual(Object.keys(pendingFields({ addedFrom: 'chef', addedBy: 'c1', sourceShareId: 's1' }, 1)).sort(), ['addedAt', 'addedBy', 'addedFrom', 'pending', 'sourceShareId']);
  assert.equal(pendingOriginLabel({ addedFrom: 'chef', sourceListName: 'Weekly groceries' }), 'Added by the chef on Weekly groceries');
  assert.equal(pendingOriginLabel({ addedFrom: 'shopping-list', sourceListName: 'Party' }), 'Added from Party');
});

test('toCatalogCopy keeps name, unit, category only (never a price) and bounds them', () => {
  const c = toCatalogCopy(catalog[2] as any)!;
  assert.deepEqual(c, { name: 'Sunflower oil', unit: 'l', category: 'Pantry' });
  assert.deepEqual(Object.keys(toCatalogCopy(catalog[0] as any)!).sort(), ['category', 'name', 'unit']);
  assert.equal(toCatalogCopy({ id: 'x', name: 'Odd', variant: { unit: 'crate' } } as any)!.unit, '');
  assert.equal(toCatalogCopy({ id: 'x', name: 'n'.repeat(200), category: 'c'.repeat(90) } as any)!.name.length, 120);
  assert.equal(toCatalogCopy({ id: 'x', name: '  ' } as any), null);
});

test('diffCatalogCopy: no write when in step; add, rename and delete otherwise; price changes ignored', () => {
  const inStep = catalog.map((r) => ({ id: r.id, ...toCatalogCopy(r as any)! }));
  assert.deepEqual(diffCatalogCopy(catalog as any, inStep), { upserts: [], deletes: [] });
  const priceOnly = catalog.map((r) => ({ ...r, lastPrice: 999 }));
  assert.deepEqual(diffCatalogCopy(priceOnly as any, inStep), { upserts: [], deletes: [] });
  const renamed = [{ ...catalog[0], name: 'Rice 5kg bag' }, catalog[1], { id: 'new', name: 'Salt' }];
  const d = diffCatalogCopy(renamed as any, inStep);
  assert.deepEqual(d.upserts.map((u) => u.id).sort(), ['new', 'rice 5 kg']);
  assert.deepEqual(d.deletes, ['c-oil']);
});
