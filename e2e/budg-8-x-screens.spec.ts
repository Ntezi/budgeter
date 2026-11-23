// BUDG-8 lane X: S4 Home, S9 Activity, S8 Accounts at 320/390/768/1024/1440 px, light and dark.
// Emulator app only (helpers.signIn aborts any other host). Screenshots: <slice>-<what>-w<width>-<theme>.png.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addMonthsToId, monthIdFromDate, monthTitle } from '../lib/rules/months';
import { EVIDENCE, listIds, noPageScroll, reseed, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const PREV = addMonthsToId(CUR, -1); // seeded Closed
const WIDTHS = [320, 390, 768, 1024, 1440];
const THEMES = ['light', 'dark'] as const;
const results: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'lane-X-measurements.json'), JSON.stringify(results, null, 2));
});

async function snap(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function open(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.goto(route);
  await expect(page.getByTestId('add-button').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1200);
}

/** Visible pressables under `scope` smaller than 44 x 44 px. */
async function smallTargets(scope: Locator) {
  return scope.locator('[role=button], [role=link], a, [tabindex="0"]').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30), ...((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) }))
      .filter((r) => r.w < 44 || r.h < 44)
  );
}

/** Text nodes showing money that are cut (wider content than box). */
async function clippedMoney(page: Page) {
  return page.getByRole('main').locator('div[dir="auto"]').evaluateAll((els) =>
    els
      .filter((el) => /GHS|RWF|\d+\.\d\d/.test(el.textContent || '') && (el as HTMLElement).offsetParent !== null)
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && !/\s/.test((el.textContent || '').trim().replace(/^[^\d-−]*/, '')))
      .map((el) => (el.textContent || '').trim().slice(0, 40))
  );
}

async function matrix(page: Page, slice: string, what: string, route: string, ready: (p: Page) => Promise<void>) {
  for (const theme of THEMES) {
    await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    for (const width of WIDTHS) {
      await open(page, route, width);
      await ready(page);
      const key = `${slice}-${what}-w${width}-${theme}`;
      const scroll = await noPageScroll(page);
      const clipped = await clippedMoney(page);
      const small = width < 768 ? await smallTargets(page.getByRole('main')) : [];
      results[key] = { scroll, clipped, small };
      await snap(page, key);
      expect.soft(scroll.scrollWidth, `${key} page scroll`).toBeLessThanOrEqual(scroll.innerWidth);
      expect.soft(clipped, `${key} clipped amounts`).toEqual([]);
      expect.soft(small, `${key} targets under 44 px`).toEqual([]);
    }
  }
  await page.evaluate(() => window.localStorage.setItem('budgeter:theme', 'light'));
}

test('S4 Home: summary first, chips, Needs you, Recent, Accounts at 5 widths light and dark', async ({ page }, info) => {
  test.setTimeout(600_000);
  const guard = await signIn(page, info);
  const periodsBefore = (await listIds('periods')).map((p) => p.id).sort();
  const txBefore = (await listIds('periods', CUR, 'transactions')).length;
  await matrix(page, 'S4', 'home', `/dashboard?month=${CUR}`, async (p) => {
    await expect(p.getByTestId('home-summary')).toBeVisible();
    await expect(p.getByText(`Left to spend in ${monthTitle(CUR).split(' ')[0]}`)).toBeVisible();
    // Needs-you labels are sentences: never cut (no ellipsis, no clamp) at any width.
    const cut = await p.getByTestId('home-needs-you-label').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map((el) => (el.textContent || '').slice(0, 40))
    );
    expect.soft(cut, `Needs-you labels truncated at ${p.viewportSize()?.width}`).toEqual([]);
  });

  // Main thing first: the summary is the first card in main, above Recent.
  await open(page, `/dashboard?month=${CUR}`, 390);
  const sumBox = await page.getByTestId('home-summary').boundingBox();
  const recentBox = await page.getByTestId('home-recent').boundingBox();
  expect(sumBox!.y).toBeLessThan(recentBox!.y);
  // Details disclosure holds income / saved.
  await page.getByTestId('home-summary').getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('home-summary-details').getByText('Income planned')).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, 'S4-home-details-open-w390-light.png'), fullPage: true });

  // Chips open Activity filtered (Shop keeps BUDG-1 AC-6).
  await page.getByRole('link', { name: /^Shopping spend/ }).click();
  await expect(page).toHaveURL(new RegExp(`month=${CUR}.*scope=SHOPPING`));
  await open(page, `/dashboard?month=${CUR}`, 390);
  await page.getByRole('link', { name: /^Needs spend/ }).click();
  await expect(page).toHaveURL(new RegExp(`month=${CUR}.*group=NEED`));

  // States: closed month, missing month (never created), no plan.
  await open(page, `/dashboard?month=${PREV}`, 390);
  await expect(page.getByTestId('home-summary').getByText('Closed', { exact: true })).toBeVisible();
  await expect(page.getByText(`${monthTitle(PREV).split(' ')[0]} (closed)`)).toBeVisible();
  await snap(page, 'S4-closed-month-w390-light');
  await open(page, '/dashboard?month=2030-01', 390);
  await expect(page.getByText('No plan for January yet.')).toBeVisible();
  await snap(page, 'S4-no-plan-w390-light');
  await page.getByRole('button', { name: 'Plan January' }).click();
  await expect(page).toHaveURL(/\/budgets\/2030-01/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard?month=${CUR}`);
  await page.screenshot({ path: path.join(EVIDENCE, 'S4-loading-w390-light.png') }); // first paint, before data

  // Tap counts (phone): Home -> expense form 1; Home -> shopping spend 1; Home -> accounts 1.
  results.S4taps = { addExpense: 1, shoppingSpend: 1, accounts: 1 };
  // C-10: Home reads only.
  expect((await listIds('periods')).map((p) => p.id).sort(), 'Home never creates a month').toEqual(periodsBefore);
  expect((await listIds('periods', CUR, 'transactions')).length).toBe(txBefore);
  guard.assertOnlyLoopback();
});

test('S9 Activity: day-grouped list, chips, search, detail sheet, delete confirm, closed month read-only', async ({ page }, info) => {
  test.setTimeout(600_000);
  const guard = await signIn(page, info);
  const txBefore = (await listIds('periods', CUR, 'transactions')).length;
  await matrix(page, 'S9', 'activity', `/transactions?month=${CUR}`, async (p) => {
    await expect(p.getByTestId('activity-list')).toBeVisible();
  });
  await open(page, `/transactions?month=${CUR}`, 390);
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('activity-spent').click();
  await expect(page.getByTestId('activity-totals').getByText('Needs')).toBeVisible();
  await page.getByTestId('activity-chips').getByRole('button', { name: 'Wants', exact: true }).click();
  await expect(page.getByText('Dinner', { exact: true })).toBeVisible();
  await expect(page.getByText('Rent', { exact: true })).toHaveCount(0);
  await page.getByPlaceholder('Search').fill('zzz-no-match');
  await expect(page.getByTestId('activity-empty-filter')).toBeVisible();
  await snap(page, 'S9-empty-filter-w390-light');
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.getByText('Rent', { exact: true })).toBeVisible();
  // Detail sheet: delete asks first and Keep writes nothing; Escape closes.
  await page.getByText('Rent', { exact: true }).first().click();
  await page.getByLabel('Delete transaction').click();
  await expect(page.getByTestId('activity-delete-confirm')).toContainText("This can't be undone.");
  await snap(page, 'S9-delete-confirm-w390-light');
  await page.getByRole('button', { name: 'Keep' }).click();
  await page.keyboard.press('Escape');
  expect((await listIds('periods', CUR, 'transactions')).length).toBe(txBefore);
  // Home group chip lands on the filtered list.
  await open(page, `/transactions?month=${CUR}&group=NEED`, 390);
  await expect(page.getByTestId('activity-chips').getByRole('button', { name: 'Needs', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Closed month: read-only notice, no delete in the sheet.
  await open(page, `/transactions?month=${PREV}`, 390);
  await expect(page.getByText(`${monthTitle(PREV).split(' ')[0]} is closed. You can read it, not change it.`)).toBeVisible();
  await snap(page, 'S9-closed-month-w390-light');
  // Empty month: not reachable with seed data, the screen falls back to an existing month when the
  // viewed month has no period (existing transactions.tsx behaviour, left unchanged); see lane X notes.
  results.S9taps = { findShoppingSpendFromHome: 1, attachReceipt: 2, addExpenseAnyScreen: 'shell + (S3)' };
  guard.assertOnlyLoopback();
});

test('S8 Accounts: balances, detail, Move money (pre-fill, cap, explicit Save), Add sheet segment', async ({ page }, info) => {
  test.setTimeout(600_000);
  const guard = await signIn(page, info);
  await matrix(page, 'S8', 'accounts', '/accounts', async (p) => {
    await expect(p.getByTestId('accounts-list')).toBeVisible();
  });
  await matrix(page, 'S8', 'detail', '/accounts?id=acc-household', async (p) => {
    await expect(p.getByTestId('account-detail').first()).toBeVisible();
  });

  // Four accounts on one screen at 390 without scrolling.
  await open(page, '/accounts', 390);
  const rows = page.getByTestId('accounts-list').locator('[data-testid^="account-row-"]');
  expect(await rows.count()).toBeGreaterThanOrEqual(4);
  for (const box of await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom))) expect(box).toBeLessThanOrEqual(844);

  // Detail: Accounts (1) -> row (2) -> Move money (3) -> To (4) -> amount -> Move money (5).
  const txBefore = await listIds('periods', CUR, 'transactions');
  await page.getByTestId('account-row-acc-household').click();
  await expect(page).toHaveURL(/id=acc-household/);
  await expect(page.getByTestId('account-month').getByText('Set aside for plans')).toBeVisible();
  await page.getByTestId('detail-move').click();
  const sheet = page.getByTestId('move-sheet');
  await expect(page.getByTestId('move-form')).toBeVisible();
  await expect(page.getByTestId('move-from').getByRole('radio', { checked: true })).toHaveAccessibleName(/Household account/);
  await page.getByTestId('move-to').getByRole('radio').first().click();
  const toName = ((await page.getByTestId('move-to').getByRole('radio', { checked: true }).getAttribute('aria-label')) || '').replace(/^To /, '');
  await page.getByTestId('move-amount').fill('99999999');
  await expect(page.getByText(/Household account has .* free to move\./)).toBeVisible();
  await expect(page.getByTestId('move-save')).toBeDisabled();
  await page.getByTestId('move-amount').fill('1.00');
  await expect(page.getByTestId('move-summary')).toHaveText(new RegExp(`^Moves .*1\\.00 from Household account to ${toName} · \\d{4}-\\d\\d-\\d\\d · ${monthTitle(CUR)}$`));
  await snap(page, 'S8-move-money-w390-light');
  await page.getByTestId('move-save').click();
  await expect(sheet).toBeHidden();
  const txAfter = await listIds('periods', CUR, 'transactions');
  expect(txAfter.length).toBe(txBefore.length + 1);
  const added = txAfter.find((r) => !txBefore.some((b) => b.id === r.id))!;
  expect(added.fields.type?.stringValue).toBe('TRANSFER');
  expect(Number(added.fields.amount?.doubleValue ?? added.fields.amount?.integerValue)).toBe(1);
  expect(added.fields.paidFromAccountId?.stringValue).toBe('acc-household');
  expect(added.fields.note?.stringValue).toBe('Account transfer from Household account');

  // Escape closes the sheet and returns focus to the trigger; nothing written.
  await page.getByTestId('detail-move').click();
  await expect(page.getByTestId('move-form')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('move-form')).toBeHidden();
  await expect(page.getByTestId('detail-move')).toBeFocused();
  // Back from detail returns to the list.
  await page.goBack();
  await expect(page.getByTestId('accounts-list')).toBeVisible();

  // Money to move row (when seed has a short account) pre-fills To and amount: Accounts, row, Move = 3 taps.
  const toMove = page.getByTestId('accounts-to-move');
  results.S8taps = { seeBalances: 1, fundShortAccount: (await toMove.count()) ? 3 : null, fundFromDetail: 5, addAccount: 2 };
  if (await toMove.count()) {
    await toMove.locator('[data-testid^="to-move-"]').first().click();
    await expect(page.getByTestId('move-to').getByRole('radio', { checked: true })).toHaveCount(1);
    await expect(page.getByTestId('move-amount')).not.toHaveValue('');
    await snap(page, 'S8-money-to-move-prefill-w390-light');
    await page.keyboard.press('Escape');
  }

  // Add sheet: Move money segment is the same form, finished in place.
  await page.getByTestId('add-button').first().click();
  await page.getByRole('button', { name: 'Move money', exact: true }).or(page.getByRole('tab', { name: 'Move money' })).first().click();
  await expect(page.getByTestId('move-form')).toBeVisible();
  await expect(page.getByTestId('move-save')).toBeVisible();
  await snap(page, 'S8-add-sheet-move-w390-light');
  await page.keyboard.press('Escape');
  expect((await listIds('periods', CUR, 'transactions')).length).toBe(txAfter.length);

  // States: add-account sheet.
  await page.getByRole('button', { name: 'Add account' }).last().click();
  await expect(page.getByTestId('account-sheet')).toBeVisible();
  await snap(page, 'S8-add-account-w390-light');
  await page.keyboard.press('Escape');
  guard.assertOnlyLoopback();
});
