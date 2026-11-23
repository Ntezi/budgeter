import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { emulatorPorts } from '../lib/emulatorPorts';

export const FIRESTORE = `http://127.0.0.1:${emulatorPorts().firestore}/v1/projects/demo-budgeta/databases/(default)/documents`;
export const OWNER = { uid: 'seed-owner', email: 'owner@example.test', password: 'seed-owner-pass' };
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const EVIDENCE = process.env.BUDG_EVIDENCE_DIR || path.resolve('test-results/evidence');

export function reseed() {
  execFileSync(process.execPath, ['scripts/emulators/seed.mjs'], { stdio: 'inherit' });
}

/** Admin read through the emulator REST API ("Bearer owner" bypasses rules, emulator only). */
export async function listIds(...segments: string[]) {
  const res = await fetch(`${FIRESTORE}/${['users', OWNER.uid, ...segments].join('/')}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const body = (await res.json()) as { documents?: { name: string; fields: Record<string, any> }[] };
  return (body.documents ?? []).map((d) => ({ id: d.name.split('/').pop()!, fields: d.fields }));
}

/** Installs the host guard, marks onboarding done and signs in as the seeded owner. */
export async function signIn(page: Page, testInfo: TestInfo, who: { email: string; password: string } = OWNER) {
  const hosts = new Set<string>();
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    hosts.add(url.host);
    if (LOOPBACK.has(url.hostname)) return route.continue();
    blocked.push(url.href);
    return route.abort();
  });
  await page.addInitScript(() => window.localStorage.setItem('budgeter:onboarding-complete', 'true'));
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).__budgetaEmulatorSignIn === 'function', null, { timeout: 90_000 });
  await page.evaluate(({ email, password }) => (window as any).__budgetaEmulatorSignIn(email, password), who);
  await page.waitForURL(/\/(dashboard|shopping|budgets|transactions)/, { timeout: 60_000 });
  return {
    assertOnlyLoopback: () => {
      fs.mkdirSync(EVIDENCE, { recursive: true });
      fs.appendFileSync(path.join(EVIDENCE, 'AC-1-network-hosts.jsonl'), JSON.stringify({ test: testInfo.title, project: testInfo.project.name, hosts: [...hosts].sort(), blocked }) + '\n');
      expect(blocked, 'requests to non-loopback hosts').toEqual([]);
    },
  };
}

export async function shot(page: Page, testInfo: TestInfo, name: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(EVIDENCE, `${name}-${testInfo.project.name}.png`), fullPage: true });
}

export async function noPageScroll(page: Page) {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
}
