import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { addMonthsToId, monthIdFromDate, monthTitle } from '../lib/rules/months';
import { localDateISO } from '../lib/rules/postingMonth';
import { EVIDENCE, listIds, noPageScroll, reseed, shot, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const NEXT = addMonthsToId(CUR, 1);
const PREV = addMonthsToId(CUR, -1); // seeded DECIDED
const MISSING_PAST = addMonthsToId(CUR, -3); // not seeded

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());

test('AC-2/AC-3/AC-4 New Budget: default, next, missing past, existing draft, locked, double submit', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto('/budgets');
  await page.getByLabel('New budget').click();
  // Default: current local month, which the seed already holds as a draft -> opens, never creates.
  await expect(page.getByText(`Opens ${monthTitle(CUR)} · existing draft`)).toBeVisible();
  await shot(page, info, 'AC-2-new-budget-default-current-month');

  // Next month: shown as "Creates <Month YYYY> · blank draft" before Create; double click creates one.
  await page.getByText(`${monthTitle(CUR)} · this month, draft exists`).click();
  await page.getByText(`${monthTitle(NEXT)} · next month`).click();
  await expect(page.getByText(`Creates ${monthTitle(NEXT)} · blank draft`)).toBeVisible();
  await shot(page, info, 'AC-2-new-budget-next-month');
  const before = (await listIds('periods')).length;
  await page.getByText(`Create ${monthTitle(NEXT)}`, { exact: true }).dblclick();
  await page.waitForURL(new RegExp(`/budgets/${NEXT}`));
  await page.waitForTimeout(1500);
  expect((await listIds('periods')).length).toBe(before + 1);
  // AC-4: blank, and templates stay a separate explicit action.
  expect(await listIds('periods', NEXT, 'planItems')).toHaveLength(0);
  expect(await listIds('periods', NEXT, 'incomeItems')).toHaveLength(0);
  await expect(page.getByText('Add from templates')).toBeVisible();
  await shot(page, info, 'AC-4-new-month-blank-with-template-action');

  // Missing past month (e.g. January during February).
  await page.goto('/budgets');
  await page.getByLabel('New budget').click();
  await page.getByText(`${monthTitle(CUR)} · this month, draft exists`).click();
  await page.getByText(`${monthTitle(MISSING_PAST)} · missing`).click();
  await expect(page.getByText(`Creates ${monthTitle(MISSING_PAST)} · blank draft`)).toBeVisible();
  await shot(page, info, 'AC-2-new-budget-missing-past-month');
  await page.getByText(`Create ${monthTitle(MISSING_PAST)}`, { exact: true }).click();
  await page.waitForURL(new RegExp(`/budgets/${MISSING_PAST}`));
  expect((await listIds('periods')).length).toBe(before + 2);

  // Existing draft via New Budget: opens, count unchanged.
  await page.goto('/budgets');
  await page.getByLabel('New budget').click();
  await page.getByText(`Open ${monthTitle(CUR)}`, { exact: true }).click();
  await page.waitForURL(new RegExp(`/budgets/${CUR}`));
  expect((await listIds('periods')).length).toBe(before + 2);

  // Existing locked month: read-only, nothing created or reseeded.
  const planPrev = (await listIds('periods', PREV, 'planItems')).length;
  await page.goto(`/budgets/${PREV}`);
  await expect(page.getByText('Budget is closed (DECIDED) and now view-only.')).toBeVisible();
  await shot(page, info, 'AC-3-existing-locked-read-only');
  expect((await listIds('periods', PREV, 'planItems')).length).toBe(planPrev);

  // Viewing a month that does not exist never creates it.
  await page.goto('/budgets/2030-01');
  await expect(page.getByText('Create January 2030 draft')).toBeVisible();
  await shot(page, info, 'AC-3-view-missing-month-does-not-create');
  expect((await listIds('periods')).map((p) => p.id)).not.toContain('2030-01');
  expect((await listIds('periods')).length).toBe(before + 2);
  guard.assertOnlyLoopback();
});

test('AC-5 viewed month never changes the posting month', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto(`/transactions?month=${CUR}`);
  await page.goto(`/transactions?month=${PREV}`);
  await page.getByText('Shopping', { exact: true }).last().click(); // the Source filter, not the nav link
  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`month=${CUR}`));
  await page.goto(`/transactions?month=${PREV}`);
  await expect(page.getByText(`Viewing ${monthTitle(PREV)}.`, { exact: false })).toBeVisible();
  const prevTx = (await listIds('periods', PREV, 'transactions')).length;
  const curTx = (await listIds('periods', CUR, 'transactions')).length;

  await page.getByText('Add Expense', { exact: true }).first().click();
  await expect(page.getByText(`Posts to ${monthTitle(CUR)}`, { exact: false })).toBeVisible();
  await page.getByText('Select budget line').click();
  await page.getByText(/^Groceries ·/).click();
  await page.getByPlaceholder('0.00').fill('12.50');
  await expect(page.getByText(`Posts to ${monthTitle(CUR)} · Household account ·`, { exact: false })).toBeVisible();
  await shot(page, info, 'AC-5-expense-form-posts-to-date-month');
  await page.getByText('Save Expense').dblclick();
  await expect(page.getByText(`Expense saved to ${monthTitle(CUR)}.`)).toBeVisible();
  await page.waitForTimeout(1000);
  const curRows = await listIds('periods', CUR, 'transactions');
  expect(curRows.length).toBe(curTx + 1);
  const saved = curRows.find((r) => r.fields.amount && Number(r.fields.amount.doubleValue ?? r.fields.amount.integerValue) === 12.5);
  expect(saved?.fields.date?.stringValue).toBe(localDateISO());
  expect(saved?.fields.paidFromAccountId?.stringValue).toBe('acc-household');
  expect((await listIds('periods', PREV, 'transactions')).length).toBe(prevTx);
  await expect(page).toHaveURL(new RegExp(`month=${PREV}`));

  // A date in the locked month is blocked; a date in a missing month offers an explicit create.
  await page.getByText('Add Expense', { exact: true }).first().click();
  await page.getByPlaceholder('YYYY-MM-DD').fill(`${PREV}-15`);
  await expect(page.getByText(`${monthTitle(PREV)} is closed and view-only. Choose a date in an open month.`)).toBeVisible();
  await page.getByPlaceholder('YYYY-MM-DD').fill('2030-02-10');
  await expect(page.getByText('Create February 2030 draft')).toBeVisible();
  await shot(page, info, 'AC-5-missing-posting-month-explicit-create');
  expect((await listIds('periods')).map((p) => p.id)).not.toContain('2030-02');
  guard.assertOnlyLoopback();
});

test('AC-6 Home: one step to the expense form; shopping total opens filtered Transactions', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto('/dashboard');
  await page.getByLabel('Add expense').click();
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.getByText('Save Expense')).toBeVisible();
  await shot(page, info, 'AC-6-home-add-expense-one-step');

  await page.goto('/dashboard');
  await page.getByRole('link', { name: /Shopping spend/ }).click();
  await expect(page).toHaveURL(new RegExp(`month=${CUR}.*scope=SHOPPING|scope=SHOPPING.*month=${CUR}`));
  await expect(page.getByText('2 of', { exact: false })).toBeVisible();
  await shot(page, info, 'AC-6-dashboard-shopping-total-to-transactions');
  guard.assertOnlyLoopback();
});

test('AC-7 no page-level horizontal scroll on main screens', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const results: Record<string, { scrollWidth: number; innerWidth: number }> = {};
  for (const route of ['/dashboard', '/budgets', `/budgets/${CUR}`, '/transactions', '/accounts', '/shopping', '/reports', '/settings']) {
    await page.goto(route);
    await page.waitForTimeout(2500);
    results[route] = await noPageScroll(page);
    await shot(page, info, `AC-7-${route.replace(/\//g, '_').replace(/^_/, '') || 'root'}`);
  }
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `AC-7-scrollwidth-${info.project.name}.json`), JSON.stringify(results, null, 2));
  for (const [route, r] of Object.entries(results)) expect.soft(r.scrollWidth, route).toBeLessThanOrEqual(r.innerWidth);
  guard.assertOnlyLoopback();
});
