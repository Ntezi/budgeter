// BUDG-8 lane Z (S10 shopping, S11 chef/share/receipts, Add sheet "Shopping item"): 5 widths,
// light and dark, no page-level horizontal scroll, no clipped amount, 44 px targets below 768,
// Escape/Back/focus, and the household + chef flow in two browser contexts with tap counts.
// Runs against the emulator app only (helpers.signIn aborts any other host).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { EVIDENCE, listIds, noPageScroll, reseed, signIn } from './helpers';

const WIDTHS = [320, 390, 768, 1024, 1440];
const THEMES = ['light', 'dark'] as const;
const CHEF = { email: 'chef@example.test', password: 'seed-chef-pass' };
const pid = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
const results: Record<string, unknown> = {};
const taps: Record<string, number> = {};

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'lane-Z-measurements.json'), JSON.stringify({ results, taps }, null, 2));
});

async function snap(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`) });
}
async function setTheme(page: Page, theme: string) {
  await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
}
async function openShopping(page: Page, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.goto('/shopping');
  await expect(page.getByTestId('shopping-lists')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(600);
}
async function openList(page: Page, name: string) {
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByPlaceholder('Add item...')).toBeVisible();
  await page.waitForTimeout(400);
}
/** Visible pressables under `scope` smaller than 44 x 44 px. */
async function smallTargets(scope: Locator) {
  return scope.locator('[role=button], [role=checkbox], [role=link], a').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30), ...((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) }))
      .filter((r) => r.w < 44 || r.h < 44)
  );
}
/** Money texts that are cut (wider content than their box) anywhere on the page. */
async function clippedAmounts(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('div, span'))
      .filter((el) => el.children.length === 0 && /\d+\.\d{2}/.test(el.textContent || '') && (el as HTMLElement).offsetParent !== null)
      .filter((el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1)
      .map((el) => (el.textContent || '').slice(0, 40))
  );
}

for (const theme of THEMES) {
  test(`S10/S11 household lists, list and sheets at 5 widths, ${theme}`, async ({ page }, info) => {
    test.setTimeout(600_000);
    reseed();
    const guard = await signIn(page, info);
    await setTheme(page, theme);
    for (const width of WIDTHS) {
      const key = `w${width}-${theme}`;
      await openShopping(page, width);
      await snap(page, `S10-lists-${key}`);
      await openList(page, 'Weekly groceries');
      const row = { scroll: await noPageScroll(page), clipped: await clippedAmounts(page), small: width < 768 ? await smallTargets(page.locator('[role=main]').first()) : [] };
      results[`S10-list-${key}`] = row;
      expect.soft(row.scroll.scrollWidth, `scroll ${key}`).toBeLessThanOrEqual(row.scroll.innerWidth);
      expect.soft(row.clipped, `clipped ${key}`).toEqual([]);
      expect.soft(row.small, `targets ${key}`).toEqual([]);
      await snap(page, `S10-list-${key}`);

      // Record expense sheet: Got-it items only, one Save with the Posts to line; nothing posts on open.
      const txBefore = (await listIds('periods', pid, 'transactions')).length;
      await page.getByText('Record expense', { exact: true }).click();
      await expect(page.getByTestId('record-expense-sheet')).toBeVisible();
      await expect(page.getByTestId('record-summary')).toBeVisible();
      expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore);
      results[`S10-record-${key}`] = { scroll: await noPageScroll(page), clipped: await clippedAmounts(page) };
      await snap(page, `S10-record-expense-${key}`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('record-expense-sheet')).toHaveCount(0);

      // Item sheet from a row tap.
      await page.getByTestId('shopping-item').first().getByRole('button').last().click();
      await expect(page.getByLabel('Item name')).toBeVisible();
      await snap(page, `S10-item-sheet-${key}`);
      await page.keyboard.press('Escape');
      await expect(page.getByLabel('Item name')).toHaveCount(0);

      // Receipt sheet (S11), pre-filled from the Got-it items.
      await page.getByText('Add receipt', { exact: true }).click();
      await expect(page.getByTestId('receipt-line').first()).toBeVisible();
      results[`S11-receipt-${key}`] = { scroll: await noPageScroll(page), clipped: await clippedAmounts(page) };
      await snap(page, `S11-receipt-${key}`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('receipt-line')).toHaveCount(0);
    }
    guard.assertOnlyLoopback();
  });
}

test('S10 keyboard, focus return, Back, empty list, list options', async ({ page }, info) => {
  test.setTimeout(300_000);
  reseed();
  const guard = await signIn(page, info);
  await openShopping(page, 390);
  await openList(page, 'Weekly groceries');
  // Escape returns focus to the trigger; Back closes the sheet before leaving the route.
  const trigger = page.getByRole('button', { name: 'Record expense', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('record-expense-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-expense-sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (document.activeElement?.textContent || '').trim())).toBe('Record expense');
  await page.getByLabel('List options').click();
  await expect(page.getByTestId('list-options')).toBeVisible();
  await snap(page, 'S10-list-options-w390-light');
  await page.goBack();
  await expect(page.getByTestId('list-options')).toHaveCount(0);
  await expect(page.getByPlaceholder('Add item...')).toBeVisible(); // still on the list
  // Tab order: the add field comes before the first Got-it circle.
  await page.getByPlaceholder('Add item...').focus();
  const stops: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || (document.activeElement?.textContent || '').trim().slice(0, 30)));
  }
  results['S10-tab-stops-after-add-field'] = stops;
  expect(stops.findIndex((l) => /^(To buy|Got it): /.test(l))).toBeGreaterThanOrEqual(0);
  expect(stops.slice(0, stops.findIndex((l) => /^(To buy|Got it): /.test(l))).every((l) => /^Add$|^To buy|^Got it/.test(l))).toBe(true);
  // Empty list state.
  await page.getByLabel('Back to lists').click();
  await page.getByText('+ New list', { exact: true }).click();
  await page.getByLabel('List name').fill('Lane Z empty');
  await page.getByText('Create list', { exact: true }).click();
  await expect(page.getByTestId('list-empty')).toBeVisible();
  await snap(page, 'S10-state-empty-list-w390-light');
  guard.assertOnlyLoopback();
});

test('S10/S11 household and chef in two contexts, tap counts, Add sheet shopping item', async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000);
  reseed();
  const viewport = { width: 390, height: 844 };
  const household = await (await browser.newContext({ baseURL, viewport })).newPage();
  const guardH = await signIn(household, info);
  const chef = await (await browser.newContext({ baseURL, viewport })).newPage();
  const guardC = await signIn(chef, info, CHEF);
  const txBefore = (await listIds('periods', pid, 'transactions')).length;

  // Chef: one shared list, no prices, no household navigation.
  await chef.goto('/shopping');
  await expect(chef.getByText('Shared with you')).toBeVisible({ timeout: 60_000 });
  await expect(chef.getByRole('navigation')).toHaveCount(0);
  await chef.getByText('Weekly groceries', { exact: true }).click(); // tap 1
  await expect(chef.getByPlaceholder('Add item...')).toBeVisible();
  const chefText = await chef.locator('body').innerText();
  for (const hidden of ['GHS', 'Record expense', 'Add receipt', 'Catalog', 'est.']) expect(chefText).not.toContain(hidden);
  await snap(chef, 'S11-chef-list-w390-light');
  await chef.getByPlaceholder('Add item...').fill('Lemons');
  await chef.getByText('Add', { exact: true }).click(); // tap 2 (+ typing)
  taps['chef-add-item'] = 2;
  await chef.getByLabel('To buy: Lemons').click(); // tick = 1 tap once the list is open
  taps['tick-item'] = 2;
  await expect(chef.getByLabel('Got it: Lemons')).toBeVisible();

  // Household sees it; ticking never posted money.
  await openShopping(household, 390);
  await openList(household, 'Weekly groceries');
  await expect(household.getByLabel('Got it: Lemons')).toBeVisible();
  expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore);
  await snap(household, 'S11-household-sees-chef-w390-light');

  // Add sheet "Shopping item": +, Shopping item, type, tap suggestion (3 taps + typing).
  await household.getByTestId('add-button').first().click();
  await household.getByText('Shopping item', { exact: true }).click();
  await expect(household.getByTestId('add-shopping-item')).toBeVisible();
  await household.getByPlaceholder('Add item...').last().fill('Rice 5');
  await snap(household, 'S10-add-sheet-shopping-item-w390-light');
  await household.getByText('Rice 5 kg', { exact: true }).last().click();
  await expect(household.getByText(/Rice 5 kg added to /)).toBeVisible();
  taps['add-item-from-add-sheet'] = 3;
  expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore);
  await household.keyboard.press('Escape');

  // Share a second list (so the chef keeps one share and stays in the chef shell), then
  // Stop sharing the open one -> the chef sees Access ended.
  await household.getByLabel('Back to lists').click();
  await openList(household, 'Weekend party');
  await household.getByText('Share with chef', { exact: true }).click();
  await household.getByLabel('Chef account ID').fill('seed-chef');
  await snap(household, 'S11-share-sheet-w390-light');
  await household.getByText('Share list', { exact: true }).click();
  await expect(household.getByText('Shared with Chef')).toBeVisible();
  await household.getByLabel('Back to lists').click();
  await openList(household, 'Weekly groceries');
  await household.getByText('Stop sharing', { exact: true }).click();
  await household.getByTestId('confirm-stop-sharing').click();
  await expect(household.getByText('Share with chef', { exact: true })).toBeVisible();
  await expect(chef.getByText('Access ended')).toBeVisible();
  await expect(chef.getByText('Lemons')).toHaveCount(0);
  await snap(chef, 'S11-chef-access-ended-w390-light');
  guardH.assertOnlyLoopback();
  guardC.assertOnlyLoopback();
});
