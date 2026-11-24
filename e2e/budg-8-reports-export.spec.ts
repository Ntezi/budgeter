// BUDG-8 S14 C-10: export files stay the same for the same month. Run once on the old Reports screen
// (EXPORT_UI=old) and once on the redesign (default); both write sheet names and row counts per file.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Download, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { monthIdFromDate } from '../lib/rules/months';
import { EVIDENCE, reseed, signIn } from './helpers';

const CUR = monthIdFromDate(new Date());
const UI = process.env.EXPORT_UI === 'old' ? 'old' : 'new';

test.beforeAll(() => reseed());

async function shape(download: Download) {
  const file = await download.path();
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  return {
    file: download.suggestedFilename(),
    sheets: wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false }).length })),
  };
}

async function grab(page: Page, click: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), click()]);
  return shape(download);
}

test(`S14 export shape for ${CUR} (${UI} screen)`, async ({ page }, info) => {
  test.setTimeout(240_000);
  const guard = await signIn(page, info);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/reports?month=${CUR}`);
  const out: Record<string, unknown> = { month: CUR, ui: UI };
  if (UI === 'old') {
    const title = new Date(`${CUR}-15`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const card = page.locator('div').filter({ hasText: title }).filter({ has: page.getByRole('button', { name: 'Export Full' }) }).last();
    await expect(card).toBeVisible({ timeout: 60_000 });
    out.summary = await grab(page, () => card.getByRole('button', { name: 'Export Core' }).click());
    out.everything = await grab(page, () => card.getByRole('button', { name: 'Export Full' }).click());
    out.accounts = await grab(page, () => page.getByRole('button', { name: 'Export Excel' }).click());
  } else {
    await expect(page.getByTestId('reports')).toBeVisible({ timeout: 60_000 });
    const openSheet = async () => {
      await page.getByRole('button', { name: 'Export', exact: true }).first().click();
      await expect(page.getByTestId('export-sheet')).toBeVisible();
    };
    const sheet = page.getByTestId('export-sheet');
    await openSheet();
    await sheet.getByRole('radio', { name: /^Summary/ }).click();
    out.summary = await grab(page, () => sheet.getByRole('button', { name: 'Download .xlsx' }).click());
    await sheet.getByRole('radio', { name: /^Everything/ }).click();
    out.everything = await grab(page, () => sheet.getByRole('button', { name: 'Download .xlsx' }).click());
    out.accounts = await grab(page, () => sheet.getByRole('button', { name: 'Download accounts' }).click());
  }
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, `S14-export-shape-${UI}.json`), JSON.stringify(out, null, 2));
  guard.assertOnlyLoopback();
});

test('S14 Reports: four cards at 5 widths, light and dark, no clipped money, export sheet keyboard', async ({ page }, info) => {
  test.skip(UI === 'old', 'layout checks run on the redesign only');
  test.setTimeout(400_000);
  const guard = await signIn(page, info);
  const measures: Record<string, unknown> = {};
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.localStorage.setItem('budgeter:theme', t), theme);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto(`/reports?month=${CUR}`);
      await expect(page.getByTestId('report-spend')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('report-spend').getByText('Needs', { exact: true })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const clipped: string[] = [];
        document.querySelectorAll('div').forEach((el) => {
          if (el.children.length) return;
          const t = (el.textContent || '').trim();
          if (!/\d[\d,]*\.\d\d/.test(t) || (el as HTMLElement).offsetParent === null) return;
          const r = el.getBoundingClientRect();
          if (el.scrollWidth > el.clientWidth + 1 || r.right > window.innerWidth + 1) clipped.push(t.slice(0, 40));
        });
        return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, clipped };
      });
      expect(m.scrollWidth, `page scroll at ${width}`).toBeLessThanOrEqual(m.innerWidth);
      expect(m.clipped, `clipped at ${width}`).toEqual([]);
      if (width < 768) {
        const small = await page.getByTestId('reports').locator('[role=button], [role=radio], input').evaluateAll((els) =>
          els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => ({ n: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 30), r: el.getBoundingClientRect() })).filter((x) => x.r.width < 44 || x.r.height < 44).map((x) => x.n)
        );
        expect(small, `small targets at ${width}`).toEqual([]);
      }
      measures[`w${width}-${theme}`] = m;
      await page.screenshot({ path: path.join(EVIDENCE, `S14-reports-w${width}-${theme}.png`) });
      if (width >= 768) await page.screenshot({ path: path.join(EVIDENCE, `S14-reports-full-w${width}-${theme}.png`), fullPage: true });
      const trigger = page.getByRole('button', { name: 'Export', exact: true }).first();
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('export-sheet')).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(EVIDENCE, `S14-export-sheet-w${width}-${theme}.png`) });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('export-sheet')).toHaveCount(0);
      await expect.poll(() => trigger.evaluate((el) => el === document.activeElement || el.contains(document.activeElement))).toBe(true);
    }
  }
  // States once: month not started (viewing never creates it).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reports?month=2030-01');
  await expect(page.getByTestId('report-not-started')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('No plan or spending for January.')).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE, 'S14-not-started-w390-dark.png') });
  fs.writeFileSync(path.join(EVIDENCE, 'S14-measurements.json'), JSON.stringify(measures, null, 2));
  guard.assertOnlyLoopback();
});
