import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chipLabel, monthChipParams, monthStatus, viewedMonthId, yearMonths } from '../../lib/shell/monthChip';

test('S1 MonthChip: viewed month from ?month=, else active period, else this local month', () => {
  const now = new Date(2026, 10, 23, 23, 30);
  assert.equal(viewedMonthId('2026-09', '2026-11', now), '2026-09');
  assert.equal(viewedMonthId('2026-13', '2026-10', now), '2026-10');
  assert.equal(viewedMonthId(undefined, null, now), '2026-11');
});

test('S1 MonthChip: label and status (Open / Closed / Not started)', () => {
  assert.equal(chipLabel('2026-11'), 'Nov 2026');
  const periods = [{ id: '2026-10', status: 'DECIDED' }, { id: '2026-11', status: 'DRAFT' }];
  assert.equal(monthStatus(periods, '2026-10'), 'CLOSED');
  assert.equal(monthStatus(periods, '2026-11'), 'OPEN');
  assert.equal(monthStatus(periods, '2026-12'), 'NOT_STARTED');
  assert.deepEqual(yearMonths(2026).slice(0, 2), ['2026-01', '2026-02']);
});

test('S1 MonthChip writes only ?month= and never calls the repository', () => {
  assert.deepEqual(monthChipParams('2026-12'), { month: '2026-12' });
  assert.throws(() => monthChipParams('2026-1'));
  const src = fs.readFileSync(path.resolve('components/shell/MonthChip.tsx'), 'utf8');
  const repoImports = [...src.matchAll(/import \{([^}]*)\} from '@\/lib\/repo\/[^']+'/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
  assert.deepEqual(repoImports.sort(), ['type PeriodDoc', 'watchPeriods'].sort(), 'MonthChip may only read periods');
  assert.ok(!/createPeriod|setPeriod(?:Status|Title)\b|addTransaction|getOrCreatePeriod/.test(src), 'no write call in MonthChip');
  assert.match(src, /router\.setParams\(monthChipParams\(/);
});
