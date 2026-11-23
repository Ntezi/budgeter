import test from 'node:test';
import assert from 'node:assert/strict';
import { closeOnPageDiscard } from '../../lib/closeOnPageDiscard';

function fakeWindow() {
  const listeners: ((event: { persisted: boolean }) => void)[] = [];
  return {
    addEventListener: (_type: 'pagehide', l: (event: { persisted: boolean }) => void) => void listeners.push(l),
    fire: (persisted: boolean) => listeners.forEach((l) => l({ persisted })),
  };
}

test('Firestore is closed when the page is discarded (reload, navigation away)', () => {
  const w = fakeWindow();
  let closed = 0;
  closeOnPageDiscard(w, async () => void closed++);
  w.fire(false);
  assert.equal(closed, 1);
});

test('Firestore stays open when the page enters the back/forward cache', () => {
  const w = fakeWindow();
  let closed = 0;
  closeOnPageDiscard(w, async () => void closed++);
  w.fire(true);
  assert.equal(closed, 0);
});

test('a failing close never throws out of the pagehide handler', async () => {
  const w = fakeWindow();
  closeOnPageDiscard(w, () => Promise.reject(new Error('already terminated')));
  assert.doesNotThrow(() => w.fire(false));
  await new Promise((r) => setTimeout(r, 0)); // the rejection is handled, not unhandled
});
