import React from 'react';
import {View, useWindowDimensions} from 'react-native';
import {VictoryPie} from 'victory-native';
import Svg from 'react-native-svg';

export function PieChart({
                             data,
                             total,
                             colors,
                         }: {
    data: { x: string; y: number }[];
    total: number;
    colors: string[];
}) {
    const {width} = useWindowDimensions();
    const chartWidth = Math.min(width - 32, 520);
    const chartHeight = 240;

    return (
        <View style={{alignSelf: 'center'}}>
            <Svg width={chartWidth} height={chartHeight}>
                <VictoryPie
                    standalone={false}
                    width={chartWidth}
                    height={chartHeight}
                    padding={{top: 12, bottom: 12, left: 12, right: 12}}
                    innerRadius={70}
                    padAngle={2}
                    data={data}
                    x="x"
                    y="y"
                    colorScale={colors}
                    labels={({datum}: any) =>
                        `${datum.x}\n${((datum.y / Math.max(total, 1)) * 100).toFixed(1)}%`
                    }
                    style={{labels: {fontSize: 11}}}
                />
            </Svg>
        </View>
    );
}

