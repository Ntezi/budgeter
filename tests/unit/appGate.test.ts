import test from 'node:test';
import assert from 'node:assert/strict';
import { decideGate, type GateInput } from '../../lib/rules/appGate';

const base: GateInput = { onboardingComplete: true, signedIn: true, pathname: '/', location: '/', pending: null, firstShellRoute: '/shopping' };
const LINK = '/transactions?month=2026-11';

test('BUDG-6 regression: a reload deep link survives a dropped first replace at "/" (w320 → /shopping bug)', () => {
  const first = decideGate({ ...base, pending: LINK });
  assert.equal(first.replace, LINK);
  // The navigator was not mounted yet: still at "/", the gate runs again.
  const second = decideGate({ ...base, pending: first.pending });
  assert.equal(second.replace, LINK, 'must not fall back to the first shell route');
  // Arrived: kept while shown, because the navigator can still reset to "/" after mounting.
  const arrived = decideGate({ ...base, pathname: '/transactions', location: LINK, pending: second.pending });
  assert.deepEqual(arrived, { replace: null, pending: LINK });
  assert.equal(decideGate({ ...base, pending: arrived.pending }).replace, LINK);
  // The user moves on: cleared, later visits to "/" use the first shell route.
  const moved = decideGate({ ...base, pathname: '/shopping', location: '/shopping', pending: LINK });
  assert.deepEqual(moved, { replace: null, pending: null });
  assert.equal(decideGate({ ...base, pending: moved.pending }).replace, '/shopping');
});

test('signed out on a deep link: go to /auth and remember the link; restored after sign-in', () => {
  const out = decideGate({ ...base, signedIn: false, pathname: '/transactions', location: LINK });
  assert.deepEqual(out, { replace: '/auth', pending: LINK });
  assert.equal(decideGate({ ...base, pathname: '/auth', location: '/auth', pending: out.pending }).replace, LINK);
});

test('onboarding not complete goes to /onboarding; no deep link without one', () => {
  assert.equal(decideGate({ ...base, onboardingComplete: false }).replace, '/onboarding');
  assert.equal(decideGate({ ...base, pathname: '/auth', location: '/auth' }).replace, '/shopping');
  assert.equal(decideGate({ ...base, firstShellRoute: '/dashboard' }).replace, '/dashboard');
});
