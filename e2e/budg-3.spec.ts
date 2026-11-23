// BUDG-3 e2e: default accounts with one-line overrides, in the complete web app
// against the local emulators (start with `npm run web:emulators`).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { monthIdFromDate } from '../lib/rules/months';
import { listIds, noPageScroll, reseed, shot, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());

test.describe.configure({ mode: 'serial' });
test.beforeEach(() => reseed());

const field = (row: { fields: Record<string, any> } | undefined, key: string) => row?.fields?.[key]?.stringValue;
const byId = async (id: string, ...segments: string[]) => (await listIds(...segments)).find((r) => r.id === id);

// BUDG-8 S5: the add panel is the "Add a need" sheet; the Reconcile banner sits on the Month view.
async function openSection(page: Page, label: 'Plan' | 'Reconcile') {
  if (label === 'Plan') await page.getByRole('button', { name: 'Add a need' }).click();
  else await expect(page.getByTestId('plan-groups')).toBeVisible();
}

async function pick(page: Page | Locator, triggerText: string | RegExp, optionText: string | RegExp) {
  await page.getByText(triggerText, { exact: typeof triggerText === 'string' }).first().click();
  await page.getByText(optionText, { exact: typeof optionText === 'string' }).last().click();
}

test('AC-2/AC-4 add panel: suggested account pre-filled; archived default asks for a choice', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto(`/budgets/${CUR}`);
  await openSection(page, 'Plan');
  // First active template (Phone plan) has an archived default: no silent switch, a repair prompt.
  await expect(page.getByText('Saved account is archived · choose an account')).toBeVisible();
  await shot(page, info, 'AC-4-add-panel-archived-default-asks-to-choose');
  await pick(page, /^Phone plan ·/, /^Water bill ·/);
  await expect(page.getByText('Default for Water bill: Household account')).toBeVisible();
  await shot(page, info, 'AC-2-add-panel-suggested-account-prefilled');
  const allocBefore = await listIds('periods', CUR, 'allocations');
  await page.getByText('Add cost', { exact: true }).click(); // BUDG-8 S5: was 'Add Template'
  await expect.poll(async () => field(await byId('exp_exp-water', 'periods', CUR, 'planItems'), 'plannedAccountId')).toBe('acc-household');
  const line = await byId('exp_exp-water', 'periods', CUR, 'planItems');
  expect(field(line, 'sourceId')).toBe('exp-water');
  expect(field(line, 'accountChoice')).toBe('DEFAULT');
  const allocAfter = await listIds('periods', CUR, 'allocations');
  expect(allocAfter.length).toBe(allocBefore.length + 1);
  expect(await listIds('periods', CUR, 'transactions')).toHaveLength(5);
  expect((await noPageScroll(page)).scrollWidth).toBeLessThanOrEqual((await noPageScroll(page)).innerWidth);
  guard.assertOnlyLoopback();
});

test('AC-3/AC-6 change a linked line: one clear choice; "Only this month" leaves the default', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto(`/budgets/${CUR}`);
  await openSection(page, 'Plan');
  await pick(page, /^Phone plan ·/, /^Water bill ·/);
  await page.getByText('Add cost', { exact: true }).click(); // BUDG-8 S5: was 'Add Template'
  await expect.poll(async () => field(await byId('exp_exp-water', 'periods', CUR, 'planItems'), 'plannedAccountId')).toBe('acc-household');
  const prevMonth = await listIds('periods'); // includes the locked month
  const txBefore = JSON.stringify(await listIds('periods', CUR, 'transactions'));

  await openSection(page, 'Reconcile');
  await expect(page.getByText('1 line has a suggested account')).toBeVisible();
  await expect(page.getByText(/1 line needs an account choice/)).toBeVisible();
  await shot(page, info, 'AC-2-AC-4-reconcile-banner-suggestion-and-repair');

  await page.getByTestId('plan-groups').getByText('Water bill', { exact: true }).first().click(); // BUDG-8 S5: line sheet at every width
  await pick(page.getByTestId('line-sheet'), 'Household account', 'Savings account');
  await expect(page.getByText('Only this month', { exact: true })).toBeVisible();
  await expect(page.getByText('Also use for future months', { exact: true })).toBeVisible();
  await shot(page, info, 'AC-3-two-choices-at-the-moment-of-change');
  await page.getByText('Only this month', { exact: true }).click();
  await expect.poll(async () => field(await byId('exp_exp-water', 'periods', CUR, 'planItems'), 'plannedAccountId')).toBe('acc-savings');
  expect(field(await byId('exp_exp-water', 'periods', CUR, 'planItems'), 'accountChoice')).toBe('EXPLICIT');
  expect(field(await byId('exp-water', 'expenses'), 'defaultAccountId')).toBe('acc-household');
  expect(JSON.stringify(await listIds('periods', CUR, 'transactions'))).toBe(txBefore);
  expect((await listIds('periods')).length).toBe(prevMonth.length);

  // Second change, this time deliberately updating the future default.
  await page.getByTestId('plan-groups').getByText('Water bill', { exact: true }).first().click();
  await pick(page.getByTestId('line-sheet'), 'Savings account', 'Cash wallet');
  await page.getByText('Also use for future months', { exact: true }).click();
  await expect.poll(async () => field(await byId('exp-water', 'expenses'), 'defaultAccountId')).toBe('acc-cash');
  expect(JSON.stringify(await listIds('periods', CUR, 'transactions'))).toBe(txBefore);
  await shot(page, info, 'AC-3-after-future-default');
  guard.assertOnlyLoopback();
});

test('SEC-21 suggested lines earmark money only through Review → Apply all', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto(`/budgets/${CUR}`);
  await openSection(page, 'Reconcile');
  const allocId = `item_plan_recbudget_plan_rec-internet_${CUR}`;
  expect(await byId(allocId, 'periods', CUR, 'allocations')).toBeUndefined();
  await page.getByTestId('default-accounts-banner').getByText('Review', { exact: true }).click(); // year-plan offers also have Review
  await expect(page.getByText('Apply suggested accounts')).toBeVisible();
  await shot(page, info, 'AC-2-review-suggested-accounts');
  await page.getByText('Apply all', { exact: true }).click();
  await expect.poll(async () => field(await byId(allocId, 'periods', CUR, 'allocations'), 'accountId')).toBe('acc-household');
  expect(await listIds('periods', CUR, 'transactions')).toHaveLength(5);
  guard.assertOnlyLoopback();
});
