import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { monthIdFromDate, monthTitle } from '@/lib/rules/months';
import { chipLabel, monthChipParams, monthStatus, shortMonth, STATUS_WORD, viewedMonthId, yearMonths } from '@/lib/shell/monthChip';
import { type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';

/** Viewed-month chip (BUDG-8 00): reads periods, writes only ?month=. */
export function MonthChip() {
  const params = useGlobalSearchParams<{ month?: string }>();
  const router = useRouter();
  const uid = useWorkspaceUid();
  const { activePeriodId } = useWorkspace();
  const viewed = viewedMonthId(params.month, activePeriodId);
  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [year, setYear] = useState(Number(viewed.slice(0, 4)));
  const sheet = useSheet();
  const status = monthStatus(periods, viewed);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, setPeriods);
  }, [uid]);

  useEffect(() => {
    if (sheet.open) setYear(Number(viewed.slice(0, 4)));
  }, [sheet.open, viewed]);

  const choose = (id: string) => sheet.hide(() => router.setParams(monthChipParams(id)));

  return (
    <>
      <Pressable
        testID="month-chip"
        accessibilityRole="button"
        accessibilityLabel={`Viewing ${monthTitle(viewed)}, ${STATUS_WORD[status]}. Change month`}
        onPress={sheet.show}
        className="h-11 lg:h-9 flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {status === 'CLOSED' ? <MaterialCommunityIcons name="lock-outline" size={16} color="#717182" /> : null}
        <Text className={cn('text-sm font-medium', status === 'NOT_STARTED' ? 'text-muted-foreground' : 'text-foreground dark:text-zinc-50')}>
          {chipLabel(viewed)}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color="#717182" />
      </Pressable>
      <AppSheet open={sheet.open} onClose={() => sheet.hide()} title="Choose a month to view" testID="month-sheet">
        <View className="flex-row items-center justify-between">
          <Pressable accessibilityRole="button" accessibilityLabel={`${year - 1}`} onPress={() => setYear((y) => y - 1)} className="h-11 lg:h-9 w-11 lg:w-9 items-center justify-center rounded-md">
            <MaterialCommunityIcons name="chevron-left" size={22} color="#717182" />
          </Pressable>
          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{year}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${year + 1}`} onPress={() => setYear((y) => y + 1)} className="h-11 lg:h-9 w-11 lg:w-9 items-center justify-center rounded-md">
            <MaterialCommunityIcons name="chevron-right" size={22} color="#717182" />
          </Pressable>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {yearMonths(year).map((id) => {
            const s = monthStatus(periods, id);
            const active = id === viewed;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`${monthTitle(id)}, ${STATUS_WORD[s]}`}
                aria-pressed={active}
                onPress={() => choose(id)}
                className={cn(
                  'h-11 lg:h-9 min-w-[30%] flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border px-2',
                  active ? 'border-primary bg-primary dark:border-zinc-800 dark:bg-zinc-50' : 'border-border bg-card dark:border-zinc-800 dark:bg-zinc-900'
                )}
              >
                <View
                  className={cn(
                    'h-2 w-2 rounded-full',
                    s === 'OPEN' ? 'bg-emerald-500' : s === 'CLOSED' ? 'bg-zinc-500' : 'border border-border bg-muted dark:border-zinc-800 dark:bg-zinc-800'
                  )}
                />
                <Text className={cn('text-sm font-medium', active ? 'text-white dark:text-zinc-900' : 'text-foreground dark:text-zinc-50')}>{shortMonth(id)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-xs text-muted-foreground dark:text-zinc-400">● Open · ● Closed · ○ Not started. Viewing a month never creates it.</Text>
        <AppButton label="This month" variant="outline" size="touch" onPress={() => choose(monthIdFromDate(new Date()))} />
      </AppSheet>
    </>
  );
}
