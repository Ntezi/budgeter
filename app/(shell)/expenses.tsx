import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { DropdownField } from '@/components/ui/DropdownField';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { addExpense, deleteExpense, type ExpenseItem, updateExpense, watchExpenses } from '@/lib/repo/expenses';
import { addPlanItem, type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { addRecurring } from '@/lib/repo/recurring';
import { fmtMoney, parseMoney } from '@/lib/format';
import { PLAN_GROUP_OPTIONS, planGroupLabel } from '@/lib/groups';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { firstTag, parseTagsInput, tagsLabel, tagsToInput } from '@/lib/tags';

export default function ExpensesScreen() {
  const uid = useWorkspaceUid();

  const [rows, setRows] = useState<ExpenseItem[]>([]);
  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [formError, setFormError] = useState('');
  const [tagFilter, setTagFilter] = useState('ALL');
  const [sortMode, setSortMode] = useState<'CREATED' | 'TAG'>('CREATED');

  const [draft, setDraft] = useState<ExpenseItem>({
    name: '',
    amount: 0,
    group: 'NEED',
    tags: [],
    active: true,
  });

  useEffect(() => {
    if (!uid) return;
    const unExpenses = watchExpenses(uid, setRows);
    const unPeriods = watchPeriods(uid, (next) => {
      setPeriods(next);
      if (!next.some((row) => row.id === selectedPid) && next[0]?.id) setSelectedPid(next[0].id);
    });
    return () => {
      unExpenses();
      unPeriods();
    };
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, items) => setPlanItems(items));
  }, [uid, selectedPid]);

  const periodOptions = useMemo(
    () => periods.map((period) => ({ label: period.title || period.id, value: period.id })),
    [periods]
  );

  const activeCount = useMemo(() => rows.filter((row) => row.active !== false).length, [rows]);
  const activeTotal = useMemo(
    () => rows.filter((row) => row.active !== false).reduce((sum, row) => sum + (row.amount || 0), 0),
    [rows]
  );
  const tagOptions = useMemo(() => {
    const tags = [...new Set(rows.flatMap((row) => row.tags || []))].sort((a, b) => a.localeCompare(b));
    return [{ label: 'All tags', value: 'ALL' }, ...tags.map((tag) => ({ label: `#${tag}`, value: tag }))];
  }, [rows]);
  const displayRows = useMemo(() => {
    let out = [...rows];
    if (tagFilter !== 'ALL') out = out.filter((row) => (row.tags || []).includes(tagFilter));
    if (sortMode === 'TAG') {
      out.sort((a, b) => {
        const ta = firstTag(a.tags);
        const tb = firstTag(b.tags);
        if (ta !== tb) return ta.localeCompare(tb);
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    return out;
  }, [rows, sortMode, tagFilter]);

  async function addRow() {
    if (!uid) return;
    if (!draft.name.trim()) {
      setFormError('Expense name is required.');
      return;
    }
    if (draft.amount <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }
    await addExpense(uid, {
      name: draft.name.trim(),
      amount: draft.amount,
      group: draft.group,
      tags: draft.tags ?? [],
      note: draft.note?.trim() || '',
      active: draft.active !== false,
    });
    setDraft((prev) => ({ ...prev, name: '', amount: 0, note: '', tags: [] }));
    setFormError('');
  }

  async function saveRow(row: ExpenseItem) {
    if (!uid || !row.id) return;
    await updateExpense(uid, row.id, {
      name: row.name.trim(),
      amount: row.amount,
      group: row.group,
      tags: row.tags ?? [],
      note: row.note?.trim() || '',
      active: row.active !== false,
    });
  }

  async function removeRow(row: ExpenseItem) {
    if (!uid || !row.id) return;
    await deleteExpense(uid, row.id);
  }

  async function addToBudget(row: ExpenseItem) {
    if (!uid || !selectedPid) return;
    const maxPriority = planItems.reduce((max, item) => Math.max(max, Number((item as any).priority) || 0), 0);
    try {
      await addPlanItem(uid, selectedPid, {
        name: row.name,
        amount: row.amount,
        group: row.group as any,
        tags: row.tags ?? [],
        priority: maxPriority + 1,
      } as any);
      Alert.alert('Added to budget', `${row.name} added to ${selectedPid}.`);
    } catch (e: unknown) {
      Alert.alert('Could not add to budget', e instanceof Error ? e.message : String(e));
    }
  }

  async function addToRecurringFromExpense(row: ExpenseItem) {
    if (!uid) return;
    await addRecurring(uid, {
      flow: 'EXPENSE',
      name: row.name,
      amount: row.amount,
      group: row.group,
      tags: row.tags ?? [],
      dayOfMonth: 1,
      active: row.active !== false,
      note: row.note,
    });
    Alert.alert('Recurring template created', `${row.name} is now available in Recurring.`);
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Expenses</Text>
        <Text className="text-sm text-muted-foreground">Reusable expense templates for budgets and recurring items.</Text>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Templates</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{rows.length}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Active</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{activeCount}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Active total</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{fmtMoney(activeTotal)}</Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Default period for “Add to Budget”</Text>
        <View className="w-full md:w-80">
          <DropdownField value={selectedPid} options={periodOptions} onChange={setSelectedPid} placeholder="Select budget period" />
        </View>
      </AppCard>

      <AppCard className="gap-3">
        <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <View className="w-full md:w-64">
            <DropdownField value={tagFilter} options={tagOptions} onChange={setTagFilter} placeholder="Filter by tag" menuStrategy="inline" />
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
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Expense Templates</Text>
          <Text className="text-xs text-muted-foreground">Add once and reuse in budget planning or recurring generation.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View className="min-w-[1260px] flex-1">
            <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
              <Text className="w-[260px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</Text>
              <Text className="w-[220px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</Text>
              <Text className="w-[220px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</Text>
              <Text className="w-[140px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</Text>
              <Text className="w-[130px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active</Text>
              <Text className="w-[320px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</Text>
            </View>

            <View className="flex-row items-center border-b border-border py-2 hover:bg-muted/35 dark:border-zinc-800 dark:hover:bg-zinc-800/55">
              <View className="w-[260px] pr-2">
                <AppInput
                  value={draft.name}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                  placeholder="e.g. Groceries"
                  className="h-9"
                />
              </View>
              <View className="w-[220px] pr-2">
                <AppSegmented
                  value={draft.group}
                  compact
                  onChange={(value) => setDraft((prev) => ({ ...prev, group: value as any }))}
                  options={PLAN_GROUP_OPTIONS}
                />
              </View>
              <View className="w-[220px] pr-2">
                <AppInput
                  value={tagsToInput(draft.tags)}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, tags: parseTagsInput(value) }))}
                  placeholder="utilities, vegetables"
                  className="h-9"
                />
              </View>
              <View className="w-[140px] pr-2">
                <AppInput
                  value={String(draft.amount || '')}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  className="h-9 text-right"
                />
              </View>
              <View className="w-[130px] items-center">
                <Switch value={draft.active !== false} onValueChange={(value) => setDraft((prev) => ({ ...prev, active: value }))} />
              </View>
              <View className="w-[320px] flex-row items-center justify-center gap-2">
                <IconActionButton icon="plus" label="Add expense template" onPress={addRow} />
              </View>
            </View>
            {formError ? (
              <View className="py-1">
                <Text className="text-xs text-destructive">{formError}</Text>
              </View>
            ) : null}

            {displayRows.map((row) => (
              <View
                key={row.id}
                className="flex-row items-center border-b border-border py-2 hover:bg-muted/35 dark:border-zinc-800 dark:hover:bg-zinc-800/55"
              >
                <View className="w-[260px] pr-2">
                  <AppInput
                    value={row.name}
                    onChangeText={(value) =>
                      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, name: value } : item)))
                    }
                    className="h-9"
                  />
                </View>
                <View className="w-[220px] pr-2">
                  <AppSegmented
                    value={row.group}
                    compact
                    onChange={(value) =>
                      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, group: value as any } : item)))
                    }
                    options={PLAN_GROUP_OPTIONS}
                  />
                </View>
                <View className="w-[220px] pr-2">
                  <AppInput
                    value={tagsToInput(row.tags)}
                    onChangeText={(value) =>
                      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, tags: parseTagsInput(value) } : item)))
                    }
                    placeholder="tags"
                    className="h-9"
                  />
                  {row.tags?.length ? <Text className="mt-1 text-xs text-muted-foreground">{tagsLabel(row.tags)}</Text> : null}
                </View>
                <View className="w-[140px] pr-2">
                  <AppInput
                    value={String(row.amount || '')}
                    onChangeText={(value) =>
                      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, amount: parseMoney(value) } : item)))
                    }
                    keyboardType="decimal-pad"
                    className="h-9 text-right"
                  />
                </View>
                <View className="w-[130px] items-center">
                  <Switch
                    value={row.active !== false}
                    onValueChange={(value) =>
                      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, active: value } : item)))
                    }
                  />
                </View>
                <View className="w-[320px] flex-row items-center justify-center gap-2">
                  <IconActionButton icon="content-save-outline" label="Save expense template" onPress={() => saveRow(row)} />
                  <IconActionButton icon="wallet-plus-outline" label="Add to budget" onPress={() => addToBudget(row)} />
                  <IconActionButton icon="repeat" label="Convert to recurring template" onPress={() => addToRecurringFromExpense(row)} />
                  <IconActionButton icon="trash-can-outline" label="Delete expense template" variant="danger" onPress={() => removeRow(row)} />
                </View>
              </View>
            ))}

            {!displayRows.length ? (
              <View className="py-4">
                <Text className="text-sm text-muted-foreground">No expense templates for this filter.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </AppCard>

      <AppCard className="gap-2">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Category Totals</Text>
        <View className="flex-row flex-wrap gap-2">
          {PLAN_GROUP_OPTIONS.map((group) => {
            const total = rows
              .filter((row) => row.group === group.value && row.active !== false)
              .reduce((sum, row) => sum + (row.amount || 0), 0);
            return <Text key={group.value} className="text-xs text-muted-foreground">{planGroupLabel(group.value)}: {fmtMoney(total)}</Text>;
          })}
        </View>
      </AppCard>
    </ScrollView>
  );
}
