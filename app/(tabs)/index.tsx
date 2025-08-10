import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button} from 'react-native';
import {StatCard} from "@/components/StatCard";
import {fmtMoney} from "@/lib/format";
import {PieChart} from "@/components/components/PieChart";
import {ProgressBar} from "@/components/ProgressBar";
import {DeltaBadge} from "@/components/DeltaBadge";
import {Colors} from "@/lib/budget";
import {Segmented} from "@/components/Segmented";
import {useAuthUser} from "@/providers/AuthProvider";
import {getOrCreatePeriod, periodIdFromDate, watchPeriod, watchTransactionsTotals} from "@/lib/repo/periods";
import {addTransaction} from "@/lib/repo/transactions";

type CompareMode = 'AUTO' | 'MANUAL';

export default function Dashboard() {
    const user = useAuthUser();
    const pid = periodIdFromDate();
    const [income, setIncome] = useState(0);
    const [pct, setPct] = useState({needs: 0.5, wants: 0.3, sd: 0.2});
    const [manual, setManual] = useState<{ needs?: number; wants?: number; sd?: number }>({});
    const [actuals, setActuals] = useState({needs: 0, wants: 0, sd: 0});
    const [mode, setMode] = useState<CompareMode>('AUTO');

    // Subscribe Firestore
    useEffect(() => {
        if (!user) return;
        getOrCreatePeriod(user.uid, pid);
        const un1 = watchPeriod(user.uid, pid, (p) => {
            setIncome(p.incomeTotal ?? 0);
            setPct(p.targetPct ?? pct);
            setManual(p.manualTargets ?? {});
        });
        const un2 = watchTransactionsTotals(user.uid, pid, setActuals);
        return () => {
            un1();
            un2();
        };
    }, [user?.uid, pid]);

    const autoTargets = useMemo(() => ({
        needs: income * pct.needs,
        wants: income * pct.wants,
        sd: income * pct.sd,
    }), [income, pct]);

    const manualTargets = useMemo(() => ({
        needs: manual.needs ?? autoTargets.needs,
        wants: manual.wants ?? autoTargets.wants,
        sd: manual.sd ?? autoTargets.sd,
    }), [manual, autoTargets]);

    const target = mode === 'AUTO' ? autoTargets : manualTargets;
    const spent = actuals.needs + actuals.wants + actuals.sd;
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

    async function seed() {
        if (!user) return;
        await addTransaction(user.uid, pid, {amount: 27200, group: 'NEED'});
        await addTransaction(user.uid, pid, {amount: 22250, group: 'WANT'});
        await addTransaction(user.uid, pid, {amount: 38035, group: 'SAVINGS_DEBT'});
    }

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
                    options={[{label: 'Auto 50/30/20', value: 'AUTO'}, {label: 'Manual', value: 'MANUAL'}]}
                    onChange={setMode}
                />
            </View>

            <PieChart data={chartData} total={Math.max(spent, 1)} colors={[Colors.needs, Colors.wants, Colors.sd]}/>

            <View style={{gap: 14}}>
                <Text style={styles.section}>Progress vs {mode === 'AUTO' ? 'Auto (50/30/20)' : 'Manual'}</Text>
                <Row label="Needs" color={Colors.needs} actual={actuals.needs} target={target.needs}
                     diff={diffs.needs}/>
                <Row label="Wants" color={Colors.wants} actual={actuals.wants} target={target.wants}
                     diff={diffs.wants}/>
                <Row label="Savings & Debts" color={Colors.sd} actual={actuals.sd} target={target.sd} diff={diffs.sd}/>
            </View>

            <View style={{marginTop: 16}}>
                <Button title="Seed sample data" onPress={seed}/>
            </View>
        </ScrollView>
    );
}

function Row({label, color, actual, target, diff}: {
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
            <Text>{fmtMoney(actual)} / {fmtMoney(target)}</Text>
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
