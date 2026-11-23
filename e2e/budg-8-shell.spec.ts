// BUDG-8 S1-S3: shared patterns, navigation shell and Add sheet at 320/390/768/1024/1440 px,
// light and dark. Runs against the emulator app only (helpers.signIn aborts any other host).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addMonthsToId, monthIdFromDate, monthTitle } from '../lib/rules/months';
import { EVIDENCE, listIds, noPageScroll, reseed, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const PREV = addMonthsToId(CUR, -1);
const WIDTHS = [320, 390, 768, 1024, 1440];
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const results: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'S1-S3-measurements.json'), JSON.stringify(results, null, 2));
});

const navFor = (w: number) => (w < 768 ? 'bottom-bar' : w < 1024 ? 'side-rail' : 'sidebar');

async function snap(page: Page, name: string, target?: Locator) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(300);
  const file = path.join(EVIDENCE, `${name}.png`);
  if (target) await target.screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: false });
}

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
}

async function open(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.goto(route);
  await expect(page.getByTestId('add-button').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(800);
}

/** Every visible pressable under `scope` is at least 44 x 44 px. */
async function smallTargets(scope: Locator) {
  return scope.locator('[role=button], [role=link], a, [tabindex="0"]').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30), ...((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) }))
      .filter((r) => r.w < 44 || r.h < 44)
  );
}

for (const theme of THEMES) {
  test(`S2/S3 shell and Add sheet at 5 widths, ${theme}`, async ({ page }, info) => {
    test.setTimeout(600_000);
    const guard = await signIn(page, info);
    await setTheme(page, theme);
    for (const width of WIDTHS) {
      const key = `w${width}-${theme}`;
      const row: Record<string, unknown> = {};
      for (const route of ['/dashboard', '/budgets', '/transactions', '/settings']) {
        await open(page, route, width);
        if (theme === 'dark') await expect(page.locator('html.dark, body.dark, .dark').first()).toBeAttached();
        for (const id of ['bottom-bar', 'side-rail', 'sidebar']) {
          await expect(page.getByTestId(id), `${id} at ${width}`).toHaveCount(id === navFor(width) ? 1 : 0);
        }
        await expect(page.getByText('Open navigation')).toHaveCount(0); // no drawer
        await expect(page.getByLabel('Open quick actions')).toHaveCount(0); // no floating button
        row[route] = await noPageScroll(page);
        expect.soft((row[route] as any).scrollWidth, `${route} ${key}`).toBeLessThanOrEqual((row[route] as any).innerWidth);
        await snap(page, `S2-shell${route.replace(/\//g, '-')}-${key}`);
      }
      // Touch targets of the shell controls below 768 px.
      if (width < 768) {
        row.smallShellTargets = [...(await smallTargets(page.getByTestId('bottom-bar'))), ...(await smallTargets(page.getByTestId('top-bar')))];
        expect(row.smallShellTargets, `shell targets ${key}`).toEqual([]);
      }
      // Add sheet from the settings screen: focus, posting line, no overflow, Escape returns focus.
      const add = page.getByTestId('add-button');
      await add.click();
      const sheet = page.getByTestId('add-sheet');
      await expect(sheet).toBeVisible();
      await expect(page.getByTestId('expense-amount')).toBeFocused();
      await page.getByTestId('expense-amount').fill('12.50');
      await page.getByRole('button', { name: 'Groceries', exact: true }).click();
      await expect(page.getByTestId('posts-to')).toContainText(`Posts to ${monthTitle(CUR)} · Household account ·`);
      await expect(page.getByRole('button', { name: 'Save expense' })).toBeEnabled();
      row.sheet = await noPageScroll(page);
      expect.soft((row.sheet as any).scrollWidth, `sheet ${key}`).toBeLessThanOrEqual((row.sheet as any).innerWidth);
      if (width < 768) {
        row.smallSheetTargets = await smallTargets(sheet);
        expect(row.smallSheetTargets, `sheet targets ${key}`).toEqual([]);
      }
      await snap(page, `S3-add-sheet-${key}`);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(add).toBeFocused();
      await expect(page).toHaveURL(/\/settings$/);
      results[key] = row;
    }
    guard.assertOnlyLoopback();
  });
}

test('S3 Back closes an open sheet before leaving the route; ?action=new-expense opens it', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await open(page, '/dashboard', 390);
  await page.getByRole('link', { name: 'Plan' }).click();
  await expect(page).toHaveURL(/\/budgets$/);
  await page.getByTestId('add-button').click();
  await expect(page.getByTestId('add-sheet')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('add-sheet')).toBeHidden();
  await expect(page).toHaveURL(/\/budgets$/);
  await page.getByTestId('more-button').click();
  await expect(page.getByTestId('more-sheet')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('more-sheet')).toBeHidden();
  await expect(page).toHaveURL(/\/budgets$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/shopping?action=new-expense');
  await expect(page.getByTestId('add-sheet')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('add-sheet')).toBeHidden();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('add-sheet')).toBeHidden(); // cleared param does not reopen it
  guard.assertOnlyLoopback();
});

test('S2 reach: Settings in 2 taps on phone and 1 on desktop; active area on nested routes; MonthChip writes only ?month=', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const taps: Record<string, number> = {};
  await open(page, '/dashboard', 390);
  for (const label of ['Home', 'Plan', 'Shopping', 'Accounts']) {
    await page.getByTestId('bottom-bar').getByRole('link', { name: label }).click();
    taps[`phone ${label}`] = 1;
  }
  for (const label of ['Reports', 'Regular costs', 'Catalog', 'Settings']) {
    await page.getByTestId('more-button').click();
    await page.getByTestId('more-sheet').getByRole('button', { name: label }).click();
    await expect(page.getByTestId('more-sheet')).toBeHidden();
    taps[`phone ${label}`] = 2;
  }
  await expect(page).toHaveURL(/\/settings$/);
  await open(page, `/budgets/${CUR}`, 390);
  await expect(page.getByTestId('bottom-bar').getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page');
  await open(page, '/transactions', 390);
  await expect(page.getByTestId('bottom-bar').getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');

  const periodsBefore = (await listIds('periods')).map((p) => p.id).sort();
  await page.getByTestId('month-chip').click();
  await expect(page.getByTestId('month-sheet')).toBeVisible();
  await snap(page, 'S1-month-chip-sheet-w390-light');
  await page.getByTestId('month-sheet').getByRole('button', { name: new RegExp(`^${monthTitle(PREV)}, Closed`) }).click();
  await expect(page).toHaveURL(new RegExp(`month=${PREV}`));
  await expect(page.getByText(`Viewing ${monthTitle(PREV)}.`, { exact: false })).toBeVisible();
  await page.getByTestId('month-chip').click();
  await page.getByTestId('month-sheet').getByRole('button', { name: String(Number(CUR.slice(0, 4)) + 1), exact: true }).click();
  await page.getByTestId('month-sheet').getByRole('button', { name: /Not started$/ }).first().click();
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
  expect((await listIds('periods')).map((p) => p.id).sort(), 'viewing a month never creates it').toEqual(periodsBefore);

  await open(page, '/dashboard', 1440);
  for (const label of ['Home', 'Plan', 'Shopping', 'Accounts', 'Reports', 'Regular costs', 'Catalog', 'Settings']) {
    await page.getByTestId('sidebar').getByRole('link', { name: label }).click();
    taps[`desktop ${label}`] = 1;
  }
  await expect(page).toHaveURL(/\/settings$/);
  await open(page, '/shopping-items', 1440);
  await expect(page.getByTestId('sidebar').getByRole('link', { name: 'Catalog' })).toHaveAttribute('aria-current', 'page');
  results.navTaps = taps;
  guard.assertOnlyLoopback();
});

test('S2/S3 keyboard: sidebar focus order, n opens Add expense, Escape returns focus; bottom bar order', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await open(page, '/settings', 1440);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const order: string[] = [];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || (document.activeElement?.textContent || '').trim()));
  }
  results.sidebarTabOrder = order;
  expect(order).toEqual(['Add expense', 'Home', 'Plan', 'Shopping', 'Accounts', 'Reports', 'Regular costs', 'Catalog', 'Settings']);
  await page.keyboard.press('Enter'); // Settings link via keyboard
  await page.locator('body').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('n');
  await expect(page.getByTestId('add-sheet')).toBeVisible();
  await expect(page.getByTestId('expense-amount')).toBeFocused();
  await page.keyboard.type('7');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-sheet')).toBeHidden();

  await open(page, '/dashboard', 390);
  const barOrder = await page.getByTestId('bottom-bar').locator('[tabindex="0"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  results.bottomBarOrder = barOrder;
  expect(barOrder).toEqual(['Home', 'Plan', 'Add expense', 'Shopping', 'Accounts']);
  guard.assertOnlyLoopback();
});

test('S3 tap count from any screen to a saved expense (phone, 390)', async ({ page }, info) => {
  test.setTimeout(300_000);
  const guard = await signIn(page, info);
  const taps: Record<string, number> = {};
  for (const route of ['/dashboard', '/budgets', '/shopping', '/accounts', '/transactions', '/reports', '/settings']) {
    await open(page, route, 390);
    const before = (await listIds('periods', CUR, 'transactions')).length;
    let n = 0;
    await page.getByTestId('add-button').click(); n++;
    await page.getByTestId('expense-amount').fill('3.25'); // typing, not a tap
    await page.getByRole('button', { name: 'Groceries', exact: true }).click(); n++;
    await page.getByRole('button', { name: 'Save expense' }).click(); n++;
    await expect(page.getByText(`Expense saved to ${monthTitle(CUR)}.`)).toBeVisible();
    await expect(page.getByTestId('add-sheet')).toBeHidden();
    await expect.poll(async () => (await listIds('periods', CUR, 'transactions')).length).toBe(before + 1);
    taps[route] = n;
    if (route === '/dashboard') await snap(page, 'S3-saved-toast-w390-light');
  }
  results.tapsToSavedExpense = taps;
  for (const [route, n] of Object.entries(taps)) expect(n, route).toBe(3);
  guard.assertOnlyLoopback();
});

test('S1 patterns gallery: states at 5 widths in light and dark; sheet focus and Escape', async ({ page }, info) => {
  test.setTimeout(300_000);
  const guard = await signIn(page, info);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/dev-patterns');
      await expect(page.getByTestId('pattern-states')).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(500);
      const r = await noPageScroll(page);
      results[`patterns-w${width}-${theme}`] = r;
      expect.soft(r.scrollWidth, `patterns w${width} ${theme}`).toBeLessThanOrEqual(r.innerWidth);
      await page.screenshot({ path: path.join(EVIDENCE, `S1-patterns-w${width}-${theme}.png`), fullPage: true });
      if (theme === 'light') {
        for (const s of ['empty', 'loading', 'error', 'locked', 'access-ended']) await snap(page, `S1-${s}-w${width}`, page.getByTestId(`state-${s}`));
      }
      if (width < 768) {
        const small = await smallTargets(page.locator('[data-testid^="pattern-"]').filter({ hasNot: page.locator('input') }));
        expect(small, `pattern targets w${width}`).toEqual([]);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole('button', { name: 'Open example sheet' });
  await trigger.click();
  await expect(page.getByTestId('example-sheet')).toBeVisible();
  await expect(page.getByPlaceholder('Focus starts here')).toBeFocused();
  await snap(page, 'S1-sheet-w390-dark');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('example-sheet')).toBeHidden();
  await expect(trigger).toBeFocused();
  guard.assertOnlyLoopback();
});
