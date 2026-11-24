import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFirebaseTarget } from '../../lib/firebaseEmulator';
import { blankPeriodDoc } from '../../lib/repo/periodCreateCore';

test('AC-1 production config without the flag is untouched', () => {
  assert.deepEqual(resolveFirebaseTarget({ projectId: 'some-prod-project' }), { useEmulators: false });
});

test('AC-1 emulator mode resolves loopback targets', () => {
  assert.deepEqual(resolveFirebaseTarget({ useEmulators: '1', projectId: 'demo-budgeta', host: 'localhost' }), {
    useEmulators: true, host: '127.0.0.1', authPort: 9099, firestorePort: 8080,
  });
});

test('AC-1 guard throws on every mismatch', () => {
  assert.throws(() => resolveFirebaseTarget({ useEmulators: '1', projectId: 'some-prod-project' }), /demo-\*/);
  assert.throws(() => resolveFirebaseTarget({ projectId: 'demo-budgeta' }), /requires/);
  assert.throws(() => resolveFirebaseTarget({ useEmulators: 'true', projectId: 'demo-budgeta', host: '10.0.0.5' }), /loopback/);
  assert.throws(() => resolveFirebaseTarget({ useEmulators: '1', projectId: 'demo-budgeta', firestorePort: 'abc' }), /port/);
  assert.throws(() => resolveFirebaseTarget({ useEmulators: '1', projectId: '' }), /demo-\*/);
});

test('AC-3/AC-4 a new period is a blank draft with no undefined fields', () => {
  const data = blankPeriodDoc('2026-12', 'December 2026');
  assert.equal(data.status, 'DRAFT');
  assert.equal(data.incomeTotal, 0);
  assert.ok(Object.values(data).every((v) => v !== undefined));
  assert.deepEqual(Object.keys(blankPeriodDoc('2026-12', 'x', { type: undefined, mode: 'legacy' })).sort(), ['incomeTotal', 'mode', 'periodId', 'status', 'targetPct', 'title']);
});
