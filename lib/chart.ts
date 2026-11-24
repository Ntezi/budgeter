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

/**
 * BUDG-40 F-6: y-axis tick label short enough to stay whole at 320 px ("120k", "1.5M", "250").
 * The full figure stays in the sentence above the chart and in the cards; ticks only give scale.
 */
export function compactAxisLabel(n: number): string {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (v: number) => String(Math.round(v * 10) / 10);
  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}k`;
  return `${sign}${trim(abs)}`;
}

/** Left gutter (px) that fits the widest tick label at `fontSize`, plus room for the tick. */
export function axisGutter(labels: string[], fontSize = 10): number {
  const widest = Math.max(1, ...labels.map((l) => l.length));
  return Math.max(36, Math.ceil(widest * fontSize * 0.62) + 18);
}
