// BUDG-6 H-1 / R-1: who gets the chef view, and the way back to one's own budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceFor } from '../../lib/shell/nav';
import { displayListName, SHARED_LIST_NAME_MAX } from '../../lib/repo/sharedListsCore';
import { chooseOwnBudget, ownBudgetChosen, takeOwnBudgetRoute } from '../../lib/shell/ownBudget';

const s = (sharedWithMe: number | null, ownMonths: number | null, memberships: number | null, ownLists?: number | null) => ({ sharedWithMe, ownMonths, memberships, ownLists });

test('H-1 an owner with lists but no month, and a list shared with them, keeps the household shell', () => {
  assert.equal(audienceFor(s(1, 0, 0, 1)), 'household');
  assert.equal(audienceFor(s(1, 0, 0, 1), true), 'household');
});

test('H-1 a user with no month, no list and no membership who is shared a list gets the chef view', () => {
  assert.equal(audienceFor(s(1, 0, 0, 0)), 'chef');
  assert.equal(audienceFor(s(1, 0, 0)), 'chef'); // ownLists not watched: unchanged decision
});

test('H-1 a chef who chooses "Start my own budget" gets the household shell at once, before any month exists', () => {
  assert.equal(audienceFor(s(1, 0, 0, 0), true, true), 'household');
  assert.equal(audienceFor(s(null, null, null, null), true, true), 'household');
});

test('H-1 a chef who then has a month of their own gets the household shell', () => {
  assert.equal(audienceFor(s(1, 1, 0, 0), true), 'household');
});

test('H-1 revoked: a share that ended before the chef view was shown leaves a household user', () => {
  assert.equal(audienceFor(s(0, 0, 0, 0)), 'household');
});

test('H-1 left: a chef who leaves keeps the chef view ("Access ended" with Start my own budget) until they choose', () => {
  assert.equal(audienceFor(s(0, 0, 0, 0), true), 'chef');
  assert.equal(audienceFor(s(0, 0, 0, 0), true, true), 'household');
});

test('H-1 still loading own lists means no decision yet (no flash of the chef view)', () => {
  assert.equal(audienceFor(s(1, 0, 0, null)), null);
  assert.equal(audienceFor(s(1, null, 0, 0)), null);
});

test('H-1 (c) the shared list name is one plain line of at most 60 characters', () => {
  assert.equal(displayListName('  Weekend\n\tparty  '), 'Weekend party');
  assert.equal(displayListName('abc\u202Eevil\u2066x'), 'abc evil x');
  assert.equal(displayListName(undefined), '');
  const long = displayListName('Your bank asks you to verify your account at a link we send, please do it today or lose access');
  assert.equal(Array.from(long).length <= SHARED_LIST_NAME_MAX, true);
  assert.ok(long.endsWith('…'));
  assert.equal(displayListName('x'.repeat(60)), 'x'.repeat(60));
});

test('H-1 chooseOwnBudget remembers the choice per user and asks for the New month route once', () => {
  assert.equal(ownBudgetChosen('u-1'), false);
  chooseOwnBudget('u-1');
  assert.equal(ownBudgetChosen('u-1'), true);
  assert.equal(ownBudgetChosen('u-2'), false);
  assert.equal(takeOwnBudgetRoute(), true);
  assert.equal(takeOwnBudgetRoute(), false);
});
