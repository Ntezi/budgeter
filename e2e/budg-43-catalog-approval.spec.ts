// BUDG-43 e2e: items added from a list wait "to approve" in the catalog (AC-1, AC-3), the chef searches the
// owner's catalog on the shared list and adds from it (AC-4), a chef-added item reaches the owner's catalog
// (AC-2), and no price reaches the chef: every response body and the DOM are checked (AC-6).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { EVIDENCE, FIRESTORE, listIds, reseed, shot, signIn } from './helpers';

const CHEF = { email: 'chef@example.test', password: 'seed-chef-pass' };
const PRICE = 73194; // seeded below on the owner's catalog and a private list item: must never reach the chef
const PRICE_FORMS = ['73194', '73,194', '73 194', '731.94'];
const PRICE_WORDS = ['lastPrice', 'priceHistory', 'actualPrice', 'plannedTotal', 'actualTotal', 'assignedPlanItem', 'last 7'];
const str = (f: any, k: string) => f?.[k]?.stringValue;
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function patch(docPath: string, fields: Record<string, unknown>) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const res = await fetch(`${FIRESTORE}/${docPath}?${mask}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields }) });
  expect(res.ok, `seed ${docPath}`).toBe(true);
}
async function copyNames() {
  const body = (await fetch(`${FIRESTORE}/sharedLists/share-weekly/catalog?pageSize=300`, { headers: admin }).then((r) => r.json())) as any;
  return (body.documents ?? []).map((d: any) => ({ name: str(d.fields, 'name'), keys: Object.keys(d.fields).sort() }));
}
async function openList(page: Page, name: string) {
  await page.goto('/shopping');
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByPlaceholder('Add item...')).toBeVisible();
}
async function addNew(page: Page, name: string) {
  await page.getByPlaceholder('Add item...').fill(name);
  await page.getByText(`Add "${name}"`, { exact: true }).click();
  await expect(page.getByLabel('Item name')).toHaveValue(name);
  await page.getByText('Add to list', { exact: true }).click();
  await expect(page.getByLabel('Item name')).toHaveCount(0);
}

test('BUDG-43: to approve, chef search from the owner catalog, no price reaches the chef', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  reseed();
  await patch('users/seed-owner/shoppingCatalog/tomatoes', { lastPrice: { integerValue: String(PRICE) } });
  const weekly = await listIds('shoppingLists', 'list-weekly', 'items');
  await patch(`users/seed-owner/shoppingLists/list-weekly/items/${weekly[0].id}`, { price: { integerValue: String(PRICE) } });
  const viewport = testInfo.project.use.viewport!;
  const household = await (await browser.newContext({ baseURL, viewport })).newPage();
  const guardH = await signIn(household, testInfo);

  // AC-1: a new item from a list lands in the catalog as pending, usable on the list at once
  await openList(household, 'Weekend party');
  await addNew(household, 'Papaya');
  await addNew(household, 'Basil');
  await expect.poll(async () => (await listIds('shoppingCatalog')).filter((c) => c.fields.pending?.booleanValue === true).map((c) => str(c.fields, 'name')).sort()).toEqual(['Basil', 'Papaya']);
  const papaya = (await listIds('shoppingCatalog')).find((c) => str(c.fields, 'name') === 'Papaya')!;
  expect(str(papaya.fields, 'addedFrom')).toBe('shopping-list');
  expect(str(papaya.fields, 'addedBy')).toBe('seed-owner');
  expect(str(papaya.fields, 'sourceListName')).toBe('Weekend party');
  expect((await listIds('shoppingLists', 'list-party', 'items')).find((i) => str(i.fields, 'name') === 'Papaya')?.fields.catalogItemId?.stringValue).toBe(papaya.id);
  await shot(household, testInfo, 'AC-1-pending-item-on-list');

  // AC-6 recorder on the chef: every response body and the DOM after each step
  const chefCtx = await browser.newContext({ baseURL, viewport });
  const chef = await chefCtx.newPage();
  const bodies: { url: string; body: string }[] = [];
  chef.on('response', async (r) => {
    try {
      bodies.push({ url: r.url(), body: await r.text() });
    } catch {
      /* redirects and aborted streams have no body */
    }
  });
  // Firestore's Listen channel is a long-lived stream whose body Playwright cannot read until it ends:
  // Chromium's DevTools protocol streams every chunk the page receives (Network.streamResourceContent).
  const cdp = await chefCtx.newCDPSession(chef);
  const chunks = new Map<string, { url: string; parts: string[] }>();
  cdp.on('Network.responseReceived', async (e: any) => {
    if (!e.response.url.includes(`:${new URL(FIRESTORE).port}/`)) return;
    const row = { url: e.response.url, parts: [] as string[] };
    chunks.set(e.requestId, row);
    try {
      const r: any = await cdp.send('Network.streamResourceContent' as any, { requestId: e.requestId } as any);
      if (r?.bufferedData) row.parts.push(Buffer.from(r.bufferedData, 'base64').toString('utf8'));
    } catch {
      /* finished before streaming started: the response listener has its body */
    }
  });
  cdp.on('Network.dataReceived', (e: any) => {
    const row = chunks.get(e.requestId);
    if (row && e.data) row.parts.push(Buffer.from(e.data, 'base64').toString('utf8'));
  });
  await cdp.send('Network.enable');
  const streamed = async () => [...chunks.values()].map((r) => ({ url: r.url, body: r.parts.join('') }));
  const doms: string[] = [];
  const snap = async () => doms.push(await chef.content());
  const guardC = await signIn(chef, testInfo, CHEF);
  await chef.getByText('Weekly groceries', { exact: true }).first().click();
  await expect(chef.getByPlaceholder('Add item...')).toBeVisible();
  await snap();

  // AC-4: the chef types and picks the owner's catalog item (name, unit, category come with it)
  await chef.getByPlaceholder('Add item...').fill('Toma');
  await expect(chef.getByRole('button', { name: 'Add Tomatoes' })).toBeVisible();
  await snap();
  await shot(chef, testInfo, 'AC-4-chef-search-owner-catalog');
  await chef.getByRole('button', { name: 'Add Tomatoes' }).click();
  await expect(chef.getByText('Tomatoes', { exact: true }).first()).toBeVisible();
  // AC-2: a typed name with no match is added as new
  await chef.getByPlaceholder('Add item...').fill('Okra');
  await chef.getByText('Add "Okra"', { exact: true }).click();
  await expect(chef.getByText('Okra', { exact: true }).first()).toBeVisible();
  await snap();
  await shot(chef, testInfo, 'AC-4-chef-added-from-catalog-and-new');

  // AC-2: the household client (list open) turns the chef's new item into a pending entry; Tomatoes matched, none
  await openList(household, 'Weekly groceries');
  await expect.poll(async () => (await listIds('shoppingCatalog')).filter((c) => str(c.fields, 'addedFrom') === 'chef').map((c) => str(c.fields, 'name'))).toEqual(['Okra']);
  expect((await listIds('shoppingCatalog')).filter((c) => /tomato/i.test(str(c.fields, 'name') || '')).length).toBe(1);

  // AC-3: To approve section, origin lines, badge, actions
  await household.goto('/shopping-items');
  await expect(household.getByTestId('catalog-pending')).toBeVisible();
  await expect(household.getByText('To approve (3)').first()).toBeVisible();
  await expect(household.getByText(/Added from Weekend party/).first()).toBeVisible();
  await expect(household.getByText(/Added by the chef on Weekly groceries/)).toBeVisible();
  const sw = await household.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(sw.scrollWidth).toBeLessThanOrEqual(sw.innerWidth);
  await shot(household, testInfo, 'AC-3-to-approve');
  await household.getByRole('button', { name: 'Approve Papaya' }).click();
  await expect.poll(async () => (await listIds('shoppingCatalog')).find((c) => c.id === papaya.id)?.fields.pending?.booleanValue).toBe(false);
  await household.getByRole('button', { name: 'Use existing for Basil' }).click();
  await household.getByLabel('Search existing items').fill('Tomat');
  await shot(household, testInfo, 'AC-3-use-existing-sheet');
  await household.getByRole('button', { name: 'Use Tomatoes' }).click();
  await expect.poll(async () => (await listIds('shoppingLists', 'list-party', 'items')).find((i) => str(i.fields, 'name') === 'Basil')?.fields.catalogItemId?.stringValue).toBe('tomatoes');
  await household.getByRole('button', { name: 'Remove Okra' }).click();
  await expect(household.getByTestId('catalog-pending')).toHaveCount(0);
  const cat = await listIds('shoppingCatalog');
  expect(cat.some((c) => ['Basil', 'Okra'].includes(str(c.fields, 'name')))).toBe(false);
  expect(cat.find((c) => c.id === 'tomatoes')?.fields.lastPrice?.integerValue).toBe(String(PRICE));
  await shot(household, testInfo, 'AC-3-after-actions');
  // AC-4: the copy follows the catalog from the Catalog page (Papaya in, Basil/Okra out), keys only name/unit/category/updatedAt
  await expect.poll(async () => (await copyNames()).map((c: any) => c.name).sort()).toEqual(['Papaya', 'Rice 1 kg', 'Rice 5 kg', 'Tomatoes']);
  for (const c of await copyNames()) expect(c.keys).toEqual(['category', 'name', 'unit', 'updatedAt']);

  // AC-6: nothing price-like reached the chef, in any response body or in the DOM
  await snap();
  // Price values: every body (the app bundle included) and the DOM. Price field names: Firestore data and the DOM
  // (the bundle's source code names those fields, so it is left out of the word check only).
  bodies.push(...(await streamed()).map((b) => ({ url: b.url.startsWith('http') ? b.url : new URL(b.url, baseURL).href, body: b.body })));
  const all = [...bodies.map((b) => b.body), ...doms].join('\n');
  const data = [...bodies.filter((b) => b.url.includes(`:${new URL(FIRESTORE).port}/`)).map((b) => b.body), ...doms].join('\n');
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `AC-6-chef-response-urls-${testInfo.project.name}.json`), JSON.stringify(bodies.map((b) => ({ url: b.url.split('?')[0], bytes: b.body.length, hasCopy: b.body.includes('Rice 5 kg') })), null, 2));
  expect(bodies.some((b) => b.url.includes(`:${new URL(FIRESTORE).port}/`) && b.body.includes('Rice 5 kg')), 'positive control: the copy is in the recorded Firestore bodies').toBe(true);
  for (const needle of PRICE_FORMS) expect(all.includes(needle), `chef saw "${needle}"`).toBe(false);
  for (const needle of PRICE_WORDS) expect(data.includes(needle), `chef data had "${needle}"`).toBe(false);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `AC-6-chef-recording-${testInfo.project.name}.json`), JSON.stringify({ responses: bodies.length, firestoreBytes: data.length, bytes: all.length, needles: [...PRICE_FORMS, ...PRICE_WORDS], found: [] }, null, 2));
  guardH.assertOnlyLoopback();
  guardC.assertOnlyLoopback();
});
