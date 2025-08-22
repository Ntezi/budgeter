import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Pressable} from 'react-native';
import {StatCard} from "@/components/StatCard";
import {fmtMoney} from "@/lib/format";
import {PieChart} from "@/components/components/PieChart";
import {ProgressBar} from "@/components/ProgressBar";
import {DeltaBadge} from "@/components/DeltaBadge";
import {Colors} from "@/lib/budget";
import {Segmented} from "@/components/Segmented";
import {useAuthUser} from "@/providers/AuthProvider";
import {
    createPeriod,
    getOrCreatePeriod,
    nextMonthMeta,
    PeriodDoc,
    periodIdFromDate,
    watchPeriod, watchPeriods, watchTransactionsTotals
} from "@/lib/repo/periods";
import {addTransaction} from "@/lib/repo/transactions";
import {watchPlanTotals} from "@/lib/repo/plans";
import {watchIncomeItems} from "@/lib/repo/income";
import {Link, useRouter} from "expo-router";

type CompareMode = 'AUTO' | 'MANUAL';

export default function Dashboard() {
    const router = useRouter();
    const user = useAuthUser();
    const pid = periodIdFromDate();
    const [income, setIncome] = useState(0);
    const [pct, setPct] = useState({needs: 0.5, wants: 0.3, sd: 0.2});
    const [manual, setManual] = useState<{ needs?: number; wants?: number; sd?: number }>({});
    const [actuals, setActuals] = useState({needs: 0, wants: 0, sd: 0});
    const [mode, setMode] = useState<CompareMode>('AUTO');

    const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);

    useEffect(() => {
        if (!user) return;
        getOrCreatePeriod(user.uid, pid);
        const unP = watchPeriod(user.uid, pid, (p) => setPct(p.targetPct ?? pct));
        const unI = watchIncomeItems(user.uid, pid, (_items, total) => setIncome(total));
        const unM = watchPlanTotals(user.uid, pid, (t) => setManual(t as any));
        const unA = watchTransactionsTotals(user.uid, pid, setActuals);
        const unList = watchPeriods(user.uid, setPeriods);
        return () => {
            unP();
            unI();
            unM();
            unA();
            unList();
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

    async function createNext() {
        if (!user) return;
        const m = nextMonthMeta();
        await createPeriod(user.uid, m.id, m.title);
        router.push(`/budget/${m.id}`);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>Dashboard</Text>

            <View style={styles.grid}>
                <StatCard title="Monthly Income" value={fmtMoney(income)}/>
                <StatCard title="Surplus/Deficit" value={fmtMoney(surplus)}
                          tone={surplus >= 0 ? 'positive' : 'danger'}/>
            </View>

            <View style={{gap: 10}}>
                <Text style={styles.section}>Compare to</Text>
                <Segmented value={mode}
                           options={[{label: 'Auto 50/30/20', value: 'AUTO'}, {label: 'Manual', value: 'MANUAL'}]}
                           onChange={setMode}/>
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

            <View style={{marginTop: 24, gap: 10}}>
                <View style={styles.rowHeader}>
                    <Text style={styles.section}>Budgets</Text>
                    <Button title="New (next month)" onPress={createNext}/>
                </View>
                {periods.slice(0, 5).map((p) => (
                    <Pressable key={p.id} style={styles.bRow} onPress={() => router.push(`/budget/${p.id}`)}>
                        <View style={{flex: 1}}>
                            <Text style={styles.bTitle}>{p.title || p.id}</Text>
                            <Text style={styles.bSub}>{p.id} • {p.status || 'DRAFT'}</Text>
                        </View>
                        <Text
                            style={[styles.badgeSm, (p.status === 'DECIDED') ? styles.badgeDecided : styles.badgeDraft]}>
                            {p.status === 'DECIDED' ? 'View' : 'Edit'}
                        </Text>
                    </Pressable>
                ))}
                {/*<Link href="/(tabs)/budget" style={styles.link}>View all budgets →</Link>*/}
            </View>

            {/*<View style={{marginTop: 16}}>
                <Button title="Seed sample data" onPress={seed}/>
            </View>*/}
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
    rowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    rowLabel: {fontWeight: '600'},
    bRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1
    },
    bTitle: {fontSize: 16, fontWeight: '700'},
    bSub: {color: '#6B7280', marginTop: 2},
    badgeSm: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        overflow: 'hidden',
        color: '#111',
        fontWeight: '700'
    },
    badgeDraft: {backgroundColor: '#DBEAFE'},
    badgeDecided: {backgroundColor: '#DCFCE7'},
    link: {color: '#2563EB', marginTop: 6, fontWeight: '600'},
});