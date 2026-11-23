// BUDG-8 design review D-1: a trend picture that says something with equal or few points.

export type TrendPoint = { x: string; y: number };

/** Bars when there are three points or fewer or every value is the same; a line otherwise. */
export function trendKind(points: TrendPoint[]): 'bars' | 'line' {
  if (points.length <= 3) return 'bars';
  return points.every((p) => p.y === points[0].y) ? 'bars' : 'line';
}

/** At most `max` y-axis ticks from 0 to the top value, no duplicates, rounded to a readable step. */
export function trendTicks(values: number[], max = 3): number[] {
  const top = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  if (top <= 0) return [0];
  const raw = top / (max - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let t = 0; ticks.length < max && t < top + step; t += step) ticks.push(Math.round(t * 100) / 100);
  return [...new Set(ticks)];
}

/** Month labels that stay unique across a year boundary ("Nov 25", "Nov 26" when both appear). */
export function uniqueMonthLabels(ids: string[], title: (id: string) => string): string[] {
  const short = ids.map((id) => title(id).slice(0, 3));
  const dup = short.some((s, i) => short.indexOf(s) !== i);
  return dup ? ids.map((id, i) => `${short[i]} ${id.slice(2, 4)}`) : short;
}
