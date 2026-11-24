// BUDG-40 lane A. Runs in w320 / w390 / w1440 (one viewport per project).
// AC-1 (F-1): Home's Accounts figure equals the Accounts headline for the same month; the seeded hand-set
// account shows its hand-set balance, a calculated account shows a non-zero month balance (not 0.00).
// AC-5 (F-6): with six-figure months the Reports trend chart's y-axis labels are whole (not cut on the left).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { fmtMoney } from '../lib/format';
import { addMonthsToId, monthIdFromDate, monthTitle } from '../lib/rules/months';
import { EVIDENCE, FIRESTORE, OWNER, reseed, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const MONEY = /[-−]?(?:[A-Z]{3}\s?)?[\d,]+\.\d\d/;
const BIG = [120345.67, 98000, 110500.5, 87250];

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => reseed()); // the extra months below are for this file only

async function snap(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function open(page: Page, route: string) {
  await page.goto(route);
  await expect(page.getByTestId('add-button').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1200);
}

async function money(page: Page, testId: string) {
  const text = (await page.getByTestId(testId).innerText()).replace(/\s+/g, ' ');
  return text.match(MONEY)?.[0] ?? `no amount in "${text}"`;
}

async function put(docPath: string, fields: Record<string, string | number>) {
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'number' ? { doubleValue: v } : { stringValue: v }])) };
  const res = await fetch(`${FIRESTORE}/users/${OWNER.uid}/${docPath}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  expect(res.ok, `write ${docPath}`).toBe(true);
}

test('AC-1: Home Accounts = Accounts headline; hand-set and calculated balances both shown', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const w = page.viewportSize()!.width;
  const month = monthTitle(CUR).split(' ')[0];
  await open(page, '/accounts');
  await expect(page.getByTestId('accounts-total')).toContainText(`Balance in ${month}`);
  const accountsTotal = await money(page, 'accounts-total');
  // Seed: Cash wallet has a hand-set balance of 180 for this month; Household has none (calculated).
  await expect(page.getByTestId('account-row-acc-cash')).toContainText(fmtMoney(180));
  const household = await money(page, 'account-row-acc-household');
  expect(household, 'calculated balance is not the old 0.00').not.toBe(fmtMoney(0));
  await snap(page, `A1-accounts-w${w}`);
  await open(page, `/dashboard?month=${CUR}`);
  await expect(page.getByTestId('home-accounts')).toContainText(`Balance in ${month}`);
  expect(await money(page, 'home-accounts'), 'Home = Accounts').toBe(accountsTotal);
  await expect(page.getByText(/accounts? (is|are) overdrawn/)).toHaveCount(0); // seed: none below 0
  await snap(page, `A1-home-w${w}`);
  guard.assertOnlyLoopback();
});

test('AC-5: Reports trend y-axis labels are whole with six-figure months', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const w = page.viewportSize()!.width;
  for (let i = 0; i < BIG.length; i++) {
    const id = addMonthsToId(CUR, -(i + 2));
    await put(`periods/${id}`, { title: monthTitle(id), periodId: id, status: 'DECIDED', incomeTotal: 150000 });
    await put(`periods/${id}/transactions/budg40-big`, { name: 'Large month', amount: BIG[i], group: 'NEED', type: 'EXPENSE', date: `${id}-10`, accountId: 'acc-household', paidFromAccountId: 'acc-household', periodId: id });
  }
  await open(page, '/reports');
  const trend = page.getByTestId('report-trend');
  await trend.getByRole('button', { name: '6 months' }).click();
  const line = trend.getByTestId('trend-line');
  await expect(line).toBeVisible({ timeout: 30_000 });
  await line.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  // Every SVG text inside the chart must lie fully inside the chart box and inside the card.
  const report = await line.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const card = (el.closest('[data-testid="report-trend"]') as HTMLElement).getBoundingClientRect();
    return Array.from(el.querySelectorAll('text')).map((t) => {
      const r = t.getBoundingClientRect();
      return { text: (t.textContent || '').trim(), left: Math.round(r.left - Math.max(box.left, card.left)), right: Math.round(Math.min(box.right, card.right) - r.right) };
    });
  });
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `A2-axis-labels-w${w}.json`), JSON.stringify(report, null, 2));
  const yLabels = report.filter((r) => /^-?[\d.]+[kMB]?$/.test(r.text) && !/^[A-Z]/.test(r.text));
  expect(yLabels.map((r) => r.text), 'compact y labels').toEqual(expect.arrayContaining(['0', '100k']));
  for (const r of report) {
    expect.soft(r.left, `label "${r.text}" cut on the left at ${w}`).toBeGreaterThanOrEqual(0);
    expect.soft(r.right, `label "${r.text}" cut on the right at ${w}`).toBeGreaterThanOrEqual(0);
  }
  await line.screenshot({ path: path.join(EVIDENCE, `A2-trend-chart-w${w}.png`) });
  await snap(page, `A2-reports-w${w}`);
  guard.assertOnlyLoopback();
});
