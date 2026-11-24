// BUDG-40 AC-2 (F-2) budget choice in the expense forms: default from the date, sticky manual choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetOptions, chosenBudgetId, openBudgetIds } from '../../lib/rules/budgetChoice';

const rows = [
  { id: '2026-06', status: 'DRAFT' },
  { id: '2026-07', status: 'DRAFT' },
  { id: '2026-05', status: 'DECIDED' },
  { id: 'not-a-month', status: 'DRAFT' },
];

test('AC-2 default budget is the month of the date; none for an invalid date', () => {
  assert.equal(chosenBudgetId('2026-06-27', null), '2026-06');
  assert.equal(chosenBudgetId(' 2026-07-01 ', undefined), '2026-07');
  assert.equal(chosenBudgetId('2026-13-01', null), '');
  assert.equal(chosenBudgetId('', null), '');
});

test('AC-2 a manual choice sticks whatever the date does; the date is not changed', () => {
  const manual = '2026-07';
  for (const date of ['2026-06-27', '2026-05-02', '2026-08-15', 'bad']) assert.equal(chosenBudgetId(date, manual), '2026-07');
  assert.equal(chosenBudgetId('2026-06-27', 'garbage'), '2026-06', 'an invalid choice falls back to the date');
});

test('AC-2 options: open existing months only, newest first', () => {
  assert.deepEqual(openBudgetIds(rows), ['2026-07', '2026-06']);
  assert.deepEqual(budgetOptions(rows, '2026-06'), [
    { value: '2026-07', label: 'July 2026' },
    { value: '2026-06', label: 'June 2026' },
  ]);
});

test('AC-2 a closed or missing month of the date is shown, marked, never offered as open', () => {
  assert.deepEqual(budgetOptions(rows, '2026-05')[0], { value: '2026-05', label: 'May 2026 (closed)' });
  assert.deepEqual(budgetOptions(rows, '2026-09')[0], { value: '2026-09', label: 'September 2026 (no budget yet)' });
  assert.equal(budgetOptions(rows, '2026-09').length, 3);
  assert.deepEqual(budgetOptions([], ''), []);
});
