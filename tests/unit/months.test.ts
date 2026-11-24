import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonthsToId, choiceActionLabel, defaultChoiceId, monthTitle, newBudgetChoices } from '../../lib/rules/months';

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

test('AC-2 default is the current local month, next month offered', () => {
  const choices = newBudgetChoices(new Date(2026, 10, 23, 12), []);
  assert.equal(defaultChoiceId(choices), '2026-11');
  assert.deepEqual(ids(choices), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
});

test('AC-2 Dec -> Jan rollover by date math', () => {
  const choices = newBudgetChoices(new Date(2026, 11, 31, 23, 30), [{ id: '2026-09' }, { id: '2026-10' }, { id: '2026-11' }]);
  assert.equal(defaultChoiceId(choices), '2026-12');
  assert.deepEqual(ids(choices), ['2026-12', '2027-01']);
  assert.equal(choices[1].title, 'January 2027');
  assert.equal(addMonthsToId('2027-01', -1), '2026-12');
  assert.equal(addMonthsToId('2026-12', 1), '2027-01');
});

test('AC-2 set up January during February (missing past month)', () => {
  const choices = newBudgetChoices(new Date(2027, 1, 10), [{ id: '2026-11', status: 'DECIDED' }, { id: '2026-12', status: 'DECIDED' }]);
  assert.deepEqual(ids(choices), ['2027-01', '2027-02', '2027-03']);
  assert.equal(choices[0].relation, 'PAST');
  assert.equal(choices[0].kind, 'NEW');
  assert.equal(choiceActionLabel(choices[0]), 'Creates January 2027 · blank draft');
});

test('AC-2/AC-3 existing current draft and locked next month are opened, not created', () => {
  const choices = newBudgetChoices(new Date(2026, 10, 1), [
    { id: '2026-11', status: 'DRAFT' },
    { id: '2026-12', status: 'DECIDED' },
    { id: '2026-10' }, { id: '2026-09' }, { id: '2026-08' },
  ]);
  assert.deepEqual(choices.map((c) => [c.id, c.kind]), [['2026-11', 'OPEN_DRAFT'], ['2026-12', 'OPEN_LOCKED']]);
  assert.equal(choiceActionLabel(choices[1]), 'Opens December 2026 · locked, read-only');
});

test('past window is clamped and existing past months are not offered', () => {
  assert.equal(newBudgetChoices(new Date(2026, 5, 1), [], 0).length, 2);
  assert.equal(newBudgetChoices(new Date(2026, 5, 1), [], 99).length, 8);
  assert.equal(monthTitle('bad'), 'bad');
});
