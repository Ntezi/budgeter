// BUDG-6 H-4: the receipt "new expense" Save is enabled only with account, a line of the purchase month, funded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptNewExpenseProblem } from '../../lib/repo/receiptsCore';

const ok = { accountId: 'acc-1', planItemId: 'plan-1', lineFunded: true, lineInPostingMonth: true };
test('H-4 Save is disabled without a budget line', () => {
  assert.equal(receiptNewExpenseProblem({ ...ok, planItemId: '' }), 'Choose the budget line.');
});
test('H-4 Save is disabled without an account, for a line of another month, or an unfunded line', () => {
  assert.match(receiptNewExpenseProblem({ ...ok, accountId: '' }), /account/);
  assert.match(receiptNewExpenseProblem({ ...ok, lineInPostingMonth: false }), /month/);
  assert.match(receiptNewExpenseProblem({ ...ok, lineFunded: false }), /no money/);
});
test('H-4 Save is enabled with account, line of the month and funded', () => {
  assert.equal(receiptNewExpenseProblem(ok), '');
});
