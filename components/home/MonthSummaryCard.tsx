import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppProgressBar } from '@/components/ui/AppProgressBar';
import { AppBadge } from '@/components/ui/AppBadge';
import { cn } from '@/lib/cn';
import type { HomeSummary } from '@/lib/view-models/homeSummary';

export type SpendChip = { id: string; label: string; amount: string; accessibilityLabel: string; dotClassName: string; onPress: () => void };
type Detail = { label: string; value: string };

/** Home's one answer (spec 02): how much is left, how far through, where it went. */
export function MonthSummaryCard({ summary, amount, chips, details }: { summary: HomeSummary; amount: string; chips: SpendChip[]; details: Detail[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View testID="home-summary" className="gap-3 rounded-xl border border-border bg-card p-3 md:p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-xs text-muted-foreground dark:text-zinc-400" numberOfLines={1}>
          {summary.label}
        </Text>
        {summary.tone === 'closed' ? <AppBadge label="Closed" variant="secondary" /> : null}
      </View>
      <Text
        testID="home-left-amount"
        className={cn('text-3xl font-bold', summary.over ? 'text-destructive dark:text-red-300' : 'text-foreground dark:text-zinc-50')}
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {amount}
      </Text>
      <View className="gap-1">
        <AppProgressBar value={summary.progress} indicatorClassName={summary.over ? 'bg-destructive' : undefined} />
        <Text className="text-xs text-muted-foreground dark:text-zinc-400">{summary.usedPct}% of the plan used</Text>
      </View>
      <Text className={cn('text-sm', summary.over ? 'text-destructive dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>{summary.sentence}</Text>
      <View className="flex-row flex-wrap gap-2" testID="home-spend-chips">
        {chips.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="link"
            accessibilityLabel={c.accessibilityLabel}
            onPress={c.onPress}
            className="min-h-11 lg:min-h-9 min-w-0 grow basis-[40%] gap-0.5 rounded-lg border border-border bg-background px-3 py-2 hover:bg-muted active:bg-muted dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 xl:basis-0"
          >
            <View className="flex-row items-center gap-2">
              <View className={cn('h-2 w-2 rounded-full', c.dotClassName)} />
              <Text className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{c.label}</Text>
            </View>
            <Text className="text-xs text-muted-foreground dark:text-zinc-400" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
              {c.amount}
            </Text>
          </Pressable>
        ))}
      </View>
      {details.length ? (
        <>
          <Pressable
            accessibilityRole="button"
            aria-expanded={open}
            onPress={() => setOpen((v) => !v)}
            className="-mx-2 h-11 lg:h-9 flex-row items-center gap-1 self-start rounded-md px-2"
          >
            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Details</Text>
            <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
          </Pressable>
          {open ? (
            <View className="gap-2" testID="home-summary-details">
              {details.map((d) => (
                <View key={d.label} className="flex-row items-center justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-xs text-muted-foreground dark:text-zinc-400" numberOfLines={1}>{d.label}</Text>
                  <Text className="shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>{d.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
