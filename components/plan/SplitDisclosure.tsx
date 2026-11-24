import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';

type Triple = { needs: number; wants: number; sd: number };

type Props = {
  readOnly: boolean;
  /** Planned amounts per group. */
  planned: Triple;
  /** Target shares, 0..1. */
  targetPct: Triple;
  /** Income × target share. */
  targetAmounts: Triple;
  title: string;
  onTitle: (v: string) => void;
  onSaveTitle: () => void;
  pctInputs: { needs: string; wants: string; sd: string };
  onPct: (key: 'needs' | 'wants' | 'sd', v: string) => void;
  onSaveTargets: () => void;
};

const ROWS: { key: keyof Triple; label: string; dot: string }[] = [
  { key: 'needs', label: 'Needs', dot: 'bg-needs' },
  { key: 'wants', label: 'Wants', dot: 'bg-wants' },
  { key: 'sd', label: 'Savings', dot: 'bg-savings' },
];

/** "Split  Needs 69 · Wants 9 · Savings 22": your split against the 50 · 30 · 20 targets, behind one disclosure (was "Budget Meta"). */
export function SplitDisclosure(p: Props) {
  const [open, setOpen] = useState(false);
  const total = p.planned.needs + p.planned.wants + p.planned.sd;
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const summary = `Needs ${share(p.planned.needs)}% · Wants ${share(p.planned.wants)}% · Savings ${share(p.planned.sd)}%`;
  return (
    <View className="gap-3 border-t border-border pt-2 dark:border-zinc-800">
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityLabel={`Split: ${summary}`}
        onPress={() => setOpen((v) => !v)}
        className="min-h-11 lg:min-h-9 flex-row items-center gap-2"
      >
        <Text className="shrink-0 text-sm font-medium text-foreground dark:text-zinc-50">Split</Text>
        <Text className="min-w-0 flex-1 text-right text-xs text-muted-foreground dark:text-zinc-400">{summary}</Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
      </Pressable>
      {open ? (
        <View className="gap-4" testID="split-details">
          {ROWS.map((row) => (
            <View key={row.key} className="gap-0.5">
              <View className="flex-row items-center gap-2">
                <View className={cn('h-2.5 w-2.5 rounded-full', row.dot)} />
                <Text className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50">{row.label}</Text>
                <Text className="shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
                  {`${fmtMoney(p.planned[row.key])} · ${share(p.planned[row.key])}%`}
                </Text>
              </View>
              <Text className="pl-4 text-xs text-muted-foreground dark:text-zinc-400">
                {`Target ${Math.round(p.targetPct[row.key] * 100)}% · ${fmtMoney(p.targetAmounts[row.key])}`}
              </Text>
            </View>
          ))}
          {p.readOnly ? null : (
            <View className="gap-4 border-t border-border pt-3 dark:border-zinc-800">
              <View className="flex-row flex-wrap gap-3">
                {ROWS.map((row) => (
                  <View key={row.key} className="min-w-0 flex-1 basis-20">
                    <FormField label={`${row.label} %`}>
                      <AppInput
                        accessibilityLabel={`${row.label} target percent`}
                        value={p.pctInputs[row.key]}
                        onChangeText={(v) => p.onPct(row.key, v)}
                        keyboardType="decimal-pad"
                        className="h-11 lg:h-9 text-sm"
                      />
                    </FormField>
                  </View>
                ))}
              </View>
              <AppButton label="Save targets" variant="outline" size="touch" onPress={p.onSaveTargets} />
              <FormField label="Plan name">
                <AppInput accessibilityLabel="Plan name" value={p.title} onChangeText={p.onTitle} className="" />
              </FormField>
              <AppButton label="Save name" variant="outline" size="touch" onPress={p.onSaveTitle} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
