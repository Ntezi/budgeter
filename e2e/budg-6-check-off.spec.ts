// BUDG-6 fix round 2 (4a): ticking an item on a shopping list is a note, not a money action. The tick is
// saved on the item, and the number of transactions in every month is the same before and after.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { EVIDENCE, listIds, reseed, signIn } from './helpers';

async function countTransactions() {
  const periods = await listIds('periods');
  const out: Record<string, number> = {};
  for (const p of periods) out[p.id] = (await listIds('periods', p.id, 'transactions')).length;
  return out;
}

async function itemFields(id: string) {
  const items = await listIds('shoppingLists', 'list-weekly', 'items');
  return items.find((i) => i.id === id)?.fields ?? {};
}

test('ticking and unticking a shopping item writes no transaction', async ({ page }, info) => {
  reseed();
  const guard = await signIn(page, info);
  const before = await countTransactions();
  const itemBefore = await itemFields('item-tomatoes');
  await page.goto('/shopping');
  await expect(page.getByTestId('shopping-lists')).toBeVisible({ timeout: 60_000 });
  await page.getByText('Weekly groceries', { exact: true }).first().click();
  const toBuy = page.getByRole('checkbox', { name: 'To buy: Tomatoes' });
  await expect(toBuy).toBeVisible({ timeout: 30_000 });
  await toBuy.click();
  const got = page.getByRole('checkbox', { name: 'Got it: Tomatoes' });
  await expect(got).toHaveAttribute('aria-checked', 'true');
  // The tick is saved on the item (so the check below is not vacuous) ...
  await expect.poll(async () => JSON.stringify(await itemFields('item-tomatoes')), { timeout: 10_000 }).not.toBe(JSON.stringify(itemBefore));
  const itemTicked = await itemFields('item-tomatoes');
  await page.waitForTimeout(1500);
  const afterTick = await countTransactions();
  // ... and no transaction appears in any month.
  expect(afterTick).toEqual(before);
  await got.click();
  await expect(page.getByRole('checkbox', { name: 'To buy: Tomatoes' })).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(1500);
  const afterUntick = await countTransactions();
  expect(afterUntick).toEqual(before);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.appendFileSync(
    path.join(EVIDENCE, '4a-check-off-no-transaction.jsonl'),
    JSON.stringify({ project: info.project.name, before, afterTick, afterUntick, itemBefore, itemTicked }) + '\n'
  );
  guard.assertOnlyLoopback();
});
