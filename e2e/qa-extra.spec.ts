// BUDG-6 independent QA (qa-engineer): scenarios and rule proofs no earlier spec covered.
// Emulator app only (helpers.signIn aborts any non-loopback host). Serial: shares one seeded household.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addMonthsToId, monthIdFromDate } from '../lib/rules/months';
import { EVIDENCE, FIRESTORE, OWNER, expectSheetClosesFromAnywhere, listIds, reseed, shot, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const LONG_SPACED = 'Q long label with spaces that keeps going and going until it is well over sixty characters';
const LONG_TOKEN = 'QLONGTOKEN' + 'x'.repeat(66); // 76 chars, no break opportunity
const LONG_EMAIL = 'a.very.long.member.address.that.is.well.over.sixty.characters.long@subdomain.example.test';

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => reseed());

async function put(docPath: string, fields: Record<string, unknown>) {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) body[k] = typeof v === 'number' ? { doubleValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
  const res = await fetch(`${FIRESTORE}/${docPath}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: body }) });
  expect(res.ok, `seed ${docPath}`).toBeTruthy();
}
const note = (name: string, data: unknown) => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `${name}.json`), JSON.stringify(data, null, 2));
};

/** Page does not scroll sideways and no visible element holding `needle` pokes past the viewport. */
async function overflow(page: Page, needle: string) {
  return page.evaluate((n) => {
    const w = window.innerWidth;
    const out: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length || !(el.textContent || '').includes(n)) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > w + 1 || r.left < -1)) out.push(`${(el.textContent || '').slice(0, 30)} right=${Math.round(r.right)}`);
    });
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: w, pokes: out };
  }, needle);
}

test('Q year rollover: December to January in the New month sheet; missing month creates only when confirmed', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-12-15T10:00:00'));
  const guard = await signIn(page, info);
  await page.goto('/budgets');
  await page.getByLabel('New month', { exact: true }).click();
  const sheet = page.getByTestId('new-month-sheet');
  await expect(sheet).toBeVisible();
  const labels = await sheet.getByRole('radio').allInnerTexts();
  note(`Q-rollover-radios-${info.project.name}`, labels);
  expect(labels.join('|')).toContain('December 2026');
  const jan = labels.find((l) => l.includes('January 2027'));
  expect(jan, `January 2027 offered, got ${labels.join(' | ')}`).toBeTruthy();
  const before = (await listIds('periods')).length;
  await sheet.getByRole('radio', { name: /January 2027/ }).click();
  await expect(page.getByText('Creates January 2027 · blank draft')).toBeVisible();
  await shot(page, info, 'Q-rollover-dec-to-jan');
  expect((await listIds('periods')).length, 'choosing creates nothing').toBe(before);
  await page.getByText('Create January 2027', { exact: true }).click();
  await page.waitForURL(/\/budgets\/2027-01/);
  await page.waitForTimeout(1200);
  const ids = (await listIds('periods')).map((p) => p.id);
  expect(ids).toContain('2027-01');
  expect(ids.length).toBe(before + 1);
  expect(await listIds('periods', '2027-01', 'planItems')).toHaveLength(0);
  guard.assertOnlyLoopback();
});

test('Q opening a missing month creates nothing (budgets, transactions, reload, Back, after 4 s)', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const before = JSON.stringify((await listIds('periods')).map((p) => p.id).sort());
  for (const url of ['/budgets/2029-03', '/transactions?month=2029-04', '/budgets?month=2029-05', '/budgets/2029-03']) {
    await page.goto(url);
    await page.waitForTimeout(2500);
    await page.reload();
    await page.waitForTimeout(2500);
    expect(JSON.stringify((await listIds('periods')).map((p) => p.id).sort()), url).toBe(before);
  }
  await page.goBack();
  await page.waitForTimeout(1500);
  expect(JSON.stringify((await listIds('periods')).map((p) => p.id).sort())).toBe(before);
  guard.assertOnlyLoopback();
});

test('Q an expense is only saved by the explicit Save (Escape and waiting write nothing)', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const total = async () => (await listIds('periods', CUR, 'transactions')).length + (await listIds('periods', addMonthsToId(CUR, -1), 'transactions')).length;
  await page.goto('/dashboard');
  const t0 = await total();
  await page.getByTestId('add-button').first().click();
  await expect(page.getByTestId('add-sheet')).toBeVisible();
  await page.getByPlaceholder('0.00').fill('7.77');
  await page.waitForTimeout(3000);
  expect(await total(), 'no autosave while the form is open').toBe(t0);
  await expect(page.getByText(`Posts to`, { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('add-sheet')).toBeHidden();
  await page.waitForTimeout(1000);
  expect(await total(), 'Escape discards').toBe(t0);
  await page.getByTestId('add-button').first().click();
  await page.getByPlaceholder('0.00').fill('7.77');
  await page.goBack().catch(() => undefined);
  await page.waitForTimeout(1000);
  expect(await total(), 'Back discards').toBe(t0);
  guard.assertOnlyLoopback();
});

test('Q long labels (60+ chars): plan line, account, shopping item, member email, no sideways scroll', async ({ page }, info) => {
  const u = `users/${OWNER.uid}`;
  await put(`${u}/periods/${CUR}/planItems/plan-qlong1`, { group: 'NEED', name: LONG_SPACED, amount: 123.45, plannedAccountId: 'acc-household', periodId: CUR });
  await put(`${u}/periods/${CUR}/planItems/plan-qlong2`, { group: 'WANT', name: LONG_TOKEN, amount: 5, plannedAccountId: 'acc-household', periodId: CUR });
  await put(`${u}/accounts/acc-qlong`, { name: LONG_SPACED, type: 'BANK', openingBalance: 1234567.89, archived: false });
  await put(`${u}/accounts/acc-qlong2`, { name: LONG_TOKEN, type: 'BANK', openingBalance: 10, archived: false });
  await put(`${u}/shoppingLists/list-weekly/items/item-qlong`, { name: LONG_SPACED, quantity: 12, price: 99.5, category: 'Pantry', bought: false, status: 'planned', source: 'manual' });
  await put(`${u}/shoppingLists/list-weekly/items/item-qlong2`, { name: LONG_TOKEN, quantity: 1, price: 1, category: 'Pantry', bought: false, status: 'planned', source: 'manual' });
  await put(`workspaceMembers/seed-owner_qlong`, { ownerUid: OWNER.uid, ownerEmail: OWNER.email, ownerName: 'Test Owner', memberUid: 'qlong', memberEmail: LONG_EMAIL, memberName: LONG_TOKEN, status: 'ACTIVE', role: 'MEMBER' });
  const guard = await signIn(page, info);
  const found: Record<string, unknown> = {};
  const stops: [string, string, string][] = [['plan', `/budgets/${CUR}`, 'Q long label'], ['plan-token', `/budgets/${CUR}`, 'QLONGTOKEN'], ['accounts', '/accounts', 'Q long label'], ['accounts-token', '/accounts', 'QLONGTOKEN'], ['people', '/settings?page=people', 'a.very.long'], ['people-token', '/settings?page=people', 'QLONGTOKEN']];
  for (const [name, url, needle] of stops) {
    await page.goto(url);
    await page.waitForTimeout(2500);
    const r = await overflow(page, needle);
    found[name] = r;
    await shot(page, info, `Q-long-${name}`);
    expect.soft(r.scrollWidth, `${name} page scroll`).toBeLessThanOrEqual(r.innerWidth);
    expect.soft(r.pokes, `${name} text past viewport`).toEqual([]);
  }
  await page.goto('/shopping');
  await page.getByText('Weekly groceries', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  for (const needle of ['Q long label', 'QLONGTOKEN']) {
    const r = await overflow(page, needle);
    found[`shopping-${needle}`] = r;
    await shot(page, info, `Q-long-shopping-${needle.slice(0, 5)}`);
    expect.soft(r.scrollWidth, 'shopping page scroll').toBeLessThanOrEqual(r.innerWidth);
    expect.soft(r.pokes, 'shopping text past viewport').toEqual([]);
  }
  note(`Q-long-labels-${info.project.name}`, found);
  guard.assertOnlyLoopback();
});

test('Q Escape and Back close every sheet type and keep the route', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const phone = (page.viewportSize()?.width ?? 0) < 980;
  // Fix round: each case names its trigger; expectSheetClosesFromAnywhere presses Escape at once, again
  // with focus on the body, then Back, and checks focus returns to the trigger (Q-1 rule).
  const cases: { id: string; url: string; trigger: () => Locator; phoneOnly?: boolean }[] = [
    { id: 'add-sheet', url: '/dashboard', trigger: () => page.getByTestId('add-button').first() },
    { id: 'new-month-sheet', url: '/budgets', trigger: () => page.getByLabel('New month', { exact: true }) },
    { id: 'line-sheet', url: `/budgets/${CUR}`, trigger: () => page.getByTestId('plan-groups').getByRole('button', { name: /^Rent\b/ }).first() },
    { id: 'month-sheet', url: '/transactions', trigger: () => page.getByTestId('month-chip') },
    { id: 'export-sheet', url: '/reports', trigger: () => page.getByRole('button', { name: 'Export', exact: true }).first() },
    { id: 'account-sheet', url: '/accounts', trigger: () => page.getByRole('button', { name: 'Add account' }).last() },
    { id: 'invite-sheet', url: '/settings?page=people', trigger: () => page.getByRole('button', { name: 'Invite someone' }) },
    { id: 'sign-out-sheet', url: '/settings', trigger: () => page.getByRole('button', { name: 'Sign out' }) },
    { id: 'more-sheet', url: '/dashboard', trigger: () => page.getByTestId('more-button'), phoneOnly: true },
    { id: 'close-month-confirm', url: `/budgets/${CUR}`, trigger: () => page.getByTestId('finish-month').getByRole('button', { name: 'Close month' }) },
  ];
  const result: Record<string, string> = {};
  for (const c of cases) {
    if (c.phoneOnly && !phone) { result[c.id] = 'skipped: no More button on desktop'; continue; }
    try {
      await page.goto(c.url);
      await expect(c.trigger()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await expectSheetClosesFromAnywhere(page, c.id, c.trigger());
      result[c.id] = 'pass';
    } catch (e) {
      result[c.id] = `FAIL ${(e as Error).message.replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => /Escape|Back|route|focus/.test(l)).join(' ').slice(0, 200)}`;
      await shot(page, info, `Q-sheet-fail-${c.id}`);
    }
  }
  note(`Q-escape-back-${info.project.name}`, result);
  expect(Object.values(result).filter((v) => v.startsWith('FAIL')), JSON.stringify(result)).toEqual([]);
  guard.assertOnlyLoopback();
});

test('Q New Budget sheet: Escape on first load vs after navigating from Home (probe)', async ({ page }, info) => {
  const guard = await signIn(page, info);
  const out: Record<string, string> = {};
  const attempt = async (name: string, prep: () => Promise<void>) => {
    await prep();
    await page.waitForTimeout(1800);
    await page.getByLabel('New month', { exact: true }).click();
    await expect(page.getByTestId('new-month-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    out[name] = (await page.getByTestId('new-month-sheet').isVisible()) ? 'STILL OPEN after Escape' : 'closed';
    if (out[name] !== 'closed') await page.getByLabel('Close').first().click().catch(() => undefined);
  };
  await attempt('goto /budgets after sign-in', () => page.goto('/budgets'));
  await attempt('click Plan from Home', async () => { await page.goto('/dashboard'); await page.waitForTimeout(1500); await page.getByRole('link', { name: 'Plan' }).first().click(); });
  await attempt('reload /budgets', () => page.reload());
  note(`Q-newbudget-escape-probe-${info.project.name}`, out);
  guard.assertOnlyLoopback();
});
