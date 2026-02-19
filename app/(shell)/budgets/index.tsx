import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  createPeriod,
  nextMonthMeta,
  periodTitleFromId,
  type PeriodDoc,
  watchPeriods,
} from '@/lib/repo/periods';
import { seedBudgetForNewPeriod } from '@/lib/repo/recurring';
import { applyAllocationDefaultsForPeriod } from '@/lib/repo/allocations';
import { watchIncomeItems } from '@/lib/repo/income';
import { watchPlanTotals } from '@/lib/repo/plans';
import { fmtMoney } from '@/lib/format';

export default function BudgetsScreen() {
  const uid = useWorkspaceUid();
  const router = useRouter();
  const next = useMemo(() => nextMonthMeta(), []);

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [totalsByPeriod, setTotalsByPeriod] = useState<Record<string, { income: number; planned: number }>>({});

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, setPeriods);
  }, [uid]);

  const sortedPeriods = useMemo(() => [...periods].sort((a, b) => b.id.localeCompare(a.id)), [periods]);
  const periodIdsKey = useMemo(() => sortedPeriods.map((row) => row.id).join('|'), [sortedPeriods]);

  useEffect(() => {
    if (!uid || !sortedPeriods.length) return;
    const unsubs: (() => void)[] = [];

    sortedPeriods.forEach((period) => {
      unsubs.push(
        watchIncomeItems(uid, period.id, (_rows, activeTotal) => {
          setTotalsByPeriod((prev) => ({
            ...prev,
            [period.id]: {
              income: activeTotal,
              planned: prev[period.id]?.planned ?? 0,
            },
          }));
        })
      );
      unsubs.push(
        watchPlanTotals(uid, period.id, (totals) => {
          setTotalsByPeriod((prev) => ({
            ...prev,
            [period.id]: {
              income: prev[period.id]?.income ?? 0,
              planned: totals.needs + totals.wants + totals.sd,
            },
          }));
        })
      );
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [uid, periodIdsKey, sortedPeriods]);

  function incPid(pid: string) {
    const [yRaw, mRaw] = pid.split('-');
    const year = Number(yRaw);
    const month = Number(mRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return nextMonthMeta().id;
    const date = new Date(year, month - 1, 1);
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  async function createNextBudget() {
    if (!uid) return;
    let pid = next.id;
    while (periods.some((row) => row.id === pid)) {
      pid = incPid(pid);
    }
    const title = periodTitleFromId(pid);
    await createPeriod(uid, pid, title);
    await seedBudgetForNewPeriod(uid, pid);
    await applyAllocationDefaultsForPeriod(uid, pid);
    router.push(`/budgets/${pid}`);
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-5 pb-8">
      <View className="flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <View>
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Budgets</Text>
          <Text className="text-sm text-muted-foreground">Plan and track your money by month.</Text>
        </View>
        <AppButton onPress={createNextBudget}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-primary-foreground">New Budget</Text>
          </View>
        </AppButton>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedPeriods.map((period) => {
          const totals = totalsByPeriod[period.id] ?? { income: 0, planned: 0 };
          return (
            <Pressable
              key={period.id}
              className="overflow-hidden rounded-xl border border-border bg-card hover:bg-muted/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/70"
              onPress={() => router.push(`/budgets/${period.id}`)}
            >
              <View className="flex-row">
                <View className={period.status === 'DECIDED' ? 'w-1 bg-zinc-500' : 'w-1 bg-emerald-500'} />
                <View className="flex-1 px-4 py-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{period.title || period.id}</Text>
                      <Text className="text-xs text-muted-foreground">{period.id}</Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <MaterialCommunityIcons
                        name={period.status === 'DECIDED' ? 'lock-outline' : 'lock-open-outline'}
                        size={14}
                        color={period.status === 'DECIDED' ? '#717182' : '#16A34A'}
                      />
                      <AppBadge label={period.status ?? 'DRAFT'} variant={period.status === 'DECIDED' ? 'secondary' : 'success'} />
                    </View>
                  </View>

                  <View className="mt-3 gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-muted-foreground">Income</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(totals.income)}</Text>
                    </View>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-muted-foreground">Planned</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(totals.planned)}</Text>
                    </View>
                  </View>

                  <View className="mt-3 flex-row items-center gap-1">
                    <Text className="text-xs font-semibold text-primary dark:text-zinc-50">Open Budget</Text>
                    <MaterialCommunityIcons name="arrow-right" size={14} color="#030213" />
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}

        {!sortedPeriods.length ? (
          <AppCard>
            <Text className="text-sm text-muted-foreground">No budgets yet. Create your first period.</Text>
          </AppCard>
        ) : null}
      </View>
    </ScrollView>
  );
}
