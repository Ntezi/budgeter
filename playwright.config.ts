// End-to-end tests against the local emulator app only (BUDG-1, ADR-2).
// Start the app first with `npm run web:emulators`; every test aborts and
// fails on any request to a host other than localhost/127.0.0.1.
import { defineConfig } from '@playwright/test';
import { emulatorPorts } from './lib/emulatorPorts';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://127.0.0.1:${emulatorPorts().web}`,
    channel: 'chrome',
    headless: true,
    trace: 'off',
  },
  // Every spec runs at 320, 390 and 1440 px (BUDG-6 integration: one w390 project for all specs; budg-8 runs its own widths).
  projects: [
    { name: 'w320', testIgnore: /budg-8/, use: { viewport: { width: 320, height: 740 } } },
    { name: 'w390', testIgnore: /budg-8/, use: { viewport: { width: 390, height: 844 } } },
    { name: 'w1440', testIgnore: /budg-8/, use: { viewport: { width: 1440, height: 900 } } },
    // BUDG-8 shell and Add sheet: the spec sets 320/390/768/1024/1440 and light/dark itself.
    { name: 'budg8', testMatch: /budg-8/, use: { viewport: { width: 390, height: 844 } } },
  ],
});
