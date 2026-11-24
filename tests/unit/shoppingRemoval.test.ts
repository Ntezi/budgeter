// BUDG-42: selection, chunking and copy for fast item removal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chefCanRemove, chunk, pruneSelected, REMOVE_CHUNK, removalWrites, removeConfirmTitle, toggleSelectAll, toggleSelected,
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
