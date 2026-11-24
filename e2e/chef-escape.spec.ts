// BUDG-6 H-1 / R-1 e2e: the chef view always has a way out. "Leave this list" ends the share (rules: status
// only); "Start my own budget" opens Plan with the New month sheet and creates nothing by itself.
import { expect, test, type Page } from '@playwright/test';
import { FIRESTORE, reseed, signIn } from './helpers';

const CHEF = { email: 'chef@example.test', password: 'seed-chef-pass' };
const SHARE_LIST = 'Weekly groceries';

test.describe.configure({ mode: 'serial' });
test.beforeEach(() => reseed());
test.afterAll(() => reseed());

async function chefPeriodCount() {
  const res = await fetch(`${FIRESTORE}/users/seed-chef/periods`, { headers: { Authorization: 'Bearer owner' } });
  const body = (await res.json()) as { documents?: unknown[] };
  return (body.documents || []).length;
}
async function chefOpensSharedList(page: Page) {
  await expect(page.getByTestId('chef-shell')).toBeVisible({ timeout: 60_000 });
  const leave = page.getByRole('button', { name: 'Leave this list', exact: true });
  if (!(await leave.isVisible())) await page.getByText(SHARE_LIST, { exact: true }).first().click();
  await expect(leave).toBeVisible();
  return leave;
}

test('H-1 chef leaves the shared list, sees Access ended and keeps Start my own budget', async ({ page }, testInfo) => {
  const guard = await signIn(page, testInfo, CHEF);
  await page.goto('/shopping');
  const leave = await chefOpensSharedList(page);
  await leave.click();
  await page.getByRole('button', { name: 'Keep this list' }).click(); // cancel keeps access
  await expect(leave).toBeVisible();
  await leave.click();
  await page.getByRole('button', { name: 'Confirm leave this list' }).click();
  await expect(page.getByTestId('chef-access-ended')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start my own budget' })).toBeVisible();
  expect(await chefPeriodCount()).toBe(0);
  guard.assertOnlyLoopback();
});

test('H-1 Start my own budget opens the New month sheet in the household shell and creates nothing', async ({ page }, testInfo) => {
  const guard = await signIn(page, testInfo, CHEF);
  await page.goto('/shopping');
  await expect(page.getByTestId('chef-shell')).toBeVisible({ timeout: 60_000 });
  const before = await chefPeriodCount();
  await page.getByRole('button', { name: 'Start my own budget' }).click();
  await expect(page).toHaveURL(/\/budgets/, { timeout: 30_000 });
  await expect(page.getByTestId('chef-shell')).toHaveCount(0);
  await expect(page.getByRole('navigation').first()).toBeVisible();
  await expect(page.getByText('New month', { exact: true }).first()).toBeVisible();
  expect(await chefPeriodCount()).toBe(before); // nothing created until the user saves in the sheet
  // The shared list stays reachable from Shopping in the household shell.
  await page.goto('/shopping');
  await expect(page.getByText(SHARE_LIST, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('chef-shell')).toHaveCount(0);
  guard.assertOnlyLoopback();
});
