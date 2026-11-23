import test from 'node:test';
import assert from 'node:assert/strict';
import { decideGate, gateLocation, nextFromLocation, safeNext, type GateInput } from '../../lib/rules/appGate';

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

test('BUDG-8 01: "Plan <Month>" intent survives the /auth -> /onboarding detour as a URL', () => {
  const PLAN = '/budgets?new=1';
  const AUTH = `/auth?next=${encodeURIComponent(PLAN)}`;
  // Onboarding finished, but the gate still reads the old flag: the detour to /onboarding keeps the intent.
  const detour = decideGate({ ...base, onboardingComplete: false, signedIn: false, pathname: '/auth', location: AUTH });
  assert.deepEqual(detour, { replace: '/onboarding', pending: PLAN });
  // Flag re-read: back to /auth (query dropped by the replace), intent still pending.
  const back = decideGate({ ...base, signedIn: false, pathname: '/onboarding', location: '/onboarding', pending: detour.pending });
  assert.deepEqual(back, { replace: '/auth', pending: PLAN });
  // Signed in on /auth: Plan with the New month sheet.
  assert.equal(decideGate({ ...base, pathname: '/auth', location: '/auth', pending: back.pending }).replace, PLAN);
  // No detour at all: signed in straight on /auth?next=.
  assert.equal(decideGate({ ...base, pathname: '/auth', location: AUTH }).replace, PLAN);
});

test('nextFromLocation accepts in-app paths only', () => {
  assert.equal(nextFromLocation('/auth?next=%2Fbudgets%3Fnew%3D1'), '/budgets?new=1');
  assert.equal(nextFromLocation('/auth?next=%2F%2Fevil.example'), null);
  assert.equal(nextFromLocation('/auth?next=https%3A%2F%2Fevil.example'), null);
  assert.equal(nextFromLocation('/auth?next=%2Fauth'), null);
  assert.equal(nextFromLocation('/auth?next=%2Fonboarding'), null);
  assert.equal(nextFromLocation('/auth'), null);
  assert.equal(nextFromLocation('/transactions?next=%2Fbudgets'), null, 'only read on /auth and /onboarding');
});

test('BUDG-6: hostile ?next= values are rejected and the gate falls back to the default route', () => {
  const hostile = [
    '//evil.example',
    '//evil.example/budgets',
    'https://evil.example',
    'HTTPS://evil.example',
    '/\\evil.example',
    '\\evil.example',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,hi',
    '%2F%2Fevil.example',
    '%252F%252Fevil.example',
    '/%2F/evil.example',
    '/%2Fevil.example',
    '/%5Cevil.example',
    'javascript%3Aalert(1)',
    '/https://evil.example',
    '/budgets?next=https://evil.example',
    '/redirect?u=javascript:alert(1)',
    '/budgets/../../evil',
    '/budgets\tx',
    '/budgets\nx',
    '/ budgets',
    '/auth',
    '/onboarding?next=%2Fbudgets',
    '/%E0%A4%A',
  ];
  for (const v of hostile) {
    assert.equal(safeNext(v), null, `safeNext(${JSON.stringify(v)})`);
    const location = `/auth?${new URLSearchParams({ next: v }).toString()}`;
    assert.equal(nextFromLocation(location), null, location);
    const d = decideGate({ onboardingComplete: true, signedIn: true, pathname: '/auth', location, pending: null, firstShellRoute: '/dashboard' });
    assert.deepEqual(d, { replace: '/dashboard', pending: null }, location);
  }
  // Raw (unencoded) hostile values in the query string are rejected too.
  for (const raw of ['/auth?next=//evil.example', '/auth?next=https://evil.example', '/auth?next=/\\evil.example', '/auth?next=javascript:alert(1)']) {
    assert.equal(nextFromLocation(raw), null, raw);
  }
  // In-app paths still pass.
  for (const ok of ['/budgets?new=1', '/budgets', '/budgets/2026-11', '/transactions?month=2026-11', '/settings?page=household']) assert.equal(safeNext(ok), ok);
});

test('BUDG-6 S16: the gate reads ?next= from the router while the browser URL still shows the last screen', () => {
  assert.equal(gateLocation('/auth', '/onboarding', '/budgets?new=1'), '/auth?next=%2Fbudgets%3Fnew%3D1');
  assert.equal(nextFromLocation(gateLocation('/auth', '/onboarding', '/budgets?new=1')), '/budgets?new=1');
  assert.equal(gateLocation('/auth', '/auth?next=%2Fbudgets', undefined), '/auth?next=%2Fbudgets');
  assert.equal(gateLocation('/dashboard', '/', undefined), '/dashboard');
  assert.equal(gateLocation('/dashboard', null, undefined), '/dashboard');
  assert.equal(nextFromLocation(gateLocation('/auth', '/onboarding', '//evil.example')), null);
});
