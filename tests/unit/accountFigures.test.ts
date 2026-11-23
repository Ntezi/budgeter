import test from 'node:test';
import assert from 'node:assert/strict';

import { accountFigures, accountHint, defaultSource, freeToMove, prefillAmount } from '../../lib/view-models/accountFigures';

const m = (n: number) => `GHS ${n.toFixed(2)}`;
const vm = (cash: Partial<{ current: number; unallocated: number }>, budget: Partial<{ allocated: number; funded: number; unfunded: number; spentFrom: number }>, id = 'a', archived = false) => ({
  accountId: id,
  archived,
  cash: { opening: 0, movementAllTime: 0, current: 0, currentAuto: 0, currentManual: null, unallocated: 0, topUpNeeded: 0, periodInflow: 0, periodOutflow: 0, periodNet: 0, transferIn: 0, transferOut: 0, ...cash },
  budget: { allocated: 0, funded: 0, unfunded: 0, spentFrom: 0, remaining: 0, ...budget },
});

test('BUDG-8 S8: renamed figures equal the old view-model figures', () => {
  const v = vm({ current: 2900, unallocated: 1350 }, { allocated: 1550, funded: 1450, unfunded: 100, spentFrom: 120 });
  const f = accountFigures(v);
  assert.equal(f.balance, v.cash.current); // Current
  assert.equal(f.setAside, v.budget.allocated); // Allocated
  assert.equal(f.movedIn, v.budget.funded); // Funded
  assert.equal(f.stillToMove, v.budget.unfunded); // Unfunded
  assert.equal(f.spent, v.budget.spentFrom); // Spent
  assert.equal(f.notPlanned, v.cash.unallocated); // Unallocated cash
  assert.equal(f.freeToMove, 1350);
});

test('BUDG-8 S8: free to move is the old transferableAmount formula', () => {
  // old: unallocated > 0 ? unallocated : max(0, current)
  for (const [current, unallocated, want] of [[500, 200, 200], [500, 0, 500], [500, -50, 500], [-20, -50, 0], [0, 0, 0]] as const) {
    const old = unallocated > 0 ? unallocated : Math.max(0, current);
    assert.equal(freeToMove(vm({ current, unallocated }, {})), old);
    assert.equal(old, want);
  }
  assert.equal(freeToMove(null), 0);
});

test('BUDG-8 S8: one hint per account, most urgent first', () => {
  assert.deepEqual(accountHint(vm({ current: -100, unallocated: -100 }, { unfunded: 50 }), m), { tone: 'danger', text: 'Overdrawn by GHS 100.00' });
  assert.deepEqual(accountHint(vm({ current: 10 }, { unfunded: 100 }), m), { tone: 'warning', text: 'GHS 100.00 still to move here' });
  assert.deepEqual(accountHint(vm({ current: 10, unallocated: -40 }, {}), m), { tone: 'danger', text: 'GHS 40.00 more planned than you have' });
  assert.deepEqual(accountHint(vm({ current: 10, unallocated: 10 }, {}), m), { tone: 'muted', text: 'All set' });
});

test('BUDG-8 S8: Move money pre-fill picks the richest other account and caps at its free amount', () => {
  const rows = [vm({ current: 50, unallocated: 50 }, {}, 'cash'), vm({ current: 2900, unallocated: 1350 }, {}, 'bank'), vm({ current: 9999, unallocated: 9999 }, {}, 'old', true), vm({}, { unfunded: 100 }, 'to')];
  assert.equal(defaultSource(rows, 'to')?.accountId, 'bank');
  assert.equal(defaultSource(rows, 'bank')?.accountId, 'cash');
  assert.equal(prefillAmount(rows[1], rows[3]), 100);
  assert.equal(prefillAmount(rows[0], vm({}, { unfunded: 100 })), 50);
  assert.equal(prefillAmount(rows[1], vm({}, {})), 1350); // nothing needed: offer what is free
  assert.equal(prefillAmount(null, rows[3]), 0);
});
