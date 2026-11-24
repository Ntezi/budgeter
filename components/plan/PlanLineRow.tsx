import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppProgressBar } from '@/components/ui/AppProgressBar';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';

/** "Left GHS 280.00" or "Over by GHS 20.00" (BUDG-8 03 "States": line over plan). */
export function leftText(planned: number, spent: number): string {
  const left = planned - spent;
  return left < 0 ? `Over by ${fmtMoney(-left)}` : `Left ${fmtMoney(left)}`;
}

/** Share of the plan already spent, 0..100, for the thin bar under a line. */
export function spentPct(planned: number, spent: number): number {
  if (planned > 0) return Math.max(0, Math.min(100, (spent / planned) * 100));
  return spent > 0 ? 100 : 0;
}

type Props = {
  id: string;
  name: string;
  planned: number;
  spent: number;
  note?: string;
  needsAccount?: boolean;
  wide: boolean;
  onPress: (e?: unknown) => void;
};

/**
 * One plan line (BUDG-8 03): name and planned amount on the first line, "Spent · Left" under it and a thin bar.
 * From 1024 px the same row shows aligned Planned · Spent · Left columns. The whole row opens the line sheet.
 */
export function PlanLineRow({ id, name, planned, spent, note, needsAccount, wide, onPress }: Props) {
  const left = planned - spent;
  const over = left < 0;
  const a11y = `${name}, planned ${fmtMoney(planned)}, spent ${fmtMoney(spent)}, ${leftText(planned, spent)}`;
  const extra =
    needsAccount || note ? (
      <View className="flex-row flex-wrap items-center gap-2">
        {needsAccount ? <AppBadge label="Choose account" variant="warning" /> : null}
        {note ? (
          <Text className="min-w-0 shrink text-xs text-muted-foreground dark:text-zinc-400" numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
    ) : null;
  return (
    <Pressable
      testID={`plan-line-${id}`}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      className="min-h-11 lg:min-h-9 gap-1 px-4 py-2.5 lg:px-3 lg:py-2 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60"
    >
      {wide ? (
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
              {name}
            </Text>
            {extra}
          </View>
          <Text className="w-32 text-right text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
            {fmtMoney(planned)}
          </Text>
          <Text className="w-32 text-right text-xs text-muted-foreground dark:text-zinc-400" style={{ fontVariant: ['tabular-nums'] }}>
            {fmtMoney(spent)}
          </Text>
          <Text
            className={cn('w-32 text-right text-sm font-medium', over ? 'text-destructive dark:text-red-300' : 'text-foreground dark:text-zinc-50')}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {over ? `-${fmtMoney(-left)}` : fmtMoney(left)}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" />
        </View>
      ) : (
        <>
          <View className="flex-row items-center gap-3">
            <Text className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
              {name}
            </Text>
            <Text className="shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
              {fmtMoney(planned)}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" />
          </View>
          <View className="flex-row flex-wrap items-center gap-x-1">
            <Text className="text-xs text-muted-foreground dark:text-zinc-400">{`Spent ${fmtMoney(spent)} ·`}</Text>
            <Text className={cn('text-xs', over ? 'font-medium text-destructive dark:text-red-300' : 'text-muted-foreground dark:text-zinc-400')}>
              {leftText(planned, spent)}
            </Text>
          </View>
          {extra}
        </>
      )}
      <AppProgressBar value={spentPct(planned, spent)} className="h-1" indicatorClassName={over ? 'bg-destructive' : undefined} />
    </Pressable>
  );
}
