import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { VictoryChart, VictoryLine, VictoryTheme, VictoryAxis, VictoryScatter } from 'victory-native';
import { fmtMoney } from '@/lib/format';

export function LineChart({
  data,
  lineColor,
  axisColor,
}: {
  data: { x: any; y: number }[];
  lineColor?: string;
  axisColor?: string;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width - 32, 520);
  const chartHeight = 240;

  if (!data.length) return null;

  return (
    <View style={{ alignSelf: 'center' }}>
      <VictoryChart
        width={chartWidth}
        height={chartHeight}
        theme={VictoryTheme.material}
        padding={{ top: 20, bottom: 40, left: 50, right: 20 }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: axisColor ?? '#717182' },
            tickLabels: { fill: axisColor ?? '#717182', fontSize: 10 },
            grid: { stroke: 'none' },
          }}
          fixLabelOverlap
        />
        <VictoryAxis
          dependentAxis
          tickFormat={(t) => fmtMoney(t).replace('GHS', '').trim()}
          style={{
            axis: { stroke: axisColor ?? '#717182' },
            tickLabels: { fill: axisColor ?? '#717182', fontSize: 10 },
            grid: { stroke: axisColor ? `${axisColor}33` : '#71718233', strokeDasharray: '4, 4' },
          }}
        />
        <VictoryLine
          data={data}
          style={{
            data: { stroke: lineColor ?? '#0ea5e9', strokeWidth: 2 },
          }}
        />
        <VictoryScatter
          data={data}
          size={4}
          style={{
            data: { fill: lineColor ?? '#0ea5e9' },
          }}
        />
      </VictoryChart>
    </View>
  );
}
