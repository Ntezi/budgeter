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
