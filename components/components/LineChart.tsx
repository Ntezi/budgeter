import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { VictoryChart, VictoryLine, VictoryTheme, VictoryAxis, VictoryScatter } from 'victory-native';
import { fmtMoney } from '@/lib/format';
import { axisGutter, compactAxisLabel, trendKind, trendTicks, type TrendPoint } from '@/lib/chart';

const plain = (n: number) => fmtMoney(n).replace('GHS', '').trim();

/**
 * Spent-per-month picture (BUDG-8 design review D-1). Three points or fewer, or all equal: one
 * labelled bar per month (a line would say nothing). Otherwise a line over evenly spaced months
 * with at most three y ticks from zero and no repeated tick labels.
 */
export function LineChart({ data, lineColor, axisColor }: { data: TrendPoint[]; lineColor?: string; axisColor?: string }) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width - 32, 520);
  const chartHeight = 240;
  const stroke = lineColor ?? '#0ea5e9';
  const axis = axisColor ?? '#717182';

  if (!data.length) return null;

  if (trendKind(data) === 'bars') {
    const top = Math.max(...data.map((d) => d.y), 0);
    return (
      <View testID="trend-bars" className="w-full flex-row items-end justify-around gap-3 pt-2" style={{ height: 180 }}>
        {data.map((d, i) => (
          <View key={`${d.x}-${i}`} className="min-w-0 flex-1 items-center gap-1" style={{ maxWidth: 120 }}>
            <Text className="text-xs font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{plain(d.y)}</Text>
            <View className="w-full rounded-t-md" style={{ height: top > 0 ? Math.max(4, (d.y / top) * 120) : 4, backgroundColor: stroke }} />
            <Text className="text-xs text-muted-foreground dark:text-zinc-400" numberOfLines={1}>{d.x}</Text>
          </View>
        ))}
      </View>
    );
  }

  const ticks = trendTicks(data.map((d) => d.y));
  // BUDG-40 F-6: compact tick labels and a gutter sized to them, so six-figure amounts are not cut at 320 px.
  const tickLabels = ticks.map(compactAxisLabel);
  const points = data.map((d, i) => ({ x: i + 1, y: d.y }));
  return (
    <View testID="trend-line" style={{ alignSelf: 'center' }}>
      <VictoryChart
        width={chartWidth}
        height={chartHeight}
        theme={VictoryTheme.material}
        padding={{ top: 20, bottom: 40, left: axisGutter(tickLabels), right: 20 }}
        domain={{ x: [0.5, data.length + 0.5], y: [0, ticks[ticks.length - 1] || 1] }}
      >
        <VictoryAxis
          tickValues={points.map((p) => p.x)}
          tickFormat={(t: number) => data[t - 1]?.x ?? ''}
          style={{ axis: { stroke: axis }, tickLabels: { fill: axis, fontSize: 10 }, grid: { stroke: 'none' } }}
          fixLabelOverlap
        />
        <VictoryAxis
          dependentAxis
          tickValues={ticks}
          tickFormat={(t: number) => compactAxisLabel(t)}
          style={{ axis: { stroke: axis }, tickLabels: { fill: axis, fontSize: 10 }, grid: { stroke: `${axis}33`, strokeDasharray: '4, 4' } }}
        />
        <VictoryLine data={points} style={{ data: { stroke, strokeWidth: 2 } }} />
        <VictoryScatter data={points} size={4} style={{ data: { fill: stroke } }} />
      </VictoryChart>
    </View>
  );
}
