#!/usr/bin/env node
// BUDG-8 token guard (briefs/redesign/00 "Tokens kept", 10 "Checks every slice must pass" 1).
// Colors, font families and font sizes are kept; spacing and component sizes are free.
// Fails when a line added since the base adds:
//   - a hex / rgb() / rgba() / hsl() / hsla() color value not already used at the base,
//   - a Tailwind color utility (bg-, text-, border-, ring-, ...) not already used at the base,
//   - a font size other than text-xxs|xs|sm|base|lg|xl|2xl|3xl, text-[10px], text-[11px], fontSize 10/11,
//   - any font family (fontFamily, font-[..], font-serif, font-mono),
// and when tailwind.config.js or global.css differ from the base.
// Base: TOKEN_BASE env, else `git merge-base HEAD develop`. Usage: node scripts/check-tokens.mjs [--self-test]
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const SCAN = /^(app|components|lib|providers)\/.*\.(tsx?|jsx?|css)$/;
const SIZES = new Set(['xxs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '[10px]', '[11px]']);
const COLOR_PREFIX = '(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|divide|outline|from|via|to|placeholder|fill|stroke|shadow|decoration|accent|caret)';
const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white|transparent|current|inherit';
const TOKENS = 'background|foreground|card|card-foreground|muted|muted-foreground|accent|accent-foreground|border|input|input-background|primary|primary-foreground|secondary|secondary-foreground|destructive|success|needs|wants|savings|sidebar|sidebar-foreground|sidebar-accent';
const COLOR_CLASS = new RegExp(`(?<![\\w-])(?:[a-z0-9-]+:)*(${COLOR_PREFIX})-((?:${PALETTE})(?:-\\d{2,3})?|(?:${TOKENS})|\\[[^\\]]+\\])(?:\\/[\\d.]+)?(?![\\w-])`, 'g');
const COLOR_VALUE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;

const norm = (v) => v.toLowerCase().replace(/\s+/g, '');
const stripVariants = (cls) => cls.replace(/^(?:[a-z0-9-]+:)+/, '');

export function colorClasses(line) {
  return [...line.matchAll(COLOR_CLASS)].map((m) => stripVariants(m[0])).filter((c) => {
    if (!c.startsWith('text-')) return true;
    const v = c.slice(5);
    return !SIZES.has(v) && !/^\d?xl$|^\[\d+px\]$/.test(v) && !/^(left|right|center|justify)$/.test(v);
  });
}

export function scanLine(line, allowed) {
  const problems = [];
  for (const v of line.match(COLOR_VALUE) || []) if (!allowed.values.has(norm(v))) problems.push(`new color value ${v}`);
  for (const c of colorClasses(line)) if (!allowed.classes.has(c)) problems.push(`new color utility ${c}`);
  for (const m of line.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*text-(\d?xl|xxs|xs|sm|base|lg|\[[^\]]+\])(?![\w-])/g)) {
    if (!SIZES.has(m[1])) problems.push(`font size text-${m[1]} outside the kept list`);
  }
  for (const m of line.matchAll(/fontSize\s*[:=]\s*\{?\s*(\d+)/g)) if (!['10', '11'].includes(m[1])) problems.push(`fontSize ${m[1]} outside the kept list`);
  if (/fontFamily|(?<![\w-])font-(?:\[|serif\b|mono\b)/.test(line)) problems.push('font family');
  return problems;
}

function allowedAtBase(base) {
  const values = new Set();
  const classes = new Set();
  const files = git('ls-tree', '-r', '--name-only', base).split('\n').filter((f) => SCAN.test(f) || f === 'tailwind.config.js');
  for (const f of files) {
    const text = git('show', `${base}:${f}`);
    for (const v of text.match(COLOR_VALUE) || []) values.add(norm(v));
    for (const line of text.split('\n')) for (const c of colorClasses(line)) classes.add(c);
  }
  return { values, classes };
}

function selfTest() {
  const allowed = { values: new Set(['#717182', 'rgba(0,0,0,0.1)']), classes: new Set(['bg-card', 'text-zinc-50', 'bg-black/50']) };
  const cases = [
    ['<View className="bg-card px-7 gap-9 h-11" />', 0],
    ['color="#717182"', 0],
    ['color="#123456"', 1],
    ['className="dark:text-zinc-50 text-sm"', 0],
    ['className="text-sky-500"', 1],
    ['className="bg-black/50"', 0],
    ['className="bg-black/40"', 1],
    ['className="text-4xl"', 1],
    ['className="text-[13px]"', 1],
    ['className="text-[11px] text-xxs text-3xl"', 0],
    ['style={{ fontSize: 14 }}', 1],
    ['style={{ fontFamily: "Inter" }}', 1],
    ['className="font-mono"', 1],
    ['className="font-semibold text-center"', 0],
    ["backgroundColor: 'rgba(1, 2, 3, 0.5)'", 1],
  ];
  let bad = 0;
  for (const [line, expected] of cases) {
    const got = scanLine(line, allowed).length;
    if (got !== expected) { bad++; console.error(`self-test FAIL: ${line} -> ${got} problems, expected ${expected}`); }
  }
  console.log(`check-tokens self-test: ${cases.length - bad}/${cases.length} pass`);
  process.exit(bad ? 1 : 0);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const base = process.env.TOKEN_BASE || git('merge-base', 'HEAD', 'develop').trim();
  let failed = 0;
  const tokenDiff = git('diff', base, '--', 'tailwind.config.js', 'global.css');
  if (tokenDiff.trim()) { failed++; console.error('FAIL token files changed since base: tailwind.config.js / global.css'); }
  const changed = git('diff', '--name-only', '--diff-filter=AMR', base).split('\n').concat(git('ls-files', '--others', '--exclude-standard').split('\n')).filter((f) => SCAN.test(f));
  const allowed = allowedAtBase(base);
  const files = [...new Set(changed)];
  for (const f of files) {
    const untracked = !git('ls-files', f).trim();
    const added = untracked
      ? execFileSync('cat', [f], { encoding: 'utf8' }).split('\n').map((l, i) => [i + 1, l])
      : git('diff', '-U0', base, '--', f).split('\n').reduce((acc, l) => {
          const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
          if (h) acc.n = Number(h[1]);
          else if (l.startsWith('+') && !l.startsWith('+++')) acc.rows.push([acc.n++, l.slice(1)]);
          return acc;
        }, { n: 0, rows: [] }).rows;
    for (const [n, line] of added) for (const p of scanLine(line, allowed)) { failed++; console.error(`FAIL ${f}:${n} ${p}`); }
  }
  console.log(`check-tokens: base ${base.slice(0, 7)} · ${files.length} changed source files scanned · ${allowed.values.size} color values and ${allowed.classes.size} color utilities allowed from base · ${failed} problems`);
  process.exit(failed ? 1 : 0);
}

main();
