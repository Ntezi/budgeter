import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  periodTitleFromId,
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
import { cn } from '@/lib/cn';

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
  const savingsRate = incomeTotal > 0 ? Math.round((surplus / incomeTotal) * 100) : 0;

  const currentPeriodTitle = useMemo(() => {
    const current = periods.find((row) => row.id === pid);
    return current?.title || periodTitleFromId(pid);
  }, [periods, pid]);

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

  function openCurrentBudget() {
    router.push(`/budgets/${pid}`);
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
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Dashboard</Text>
          <Text className="text-sm text-muted-foreground">Overview for {currentPeriodTitle}</Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <AppButton onPress={openCurrentBudget} variant="outline">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="wallet-outline" size={16} color="#717182" />
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Open Current Budget</Text>
            </View>
          </AppButton>
          <AppButton onPress={createNextBudget}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
              <Text className="text-sm font-medium text-primary-foreground">Create Next Budget</Text>
            </View>
          </AppButton>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Income</Text>
            <MaterialCommunityIcons name="cash-plus" size={16} color="#16A34A" />
          </View>
          <Text className="text-2xl font-bold text-foreground dark:text-zinc-50">{fmtMoney(incomeTotal)}</Text>
          <Text className="text-xs text-muted-foreground">Planned this month</Text>
        </AppCard>
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Spent</Text>
            <MaterialCommunityIcons name="cash-minus" size={16} color="#D4183D" />
          </View>
          <Text className="text-2xl font-bold text-foreground dark:text-zinc-50">{fmtMoney(spentTotal)}</Text>
          <Text className="text-xs text-muted-foreground">Transactions so far</Text>
        </AppCard>
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Net Surplus</Text>
            <MaterialCommunityIcons name="chart-line" size={16} color={surplus >= 0 ? '#16A34A' : '#D4183D'} />
          </View>
          <Text className={cn('text-2xl font-bold', surplus >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300')}>
            {fmtMoney(surplus)}
          </Text>
          <Text className="text-xs text-muted-foreground">Savings rate {savingsRate}%</Text>
        </AppCard>
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Allocated</Text>
            <MaterialCommunityIcons name="bank-outline" size={16} color="#717182" />
          </View>
          <Text className="text-2xl font-bold text-foreground dark:text-zinc-50">{fmtMoney(allocationTotals.total)}</Text>
          <Text className="text-xs text-muted-foreground">Mapped to accounts</Text>
        </AppCard>
      </View>

      <AppCard className="gap-4">
        <View className="gap-3 md:flex-row md:items-center md:justify-between">
          <View>
            <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">Spending Plan</Text>
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
                  <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.label}</Text>
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

      <AppCard className="gap-3">
        <View>
          <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">Recent Budgets</Text>
          <Text className="text-sm text-muted-foreground">Open a period to edit or view status.</Text>
        </View>

        <View className="gap-2">
          {periods.slice(0, 6).map((period) => (
            <Pressable
              key={period.id}
              className="overflow-hidden rounded-lg border border-border bg-card dark:border-zinc-800 dark:bg-zinc-950"
              onPress={() => router.push(`/budgets/${period.id}`)}
            >
              <View className="flex-row">
                <View className={cn('w-1', period.status === 'DECIDED' ? 'bg-zinc-500' : 'bg-emerald-500')} />
                <View className="flex-1 flex-row items-center justify-between px-3 py-3">
                  <View>
                    <Text className="text-sm font-semibold text-foreground dark:text-zinc-50" numberOfLines={1}>
                      {period.title || period.id}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{period.id}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <AppBadge label={period.status ?? 'DRAFT'} variant={period.status === 'DECIDED' ? 'secondary' : 'success'} />
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#717182" />
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
          {!periods.length ? <Text className="text-sm text-muted-foreground">No budgets yet. Create your first period.</Text> : null}
        </View>
      </AppCard>

      <AppCard className="gap-3">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Account Allocation Snapshot ({pid})</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <AppBadge label={`Needs ${fmtMoney(allocationTotals.needs)}`} variant="outline" />
          <AppBadge label={`Wants ${fmtMoney(allocationTotals.wants)}`} variant="outline" />
          <AppBadge label={`Savings ${fmtMoney(allocationTotals.savings)}`} variant="outline" />
        </View>
      </AppCard>
    </ScrollView>
  );
}
