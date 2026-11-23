import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAreaId, activeItem, audienceFor, chefMayOpen, firstRouteFor, shellViewFor, layoutFor, NAV_ITEMS, showsMonthChip, tapsTo, visibleItems } from '../../lib/shell/nav';

test('S2 layout: bottom bar < 768, rail 768-1023, sidebar >= 1024', () => {
  assert.equal(layoutFor(320), 'phone');
  assert.equal(layoutFor(767), 'phone');
  assert.equal(layoutFor(768), 'tablet');
  assert.equal(layoutFor(1023), 'tablet');
  assert.equal(layoutFor(1024), 'desktop');
  assert.equal(layoutFor(1440), 'desktop');
});

test('S2 active area on nested routes', () => {
  assert.equal(activeAreaId('/budgets/2026-11'), 'plan');
  assert.equal(activeAreaId('/transactions'), 'accounts');
  assert.equal(activeAreaId('/shopping-items'), 'shopping');
  assert.equal(activeItem('/shopping-items')?.id, 'catalog');
  assert.equal(activeItem('/shopping')?.id, 'shopping');
  assert.equal(activeAreaId('/recurring'), 'regular');
  assert.equal(activeAreaId('/dashboard'), 'home');
});

test('S2 every shell route reachable: phone <= 2 taps, desktop 1; routes unchanged', () => {
  const routes = ['/dashboard', '/budgets', '/shopping', '/accounts', '/transactions', '/reports', '/expenses', '/recurring', '/shopping-items', '/settings'];
  for (const r of routes) assert.ok(activeItem(r), `${r} has a nav entry`);
  for (const it of NAV_ITEMS) {
    assert.ok(tapsTo(it.id, 'phone') <= 2, it.id);
    assert.equal(tapsTo(it.id, 'desktop'), 1, it.id);
  }
  assert.deepEqual(visibleItems('household').filter((i) => i.group === 'primary').map((i) => i.label), ['Home', 'Plan', 'Shopping', 'Accounts']);
});

test('S2 data-driven: a new entry slots in without code changes', () => {
  const items = [...NAV_ITEMS, { id: 'year-plan', label: 'Year plan', href: '/budgets/year', icon: 'calendar-range', group: 'more' as const, area: 'plan' }];
  assert.equal(activeItem('/budgets/year', items)?.id, 'year-plan');
  assert.equal(activeAreaId('/budgets/year', items), 'plan');
  const chef = [...NAV_ITEMS, { id: 'chef', label: 'Shared list', href: '/shared', icon: 'chef-hat', group: 'primary' as const, audience: ['chef' as const] }];
  assert.ok(!visibleItems('household', chef).some((i) => i.id === 'chef'));
  assert.ok(visibleItems('chef', chef).some((i) => i.id === 'chef'));
});

test('S2 month chip only where the screen reads ?month=', () => {
  assert.ok(showsMonthChip('/dashboard'));
  assert.ok(showsMonthChip('/transactions'));
  assert.ok(!showsMonthChip('/shopping'));
  assert.ok(!showsMonthChip('/settings'));
});

test('BUDG-6 audience: chef only with an ACTIVE share and no household of their own; unknown hides nav', () => {
  assert.equal(audienceFor({ sharedWithMe: 1, ownMonths: 0, memberships: 0 }), 'chef');
  assert.equal(audienceFor({ sharedWithMe: 1, ownMonths: 2, memberships: 0 }), 'household');
  assert.equal(audienceFor({ sharedWithMe: 1, ownMonths: 0, memberships: 1 }), 'household');
  assert.equal(audienceFor({ sharedWithMe: 0, ownMonths: 0, memberships: 0 }), 'household');
  // BUDG-8: a chef whose last share ends stays in the chef shell for the session (sees Access ended)...
  assert.equal(audienceFor({ sharedWithMe: 0, ownMonths: 0, memberships: 0 }, true), 'chef');
  // ...but never once they have a household of their own.
  assert.equal(audienceFor({ sharedWithMe: 0, ownMonths: 1, memberships: 0 }, true), 'household');
  assert.equal(audienceFor({ sharedWithMe: 0, ownMonths: 0, memberships: 1 }, true), 'household');
  assert.equal(audienceFor({ sharedWithMe: null, ownMonths: 0, memberships: 0 }, true), null);
  assert.equal(audienceFor({ sharedWithMe: null, ownMonths: 0, memberships: 0 }), null);
});

test('BUDG-6 nav: chef sees the shared list only; household sees year plan, catalog, regular costs, reports, settings', () => {
  assert.deepEqual(visibleItems('chef').map((i) => i.href), ['/shopping']);
  assert.ok(!visibleItems('household').some((i) => i.id === 'shared'));
  const more = visibleItems('household').filter((i) => i.group === 'more').map((i) => i.id);
  assert.deepEqual(more, ['year-plan', 'reports', 'regular', 'catalog', 'settings']);
  assert.equal(chefMayOpen('/shopping'), true);
  assert.equal(chefMayOpen('/dashboard'), false);
  assert.equal(firstRouteFor('household'), '/dashboard');
  assert.equal(firstRouteFor('chef'), '/shopping');
});

test('BUDG-8 X: Year plan is active on /budgets?view=year, Plan on bare /budgets and /budgets/<month>', () => {
  assert.equal(activeItem('/budgets', NAV_ITEMS, { view: 'year' })?.id, 'year-plan');
  assert.equal(activeAreaId('/budgets', NAV_ITEMS, { view: 'year' }), 'plan');
  assert.equal(activeItem('/budgets', NAV_ITEMS, {})?.id, 'plan');
  assert.equal(activeItem('/budgets', NAV_ITEMS, { view: 'month' })?.id, 'plan');
  assert.equal(activeItem('/budgets/2026-11', NAV_ITEMS, { view: 'year' })?.id, 'plan');
});

test('BUDG-6: a chef is sent to the shared list from every other route and nothing else renders', () => {
  const household = ['/dashboard', '/budgets', '/budgets/2026-11', '/budgets/year', '/transactions', '/accounts', '/expenses', '/recurring', '/reports', '/settings', '/shopping-items', '/', '/shopping/x', '/shoppingx'];
  for (const p of household) assert.equal(shellViewFor('chef', p), 'chef-redirect', p);
  assert.equal(shellViewFor('chef', '/shopping'), 'chef');
  for (const it of NAV_ITEMS) {
    const path = it.href.split('?')[0];
    if (path !== '/shopping') assert.equal(shellViewFor('chef', path), 'chef-redirect', it.href);
  }
  // Household users are never redirected; while the audience is unknown the shell shows no navigation.
  for (const p of [...household, '/shopping']) assert.equal(shellViewFor('household', p), 'household');
  assert.equal(shellViewFor(null, '/dashboard'), 'loading');
});
