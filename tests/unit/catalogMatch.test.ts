// BUDG-4 AC-2 / AC-3: catalog reuse and duplicate suggestions, never auto-merged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseProductName, parsePack, planCatalogWrite, searchCatalog, suggestCatalogMatches } from '../../lib/rules/catalogMatch';
import { toSharedItemFields, validateChefUid } from '../../lib/repo/sharedListsCore';
import { shoppingTxId } from '../../lib/repo/shoppingExpense';
import { emulatorPortOffset, emulatorPorts } from '../../lib/emulatorPorts';

const catalog = [
  { id: 'rice 5 kg', name: 'Rice 5 kg' },
  { id: 'rice 1 kg', name: 'Rice 1 kg' },
  { id: 'tomatoes', name: 'Tomatoes' },
  { id: 'c-milk', name: 'Milk', aliases: ['Amata y\'inka'] },
  { id: 'c-oil', name: 'Sunflower oil', variant: { packSize: 1, unit: 'l' } },
];

test('parsePack normalizes kg/g and l/ml', () => {
  assert.deepEqual(parsePack('Rice 1 kg'), { size: 1000, unit: 'g' });
  assert.deepEqual(parsePack('Rice 500g'), { size: 500, unit: 'g' });
  assert.deepEqual(parsePack('Oil', { packSize: 1, unit: 'l' }), { size: 1000, unit: 'ml' });
  assert.equal(parsePack('Tomatoes'), null);
  assert.equal(baseProductName('Rice 5 kg'), 'rice');
});

test('same name, same pack -> same-name, pack equal', () => {
  const [m] = suggestCatalogMatches({ name: 'rice  1 KG' }, catalog);
  assert.equal(m.item.id, 'rice 1 kg');
  assert.equal(m.reason, 'same-name');
  assert.equal(m.packDiffers, false);
});

test('same name, different pack (500 g vs 1 kg / 5 kg) is suggested but flagged as a different pack', () => {
  const matches = suggestCatalogMatches({ name: 'Rice 500 g' }, catalog);
  assert.deepEqual(matches.map((m) => m.item.id).sort(), ['rice 1 kg', 'rice 5 kg']);
  assert.ok(matches.every((m) => m.packDiffers && m.reason === 'same-name'));
});

test('1000 g equals 1 kg (no false "different pack")', () => {
  const [m] = suggestCatalogMatches({ name: 'Rice 1000 g' }, catalog);
  assert.equal(m.item.id, 'rice 1 kg');
  assert.equal(m.packDiffers, false);
});

test('alias: known spelling and stored alias', () => {
  const tom = suggestCatalogMatches({ name: 'Tomato' }, catalog);
  assert.equal(tom[0].item.id, 'tomatoes');
  assert.equal(tom[0].reason, 'alias');
  const inyanya = suggestCatalogMatches({ name: 'Inyanya' }, catalog);
  assert.equal(inyanya[0].item.id, 'tomatoes');
  const milk = suggestCatalogMatches({ name: "amata y'inka" }, catalog);
  assert.equal(milk[0].item.id, 'c-milk');
  assert.equal(milk[0].reason, 'alias');
});

test('similar by token overlap; unrelated names give nothing', () => {
  const m = suggestCatalogMatches({ name: 'Basmati rice 1 kg' }, catalog);
  assert.ok(m.some((x) => x.item.id === 'rice 1 kg' && x.reason === 'similar'));
  assert.deepEqual(suggestCatalogMatches({ name: 'Dish soap' }, catalog), []);
  assert.deepEqual(suggestCatalogMatches({ name: '   ' }, catalog), []);
});

test('explicit variant on the catalog item is compared with the typed unit', () => {
  const [m] = suggestCatalogMatches({ name: 'Sunflower oil 500 ml' }, catalog);
  assert.equal(m.item.id, 'c-oil');
  assert.equal(m.packDiffers, true);
});

test('search reuses catalog items by name and alias', () => {
  assert.deepEqual(searchCatalog('ric', catalog).map((r) => r.id), ['rice 5 kg', 'rice 1 kg']);
  assert.deepEqual(searchCatalog('amata', catalog).map((r) => r.id), ['c-milk']);
  assert.deepEqual(searchCatalog('', catalog), []);
});

test('planCatalogWrite never merges without a choice', () => {
  assert.deepEqual(planCatalogWrite({ kind: 'pick', catalogItemId: 'tomatoes' }, 0), { catalog: 'reuse', catalogItemId: 'tomatoes', addAlias: false });
  assert.deepEqual(planCatalogWrite({ kind: 'use-existing', catalogItemId: 'tomatoes' }, 1), { catalog: 'reuse', catalogItemId: 'tomatoes', addAlias: true });
  assert.deepEqual(planCatalogWrite({ kind: 'keep-separate', saveToCatalog: true }, 2), { catalog: 'create' });
  assert.deepEqual(planCatalogWrite({ kind: 'keep-separate', saveToCatalog: false }, 2), { catalog: 'none' });
  assert.deepEqual(planCatalogWrite({ kind: 'new', saveToCatalog: true }, 0), { catalog: 'create' });
  assert.deepEqual(planCatalogWrite({ kind: 'new', saveToCatalog: false }, 0), { catalog: 'none' });
  assert.throws(() => planCatalogWrite({ kind: 'new', saveToCatalog: true }, 1), /Use existing or Keep separate/);
});

test('toSharedItemFields drops price, actuals, plan and tx links (SEC-10)', () => {
  const out = toSharedItemFields({ name: 'Rice', quantity: 2, unit: 'kg', bought: true, price: 9, actualPrice: 8, assignedTxId: 'tx', assignedPlanItemId: 'p' } as any);
  assert.deepEqual(Object.keys(out).sort(), ['name', 'quantity', 'status', 'unit']);
  assert.equal(out.status, 'GOT_IT');
});

test('validateChefUid refuses own account, members and bad ids', () => {
  assert.match(validateChefUid('', 'o', 'o', []), /account ID/);
  assert.match(validateChefUid('o', 'o', 'o', []), /separate account/);
  assert.match(validateChefUid('m', 'o', 'o', ['m']), /household member/);
  assert.match(validateChefUid('a/b', 'o', 'o', []), /not valid/);
  assert.equal(validateChefUid('chef', 'o', 'o', ['m']), '');
});

test('shoppingTxId is deterministic and refuses unsafe ids', () => {
  assert.equal(shoppingTxId('list-1', 'item_2'), 'shop_list-1_item_2');
  assert.throws(() => shoppingTxId('a/b', 'x'));
});

test('emulator port offset: default unchanged, +100 shifts, bad values throw', () => {
  assert.deepEqual(emulatorPorts(''), { offset: 0, auth: 9099, firestore: 8080, ui: 4000, web: 8081, composeProject: 'budgeta-emulators' });
  assert.deepEqual(emulatorPorts('100'), { offset: 100, auth: 9199, firestore: 8180, ui: 4100, web: 8181, composeProject: 'budgeta-emulators-o100' });
  for (const bad of ['-1', '1001', 'abc', '1e2', '10.5']) assert.throws(() => emulatorPortOffset(bad));
});
