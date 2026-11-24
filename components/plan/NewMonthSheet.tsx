import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppSheet } from '@/components/patterns/AppSheet';
import { AppButton } from '@/components/ui/AppButton';
import { cn } from '@/lib/cn';

type Choice = { id: string; label: string; kind: string };
type Props = {
  open: boolean;
  onClose: () => void;
  choices: Choice[];
  chosenId: string;
  onChoose: (id: string) => void;
  actionLine: string;
  buttonLabel: string;
  onConfirm: () => void;
  disabled: boolean;
  error?: string;
};

/** New month (BUDG-8 03, BUDG-1 rules): this month first, next month, missing earlier months; one verb on one button. */
export function NewMonthSheet(p: Props) {
  const footer = (
    <View className="gap-2">
      {p.actionLine ? (
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50" accessibilityLiveRegion="polite">
          {p.actionLine}
        </Text>
      ) : null}
      <AppButton label={p.buttonLabel} size="touch-lg" className="w-full items-center justify-center" onPress={p.onConfirm} disabled={p.disabled} />
    </View>
  );
  return (
    <AppSheet open={p.open} onClose={p.onClose} title="New month" footer={footer} testID="new-month-sheet">
      <View className="gap-3">
        <View accessibilityRole="radiogroup" className="overflow-hidden rounded-xl border border-border dark:border-zinc-800">
          {p.choices.map((row, i) => {
            const on = row.id === p.chosenId;
            return (
              <Pressable
                key={row.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                onPress={() => p.onChoose(row.id)}
                className={cn('min-h-11 lg:min-h-9 flex-row items-center gap-3 px-4', i > 0 ? 'border-t border-border dark:border-zinc-800' : undefined, on ? 'bg-muted/60 dark:bg-zinc-800' : undefined)}
              >
                <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={20} color="#717182" />
                <Text className="min-w-0 flex-1 text-sm text-foreground dark:text-zinc-50">{row.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-xs text-muted-foreground dark:text-zinc-400">A new month starts blank. You can add your regular costs once it is open.</Text>
        {p.error ? <Text className="text-sm text-destructive dark:text-red-300">{p.error}</Text> : null}
      </View>
    </AppSheet>
  );
}
