import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { AppProgressBar } from '@/components/ui/AppProgressBar';
import { fmtMoney } from '@/lib/format';
import { useAuthUser } from '@/providers/AuthProvider';
import {
  createPeriod,
  getOrCreatePeriod,
  nextMonthMeta,
  periodIdFromDate,
  type PeriodDoc,
  watchPeriod,
  watchPeriods,
  watchTransactionsTotals,
} from '@/lib/repo/periods';
import { watchIncomeItems } from '@/lib/repo/income';
import { watchPlanTotals } from '@/lib/repo/plans';
import { applyAllocationDefaultsForPeriod, watchAllocations } from '@/lib/repo/allocations';
import { seedBudgetForNewPeriod } from '@/lib/repo/recurring';
import { planGroupLabel } from '@/lib/groups';

type CompareMode = 'AUTO' | 'MANUAL';

export default function DashboardScreen() {
  const router = useRouter();
  const uid = useAuthUser()?.uid;
  const pid = periodIdFromDate();

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [targetPct, setTargetPct] = useState({ needs: 0.5, wants: 0.3, sd: 0.2 });
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [planTotals, setPlanTotals] = useState({ needs: 0, wants: 0, sd: 0 });
  const [actualTotals, setActualTotals] = useState({ needs: 0, wants: 0, sd: 0 });
  const [allocationTotals, setAllocationTotals] = useState({ needs: 0, wants: 0, savings: 0, total: 0 });
  const [mode, setMode] = useState<CompareMode>('AUTO');

  useEffect(() => {
    if (!uid) return;

    getOrCreatePeriod(uid, pid);

    const unPeriod = watchPeriod(uid, pid, (period) => {
      setTargetPct(period.targetPct ?? { needs: 0.5, wants: 0.3, sd: 0.2 });
    });
    const unIncome = watchIncomeItems(uid, pid, (_rows, total) => setIncomeTotal(total));
    const unPlan = watchPlanTotals(uid, pid, (totals) => setPlanTotals(totals));
    const unActual = watchTransactionsTotals(uid, pid, setActualTotals);
    const unAlloc = watchAllocations(uid, pid, (_rows, totals) => setAllocationTotals(totals));
    const unList = watchPeriods(uid, setPeriods);

    return () => {
      unPeriod();
      unIncome();
      unPlan();
      unActual();
      unAlloc();
      unList();
    };
  }, [uid, pid]);

  const autoTargets = useMemo(
    () => ({
      needs: incomeTotal * targetPct.needs,
      wants: incomeTotal * targetPct.wants,
      sd: incomeTotal * targetPct.sd,
    }),
    [incomeTotal, targetPct]
  );

  const manualTotal = planTotals.needs + planTotals.wants + planTotals.sd;
  const manualPct = useMemo(
    () => ({
      needs: manualTotal > 0 ? (planTotals.needs / manualTotal) * 100 : 0,
      wants: manualTotal > 0 ? (planTotals.wants / manualTotal) * 100 : 0,
      sd: manualTotal > 0 ? (planTotals.sd / manualTotal) * 100 : 0,
    }),
    [manualTotal, planTotals]
  );

  const compareTargets = mode === 'AUTO' ? autoTargets : planTotals;
  const spentTotal = actualTotals.needs + actualTotals.wants + actualTotals.sd;
  const surplus = incomeTotal - spentTotal;

  async function createNextBudget() {
    if (!uid) return;
    const next = nextMonthMeta();
    const exists = periods.some((row) => row.id === next.id);
    await createPeriod(uid, next.id, next.title);
    if (!exists) {
      await seedBudgetForNewPeriod(uid, next.id);
      await applyAllocationDefaultsForPeriod(uid, next.id);
    }
    router.push(`/budgets/${next.id}`);
  }

  const rows = [
    {
      label: planGroupLabel('NEED'),
      actual: actualTotals.needs,
      target: compareTargets.needs,
      percent: mode === 'AUTO' ? targetPct.needs * 100 : manualPct.needs,
      color: 'bg-needs',
    },
    {
      label: planGroupLabel('WANT'),
      actual: actualTotals.wants,
      target: compareTargets.wants,
      percent: mode === 'AUTO' ? targetPct.wants * 100 : manualPct.wants,
      color: 'bg-wants',
    },
    {
      label: planGroupLabel('SAVINGS_DEBT'),
      actual: actualTotals.sd,
      target: compareTargets.sd,
      percent: mode === 'AUTO' ? targetPct.sd * 100 : manualPct.sd,
      color: 'bg-savings',
    },
  ];

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-8">
      <View className="flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <View>
          <Text className="text-3xl font-bold text-foreground dark:text-slate-100">Dashboard</Text>
          <Text className="text-sm text-muted-foreground">Overview for {pid}</Text>
        </View>
        <AppButton label="Create Next Budget" onPress={createNextBudget} />
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Income</Text>
          <Text className="mt-1 text-2xl font-bold text-foreground dark:text-slate-100">{fmtMoney(incomeTotal)}</Text>
          <Text className="text-xs text-muted-foreground">Planned this month</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Spent</Text>
          <Text className="mt-1 text-2xl font-bold text-foreground dark:text-slate-100">{fmtMoney(spentTotal)}</Text>
          <Text className="text-xs text-muted-foreground">Transactions so far</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Net Surplus</Text>
          <Text className={`mt-1 text-2xl font-bold ${surplus >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {fmtMoney(surplus)}
          </Text>
          <Text className="text-xs text-muted-foreground">Income minus spending</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Allocated</Text>
          <Text className="mt-1 text-2xl font-bold text-foreground dark:text-slate-100">{fmtMoney(allocationTotals.total)}</Text>
          <Text className="text-xs text-muted-foreground">Mapped to accounts</Text>
        </AppCard>
      </View>

      <View className="grid grid-cols-1 gap-4 xl:grid-cols-7">
        <AppCard className="xl:col-span-4 gap-4">
          <View className="gap-3 md:flex-row md:items-center md:justify-between">
            <View>
              <Text className="text-lg font-semibold text-foreground dark:text-slate-100">Spending Plan</Text>
              <Text className="text-sm text-muted-foreground">
                {mode === 'AUTO'
                  ? 'Auto mode uses your 50/30/20 target percentages.'
                  : 'Manual mode shows real percentages from current plan totals.'}
              </Text>
            </View>
            <AppSegmented
              value={mode}
              onChange={setMode}
              compact
              options={[
                { label: 'Auto 50/30/20', value: 'AUTO' },
                { label: 'Manual Real %', value: 'MANUAL' },
              ]}
            />
          </View>

          <View className="gap-4">
            {rows.map((row) => {
              const progress = row.target > 0 ? (row.actual / row.target) * 100 : 0;
              return (
                <View key={row.label} className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium text-foreground dark:text-slate-100">{row.label}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {fmtMoney(row.actual)} / {fmtMoney(row.target)} · {Math.round(row.percent)}%
                    </Text>
                  </View>
                  <AppProgressBar value={progress} indicatorClassName={row.color} />
                </View>
              );
            })}
          </View>
        </AppCard>

        <AppCard className="xl:col-span-3 gap-3">
          <View>
            <Text className="text-lg font-semibold text-foreground dark:text-slate-100">Recent Budgets</Text>
            <Text className="text-sm text-muted-foreground">Open a period to edit or view status.</Text>
          </View>

          <View className="gap-2">
            {periods.slice(0, 6).map((period) => (
              <Pressable
                key={period.id}
                className="rounded-lg border border-border bg-card px-3 py-3 dark:border-slate-700 dark:bg-slate-950"
                onPress={() => router.push(`/budgets/${period.id}`)}
              >
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-sm font-semibold text-foreground dark:text-slate-100">{period.title || period.id}</Text>
                    <Text className="text-xs text-muted-foreground">{period.id}</Text>
                  </View>
                  <AppBadge label={period.status ?? 'DRAFT'} variant={period.status === 'DECIDED' ? 'secondary' : 'success'} />
                </View>
              </Pressable>
            ))}
            {!periods.length ? <Text className="text-sm text-muted-foreground">No budgets yet. Create your first period.</Text> : null}
          </View>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-base font-semibold text-foreground dark:text-slate-100">Account Allocation Snapshot ({pid})</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <AppBadge label={`Needs ${fmtMoney(allocationTotals.needs)}`} variant="outline" />
          <AppBadge label={`Wants ${fmtMoney(allocationTotals.wants)}`} variant="outline" />
          <AppBadge label={`Savings ${fmtMoney(allocationTotals.savings)}`} variant="outline" />
        </View>
      </AppCard>
    </ScrollView>
  );
}
