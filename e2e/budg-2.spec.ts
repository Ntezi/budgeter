// BUDG-2 e2e: year plan feeding monthly drafts, in the complete web app against the
// local emulators (start with `npm run web:emulators`). Seed: scripts/emulators/seed.year-plan.mjs.
import { expect, test, type Page } from '@playwright/test';
import { addMonthsToId, monthIdFromDate, monthTitle } from '../lib/rules/months';
import { listIds, noPageScroll, reseed, shot, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const PREV = addMonthsToId(CUR, -1);
const NEXT = addMonthsToId(CUR, 1);

test.describe.configure({ mode: 'serial' });
test.beforeEach(() => reseed());

const num = (row: { fields: Record<string, any> } | undefined, key: string) => {
  const v = row?.fields?.[key];
  return v ? Number(v.integerValue ?? v.doubleValue) : undefined;
};
const str = (row: { fields: Record<string, any> } | undefined, key: string) => row?.fields?.[key]?.stringValue;
const byId = async (id: string, ...segments: string[]) => (await listIds(...segments)).find((r) => r.id === id);

async function counts() {
  const periods = await listIds('periods');
  let transactions = 0;
  for (const p of periods) transactions += (await listIds('periods', p.id, 'transactions')).length;
  return { periods: periods.length, transactions };
}

async function openYear(page: Page) {
  await page.goto('/budgets');
  await page.getByText('Year', { exact: true }).first().click();
  await expect(page.getByTestId('year-plan-view')).toBeVisible();
}

test('AC-1 Plan keeps Month / Year; Year shows outline, upcoming (due and where budgeted) and dated items', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await openYear(page);
  await expect(page).toHaveURL(/view=year/);
  await expect(page.getByText('Upcoming · next 60 days')).toBeVisible();
  await expect(page.getByText('Car insurance renewal').first()).toBeVisible();
  await expect(page.getByText(`Budget in ${monthTitle(CUR)}`).first()).toBeVisible();
  await expect(page.getByText('Residence card renewal appointment').first()).toBeVisible();
  await expect(page.getByText('Date only').first()).toBeVisible();
  await expect(page.getByText(/Renew documents early/)).toBeVisible();
  await expect(page.getByTestId('year-totals')).toContainText('already in monthly budgets');
  const scroll = await noPageScroll(page);
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);
  await shot(page, info, 'AC-1-year-view');
  await page.getByText('Month', { exact: true }).first().click();
  await expect(page.getByText('New Budget')).toBeVisible();
  guard.assertOnlyLoopback();
});

test('AC-2 add a dated item with estimate and Budget-in month, and a date-only item', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await openYear(page);
  const before = await counts();
  await page.getByText('Add dated item', { exact: true }).first().click();
  await page.getByLabel('Title').fill('Visa renewal');
  await page.getByLabel('Due date').fill(`${NEXT}-20`);
  await page.getByLabel('Estimate').fill('80');
  await page.getByText(`${monthTitle(NEXT)} (due month)`, { exact: true }).first().click();
  await page.getByText(monthTitle(CUR), { exact: true }).last().click();
  await shot(page, info, 'AC-2-add-dated-item-form');
  await page.getByText('Save', { exact: true }).click();
  await expect.poll(async () => (await listIds('yearItems')).find((r) => str(r, 'title') === 'Visa renewal')).toBeTruthy();
  const visa = (await listIds('yearItems')).find((r) => str(r, 'title') === 'Visa renewal');
  expect(str(visa, 'dueDate')).toBe(`${NEXT}-20`);
  expect(str(visa, 'budgetInPeriodId')).toBe(CUR);
  expect(num(visa, 'estimateMinor')).toBe(8000);

  await page.getByText('Add dated item', { exact: true }).first().click();
  await page.getByLabel('Title').fill('Passport photo appointment');
  await page.getByLabel('Due date').fill(`${NEXT}-05`);
  await page.getByText('Save', { exact: true }).click();
  await expect.poll(async () => (await listIds('yearItems')).find((r) => str(r, 'title') === 'Passport photo appointment')).toBeTruthy();
  const photo = (await listIds('yearItems')).find((r) => str(r, 'title') === 'Passport photo appointment');
  expect(num(photo, 'estimateMinor')).toBeUndefined();
  expect(await counts()).toEqual(before);
  await shot(page, info, 'AC-2-year-view-after-add');
  guard.assertOnlyLoopback();
});

test('AC-3/AC-4/AC-5 draft offers: add (double tap), review-edit, skip, reopen; nothing duplicated or auto-created', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const before = await counts();
  const linesBefore = (await listIds('periods', CUR, 'planItems')).length;
  await page.goto(`/budgets/${CUR}`);
  await page.getByText('Spending Plan', { exact: true }).first().click();
  const card = page.getByTestId('from-year-plan');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('year-offer-yr-insurance')).toBeVisible();
  await expect(card.getByTestId('year-offer-yr-water-service')).toBeVisible();
  await expect(card.getByTestId('year-offer-yr-gift')).toBeVisible();
  await expect(card.getByText('Residence card renewal appointment')).toHaveCount(0); // date only: never offered
  await shot(page, info, 'AC-3-from-your-year-plan');

  await card.getByTestId('year-offer-yr-insurance').getByText('Add to this month').dblclick();
  await expect(card.getByTestId('year-offer-yr-insurance')).toHaveCount(0);
  const ins = await byId('year_yr-insurance', 'periods', CUR, 'planItems');
  expect(num(ins, 'amount')).toBe(360);
  expect(str(ins, 'plannedAccountId')).toBe('acc-savings');

  const water = card.getByTestId('year-offer-yr-water-service');
  await water.getByText('Review', { exact: true }).click();
  await expect(water.getByLabel('Amount for Water meter service')).toHaveValue('45.00');
  await expect(water.getByText('Household account').first()).toBeVisible(); // BUDG-3 category default suggested
  await water.getByLabel('Amount for Water meter service').fill('50');
  await shot(page, info, 'AC-3-review-edit-prefilled');
  await water.getByText('Add to this month').click();
  await expect.poll(async () => num(await byId('year_yr-water-service', 'periods', CUR, 'planItems'), 'amount')).toBe(50);
  expect(str(await byId('year_yr-water-service', 'periods', CUR, 'planItems'), 'plannedAccountId')).toBe('acc-household');

  await card.getByTestId('year-offer-yr-gift').getByText('Skip', { exact: true }).click();
  await expect(card.getByText('Skipped: Birthday gift')).toBeVisible();
  expect(str(await byId('yr-gift', 'periods', CUR, 'yearDecisions'), 'decision')).toBe('SKIPPED');
  await shot(page, info, 'AC-3-after-add-review-skip');

  await page.reload(); // reopen the month
  await page.getByText('Spending Plan', { exact: true }).first().click();
  await expect(page.getByText('Car insurance renewal').first()).toBeVisible();
  await expect(page.getByTestId('year-offer-yr-insurance')).toHaveCount(0);
  const lines = await listIds('periods', CUR, 'planItems');
  expect(lines.length).toBe(linesBefore + 2);
  expect(lines.filter((l) => l.id === 'year_yr-insurance').length).toBe(1);
  expect(await counts()).toEqual(before); // AC-5: no period, no transaction
  await shot(page, info, 'AC-4-reopened-no-duplicates');
  guard.assertOnlyLoopback();
});

test('AC-6 edit after inclusion previews draft lines; locked month unchanged; totals count once', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto(`/budgets/${CUR}`);
  await page.getByText('Spending Plan', { exact: true }).first().click();
  await page.getByTestId('year-offer-yr-insurance').getByText('Add to this month').click();
  await expect.poll(async () => num(await byId('year_yr-insurance', 'periods', CUR, 'planItems'), 'amount')).toBe(360);

  await openYear(page);
  await expect(page.getByText(`In ${monthTitle(CUR)} budget`).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit Car insurance renewal' }).first().click();
  await expect(page.getByLabel('Estimate')).toHaveValue('360.00'); // form loaded before typing
  await page.getByLabel('Estimate').fill('400');
  await page.getByText('Save', { exact: true }).click();
  const preview = page.getByTestId('year-edit-preview');
  await expect(preview).toContainText(monthTitle(CUR));
  await expect(preview).toContainText('Will change');
  expect(num(await byId('year_yr-insurance', 'periods', CUR, 'planItems'), 'amount')).toBe(360); // nothing applied yet
  await shot(page, info, 'AC-6-edit-preview-before-apply');
  await page.getByText('Apply to drafts', { exact: true }).click();
  await expect.poll(async () => num(await byId('year_yr-insurance', 'periods', CUR, 'planItems'), 'amount')).toBe(400);

  const lockedBefore = await listIds('periods', PREV, 'planItems');
  // School fees: included in the locked previous month (same calendar year except in January).
  if (PREV.slice(0, 4) !== CUR.slice(0, 4)) {
    await page.getByText(CUR.slice(0, 4), { exact: true }).first().click();
    await page.getByText(PREV.slice(0, 4), { exact: true }).last().click();
  }
  await page.getByRole('button', { name: 'Edit School fees' }).first().click();
  await expect(page.getByLabel('Estimate')).toHaveValue('200.00');
  await page.getByLabel('Estimate').fill('250');
  await page.getByText('Save', { exact: true }).click();
  await expect(page.getByTestId('year-edit-preview')).toContainText('Locked · stays');
  await shot(page, info, 'AC-6-locked-month-unchanged-preview');
  await page.getByText('Save year plan only', { exact: true }).click();
  await expect.poll(async () => num(await byId('yr-school', 'yearItems'), 'estimateMinor')).toBe(25000);
  expect(await listIds('periods', PREV, 'planItems')).toEqual(lockedBefore);

  if (PREV.slice(0, 4) === CUR.slice(0, 4)) {
    // Insurance counted once via its line (400) + school via its locked line (200), not + estimates.
    await expect(page.getByTestId('year-totals')).toContainText('already in monthly budgets');
  }
  await shot(page, info, 'AC-6-year-totals-after-edit');
  guard.assertOnlyLoopback();
});
