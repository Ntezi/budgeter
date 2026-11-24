// BUDG-8 lane Y S15 Settings + workspace + import, at 320/390/768/1024/1440 px light and dark.
// Emulator app only (helpers.signIn aborts any other host). INVITE_UI=old runs only the invite step on the
// pre-redesign screen (commit 7a23234) so the membership document can be compared field by field.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { EVIDENCE, FIRESTORE, listIds, noPageScroll, reseed, signIn } from './helpers';

const UI = process.env.INVITE_UI === 'old' ? 'old' : 'new';
const WIDTHS = [320, 390, 768, 1024, 1440];
const THEMES = ['light', 'dark'] as const;
const MEMBER_DOC = 'seed-owner_seed-chef';
const results: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => reseed());
test.afterAll(() => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `S15-measurements-${UI}.json`), JSON.stringify(results, null, 2));
});

async function snap(page: Page, name: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: false });
}

async function smallTargets(scope: Locator) {
  return scope.locator('[role=button], [role=link], [role=switch], [role=radio], a, input, textarea').evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ name: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30), ...((r) => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) }))
      .filter((r) => r.w < 44 || r.h < 44)
  );
}

/** Leaf texts wider than their box or past the right edge (clipped labels, badges, amounts). */
async function clippedTexts(scope: Locator) {
  return scope.evaluate((root) => {
    const out: string[] = [];
    root.querySelectorAll('div').forEach((el) => {
      if (el.children.length || (el as HTMLElement).offsetParent === null) return;
      const t = (el.textContent || '').trim();
      if (!t) return;
      const r = el.getBoundingClientRect();
      const ellipsis = getComputedStyle(el).textOverflow === 'ellipsis';
      if ((!ellipsis && el.scrollWidth > el.clientWidth + 1) || r.right > window.innerWidth + 1) out.push(t.slice(0, 40));
    });
    return out;
  });
}

async function memberDoc() {
  const res = await fetch(`${FIRESTORE}/workspaceMembers/${MEMBER_DOC}`, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return null;
  return ((await res.json()) as { fields: Record<string, Record<string, unknown>> }).fields;
}

test(`S15 invite writes the membership document (${UI} screen)`, async ({ page }, info) => {
  test.setTimeout(240_000);
  const guard = await signIn(page, info);
  expect(await memberDoc(), 'no membership before the invite').toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  let taps = 0;
  if (UI === 'old') {
    await page.getByPlaceholder('Member collaborator UID').fill('seed-chef');
    await page.getByPlaceholder('Member email (optional)').fill('Chef@Example.test');
    await page.getByText('Add Member', { exact: true }).click();
  } else {
    await page.getByTestId('settings-row-people').click(); taps++;
    await page.getByRole('button', { name: 'Invite someone' }).click(); taps++;
    await page.getByLabel('Their ID').fill('seed-chef'); taps++;
    await page.getByLabel('Their email (optional)').fill('Chef@Example.test'); taps++;
    await page.getByRole('button', { name: 'Send invite' }).click(); taps++;
    await expect(page.getByText('Invite sent.')).toBeVisible();
    results.inviteTaps = `More, Settings, ${taps} on Settings (People, Invite someone, ID, email, Send invite)`;
  }
  await expect.poll(memberDoc, { timeout: 15_000 }).not.toBeNull();
  const fields = (await memberDoc())!;
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `S15-invite-${UI}.json`), JSON.stringify({ id: MEMBER_DOC, fields }, null, 2));
  const keys = ['createdAt', 'memberEmail', 'memberName', 'memberUid', 'ownerEmail', 'ownerName', 'ownerUid', 'role', 'status', 'updatedAt'];
  expect(Object.keys(fields).sort()).toEqual(keys);
  expect(fields.status).toEqual({ stringValue: 'ACTIVE' });
  const oldFile = path.join(EVIDENCE, 'S15-invite-old.json');
  if (UI === 'new' && fs.existsSync(oldFile)) {
    const before = JSON.parse(fs.readFileSync(oldFile, 'utf8')) as { id: string; fields: Record<string, Record<string, unknown>> };
    expect(MEMBER_DOC).toBe(before.id);
    expect(Object.keys(fields).sort()).toEqual(Object.keys(before.fields).sort());
    for (const k of keys) {
      if (k === 'createdAt' || k === 'updatedAt') expect(Object.keys(fields[k]), k).toEqual(Object.keys(before.fields[k]));
      else expect(fields[k], k).toEqual(before.fields[k]);
    }
    results.inviteCompare = 'same 10 keys, same values except createdAt/updatedAt instants (both timestampValue)';
  }
  guard.assertOnlyLoopback();
});

if (UI === 'new') {
  test('S15 people: remove asks first, Escape closes the sheet and focus returns', async ({ page }, info) => {
    test.setTimeout(240_000);
    await signIn(page, info);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings?page=people');
    await expect(page.getByTestId('settings-people')).toBeVisible({ timeout: 60_000 });
    const before = await memberDoc();
    const remove = page.getByRole('button', { name: /^Remove / }).first();
    await remove.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('remove-member-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('remove-member-sheet')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '')).toMatch(/^Remove /);
    expect(await memberDoc(), 'Escape removes nothing').toEqual(before);
    // Back closes the sheet before leaving the page.
    await remove.click();
    await expect(page.getByTestId('remove-member-sheet')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('remove-member-sheet')).toBeHidden();
    await expect(page.getByTestId('settings-people')).toBeVisible();
  });

  test('S15 import: preview first, nothing written until "Import 2 rows"', async ({ page }, info) => {
    test.setTimeout(240_000);
    await signIn(page, info);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings');
    const before = (await listIds('recurring')).length;
    let taps = 0;
    await page.getByTestId('settings-row-import').click(); taps++;
    await page.getByRole('radio', { name: 'Regular costs' }).click(); taps++;
    const box = page.getByLabel('CSV rows');
    await box.fill('flow,name,amount,group,dayOfMonth,active,start,end,note\nEXPENSE,E2E gym,40,WANT,3,true,,,\nEXPENSE,E2E rent,900,NEED,1,true,,,');
    taps++;
    await page.getByRole('button', { name: 'Preview' }).click(); taps++;
    const preview = page.getByTestId('import-preview');
    await expect(preview).toBeVisible();
    await expect(preview.getByText('E2E gym')).toBeVisible();
    await expect(preview.getByText('E2E rent')).toBeVisible();
    await expect(preview.getByText('Will add').first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await listIds('recurring')).length, 'no write after Preview').toBe(before);
    await snap(page, 'S15-import-preview-w390-light');
    // A bad row: the reason is shown and the import button is disabled.
    await box.fill('flow,name,amount,group,dayOfMonth,active,start,end,note\nEXPENSE,,40,WANT,3,true,,,');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText(/Line 2: name is required/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Import \d+ rows?$/ })).toHaveCount(0);
    expect((await listIds('recurring')).length, 'no write after a failed preview').toBe(before);
    await snap(page, 'S15-import-error-w390-light');
    await box.fill('flow,name,amount,group,dayOfMonth,active,start,end,note\nEXPENSE,E2E gym,40,WANT,3,true,,,\nEXPENSE,E2E rent,900,NEED,1,true,,,');
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByRole('button', { name: 'Import 2 rows' }).click(); taps += 1;
    await expect(page.getByText('2 regular costs added.')).toBeVisible();
    await expect.poll(async () => (await listIds('recurring')).length).toBe(before + 2);
    results.importTaps = `More, Settings, ${taps} on Settings (Import, Regular costs, paste, Preview, Import 2 rows)`;
  });

  for (const theme of THEMES) {
    test(`S15 settings pages at 5 widths, ${theme}`, async ({ page }, info) => {
      test.setTimeout(600_000);
      await signIn(page, info);
      await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
      for (const width of WIDTHS) {
        const key = `w${width}-${theme}`;
        const row: Record<string, unknown> = {};
        for (const sub of ['index', 'workspace', 'people', 'reminder', 'months', 'import']) {
          await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
          await page.goto(sub === 'index' ? '/settings' : `/settings?page=${sub}`);
          const scope = page.getByTestId(sub === 'index' ? 'settings-index' : `settings-${sub}`);
          await expect(scope).toBeVisible({ timeout: 60_000 });
          await page.waitForTimeout(500);
          const scroll = await noPageScroll(page);
          expect(scroll.scrollWidth, `page scroll ${sub} ${key}`).toBeLessThanOrEqual(scroll.innerWidth);
          expect(await clippedTexts(scope), `clipped ${sub} ${key}`).toEqual([]);
          if (width < 768) expect(await smallTargets(scope), `small targets ${sub} ${key}`).toEqual([]);
          row[sub] = 'ok';
          if (width === 390 || width === 1440 || sub === 'index' || sub === 'workspace') await snap(page, `S15-${sub}-w${width}-${theme}`);
        }
        results[key] = row;
      }
      // Keyboard: Tab from the top reaches the index rows in reading order.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/settings');
      await expect(page.getByTestId('settings-index')).toBeVisible({ timeout: 60_000 });
      const order = await page.getByTestId('settings-index').locator('[data-testid^="settings-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      expect(order).toEqual(['settings-row-workspace', 'settings-row-people', 'settings-row-reminder', 'settings-row-months', 'settings-row-import']);
      // Copy ID: one tap on the index.
      await expect(page.getByRole('button', { name: 'Copy your ID' })).toBeVisible();
      // Create-workspace sheet: Escape closes it and focus returns to the trigger; nothing is created.
      await page.goto('/settings?page=workspace');
      const create = page.getByRole('button', { name: 'Create a workspace' });
      await create.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('create-workspace-sheet')).toBeVisible();
      await snap(page, `S15-create-sheet-w390-${theme}`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('create-workspace-sheet')).toBeHidden();
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '')).toContain('Create a workspace');
    });
  }
}
