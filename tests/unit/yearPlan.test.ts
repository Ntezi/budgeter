// BUDG-2 pure rules and ADR-1 money helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromMinor, parseMinorInput, sumMinor, toMinor, minorToInput } from '../../lib/money';
import {
  budgetInChoices,
  budgetInOf,
  editPreview,
  itemsByDueMonth,
  offersForDraft,
  upcoming,
  validateYearItem,
  yearLineId,
  yearTotals,
  type YearItem,
} from '../../lib/rules/yearPlan';

const renewal: YearItem = { id: 'yr-a', title: 'Residence card renewal', dueDate: '2027-06-14', budgetInPeriodId: '2027-05', estimateMinor: 15000, group: 'NEED', status: 'ACTIVE', revision: 1 };
const dateOnly: YearItem = { id: 'yr-b', title: 'Visa appointment', dueDate: '2027-05-20' };

test('ADR-1 money: integer minor units, exact sums, 2-decimal writes', () => {
  assert.equal(toMinor(1.005), 101);
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(fromMinor(12345), 123.45);
  assert.throws(() => fromMinor(1.5));
  assert.equal(sumMinor([10, 20, 30]), 60);
  assert.deepEqual(parseMinorInput('1,250.5'), { minor: 125050 });
  assert.deepEqual(parseMinorInput(''), { minor: null });
  assert.ok(parseMinorInput('12.345').error);
  assert.ok(parseMinorInput('abc').error);
  assert.equal(minorToInput(15000), '150.00');
});

test('AC-2 date-only item is valid without an estimate; due date and Budget-in month are separate', () => {
  assert.deepEqual(validateYearItem({ title: 'Visa appointment', dueDate: '2027-05-20' }), []);
  assert.deepEqual(validateYearItem({ title: 'Renewal', dueDate: '2027-06-14', budgetInPeriodId: '2027-05', estimateMinor: 15000, group: 'NEED' }), []);
  assert.equal(budgetInOf(renewal), '2027-05');
  assert.equal(budgetInOf(dateOnly), '2027-05', 'absent Budget-in = due month');
  assert.ok(validateYearItem({ title: '', dueDate: '2027-02-30' }).length >= 2);
  assert.ok(validateYearItem({ title: 'x', dueDate: '2027-01-01', estimateMinor: 12.5 }).length);
  assert.ok(validateYearItem({ title: 'x', dueDate: '2027-01-01', estimateMinor: 0 }).length);
  assert.ok(validateYearItem({ title: 'x', dueDate: '2027-01-01', fundingAccountId: 'a/b' }).length);
  assert.deepEqual(budgetInChoices('2027-06-14'), ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07']);
});

test('AC-3 offersForDraft: only DRAFT months, active items with an estimate budgeted in that month, not linked or skipped', () => {
  const items = [renewal, dateOnly, { ...renewal, id: 'yr-c', status: 'CANCELLED' as const }, { ...renewal, id: 'yr-d', budgetInPeriodId: '2027-06' }, { ...renewal, id: 'yr-e' }, { ...renewal, id: 'yr-f' }];
  const ids = (xs: YearItem[]) => xs.map((x) => x.id);
  assert.deepEqual(ids(offersForDraft('2027-05', { status: 'DRAFT' }, items, [{ id: 'year_yr-e' }], [{ id: 'yr-f', decision: 'SKIPPED' }])), ['yr-a']);
  assert.deepEqual(offersForDraft('2027-05', { status: 'DECIDED' }, items, [], []), []);
  assert.deepEqual(offersForDraft('2027-05', null, items, [], []), [], 'missing month: nothing, never created');
  assert.deepEqual(ids(offersForDraft('2027-05', {}, [renewal], [], [])), ['yr-a'], 'pre-change period without status = DRAFT');
});

test('AC-4 stable link id from the item id only', () => {
  assert.equal(yearLineId('yr-a'), 'year_yr-a');
  assert.throws(() => yearLineId('../x'));
  assert.throws(() => yearLineId('a/b'));
});

test('AC-6 yearTotals counts each item once: linked line amount, else estimate', () => {
  const items = [renewal, { ...renewal, id: 'yr-g', estimateMinor: 5000 }, dateOnly, { ...renewal, id: 'yr-x', status: 'CANCELLED' as const }];
  const lines = [{ id: 'year_yr-a', amount: 160, sourceType: 'YEAR_ITEM', sourceId: 'yr-a', periodId: '2027-05' }, { id: 'plan-rent', amount: 1000, periodId: '2027-05' }];
  const t = yearTotals(items, lines);
  assert.equal(t.totalMinor, 16000 + 5000);
  assert.equal(t.inBudgetsMinor, 16000);
  assert.equal(t.estimatesMinor, 5000);
  assert.notEqual(t.totalMinor, 15000 + 16000 + 5000, 'never annual estimate + linked line');
});

test('AC-6 editPreview: draft update, locked unchanged, moved month offered, nothing else', () => {
  const lines = [
    { id: 'year_yr-a', amount: 150, name: renewal.title, group: 'NEED', periodId: '2027-05' },
    { id: 'year_yr-a', amount: 150, name: renewal.title, group: 'NEED', periodId: '2027-04' },
  ];
  const status = { '2027-05': 'DRAFT', '2027-04': 'DECIDED' };
  const up = editPreview({ ...renewal, estimateMinor: 18000 }, lines, status);
  assert.deepEqual(up.map((r) => [r.pid, r.action, r.from, r.to]), [['2027-04', 'locked-unchanged', 150, 150], ['2027-05', 'update', 150, 180]]);
  const moved = editPreview({ ...renewal, budgetInPeriodId: '2027-03' }, lines, status);
  assert.deepEqual(moved.map((r) => r.action), ['locked-unchanged', 'move-offer']);
  assert.deepEqual(editPreview(renewal, [lines[0]], status), [], 'no change, no row');
  assert.equal(editPreview({ ...renewal, estimateMinor: undefined }, [lines[0]], status)[0].action, 'move-offer');
});

test('AC-1 upcoming window and month grouping', () => {
  const items = [renewal, dateOnly, { ...renewal, id: 'late', dueDate: '2027-09-01' }, { ...renewal, id: 'done', dueDate: '2027-05-25', status: 'DONE' as const }];
  assert.deepEqual(upcoming(items, '2027-05-01', 60).map((i) => i.id), ['yr-b', 'yr-a']);
  const by = itemsByDueMonth(items, 2027);
  assert.equal(Object.keys(by).length, 12);
  assert.deepEqual(by['2027-05'].map((i) => i.id), ['yr-b', 'done']);
});
