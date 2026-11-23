// BUDG-6 integration (design-BUDG-5 entry point 2): "Attach receipt" on a Transactions row
// opens the existing receipt flow on "Link existing" for that expense; linking adds no
// transaction and leaves the expense as it was.
import { expect, test } from '@playwright/test';
import { listIds, noPageScroll, reseed, signIn } from './helpers';

const pid = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

test('Attach receipt from a Transactions row links the existing expense', async ({ page }, testInfo) => {
  reseed();
  const guard = await signIn(page, testInfo);
  const txBefore = await listIds('periods', pid, 'transactions');
  const linksBefore = await listIds('receiptLinks');

  await page.goto(`/transactions?month=${pid}`);
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByText('Dinner', { exact: true }).first().click(); // compact list: open the row's detail
  }
  await page.getByLabel('Attach receipt').first().click();
  const name = await page.getByLabel('Receipt item name').first().inputValue();
  expect(name.length).toBeGreaterThan(0); // pre-filled from the row
  await page.getByText('Next', { exact: true }).click();
  await expect(page.getByText('Link receipt', { exact: true })).toBeVisible(); // "Link existing" pre-set
  await noPageScroll(page);
  await page.getByText('Link receipt', { exact: true }).click();

  await expect.poll(async () => (await listIds('receiptLinks')).length).toBe(linksBefore.length + 1);
  const added = (await listIds('receiptLinks')).find((l) => !linksBefore.some((b) => b.id === l.id))!;
  expect(added.id.startsWith(`${pid}_`)).toBe(true);
  const txAfter = await listIds('periods', pid, 'transactions');
  expect(txAfter.length).toBe(txBefore.length);
  const linked = txAfter.find((t) => `${pid}_${t.id}` === added.id)!;
  const original = txBefore.find((t) => t.id === linked.id)!;
  expect({ ...linked, receiptId: undefined }).toEqual({ ...original, receiptId: undefined }); // expense not rewritten
  guard.assertOnlyLoopback();
});
