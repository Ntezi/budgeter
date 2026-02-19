import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { periodIdFromDate, type Group, type PeriodDoc, type PeriodStatus, watchPeriod, watchPeriods } from '@/lib/repo/periods';
import { addTransaction, delTransaction, setTransaction, type Tx, watchTransactions } from '@/lib/repo/transactions';
import { generateForPeriod, type Recurring, watchRecurring } from '@/lib/repo/recurring';
import { fmtMoney, parseMoney } from '@/lib/format';

type Filter = 'ALL' | Group;

export default function TransactionsScreen() {
  const uid = useWorkspaceUid();
  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus>('DRAFT');

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [templates, setTemplates] = useState<Recurring[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [formError, setFormError] = useState('');

  const [draft, setDraft] = useState<Tx>({
    name: '',
    amount: 0,
    group: 'NEED',
    date: `${periodIdFromDate()}-01`,
  });
  const readOnly = periodStatus === 'DECIDED';

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
    const unTx = watchTransactions(uid, selectedPid, setTransactions);
    const unRecurring = watchRecurring(uid, setTemplates);
    return () => {
      unTx();
      unRecurring();
    };
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPeriod(uid, selectedPid, (period) => {
      setPeriodStatus((period.status as PeriodStatus) ?? 'DRAFT');
    });
  }, [uid, selectedPid]);

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

  async function addRow() {
    if (!uid || !selectedPid) return;
    if (readOnly) {
      setFormError('This budget is closed and view-only.');
      return;
    }
    if (!draft.name?.trim()) {
      setFormError('Description is required.');
      return;
    }
    if (!draft.amount || draft.amount <= 0) {
      setFormError('Amount must be greater than 0.');
      return;
    }
    await addTransaction(uid, selectedPid, draft);
    setDraft((prev) => ({ ...prev, name: '', amount: 0 }));
    setFormError('');
  }

  async function saveRow(row: Tx) {
    if (!uid || !selectedPid || !row.id || readOnly) return;
    await setTransaction(uid, selectedPid, row.id, {
      name: row.name,
      amount: row.amount,
      group: row.group,
      date: row.date,
      note: row.note,
    });
  }

  async function removeRow(id?: string) {
    if (!uid || !selectedPid || !id || readOnly) return;
    await delTransaction(uid, selectedPid, id);
  }

  async function generateRecurring() {
    if (!uid || !selectedPid || readOnly) return;
    await generateForPeriod(uid, selectedPid, templates);
  }

  const periodOptions = periods.map((row) => ({ label: `${row.title || row.id}`, value: row.id }));

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Transactions</Text>
        <Text className="text-sm text-muted-foreground">Record actual spending and income for any period.</Text>
      </View>

      <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <View className="w-full md:w-72">
          <DropdownField
            value={selectedPid}
            options={periodOptions}
            onChange={setSelectedPid}
            placeholder="Select period"
            menuStrategy="overlay"
            menuClassName="max-h-44"
          />
        </View>
        <View className="flex-row items-center gap-2">
          <AppBadge label={periodStatus} variant={readOnly ? 'secondary' : 'success'} />
          <AppButton onPress={generateRecurring} variant="outline" disabled={readOnly}>
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="refresh" size={18} color="#717182" />
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">
                {readOnly ? `Closed (${selectedPid})` : `Generate recurring (${selectedPid})`}
              </Text>
            </View>
          </AppButton>
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
          <Text className="text-xs text-muted-foreground">Aligned list view matching redesign structure.</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View className="min-w-[980px] flex-1">
            <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
              <Text className="w-[140px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Text>
              <Text className="w-[360px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Text>
              <Text className="w-[190px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group</Text>
              <Text className="w-[130px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</Text>
              <Text className="w-[130px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</Text>
            </View>

            {!readOnly ? (
              <View className="flex-row items-center border-b border-border py-2 hover:bg-muted/35 dark:border-zinc-800 dark:hover:bg-zinc-800/55">
                <View className="w-[140px] pr-2">
                  <AppInput
                    value={draft.date ?? ''}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, date: value }))}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                    className="h-9"
                  />
                </View>
                <View className="w-[360px] pr-2">
                  <AppInput
                    value={draft.name ?? ''}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                    placeholder="New transaction..."
                    className="h-9"
                  />
                </View>
                <View className="w-[190px] pr-2">
                  <AppSegmented
                    value={draft.group}
                    compact
                    onChange={(value) => setDraft((prev) => ({ ...prev, group: value as Group }))}
                    options={[
                      { label: 'Need', value: 'NEED' },
                      { label: 'Want', value: 'WANT' },
                      { label: 'S&D', value: 'SAVINGS_DEBT' },
                    ]}
                  />
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

            {filteredTransactions.map((row) => (
              <View
                key={row.id}
                className="flex-row items-center border-b border-border py-2 hover:bg-muted/35 dark:border-zinc-800 dark:hover:bg-zinc-800/55"
              >
                <View className="w-[140px] pr-2">
                  <AppInput
                    value={row.date ?? ''}
                    onChangeText={(value) =>
                      setTransactions((prev) => prev.map((it) => (it.id === row.id ? { ...it, date: value } : it)))
                    }
                    placeholder="YYYY-MM-DD"
                    className="h-9"
                    editable={!readOnly}
                  />
                </View>
                <View className="w-[360px] pr-2">
                  <View className="gap-1">
                    <AppInput
                      value={row.name ?? ''}
                      onChangeText={(value) =>
                        setTransactions((prev) => prev.map((it) => (it.id === row.id ? { ...it, name: value } : it)))
                      }
                      placeholder="Description"
                      className="h-9"
                      editable={!readOnly}
                    />
                    {row.shoppingItemName ? (
                      <Text className="text-xs text-muted-foreground">
                        Shopping: {row.shoppingListName || 'List'} / {row.shoppingItemName}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View className="w-[190px] pr-2">
                  {readOnly ? (
                    <View className="h-9 items-start justify-center px-2">
                      <Text className="text-xs text-foreground dark:text-zinc-50">{row.group}</Text>
                    </View>
                  ) : (
                    <AppSegmented
                      value={row.group}
                      compact
                      onChange={(value) =>
                        setTransactions((prev) => prev.map((it) => (it.id === row.id ? { ...it, group: value as Group } : it)))
                      }
                      options={[
                        { label: 'Need', value: 'NEED' },
                        { label: 'Want', value: 'WANT' },
                        { label: 'S&D', value: 'SAVINGS_DEBT' },
                      ]}
                    />
                  )}
                </View>
                <View className="w-[130px] pr-2">
                  <AppInput
                    value={String(row.amount || '')}
                    onChangeText={(value) =>
                      setTransactions((prev) => prev.map((it) => (it.id === row.id ? { ...it, amount: parseMoney(value) } : it)))
                    }
                    keyboardType="decimal-pad"
                    placeholder="Amount"
                    className="h-9 text-right"
                    editable={!readOnly}
                  />
                </View>
                <View className="w-[130px] flex-row items-center justify-center gap-2">
                  {!readOnly ? (
                    <>
                      <IconActionButton icon="content-save-outline" label="Save transaction" onPress={() => saveRow(row)} />
                      <IconActionButton icon="trash-can-outline" label="Delete transaction" variant="danger" onPress={() => removeRow(row.id)} />
                    </>
                  ) : (
                    <AppBadge label="View only" variant="secondary" />
                  )}
                </View>
              </View>
            ))}

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
