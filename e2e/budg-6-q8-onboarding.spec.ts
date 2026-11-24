// BUDG-6 Q-8: QA saw /onboarding for a moment after a fresh sign-in of an already-onboarded user (onboarding
// flag set before sign-in), once. Sign in 20 times, each in a fresh browser context, and record every URL
// the page shows (same-document navigations included) until Home has settled. Pass = /onboarding never shown.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { EVIDENCE, signIn } from './helpers';

const RUNS = 20;

test('Q-8: an onboarded user never sees /onboarding across 20 fresh sign-ins', async ({ browser }, info) => {
  test.setTimeout(RUNS * 45_000);
  const runs: { run: number; paths: string[]; onboardingShown: boolean; onboardingHeading: boolean }[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: info.project.use.viewport ?? undefined });
    const page = await context.newPage();
    const paths: string[] = [];
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) paths.push(new URL(f.url()).pathname);
    });
    // Also catch a heading painted for a frame even if the URL is not rewritten.
    let onboardingHeading = false;
    const guard = await signIn(page, info);
    const deadline = Date.now() + 4000; // watch the settle window after the first shell route
    while (Date.now() < deadline) {
      if (await page.getByTestId('onboarding').count().catch(() => 0)) onboardingHeading = true;
      await page.waitForTimeout(100);
    }
    await expect(page.getByTestId('add-button').first()).toBeVisible({ timeout: 30_000 });
    guard.assertOnlyLoopback();
    runs.push({ run, paths: [...new Set(paths)], onboardingShown: paths.some((p) => p.startsWith('/onboarding')), onboardingHeading });
    await context.close();
  }
  const shown = runs.filter((r) => r.onboardingShown || r.onboardingHeading).length;
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `Q-8-onboarding-${info.project.name}.json`), JSON.stringify({ runs: RUNS, shown, detail: runs }, null, 2));
  expect(shown, `/onboarding shown in ${shown} of ${RUNS} sign-ins`).toBe(0);
});
