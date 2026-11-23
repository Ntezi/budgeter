import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { DropdownField } from '@/components/ui/DropdownField';
import { cn } from '@/lib/cn';
import { SHOPPING_UNITS } from '@/lib/rules/catalogMatch';

export type ItemDraft = { name: string; quantity: string; unit: string; category: string; note: string };
export type DuplicateCandidate = { id: string; name: string; hint?: string };
type Option = { label: string; value: string };

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  /** Household: catalog categories as a dropdown; chef: free text. */
  categoryOptions?: Option[];
  /** Household add: duplicate hint (BUDG-4 AC-3). Nothing merges without Use existing. */
  candidates?: DuplicateCandidate[];
  choice?: string;
  onChoice?: (choice: string) => void;
  /** Household add: "Save to catalog" (default on) vs list only. */
  saveToCatalog?: boolean;
  onSaveToCatalog?: (value: boolean) => void;
  /** Household edit: the budget line the item maps to. */
  lineOptions?: Option[];
  lineId?: string;
  onLine?: (id: string) => void;
  tag?: string;
  onTag?: (tag: string) => void;
  error?: string;
  saveLabel: string;
  saveDisabled?: boolean;
  onSave: () => void;
  onDelete?: () => void;
};

const UNITS = ['', ...SHOPPING_UNITS];

/** Item sheet (BUDG-8 07): name, quantity stepper, unit chips, category, note; household extras only when passed. */
export function ItemSheet(p: Props) {
  const qty = Number(p.draft.quantity) || 0;
  const usingExisting = Boolean(p.choice?.startsWith('use:'));
  const footer = (
    <>
      {p.error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{p.error}</Text> : null}
      <AppButton label={p.saveLabel} size="touch-lg" className="w-full dark:bg-zinc-50" textClassName="text-base dark:text-zinc-900" disabled={p.saveDisabled} onPress={p.onSave} />
      <View className="flex-row items-center justify-between">
        <AppButton label="Cancel" variant="ghost" size="touch" onPress={p.onClose} />
        {p.onDelete ? <AppButton label="Delete item" variant="ghost" size="touch" textClassName="text-destructive dark:text-red-300" onPress={p.onDelete} /> : null}
      </View>
    </>
  );
  return (
    <AppSheet open={p.open} onClose={p.onClose} title={p.title} footer={footer} testID="item-sheet">
      <View className="gap-4">
        <FormField label="Name">
          <AppInput autoFocus value={p.draft.name} onChangeText={(name) => p.onChange({ name })} placeholder="Item name" accessibilityLabel="Item name" className="h-11 text-base" />
        </FormField>

        {p.candidates?.length ? (
          <View className="gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <Text className="text-sm font-semibold text-amber-700 dark:text-amber-300">Already in your catalog?</Text>
            {p.candidates.map((c) => {
              const chosen = p.choice === `use:${c.id}`;
              return (
                <View key={c.id} className="flex-row flex-wrap items-center gap-2">
                  <View className="min-w-0 flex-1">
                    <Text className="text-base text-foreground dark:text-zinc-50" numberOfLines={1}>{c.name}</Text>
                    {c.hint ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{c.hint}</Text> : null}
                  </View>
                  <AppButton label={chosen ? 'Using this' : 'Use existing'} size="touch" variant={chosen ? 'primary' : 'outline'} onPress={() => p.onChoice?.(`use:${c.id}`)} />
                </View>
              );
            })}
            <AppButton
              label={p.choice === 'keep' ? 'Keeping separate' : 'Keep separate'}
              size="touch"
              variant={p.choice === 'keep' ? 'primary' : 'outline'}
              className="self-start"
              onPress={() => p.onChoice?.('keep')}
            />
          </View>
        ) : null}

        <FormField label="Quantity">
          <View className="flex-row items-center gap-2">
            <AppButton label="−" accessibilityLabel="One less" variant="outline" size="touch" className="w-11 px-0" disabled={qty <= 1} onPress={() => p.onChange({ quantity: String(Math.max(1, qty - 1)) })} />
            <AppInput value={p.draft.quantity} onChangeText={(quantity) => p.onChange({ quantity })} keyboardType="numeric" inputMode="numeric" accessibilityLabel="Quantity" className="h-11 w-20 text-center text-base" />
            <AppButton label="+" accessibilityLabel="One more" variant="outline" size="touch" className="w-11 px-0" onPress={() => p.onChange({ quantity: String(Math.min(9999, qty + 1)) })} />
          </View>
        </FormField>
        <View className="gap-2">
          <Text nativeID="unit-label" className="text-sm font-medium text-foreground dark:text-zinc-50">Unit</Text>
          <View className="flex-row flex-wrap gap-2" aria-labelledby="unit-label">
            {UNITS.map((u) => {
              const on = p.draft.unit === u;
              return (
                <Pressable
                  key={u || 'none'}
                  accessibilityRole="button"
                  aria-pressed={on}
                  onPress={() => p.onChange({ unit: u })}
                  className={cn(
                    'h-11 min-w-11 items-center justify-center rounded-full border px-4',
                    on ? 'border-primary bg-primary dark:border-zinc-100 dark:bg-zinc-50' : 'border-border bg-card dark:border-zinc-800 dark:bg-zinc-900'
                  )}
                >
                  <Text className={cn('text-sm font-medium', on ? 'text-white dark:text-zinc-900' : 'text-foreground dark:text-zinc-50')}>{u || 'No unit'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <FormField label="Category">
          {p.categoryOptions ? (
            <DropdownField value={p.draft.category} options={p.categoryOptions} onChange={(category) => p.onChange({ category })} placeholder="Category" menuStrategy="inline" triggerClassName="min-h-11" />
          ) : (
            <AppInput value={p.draft.category} onChangeText={(category) => p.onChange({ category })} placeholder="Category" accessibilityLabel="Category" className="h-11 text-base" />
          )}
        </FormField>
        <FormField label="Note">
          <AppInput value={p.draft.note} onChangeText={(note) => p.onChange({ note })} placeholder="Note (optional)" accessibilityLabel="Note" className="h-11 text-base" />
        </FormField>
        {p.lineOptions && p.onLine ? (
          <FormField label="Budget line">
            <DropdownField value={p.lineId || ''} options={p.lineOptions} onChange={p.onLine} placeholder="Choose a line" menuStrategy="inline" triggerClassName="min-h-11" />
          </FormField>
        ) : null}
        {p.onTag ? (
          <FormField label="Tag">
            <AppInput value={p.tag || ''} onChangeText={p.onTag} placeholder="Short tag, up to 20 characters" maxLength={20} accessibilityLabel="Tag" className="h-11 text-base" />
          </FormField>
        ) : null}
        {p.onSaveToCatalog && !usingExisting ? (
          <View className="gap-1">
            <View className="min-h-11 flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-base text-foreground dark:text-zinc-50">Save to catalog for next time</Text>
              <Switch value={Boolean(p.saveToCatalog)} onValueChange={p.onSaveToCatalog} accessibilityLabel="Save to catalog" />
            </View>
            {!p.saveToCatalog ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">List only: the catalog stays unchanged.</Text> : null}
          </View>
        ) : null}
      </View>
    </AppSheet>
  );
}
