// BUDG-40 AC-2 (F-2): Add expense shows the budget it goes to and lets the user choose another open month.
// A late-previous-month expense (previous month is seeded DECIDED) is saved into the current open budget with
// its date unchanged; the manual choice survives a date change; the sheet still closes on Escape and Back.
import { expect, test } from '@playwright/test';
import { addMonthsToId, monthIdFromDate, monthTitle } from '../lib/rules/months';
import { expectSheetClosesFromAnywhere, listIds, shot, signIn } from './helpers';

const CUR = monthIdFromDate(new Date()); // seeded DRAFT
const PREV = addMonthsToId(CUR, -1); // seeded DECIDED

test('AC-2 Add expense dated in one month is saved into another open budget, date unchanged', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto(`/transactions?month=${CUR}`);
  await expect(page.getByText(`Viewing ${monthTitle(CUR)}.`, { exact: false })).toBeVisible();
  await expect(page.getByText('New expenses go to the budget you choose', { exact: false })).toBeVisible();
  const curBefore = (await listIds('periods', CUR, 'transactions')).length;
  const prevBefore = (await listIds('periods', PREV, 'transactions')).length;

  await page.getByTestId('add-button').first().click();
  const budget = page.getByTestId('expense-budget');
  await expect(budget).toContainText(monthTitle(CUR)); // default: the month of today's date
  await page.getByPlaceholder('YYYY-MM-DD').fill(`${PREV}-27`);
  await expect(budget).toContainText(`${monthTitle(PREV)} (closed)`); // follows the date while not chosen
  await expect(page.getByText(`${monthTitle(PREV)} is closed and view-only. Choose an open budget below.`)).toBeVisible();
  await expect(page.getByTestId('save-expense')).toBeDisabled();

  await budget.getByText(`${monthTitle(PREV)} (closed)`, { exact: true }).click();
  await budget.getByText(monthTitle(CUR), { exact: true }).click();
  await expect(budget).toContainText(monthTitle(CUR));
  await page.getByPlaceholder('YYYY-MM-DD').fill(`${PREV}-26`); // a manual choice survives a date change
  await expect(budget).toContainText(monthTitle(CUR));
  await page.getByRole('button', { name: 'Groceries', exact: true }).click(); // a line of the chosen budget
  await page.getByPlaceholder('0.00').fill('7.25');
  await expect(page.getByTestId('posts-to')).toContainText(`Posts to ${monthTitle(CUR)} · Household account ·`);
  await expect(page.getByTestId('posts-to')).toContainText(`· ${PREV}-26`);
  await shot(page, info, 'AC-2-add-expense-chosen-budget');
  await page.getByTestId('save-expense').click();
  await expect(page.getByText(`Expense saved to ${monthTitle(CUR)}.`)).toBeVisible();

  await expect.poll(async () => (await listIds('periods', CUR, 'transactions')).length).toBe(curBefore + 1);
  const saved = (await listIds('periods', CUR, 'transactions')).find((r) => Number(r.fields.amount?.doubleValue ?? r.fields.amount?.integerValue) === 7.25);
  expect(saved?.fields.date?.stringValue).toBe(`${PREV}-26`);
  expect(saved?.fields.periodId?.stringValue).toBe(CUR);
  expect((await listIds('periods', PREV, 'transactions')).length).toBe(prevBefore);
  await expect(page.getByText(`${PREV}-26`, { exact: false }).first()).toBeVisible(); // listed in the chosen budget's Activity
  await shot(page, info, 'AC-2-activity-shows-expense-in-chosen-budget');

  // Reopened: the choice is reset to the month of the date.
  await page.getByTestId('add-button').first().click();
  await expect(page.getByTestId('expense-budget')).toContainText(monthTitle(CUR));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-sheet')).toHaveCount(0);
  guard.assertOnlyLoopback();
});

test('AC-2 the Add sheet with the Budget field still closes on Escape and Back', async ({ page }, info) => {
  const guard = await signIn(page, info);
  await page.goto(`/transactions?month=${CUR}`);
  await expect(page.getByText(`Viewing ${monthTitle(CUR)}.`, { exact: false })).toBeVisible();
  await expectSheetClosesFromAnywhere(page, 'add-sheet', page.getByTestId('add-button').first());
  guard.assertOnlyLoopback();
});
