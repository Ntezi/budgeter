import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {StatCard} from "@/components/StatCard";
import {fmtMoney} from "@/lib/format";
import {PieChart} from "@/components/components/PieChart";
import {ProgressBar} from "@/components/ProgressBar";
import {DeltaBadge} from "@/components/DeltaBadge";
import {autoTargets, Colors, sumObj} from "@/lib/budget";
import {Segmented} from "@/components/Segmented";

type CompareMode = 'AUTO' | 'MANUAL';

export default function Dashboard() {
    // Mocked data from your sheet
    const income = 87485;
    const actuals = {needs: 27200, wants: 22250, sd: 38035};
    const auto = autoTargets(income);
    const manual = {needs: 43742.5, wants: 26245.5, sd: 17497}; // example: from spreadsheet

    const [mode, setMode] = useState<CompareMode>('AUTO');
    const target = mode === 'AUTO' ? auto : manual;

    const spent = sumObj(actuals);
    const surplus = income - spent;

    const diffs = {
        needs: actuals.needs - target.needs,
        wants: actuals.wants - target.wants,
        sd: actuals.sd - target.sd,
    };

    const chartData = [
        {x: 'Needs', y: actuals.needs},
        {x: 'Wants', y: actuals.wants},
        {x: 'Savings & Debts', y: actuals.sd},
    ];

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>August 2025</Text>

            <View style={styles.grid}>
                <StatCard title="Monthly Income" value={fmtMoney(income)}/>
                <StatCard title="Surplus/Deficit" value={fmtMoney(surplus)}
                          tone={surplus >= 0 ? 'positive' : 'danger'}/>
            </View>

            <View style={{gap: 10}}>
                <Text style={styles.section}>Compare to</Text>
                <Segmented
                    value={mode}
                    options={[
                        {label: 'Auto 50/30/20', value: 'AUTO'},
                        {label: 'Manual', value: 'MANUAL'},
                    ]}
                    onChange={setMode}
                />
            </View>

            <PieChart data={chartData} total={spent} colors={[Colors.needs, Colors.wants, Colors.sd]}/>

            <View style={{gap: 14}}>
                <Text style={styles.section}>Progress vs {mode === 'AUTO' ? 'Auto (50/30/20)' : 'Manual'}</Text>

                <Row label="Needs" color={Colors.needs} actual={actuals.needs} target={target.needs}
                     diff={diffs.needs}/>
                <Row label="Wants" color={Colors.wants} actual={actuals.wants} target={target.wants}
                     diff={diffs.wants}/>
                <Row label="Savings & Debts" color={Colors.sd} actual={actuals.sd} target={target.sd} diff={diffs.sd}/>
            </View>
        </ScrollView>
    );
}

function Row({
                 label,
                 color,
                 actual,
                 target,
                 diff,
             }: {
    label: string;
    color: string;
    actual: number;
    target: number;
    diff: number;
}) {
    return (
        <View style={{gap: 6}}>
            <View style={styles.row}>
                <Text style={styles.rowLabel}>{label}</Text>
                <DeltaBadge diff={diff}/>
            </View>
            <Text>
                {fmtMoney(actual)} / {fmtMoney(target)}
            </Text>
            <ProgressBar value={actual} target={target} color={color}/>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {padding: 16, gap: 16},
    header: {fontSize: 22, fontWeight: '700', alignSelf: 'flex-start'},
    grid: {flexDirection: 'row', gap: 12},
    section: {fontWeight: '700', marginTop: 6},
    row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    rowLabel: {fontWeight: '600'},
});
