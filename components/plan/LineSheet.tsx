import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ToggleRow } from '@/components/plan/ToggleRow';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { DangerTextButton } from '@/components/plan/DangerTextButton';
import { AppInput } from '@/components/ui/AppInput';
import { DropdownField } from '@/components/ui/DropdownField';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';
import { leftText } from '@/components/plan/PlanLineRow';

type Option = { label: string; value: string };
export type LineEdit = { name: string; amount: string; tagsInput: string; dirty: boolean; saving: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  monthLabel: string;
  readOnly: boolean;
  line: { id: string; name: string; amount: number } | null;
  spent: number;
  spentCount: number;
  edit: LineEdit | null;
  onEdit: (patch: Partial<LineEdit>) => void;
  onSave: () => void;
  accountId: string;
  accountLabel: string;
  accountOptions: Option[];
  onPickAccount: (accountId: string) => void;
  accountHint?: string;
  repairText?: string;
  markSpent?: { amount: number; accountName: string; date: string; busy: boolean; onPress: () => void } | null;
  pinned?: { value: boolean; disabled: boolean; onChange: (value: boolean) => void } | null;
  onRemove: () => void;
  onOpenActivity: () => void;
  error?: string;
};

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'over' }) {
  return (
    <View className="min-h-8 flex-row items-center gap-3">
      <Text className="min-w-0 flex-1 text-sm text-muted-foreground dark:text-zinc-400">{label}</Text>
      <Text
        className={cn('shrink-0 text-base font-semibold', tone === 'over' ? 'text-destructive dark:text-red-300' : 'text-foreground dark:text-zinc-50')}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Tap a plan line (BUDG-8 03 "Line sheet"): replaces the pencil/bin pair, Spending Details and Reconcile tabs. */
export function LineSheet(props: Props) {
  const { open, onClose, monthLabel, readOnly, line, spent, spentCount, edit, onEdit, onSave } = props;
  const [more, setMore] = useState(false);
  if (!line) return null;
  const planned = Number(line.amount || 0);
  const over = planned - spent < 0;
  const footer = readOnly ? undefined : (
    <AppButton
      label={edit?.saving ? 'Saving…' : 'Save changes'}
      size="touch-lg"
      className="w-full items-center justify-center"
      onPress={onSave}
      disabled={!edit?.dirty || edit?.saving}
    />
  );
  return (
    <AppSheet open={open} onClose={onClose} title={line.name} footer={footer} testID="line-sheet">
      <View className="gap-5">
        <View className="gap-1 rounded-lg bg-muted/40 px-3 py-2 dark:bg-zinc-800/40">
          <Figure label="Planned" value={fmtMoney(planned)} />
          <Figure label="Spent" value={fmtMoney(spent)} />
          <Figure label={over ? 'Over plan' : 'Left'} value={leftText(planned, spent).replace(/^(Left|Over by) /, '')} tone={over ? 'over' : undefined} />
        </View>

        <FormField label="Paid from">
          {readOnly ? (
            <Text className="text-base text-foreground dark:text-zinc-50">{props.accountLabel}</Text>
          ) : (
            <View className="z-10">
              <DropdownField
                value={props.accountId}
                options={props.accountOptions}
                onChange={props.onPickAccount}
                placeholder="Choose account"
                menuStrategy="inline"
                triggerClassName="h-11"
              />
            </View>
          )}
          {props.repairText ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <AppBadge label="Choose account" variant="warning" />
              <Text className="min-w-0 flex-1 text-sm text-muted-foreground dark:text-zinc-400">{props.repairText}</Text>
            </View>
          ) : props.accountHint ? (
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">{props.accountHint}</Text>
          ) : null}
        </FormField>

        {readOnly || !edit ? null : (
          <>
            <FormField label="Planned amount">
              <AppInput
                accessibilityLabel="Planned amount"
                value={edit.amount}
                onChangeText={(value) => onEdit({ amount: value })}
                keyboardType="decimal-pad"
                placeholder="0.00"
                className="h-11 text-base" style={{ height: 44 }}
              />
            </FormField>
            <Pressable
              accessibilityRole="button"
              aria-expanded={more}
              onPress={() => setMore((v) => !v)}
              className="-mx-2 h-11 flex-row items-center gap-1 self-start rounded-md px-2"
            >
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Name and tags</Text>
              <MaterialCommunityIcons name={more ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
            </Pressable>
            {more ? (
              <View className="gap-4">
                <FormField label="Name">
                  <AppInput accessibilityLabel="Line name" value={edit.name} onChangeText={(value) => onEdit({ name: value })} className="h-11 text-base" style={{ height: 44 }} />
                </FormField>
                <FormField label="Tags">
                  <AppInput
                    accessibilityLabel="Tags"
                    value={edit.tagsInput}
                    onChangeText={(value) => onEdit({ tagsInput: value })}
                    placeholder="utilities, vegetables"
                    className="h-11 text-base" style={{ height: 44 }}
                  />
                </FormField>
              </View>
            ) : null}
          </>
        )}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Spent so far, ${spentCount} ${spentCount === 1 ? 'payment' : 'payments'}, open Activity`}
          onPress={props.onOpenActivity}
          className="min-h-12 flex-row items-center gap-3 border-t border-border pt-2 dark:border-zinc-800"
        >
          <Text className="min-w-0 flex-1 text-base text-foreground dark:text-zinc-50">{`Spent so far (${spentCount})`}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" />
        </Pressable>

        {!readOnly && props.markSpent ? (
          <View className="gap-2">
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">
              {`Posts to ${monthLabel} · ${props.markSpent.accountName} · ${fmtMoney(props.markSpent.amount)} · ${props.markSpent.date}`}
            </Text>
            <AppButton
              label={props.markSpent.busy ? 'Recording…' : `Mark ${fmtMoney(props.markSpent.amount)} as spent`}
              variant="outline"
              size="touch"
              onPress={props.markSpent.onPress}
              disabled={props.markSpent.busy}
            />
          </View>
        ) : null}

        {!readOnly && props.pinned ? (
          <ToggleRow
            label="Fund this line first"
            description={props.pinned.disabled ? 'Fully spent lines are no longer prioritised.' : 'Income covers this line before the others.'}
            value={props.pinned.value}
            disabled={props.pinned.disabled}
            onChange={props.pinned.onChange}
          />
        ) : null}

        {props.error ? <Text className="text-sm text-destructive dark:text-red-300">{props.error}</Text> : null}

        {readOnly ? null : (
          <DangerTextButton label={`Remove from ${monthLabel}`} onPress={props.onRemove} />
        )}
      </View>
    </AppSheet>
  );
}
