import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { localDateISO } from '@/lib/rules/postingMonth';
import { isMonthId, monthTitle } from '@/lib/rules/months';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppInput } from '@/components/ui/AppInput';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { cn } from '@/lib/cn';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PageHeader } from '@/components/patterns/PageHeader';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { EmptyState, LoadingState, LockedState } from '@/components/patterns/States';
import { AccountsSegment } from '@/components/accounts/AccountsSegment';
import { planGroupLabel } from '@/lib/groups';
import { computeFundedBudgetByItemId, hasFundedAmount } from '@/lib/funding';
import { fmtMoney, parseMoney } from '@/lib/format';
import { watchIncomeItems } from '@/lib/repo/income';
import { periodIdFromDate, type Group, type PeriodStatus, watchPeriod, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { delTransaction, setTransaction, type Tx, watchTransactions } from '@/lib/repo/transactions';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { ReceiptModal } from '@/components/shopping/ReceiptModal';
import { useAuthUser } from '@/providers/AuthProvider';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import { watchShoppingCatalog, type ShoppingCatalogItem } from '@/lib/repo/shopping';
import { type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { transactionSignedBudgetAmount } from '@/lib/accounting';

type Filter = 'ALL' | Group;
type TxScopeFilter = 'ALL' | 'SHOPPING' | 'MANUAL' | 'UNCATEGORIZED';

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


export default function TransactionsScreen() {
  const uid = useWorkspaceUid();
  const { activePeriodId } = useWorkspace();
  const defaultPid = activePeriodId || periodIdFromDate();
  // Viewed month lives in the URL (?month=) so Back/refresh restore it; it never sets where an expense posts.
  const params = useLocalSearchParams<{ month?: string; scope?: string; action?: string }>();
  const monthParam = typeof params.month === 'string' && isMonthId(params.month) ? params.month : '';
  // BUDG-8 S3: the shell's Add sheet replaces the page's expense modal (and handles ?action=new-expense).

  const [selectedPid, setSelectedPidState] = useState(monthParam || defaultPid);
  const [periodStatus, setPeriodStatus] = useState<PeriodStatus>('DRAFT');

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [txLoaded, setTxLoaded] = useState(false);
  const [totalsOpen, setTotalsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [activeIncomeTotal, setActiveIncomeTotal] = useState(0);

  const [txEdits, setTxEdits] = useState<Record<string, TxEditState>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null);
  const authUser = useAuthUser();
  // BUDG-5 entry point 2: "Attach receipt" on a row opens the receipt flow on "Link existing".
  const [receiptFor, setReceiptFor] = useState<Tx | null>(null);
  const [receiptNotice, setReceiptNotice] = useState('');
  const [receiptAccounts, setReceiptAccounts] = useState<Account[]>([]);
  const [receiptCatalog, setReceiptCatalog] = useState<ShoppingCatalogItem[]>([]);
  useEffect(() => {
    if (!uid || !receiptFor) return;
    const offA = watchAccounts(uid, setReceiptAccounts);
    const offC = watchShoppingCatalog(uid, setReceiptCatalog);
    return () => {
      offA?.();
      offC?.();
    };
  }, [uid, receiptFor]);

  const groupParam = (params as { group?: string }).group;
  const [filter, setFilter] = useState<Filter>(groupParam === 'NEED' || groupParam === 'WANT' || groupParam === 'SAVINGS_DEBT' ? groupParam : 'ALL');
  const [scopeFilter, setScopeFilter] = useState<TxScopeFilter>(params.scope === 'SHOPPING' || params.scope === 'UNCATEGORIZED' ? params.scope : 'ALL');
  const [searchText, setSearchText] = useState('');
  const [formError, setFormError] = useState('');

  const readOnly = periodStatus === 'DECIDED';

  useEffect(() => {
    if (monthParam) setSelectedPidState(monthParam);
  }, [monthParam]);

  useEffect(() => {
    if (params.scope === 'SHOPPING' || params.scope === 'UNCATEGORIZED') setScopeFilter(params.scope);
  }, [params.scope]);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, (rows) => {
      if (!rows.some((row) => row.id === selectedPid)) {
        const fallback = rows.find((row) => row.id === defaultPid)?.id || rows[0]?.id;
        if (fallback) setSelectedPidState(fallback);
      }
    });
  }, [defaultPid, uid, selectedPid]);

  useEffect(() => {
    if (!activePeriodId || monthParam) return;
    setSelectedPidState(activePeriodId);
  }, [activePeriodId, monthParam]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    setTxLoaded(false);
    return watchTransactions(uid, selectedPid, (rows) => {
      setTransactions(rows);
      setTxLoaded(true);
    });
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
    return watchAllocations(uid, selectedPid, (rows) => setAllocations(rows));
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

  const plannedAccountByPlanId = useMemo(() => {
    const map = new Map<string, string>();
    allocations.forEach((row) => {
      if (row.sourceType !== 'PLAN') return;
      const planId = String(row.sourceItemId || '').trim();
      const accountId = String(row.accountId || '').trim();
      if (!planId || !accountId) return;
      map.set(planId, accountId);
    });
    planItems.forEach((row) => {
      const planId = String(row.id || '').trim();
      const accountId = String((row as any).plannedAccountId || '').trim();
      if (!planId || !accountId) return;
      map.set(planId, accountId);
    });
    return map;
  }, [allocations, planItems]);

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

  const budgetTransactions = useMemo(
    () => transactions.filter((row) => transactionSignedBudgetAmount(row) !== 0),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    const q = normalize(searchText);
    return budgetTransactions.filter((row) => {
      if (filter !== 'ALL' && row.group !== filter) return false;
      if (scopeFilter === 'SHOPPING' && !row.shoppingListId && !row.shoppingItemId) return false;
      if (scopeFilter === 'MANUAL' && (row.shoppingListId || row.shoppingItemId)) return false;
      if (scopeFilter === 'UNCATEGORIZED' && row.categoryId) return false;
      if (!q) return true;
      return (
        normalize(row.name || '').includes(q) ||
        normalize(row.note || '').includes(q) ||
        normalize(row.shoppingListName || '').includes(q) ||
        normalize(row.shoppingItemName || '').includes(q)
      );
    });
  }, [budgetTransactions, filter, scopeFilter, searchText]);

  const totals = useMemo(() => {
    const next = { needs: 0, wants: 0, sd: 0, total: 0 };
    transactions.forEach((row) => {
      const amount = transactionSignedBudgetAmount(row);
      if (!amount) return;
      if (row.group === 'NEED') next.needs += amount;
      else if (row.group === 'WANT') next.wants += amount;
      else next.sd += amount;
    });
    next.total = next.needs + next.wants + next.sd;
    return next;
  }, [transactions]);

  const transactionSummary = useMemo(() => {
    const shoppingRows = budgetTransactions.filter((row) => row.shoppingListId || row.shoppingItemId);
    const uncategorizedRows = budgetTransactions.filter((row) => !row.categoryId);
    const filteredTotal = filteredTransactions.reduce((sum, row) => sum + transactionSignedBudgetAmount(row), 0);
    const shoppingTotal = shoppingRows.reduce((sum, row) => sum + transactionSignedBudgetAmount(row), 0);
    return {
      count: budgetTransactions.length,
      filteredCount: filteredTransactions.length,
      filteredTotal,
      average: filteredTransactions.length ? filteredTotal / filteredTransactions.length : 0,
      shoppingCount: shoppingRows.length,
      shoppingTotal,
      uncategorizedCount: uncategorizedRows.length,
    };
  }, [budgetTransactions, filteredTransactions]);

  useEffect(() => {
    setTxEdits((prev) => {
      const next: Record<string, TxEditState> = {};
      budgetTransactions.forEach((row) => {
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
  }, [budgetTransactions]);

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
    const source = budgetTransactions.find((row) => row.id === id);
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
    const source = budgetTransactions.find((row) => row.id === id);
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
        return false;
      }
    }
    setEditingId(id);
    setFormError('');
    return true;
  }

  function cancelEdit(id: string) {
    resetEditFromSource(id);
    setEditingId((prev) => (prev === id ? null : prev));
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
        planItemId: budget.id,
        group: budget.group,
        amount,
        note: edit.note.trim(),
        paidFromAccountId: plannedAccountByPlanId.get(budget.id) || '',
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

  const mobileDetailRow = useMemo(
    () => filteredTransactions.find((row) => row.id === mobileDetailId) || null,
    [filteredTransactions, mobileDetailId]
  );
  const chipDefs = [
    { id: 'ALL', label: 'All' },
    { id: 'NEED', label: 'Needs' },
    { id: 'WANT', label: 'Wants' },
    { id: 'SAVINGS_DEBT', label: 'Savings' },
    { id: 'SHOPPING', label: 'Shopping' },
    { id: 'UNCATEGORIZED', label: `Review ${transactionSummary.uncategorizedCount}` },
  ];
  const activeChip = scopeFilter === 'SHOPPING' || scopeFilter === 'UNCATEGORIZED' ? scopeFilter : filter;
  function pickChip(id: string) {
    if (id === 'SHOPPING' || id === 'UNCATEGORIZED') {
      setFilter('ALL');
      setScopeFilter(id as TxScopeFilter);
    } else {
      setFilter(id as Filter);
      setScopeFilter('ALL');
    }
  }
  const groupWord = (g?: string) => (g ? planGroupLabel(g as Group) : null);
  const accountNameById = useMemo(() => new Map(receiptAccounts.map((a) => [String(a.id), a.name] as [string, string])), [receiptAccounts]);
  const dayGroups = useMemo(() => {
    const byDay = new Map<string, Tx[]>();
    [...filteredTransactions]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .forEach((row) => {
        const d = row.date || 'No date';
        byDay.set(d, [...(byDay.get(d) ?? []), row]);
      });
    return [...byDay.entries()];
  }, [filteredTransactions]);
  const mobileDetailEdit = mobileDetailRow?.id ? txEdits[mobileDetailRow.id] : null;
  const mobileDetailBudget = mobileDetailEdit ? resolveBudget(mobileDetailEdit.name, mobileDetailEdit.categoryId) : null;
  const mobileBudgetOptions = useMemo(
    () => [{ label: 'Select funded budget item', value: '' }, ...fundedBudgetOptions.map((row) => ({ label: row.label, value: row.id }))],
    [fundedBudgetOptions]
  );

  function openMobileDetail(id: string) {
    if (!beginEdit(id)) return;
    setMobileDetailId(id);
  }

  function closeMobileDetail() {
    setConfirmDelete(false);
    if (mobileDetailId) cancelEdit(mobileDetailId);
    setMobileDetailId(null);
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <PageHeader title="Activity" right={<AccountsSegment active="activity" month={selectedPid} />} />
      <View className="gap-1">
        <Pressable
          accessibilityRole="button"
          aria-expanded={totalsOpen}
          onPress={() => setTotalsOpen((v) => !v)}
          testID="activity-spent"
          className="min-h-11 flex-row items-center gap-2 rounded-lg px-1"
        >
          <Text className="min-w-0 flex-1 text-base font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
            Spent in {monthTitle(selectedPid).split(' ')[0]}
          </Text>
          <Text className="shrink-0 text-xl font-bold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
            {fmtMoney(totals.total)}
          </Text>
          <MaterialCommunityIcons name={totalsOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
        </Pressable>
        {totalsOpen ? (
          <View testID="activity-totals" className="gap-2 rounded-xl border border-border bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
            {[
              ['Needs', totals.needs],
              ['Wants', totals.wants],
              ['Savings-Debt', totals.sd],
              ['Shopping', transactionSummary.shoppingTotal],
            ].map(([label, value]) => (
              <View key={String(label)} className="flex-row items-center justify-between gap-3">
                <Text className="text-sm text-muted-foreground dark:text-zinc-400">{label}</Text>
                <Text className="text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>{fmtMoney(Number(value))}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text className="px-1 text-xs text-muted-foreground dark:text-zinc-400">Viewing {monthTitle(selectedPid)}. New expenses post to the month of their date.</Text>
      </View>
      {readOnly ? <LockedState monthLabel={monthTitle(selectedPid).split(' ')[0]} testID="activity-closed" /> : null}

      <View role="toolbar" aria-label="Filter costs" className="flex-row flex-wrap gap-2" testID="activity-chips">
        {chipDefs.map((c) => {
          const on = activeChip === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              aria-pressed={on}
              onPress={() => pickChip(c.id)}
              className={cn(
                'h-11 justify-center rounded-full border px-4',
                on ? 'border-primary bg-primary dark:border-zinc-700 dark:bg-zinc-800' : 'border-border bg-background hover:bg-muted dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800'
              )}
            >
              <Text className={cn('text-sm font-medium', on ? 'text-primary-foreground dark:text-zinc-50' : 'text-foreground dark:text-zinc-50')}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {budgetTransactions.length ? (
        <Text className="px-1 text-xs text-muted-foreground dark:text-zinc-400" testID="activity-filtered-count">
          {transactionSummary.filteredCount} of {transactionSummary.count} {transactionSummary.count === 1 ? 'cost' : 'costs'} shown
        </Text>
      ) : null}
      <AppInput value={searchText} onChangeText={setSearchText} placeholder="Search" accessibilityLabel="Search costs" className="h-11" />

      {!txLoaded ? (
        <LoadingState rows={3} testID="activity-loading" />
      ) : !budgetTransactions.length ? (
        <EmptyState icon="receipt" message={`Nothing spent in ${monthTitle(selectedPid).split(' ')[0]} yet.`} testID="activity-empty" />
      ) : !filteredTransactions.length ? (
        <EmptyState
          icon="filter-variant-remove"
          message={`No ${chipDefs.find((c) => c.id === activeChip)?.label ?? ''} costs in ${monthTitle(selectedPid).split(' ')[0]}.`}
          actionLabel="Clear filter"
          onAction={() => {
            pickChip('ALL');
            setSearchText('');
          }}
          testID="activity-empty-filter"
        />
      ) : (
        <View className="gap-4" testID="activity-list">
          {dayGroups.map(([day, rows]) => (
            <ListGroup key={day} title={day === localDateISO() ? 'Today' : day}>
              {rows.map((row) => (
                <ListRow
                  key={row.id}
                  testID={`activity-row-${row.id}`}
                  title={row.name || 'No name'}
                  sub={[groupWord(row.group), accountNameById.get(String((row as any).paidFromAccountId || '')), row.shoppingListName ? 'Shopping' : null, (row as any).receiptId || (row as any).receiptIds?.length ? 'Receipt' : null]
                    .filter(Boolean)
                    .join(' · ')}
                  amount={fmtMoney(transactionSignedBudgetAmount(row))}
                  onPress={() => row.id && openMobileDetail(row.id)}
                />
              ))}
            </ListGroup>
          ))}
        </View>
      )}

      {receiptNotice ? <Text className="text-sm text-muted-foreground">{receiptNotice}</Text> : null}
      <AppModal open={Boolean(mobileDetailId)} onClose={closeMobileDetail} title="Expense" presentation="sheet">
        {mobileDetailRow && mobileDetailEdit ? (
          <View className="gap-3">
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Date</Text>
              <AppInput
                value={mobileDetailEdit.date}
                onChangeText={(value) => setEditField(mobileDetailRow.id!, { date: value })}
                placeholder="YYYY-MM-DD"
                editable={!readOnly}
              />
            </View>
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Budget Item</Text>
              <DropdownField
                value={mobileDetailEdit.categoryId}
                options={mobileBudgetOptions}
                onChange={(value) => {
                  const selected = fundedBudgetOptions.find((row) => row.id === value) || null;
                  setEditField(mobileDetailRow.id!, {
                    name: selected?.name || '',
                    categoryId: selected?.id || '',
                    group: selected?.group || mobileDetailEdit.group,
                  });
                }}
                disabled={readOnly}
                placeholder="Select funded budget item"
                menuStrategy="inline"
              />
            </View>
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Amount</Text>
              <AppInput
                value={mobileDetailEdit.amount}
                onChangeText={(value) => setEditField(mobileDetailRow.id!, { amount: value })}
                keyboardType="decimal-pad"
                placeholder="0.00"
                editable={!readOnly}
              />
            </View>
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Note</Text>
              <AppInput
                value={mobileDetailEdit.note}
                onChangeText={(value) => setEditField(mobileDetailRow.id!, { note: value })}
                placeholder="Optional note"
                editable={!readOnly}
              />
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
              <AppBadge label={mobileDetailBudget?.group || mobileDetailRow.group} variant="outline" />
              {mobileDetailBudget ? (
                <AppBadge label={budgetIsFunded(mobileDetailBudget.id) ? 'Funded' : 'Not funded'} variant={budgetIsFunded(mobileDetailBudget.id) ? 'success' : 'danger'} />
              ) : (
                <AppBadge label="Budget item required" variant="warning" />
              )}
              {mobileDetailEdit.dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
            </View>
            <View className="flex-row flex-wrap items-center justify-end gap-2">
              {!readOnly ? (
                <IconActionButton
                  icon="receipt"
                  label="Attach receipt"
                  onPress={() => {
                    setReceiptFor(mobileDetailRow);
                    closeMobileDetail();
                  }}
                />
              ) : null}
              {!readOnly ? (
                <IconActionButton
                  icon="trash-can-outline"
                  label="Delete transaction"
                  variant="danger"
                  onPress={() => setConfirmDelete(true)}
                />
              ) : null}
              {confirmDelete && !readOnly ? (
                <View testID="activity-delete-confirm" className="w-full basis-full gap-2 rounded-lg border border-destructive p-3">
                  <Text className="text-sm text-foreground dark:text-zinc-50">
                    Delete {fmtMoney(Number(mobileDetailRow.amount || 0))} {mobileDetailRow.name || ''} on {mobileDetailRow.date}? This can&apos;t be undone.
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    <AppButton variant="outline" label="Keep" onPress={() => setConfirmDelete(false)} />
                    <AppButton
                      variant="destructive"
                      label="Delete expense"
                      onPress={async () => {
                        await removeRow(mobileDetailRow.id);
                        setConfirmDelete(false);
                        setMobileDetailId(null);
                      }}
                    />
                  </View>
                </View>
              ) : null}
              {formError ? <Text className="w-full text-sm text-destructive">{formError}</Text> : null}
              <AppButton variant="outline" label="Close" onPress={closeMobileDetail} />
              {!readOnly ? (
                <AppButton
                  label={mobileDetailEdit.saving ? 'Saving...' : 'Save'}
                  onPress={() => saveRow(mobileDetailRow)}
                  disabled={!mobileDetailEdit.dirty || mobileDetailEdit.saving}
                />
              ) : null}
            </View>
          </View>
        ) : (
          <Text className="text-sm text-muted-foreground">No transaction selected.</Text>
        )}
      </AppModal>
      <ReceiptModal
        open={Boolean(receiptFor)}
        onClose={() => setReceiptFor(null)}
        onSaved={(message) => {
          setReceiptNotice(message);
          setReceiptFor(null);
        }}
        ownerUid={uid || ''}
        actorUid={authUser?.uid || ''}
        accounts={receiptAccounts}
        catalog={receiptCatalog}
        prefill={[]}
        linkTo={receiptFor?.id ? { txId: receiptFor.id, date: String(receiptFor.date || ''), amount: Number(receiptFor.amount || 0), name: receiptFor.name } : undefined}
      />
    </ScrollView>
  );
}
