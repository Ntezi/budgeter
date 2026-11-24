import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// BUDG-8 design review C-4/C-5: button labels, sheet titles and visible texts are sentence case,
// and "Budget" is not used as the word for a month ("New month"). Guard so screens cannot drift.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

const TITLE_CASE_PROP = /(?<!accessibility)(label|title|actionLabel)=[{]?['"`]([A-Z][a-z]+ [A-Z][a-z]+[^'"`]*)['"`]/g;
const TITLE_CASE_TEXT = />([A-Z][a-z]+ [A-Z][a-z]+)</g;
const ALLOWED = new Set<string>([]);

test('BUDG-8 C-4: no title-case labels or texts in screens and components', () => {
  const found: string[] = [];
  for (const f of [...files('app'), ...files('components')]) {
    const s = readFileSync(f, 'utf8');
    for (const re of [TITLE_CASE_PROP, TITLE_CASE_TEXT]) {
      for (const m of s.matchAll(re)) {
        const text = m[m.length - 1];
        if (!ALLOWED.has(text)) found.push(`${f}: ${text}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test('BUDG-8 C-4: a month is never called "New Budget"', () => {
  const found = [...files('app'), ...files('components')].filter((f) => /['">]New [Bb]udget['"<]/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(found, []);
});
