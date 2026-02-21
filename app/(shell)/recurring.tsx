import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { DropdownField } from '@/components/ui/DropdownField';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  addRecurring,
  deleteRecurring,
  inspectBudgetSeedState,
  importRecurringCsv,
  recurringCsvHeader,
  seedBudgetFromRecurring,
  type Recurring,
  type RecurringFlow,
  updateRecurring,
  watchRecurring,
} from '@/lib/repo/recurring';
import { createPeriod, nextMonthMeta, periodIdFromDate, periodTitleFromId } from '@/lib/repo/periods';
import { applyAllocationDefaultsForPeriod } from '@/lib/repo/allocations';
import { fmtMoney, parseMoney } from '@/lib/format';
import { PLAN_GROUP_OPTIONS } from '@/lib/groups';
import { firstTag, parseTagsInput, tagsLabel, tagsToInput } from '@/lib/tags';

export default function RecurringScreen() {
  const router = useRouter();
  const uid = useWorkspaceUid();

  const [rows, setRows] = useState<Recurring[]>([]);
  const [csvText, setCsvText] = useState(recurringCsvHeader);

  const [draft, setDraft] = useState<Recurring>({
    flow: 'EXPENSE',
    name: '',
    amount: 0,
    tags: [],
    group: 'NEED',
    dayOfMonth: 1,
    active: true,
  });
  const [formError, setFormError] = useState('');
  const [tagFilter, setTagFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'NEED' | 'WANT' | 'SAVINGS_DEBT'>('ALL');
  const [sortMode, setSortMode] = useState<'CREATED' | 'TAG'>('CREATED');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Recurring | null>(null);
  const [isGeneratingCurrent, setIsGeneratingCurrent] = useState(false);
  const [isCreatingNextBudget, setIsCreatingNextBudget] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchRecurring(uid, setRows);
  }, [uid]);

  useEffect(() => {
    if (sortMode !== 'TAG' && tagFilter !== 'ALL') {
      setTagFilter('ALL');
    }
  }, [sortMode, tagFilter]);

  const activeRows = useMemo(() => rows.filter((row) => row.active !== false), [rows]);
  const activeTotal = useMemo(() => activeRows.reduce((sum, row) => sum + (row.amount || 0), 0), [activeRows]);
  const tagOptions = useMemo(() => {
    const tags = [...new Set(rows.flatMap((row) => row.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return [{ label: 'All tags', value: 'ALL' }, ...tags.map((tag) => ({ label: `#${tag}`, value: tag }))];
  }, [rows]);

  const categoryOptions = [
    { label: 'All Categories', value: 'ALL' },
    ...PLAN_GROUP_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value })),
  ];

  const displayRows = useMemo(() => {
    let out = [...rows];
    if (categoryFilter !== 'ALL') {
      out = out.filter((row) => (row.flow === 'INCOME' ? false : (row.group ?? 'NEED') === categoryFilter));
    }
    if (sortMode === 'TAG' && tagFilter !== 'ALL') out = out.filter((row) => (row.tags || []).includes(tagFilter));
    if (sortMode === 'TAG') {
      out.sort((a, b) => {
        const ta = firstTag(a.tags);
        const tb = firstTag(b.tags);
        if (ta !== tb) return ta.localeCompare(tb);
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    return out;
  }, [rows, sortMode, tagFilter, categoryFilter]);

  async function addRow() {
    if (!uid) return;
    if (!draft.name?.trim()) {
      setFormError('Template name is required.');
      return;
    }
    if (!draft.amount || draft.amount <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }
    await addRecurring(uid, {
      flow: draft.flow ?? 'EXPENSE',
      name: draft.name.trim(),
      amount: draft.amount,
      tags: draft.tags ?? [],
      group: draft.flow === 'INCOME' ? undefined : draft.group ?? 'NEED',
      dayOfMonth: 1,
      active: draft.active !== false,
      note: draft.note?.trim() || undefined,
    });
    setDraft((prev) => ({ ...prev, name: '', amount: 0, tags: [] }));
    setFormError('');
  }

  function beginEdit(row: Recurring) {
    if (!row.id) return;
    setEditingId(row.id);
    setEditingDraft({ ...row });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingDraft(null);
  }

  async function saveRow(row: Recurring) {
    if (!uid || !row.id) return;
    await updateRecurring(uid, row.id, {
      flow: row.flow ?? 'EXPENSE',
      name: row.name,
      amount: row.amount,
      tags: row.tags ?? [],
      group: row.flow === 'INCOME' ? undefined : row.group ?? 'NEED',
      dayOfMonth: row.dayOfMonth ?? 1,
      active: row.active !== false,
      note: row.note?.trim() || undefined,
    });
  }

  async function saveEditingRow() {
    if (!editingDraft || !editingId) return;
    await saveRow({ ...editingDraft, id: editingId });
    cancelEdit();
  }

  async function removeRow(row: Recurring) {
    if (!uid || !row.id) return;
    await deleteRecurring(uid, row.id);
    if (editingId === row.id) cancelEdit();
  }

  async function generateCurrentPeriod() {
    if (!uid || isGeneratingCurrent || isCreatingNextBudget) return;
    setIsGeneratingCurrent(true);
    try {
      const pid = periodIdFromDate();
      await createPeriod(uid, pid, periodTitleFromId(pid));

      const state = await inspectBudgetSeedState(uid, pid);
      let overwriteRecurring = false;
      if (state.existingPlanRows > 0 || state.existingIncomeRows > 0) {
        const message =
          `${pid} already has budget rows.\n` +
          `Plan rows: ${state.existingPlanRows}\n` +
          `Income rows: ${state.existingIncomeRows}\n\n` +
          'Overwrite will remove previously generated recurring rows only. Manual/non-recurring rows stay unchanged.';

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          overwriteRecurring = window.confirm(`${message}\n\nClick OK to overwrite recurring rows, or Cancel to keep existing rows.`);
        } else {
          const choice = await new Promise<'cancel' | 'keep' | 'overwrite'>((resolve) => {
            Alert.alert(
              'Current Budget Has Items',
              message,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
                { text: 'Keep Existing', onPress: () => resolve('keep') },
                { text: 'Overwrite Recurring', style: 'destructive', onPress: () => resolve('overwrite') },
              ],
              { cancelable: true, onDismiss: () => resolve('cancel') }
            );
          });
          if (choice === 'cancel') return;
          overwriteRecurring = choice === 'overwrite';
        }
      }

      const out = await seedBudgetFromRecurring(uid, pid, rows, { overwriteRecurring });
      Alert.alert(
        'Current Budget Updated',
        `${pid}\nPlan rows from recurring: ${out.planWritten}\nIncome rows from recurring: ${out.incomeWritten}\nRemoved recurring rows: Plan ${out.planRemoved}, Income ${out.incomeRemoved}`
      );
      router.push(`/budgets/${pid}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Could Not Generate Current Budget', message || 'An unexpected error occurred.');
    } finally {
      setIsGeneratingCurrent(false);
    }
  }

  async function importCsv() {
    if (!uid) return;
    const count = await importRecurringCsv(uid, csvText);
    setCsvText(recurringCsvHeader);
    Alert.alert('CSV Imported', `${count} templates added.`);
  }

  async function createNextBudgetFromRecurring() {
    if (!uid || isGeneratingCurrent || isCreatingNextBudget) return;
    setIsCreatingNextBudget(true);
    try {
      const next = nextMonthMeta();
      await createPeriod(uid, next.id, next.title);
      const seeded = await seedBudgetFromRecurring(uid, next.id, rows);
      const defaults = await applyAllocationDefaultsForPeriod(uid, next.id);
      Alert.alert(
        'Next Budget Ready',
        `${next.id}\nPlan rows: ${seeded.planWritten}\nIncome rows: ${seeded.incomeWritten}\nDefaults: ${defaults}`
      );
      router.push(`/budgets/${next.id}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Could Not Create Next Budget', message || 'An unexpected error occurred.');
    } finally {
      setIsCreatingNextBudget(false);
    }
  }

  const col = {
    name: 'w-[220px]',
    flow: 'w-[150px]',
    group: 'w-[190px]',
    amount: 'w-[130px]',
    status: 'w-[110px]',
    actions: 'w-[140px]',
  };
  const recurringActionsBusy = isGeneratingCurrent || isCreatingNextBudget;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Recurring Items</Text>
        <Text className="text-sm text-muted-foreground">Manage recurring templates and generate them into budgets.</Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <AppButton onPress={generateCurrentPeriod} variant="outline" disabled={recurringActionsBusy}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="refresh" size={18} color="#717182" />
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{isGeneratingCurrent ? 'Generating...' : 'Generate Current Month'}</Text>
          </View>
        </AppButton>
        <AppButton onPress={createNextBudgetFromRecurring} disabled={recurringActionsBusy}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="repeat" size={18} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">{isCreatingNextBudget ? 'Creating...' : 'Create Next Budget'}</Text>
          </View>
        </AppButton>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Active templates</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{activeRows.length}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Expense templates</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">
            {activeRows.filter((row) => (row.flow ?? 'EXPENSE') === 'EXPENSE').length}
          </Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Active amount total</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{fmtMoney(activeTotal)}</Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">CSV Import</Text>
        <Text className="text-xs text-muted-foreground">Header: {recurringCsvHeader}</Text>
        <AppInput
          value={csvText}
          onChangeText={setCsvText}
          multiline
          numberOfLines={8}
          className="h-40 items-start py-2"
          autoCapitalize="none"
        />
        <AppButton onPress={importCsv} variant="outline">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="file-delimited-outline" size={18} color="#717182" />
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Import CSV</Text>
          </View>
        </AppButton>
      </AppCard>

      <AppCard className="gap-3">
        <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <View className="flex-row flex-wrap gap-2">
            <View className="w-full md:w-64">
              <DropdownField
                value={categoryFilter}
                options={categoryOptions}
                onChange={(v) => setCategoryFilter(v as any)}
                placeholder="Filter by category"
                menuStrategy="inline"
              />
            </View>
            {sortMode === 'TAG' ? (
              <View className="w-full md:w-64">
                <DropdownField value={tagFilter} options={tagOptions} onChange={setTagFilter} placeholder="Filter by tag" menuStrategy="inline" />
              </View>
            ) : null}
          </View>
          <AppSegmented
            value={sortMode}
            onChange={(value) => setSortMode(value as 'CREATED' | 'TAG')}
            compact
            options={[
              { label: 'Created', value: 'CREATED' },
              { label: 'Tag', value: 'TAG' },
            ]}
          />
        </View>

        <View>
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Templates</Text>
          <Text className="text-xs text-muted-foreground">Aligned list view from redesign baseline.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View className="min-w-[940px] flex-1">
            <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
              <Text className={`${col.name} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Name</Text>
              <Text className={`${col.flow} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Type</Text>
              <Text className={`${col.group} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Category</Text>
              <Text className={`${col.amount} text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Amount</Text>
              <Text className={`${col.status} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Status</Text>
              <Text className={`${col.actions} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Actions</Text>
            </View>

            <View className="flex-row items-center border-b border-border py-2 hover:bg-muted/35 dark:border-zinc-800 dark:hover:bg-zinc-800/55">
              <View className={`${col.name} pr-2`}>
                <AppInput
                  value={draft.name}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                  placeholder="New template..."
                  className="h-9"
                />
              </View>
              <View className={`${col.flow} pr-2`}>
                <AppSegmented
                  value={(draft.flow ?? 'EXPENSE') as RecurringFlow}
                  compact
                  onChange={(value) => setDraft((prev) => ({ ...prev, flow: value as RecurringFlow }))}
                  options={[
                    { label: 'Expense', value: 'EXPENSE' },
                    { label: 'Income', value: 'INCOME' },
                  ]}
                />
              </View>
              <View className={`${col.group} pr-2`}>
                {(draft.flow ?? 'EXPENSE') === 'EXPENSE' ? (
                  <AppSegmented
                    value={draft.group ?? 'NEED'}
                    compact
                    onChange={(value) => setDraft((prev) => ({ ...prev, group: value as any }))}
                    options={PLAN_GROUP_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                  />
                ) : (
                  <View className="h-9 items-start justify-center rounded-lg border border-border bg-muted px-3 dark:border-zinc-800 dark:bg-zinc-800">
                    <Text className="text-xs text-muted-foreground">Income</Text>
                  </View>
                )}
              </View>
              <View className={`${col.amount} pr-2`}>
                <AppInput
                  value={String(draft.amount || '')}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  className="h-9 text-right"
                />
              </View>
              <View className={`${col.status} items-center pr-2`}>
                <Switch value={draft.active !== false} onValueChange={(value) => setDraft((prev) => ({ ...prev, active: value }))} />
              </View>
              <View className={`${col.actions} items-center`}>
                <IconActionButton icon="plus" label="Add template" onPress={addRow} />
              </View>
            </View>
            {formError ? (
              <View className="py-1">
                <Text className="text-xs text-destructive">{formError}</Text>
              </View>
            ) : null}

            {displayRows.map((row) => {
              const isEditing = editingId === row.id && Boolean(editingDraft);
              const editingRow = isEditing && editingDraft ? editingDraft : null;
              const normalizeTags = (input?: string[]) =>
                (input || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean).join(',');
              const isDirty = Boolean(
                isEditing &&
                  editingRow &&
                  (
                    String(editingRow.name || '').trim() !== String(row.name || '').trim() ||
                    (editingRow.flow ?? 'EXPENSE') !== (row.flow ?? 'EXPENSE') ||
                    (editingRow.group ?? 'NEED') !== (row.group ?? 'NEED') ||
                    normalizeTags(editingRow.tags) !== normalizeTags(row.tags) ||
                    Number(editingRow.amount || 0) !== Number(row.amount || 0) ||
                    (editingRow.active !== false) !== (row.active !== false)
                  )
              );
              return (
                <View
                  key={row.id}
                  className={`flex-row items-center border-b py-2 dark:border-zinc-800 ${
                    isDirty
                      ? 'border-primary/40 bg-primary/5 dark:bg-zinc-800/70'
                      : 'border-border hover:bg-muted/35 dark:hover:bg-zinc-800/55'
                  }`}
                >
                  <View className={`${col.name} pr-2`}>
                    {isEditing && editingRow ? (
                      <AppInput
                        value={editingRow.name}
                        onChangeText={(value) => setEditingDraft((prev) => (prev ? { ...prev, name: value } : prev))}
                        className="h-9"
                      />
                    ) : (
                      <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                    )}
                  </View>

                  <View className={`${col.flow} pr-2`}>
                    {isEditing && editingRow ? (
                      <AppSegmented
                        value={(editingRow.flow ?? 'EXPENSE') as RecurringFlow}
                        compact
                        onChange={(value) => setEditingDraft((prev) => (prev ? { ...prev, flow: value as RecurringFlow } : prev))}
                        options={[
                          { label: 'Expense', value: 'EXPENSE' },
                          { label: 'Income', value: 'INCOME' },
                        ]}
                      />
                    ) : (
                      <Text className="text-sm text-muted-foreground">{row.flow ?? 'EXPENSE'}</Text>
                    )}
                  </View>

                  <View className={`${col.group} pr-2`}>
                    {isEditing && editingRow ? (
                      (editingRow.flow ?? 'EXPENSE') === 'EXPENSE' ? (
                        <AppSegmented
                          value={editingRow.group ?? 'NEED'}
                          compact
                          onChange={(value) => setEditingDraft((prev) => (prev ? { ...prev, group: value as any } : prev))}
                          options={PLAN_GROUP_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                        />
                      ) : (
                        <View className="h-9 items-start justify-center rounded-lg border border-border bg-muted px-3 dark:border-zinc-800 dark:bg-zinc-800">
                          <Text className="text-xs text-muted-foreground">Income</Text>
                        </View>
                      )
                    ) : (
                      <AppBadge label={(row.flow ?? 'EXPENSE') === 'EXPENSE' ? row.group ?? 'NEED' : 'INCOME'} variant="outline" />
                    )}
                  </View>

                  <View className={`${col.amount} pr-2`}>
                    {isEditing && editingRow ? (
                      <AppInput
                        value={String(editingRow.amount || '')}
                        onChangeText={(value) => setEditingDraft((prev) => (prev ? { ...prev, amount: parseMoney(value) } : prev))}
                        keyboardType="decimal-pad"
                        className="h-9 text-right"
                      />
                    ) : (
                      <Text className="text-right text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                    )}
                  </View>

                  <View className={`${col.status} items-center pr-2`}>
                    {isEditing && editingRow ? (
                      <Switch
                        value={editingRow.active !== false}
                        onValueChange={(value) => setEditingDraft((prev) => (prev ? { ...prev, active: value } : prev))}
                      />
                    ) : (
                      <Switch
                        value={row.active !== false}
                        onValueChange={(value) => {
                          void saveRow({ ...row, active: value });
                        }}
                      />
                    )}
                  </View>

                  <View className={`${col.actions} flex-row items-center justify-center gap-2`}>
                    {isEditing ? (
                      <>
                        {isDirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
                        <IconActionButton icon="content-save-outline" label="Save template" onPress={saveEditingRow} disabled={!isDirty} />
                        <IconActionButton icon="close" label="Cancel edit" variant="muted" onPress={cancelEdit} />
                      </>
                    ) : (
                      <>
                        <IconActionButton icon="pencil-outline" label="Edit template" onPress={() => beginEdit(row)} />
                        <IconActionButton icon="trash-can-outline" label="Delete template" variant="danger" onPress={() => removeRow(row)} />
                      </>
                    )}
                  </View>
                </View>
              );
            })}

            {!displayRows.length ? (
              <View className="py-4">
                <Text className="text-sm text-muted-foreground">No templates for this filter.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </AppCard>
    </ScrollView>
  );
}
