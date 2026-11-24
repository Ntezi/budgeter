// BUDG-42: fast item removal and one actions menu on a shopping list (AC-1..AC-6), at w320/w390/w1440.
// Seed: list-weekly "Weekly groceries" (Rice 5 kg got, Rice 1 kg got, Tomatoes to buy) shared with the chef
// as share-weekly; list-party "Weekend party" (Juice). Every test reseeds.
import { expect, test, type Page } from '@playwright/test';
import { FIRESTORE, expectSheetClosesFromAnywhere, listAction, listIds, reseed, shot, signIn } from './helpers';

const CHEF = { email: 'chef@example.test', password: 'seed-chef-pass' };
const items = async () => (await listIds('shoppingLists', 'list-weekly', 'items')).map((d) => d.id).sort();
async function mirrors() {
  const res = await fetch(`${FIRESTORE}/sharedLists/share-weekly/items?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const body = (await res.json()) as { documents?: { name: string }[] };
  return (body.documents ?? []).map((d) => d.name.split('/').pop()!).sort();
}
/** Expenses, receipts, links, prices, catalog and marks: removing items must not change any of them. */
async function protectedState() {
  const out: Record<string, unknown> = {};
  for (const c of ['receipts', 'receiptLinks', 'priceObservations', 'shoppingCatalog', 'shoppingExpenseMarks']) out[c] = await listIds(c);
  for (const p of await listIds('periods')) out[`tx-${p.id}`] = await listIds('periods', p.id, 'transactions');
  return JSON.stringify(out);
}
async function openList(page: Page, name: string) {
  await page.goto('/shopping');
  await expect(page.getByTestId('shopping-lists')).toBeVisible({ timeout: 60_000 });
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByPlaceholder('Add item...')).toBeVisible();
}
const row = (page: Page, name: string) => page.getByTestId('shopping-item').filter({ hasText: name });
const wide = (page: Page) => (page.viewportSize()?.width || 0) >= 1024;

test('AC-5 one menu: bottom area gone, grouped entries, sheets open from it and close back to it', async ({ page }, info) => {
  reseed();
  const guard = await signIn(page, info);
  await openList(page, 'Weekly groceries');
  await expect(row(page, 'Tomatoes')).toBeVisible();
  await expect(page.getByTestId('got-it-footer')).toHaveCount(0);
  for (const label of ['Record expense', 'Add receipt', 'Share with chef', 'Add from catalog']) await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await shot(page, info, 'AC-5-open-list');
  // The list scroll area reaches the bottom of the window (no footer under it).
  const gap = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="to-buy"]')?.closest('div[class*="overflow"]') as HTMLElement | null;
    const r = (el || document.body).getBoundingClientRect();
    return window.innerHeight - r.bottom;
  });
  expect(gap).toBeLessThan(120);

  await page.getByLabel('List options').click();
  const sheet = page.getByTestId('list-options');
  await expect(sheet).toBeVisible();
  const groups = await sheet.getByTestId('list-options-group').evaluateAll((els) => els.map((e) => Array.from(e.querySelectorAll('[role="button"]')).map((b) => (b.textContent || '').trim())));
  expect(groups[0]).toEqual(['Record expense', 'Add receipt', 'Add from catalog']);
  expect(groups[1]).toEqual(['Select items', 'Remove got items (2)', 'Remove all items']);
  expect(groups[2]).toEqual(['Paste from WhatsApp', 'Reconcile purchases']); // shared list: sharing state stays in the header bar
  await shot(page, info, 'AC-5-menu');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  const options = page.getByLabel('List options');
  await expectSheetClosesFromAnywhere(page, 'record-expense-sheet', options, () => listAction(page, 'Record expense'));
  await expectSheetClosesFromAnywhere(page, 'receipt-sheet', options, () => listAction(page, 'Add receipt'));
  // Every sheet or dialog opened from List options returns focus to List options (review round 1, finding 2).
  await expectSheetClosesFromAnywhere(page, 'catalog-import', options, () => listAction(page, 'Add from catalog'));
  await expectSheetClosesFromAnywhere(page, 'smart-import', options, () => listAction(page, 'Paste from WhatsApp'));
  await expectSheetClosesFromAnywhere(page, 'smart-import', options, () => listAction(page, 'Reconcile purchases'));
  await expectSheetClosesFromAnywhere(page, 'remove-confirm', options, () => listAction(page, 'Remove all items'));
  await expectSheetClosesFromAnywhere(page, 'remove-confirm', options, () => listAction(page, 'Remove got items (2)'));
  expect(await items()).toHaveLength(3);
  // Unshared list: Share with chef is in the menu and its sheet returns focus too.
  await openList(page, 'Weekend party');
  await expectSheetClosesFromAnywhere(page, 'share-sheet', page.getByLabel('List options'), () => listAction(page, 'Share with chef'));
  // Keyboard: the menu opens from the focused control.
  await options.focus();
  await page.keyboard.press('Enter');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  guard.assertOnlyLoopback();
});

test('AC-1 select mode: pick, confirm once, batched remove; Escape and Cancel keep items', async ({ page }, info) => {
  reseed();
  const guard = await signIn(page, info);
  const before = await protectedState();
  await openList(page, 'Weekly groceries');
  // Escape leaves select mode and keeps everything.
  await listAction(page, 'Select items');
  await expect(page.getByTestId('select-bar')).toBeVisible();
  await expect(page.getByPlaceholder('Add item...')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Select Tomatoes' }).click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('select-bar')).toHaveCount(0);
  await expect(page.getByPlaceholder('Add item...')).toBeVisible();
  // Cancel too.
  await listAction(page, 'Select items');
  await page.getByText('Cancel', { exact: true }).click();
  await expect(page.getByTestId('select-bar')).toHaveCount(0);
  expect(await items()).toHaveLength(3);
  // Long-press on a row (touch widths) enters select mode with that row selected.
  if (!wide(page)) {
    const target = row(page, 'Tomatoes').getByTestId('item-open');
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await expect(page.getByTestId('select-bar')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select Tomatoes' })).toHaveAttribute('aria-checked', 'true');
    await page.getByText('Cancel', { exact: true }).click();
  }
  // A tap in select mode toggles selection only: no tick, no item sheet.
  await listAction(page, 'Select items');
  await page.getByRole('checkbox', { name: 'Select Tomatoes' }).click();
  await page.getByRole('checkbox', { name: 'Select Rice 1 kg' }).click();
  await expect(page.getByLabel('Item name')).toHaveCount(0);
  await shot(page, info, 'AC-1-select-mode');
  await page.getByText('Remove (2)', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove 2 items from Weekly groceries?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Expenses already recorded stay.')).toBeVisible();
  await page.getByTestId('confirm-remove').click();
  await expect(page.getByTestId('select-bar')).toHaveCount(0);
  await expect.poll(items).toEqual(['item-rice']);
  await expect.poll(mirrors).toEqual(['item-rice']);
  expect(await protectedState()).toBe(before);
  guard.assertOnlyLoopback();
});

test('AC-2 trash at the end of every row: same line as the price, one click removes, Undo restores', async ({ page }, info) => {
  reseed();
  const guard = await signIn(page, info);
  await openList(page, 'Weekly groceries');
  const original = (await listIds('shoppingLists', 'list-weekly', 'items')).find((d) => d.id === 'item-tomatoes')!.fields;
  const tomatoes = row(page, 'Tomatoes');
  await expect(tomatoes).toBeVisible();
  await expect(page.getByTestId('swipe-delete')).toHaveCount(0);
  // Visible at once (not hover-only), at the far right, on the same line as the amount.
  const trash = tomatoes.getByRole('button', { name: 'Remove Tomatoes' });
  await expect(trash).toBeVisible();
  await expect(trash).toHaveCSS('opacity', '1');
  for (const r of await page.getByTestId('shopping-item').all()) {
    const rb = (await r.boundingBox())!;
    const tb = (await r.getByTestId('row-remove').boundingBox())!;
    const open = (await r.getByTestId('item-open').boundingBox())!;
    expect(Math.abs(tb.y + tb.height / 2 - (rb.y + rb.height / 2)), 'trash vertically centred in the row').toBeLessThan(3);
    expect(tb.x, 'trash after the price').toBeGreaterThanOrEqual(open.x + open.width - 1);
    expect(tb.x + tb.width, 'trash inside the row').toBeLessThanOrEqual(rb.x + rb.width + 1);
    expect(tb.height).toBe(wide(page) ? 36 : 44);
  }
  // No red anywhere on a row.
  const red = await page.getByTestId('shopping-item').evaluateAll((els) => els.some((e) => Array.from(e.querySelectorAll('*')).concat(e).some((n) => getComputedStyle(n).backgroundColor === 'rgb(212, 24, 61)')));
  expect(red).toBe(false);
  await shot(page, info, 'rows-v2-open-list');
  // One click removes at once: no dialog.
  await trash.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('undo-notice')).toContainText('Removed Tomatoes');
  await expect.poll(items).not.toContain('item-tomatoes');
  await expect.poll(mirrors).not.toContain('item-tomatoes');
  await page.getByTestId('undo-notice').getByText('Undo', { exact: true }).click();
  await expect.poll(items).toContain('item-tomatoes');
  const restored = (await listIds('shoppingLists', 'list-weekly', 'items')).find((d) => d.id === 'item-tomatoes')!.fields;
  expect(restored).toEqual(original);
  await expect.poll(mirrors).toContain('item-tomatoes');
  // Tab order per row: Got-it toggle, row, remove.
  await page.getByRole('checkbox', { name: 'To buy: Tomatoes' }).focus();
  await page.keyboard.press('Tab');
  await expect(row(page, 'Tomatoes').getByTestId('item-open')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(row(page, 'Tomatoes').getByTestId('row-remove')).toBeFocused();
  // Tap-to-tick still works.
  await page.getByRole('checkbox', { name: 'To buy: Tomatoes' }).click();
  await expect(page.getByRole('checkbox', { name: 'Got it: Tomatoes' })).toBeVisible();
  guard.assertOnlyLoopback();
});

test('AC-3 Remove got items then Remove all items, each confirmed with list and count; AC-4 pop-up Delete stays', async ({ page }, info) => {
  reseed();
  const guard = await signIn(page, info);
  const before = await protectedState();
  await openList(page, 'Weekly groceries');
  // AC-4: the item pop-up keeps Delete item.
  await row(page, 'Tomatoes').getByTestId('item-open').click();
  await expect(page.getByLabel('Item name')).toBeVisible();
  await expect(page.getByText('Delete item', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Item name')).toHaveCount(0);

  await listAction(page, 'Remove got items (2)');
  await expect(page.getByRole('dialog', { name: 'Remove 2 items from Weekly groceries?' })).toBeVisible();
  await page.getByTestId('confirm-remove').click();
  await expect.poll(items).toEqual(['item-tomatoes']);
  // Nothing ticked now: Record expense is offered only with Got-it items, as the old footer was.
  await page.getByLabel('List options').click();
  await expect(page.getByTestId('list-options').getByRole('button', { name: 'Record expense', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('list-options')).toHaveCount(0);
  await listAction(page, 'Remove all items');
  await expect(page.getByRole('dialog', { name: 'Remove 1 item from Weekly groceries?' })).toBeVisible();
  await shot(page, info, 'AC-3-remove-all-confirm');
  await page.getByTestId('confirm-remove').click();
  await expect(page.getByTestId('list-empty')).toBeVisible();
  await expect.poll(items).toEqual([]);
  await expect.poll(mirrors).toEqual([]);
  expect(await protectedState()).toBe(before);
  guard.assertOnlyLoopback();
});

test('AC-6 chef: removes only own items, household items disabled with a reason, no Remove all', async ({ page }, info) => {
  reseed();
  const guard = await signIn(page, info, CHEF);
  await page.goto('/shopping');
  await expect(page.getByText('Shared with you')).toBeVisible({ timeout: 60_000 });
  await page.getByText('Weekly groceries', { exact: true }).click();
  await expect(page.getByPlaceholder('Add item...')).toBeVisible();
  for (const hidden of ['Record expense', 'Add receipt', 'Share with chef']) await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
  await page.getByPlaceholder('Add item...').fill('Lemons');
  await page.getByText('Add', { exact: true }).click();
  await expect(row(page, 'Lemons')).toBeVisible();
  // The end-of-row trash shows only on the chef's own item.
  await expect(row(page, 'Lemons').getByRole('button', { name: 'Remove Lemons' })).toBeVisible();
  await expect(page.getByTestId('row-remove')).toHaveCount(1);
  await page.getByLabel('List options').click();
  const sheet = page.getByTestId('list-options');
  await expect(sheet.getByText('Remove all items', { exact: true })).toHaveCount(0);
  await expect(sheet.getByText('You can remove only the items you added.')).toBeVisible();
  await sheet.getByText('Select items', { exact: true }).click();
  await expect(page.getByTestId('select-bar')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Select Tomatoes' })).toBeDisabled();
  await expect(row(page, 'Tomatoes')).toContainText('Added by the household');
  await page.getByText('Select all', { exact: true }).click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await shot(page, info, 'AC-6-chef-select');
  await page.getByText('Remove (1)', { exact: true }).click();
  await page.getByTestId('confirm-remove').click();
  await expect(row(page, 'Lemons')).toHaveCount(0);
  await expect.poll(mirrors).toEqual(['item-rice', 'item-rice-small', 'item-tomatoes']);
  await expect(page.getByTestId('row-remove')).toHaveCount(0); // household rows: no remove button for the chef
  guard.assertOnlyLoopback();
});
