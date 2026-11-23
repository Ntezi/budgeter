import React from 'react';
import { Text, View } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';

type Option = { label: string; value: string };

type Props = {
  open: boolean;
  onClose: () => void;
  monthLabel: string;
  groupOptions: readonly { label: string; value: string }[];
  draft: { name: string; amount: string; group: string; tags: string };
  onDraft: (patch: Partial<{ name: string; amount: string; group: string; tags: string }>) => void;
  onAddLine: () => void;
  formError?: string;
  // From regular costs (BUDG-3: the account is suggested, the user's Add is the only write).
  costOptions: Option[];
  costId: string;
  onCost: (id: string) => void;
  costAccountOptions: Option[];
  costAccountId: string;
  onCostAccount: (id: string) => void;
  costHint?: string;
  costRepair?: string;
  onAddCost: () => void;
  costError?: string;
  onAddFromTemplates: () => void;
  templatePending: boolean;
};

/** "+ Add a need": a new line, or one of the regular costs with its suggested account. */
export function AddLineSheet(p: Props) {
  return (
    <AppSheet open={p.open} onClose={p.onClose} title={`Add to ${p.monthLabel}`} testID="add-line-sheet">
      <View className="gap-6">
        <View className="gap-4">
          <FormField label="Name">
            <AppInput accessibilityLabel="Name" autoFocus value={p.draft.name} onChangeText={(v) => p.onDraft({ name: v })} placeholder="e.g. Rent" className="h-11 text-base" style={{ height: 44 }} />
          </FormField>
          <FormField label="Planned amount">
            <AppInput
              accessibilityLabel="Planned amount"
              value={p.draft.amount}
              onChangeText={(v) => p.onDraft({ amount: v })}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="h-11 text-base" style={{ height: 44 }}
            />
          </FormField>
          <FormField label="Group">
            <AppSegmented value={p.draft.group} onChange={(v: string) => p.onDraft({ group: v })} options={p.groupOptions as any} />
          </FormField>
          <FormField label="Tags (optional)">
            <AppInput accessibilityLabel="Tags" value={p.draft.tags} onChangeText={(v) => p.onDraft({ tags: v })} placeholder="utilities, vegetables" className="h-11 text-base" style={{ height: 44 }} />
          </FormField>
          {p.formError ? <Text className="text-sm text-destructive dark:text-red-300">{p.formError}</Text> : null}
          <AppButton label="Add line" size="touch-lg" className="w-full items-center justify-center" onPress={p.onAddLine} />
        </View>

        {p.costOptions.length ? (
          <View className="gap-3 border-t border-border pt-4 dark:border-zinc-800">
            <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Or pick a regular cost</Text>
            <View className="z-20">
              <DropdownField value={p.costId} options={p.costOptions} onChange={p.onCost} placeholder="Select a cost" menuStrategy="inline" triggerClassName="h-11" />
            </View>
            <FormField label="Paid from">
              <View className="z-10">
                <DropdownField value={p.costAccountId} options={p.costAccountOptions} onChange={p.onCostAccount} placeholder="Account" menuStrategy="inline" triggerClassName="h-11" />
              </View>
            </FormField>
            {p.costHint ? (
              <Text className="text-sm text-muted-foreground dark:text-zinc-400" testID="default-account-hint">
                {p.costHint}
              </Text>
            ) : null}
            {p.costRepair ? (
              <Text className="text-sm text-amber-700 dark:text-amber-300" testID="default-account-repair">
                {p.costRepair}
              </Text>
            ) : null}
            {p.costError ? <Text className="text-sm text-destructive dark:text-red-300">{p.costError}</Text> : null}
            <AppButton label="Add cost" variant="outline" size="touch" onPress={p.onAddCost} />
          </View>
        ) : null}

        <View className="gap-2 border-t border-border pt-4 dark:border-zinc-800">
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Copies every active repeat into this month once. Accounts arrive as suggestions.</Text>
          <AppButton
            label={p.templatePending ? 'Adding…' : 'Add regular costs'}
            variant="outline"
            size="touch"
            onPress={p.onAddFromTemplates}
            disabled={p.templatePending}
          />
        </View>
      </View>
    </AppSheet>
  );
}
