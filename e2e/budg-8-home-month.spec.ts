import { expect, test } from '@playwright/test';
import { listIds, signIn } from './helpers';
import { transactionSignedBudgetAmount } from '../lib/accounting';
import { fmtMoney } from '../lib/format';

// BUDG-8 design review D-13: every Home figure follows the viewed month. The month is switched
// with the month chip and each figure is checked against the stored transactions of that month.
const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const CUR = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const PREV = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`;
const title = (id: string) => new Date(Number(id.slice(0, 4)), Number(id.slice(5)) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

function plain(f: Record<string, any>): any {
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('timestampValue' in f) return f.timestampValue;
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, plain(v as any)]));
  return undefined;
}

async function stored(month: string) {
  const rows = (await listIds('periods', month, 'transactions')).map((d) => Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, plain(v as any)])));
  const t = { needs: 0, wants: 0, sd: 0, shop: 0, total: 0, unlinked: 0, unlinkedCount: 0 };
  for (const tx of rows) {
    const amt = transactionSignedBudgetAmount(tx as any);
    if (!amt) continue;
    t.total += amt;
    if (tx.group === 'NEED') t.needs += amt;
    else if (tx.group === 'WANT') t.wants += amt;
    else t.sd += amt;
    if (tx.shoppingListId || tx.shoppingItemId) t.shop += amt;
    if (!tx.categoryId) {
      t.unlinked += amt;
      t.unlinkedCount += 1;
    }
  }
  return { count: rows.length, ...t };
}

test('D-13 Home figures follow the month chosen with the month chip', async ({ page }, info) => {
  test.setTimeout(180_000);
  const guard = await signIn(page, info);
  await page.goto('/dashboard');
  await expect(page.getByTestId('home-summary')).toBeVisible({ timeout: 60_000 });
  for (const [month, status] of [[PREV, 'Closed'], [CUR, '']] as const) {
    await page.getByTestId('month-chip').click();
    await page.getByTestId('month-sheet').getByRole('button', { name: new RegExp(`^${title(month)},${status ? ` ${status}` : ''}`) }).click();
    await expect(page).toHaveURL(new RegExp(`month=${month}`));
    const s = await stored(month);
    expect(s.count, `seed has transactions in ${month}`).toBeGreaterThan(0);
    const summary = page.getByTestId('home-summary');
    await expect(summary).toContainText(`Spent ${fmtMoney(s.total)} of`);
    for (const [label, amount] of [['Needs', s.needs], ['Wants', s.wants], ['Savings', s.sd], ['Shopping', s.shop]] as const) {
      await expect(page.getByLabel(new RegExp(`^${label} spend ${fmtMoney(amount).replace(/[.$]/g, '\\$&')}, open .* for ${title(month)}$`))).toBeVisible();
    }
    if (s.unlinkedCount) {
      await expect(page.getByTestId('home-needs-you')).toContainText(`Sort ${s.unlinkedCount} ${s.unlinkedCount === 1 ? 'cost' : 'costs'} into your plan`);
      await expect(page.getByTestId('home-needs-you')).toContainText(`${fmtMoney(s.unlinked)} spent`);
    }
    await page.screenshot({ path: info.outputPath(`home-${month}.png`) });
  }
  guard.assertOnlyLoopback();
});
