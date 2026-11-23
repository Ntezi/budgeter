// BUDG-4 e2e in the complete web app against the emulators: catalog reuse, new item
// saved to catalog vs list-only, duplicate suggestion, chef (second browser context)
// edits and checks off, household sees it, revoke, chef loses access. No check-off posts money.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { EVIDENCE, listIds, reseed, shot, signIn } from './helpers';

const CHEF = { email: 'chef@example.test', password: 'seed-chef-pass' };
const LIST = 'list-party';
const taps: Record<string, number> = {};
const pid = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
const str = (f: any, k: string) => f?.[k]?.stringValue;

async function items() {
  return listIds('shoppingLists', LIST, 'items');
}
async function openList(page: Page, name: string) {
  await page.goto('/shopping');
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByPlaceholder('Add item...')).toBeVisible();
}
async function startAdd(page: Page, name: string) {
  await page.getByPlaceholder('Add item...').fill(name);
  await page.getByText(`Add "${name}"`, { exact: true }).click();
  await expect(page.getByLabel('Item name')).toHaveValue(name);
}

test.beforeAll(() => reseed());
test.afterAll(({}, testInfo) => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `AC-1-tap-counts-${testInfo.project.name}.json`), JSON.stringify(taps, null, 2));
});

test('BUDG-4 shopping: catalog, duplicates, chef sharing and revoke', async ({ browser, baseURL }, testInfo) => {
  reseed();
  const viewport = testInfo.project.use.viewport!;
  const household = await (await browser.newContext({ baseURL, viewport })).newPage();
  const guardH = await signIn(household, testInfo);
  await openList(household, 'Weekend party');
  const catalogBefore = (await listIds('shoppingCatalog')).length;

  // AC-2 search reuses a catalog item (2 taps: type, pick)
  await household.getByPlaceholder('Add item...').fill('Rice 5');
  await household.getByText('Rice 5 kg', { exact: true }).last().click();
  await expect.poll(async () => (await items()).find((i) => str(i.fields, 'name') === 'Rice 5 kg')?.fields.catalogItemId?.stringValue).toBe('rice 5 kg');
  expect((await listIds('shoppingCatalog')).length).toBe(catalogBefore);
  taps['add-from-catalog'] = 2;
  await shot(household, testInfo, 'AC-2-catalog-reuse');

  // AC-3 duplicate suggestion -> Keep separate, AC-2 saved to the permanent catalog
  await startAdd(household, 'Basmati rice 1 kg');
  await expect(household.getByText('Already in your catalog?')).toBeVisible();
  await expect(household.getByText('Rice 1 kg', { exact: true })).toBeVisible();
  await expect(household.getByText('Add to list', { exact: true })).toBeVisible();
  await shot(household, testInfo, 'AC-3-duplicate-suggestion');
  await household.getByText('Keep separate', { exact: true }).click();
  await household.getByText('Add to list', { exact: true }).click();
  await expect.poll(async () => (await listIds('shoppingCatalog')).length).toBe(catalogBefore + 1);
  expect((await listIds('shoppingCatalog')).some((c) => str(c.fields, 'name') === 'Basmati rice 1 kg')).toBe(true);
  expect((await listIds('shoppingCatalog')).find((c) => c.id === 'rice 1 kg')?.fields.name.stringValue).toBe('Rice 1 kg');
  taps['new-item-keep-separate-save-to-catalog'] = 4;

  // AC-3 alias -> Use existing (no new catalog doc, alias remembered)
  await startAdd(household, 'Tomato');
  await household.getByText('Use existing', { exact: true }).first().click();
  await household.getByText('Add to list', { exact: true }).click();
  await expect.poll(async () => (await items()).find((i) => str(i.fields, 'name') === 'Tomatoes')?.fields.catalogItemId?.stringValue).toBe('tomatoes');
  expect((await listIds('shoppingCatalog')).length).toBe(catalogBefore + 1);
  taps['duplicate-use-existing'] = 4;

  // AC-1 quantity, unit, category, note; AC-2 list-only
  await startAdd(household, 'Dish soap');
  await household.getByLabel('Quantity').fill('2');
  await household.getByText('No unit', { exact: true }).first().click();
  await household.getByText('pack', { exact: true }).click();
  await household.getByLabel('Note').fill('lemon scent');
  await household.getByLabel('Save to catalog').click();
  await expect(household.getByText('List only: the catalog stays unchanged.')).toBeVisible();
  await shot(household, testInfo, 'AC-1-add-item-form');
  await household.getByText('Add to list', { exact: true }).click();
  await expect.poll(async () => str((await items()).find((i) => str(i.fields, 'name') === 'Dish soap')?.fields, 'unit')).toBe('pack');
  const soap = (await items()).find((i) => str(i.fields, 'name') === 'Dish soap')!;
  expect(str(soap.fields, 'note')).toBe('lemon scent');
  expect(soap.fields.catalogItemId?.stringValue).toBe('');
  expect((await listIds('shoppingCatalog')).length).toBe(catalogBefore + 1);
  taps['new-item-qty-unit-note-list-only'] = 8;
  const sw = await household.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(sw.scrollWidth).toBeLessThanOrEqual(sw.innerWidth);
  await shot(household, testInfo, 'AC-1-list-with-new-items');

  // AC-4 share with the chef (separate signed-in account)
  await household.getByText('Share with chef', { exact: true }).click();
  await household.getByLabel('Chef account ID').fill('seed-chef');
  await household.getByText('Share', { exact: true }).click();
  await expect(household.getByText('Shared with Chef')).toBeVisible();
  taps['share-list'] = 3;

  const chefPage = await (await browser.newContext({ baseURL, viewport })).newPage();
  const guardC = await signIn(chefPage, testInfo, CHEF);
  await chefPage.goto('/shopping');
  await expect(chefPage.getByText('Shared with you')).toBeVisible();
  await chefPage.getByText('Weekend party', { exact: true }).click();
  await expect(chefPage.getByText('Juice')).toBeVisible();
  const chefText = await chefPage.locator('body').innerText();
  for (const hidden of ['List total', 'Est.', '/ea', 'Missing unit price', 'Record expense', 'Weekly groceries ·']) expect(chefText).not.toContain(hidden);

  const txBefore = (await listIds('periods', pid, 'transactions')).length;
  await chefPage.getByPlaceholder('Add item...').fill('Ice');
  await chefPage.getByText('Add', { exact: true }).click();
  await chefPage.getByLabel('To buy: Juice').click();
  await expect(chefPage.getByLabel('Got it: Juice')).toBeVisible();
  await chefPage.getByText('Ice', { exact: true }).click();
  await chefPage.getByPlaceholder('Note').fill('two bags');
  await chefPage.getByText('Save', { exact: true }).click();
  await expect(chefPage.getByText('two bags')).toBeVisible();
  await shot(chefPage, testInfo, 'AC-4-chef-edits-and-checks-off');
  taps['chef-add-item'] = 2;
  taps['chef-check-off'] = 1;

  // AC-5 household sees the chef's updates; AC-7 check-off posted nothing
  await expect(household.getByLabel('Got it: Juice')).toBeVisible();
  await expect(household.getByText('Ice', { exact: false }).first()).toBeVisible();
  expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore);
  await household.getByLabel('Got it: Tomatoes').or(household.getByLabel('To buy: Tomatoes')).click();
  expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore);
  await shot(household, testInfo, 'AC-5-household-sees-chef-updates');

  // AC-5 revoke takes effect for the chef
  await household.getByText('Revoke', { exact: true }).click();
  await expect(household.getByText('Share with chef', { exact: true })).toBeVisible();
  await expect(chefPage.getByText('Access ended')).toBeVisible();
  await expect(chefPage.getByText('Juice')).toHaveCount(0);
  await shot(chefPage, testInfo, 'AC-5-chef-access-ended');
  await expect(household.getByText('Ice', { exact: false }).first()).toBeVisible();
  taps['revoke'] = 1;

  guardH.assertOnlyLoopback();
  guardC.assertOnlyLoopback();
});
