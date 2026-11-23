import test from 'node:test';
import assert from 'node:assert/strict';
import { trendKind, trendTicks, uniqueMonthLabels } from '../../lib/chart';

test('BUDG-8 D-1: equal or few points draw bars, varied points a line', () => {
  assert.equal(trendKind([{ x: 'Oct', y: 1165 }, { x: 'Nov', y: 1165 }]), 'bars');
  assert.equal(trendKind([{ x: 'a', y: 1 }, { x: 'b', y: 2 }, { x: 'c', y: 3 }]), 'bars');
  assert.equal(trendKind(['a', 'b', 'c', 'd', 'e'].map((x) => ({ x, y: 1165 }))), 'bars');
  assert.equal(trendKind(['a', 'b', 'c', 'd'].map((x, i) => ({ x, y: i * 10 }))), 'line');
});

test('BUDG-8 D-1: at most 3 ticks, no repeated values, from zero', () => {
  for (const values of [[1165, 1165, 1165, 1165, 1165], [0, 0], [12.5], [100, 2500, 999.99], [0.4, 0.2]]) {
    const ticks = trendTicks(values);
    assert.ok(ticks.length <= 3, `${values}`);
    assert.equal(new Set(ticks).size, ticks.length, `${values}`);
    assert.equal(ticks[0], 0);
    assert.ok(ticks[ticks.length - 1] >= Math.max(...values) || ticks.length === 3, `${values} -> ${ticks}`);
  }
  assert.deepEqual(trendTicks([1165, 1165]), [0, 1000, 2000]);
  assert.deepEqual(trendTicks([0]), [0]);
});

test('BUDG-8 D-1: month labels stay unique across a year', () => {
  const t = (id: string) => ({ '2025-11': 'November 2025', '2026-10': 'October 2026', '2026-11': 'November 2026' })[id] as string;
  assert.deepEqual(uniqueMonthLabels(['2026-10', '2026-11'], t), ['Oct', 'Nov']);
  assert.deepEqual(uniqueMonthLabels(['2025-11', '2026-10', '2026-11'], t), ['Nov 25', 'Oct 26', 'Nov 26']);
});
