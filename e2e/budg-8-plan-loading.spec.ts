// BUDG-8 lane Y leftover: Plan Month loading state screenshots (S5-loading-w<width>-<theme>.png).
// Firestore listen responses are held for a few seconds so the skeleton is on screen; emulator only.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { EVIDENCE, signIn } from './helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`Plan loading state at 390 and 1440, ${theme}`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await signIn(page, info);
    await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.route('**/google.firestore.v1.Firestore/Listen/**', async (route) => {
        await new Promise((r) => setTimeout(r, 4000));
        await route.continue().catch(() => {});
      });
      await page.goto('/budgets');
      await expect(page.getByTestId('plan-loading')).toBeVisible({ timeout: 60_000 });
      fs.mkdirSync(EVIDENCE, { recursive: true });
      await page.screenshot({ path: path.join(EVIDENCE, `S5-loading-w${width}-${theme}.png`) });
      await page.unroute('**/google.firestore.v1.Firestore/Listen/**');
      await expect(page.getByTestId('month-plan')).toBeVisible({ timeout: 60_000 });
    }
  });
}
