import test from 'node:test';
import assert from 'node:assert/strict';
import { axisGutter, compactAxisLabel, trendKind, trendTicks, uniqueMonthLabels } from '../../lib/chart';

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

test('BUDG-40 F-6: six-figure y ticks are compact and the gutter fits them', () => {
  const ticks = trendTicks([120345.67, 98000, 110500.5, 87250]);
  const labels = ticks.map(compactAxisLabel);
  assert.deepEqual(labels, ['0', '100k', '200k']);
  assert.equal(compactAxisLabel(120345.67), '120.3k');
  assert.equal(compactAxisLabel(1500000), '1.5M');
  assert.equal(compactAxisLabel(250), '250');
  assert.equal(compactAxisLabel(2.5), '2.5');
  assert.equal(compactAxisLabel(-5000), '-5k');
  for (const l of labels) assert.ok(l.length <= 5, l);
  // 10 px labels: the widest ("100k" / "120.3k") fits inside the left padding with room for the tick.
  assert.ok(axisGutter(labels) >= Math.ceil(4 * 10 * 0.62) + 18);
  assert.ok(axisGutter(['120.3k']) <= 56);
});
