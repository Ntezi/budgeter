import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { useAuthUser } from '@/providers/AuthProvider';
import {
  addRecurring,
  deleteRecurring,
  generateForPeriod,
  importRecurringCsv,
  recurringCsvHeader,
  seedBudgetFromRecurring,
  type Recurring,
  type RecurringFlow,
  updateRecurring,
  watchRecurring,
} from '@/lib/repo/recurring';
import { createPeriod, nextMonthMeta, periodIdFromDate, watchPeriods } from '@/lib/repo/periods';
import { applyAllocationDefaultsForPeriod } from '@/lib/repo/allocations';
import { fmtMoney, parseMoney } from '@/lib/format';
import { PLAN_GROUP_OPTIONS } from '@/lib/groups';

export default function RecurringScreen() {
  const router = useRouter();
  const uid = useAuthUser()?.uid;

  const [rows, setRows] = useState<Recurring[]>([]);
  const [periodOptions, setPeriodOptions] = useState<string[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [csvText, setCsvText] = useState(recurringCsvHeader);

  const [draft, setDraft] = useState<Recurring>({
    flow: 'EXPENSE',
    name: '',
    amount: 0,
    group: 'NEED',
    dayOfMonth: 1,
    active: true,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Recurring | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unRows = watchRecurring(uid, setRows);
    const unPeriods = watchPeriods(uid, (periods) => {
      const ids = periods.map((row) => row.id);
      setPeriodOptions(ids.length ? ids.slice(0, 8) : [periodIdFromDate()]);
    });

    return () => {
      unRows();
      unPeriods();
    };
  }, [uid]);

  useEffect(() => {
    if (!periodOptions.length) return;
    if (!periodOptions.includes(selectedPid)) {
      setSelectedPid(periodOptions[0]);
    }
  }, [periodOptions, selectedPid]);

  const activeRows = useMemo(() => rows.filter((row) => row.active !== false), [rows]);
  const activeTotal = useMemo(() => activeRows.reduce((sum, row) => sum + (row.amount || 0), 0), [activeRows]);

  async function addRow() {
    if (!uid || !draft.name || !draft.amount) return;
    await addRecurring(uid, {
      flow: draft.flow ?? 'EXPENSE',
      name: draft.name.trim(),
      amount: draft.amount,
      group: draft.flow === 'INCOME' ? undefined : draft.group ?? 'NEED',
      dayOfMonth: 1,
      active: draft.active !== false,
      note: draft.note?.trim() || undefined,
    });
    setDraft((prev) => ({ ...prev, name: '', amount: 0 }));
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

  async function generate() {
    if (!uid) return;
    const out = await generateForPeriod(uid, selectedPid, rows);
    Alert.alert('Recurring Applied', `${selectedPid}\nExpenses: ${out.expenseWritten}\nIncome: ${out.incomeWritten}`);
  }

  async function importCsv() {
    if (!uid) return;
    const count = await importRecurringCsv(uid, csvText);
    setCsvText(recurringCsvHeader);
    Alert.alert('CSV Imported', `${count} templates added.`);
  }

  async function createNextBudgetFromRecurring() {
    if (!uid) return;
    const next = nextMonthMeta();
    await createPeriod(uid, next.id, next.title);
    const seeded = await seedBudgetFromRecurring(uid, next.id, rows);
    const defaults = await applyAllocationDefaultsForPeriod(uid, next.id);
    Alert.alert(
      'Next Budget Ready',
      `${next.id}\nPlan rows: ${seeded.planWritten}\nIncome rows: ${seeded.incomeWritten}\nDefaults: ${defaults}`
    );
    router.push(`/budgets/${next.id}`);
  }

  const col = {
    name: 'w-[220px]',
    flow: 'w-[150px]',
    group: 'w-[190px]',
    amount: 'w-[130px]',
    status: 'w-[110px]',
    actions: 'w-[130px]',
  };

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-slate-100">Recurring Items</Text>
        <Text className="text-sm text-muted-foreground">Manage recurring templates and generate them into budgets.</Text>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Generate Into Period</Text>
        <DropdownField
          value={selectedPid}
          options={periodOptions.map((id) => ({ label: id, value: id }))}
          onChange={setSelectedPid}
          placeholder="Select period"
        />
        <View className="flex-row flex-wrap gap-2">
          <AppButton onPress={generate} variant="outline">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="refresh" size={18} color="#64748B" />
              <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Generate for {selectedPid}</Text>
            </View>
          </AppButton>
          <AppButton onPress={createNextBudgetFromRecurring}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="repeat" size={18} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-primary-foreground dark:text-slate-900">Create Next Budget</Text>
            </View>
          </AppButton>
        </View>
      </AppCard>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Active templates</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-slate-100">{activeRows.length}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Expense templates</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-slate-100">
            {activeRows.filter((row) => (row.flow ?? 'EXPENSE') === 'EXPENSE').length}
          </Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Active amount total</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-slate-100">{fmtMoney(activeTotal)}</Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-slate-100">CSV Import</Text>
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
            <MaterialCommunityIcons name="file-delimited-outline" size={18} color="#64748B" />
            <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Import CSV</Text>
          </View>
        </AppButton>
      </AppCard>

      <AppCard className="gap-3">
        <View>
          <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Templates</Text>
          <Text className="text-xs text-muted-foreground">Aligned list view from redesign baseline.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View className="min-w-[940px] flex-1">
            <View className="flex-row border-b border-border pb-2 dark:border-slate-700">
              <Text className={`${col.name} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Name</Text>
              <Text className={`${col.flow} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Type</Text>
              <Text className={`${col.group} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Category</Text>
              <Text className={`${col.amount} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Amount</Text>
              <Text className={`${col.status} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Status</Text>
              <Text className={`${col.actions} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Actions</Text>
            </View>

            <View className="flex-row items-center border-b border-border py-2 dark:border-slate-700">
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
                  <View className="h-9 items-start justify-center rounded-lg border border-border bg-muted px-3 dark:border-slate-700 dark:bg-slate-800">
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
                  className="h-9"
                />
              </View>
              <View className={`${col.status} pr-2`}>
                <Switch value={draft.active !== false} onValueChange={(value) => setDraft((prev) => ({ ...prev, active: value }))} />
              </View>
              <View className={col.actions}>
                <IconActionButton icon="plus" label="Add template" onPress={addRow} />
              </View>
            </View>

            {rows.map((row) => {
              const isEditing = editingId === row.id && editingDraft;
              return (
                <View key={row.id} className="flex-row items-center border-b border-border py-2 dark:border-slate-700">
                  <View className={`${col.name} pr-2`}>
                    {isEditing ? (
                      <AppInput
                        value={editingDraft.name}
                        onChangeText={(value) => setEditingDraft((prev) => (prev ? { ...prev, name: value } : prev))}
                        className="h-9"
                      />
                    ) : (
                      <Text className="text-sm font-medium text-foreground dark:text-slate-100">{row.name}</Text>
                    )}
                  </View>

                  <View className={`${col.flow} pr-2`}>
                    {isEditing ? (
                      <AppSegmented
                        value={(editingDraft.flow ?? 'EXPENSE') as RecurringFlow}
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
                    {isEditing ? (
                      (editingDraft.flow ?? 'EXPENSE') === 'EXPENSE' ? (
                        <AppSegmented
                          value={editingDraft.group ?? 'NEED'}
                          compact
                          onChange={(value) => setEditingDraft((prev) => (prev ? { ...prev, group: value as any } : prev))}
                          options={PLAN_GROUP_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                        />
                      ) : (
                        <View className="h-9 items-start justify-center rounded-lg border border-border bg-muted px-3 dark:border-slate-700 dark:bg-slate-800">
                          <Text className="text-xs text-muted-foreground">Income</Text>
                        </View>
                      )
                    ) : (
                      <AppBadge label={(row.flow ?? 'EXPENSE') === 'EXPENSE' ? row.group ?? 'NEED' : 'INCOME'} variant="outline" />
                    )}
                  </View>

                  <View className={`${col.amount} pr-2`}>
                    {isEditing ? (
                      <AppInput
                        value={String(editingDraft.amount || '')}
                        onChangeText={(value) => setEditingDraft((prev) => (prev ? { ...prev, amount: parseMoney(value) } : prev))}
                        keyboardType="decimal-pad"
                        className="h-9"
                      />
                    ) : (
                      <Text className="text-sm font-medium text-foreground dark:text-slate-100">{fmtMoney(row.amount || 0)}</Text>
                    )}
                  </View>

                  <View className={`${col.status} pr-2`}>
                    {isEditing ? (
                      <Switch
                        value={editingDraft.active !== false}
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

                  <View className={`${col.actions} flex-row gap-2`}>
                    {isEditing ? (
                      <>
                        <IconActionButton icon="content-save-outline" label="Save template" onPress={saveEditingRow} />
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

            {!rows.length ? (
              <View className="py-4">
                <Text className="text-sm text-muted-foreground">No templates yet. Add one above.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </AppCard>
    </ScrollView>
  );
}
