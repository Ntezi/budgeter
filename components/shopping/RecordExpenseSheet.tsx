import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormRow } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { DropdownField } from '@/components/ui/DropdownField';
import { cn } from '@/lib/cn';

type Option = { label: string; value: string };
export type RecordRow = {
  id: string;
  name: string;
  quantity: string;
  amount: string;
  lineId: string;
  /** What still blocks this row: "amount", "line", "line not funded", "quantity". Empty when ready. */
  problem: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  rows: RecordRow[];
  onRow: (id: string, patch: Partial<Pick<RecordRow, 'quantity' | 'amount' | 'lineId'>>) => void;
  lineOptions: Option[];
  accounts: Option[];
  accountId: string;
  onAccount: (id: string) => void;
  date: string;
  onDate: (v: string) => void;
  /** "Posts to November 2026 · Household account · GHS 41.00 · 2026-11-23" or what is missing. */
  summary: string;
  ready: boolean;
  busy: boolean;
  busyLabel?: string;
  error?: string;
  onSave: () => void;
  onSaveForLater: () => void;
};

/** Record expense (BUDG-8 07, household only): the Got-it items, account, date, one Save. Checking off never posts. */
export function RecordExpenseSheet(p: Props) {
  const footer = (
    <>
      <Text testID="record-summary" accessibilityLiveRegion="polite" className="text-sm font-semibold text-foreground dark:text-zinc-50">
        {p.summary}
      </Text>
      {p.error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{p.error}</Text> : null}
      <AppButton
        label={p.busy ? p.busyLabel || 'Saving…' : 'Save expense'}
        accessibilityLabel="Save expense"
        size="touch-lg"
        className="w-full"
        textClassName="text-base"
        disabled={!p.ready || p.busy}
        onPress={p.onSave}
      />
      <View className="flex-row items-center justify-between">
        <AppButton label="Cancel" variant="ghost" size="touch" disabled={p.busy} onPress={p.onClose} />
        <AppButton label="Save prices for later" variant="ghost" size="touch" disabled={p.busy} onPress={p.onSaveForLater} />
      </View>
    </>
  );
  return (
    <AppSheet open={p.open} onClose={() => !p.busy && p.onClose()} title="Record expense" footer={footer} testID="record-expense-sheet">
      <View className="gap-4">
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">Check what each item cost and the line it comes from. Nothing is recorded until you press Save expense.</Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          {p.rows.map((row, i) => (
            <View key={row.id} testID="record-row" className={cn('gap-2 p-3', i > 0 && 'border-t border-border dark:border-zinc-800')}>
              <View className="flex-row items-center gap-2">
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{row.name}</Text>
                  {row.problem ? <Text className="text-sm text-amber-700 dark:text-amber-300">{`Needs ${row.problem}`}</Text> : null}
                </View>
                <AppInput
                  value={row.quantity}
                  onChangeText={(quantity) => p.onRow(row.id, { quantity })}
                  keyboardType="numeric"
                  inputMode="numeric"
                  accessibilityLabel={`Quantity of ${row.name}`}
                  className="h-11 w-14 text-center text-base"
                />
                <AppInput
                  value={row.amount}
                  onChangeText={(amount) => p.onRow(row.id, { amount })}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="0.00"
                  accessibilityLabel={`Amount paid for ${row.name}`}
                  className="h-11 w-24 text-right text-base"
                />
              </View>
              {/* D-11: a row without a line says what to do; Save stays disabled until each row has one. */}
              {!row.lineId ? (
                <Text className="text-sm text-muted-foreground dark:text-zinc-400" testID="record-line-hint">
                  Choose where this comes from
                </Text>
              ) : null}
              <DropdownField
                value={row.lineId}
                options={[{ label: 'Choose a line', value: '' }, ...p.lineOptions]}
                onChange={(lineId) => p.onRow(row.id, { lineId })}
                placeholder="Choose a line"
                menuStrategy="inline"
                triggerClassName="min-h-11"
              />
            </View>
          ))}
        </View>
        <FormRow label="Paid from">
          <DropdownField
            value={p.accountId}
            options={[{ label: 'Choose account', value: '' }, ...p.accounts]}
            onChange={p.onAccount}
            placeholder="Choose account"
            className="w-full"
            triggerClassName="min-h-11"
            menuStrategy="inline"
          />
        </FormRow>
        <FormRow label="Date">
          <AppInput value={p.date} onChangeText={p.onDate} placeholder="YYYY-MM-DD" accessibilityLabel="Expense date" className="h-11 w-36 text-base" />
        </FormRow>
      </View>
    </AppSheet>
  );
}

/** Sticky footer of a list, household only, when Got it has items (BUDG-8 07). */
export function GotItFooter({ count, total, onRecord, onReceipt }: { count: number; total: string; onRecord: () => void; onReceipt: () => void }) {
  const narrow = useWindowDimensions().width < 360;
  return (
    <View testID="got-it-footer" className="gap-2 border-t border-border bg-card px-4 pb-3 pt-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Text className="text-sm font-medium text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
        {`${count} item${count === 1 ? '' : 's'} got${total ? ` · ${total}` : ''}`}
      </Text>
      {/* D-14: below 360 px the two actions stack so neither label wraps; stacked, they are full width (flex-1 in a column collapses them to 20 px). */}
      <View className={narrow ? 'gap-2' : 'flex-row gap-2'}>
        <AppButton label="Record expense" size="touch" className={narrow ? 'w-full' : 'min-w-0 flex-1'} onPress={onRecord} />
        <AppButton label="Add receipt" variant="outline" size="touch" className={narrow ? 'w-full' : 'min-w-0 flex-1'} onPress={onReceipt} />
      </View>
    </View>
  );
}
