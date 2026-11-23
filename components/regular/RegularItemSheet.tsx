import React, { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DefaultAccountField } from '@/components/DefaultAccountField';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { DangerTextButton } from '@/components/plan/DangerTextButton';
import { ToggleRow } from '@/components/plan/ToggleRow';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { APP_CURRENCY } from '@/lib/repo/planLines';
import { GROUP_LABEL, groupsFor, nounFor, type RegularDraft, type RegularItem, type RegularKind } from './types';

export async function confirmDelete(name: string) {
  const message = `Delete ${name}? This cannot be undone.`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.confirm(message);
  return new Promise<boolean>((resolve) =>
    Alert.alert('Delete', message, [
      { text: 'Keep', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

type FormProps = {
  kind: RegularKind;
  uid: string | null;
  item: RegularItem | null;
  initial: RegularDraft;
  /** Returns an error message, or null when saved. */
  onSave: (draft: RegularDraft) => Promise<string | null>;
  onDelete?: () => Promise<void>;
  onDone: () => void;
  extras?: ReactNode;
};

export function useRegularForm(p: FormProps) {
  const [draft, setDraft] = useState<RegularDraft>(p.initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<RegularDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const err = await p.onSave(draft);
      if (err) setError(err); // values stay as typed
      else p.onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return { draft, set, saving, error, save };
}

/** Fields of the item (BUDG-8 06 "Item sheet"): Name, Amount per month, Group, Paid from, Active, Tags. */
export function RegularItemFields({ p, form }: { p: FormProps; form: ReturnType<typeof useRegularForm> }) {
  const { draft, set } = form;
  const [showTags, setShowTags] = useState(Boolean(draft.tagsInput));
  const isIncome = draft.group === 'INCOME';
  const groupOptions = groupsFor(p.kind).map((g) => ({ label: GROUP_LABEL[g], value: g }));
  return (
    <View className="gap-5">
      <FormField label="Name">
        <AppInput accessibilityLabel="Name" autoFocus={!p.item} value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="e.g. Water bill" className="h-11 text-base" style={{ height: 44 }} />
      </FormField>
      <FormField label="Amount">
        <View className="flex-row items-center gap-2">
          <Text className="text-base text-muted-foreground dark:text-zinc-400">{APP_CURRENCY}</Text>
          <View className="min-w-0 flex-1">
            <AppInput
              accessibilityLabel="Amount per month"
              value={draft.amount}
              onChangeText={(v) => set({ amount: v })}
              keyboardType="decimal-pad"
              placeholder="0.00"
              className="h-11 text-right text-base"
              style={{ height: 44 }}
            />
          </View>
          <Text className="text-base text-muted-foreground dark:text-zinc-400">per month</Text>
        </View>
      </FormField>
      <FormField label="Group">
        <AppSegmented touch className="self-start" value={draft.group} onChange={(v) => set({ group: v })} options={groupOptions} />
      </FormField>
      {isIncome ? null : p.item && p.uid ? (
        <View className="z-10">
          <DefaultAccountField
            uid={p.uid}
            collectionName={p.kind === 'repeats' ? 'recurring' : 'expenses'}
            sourceId={p.item.id}
            value={p.item.defaultAccountId}
            label="Paid from"
            hint="Used as the suggestion in new months. Months already planned keep their account."
            triggerClassName="h-11"
          />
        </View>
      ) : (
        <FormField label="Paid from">
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Choose the account after you save, by opening the {nounFor(p.kind)} again.</Text>
        </FormField>
      )}
      <ToggleRow
        label="Active"
        description="Paused items are not added to new months"
        value={draft.active}
        onChange={(v) => set({ active: v })}
      />
      {showTags ? (
        <FormField label="Tags">
          <AppInput accessibilityLabel="Tags" value={draft.tagsInput} onChangeText={(v) => set({ tagsInput: v })} placeholder="utilities, groceries" className="h-11 text-base" style={{ height: 44 }} />
        </FormField>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Add tags" onPress={() => setShowTags(true)} className="min-h-11 flex-row items-center gap-2 self-start rounded-md px-1">
          <MaterialCommunityIcons name="plus" size={18} color="#717182" />
          <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Tags</Text>
        </Pressable>
      )}
      {p.extras}
      {form.error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{form.error}</Text> : null}
      {p.item && p.onDelete ? (
        <DangerTextButton
          label={`Delete ${p.item.name}`}
          onPress={async () => {
            if (!(await confirmDelete(p.item!.name))) return;
            await p.onDelete!();
            p.onDone();
          }}
        />
      ) : null}
    </View>
  );
}

function SaveButton({ form, item, kind }: { form: ReturnType<typeof useRegularForm>; item: RegularItem | null; kind: RegularKind }) {
  return (
    <AppButton
      label={form.saving ? 'Saving…' : item ? 'Save' : `Add ${nounFor(kind)}`}
      size="touch-lg"
      className="w-full"
      disabled={form.saving}
      onPress={form.save}
    />
  );
}

/** Phone and tablet: bottom sheet. Remount with a key per item so the form starts from that item. */
export function RegularItemSheet(p: FormProps & { open: boolean; onClose: () => void }) {
  const form = useRegularForm(p);
  const title = p.item ? p.item.name : `New ${nounFor(p.kind)}`;
  return (
    <AppSheet open={p.open} onClose={p.onClose} title={title} testID="regular-item-sheet" footer={<SaveButton form={form} item={p.item} kind={p.kind} />}>
      <RegularItemFields p={p} form={form} />
    </AppSheet>
  );
}

/** Desktop: the same form inline, right of the list. */
export function RegularItemPanel(p: FormProps) {
  const form = useRegularForm(p);
  return (
    <View testID="regular-item-panel" className="gap-5 rounded-xl border border-border bg-card p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <Text role="heading" aria-level={2} className="text-lg font-semibold text-foreground dark:text-zinc-50" numberOfLines={1}>
        {p.item ? p.item.name : `New ${nounFor(p.kind)}`}
      </Text>
      <RegularItemFields p={p} form={form} />
      <SaveButton form={form} item={p.item} kind={p.kind} />
    </View>
  );
}
