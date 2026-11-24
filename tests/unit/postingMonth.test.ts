import test from 'node:test';
import assert from 'node:assert/strict';
import { isDateISO, localDateISO, postingPeriodId } from '../../lib/rules/postingMonth';

test('AC-5 localDateISO uses the local day at 23:30, not UTC', () => {
  const lateEvening = new Date(2026, 10, 30, 23, 30);
  assert.equal(localDateISO(lateEvening), '2026-11-30');
  assert.equal(localDateISO(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(localDateISO(new Date(2027, 0, 1, 0, 5)), '2027-01-01');
});

test('AC-5 posting month is the month of the expense date', () => {
  assert.equal(postingPeriodId('2026-11-30'), '2026-11');
  assert.equal(postingPeriodId('2027-01-01'), '2027-01');
  assert.throws(() => postingPeriodId('2026-02-30'));
  assert.throws(() => postingPeriodId('30/11/2026'));
  assert.equal(isDateISO('2028-02-29'), true);
  assert.equal(isDateISO('2027-02-29'), false);
});
