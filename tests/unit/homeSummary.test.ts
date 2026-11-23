import test from 'node:test';
import assert from 'node:assert/strict';

import { homeSummary, needsYou } from '../../lib/view-models/homeSummary';
const m = (n: number) => `GHS ${n.toFixed(2)}`;
const base = { monthId: '2026-11', todayMonthId: '2026-11', todayDay: 22, daysInMonth: 30, closed: false, planned: 2250, spent: 1177.5 };

test('BUDG-8 S4 Home summary: left to spend, days left, over plan, closed/past/future words', () => {
  const s = homeSummary(base, m);
  assert.equal(s.label, 'Left to spend in November');
  assert.equal(s.amount, 1072.5);
  assert.equal(s.usedPct, 52);
  assert.equal(s.sentence, 'Spent GHS 1177.50 of GHS 2250.00 · 8 days left.');
  const over = homeSummary({ ...base, spent: 2370 }, m);
  assert.equal(over.over, true);
  assert.match(over.sentence, /GHS 120\.00 over plan\.$/);
  assert.equal(over.progress, 100);
  assert.equal(homeSummary({ ...base, closed: true }, m).label, 'November (closed)');
  assert.match(homeSummary({ ...base, closed: true }, m).sentence, /Final numbers\.$/);
  assert.equal(homeSummary({ ...base, todayMonthId: '2026-12' }, m).label, 'Left at month end in November');
  const fut = homeSummary({ ...base, monthId: '2026-12', spent: 0 }, m);
  assert.equal(fut.label, 'Planned for December');
  assert.equal(fut.amount, 2250);
});

test('BUDG-8 S4 Needs you: overdrawn, unlinked costs, next month from day 25; empty when nothing; max 3', () => {
  const n = { monthId: '2026-11', todayMonthId: '2026-11', todayDay: 10, overdraftCount: 0, unlinkedSpent: 0, unlinkedCount: 0, nextMonthExists: true };
  assert.deepEqual(needsYou(n, m), []);
  const all = needsYou({ ...n, todayDay: 26, overdraftCount: 1, unlinkedCount: 2, unlinkedSpent: 30, nextMonthExists: false }, m);
  assert.deepEqual(all.map((x) => x.id), ['overdrawn', 'unlinked', 'next-month']);
  assert.equal(all[2].href, '/budgets/2026-12');
  assert.equal(all[2].title, "Start December's plan");
  assert.equal(needsYou({ ...n, todayDay: 26, nextMonthExists: false, monthId: '2026-10' }, m).length, 0);
});
