// BUDG-41: the old app's text sizes at every width, develop-like density from 1024 px, 44 px targets below.
// Runs in w320 / w390 / w1440 (one viewport per project); the checks set their own widths.
// BUDG41_MEASURE=before|after also writes rows-visible and font-size counts plus screenshots (AC-3).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { EVIDENCE, reseed, signIn } from './helpers';

const SCREENS: { name: string; path: string; open?: (page: Page) => Promise<void> }[] = [
  { name: 'home', path: '/dashboard' },
  { name: 'plan', path: '/budgets' },
  { name: 'accounts', path: '/accounts' },
  { name: 'activity', path: '/transactions' },
  {
    name: 'shopping',
    path: '/shopping',
    open: async (page) => {
      await page.getByText('Weekly groceries', { exact: true }).first().click();
      await page.waitForTimeout(800);
    },
  },
];

async function go(page: Page, width: number, screen: (typeof SCREENS)[number]) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.goto(screen.path);
  await page.getByTestId('add-button').first().waitFor({ state: 'attached', timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  if (screen.open) await screen.open(page);
  await page.waitForTimeout(400);
}

/** Wide innermost pressables (list rows) fully inside the viewport, and computed font sizes of all rendered text. */
async function census(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const contentW = vw >= 1024 ? vw - 256 : vw;
    const buttons = Array.from(document.querySelectorAll('[role="button"],button,a[href]')) as HTMLElement[];
    const wide = buttons.filter((el) => {
      if (el.offsetParent === null) return false;
      const r = el.getBoundingClientRect();
      if (r.width < contentW * 0.4 || r.height < 24 || r.height > 140) return false;
      if (/\bbg-primary\b/.test(el.className)) return false;
      return true;
    });
    const rows = wide.filter((el) => !wide.some((o) => o !== el && el.contains(o)));
    const visible = rows.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw;
    });
    const sizes: Record<string, number> = {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent || '').trim()) continue;
      seen.add(el);
      if ((el as HTMLElement).offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
      const fs = getComputedStyle(el).fontSize;
      sizes[fs] = (sizes[fs] || 0) + 1;
    }
    return {
      viewport: `${vw}x${vh}`,
      rowsFullyVisible: visible.length,
      rowHeights: visible.map((el) => Math.round(el.getBoundingClientRect().height)),
      rowLabels: visible.map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)),
      fontSizes: sizes,
    };
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => reseed());

test('BUDG-41 measure rows visible and font sizes (AC-3)', async ({ page }, info) => {
  const label = process.env.BUDG41_MEASURE;
  test.skip(!label || info.project.name !== 'w1440', 'measurement runs once, on request');
  test.setTimeout(600_000);
  const guard = await signIn(page, info);
  const out: Record<string, unknown> = {};
  for (const width of [1440, 390]) {
    for (const screen of SCREENS) {
      await go(page, width, screen);
      out[`${screen.name}-w${width}`] = await census(page);
      fs.mkdirSync(EVIDENCE, { recursive: true });
      await page.screenshot({ path: path.join(EVIDENCE, `${label}-${screen.name}-w${width}.png`) });
    }
  }
  fs.writeFileSync(path.join(EVIDENCE, `${label}-census.json`), JSON.stringify(out, null, 2));
  guard.assertOnlyLoopback();
});

async function heights(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => Math.round(el.getBoundingClientRect().height))
  );
}

async function planRowText(page: Page) {
  const row = page.locator('[data-testid^="plan-line-"]').first();
  await row.waitFor({ timeout: 30_000 });
  return row.evaluate((el) => {
    const texts = Array.from(el.querySelectorAll('div[dir="auto"], span')).filter((t) => (t.textContent || '').trim() && !t.querySelector('div[dir="auto"]') && !/material/i.test(getComputedStyle(t).fontFamily));
    return { title: getComputedStyle(texts[0]).fontSize, all: [...new Set(texts.map((t) => getComputedStyle(t).fontSize))], h: Math.round(el.getBoundingClientRect().height) };
  });
}

test('BUDG-41 desktop density at 1440 and touch targets at 390 (AC-1, AC-2)', async ({ page }, info) => {
  test.skip(info.project.name !== 'w1440', 'sets its own widths; runs once');
  const guard = await signIn(page, info);
  const plan = SCREENS.find((s) => s.name === 'plan')!;
  const out: Record<string, unknown> = {};
  for (const width of [1440, 1024, 768, 390]) {
    await go(page, width, plan);
    const dense = width >= 1024;
    const buttons = await heights(page, '[data-testid="month-plan"] [role="button"]:has-text("Add to this month"), [data-testid="month-plan"] [role="button"]:text-is("Review")');
    const toggles = await heights(page, '[data-testid="page-switcher"] [role="button"]');
    const text = await planRowText(page);
    out[`w${width}`] = { buttons, toggles, text };
    expect(buttons.length, `standard buttons found at ${width}`).toBeGreaterThan(0);
    expect(toggles.length, `switcher found at ${width}`).toBeGreaterThan(0);
    // Old app's sizes at every width: row primary text 14 px (text-sm), meta 12 px (text-xs).
    expect(text.title, `row primary text at ${width}`).toBe('14px');
    for (const fs of text.all) expect(['12px', '14px'], `row text sizes at ${width}`).toContain(fs);
    if (dense) {
      for (const h of buttons) expect(h, `button height at ${width}`).toBe(36);
      for (const h of toggles) expect(h, `toggle height at ${width}`).toBeLessThanOrEqual(36);
    } else {
      for (const h of [...buttons, ...toggles, text.h]) expect(h, `touch target at ${width}`).toBeGreaterThanOrEqual(44);
    }
  }
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'budg41-density-heights.json'), JSON.stringify(out, null, 2));
  guard.assertOnlyLoopback();
});

test('BUDG-41 no page-level horizontal scroll on the five screens (AC-4)', async ({ page }, info) => {
  test.skip(info.project.name !== 'w1440', 'sets its own widths; runs once');
  test.setTimeout(600_000);
  const guard = await signIn(page, info);
  const bad: string[] = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    for (const screen of SCREENS) {
      await go(page, width, screen);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (m.sw > m.iw) bad.push(`${screen.name}@${width}: ${m.sw} > ${m.iw}`);
    }
  }
  expect(bad).toEqual([]);
  guard.assertOnlyLoopback();
});

/** Leaf text sizes in a row, icon glyphs excluded: first is the primary text. */
async function rowSizes(page: Page, selector: string) {
  const row = page.locator(selector).first();
  await row.waitFor({ timeout: 30_000 });
  return row.evaluate((el) => {
    const texts = Array.from(el.querySelectorAll('div[dir="auto"], span')).filter(
      (t) => (t.textContent || '').trim() && !t.querySelector('div[dir="auto"]') && !/material/i.test(getComputedStyle(t).fontFamily)
    );
    return texts.map((t) => getComputedStyle(t).fontSize);
  });
}

async function boxH(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => Math.round(el.getBoundingClientRect().height))
  );
}

test('BUDG-41 review: inputs, list rows and the Accounts switcher per width (AC-1, AC-2)', async ({ page }, info) => {
  test.skip(info.project.name !== 'w1440', 'sets its own widths; runs once');
  test.setTimeout(600_000);
  const guard = await signIn(page, info);
  const out: Record<string, unknown> = {};
  for (const width of [1440, 1024, 768, 390]) {
    const dense = width >= 1024;
    const key = `w${width}`;
    const got: Record<string, unknown> = {};
    // Add expense amount, Move money amount and the split amounts.
    await go(page, width, SCREENS[0]);
    await page.getByTestId('add-button').first().click();
    await page.getByTestId('expense-amount').waitFor();
    got.expenseAmount = await boxH(page, '[data-testid="expense-amount"]');
    await page.getByRole('button', { name: 'Move money', exact: true }).or(page.getByRole('tab', { name: 'Move money' })).first().click();
    await page.getByTestId('move-amount').waitFor();
    got.moveAmount = await boxH(page, '[data-testid="move-amount"]');
    await page.getByRole('button', { name: 'Split to several accounts' }).click();
    await page.getByTestId('move-split').waitFor();
    got.splitAmounts = await boxH(page, '[data-testid="move-split"] input');
    const inputs = [...(got.expenseAmount as number[]), ...(got.moveAmount as number[]), ...(got.splitAmounts as number[])];
    expect((got.splitAmounts as number[]).length, `split inputs at ${width}`).toBeGreaterThan(0);
    for (const h of inputs) {
      if (dense) expect(h, `input height at ${width}`).toBe(36);
      else expect(h, `input height at ${width}`).toBeGreaterThanOrEqual(44);
    }
    // Accounts: switcher and rows.
    await go(page, width, SCREENS[2]);
    got.switcher = await boxH(page, '[data-testid="accounts-segment"]');
    got.tabs = await boxH(page, '[data-testid="accounts-segment"] [role="tab"]');
    if (dense) for (const h of got.switcher as number[]) expect(h, `accounts switcher at ${width}`).toBeLessThanOrEqual(38);
    else for (const h of got.tabs as number[]) expect(h, `accounts tabs at ${width}`).toBeGreaterThanOrEqual(44);
    got.accountRow = await rowSizes(page, '[data-testid^="account-row-"]');
    await go(page, width, SCREENS[3]);
    got.activityRow = await rowSizes(page, '[data-testid^="activity-row-"]');
    await go(page, width, SCREENS[4]);
    got.shoppingRow = await rowSizes(page, '[data-testid="shopping-item"]');
    for (const name of ['accountRow', 'activityRow', 'shoppingRow']) {
      const sizes = got[name] as string[];
      expect(sizes[0], `${name} primary text at ${width}`).toBe('14px');
      expect(sizes, `${name} has a 12 px meta line at ${width}`).toContain('12px');
      for (const s of sizes) expect(['12px', '14px'], `${name} sizes at ${width}`).toContain(s);
    }
    out[key] = got;
  }
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'budg41-review-heights.json'), JSON.stringify(out, null, 2));
  guard.assertOnlyLoopback();
});
