import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  monthLabel: string;
  busyMonth: boolean;
  busyAccounts: boolean;
  error: string;
  /** Was "Export Core" (Summary) and "Export Full" (Everything); same builders, same files. */
  onMonth: (kind: 'summary' | 'everything') => void;
  /** Was "Export Excel". */
  onAccounts: () => void;
};

function Radio({ label, sub, on, onPress }: { label: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={`${label}. ${sub}`} aria-checked={on} accessibilityState={{ checked: on }} onPress={onPress} className="min-h-11 lg:min-h-9 flex-row items-center gap-3 rounded-md">
      <View className={cn('h-5 w-5 items-center justify-center rounded-full border-2', on ? 'border-primary dark:border-zinc-700' : 'border-border dark:border-zinc-700')}>
        {on ? <View className="h-2.5 w-2.5 rounded-full bg-primary dark:bg-zinc-50" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-foreground dark:text-zinc-50">{label}</Text>
        <Text className="text-xs text-muted-foreground dark:text-zinc-400">{sub}</Text>
      </View>
    </Pressable>
  );
}

export function ExportSheet(p: Props) {
  const [kind, setKind] = useState<'summary' | 'everything'>('everything');
  return (
    <AppSheet open={p.open} onClose={p.onClose} title="Export" testID="export-sheet">
      <View className="gap-6">
        <View className="gap-2" role="radiogroup">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{`${p.monthLabel} workbook`}</Text>
          <Radio label="Summary" sub="Summary, income, plan, spending and set-aside sheets" on={kind === 'summary'} onPress={() => setKind('summary')} />
          <Radio label="Everything" sub="Adds the report, categories, accounts and shopping" on={kind === 'everything'} onPress={() => setKind('everything')} />
          <AppButton label={p.busyMonth ? 'Preparing file…' : 'Download .xlsx'} accessibilityLabel="Download .xlsx" size="touch-lg" className="w-full" disabled={p.busyMonth} onPress={() => p.onMonth(kind)} />
        </View>
        <View className="flex-row flex-wrap items-center gap-3 border-t border-border pt-4 dark:border-zinc-800">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Accounts workbook</Text>
            <Text className="text-xs text-muted-foreground dark:text-zinc-400">Balances and set-asides for every account</Text>
          </View>
          <AppButton label={p.busyAccounts ? 'Preparing file…' : 'Download'} accessibilityLabel="Download accounts" variant="outline" size="touch" disabled={p.busyAccounts} onPress={p.onAccounts} />
        </View>
        {p.error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{p.error}</Text> : null}
      </View>
    </AppSheet>
  );
}
