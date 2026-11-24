// BUDG-42: selection, chunking and swipe decisions for fast item removal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chefCanRemove, chunk, clampSwipe, isHorizontalSwipe, pruneSelected, REMOVE_CHUNK, removalWrites, removeConfirmTitle,
  swipeOutcome, SWIPE_DELETE_WIDTH, toggleSelectAll, toggleSelected,
} from '../../lib/rules/shoppingRemoval';

test('chunk keeps every row, in order, under the batch limit', () => {
  const rows = Array.from({ length: 1041 }, (_, i) => i);
  const parts = chunk(rows, REMOVE_CHUNK);
  assert.deepEqual(parts.map((p) => p.length), [400, 400, 241]);
  assert.deepEqual(parts.flat(), rows);
  assert.ok(REMOVE_CHUNK <= 500);
  assert.deepEqual(chunk([], 400), []);
  assert.deepEqual(chunk([1, 2], 0), [[1], [2]]);
});

test('removal writes: private doc and its mirror, nothing else', () => {
  assert.deepEqual(
    removalWrites([{ id: 'a', private: true, shared: true }, { id: 'b', private: true, shared: false }, { id: 'c', private: false, shared: true }, { id: '', private: true, shared: true }]),
    [{ id: 'a', where: 'private' }, { id: 'a', where: 'shared' }, { id: 'b', where: 'private' }, { id: 'c', where: 'shared' }]
  );
});

test('swipe: horizontal only, vertical scroll wins', () => {
  assert.equal(isHorizontalSwipe(-40, 5), true);
  assert.equal(isHorizontalSwipe(-40, 25), false); // mostly vertical
  assert.equal(isHorizontalSwipe(-8, 0), false); // a tap jitter
  assert.equal(isHorizontalSwipe(0, -200), false);
});

test('swipe outcome: past 40% deletes, half the Delete area reveals, less closes', () => {
  assert.equal(swipeOutcome(-160, 390), 'delete');
  assert.equal(swipeOutcome(-155, 390), 'reveal');
  assert.equal(swipeOutcome(-SWIPE_DELETE_WIDTH / 2, 390), 'reveal');
  assert.equal(swipeOutcome(-20, 390), 'close');
  assert.equal(swipeOutcome(30, 390), 'close');
  assert.equal(clampSwipe(50, 390), 0);
  assert.equal(clampSwipe(-900, 390), -390);
});

test('selection: toggle, select all / none, prune gone ids', () => {
  assert.deepEqual(toggleSelected([], 'a'), ['a']);
  assert.deepEqual(toggleSelected(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleSelectAll(['a'], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(toggleSelectAll(['a', 'b'], ['a', 'b']), []);
  assert.deepEqual(toggleSelectAll([], []), []);
  const same = ['a'];
  assert.equal(pruneSelected(same, ['a', 'b']), same);
  assert.deepEqual(pruneSelected(['a', 'c'], ['a', 'b']), ['a']);
});

test('copy and chef rule', () => {
  assert.equal(removeConfirmTitle(3, 'Weekly groceries'), 'Remove 3 items from Weekly groceries?');
  assert.equal(removeConfirmTitle(1, ''), 'Remove 1 item from this list?');
  assert.equal(chefCanRemove({ createdBy: 'chef' }, 'chef'), true);
  assert.equal(chefCanRemove({ createdBy: 'owner' }, 'chef'), false);
  assert.equal(chefCanRemove({}, ''), false);
});
