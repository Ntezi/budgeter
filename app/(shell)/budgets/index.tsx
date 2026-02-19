import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useAuthUser } from '@/providers/AuthProvider';
import {
  createPeriod,
  nextMonthMeta,
  periodTitleFromId,
  type PeriodDoc,
  watchPeriods,
} from '@/lib/repo/periods';
import { seedBudgetForNewPeriod } from '@/lib/repo/recurring';
import { applyAllocationDefaultsForPeriod } from '@/lib/repo/allocations';

export default function BudgetsScreen() {
  const uid = useAuthUser()?.uid;
  const router = useRouter();
  const next = useMemo(() => nextMonthMeta(), []);

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, setPeriods);
  }, [uid]);

  const sortedPeriods = useMemo(() => [...periods].sort((a, b) => b.id.localeCompare(a.id)), [periods]);

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
          <Text className="text-3xl font-bold text-foreground dark:text-slate-100">Budgets</Text>
          <Text className="text-sm text-muted-foreground">Plan and track your money by month.</Text>
        </View>
        <AppButton onPress={createNextBudget}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-primary-foreground dark:text-slate-900">New Budget</Text>
          </View>
        </AppButton>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sortedPeriods.map((period) => (
          <Pressable
            key={period.id}
            className="overflow-hidden rounded-xl border border-border bg-card dark:border-slate-700 dark:bg-slate-900"
            onPress={() => router.push(`/budgets/${period.id}`)}
          >
            <View className="flex-row">
              <View className={period.status === 'DECIDED' ? 'w-1 bg-slate-500' : 'w-1 bg-emerald-500'} />
              <View className="flex-1 px-4 py-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-foreground dark:text-slate-100">{period.title || period.id}</Text>
                    <Text className="text-xs text-muted-foreground">{period.id}</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <MaterialCommunityIcons
                      name={period.status === 'DECIDED' ? 'lock-outline' : 'lock-open-outline'}
                      size={14}
                      color={period.status === 'DECIDED' ? '#64748B' : '#16A34A'}
                    />
                    <AppBadge label={period.status ?? 'DRAFT'} variant={period.status === 'DECIDED' ? 'secondary' : 'success'} />
                  </View>
                </View>

                <Text className="mt-3 text-xs text-muted-foreground">
                  {period.status === 'DECIDED' ? 'Locked plan' : 'Draft mode'}
                </Text>

                <View className="mt-3 flex-row items-center gap-1">
                  <Text className="text-xs font-semibold text-primary dark:text-slate-100">Open Budget</Text>
                  <MaterialCommunityIcons name="arrow-right" size={14} color="#4338CA" />
                </View>
              </View>
            </View>
          </Pressable>
        ))}

        {!sortedPeriods.length ? (
          <AppCard>
            <Text className="text-sm text-muted-foreground">No budgets yet. Create your first period.</Text>
          </AppCard>
        ) : null}
      </View>
    </ScrollView>
  );
}
