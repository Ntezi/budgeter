import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { cn } from '@/lib/cn';
import { computeFundedBudgetByItemId, hasFundedAmount } from '@/lib/funding';
import { fmtMoney, parseMoney } from '@/lib/format';
import { watchIncomeItems } from '@/lib/repo/income';
import { periodIdFromDate, type Group, type PeriodDoc, type PeriodStatus, watchPeriod, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { addTransaction, delTransaction, setTransaction, type Tx, watchTransactions } from '@/lib/repo/transactions';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';

type Filter = 'ALL' | Group;

type BudgetOption = {
  id: string;
  name: string;
  group: Group;
  label: string;
};

type TxEditState = {
  date: string;
  name: string;
  amount: string;
  note: string;
  group: Group;
  categoryId: string;
  dirty: boolean;
  saving: boolean;
};

function normalize(input: string) {
  return input.trim().toLowerCase();
}

function getSuggestions(query: string, options: BudgetOption[]) {
  const q = normalize(query);
  if (!q) return options.slice(0, 8);
  return options.filter((row) => normalize(row.name).includes(q)).slice(0, 8);
}

export default function TransactionsScreen() {
  const uid = useWorkspaceUid();

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus>('DRAFT');

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [activeIncomeTotal, setActiveIncomeTotal] = useState(0);

  const [txEdits, setTxEdits] = useState<Record<string, TxEditState>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('ALL');
  const [formError, setFormError] = useState('');

  const [draft, setDraft] = useState<Tx>({
    name: '',
    amount: 0,
    group: 'NEED',
    categoryId: '',
  });

  const readOnly = periodStatus === 'DECIDED';
  const todayDate = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, (rows) => {
      setPeriods(rows);
      if (!rows.some((row) => row.id === selectedPid) && rows[0]?.id) {
        setSelectedPid(rows[0].id);
      }
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchTransactions(uid, selectedPid, setTransactions);
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPeriod(uid, selectedPid, (period) => {
      setPeriodStatus((period.status as PeriodStatus) ?? 'DRAFT');
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, rows) => setPlanItems(rows));
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchIncomeItems(uid, selectedPid, (_rows, activeTotal) => {
      setActiveIncomeTotal(activeTotal);
    });
  }, [uid, selectedPid]);

  const budgetOptions = useMemo<BudgetOption[]>(
    () =>
      planItems
        .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          group: row.group,
          label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${row.group}`,
        })),
    [planItems]
  );

  const budgetById = useMemo(() => {
    const map = new Map<string, BudgetOption>();
    budgetOptions.forEach((row) => map.set(row.id, row));
    return map;
  }, [budgetOptions]);

  const budgetByName = useMemo(() => {
    const map = new Map<string, BudgetOption>();
    budgetOptions.forEach((row) => {
      const key = normalize(row.name);
      if (!map.has(key)) map.set(key, row);
    });
    return map;
  }, [budgetOptions]);

  const fundedByBudgetId = useMemo(
    () =>
      computeFundedBudgetByItemId(
        planItems
          .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
          .map((row, index) => ({
            id: row.id,
            name: row.name,
            amount: row.amount,
            group: row.group,
            priority: Number((row as any).priority) || index + 1,
            reconcilePinned: Boolean((row as any).reconcilePinned),
          })),
        activeIncomeTotal
      ),
    [activeIncomeTotal, planItems]
  );

  const fundedBudgetOptions = useMemo(
    () => budgetOptions.filter((row) => hasFundedAmount(fundedByBudgetId, row.id)),
    [budgetOptions, fundedByBudgetId]
  );

  const filteredTransactions = useMemo(
    () => (filter === 'ALL' ? transactions : transactions.filter((row) => row.group === filter)),
    [transactions, filter]
  );

  const totals = useMemo(() => {
    const next = { needs: 0, wants: 0, sd: 0, total: 0 };
    transactions.forEach((row) => {
      if (row.group === 'NEED') next.needs += row.amount || 0;
      else if (row.group === 'WANT') next.wants += row.amount || 0;
      else next.sd += row.amount || 0;
    });
    next.total = next.needs + next.wants + next.sd;
    return next;
  }, [transactions]);

  useEffect(() => {
    setTxEdits((prev) => {
      const next: Record<string, TxEditState> = {};
      transactions.forEach((row) => {
        if (!row.id) return;
        const existing = prev[row.id];
        if (existing?.dirty || existing?.saving) {
          next[row.id] = existing;
          return;
        }
        next[row.id] = {
          date: row.date || '',
          name: row.name || '',
          amount: String(Number(row.amount || 0) || ''),
          note: row.note || '',
          group: row.group,
          categoryId: String(row.categoryId || ''),
          dirty: false,
          saving: false,
        };
      });
      return next;
    });
  }, [transactions]);

  function resolveBudget(name: string, categoryId?: string) {
    const byId = String(categoryId || '').trim();
    if (byId) {
      const match = budgetById.get(byId);
      if (match) return match;
    }
    return budgetByName.get(normalize(name)) || null;
  }

  function budgetIsFunded(budgetId: string) {
    return hasFundedAmount(fundedByBudgetId, budgetId);
  }

  function setEditField(id: string, patch: Partial<TxEditState>) {
    const source = transactions.find((row) => row.id === id);
    if (!source) return;
    setTxEdits((prev) => {
      const existing =
        prev[id] ||
        ({
          date: source.date || '',
          name: source.name || '',
          amount: String(Number(source.amount || 0) || ''),
          note: source.note || '',
          group: source.group,
          categoryId: String(source.categoryId || ''),
          dirty: false,
          saving: false,
        } as TxEditState);
      const next = { ...existing, ...patch };
      next.dirty =
        next.date.trim() !== String(source.date || '').trim() ||
        next.name.trim() !== String(source.name || '').trim() ||
        Math.max(0, parseMoney(next.amount)) !== Math.max(0, Number(source.amount || 0)) ||
        next.note.trim() !== String(source.note || '').trim() ||
        next.group !== source.group ||
        next.categoryId !== String(source.categoryId || '');
      return { ...prev, [id]: next };
    });
  }

  function resetEditFromSource(id: string) {
    const source = transactions.find((row) => row.id === id);
    if (!source) return;
    setTxEdits((prev) => ({
      ...prev,
      [id]: {
        date: source.date || '',
        name: source.name || '',
        amount: String(Number(source.amount || 0) || ''),
        note: source.note || '',
        group: source.group,
        categoryId: String(source.categoryId || ''),
        dirty: false,
        saving: false,
      },
    }));
  }

  function beginEdit(id: string) {
    if (editingId && editingId !== id) {
      const current = txEdits[editingId];
      if (current?.dirty) {
        setFormError('Save or cancel the current edited row first.');
        return;
      }
    }
    setEditingId(id);
    setFormError('');
  }

  function cancelEdit(id: string) {
    resetEditFromSource(id);
    setEditingId((prev) => (prev === id ? null : prev));
    setFormError('');
  }

  async function addRow() {
    if (!uid || !selectedPid) return;
    if (readOnly) {
      setFormError('This budget is closed and view-only.');
      return;
    }

    const budget = resolveBudget(String(draft.name || ''), String(draft.categoryId || ''));
    if (!budget) {
      setFormError('Select a budget item suggestion before adding this transaction.');
      return;
    }
    if (!budgetIsFunded(budget.id)) {
      setFormError('This budget item is not funded in the current budget period.');
      return;
    }

    if (!draft.amount || draft.amount <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }

    await addTransaction(uid, selectedPid, {
      name: budget.name,
      categoryId: budget.id,
      group: budget.group,
      amount: draft.amount,
      date: todayDate,
      note: draft.note,
    });

    setDraft((prev) => ({ ...prev, name: '', categoryId: '', amount: 0, group: 'NEED' }));
    setFormError('');
  }

  async function saveRow(row: Tx) {
    if (!uid || !selectedPid || !row.id || readOnly) return;
    const edit = txEdits[row.id];
    if (!edit) return;

    const budget = resolveBudget(edit.name, edit.categoryId);
    if (!budget) {
      setFormError('Select a budget item suggestion before saving this transaction.');
      return;
    }
    if (!budgetIsFunded(budget.id)) {
      setFormError('This budget item is not funded in the current budget period.');
      return;
    }

    const amount = Math.max(0, parseMoney(edit.amount));
    if (!amount || amount <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }

    const date = edit.date.trim();
    if (!date) {
      setFormError('Date is required.');
      return;
    }

    setTxEdits((prev) => ({ ...prev, [row.id!]: { ...edit, saving: true } }));
    try {
      await setTransaction(uid, selectedPid, row.id, {
        date,
        name: budget.name,
        categoryId: budget.id,
        group: budget.group,
        amount,
        note: edit.note.trim(),
      });
      setTxEdits((prev) => ({
        ...prev,
        [row.id!]: {
          ...edit,
          date,
          name: budget.name,
          categoryId: budget.id,
          group: budget.group,
          amount: String(amount || ''),
          note: edit.note.trim(),
          dirty: false,
          saving: false,
        },
      }));
      setEditingId((prev) => (prev === row.id ? null : prev));
      setFormError('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setFormError(message || 'Could not save transaction.');
      setTxEdits((prev) => ({ ...prev, [row.id!]: { ...edit, saving: false } }));
    }
  }

  async function removeRow(id?: string) {
    if (!uid || !selectedPid || !id || readOnly) return;
    await delTransaction(uid, selectedPid, id);
    setEditingId((prev) => (prev === id ? null : prev));
  }

  const draftSuggestions = useMemo(
    () => getSuggestions(String(draft.name || ''), fundedBudgetOptions),
    [draft.name, fundedBudgetOptions]
  );
  const selectedDraftBudget = resolveBudget(String(draft.name || ''), String(draft.categoryId || ''));
  const selectedDraftBudgetFunded = selectedDraftBudget ? budgetIsFunded(selectedDraftBudget.id) : false;

  const periodOptions = periods.map((row) => ({ label: row.title || row.id, value: row.id }));

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Transactions</Text>
        <Text className="text-sm text-muted-foreground">Transaction items are linked to budget items for this period.</Text>
      </View>

      <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <View className="w-full md:w-72">
          <DropdownField
            value={selectedPid}
            options={periodOptions}
            onChange={setSelectedPid}
            placeholder="Select period"
            menuStrategy="inline"
            menuClassName="max-h-44"
          />
        </View>
        <View className="flex-row items-center gap-2">
          <AppBadge label={periodStatus} variant={readOnly ? 'secondary' : 'success'} />
        </View>
      </View>
      {readOnly ? <Text className="text-xs text-muted-foreground">Closed budgets are view-only.</Text> : null}

      <View className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Needs</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{fmtMoney(totals.needs)}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Wants</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{fmtMoney(totals.wants)}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Savings-Debt</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{fmtMoney(totals.sd)}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Total Spent</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{fmtMoney(totals.total)}</Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Filter</Text>
        <AppSegmented
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          compact
          options={[
            { label: 'All', value: 'ALL' },
            { label: 'Needs', value: 'NEED' },
            { label: 'Wants', value: 'WANT' },
            { label: 'Savings', value: 'SAVINGS_DEBT' },
          ]}
        />
      </AppCard>

      <AppCard className="gap-3">
        <View>
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Transaction List</Text>
          <Text className="text-xs text-muted-foreground">Use funded budget-item suggestions in the item name field.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View className="min-w-[980px] flex-1">
            <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
              <Text className="w-[140px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Text>
              <Text className="w-[360px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item Name</Text>
              <Text className="w-[190px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group</Text>
              <Text className="w-[130px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</Text>
              <Text className="w-[130px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</Text>
            </View>

            {!readOnly ? (
              <View className="flex-row items-start border-b border-border py-2 dark:border-zinc-800">
                <View className="w-[140px] pr-2">
                  <View className="h-9 justify-center px-2">
                    <Text className="text-xs text-muted-foreground">{todayDate}</Text>
                  </View>
                </View>
                <View className="w-[360px] pr-2">
                  <View>
                    <AppInput
                      value={draft.name ?? ''}
                      onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value, categoryId: '' }))}
                      placeholder="Type budget item..."
                      className="h-9"
                    />
                    {normalize(String(draft.name || '')).length > 0 && draftSuggestions.length ? (
                      <View className="mt-1 max-h-48 overflow-hidden rounded-md border border-border bg-card dark:border-zinc-700 dark:bg-zinc-900">
                        <ScrollView>
                          {draftSuggestions.map((row) => (
                            <Pressable
                              key={row.id}
                              className="border-b border-border px-3 py-2 dark:border-zinc-800"
                              onPress={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  name: row.name,
                                  categoryId: row.id,
                                  group: row.group,
                                }))
                              }
                            >
                              <Text className="text-sm text-foreground dark:text-zinc-50">{row.name}</Text>
                              <Text className="text-xs text-muted-foreground">{row.group}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    className={cn(
                      'mt-1 text-xs',
                      !selectedDraftBudget
                        ? 'text-amber-600 dark:text-amber-300'
                        : selectedDraftBudgetFunded
                          ? 'text-muted-foreground'
                          : 'text-red-600 dark:text-red-300'
                    )}
                  >
                    {!selectedDraftBudget
                      ? 'Select a funded budget item from suggestions'
                      : selectedDraftBudgetFunded
                        ? `Budget: ${selectedDraftBudget.name}`
                        : `Budget: ${selectedDraftBudget.name} (not funded)`}
                  </Text>
                </View>
                <View className="w-[190px] pr-2">
                  <View className="h-9 justify-center px-2">
                    <Text className="text-xs text-foreground dark:text-zinc-50">{selectedDraftBudget?.group || '-'}</Text>
                  </View>
                </View>
                <View className="w-[130px] pr-2">
                  <AppInput
                    value={String(draft.amount || '')}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    className="h-9 text-right"
                  />
                </View>
                <View className="w-[130px] flex-row items-center justify-center gap-2">
                  <IconActionButton icon="plus" label="Add transaction" onPress={addRow} />
                </View>
              </View>
            ) : null}

            {formError ? (
              <View className="py-1">
                <Text className="text-xs text-destructive">{formError}</Text>
              </View>
            ) : null}

            {filteredTransactions.map((row) => {
              const edit = row.id ? txEdits[row.id] : null;
              if (!row.id || !edit) return null;
              const isEditing = editingId === row.id;
              const dirty = edit.dirty;
              const currentBudget = resolveBudget(isEditing ? edit.name : row.name || '', isEditing ? edit.categoryId : row.categoryId);
              const currentBudgetFunded = currentBudget ? budgetIsFunded(currentBudget.id) : false;
              const rowSuggestions = isEditing ? getSuggestions(edit.name, fundedBudgetOptions) : [];

              return (
                <View
                  key={row.id}
                  className={
                    dirty
                      ? 'flex-row items-start border-b border-primary/40 bg-primary/5 py-2 dark:border-zinc-800 dark:bg-zinc-800/70'
                      : 'flex-row items-start border-b border-border py-2 dark:border-zinc-800'
                  }
                >
                  <View className="w-[140px] pr-2">
                    {isEditing ? (
                      <AppInput
                        value={edit.date}
                        onChangeText={(value) => setEditField(row.id!, { date: value })}
                        placeholder="YYYY-MM-DD"
                        className="h-9"
                        editable={!readOnly}
                      />
                    ) : (
                      <Text className="text-xs text-foreground dark:text-zinc-50">{row.date || '-'}</Text>
                    )}
                  </View>

                  <View className="w-[360px] pr-2">
                    {isEditing ? (
                      <View>
                        <AppInput
                          value={edit.name}
                          onChangeText={(value) => setEditField(row.id!, { name: value, categoryId: '' })}
                          placeholder="Budget item"
                          className="h-9"
                          editable={!readOnly}
                        />
                        {normalize(edit.name).length > 0 && rowSuggestions.length ? (
                          <View className="mt-1 max-h-48 overflow-hidden rounded-md border border-border bg-card dark:border-zinc-700 dark:bg-zinc-900">
                            <ScrollView>
                              {rowSuggestions.map((suggestion) => (
                                <Pressable
                                  key={suggestion.id}
                                  className="border-b border-border px-3 py-2 dark:border-zinc-800"
                                  onPress={() =>
                                    setEditField(row.id!, {
                                      name: suggestion.name,
                                      categoryId: suggestion.id,
                                      group: suggestion.group,
                                    })
                                  }
                                >
                                  <Text className="text-sm text-foreground dark:text-zinc-50">{suggestion.name}</Text>
                                  <Text className="text-xs text-muted-foreground">{suggestion.group}</Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name || '-'}</Text>
                    )}
                    <Text
                      className={cn(
                        'mt-1 text-xs',
                        !currentBudget
                          ? 'text-amber-600 dark:text-amber-300'
                          : currentBudgetFunded
                            ? 'text-muted-foreground'
                            : 'text-red-600 dark:text-red-300'
                      )}
                    >
                      {!currentBudget
                        ? 'Budget item required'
                        : currentBudgetFunded
                          ? `Budget: ${currentBudget.name}`
                          : `Budget: ${currentBudget.name} (not funded)`}
                    </Text>
                    {row.shoppingItemName ? (
                      <Text className="text-xs text-muted-foreground">
                        Shopping: {row.shoppingListName || 'List'} / {row.shoppingItemName}
                      </Text>
                    ) : null}
                  </View>

                  <View className="w-[190px] pr-2">
                    <View className="h-9 justify-center px-2">
                      <Text className="text-xs text-foreground dark:text-zinc-50">{currentBudget?.group || row.group}</Text>
                    </View>
                  </View>

                  <View className="w-[130px] pr-2">
                    {isEditing ? (
                      <AppInput
                        value={edit.amount}
                        onChangeText={(value) => setEditField(row.id!, { amount: value })}
                        keyboardType="decimal-pad"
                        placeholder="Amount"
                        className="h-9 text-right"
                        editable={!readOnly}
                      />
                    ) : (
                      <Text className="text-right text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                    )}
                  </View>

                  <View className="w-[130px] flex-row items-center justify-center gap-2">
                    {!readOnly ? (
                      isEditing ? (
                        <>
                          {dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
                          <IconActionButton
                            icon="content-save-outline"
                            label="Save transaction"
                            onPress={() => saveRow(row)}
                            disabled={!dirty || edit.saving}
                          />
                          <IconActionButton icon="close" label="Cancel edit" variant="muted" onPress={() => cancelEdit(row.id!)} />
                        </>
                      ) : (
                        <>
                          <IconActionButton icon="pencil-outline" label="Edit transaction" onPress={() => beginEdit(row.id!)} />
                          <IconActionButton icon="trash-can-outline" label="Delete transaction" variant="danger" onPress={() => removeRow(row.id)} />
                        </>
                      )
                    ) : (
                      <AppBadge label="View only" variant="secondary" />
                    )}
                  </View>
                </View>
              );
            })}

            {!filteredTransactions.length ? (
              <View className="py-4">
                <Text className="text-sm text-muted-foreground">No transactions in this period/filter yet.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </AppCard>
    </ScrollView>
  );
}
