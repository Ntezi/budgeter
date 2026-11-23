import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAreaId, activeItem, layoutFor, NAV_ITEMS, showsMonthChip, tapsTo, visibleItems } from '../../lib/shell/nav';

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
  assert.deepEqual(NAV_ITEMS.filter((i) => i.group === 'primary').map((i) => i.label), ['Home', 'Plan', 'Shopping', 'Accounts']);
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
