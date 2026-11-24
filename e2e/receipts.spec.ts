// BUDG-5 e2e in the complete web app against the emulators: a receipt pre-filled from a
// finished shopping list, reviewed, compared with the last comparable price, saved as ONE
// new expense through a Save that shows date, account and amount; a second receipt linked to
// an existing expense; receipt prices on the catalog item. Nothing posts before Save.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { listIds, noPageScroll, reseed, shot, signIn } from './helpers';

const pid = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

async function openList(page: Page, name: string) {
  await page.goto('/shopping');
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByPlaceholder('Add item...')).toBeVisible();
}
async function pick(scope: Locator, current: string, option: string) {
  await scope.getByText(current, { exact: true }).first().click();
  await scope.getByText(option, { exact: true }).last().click();
}
const rcptTxs = async () => (await listIds('periods', pid, 'transactions')).filter((t) => t.id.startsWith('rcpt_'));

test('BUDG-5 receipts: review, compare, save one expense, link existing, catalog prices', async ({ page }, testInfo) => {
  reseed();
  const guard = await signIn(page, testInfo);
  const txBefore = (await listIds('periods', pid, 'transactions')).length;

  // AC-1: start from the finished list; bought items are pre-filled (nothing retyped).
  await openList(page, 'Weekly groceries');
  await page.getByText('Add receipt', { exact: true }).click();
  const lines = page.getByTestId('receipt-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0).getByLabel('Receipt item name')).toHaveValue('Rice 5 kg');
  await expect(lines.nth(0).getByLabel('Price paid')).toHaveValue('60.00');
  await page.getByLabel('Store').fill('Test Market');

  // AC-5: Rice 5 kg as 5 kg at 65.00 vs last receipt 60.00 for a 5 kg pack -> per kg, up.
  const rice = lines.nth(0);
  await rice.getByLabel('Receipt quantity').fill('5');
  await pick(rice, 'piece', 'kg');
  await rice.getByLabel('Price paid').fill('65.00');
  await pick(rice, 'Not in catalog', 'Rice 5 kg');
  await expect(rice.getByTestId('price-chip')).toContainText(/Last .*12\.00 \/ kg · \d{4}-\d{2}-05 · Test Market · up 8\.3%/);
  // AC-6: the only earlier Rice 1 kg price is in another currency -> labelled, not a decrease.
  const small = lines.nth(1);
  await pick(small, 'piece', 'kg');
  await pick(small, 'Not in catalog', 'Rice 1 kg');
  await expect(small.getByTestId('price-chip')).toHaveText('Other currency');
  await shot(page, testInfo, 'AC-1-AC-5-AC-6-review-lines');
  const scroll = await noPageScroll(page);
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);

  // AC-3: Next saves a DRAFT only; no transaction exists yet.
  await page.getByText('Next', { exact: true }).click();
  await expect(page.getByTestId('receipt-save-summary')).toBeVisible();
  expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore);
  const drafts = (await listIds('receipts')).filter((r) => r.fields.status?.stringValue === 'DRAFT');
  expect(drafts.length).toBe(1);

  // AC-1: the Save shows date, account and amount before anything posts.
  const summary = page.getByTestId('receipt-save-summary');
  await expect(summary).toContainText(/Date: \d{4}-\d{2}-\d{2}/);
  await expect(summary).toContainText('Account: ');
  await expect(summary).toContainText(/Amount: .*80\.00/);
  await expect(summary).toContainText('Posts to ');
  // BUDG-6 H-4: no Save without a budget line; the line is shown in the Save summary.
  await expect(summary).toContainText('Line: choose one');
  await expect(page.getByTestId('receipt-save-problem')).toHaveText('Choose the budget line.');
  await page.getByText('Budget line', { exact: true }).click();
  await page.getByText('Groceries', { exact: true }).last().click();
  await expect(summary).toContainText('Line: Groceries');
  await expect(page.getByTestId('receipt-save-problem')).toHaveCount(0);
  await shot(page, testInfo, 'AC-1-save-shows-date-account-amount');
  await page.getByText('Save expense', { exact: true }).click();
  await expect(page.getByText(/Receipt saved and expense recorded in/)).toBeVisible();

  // AC-2: exactly one new expense, exact amount, linked once.
  const created = await rcptTxs();
  expect(created.length).toBe(1);
  expect(created[0].fields.planItemId?.stringValue).toBe('plan-groceries'); // H-4: counts against the line
  expect(Number(created[0].fields.amount.doubleValue ?? created[0].fields.amount.integerValue)).toBe(80);
  expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore + 1);
  const receiptId = created[0].id.slice('rcpt_'.length);
  expect((await listIds('receiptLinks')).filter((l) => l.fields.receiptId?.stringValue === receiptId).length).toBe(1);
  await shot(page, testInfo, 'AC-2-one-expense-recorded');

  // AC-1: second receipt linked to an existing expense; the expense is not changed.
  await openList(page, 'Weekend party');
  await page.getByLabel('List options').click(); // BUDG-8 S10: no Got-it items, so Add receipt is under the list's options
  await page.getByText('Add receipt', { exact: true }).click();
  await expect(page.getByTestId('receipt-line')).toHaveCount(1);
  await page.getByText('Next', { exact: true }).click();
  await page.getByText('Link existing', { exact: true }).click();
  await page.getByText(`Expense in`, { exact: false }).first().click();
  await page.getByText(/· Dinner ·/).last().click();
  const dinnerBefore = JSON.stringify((await listIds('periods', pid, 'transactions')).find((t) => t.id === 'tx-dinner')?.fields);
  await shot(page, testInfo, 'AC-1-link-existing');
  await page.getByText('Link receipt', { exact: true }).click();
  await expect(page.getByText('Receipt linked to the expense.')).toBeVisible();
  expect(JSON.stringify((await listIds('periods', pid, 'transactions')).find((t) => t.id === 'tx-dinner')?.fields)).toBe(dinnerBefore);
  expect((await listIds('receiptLinks')).some((l) => l.id === `${pid}_tx-dinner`)).toBe(true);
  expect((await listIds('periods', pid, 'transactions')).length).toBe(txBefore + 1);

  // AC-5 on the catalog item: receipt prices with the comparison chip; legacy history labelled.
  await page.goto('/shopping-items');
  await page.getByText('Rice 5 kg', { exact: true }).first().click();
  await expect(page.getByTestId('receipt-prices')).toContainText(/up 8\.3%/);
  await expect(page.getByText('Estimates from shopping lists (no currency or unit): not compared.')).toBeVisible();
  await shot(page, testInfo, 'AC-5-catalog-receipt-prices');
  guard.assertOnlyLoopback();
});
