// BUDG-8 lane Y (S5 Plan Month, S6 lifecycle, S7 Plan Year, S13 Regular costs) at 320/390/768/1024/1440 px,
// light and dark. Emulator app only (helpers.signIn aborts any other host). Screenshots go to BUDG_EVIDENCE_DIR.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addMonthsToId, monthIdFromDate } from '../lib/rules/months';
import { EVIDENCE, listIds, noPageScroll, reseed, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const PREV = addMonthsToId(CUR, -1);
const WIDTHS = [320, 390, 768, 1024, 1440];
const THEMES = ['light', 'dark'] as const;
const results: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'lane-Y-measurements.json'), JSON.stringify(results, null, 2));
});

async function snap(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: false });
}

async function open(page: Page, route: string, width: number, ready: string) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.goto(route);
  await expect(page.getByTestId(ready).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(600);
}

/** Every visible pressable under `scope` is at least 44 x 44 px. */
async function smallTargets(scope: Locator) {
  return scope.locator('[role=button], [role=link], [role=switch], a, input').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30), ...((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) }))
      .filter((r) => r.w < 44 || r.h < 44)
  );
}

/** Money texts (GHS 1,234.00 / ₵ / 1,234.00) that are cut: wider than their box or past the viewport edge. */
async function clippedAmounts(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('div[dir], div').forEach((el) => {
      if (el.children.length) return;
      const t = (el.textContent || '').trim();
      if (!/\d[\d,]*\.\d\d/.test(t) || (el as HTMLElement).offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 || r.right > window.innerWidth + 1) out.push(t.slice(0, 40));
    });
    return out;
  });
}

for (const theme of THEMES) {
  test(`S5 Plan Month: rows, line sheet, states at 5 widths, ${theme}`, async ({ page }, info) => {
    test.setTimeout(600_000);
    const guard = await signIn(page, info);
    await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    const periodsBefore = (await listIds('periods')).length;
    for (const width of WIDTHS) {
      const key = `w${width}-${theme}`;
      const row: Record<string, unknown> = {};
      await open(page, '/budgets', width, 'month-plan');
      row.planTab = await noPageScroll(page);
      await snap(page, `S5-month-w${width}-${theme}`);
      await open(page, `/budgets/${CUR}`, width, 'month-plan');
      const scroll = await noPageScroll(page);
      expect(scroll.scrollWidth, `page scroll at ${key}`).toBeLessThanOrEqual(scroll.innerWidth);
      expect(await clippedAmounts(page), `clipped amounts at ${key}`).toEqual([]);
      if (width < 768) expect(await smallTargets(page.getByTestId('month-plan')), `small targets at ${key}`).toEqual([]);
      // Line sheet: whole row opens it; Escape closes and focus returns to the row.
      const firstLine = page.locator('[data-testid^="plan-line-"]').first();
      await firstLine.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('line-sheet')).toBeVisible();
      await expect(page.getByTestId('line-sheet').getByText('Planned', { exact: true })).toBeVisible();
      await expect(page.getByTestId('line-sheet').getByText('Spent', { exact: true })).toBeVisible();
      await snap(page, `S5-line-sheet-w${width}-${theme}`);
      if (width < 768) expect(await smallTargets(page.getByTestId('line-sheet')), `sheet targets at ${key}`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('line-sheet')).toHaveCount(0);
      await expect.poll(() => firstLine.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))).toBe(true);
      // Back closes the sheet before leaving the route.
      await firstLine.click();
      await expect(page.getByTestId('line-sheet')).toBeVisible();
      await page.goBack();
      await expect(page.getByTestId('line-sheet')).toHaveCount(0);
      expect(page.url()).toContain(`/budgets/${CUR}`);
      results[key] = { ...row, month: scroll };
    }
    // States, once each at 390: closed month, not started (never created by viewing).
    await open(page, `/budgets/${PREV}`, 390, 'month-plan');
    await expect(page.getByText('Budget is closed (DECIDED) and now view-only.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a need' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close month' })).toHaveCount(0);
    await snap(page, `S5-closed-w390-${theme}`);
    await open(page, '/budgets/2030-01', 390, 'plan-not-started');
    await expect(page.getByText('Create January 2030 draft')).toBeVisible();
    await snap(page, `S5-not-started-w390-${theme}`);
    expect((await listIds('periods')).length).toBe(periodsBefore);
    guard.assertOnlyLoopback();
  });
}

test('S5 tap count: change a line amount from Home = Plan, row, Save (3 taps + typing)', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.getByTestId('bottom-bar')).toBeVisible({ timeout: 60_000 });
  const txBefore = JSON.stringify(await listIds('periods', CUR, 'transactions'));
  let taps = 0;
  await page.getByTestId('bottom-bar').getByText('Plan', { exact: true }).click();
  taps++;
  const row = page.locator('[data-testid^="plan-line-"]').first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  const lineId = ((await row.getAttribute('data-testid')) || '').replace('plan-line-', '');
  await row.click();
  taps++;
  await page.getByLabel('Planned amount').fill('123.45');
  await page.getByRole('button', { name: 'Save changes' }).click();
  taps++;
  await expect(page.getByTestId('line-sheet')).toHaveCount(0);
  await expect.poll(async () => (await listIds('periods', CUR, 'planItems')).find((r) => r.id === lineId)?.fields?.amount).toMatchObject({});
  const saved = (await listIds('periods', CUR, 'planItems')).find((r) => r.id === lineId)?.fields?.amount;
  expect(Number(saved?.doubleValue ?? saved?.integerValue)).toBe(123.45);
  expect(JSON.stringify(await listIds('periods', CUR, 'transactions'))).toBe(txBefore); // editing a line posts nothing
  results.tapCountChangeLineAmount = { taps, before: 7 };
  expect(taps).toBe(3);
  guard.assertOnlyLoopback();
});

test('S6 lifecycle: New month sheet, Close month asks first, Keep open changes nothing', async ({ page }, info) => {
  const guard = await signIn(page, info);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    for (const width of [320, 390, 1440]) {
      await open(page, '/budgets', width, 'month-plan');
      await page.getByLabel('New budget').click();
      await expect(page.getByTestId('new-month-sheet')).toBeVisible();
      await expect(page.getByRole('radio').first()).toBeVisible();
      await snap(page, `S6-new-month-sheet-w${width}-${theme}`);
      if (width < 768) expect(await smallTargets(page.getByTestId('new-month-sheet')), `new month targets at ${width}`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('new-month-sheet')).toHaveCount(0);
    }
  }
  await open(page, `/budgets/${CUR}`, 390, 'month-plan');
  const before = JSON.stringify(await listIds('periods'));
  await page.getByTestId('finish-month').getByRole('button', { name: 'Close month' }).click();
  await expect(page.getByText(/becomes read-only\.$/)).toBeVisible();
  await snap(page, 'S6-close-month-confirm-w390-light');
  await page.getByRole('button', { name: 'Keep open' }).click();
  await expect(page.getByText('You can still change this month.')).toBeVisible();
  expect(JSON.stringify(await listIds('periods'))).toBe(before);
  guard.assertOnlyLoopback();
});

test('S7 Plan Year: Coming up first, months as one list, item sheet at 5 widths', async ({ page }, info) => {
  test.setTimeout(300_000);
  const guard = await signIn(page, info);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    for (const width of WIDTHS) {
      await open(page, '/budgets?view=year', width, 'year-plan-view');
      const scroll = await noPageScroll(page);
      expect(scroll.scrollWidth, `year scroll at ${width}`).toBeLessThanOrEqual(scroll.innerWidth);
      expect(await clippedAmounts(page), `year clipped at ${width}`).toEqual([]);
      const upcomingY = (await page.getByText(/^Upcoming · next/).boundingBox())?.y ?? 0;
      const monthsY = (await page.getByTestId('year-months').boundingBox())?.y ?? 0;
      expect(upcomingY).toBeLessThan(monthsY); // Coming up first
      if (width < 768) expect(await smallTargets(page.getByTestId('year-plan-view')), `year targets at ${width}`).toEqual([]);
      await snap(page, `S7-year-w${width}-${theme}`);
      await page.getByText('Add dated item', { exact: true }).first().click();
      await expect(page.getByTestId('year-item-sheet')).toBeVisible();
      if (width < 768) expect(await smallTargets(page.getByTestId('year-item-sheet')), `item sheet targets at ${width}`).toEqual([]);
      await snap(page, `S7-item-sheet-w${width}-${theme}`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('year-item-sheet')).toHaveCount(0);
    }
  }
  guard.assertOnlyLoopback();
});

// ---- S13 Regular costs (06-expenses-recurring.md) ----
async function docField(collection: string, id: string, name: string) {
  const f = (await listIds(collection)).find((r) => r.id === id)?.fields?.[name];
  return f?.stringValue ?? f?.booleanValue ?? f?.doubleValue ?? f?.integerValue ?? null;
}

test('S13 Regular costs: Categories and Repeats at 5 widths, item sheet, keyboard and Back', async ({ page }, info) => {
  test.setTimeout(600_000);
  const guard = await signIn(page, info);
  for (const theme of THEMES) {
    await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    for (const width of WIDTHS) {
      const key = `S13-w${width}-${theme}`;
      for (const [route, name] of [['/expenses', 'categories'], ['/recurring', 'repeats']] as const) {
        await open(page, route, width, 'regular-costs');
        await expect(page.getByTestId('regular-group-NEED')).toBeVisible();
        const scroll = await noPageScroll(page);
        expect(scroll.scrollWidth, `page scroll ${route} ${key}`).toBeLessThanOrEqual(scroll.innerWidth);
        expect(await clippedAmounts(page), `clipped ${route} ${key}`).toEqual([]);
        if (width < 768) expect(await smallTargets(page.getByTestId('regular-costs')), `targets ${route} ${key}`).toEqual([]);
        await snap(page, `S13-${name}-w${width}-${theme}`);
        results[`${key}-${name}`] = scroll;
      }
      // Item: sheet below 1024 (focus returns, Back closes), inline panel from 1024.
      await open(page, '/expenses', width, 'regular-costs');
      const row = page.getByTestId('regular-row-exp-water');
      await expect(row).toContainText('Default: Household account');
      await row.focus();
      await page.keyboard.press('Enter');
      const form = page.getByTestId(width >= 1024 ? 'regular-item-panel' : 'regular-item-sheet');
      await expect(form).toBeVisible();
      await expect(form.getByText('Paid from', { exact: true })).toBeVisible();
      await expect(form.getByLabel('Amount per month')).toHaveValue('30');
      if (width < 768) expect(await smallTargets(form), `sheet targets ${key}`).toEqual([]);
      await snap(page, `S13-item-sheet-w${width}-${theme}`);
      if (width < 1024) {
        await page.keyboard.press('Escape');
        await expect(form).toHaveCount(0);
        await expect.poll(() => row.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))).toBe(true);
        await row.click();
        await expect(form).toBeVisible();
        await page.goBack();
        await expect(form).toHaveCount(0);
        expect(page.url()).toContain('/expenses');
      }
    }
  }
  // States once each: empty filter on Repeats, Categories | Repeats switch.
  await page.evaluate(() => window.localStorage.setItem('budgeter:theme', 'light'));
  await open(page, '/recurring', 390, 'regular-costs');
  await page.getByRole('button', { name: 'Wants', exact: true }).click();
  await expect(page.getByText('No Wants repeats.')).toBeVisible();
  await snap(page, 'S13-empty-filter-w390-light');
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.getByTestId('regular-row-rec-internet')).toBeVisible();
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await expect(page).toHaveURL(/\/expenses/);
  guard.assertOnlyLoopback();
});

test('S13 tap counts: quick add pre-fills only; default account in 4; pause a repeat in 3', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/expenses');
  await expect(page.getByTestId('regular-costs')).toBeVisible({ timeout: 60_000 });
  // Quick add: "Internet 30" opens the sheet pre-filled; closing it writes nothing.
  const before = (await listIds('expenses')).length;
  await page.getByLabel('Add a cost: name and amount').fill('Gym 30');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const sheet = page.getByTestId('regular-item-sheet');
  await expect(sheet.getByLabel('Name')).toHaveValue('Gym');
  await expect(sheet.getByLabel('Amount per month')).toHaveValue('30');
  await snap(page, 'S13-quick-add-prefill-w390-light');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect((await listIds('expenses')).length).toBe(before);
  // Set a category's default account: row, Paid from, pick, Save = 4 taps.
  let taps = 0;
  await page.getByTestId('regular-row-exp-water').click();
  taps++;
  await sheet.getByText('Household account', { exact: true }).click();
  taps++;
  await sheet.getByText('Cash wallet', { exact: true }).click();
  taps++;
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  taps++;
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => docField('expenses', 'exp-water', 'defaultAccountId')).toBe('acc-cash');
  results.tapCountDefaultAccount = { taps, before: 5 };
  expect(taps).toBe(4);
  // Pause a repeat: row, Active, Save = 3 taps; nothing posted.
  await page.goto('/recurring');
  await expect(page.getByTestId('regular-costs')).toBeVisible({ timeout: 60_000 });
  const tx = JSON.stringify(await listIds('periods', CUR, 'transactions'));
  taps = 0;
  await page.getByTestId('regular-row-rec-internet').click();
  taps++;
  await sheet.getByRole('switch', { name: 'Active' }).click();
  taps++;
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  taps++;
  await expect.poll(() => docField('recurring', 'rec-internet', 'active')).toBe(false);
  await expect(page.getByTestId('regular-row-rec-internet')).toContainText('Paused');
  await snap(page, 'S13-paused-w390-light');
  results.tapCountPauseRepeat = { taps, before: 4 };
  expect(taps).toBe(3);
  expect(JSON.stringify(await listIds('periods', CUR, 'transactions'))).toBe(tx);
  guard.assertOnlyLoopback();
});
