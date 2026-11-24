// BUDG-3 pure rules: resolution of a plan line's funding account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountIneligibility,
  linkedLineIdForExpense,
  linkedLineIdForRecurring,
  resolveLineAccount,
  suggestionForSource,
} from '../../lib/rules/defaultAccount';

const CUR = 'GHS';
const accounts = [
  { id: 'acc-household' },
  { id: 'acc-savings', currencyCode: 'GHS' },
  { id: 'acc-old', archived: true },
  { id: 'acc-usd', currencyCode: 'USD' },
];
const linked = { id: 'exp_exp-water', sourceType: 'EXPENSE_ITEM' as const, sourceId: 'exp-water' };

test('AC-1 the link is by doc id: renaming the source keeps the resolution', () => {
  const before = { id: 'exp-water', name: 'Water bill', defaultAccountId: 'acc-household' };
  const renamed = { ...before, name: 'Water and sewage' };
  const r1 = resolveLineAccount({ line: linked, source: before, accounts, appCurrency: CUR });
  const r2 = resolveLineAccount({ line: linked, source: renamed, accounts, appCurrency: CUR });
  assert.deepEqual(r1, { kind: 'SUGGEST', accountId: 'acc-household' });
  assert.deepEqual(r2, r1);
  assert.equal(linkedLineIdForExpense('exp-water'), 'exp_exp-water');
  assert.equal(linkedLineIdForRecurring('rec-internet', '2031-05'), 'recbudget_plan_rec-internet_2031-05');
});

test('SEC-20 ids are built from server ids only: user text with / is refused', () => {
  assert.throws(() => linkedLineIdForExpense('a/b'));
  assert.throws(() => linkedLineIdForExpense('Water bill'));
  assert.throws(() => linkedLineIdForRecurring('rec', '../x'));
});

test('AC-2 a new linked line is suggested the default; an explicit choice wins', () => {
  const source = { id: 'exp-water', defaultAccountId: 'acc-household' };
  assert.deepEqual(suggestionForSource(source, accounts, CUR), { accountId: 'acc-household', reason: null });
  const explicit = { ...linked, plannedAccountId: 'acc-savings', accountChoice: 'EXPLICIT' as const };
  assert.deepEqual(resolveLineAccount({ line: explicit, source, accounts, appCurrency: CUR }), {
    kind: 'ASSIGNED',
    accountId: 'acc-savings',
    choice: 'EXPLICIT',
  });
  const stored = { ...linked, suggestedAccountId: 'acc-savings' };
  assert.deepEqual(resolveLineAccount({ line: stored, source, accounts, appCurrency: CUR }), { kind: 'SUGGEST', accountId: 'acc-savings' });
});

test('AC-3 rule side: a line that applied the old default keeps it after the default changes', () => {
  const applied = { ...linked, plannedAccountId: 'acc-household', accountChoice: 'DEFAULT' as const };
  const changed = { id: 'exp-water', defaultAccountId: 'acc-savings' };
  assert.deepEqual(resolveLineAccount({ line: applied, source: changed, accounts, appCurrency: CUR }), {
    kind: 'ASSIGNED',
    accountId: 'acc-household',
    choice: 'DEFAULT',
  });
});

test('AC-4 missing, archived and other-currency defaults ask for repair, never switch', () => {
  for (const [accountId, reason] of [
    ['acc-gone', 'missing'],
    ['acc-old', 'archived'],
    ['acc-usd', 'ineligible'],
  ] as const) {
    const source = { id: 'exp-water', defaultAccountId: accountId };
    assert.deepEqual(resolveLineAccount({ line: linked, source, accounts, appCurrency: CUR }), { kind: 'REPAIR', accountId, reason });
    assert.deepEqual(suggestionForSource(source, accounts, CUR), { accountId: '', reason });
    const held = { ...linked, plannedAccountId: accountId, accountChoice: 'EXPLICIT' as const };
    const r = resolveLineAccount({ line: held, source: { id: 'exp-water', defaultAccountId: 'acc-household' }, accounts, appCurrency: CUR });
    assert.deepEqual(r, { kind: 'REPAIR', accountId, reason }, 'held account stays, not replaced by the default');
  }
  assert.equal(accountIneligibility('acc-household', accounts, 'ghs'), null, 'no currencyCode = app currency');
});

test('AC-5 unlinked lines keep the existing optional-account behaviour', () => {
  assert.deepEqual(resolveLineAccount({ line: { id: 'plan-x' }, source: null, accounts, appCurrency: CUR }), { kind: 'NONE' });
  assert.deepEqual(resolveLineAccount({ line: { id: 'plan-x', plannedAccountId: 'acc-old' }, source: null, accounts, appCurrency: CUR }), {
    kind: 'ASSIGNED',
    accountId: 'acc-old',
    choice: 'EXPLICIT',
  });
  assert.deepEqual(resolveLineAccount({ line: linked, source: { id: 'exp-water' }, accounts, appCurrency: CUR }), { kind: 'NONE' });
});
