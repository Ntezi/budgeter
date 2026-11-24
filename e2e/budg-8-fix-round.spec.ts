// BUDG-6 fix round: clipping at 320 (and 390/1440) fails when any label in scope is cut, by ellipsis or
// by an ancestor that hides overflow (Q-3 Reports range, Q-4 Add sheet tab, Q-5/D-8 Accounts rows,
// Q-6 Home tiles). Q-2 (Remove <long email>) is checked by qa-extra "long labels".
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { EVIDENCE, signIn } from './helpers';

const WIDTHS = [320, 390, 1440];
const found: Record<string, unknown> = {};
test.describe.configure({ mode: 'serial' });
test.afterAll(() => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'fix-round-clipping.json'), JSON.stringify(found, null, 2));
});

/** Leaf texts in scope that are cut: ellipsis, or the text itself (measured by a Range) wider than its own
 * box or than the pressable that holds it, which is how a tab label like 'Shoppir' is clipped. */
async function cutTexts(scope: Locator) {
  return scope.evaluateAll((roots) => {
    const out: string[] = [];
    for (const root of roots) {
      [root, ...Array.from(root.querySelectorAll('*'))].forEach((el) => {
        const h = el as HTMLElement;
        if (h.children.length || !(h.textContent || '').trim() || h.offsetParent === null) return;
        const t = (h.textContent || '').trim().slice(0, 40);
        if (h.scrollWidth > h.clientWidth + 1) { out.push(`${t} (ellipsis)`); return; }
        const range = document.createRange();
        range.selectNodeContents(h);
        const tr = range.getBoundingClientRect();
        const holder = (h.closest('[role=button], [role=link], [role=tab]') as HTMLElement | null) ?? h.parentElement;
        const hr = holder?.getBoundingClientRect();
        if (hr && (tr.right > hr.right + 1 || tr.left < hr.left - 1)) out.push(`${t} (past its box)`);
        if (tr.right > window.innerWidth + 1) out.push(`${t} (past the screen)`);
      });
    }
    return out;
  });
}

async function go(page: Page, url: string, width: number, ready: string) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.goto(url);
  await expect(page.getByTestId(ready).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(700);
}

test('fix round: no cut labels on Home, Accounts, Reports range, Add sheet tabs', async ({ page }, info) => {
  test.setTimeout(300_000);
  const guard = await signIn(page, info);
  for (const width of WIDTHS) {
    await go(page, '/dashboard', width, 'add-button');
    const home = await cutTexts(page.locator('[data-testid="home-summary"], [data-testid="home-needs-you"], [data-testid="home-accounts"]'));
    await go(page, '/accounts', width, 'add-button');
    const rows = page.locator('[data-testid^="account-row-"]');
    await expect(rows.first()).toBeVisible();
    const accounts = await cutTexts(rows);
    // D-8: one muted line under each name (type only), so no row is taller than two lines of text plus padding.
    const tallest = Math.max(...(await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))));
    await go(page, '/reports', width, 'report-trend');
    const reports = await cutTexts(page.getByTestId('report-trend'));
    await go(page, '/dashboard', width, 'add-button');
    await page.getByTestId('add-button').first().click();
    await expect(page.getByTestId('add-sheet')).toBeVisible();
    const addTabs = await cutTexts(page.getByTestId('add-sheet').getByRole('button', { name: /^(Expense|Move money|Shopping item)$/ }));
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('add-sheet')).toHaveCount(0);
    found[`w${width}`] = { home, accounts, tallestAccountRow: tallest, reports, addTabs };
    expect.soft(home, `Home cut at ${width}`).toEqual([]);
    expect.soft(accounts, `Accounts rows cut at ${width}`).toEqual([]);
    expect.soft(tallest, `Accounts row height at ${width}`).toBeLessThanOrEqual(96);
    expect.soft(reports, `Reports range cut at ${width}`).toEqual([]);
    expect.soft(addTabs, `Add sheet tabs cut at ${width}`).toEqual([]);
  }
  guard.assertOnlyLoopback();
});
