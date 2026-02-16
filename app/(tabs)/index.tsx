import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Pressable, useWindowDimensions} from 'react-native';
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
import {watchPlanTotals} from "@/lib/repo/plans";
import {watchIncomeItems} from "@/lib/repo/income";
import {useRouter} from "expo-router";
import {seedBudgetForNewPeriod} from '@/lib/repo/recurring';
import {applyAllocationDefaultsForPeriod, watchAllocations} from '@/lib/repo/allocations';
import {TagPill} from '@/components/TagPill';

type CompareMode = 'AUTO' | 'MANUAL';

export default function Dashboard() {
    const router = useRouter();
    const user = useAuthUser();
    const uid = user?.uid;
    const pid = periodIdFromDate();
    const [income, setIncome] = useState(0);
    const [pct, setPct] = useState({needs: 0.5, wants: 0.3, sd: 0.2});
    const [manual, setManual] = useState<{ needs?: number; wants?: number; sd?: number }>({});
    const [actuals, setActuals] = useState({needs: 0, wants: 0, sd: 0});
    const [mode, setMode] = useState<CompareMode>('AUTO');
    const [allocTotals, setAllocTotals] = useState({needs: 0, wants: 0, savings: 0, total: 0});

    const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
    const {width} = useWindowDimensions();
    const isCompact = width < 720;
    const isWide = width >= 1100;

    useEffect(() => {
        if (!uid) return;
        getOrCreatePeriod(uid, pid);
        const unP = watchPeriod(uid, pid, (p) => setPct(p.targetPct ?? {needs: 0.5, wants: 0.3, sd: 0.2}));
        const unI = watchIncomeItems(uid, pid, (_items, total) => setIncome(total));
        const unM = watchPlanTotals(uid, pid, (t) => setManual(t as any));
        const unA = watchTransactionsTotals(uid, pid, setActuals);
        const unAlloc = watchAllocations(uid, pid, (_rows, totals) => setAllocTotals(totals));
        const unList = watchPeriods(uid, setPeriods);
        return () => {
            unP();
            unI();
            unM();
            unA();
            unAlloc();
            unList();
        };
    }, [uid, pid]);

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

    async function createNext() {
        if (!uid) return;
        const m = nextMonthMeta();
        const exists = periods.some((row) => row.id === m.id);
        await createPeriod(uid, m.id, m.title);
        if (!exists) {
            await seedBudgetForNewPeriod(uid, m.id);
            await applyAllocationDefaultsForPeriod(uid, m.id);
        }
        router.push(`/budget/${m.id}`);
    }


    return (
        <ScrollView
            style={styles.screen}
            contentContainerStyle={[styles.container, isWide && styles.containerWide]}
        >
            <View style={styles.hero}>
                <View style={styles.heroGlow}/>
                <View style={styles.heroGlowAlt}/>
                <View style={styles.heroHeader}>
                    <Text style={styles.heroTitle}>Dashboard</Text>
                    <Text style={styles.heroMeta}>{pid} · {mode === 'AUTO' ? 'Auto targets' : 'Manual targets'}</Text>
                </View>
                <View style={[styles.heroGrid, isCompact && styles.heroGridStack]}>
                    <View style={styles.heroCard}>
                        <Text style={styles.heroLabel}>Monthly income</Text>
                        <Text style={styles.heroValue}>{fmtMoney(income)}</Text>
                        <Text style={styles.heroSub}>Planned income total</Text>
                    </View>
                    <View style={[styles.heroCard, surplus >= 0 ? styles.heroPositive : styles.heroNegative]}>
                        <Text style={styles.heroLabel}>Surplus / Deficit</Text>
                        <Text style={styles.heroValue}>{fmtMoney(surplus)}</Text>
                        <Text style={styles.heroSub}>{surplus >= 0 ? 'Ahead of plan' : 'Over target'}</Text>
                    </View>
                    <View style={styles.heroMiniRow}>
                        <View style={styles.heroMiniCard}>
                            <Text style={styles.heroMiniLabel}>Spent so far</Text>
                            <Text style={styles.heroMiniValue}>{fmtMoney(spent)}</Text>
                        </View>
                        <View style={styles.heroMiniCard}>
                            <Text style={styles.heroMiniLabel}>Allocated</Text>
                            <Text style={styles.heroMiniValue}>{fmtMoney(allocTotals.total)}</Text>
                        </View>
                    </View>
                </View>
            </View>

            <View style={styles.compareBlock}>
                <Text style={styles.sectionTitle}>Compare targets</Text>
                <Segmented
                    value={mode}
                    options={[{label: 'Auto 50/30/20', value: 'AUTO'}, {label: 'Manual', value: 'MANUAL'}]}
                    onChange={setMode}
                />
            </View>

            <View style={[styles.sectionRow, !isWide && styles.sectionRowStack]}>
                <View style={[styles.sectionCard, isWide && styles.sectionCardHalf]}>
                    <Text style={styles.cardTitle}>Spending mix</Text>
                    <PieChart data={chartData} total={Math.max(spent, 1)} colors={[Colors.needs, Colors.wants, Colors.sd]}/>
                </View>
                <View style={[styles.sectionCard, isWide && styles.sectionCardHalf]}>
                    <Text style={styles.cardTitle}>
                        Progress vs {mode === 'AUTO' ? 'Auto (50/30/20)' : 'Manual'}
                    </Text>
                    <View style={styles.progressList}>
                        <Row label="Needs" color={Colors.needs} actual={actuals.needs} target={target.needs}
                             diff={diffs.needs}/>
                        <Row label="Wants" color={Colors.wants} actual={actuals.wants} target={target.wants}
                             diff={diffs.wants}/>
                        <Row label="Savings & Debts" color={Colors.sd} actual={actuals.sd} target={target.sd}
                             diff={diffs.sd}/>
                    </View>
                </View>
            </View>

            <View style={styles.sectionCard}>
                <Text style={styles.cardTitle}>Account allocations ({pid})</Text>
                <View style={styles.allocRow}>
                    <TagPill tag="NEEDS"/>
                    <Text style={styles.allocValue}>{fmtMoney(allocTotals.needs)}</Text>
                    <TagPill tag="WANTS"/>
                    <Text style={styles.allocValue}>{fmtMoney(allocTotals.wants)}</Text>
                    <TagPill tag="SAVINGS"/>
                    <Text style={styles.allocValue}>{fmtMoney(allocTotals.savings)}</Text>
                </View>
                <Text style={styles.subtle}>Subtotal: {fmtMoney(allocTotals.total)}</Text>
                {income > 0 ? (
                    <View style={styles.subtleList}>
                        <Text style={styles.subtle}>
                            Remaining vs auto target (Needs): {fmtMoney(autoTargets.needs - allocTotals.needs)}
                        </Text>
                        <Text style={styles.subtle}>
                            Remaining vs auto target (Wants): {fmtMoney(autoTargets.wants - allocTotals.wants)}
                        </Text>
                        <Text style={styles.subtle}>
                            Remaining vs auto target (Savings): {fmtMoney(autoTargets.sd - allocTotals.savings)}
                        </Text>
                    </View>
                ) : (
                    <Text style={styles.subtle}>Set income to unlock target comparison.</Text>
                )}
            </View>

            <View style={styles.sectionCard}>
                <View style={styles.rowHeader}>
                    <Text style={styles.cardTitle}>Budgets</Text>
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
    screen: {backgroundColor: '#F8FAFC'},
    container: {padding: 16, gap: 16, width: '100%'},
    containerWide: {maxWidth: 1200, alignSelf: 'center'},
    hero: {
        backgroundColor: '#0F172A',
        borderRadius: 20,
        padding: 16,
        gap: 16,
        overflow: 'hidden',
    },
    heroGlow: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 999,
        backgroundColor: 'rgba(56, 189, 248, 0.18)',
        top: -60,
        right: -40,
    },
    heroGlowAlt: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 999,
        backgroundColor: 'rgba(14, 165, 233, 0.12)',
        bottom: -60,
        left: -40,
    },
    heroHeader: {gap: 4},
    heroTitle: {fontSize: 24, fontWeight: '700', color: '#F8FAFC'},
    heroMeta: {fontSize: 12, color: '#CBD5E1'},
    heroGrid: {flexDirection: 'row', gap: 12, flexWrap: 'wrap'},
    heroGridStack: {flexDirection: 'column'},
    heroCard: {
        flex: 1,
        minWidth: 200,
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.25)',
    },
    heroLabel: {fontSize: 11, color: '#E2E8F0', textTransform: 'uppercase', letterSpacing: 0.6},
    heroValue: {fontSize: 22, fontWeight: '700', color: '#F8FAFC', marginTop: 6},
    heroSub: {fontSize: 12, color: '#CBD5E1', marginTop: 4},
    heroPositive: {
        backgroundColor: 'rgba(16, 185, 129, 0.18)',
        borderColor: 'rgba(16, 185, 129, 0.35)',
    },
    heroNegative: {
        backgroundColor: 'rgba(248, 113, 113, 0.2)',
        borderColor: 'rgba(248, 113, 113, 0.35)',
    },
    heroMiniRow: {flexDirection: 'row', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 200},
    heroMiniCard: {
        flex: 1,
        minWidth: 160,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.2)',
    },
    heroMiniLabel: {fontSize: 10, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: 0.6},
    heroMiniValue: {fontSize: 16, fontWeight: '700', color: '#F8FAFC', marginTop: 6},
    compareBlock: {gap: 10},
    sectionTitle: {fontSize: 14, fontWeight: '700', color: '#0F172A'},
    sectionRow: {flexDirection: 'row', gap: 16},
    sectionRowStack: {flexDirection: 'column'},
    sectionCard: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        padding: 14,
        gap: 10,
        shadowColor: '#0F172A',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    sectionCardHalf: {flex: 1},
    cardTitle: {fontSize: 15, fontWeight: '700', color: '#0F172A'},
    progressList: {gap: 14},
    row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
    rowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'},
    rowLabel: {fontWeight: '600'},
    allocRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
    allocValue: {fontWeight: '700', color: '#0F172A'},
    subtle: {color: '#64748B', fontSize: 12},
    subtleList: {gap: 4},
    bRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    bTitle: {fontSize: 15, fontWeight: '700', color: '#0F172A'},
    bSub: {color: '#64748B', marginTop: 2},
    badgeSm: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        overflow: 'hidden',
        color: '#0F172A',
        fontWeight: '700',
    },
    badgeDraft: {backgroundColor: '#DBEAFE'},
    badgeDecided: {backgroundColor: '#DCFCE7'},
});
