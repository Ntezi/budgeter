// End-to-end tests against the local emulator app only (BUDG-1, ADR-2).
// Start the app first with `npm run web:emulators`; every test aborts and
// fails on any request to a host other than localhost/127.0.0.1.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8081',
    channel: 'chrome',
    headless: true,
    trace: 'off',
  },
  projects: [
    { name: 'w320', use: { viewport: { width: 320, height: 740 } } },
    { name: 'w1440', use: { viewport: { width: 1440, height: 900 } } },
    // BUDG-2: 390 px phone width for the year-plan flow only.
    { name: 'w390', testMatch: /budg-2\.spec\.ts/, use: { viewport: { width: 390, height: 844 } } },
  ],
});
