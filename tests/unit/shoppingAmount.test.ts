// BUDG-6 R-3: Record expense from a shopping list stores an exact amount (lib/money.ts, ADR-1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { exactShoppingAmount } from '../../lib/repo/shoppingExpense';
import { parseMinorInput } from '../../lib/money';

test('R-3 two decimals or fewer are stored exactly', () => {
  assert.equal(exactShoppingAmount(12.5), 12.5);
  assert.equal(exactShoppingAmount(1.01), 1.01);
  assert.equal(exactShoppingAmount(1234.56), 1234.56);
  assert.equal(exactShoppingAmount(0.1 + 0.2), 0.3); // float noise is not a third decimal
});

test('R-3 three decimals are refused, not rounded', () => {
  assert.throws(() => exactShoppingAmount(12.345), /at most two decimals/);
  assert.throws(() => exactShoppingAmount(2.675), /at most two decimals/);
});

test('R-3 .005 inputs are refused (no half-cent rounding either way)', () => {
  assert.throws(() => exactShoppingAmount(1.005), /at most two decimals/);
  assert.throws(() => exactShoppingAmount(0.005), /at most two decimals/);
  assert.throws(() => exactShoppingAmount(10.005), /at most two decimals/);
});

test('R-3 zero, negative and non-numbers are refused', () => {
  assert.throws(() => exactShoppingAmount(0), /more than zero/);
  assert.throws(() => exactShoppingAmount(-3), /more than zero/);
  assert.throws(() => exactShoppingAmount(Number.NaN), /not a number/);
});

test('R-3 the form refuses typed text with more than two decimals', () => {
  assert.equal(parseMinorInput('1.005').minor, null);
  assert.equal(parseMinorInput('12.345').minor, null);
  assert.equal(parseMinorInput('12.34').minor, 1234);
  assert.equal(parseMinorInput('0.005').minor, null);
});
