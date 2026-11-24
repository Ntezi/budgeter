import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';
import { PlanLineRow } from '@/components/plan/PlanLineRow';

export type PlanGroupRow = { id: string; name: string; planned: number; spent: number; note?: string; needsAccount?: boolean };
export type PlanGroupData = { value: string; label: string; dotClass: string; addLabel: string; rows: PlanGroupRow[] };

type Props = {
  groups: PlanGroupData[];
  wide: boolean;
  readOnly: boolean;
  onOpenLine: (id: string, e?: unknown) => void;
  onAddLine: (group: string, e?: unknown) => void;
};

/** Needs, Wants, Savings: collapsible group headers with the planned total, lines as rows in one card each. */
export function PlanGroupList({ groups, wide, readOnly, onOpenLine, onAddLine }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <View testID="plan-groups" className="gap-6">
      {groups.map((group) => {
        if (readOnly && !group.rows.length) return null;
        const planned = group.rows.reduce((sum, row) => sum + row.planned, 0);
        const isCollapsed = collapsed[group.value] === true;
        return (
          <View key={group.value} testID={`plan-group-${group.value}`} className="gap-2">
            <Pressable
              accessibilityRole="button"
              aria-expanded={!isCollapsed}
              accessibilityLabel={`${group.label}, ${fmtMoney(planned)} planned`}
              onPress={() => setCollapsed((prev) => ({ ...prev, [group.value]: !isCollapsed }))}
              className="min-h-11 lg:min-h-9 flex-row items-center gap-2 rounded-md px-1"
            >
              <View className={cn('h-2.5 w-2.5 rounded-full', group.dotClass)} />
              <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground dark:text-zinc-50" numberOfLines={1}>
                {group.label}
              </Text>
              <Text className="shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
                {fmtMoney(planned)}
              </Text>
              <MaterialCommunityIcons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={20} color="#717182" />
            </Pressable>
            {isCollapsed ? null : (
              <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
                {wide && group.rows.length ? (
                  <View className="flex-row items-center gap-3 border-b border-border px-4 py-2 dark:border-zinc-800">
                    <Text className="min-w-0 flex-1 text-xs text-muted-foreground dark:text-zinc-400">Line</Text>
                    <Text className="w-32 text-right text-xs text-muted-foreground dark:text-zinc-400">Planned</Text>
                    <Text className="w-32 text-right text-xs text-muted-foreground dark:text-zinc-400">Spent</Text>
                    <Text className="w-32 text-right text-xs text-muted-foreground dark:text-zinc-400">Left</Text>
                    <View className="w-5" />
                  </View>
                ) : null}
                {group.rows.map((row, i) => (
                  <View key={row.id} className={i > 0 ? 'border-t border-border dark:border-zinc-800' : undefined}>
                    <PlanLineRow {...row} wide={wide} onPress={(e) => onOpenLine(row.id, e)} />
                  </View>
                ))}
                {readOnly ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={group.addLabel}
                    onPress={(e) => onAddLine(group.value, e)}
                    className={cn(
                      'min-h-11 lg:min-h-9 flex-row items-center gap-2 px-4 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60',
                      group.rows.length ? 'border-t border-border dark:border-zinc-800' : undefined
                    )}
                  >
                    <MaterialCommunityIcons name="plus" size={20} color="#717182" />
                    <Text className="text-xs text-muted-foreground dark:text-zinc-400">{group.addLabel}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
