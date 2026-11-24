import test from 'node:test';
import assert from 'node:assert/strict';

import { accountFigures, accountHint, accountsBalanceSummary, defaultSource, freeToMove, prefillAmount } from '../../lib/view-models/accountFigures';
import { buildAccountViewModels } from '../../lib/view-models/useAccountViewModels';

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
  assert.equal(f.actual, v.cash.current); // Current (Actual)
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

// BUDG-40 F-1 (AC-1): the month's balance is cash.current = the hand-set balance when set, else the month's
// calculated balance (funded minus spent); never the all-time report figure (opening + every movement).
test('BUDG-40 F-1: balances use the hand-set figure when set, else the calculated one; Home and Accounts share the summary', () => {
  const PID = '2026-11';
  const accounts = [
    { id: 'bank', name: 'Bank', type: 'BANK', openingBalance: 1000, archived: false },
    { id: 'cash', name: 'Cash', type: 'CASH', openingBalance: 200, archived: false },
    { id: 'momo', name: 'Momo', type: 'MOMO', openingBalance: 0, archived: false },
    { id: 'old', name: 'Old', type: 'OTHER', openingBalance: 777, archived: true },
  ] as any[];
  const planItems = [
    { id: 'rent', group: 'NEED', name: 'Rent', amount: 800, plannedAccountId: 'bank', priority: 1 },
    { id: 'bus', group: 'NEED', name: 'Bus', amount: 150, plannedAccountId: 'cash', priority: 2 },
    { id: 'fun', group: 'WANT', name: 'Fun', amount: 100, plannedAccountId: 'momo', priority: 3 },
  ] as any[];
  const tx = [
    { id: 't1', type: 'EXPENSE', amount: 300, planItemId: 'rent', paidFromAccountId: 'bank', date: `${PID}-02` },
    { id: 't2', type: 'EXPENSE', amount: 50, planItemId: 'bus', paidFromAccountId: 'cash', date: `${PID}-03` },
    { id: 't3', type: 'EXPENSE', amount: 250, planItemId: 'fun', paidFromAccountId: 'momo', date: `${PID}-04` },
  ] as any[];
  const rows = buildAccountViewModels({
    accounts, periodId: PID, planItems, allocations: [], periodTransactions: tx, allTransactions: tx, incomeTotal: 5000,
    currentManualByAccountId: { cash: 180.5 },
  });
  const by = new Map(rows.map((r) => [r.accountId, r]));
  // bank: none hand-set -> calculated 800 - 300 = 500 (the all-time figure would be 1000 - 300 = 700)
  assert.equal(by.get('bank')!.cash.current, 500);
  assert.equal(by.get('bank')!.cash.currentManual, null);
  assert.notEqual(by.get('bank')!.cash.current, by.get('bank')!.cash.opening + by.get('bank')!.cash.movementAllTime);
  // cash: hand-set wins over calculated 150 - 50 = 100
  assert.equal(by.get('cash')!.cash.current, 180.5);
  assert.equal(by.get('cash')!.cash.currentAuto, 100);
  // momo: overspent -> -150, overdrawn
  assert.equal(by.get('momo')!.cash.current, -150);
  assert.deepEqual(accountsBalanceSummary(rows), { total: 530.5, activeCount: 3, overdrawn: 1 });
  assert.equal(accountHint(by.get('momo')!, m).text, 'Overdrawn by GHS 150.00');
});

test('BUDG-40 F-1: summary ignores archived accounts and rows without an id', () => {
  const rows = [vm({ current: -5 }, {}, 'a'), vm({ current: 10 }, {}, 'b'), vm({ current: -999 }, {}, 'old', true), vm({ current: 50 }, {}, '')];
  assert.deepEqual(accountsBalanceSummary(rows as any), { total: 5, activeCount: 2, overdrawn: 1 });
  assert.deepEqual(accountsBalanceSummary([]), { total: 0, activeCount: 0, overdrawn: 0 });
});
