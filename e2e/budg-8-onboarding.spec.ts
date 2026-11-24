// BUDG-8 lane Y S16 sign-in + onboarding at 320/390/768/1024/1440 px, light and dark. Emulator app only:
// every request to a host other than loopback is aborted, so the Google popup is never opened; sign-in
// uses the emulator-only hook exactly as helpers.signIn does.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { EVIDENCE, OWNER, listIds, noPageScroll, reseed } from './helpers';

const WIDTHS = [320, 390, 768, 1024, 1440];
// Same text as periodTitleFromId(current month), e.g. "November 2026" (lib/repo cannot load under Playwright).
const MONTH = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
const results: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'S16-measurements.json'), JSON.stringify(results, null, 2));
});

async function loopbackOnly(page: Page) {
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:' || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.continue();
    blocked.push(url.href);
    return route.abort();
  });
  return blocked;
}

async function hookSignIn(page: Page) {
  await page.waitForFunction(() => typeof (window as any).__budgetaEmulatorSignIn === 'function', null, { timeout: 90_000 });
  await page.evaluate(({ email, password }) => (window as any).__budgetaEmulatorSignIn(email, password), OWNER);
}

async function snap(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: false });
}

async function smallTargets(page: Page) {
  return page.locator('[role=button], [role=link], a').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30), ...((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) }))
      .filter((r) => r.w < 44 || r.h < 44)
  );
}

test('S16 first visit to the first plan: Next, Next, Plan <Month>, Google = 4 taps, sheet open, nothing created', async ({ page }) => {
  test.setTimeout(240_000);
  await loopbackOnly(page);
  const periodsBefore = (await listIds('periods')).length;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('onboarding')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  let taps = 0;
  await page.getByRole('button', { name: 'Next', exact: true }).click(); taps++;
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: "Next: I'll add them on Accounts" }).click(); taps++;
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await page.getByRole('button', { name: `Plan ${MONTH}` }).click(); taps++;
  await expect(page.getByTestId('auth-screen')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await hookSignIn(page); taps++; // stands in for the Google button
  await page.waitForURL(/\/budgets/, { timeout: 60_000 });
  await expect(page.getByTestId('new-month-sheet')).toBeVisible({ timeout: 30_000 });
  await snap(page, 'S16-new-month-sheet-w390-light');
  expect(new URL(page.url()).searchParams.get('new'), 'param dropped after opening').toBeNull();
  expect((await listIds('periods')).length, 'onboarding creates nothing').toBe(periodsBefore);
  results.firstPlanTaps = `${taps} (Next, Next, Plan ${MONTH}, Google); before 7`;
});

test('S16 Skip is one tap to sign-in; Look around first lands on Home', async ({ page }) => {
  test.setTimeout(240_000);
  await loopbackOnly(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('onboarding')).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByTestId('auth-screen')).toBeVisible({ timeout: 60_000 });
  results.skipTaps = 1;
  await page.evaluate(() => window.localStorage.removeItem('budgeter:onboarding-complete'));
  await page.goto('/');
  await expect(page.getByTestId('onboarding')).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: "Next: I'll add them on Accounts" }).click();
  await page.getByRole('button', { name: 'Look around first' }).click();
  await expect(page.getByTestId('auth-screen')).toBeVisible({ timeout: 60_000 });
  await hookSignIn(page);
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
});

for (const theme of ['light', 'dark'] as const) {
  test(`S16 onboarding and sign-in at 5 widths, ${theme}`, async ({ page }) => {
    test.setTimeout(600_000);
    await loopbackOnly(page);
    await page.addInitScript((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    for (const width of WIDTHS) {
      const key = `w${width}-${theme}`;
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.evaluate(() => window.localStorage.removeItem('budgeter:onboarding-complete')).catch(() => {});
      await page.goto('/onboarding');
      await expect(page.getByTestId('onboarding')).toBeVisible({ timeout: 90_000 });
      for (const step of [1, 2, 3]) {
        await expect(page.getByText(`Step ${step} of 3`)).toBeVisible();
        const scroll = await noPageScroll(page);
        expect(scroll.scrollWidth, `scroll onboarding ${step} ${key}`).toBeLessThanOrEqual(scroll.innerWidth);
        if (width < 768) expect(await smallTargets(page), `small targets onboarding ${step} ${key}`).toEqual([]);
        if (width === 390 || width === 1440 || width === 320) await snap(page, `S16-onboarding-${step}-w${width}-${theme}`);
        if (step === 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
        if (step === 2) await page.getByRole('button', { name: "Next: I'll add them on Accounts" }).click();
      }
      await page.getByRole('button', { name: `Plan ${MONTH}` }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Look around first' }), 'Tab order: Plan, then Look around first').toBeFocused();
      await page.getByRole('button', { name: 'Look around first' }).click();
      await expect(page.getByTestId('auth-screen')).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(400);
      const scroll = await noPageScroll(page);
      expect(scroll.scrollWidth, `scroll auth ${key}`).toBeLessThanOrEqual(scroll.innerWidth);
      if (width < 768) expect(await smallTargets(page), `small targets auth ${key}`).toEqual([]);
      const btn = await page.getByRole('button', { name: 'Continue with Google' }).boundingBox();
      results[key] = { googleButton: btn && { top: Math.round(btn.y), h: Math.round(btn.height), viewportH: width < 768 ? 844 : 900 } };
      if (width < 768) expect(btn!.y, `Google button in the bottom part at ${key}`).toBeGreaterThan(844 / 2);
      await snap(page, `S16-auth-w${width}-${theme}`);
    }
  });
}
