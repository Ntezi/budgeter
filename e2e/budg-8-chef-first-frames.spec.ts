import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// BUDG-8 design review D-5: a chef must never see the household frame, not even for one frame.
// A MutationObserver installed before any app script records every DOM state from the first byte,
// and a requestAnimationFrame sampler records what each painted frame held.
const CHEF = { email: 'chef@example.test', password: 'seed-chef-pass' };

test.describe.configure({ mode: 'serial' });

for (const width of [320, 390, 1440]) {
  test(`D-5 chef first frames hold no household heading or navigation at ${width}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as any).__householdSeen = seen;
      const HOUSEHOLD_TITLES = ['Home', 'Plan', 'Accounts', 'Activity', 'Reports', 'Settings', 'Catalog', 'Regular costs', 'Year plan'];
      const check = (where: string) => {
        const d = document;
        if (d.querySelector('[data-testid="bottom-bar"],[data-testid="side-rail"],[data-testid="sidebar"],[data-testid="top-bar"],[data-testid="more-button"]')) seen.push(`${where}: household navigation`);
        for (const h of Array.from(d.querySelectorAll('[role="heading"],h1,h2'))) {
          if (HOUSEHOLD_TITLES.includes((h.textContent || '').trim())) seen.push(`${where}: heading ${h.textContent}`);
        }
        // The household frame: a main landmark that is not the chef shell's own.
        if (d.querySelector('[role="main"]:not([data-testid="chef-shell"])')) seen.push(`${where}: household frame`);
        if (d.querySelector('[data-testid="home-summary"],[data-testid="month-plan"],[data-testid="reports"]')) seen.push(`${where}: household screen`);
      };
      new MutationObserver(() => check('mutation')).observe(document, { childList: true, subtree: true, attributes: true });
      const frame = () => {
        check('frame');
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const guard = await signIn(page, info, CHEF);
    await expect(page.getByTestId('chef-shell')).toBeVisible({ timeout: 60_000 });
    // A reload re-runs the boot with the session kept: the riskiest moment for a flash.
    await page.reload();
    await expect(page.getByTestId('chef-shell')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    const seen = await page.evaluate(() => (window as any).__householdSeen as string[]);
    expect(seen, 'household frame shown to a chef').toEqual([]);
    guard.assertOnlyLoopback();
  });
}
