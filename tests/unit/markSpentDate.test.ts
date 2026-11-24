// BUDG-40 AC-3 (F-4, F-7): Mark as spent writes once per opened line sheet, dated the local day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { localDateISO } from '../../lib/rules/postingMonth';

test('AC-3 Mark as spent at 00:30 local on the 1st is dated the 1st (Africa/Kigali), not the UTC day', () => {
  const saved = process.env.TZ;
  process.env.TZ = 'Africa/Kigali';
  try {
    const halfPastMidnight = new Date('2026-12-01T00:30:00+02:00');
    assert.equal(halfPastMidnight.toISOString().slice(0, 10), '2026-11-30', 'the old UTC default was yesterday, last month');
    assert.equal(localDateISO(halfPastMidnight), '2026-12-01');
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
  const src = readFileSync(path.resolve(__dirname, '../../components/plan/MonthPlanView.tsx'), 'utf8');
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(src), 'Mark as spent no longer takes the UTC day');
  assert.ok(/addTransactionOnce\(uid, pid, markSpentIdRef\.current/.test(src), 'Mark as spent writes once per opened line sheet');
  assert.ok(!/\baddTransaction\(/.test(src), 'the old writer is gone from the Plan view');
});
