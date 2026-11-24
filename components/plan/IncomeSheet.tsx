import React from 'react';
import { Text, View } from 'react-native';
import { ToggleRow } from '@/components/plan/ToggleRow';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { DangerTextButton } from '@/components/plan/DangerTextButton';
import { AppInput } from '@/components/ui/AppInput';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';

type Item = { id?: string; name: string; amount: number; active?: boolean };
type Edit = { name: string; amount: string; dirty: boolean; saving: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  monthLabel: string;
  readOnly: boolean;
  items: Item[];
  edits: Record<string, Edit>;
  activeTotal: number;
  pausedTotal: number;
  onEdit: (id: string, patch: Partial<Edit>) => void;
  onSave: (item: Item) => void;
  onToggle: (item: Item, active: boolean) => void;
  onRemove: (id: string) => void;
  draft: { name: string; amount: string };
  onDraft: (patch: Partial<{ name: string; amount: string }>) => void;
  onAdd: () => void;
  error?: string;
};

/** "Money coming in": the month's income lines behind one row of the plan. */
export function IncomeSheet(p: Props) {
  return (
    <AppSheet open={p.open} onClose={p.onClose} title="Money coming in" testID="income-sheet">
      <View className="gap-5">
        <Text className="text-xs text-muted-foreground dark:text-zinc-400">
          {`${fmtMoney(p.activeTotal)} expected in ${p.monthLabel}${p.pausedTotal > 0 ? ` · ${fmtMoney(p.pausedTotal)} switched off` : ''}`}
        </Text>
        <View className="overflow-hidden rounded-xl border border-border dark:border-zinc-800">
          {p.items.map((item, i) => {
            if (!item.id) return null;
            const edit = p.edits[item.id];
            const off = item.active === false;
            return (
              <View key={item.id} className={cn('gap-3 px-4 py-3', i > 0 ? 'border-t border-border dark:border-zinc-800' : undefined)}>
                {p.readOnly || !edit ? (
                  <View className="min-h-11 lg:min-h-9 flex-row items-center gap-3">
                    <Text className={cn('min-w-0 flex-1 text-sm', off ? 'text-muted-foreground line-through' : 'text-foreground dark:text-zinc-50')} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
                      {fmtMoney(item.amount || 0)}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View className="flex-row flex-wrap gap-3">
                      <View className="min-w-0 flex-[2] basis-40">
                        <AppInput accessibilityLabel={`Name of ${item.name}`} value={edit.name} onChangeText={(v) => p.onEdit(item.id!, { name: v })} className="" />
                      </View>
                      <View className="min-w-0 flex-1 basis-28">
                        <AppInput
                          accessibilityLabel={`Amount of ${item.name}`}
                          value={edit.amount}
                          onChangeText={(v) => p.onEdit(item.id!, { amount: v })}
                          keyboardType="decimal-pad"
                          className="h-11 lg:h-9 text-right text-sm"
                        />
                      </View>
                    </View>
                    <ToggleRow
                      label="Count this month"
                      accessibilityLabel={`Count ${item.name} this month`}
                      description={off ? 'Switched off: not in the totals' : undefined}
                      value={!off}
                      onChange={(v) => p.onToggle(item, v)}
                    />
                    <View className="min-h-11 lg:min-h-9 flex-row flex-wrap items-center justify-end gap-3">
                      {edit.dirty ? <AppButton label={edit.saving ? 'Saving…' : 'Save'} size="touch" onPress={() => p.onSave(item)} disabled={edit.saving} /> : null}
                      <DangerTextButton label="Remove" onPress={() => p.onRemove(item.id!)} />
                    </View>
                  </>
                )}
              </View>
            );
          })}
          {!p.items.length ? <Text className="px-4 py-4 text-xs text-muted-foreground dark:text-zinc-400">No income yet for this month.</Text> : null}
        </View>

        {p.readOnly ? null : (
          <View className="gap-3 border-t border-border pt-4 dark:border-zinc-800">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Add income</Text>
            <FormField label="Source">
              <AppInput accessibilityLabel="Income source" value={p.draft.name} onChangeText={(v) => p.onDraft({ name: v })} placeholder="e.g. Salary" className="" />
            </FormField>
            <FormField label="Amount">
              <AppInput
                accessibilityLabel="Income amount"
                value={p.draft.amount}
                onChangeText={(v) => p.onDraft({ amount: v })}
                keyboardType="decimal-pad"
                placeholder="0.00"
                className="h-11 lg:h-9 text-sm"
              />
            </FormField>
            <AppButton label="Add income" size="touch" onPress={p.onAdd} />
          </View>
        )}
        {p.error ? <Text className="text-xs text-destructive dark:text-red-300">{p.error}</Text> : null}
      </View>
    </AppSheet>
  );
}
