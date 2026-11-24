import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  deletePeriod,
  periodTitleFromId,
  setPeriodStatus,
  setPeriodTitle,
  setTargetPct,
  type PeriodDoc,
  type PeriodStatus,
  watchPeriod,
} from '@/lib/repo/periods';
import { addIncomeItem, deleteIncomeItem, type IncomeItem, updateIncomeItem, watchIncomeItems } from '@/lib/repo/income';
import { addPlanItem, deletePlanItem, type PlanGroup, type PlanItem, updatePlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import { updateExpense, watchExpenses, type ExpenseItem } from '@/lib/repo/expenses';
import {
  deleteAllocation,
  applyAllocationDefaultsForPeriod,
  type Allocation,
  upsertAllocationForBudgetItem,
  watchAllocations,
} from '@/lib/repo/allocations';
import { seedBudgetForNewPeriod, watchRecurring, type Recurring } from '@/lib/repo/recurring';
import { addLinkedPlanLine, APP_CURRENCY, applySuggestedLineAccounts, setLineAccount } from '@/lib/repo/planLines';
import { isLinkedLine, repairReasonText, resolveLineAccount, suggestionForSource, type Resolution } from '@/lib/rules/defaultAccount';
import { createPeriodIfAbsent, watchPeriodState, type PeriodState } from '@/lib/repo/periodCreate';
import { FromYearPlanCard } from '@/components/plan/FromYearPlanCard';
import { monthTitle } from '@/lib/rules/months';
import { fmtMoney, parseMoney, parsePct100 } from '@/lib/format';
import { planGroupLabel, PLAN_GROUP_OPTIONS, planGroupToTag } from '@/lib/groups';
import { cn } from '@/lib/cn';
import { parseTagsInput, tagsToInput } from '@/lib/tags';
import { transactionSignedBudgetAmount } from '@/lib/accounting';

import { addTransactionOnce, newClientId, watchTransactions, type Tx } from '@/lib/repo/transactions';
import { localDateISO } from '@/lib/rules/postingMonth';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { LoadingState } from '@/components/patterns/States';
import { PlanGroupList, type PlanGroupData } from '@/components/plan/PlanGroupList';
import { LineSheet } from '@/components/plan/LineSheet';
import { AddLineSheet } from '@/components/plan/AddLineSheet';
import { IncomeSheet } from '@/components/plan/IncomeSheet';
import { SplitDisclosure } from '@/components/plan/SplitDisclosure';
import { ReconcileBanner } from '@/components/plan/ReconcileBanner';
import { FinishMonthCard } from '@/components/plan/FinishMonthCard';


const RECONCILE_PINNED_GROUP_ORDER: Record<PlanGroup, number> = {
  NEED: 0,
  SAVINGS_DEBT: 1,
  WANT: 2,
};

type PlanWithId = PlanItem & { id: string; priority: number };
type SpendFlag = 'NOT_SPENT' | 'PARTIAL_SPENT' | 'SPENT';
type ReconcileRow = PlanWithId & { funded: number; unfunded: number; fundingOrder: number; spendFlag: SpendFlag; prioritized: boolean };
type SpendingRow = PlanWithId & { spent: number; remaining: number; spendFlag: SpendFlag };
type IncomeEditState = {
  name: string;
  amount: string;
  dirty: boolean;
  saving: boolean;
};
type PlanEditState = {
  name: string;
  tagsInput: string;
  amount: string;
  dirty: boolean;
  saving: boolean;
};

function computeSpendFlag(spent: number, planned: number): SpendFlag {
  const safeSpent = Math.max(0, Number(spent || 0));
  const safePlanned = Math.max(0, Number(planned || 0));
  if (safeSpent <= 0) return 'NOT_SPENT';
  if (safePlanned > 0 && safeSpent >= safePlanned) return 'SPENT';
  return 'PARTIAL_SPENT';
}

export function MonthPlanView({ pid }: { pid: string }) {
  const router = useRouter();
  const uid = useWorkspaceUid();
  const { width } = useWindowDimensions();

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<PeriodStatus>('DRAFT');
  const [periodState, setPeriodState] = useState<PeriodState | null>(null);
  const [templatePending, setTemplatePending] = useState(false);
  const [pNeeds, setPNeeds] = useState('50');
  const [pWants, setPWants] = useState('30');
  const [pSd, setPSd] = useState('20');


  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [incomeEdits, setIncomeEdits] = useState<Record<string, IncomeEditState>>({});
  const [, setIncomeEditingId] = useState<string | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<IncomeItem>({ name: '', amount: 0, active: true });
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [incomeGrossTotal, setIncomeGrossTotal] = useState(0);
  const [incomeFormError, setIncomeFormError] = useState('');

  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [planEdits, setPlanEdits] = useState<Record<string, PlanEditState>>({});
  const [, setPlanEditingId] = useState<string | null>(null);
  const [planTotals, setPlanTotals] = useState({ needs: 0, wants: 0, sd: 0 });
  const [planDraft, setPlanDraft] = useState<PlanItem>({ name: '', amount: 0, group: 'NEED' });
  const [planFormError, setPlanFormError] = useState('');

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [markingSpent, setMarkingSpent] = useState<string | null>(null);

  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
  const [selectedExpenseId, setSelectedExpenseId] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  // BUDG-3 default accounts
  const [recurringRows, setRecurringRows] = useState<Recurring[]>([]);
  const [addAccountId, setAddAccountId] = useState('');
  const [pendingAccountChange, setPendingAccountChange] = useState<{ lineId: string; name: string; group: string; accountId: string; sourceLabel: string } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [defaultsError, setDefaultsError] = useState('');
  const [defaultsBusy, setDefaultsBusy] = useState(false);

  const readOnly = status === 'DECIDED';

  // Viewing a month never creates it (BUDG-1 AC-3): watch existence only.
  useEffect(() => {
    if (!uid || !pid) return;
    return watchPeriodState(uid, pid, setPeriodState);
  }, [uid, pid]);

  useEffect(() => {
    if (!uid || !pid) return;

    const unPeriod = watchPeriod(uid, pid, (period: PeriodDoc) => {
      setTitle(period.title ?? pid);
      setStatus((period.status as PeriodStatus) ?? 'DRAFT');
      setPNeeds(String(Math.round((period.targetPct?.needs ?? 0.5) * 100)));
      setPWants(String(Math.round((period.targetPct?.wants ?? 0.3) * 100)));
      setPSd(String(Math.round((period.targetPct?.sd ?? 0.2) * 100)));
    });

    const unIncome = watchIncomeItems(uid, pid, (rows, activeTotal, grossTotal) => {
      setIncomeItems(rows);
      setIncomeTotal(activeTotal);
      setIncomeGrossTotal(grossTotal);
    });

    const unPlan = watchPlanTotals(uid, pid, (totals, rows) => {
      setPlanTotals(totals);
      setPlanItems(rows);
    });

    const unTx = watchTransactions(uid, pid, setTransactions);

    const unExpenses = watchExpenses(uid, (rows) => {
      setExpenseItems(rows);
      setSelectedExpenseId((prev) => {
        if (prev && rows.some((row) => row.id === prev)) return prev;
        return rows.find((row) => row.active !== false)?.id ?? '';
      });
    });

    const unAlloc = watchAllocations(uid, pid, (rows) => setAllocations(rows));
    const unAccounts = watchAccounts(uid, setAccounts, { includeArchived: true });
    const unRecurring = watchRecurring(uid, setRecurringRows);

    return () => {
      unPeriod();
      unIncome();
      unPlan();
      unTx();
      unExpenses();
      unAlloc();
      unAccounts();
      unRecurring();
    };
  }, [uid, pid]);

  const spentByItemId = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions.forEach((row) => {
      const categoryId = String(row.planItemId || row.categoryId || '').trim();
      if (!categoryId) return;
      totals[categoryId] = (totals[categoryId] || 0) + transactionSignedBudgetAmount(row);
    });
    return totals;
  }, [transactions]);

  const plannedByItemId = useMemo(() => {
    const totals: Record<string, number> = {};
    planItems.forEach((row) => {
      if (!row.id) return;
      totals[row.id] = Number(row.amount || 0);
    });
    return totals;
  }, [planItems]);

  const spendFlagByItemId = useMemo(() => {
    const flags: Record<string, SpendFlag> = {};
    const itemIds = new Set<string>([
      ...Object.keys(plannedByItemId),
      ...Object.keys(spentByItemId),
    ]);
    itemIds.forEach((itemId) => {
      flags[itemId] = computeSpendFlag(
        Number(spentByItemId[itemId] || 0),
        Number(plannedByItemId[itemId] || 0)
      );
    });
    return flags;
  }, [plannedByItemId, spentByItemId]);

  const pct = useMemo(
    () => ({
      needs: parsePct100(pNeeds),
      wants: parsePct100(pWants),
      sd: parsePct100(pSd),
    }),
    [pNeeds, pWants, pSd]
  );

  const autoTargets = useMemo(
    () => ({
      needs: incomeTotal * pct.needs,
      wants: incomeTotal * pct.wants,
      sd: incomeTotal * pct.sd,
    }),
    [incomeTotal, pct]
  );

  const allocationByItemId = useMemo(() => {
    const map: Record<string, Allocation & { id: string }> = {};
    allocations.forEach((row) => {
      if (row.sourceType !== 'PLAN' || !row.sourceItemId || !row.id) return;
      map[row.sourceItemId] = row as Allocation & { id: string };
    });
    return map;
  }, [allocations]);

  const planWithPriority = useMemo<PlanWithId[]>(() => {
    const withId = planItems.filter((row): row is PlanItem & { id: string } => Boolean(row.id));
    return [...withId]
      .map((row, index) => ({ ...row, priority: Number((row as any).priority) || index + 1 }))
      .sort((a, b) => a.priority - b.priority);
  }, [planItems]);

  const spendingRows = useMemo<SpendingRow[]>(
    () =>
      planWithPriority.map((row) => {
        const planned = Number(row.amount || 0);
        const spent = Number(spentByItemId[row.id] || 0);
        return {
          ...row,
          spent,
          remaining: planned - spent,
          spendFlag: spendFlagByItemId[row.id] || 'NOT_SPENT',
        };
      }),
    [planWithPriority, spendFlagByItemId, spentByItemId]
  );

  const totalSpentAcrossBudget = useMemo(
    () => spendingRows.reduce((sum, row) => sum + row.spent, 0),
    [spendingRows]
  );

  useEffect(() => {
    setIncomeEdits((prev) => {
      const next: Record<string, IncomeEditState> = {};
      incomeItems.forEach((row) => {
        if (!row.id) return;
        const existing = prev[row.id];
        if (existing?.dirty || existing?.saving) {
          next[row.id] = existing;
          return;
        }
        next[row.id] = {
          name: row.name || '',
          amount: String(Number(row.amount || 0) || ''),
          dirty: false,
          saving: false,
        };
      });
      return next;
    });
  }, [incomeItems]);

  useEffect(() => {
    setPlanEdits((prev) => {
      const next: Record<string, PlanEditState> = {};
      planWithPriority.forEach((row) => {
        const existing = prev[row.id];
        if (existing?.dirty || existing?.saving) {
          next[row.id] = existing;
          return;
        }
        next[row.id] = {
          name: row.name || '',
          tagsInput: tagsToInput(row.tags),
          amount: String(Number(row.amount || 0) || ''),
          dirty: false,
          saving: false,
        };
      });
      return next;
    });
  }, [planWithPriority]);

  function setIncomeEditField(id: string, patch: Partial<IncomeEditState>) {
    const source = incomeItems.find((row) => row.id === id);
    if (!source) return;
    setIncomeEdits((prev) => {
      const existing =
        prev[id] ||
        ({
          name: source.name || '',
          amount: String(Number(source.amount || 0) || ''),
          dirty: false,
          saving: false,
        } as IncomeEditState);
      const next = { ...existing, ...patch };
      next.dirty =
        next.name.trim() !== String(source.name || '').trim() ||
        Math.max(0, parseMoney(next.amount)) !== Math.max(0, Number(source.amount || 0));
      return { ...prev, [id]: next };
    });
  }

  function setPlanEditField(id: string, patch: Partial<PlanEditState>) {
    const source = planWithPriority.find((row) => row.id === id);
    if (!source) return;
    setPlanEdits((prev) => {
      const existing =
        prev[id] ||
        ({
          name: source.name || '',
          tagsInput: tagsToInput(source.tags),
          amount: String(Number(source.amount || 0) || ''),
          dirty: false,
          saving: false,
        } as PlanEditState);
      const next = { ...existing, ...patch };
      next.dirty =
        next.name.trim() !== String(source.name || '').trim() ||
        tagsToInput(parseTagsInput(next.tagsInput)) !== tagsToInput(source.tags) ||
        Math.max(0, parseMoney(next.amount)) !== Math.max(0, Number(source.amount || 0));
      return { ...prev, [id]: next };
    });
  }

  function resetPlanEditFromSource(id: string) {
    const source = planWithPriority.find((row) => row.id === id);
    if (!source) return;
    setPlanEdits((prev) => ({
      ...prev,
      [id]: {
        name: source.name || '',
        tagsInput: tagsToInput(source.tags),
        amount: String(Number(source.amount || 0) || ''),
        dirty: false,
        saving: false,
      },
    }));
  }

  const fundingOrder = useMemo(() => {
    const rows = [...planWithPriority];
    rows.sort((a, b) => {
      const aSpendFlag = spendFlagByItemId[a.id] || 'NOT_SPENT';
      const bSpendFlag = spendFlagByItemId[b.id] || 'NOT_SPENT';
      const aPrioritized =
        aSpendFlag === 'PARTIAL_SPENT' || (a.reconcilePinned === true && aSpendFlag !== 'SPENT');
      const bPrioritized =
        bSpendFlag === 'PARTIAL_SPENT' || (b.reconcilePinned === true && bSpendFlag !== 'SPENT');
      if (aPrioritized !== bPrioritized) return aPrioritized ? -1 : 1;

      if (aPrioritized && bPrioritized) {
        const groupDiff = RECONCILE_PINNED_GROUP_ORDER[a.group] - RECONCILE_PINNED_GROUP_ORDER[b.group];
        if (groupDiff !== 0) return groupDiff;
      }

      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [planWithPriority, spendFlagByItemId]);

  const reconcileRows = useMemo<ReconcileRow[]>(() => {
    let remaining = incomeTotal;
    return fundingOrder.map((item, index) => {
      const amount = item.amount || 0;
      const funded = Math.min(amount, Math.max(remaining, 0));
      remaining = Math.max(0, remaining - amount);
      const spendFlag = spendFlagByItemId[item.id] || 'NOT_SPENT';
      const prioritized =
        spendFlag === 'PARTIAL_SPENT' || (item.reconcilePinned === true && spendFlag !== 'SPENT');
      return {
        ...item,
        fundingOrder: index + 1,
        funded,
        unfunded: Math.max(0, amount - funded),
        spendFlag,
        prioritized,
      };
    });
  }, [fundingOrder, incomeTotal, spendFlagByItemId]);


  async function saveTitle() {
    if (!uid || !pid || readOnly) return;
    await setPeriodTitle(uid, pid, title.trim());
  }

  async function saveTargets() {
    if (!uid || !pid || readOnly) return;
    await setTargetPct(uid, pid, pct);
  }

  function nextPeriodId(currentPid: string) {
    const [yearRaw, monthRaw] = currentPid.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return currentPid;
    const dt = new Date(year, month - 1, 1);
    dt.setMonth(dt.getMonth() + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  }

  async function closeBudget() {
    if (!uid || !pid || readOnly) return;
    await setPeriodStatus(uid, pid, 'DECIDED');
  }

  async function closeAndStartNextBudget() {
    if (!uid || !pid) return;
    if (!readOnly) await setPeriodStatus(uid, pid, 'DECIDED');

    const nextPid = nextPeriodId(pid);
    const created = await createPeriodIfAbsent(uid, nextPid, { title: periodTitleFromId(nextPid) });
    // Close & Start Next keeps its template seeding, but never reseeds an existing month.
    if (created.created) {
      try {
        await seedBudgetForNewPeriod(uid, nextPid);
        await applyAllocationDefaultsForPeriod(uid, nextPid);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (!String(message).includes('DECIDED')) throw e;
      }
    }
    router.push(`/budgets/${nextPid}`);
  }

  async function addFromTemplates() {
    if (!uid || !pid || readOnly || templatePending) return;
    setTemplatePending(true);
    try {
      await seedBudgetForNewPeriod(uid, pid);
      await applyAllocationDefaultsForPeriod(uid, pid);
    } finally {
      setTemplatePending(false);
    }
  }

  async function createThisMonth() {
    if (!uid || !pid || templatePending) return;
    setTemplatePending(true);
    try {
      await createPeriodIfAbsent(uid, pid);
    } finally {
      setTemplatePending(false);
    }
  }

  async function removeBudget() {
    if (!uid || !pid) return;

    const performDelete = async () => {
      await deletePeriod(uid, pid);
      router.replace('/budgets');
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm(`Delete the ${monthTitle(String(pid))} plan and everything in it? This cannot be undone.`);
      if (!ok) return;
      await performDelete();
      return;
    }

    Alert.alert('Delete plan', `Delete the ${monthTitle(String(pid))} plan and everything in it? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void performDelete() },
    ]);
  }

  async function addIncomeRow(): Promise<boolean> {
    if (!uid || !pid || readOnly) return false;
    if (!incomeDraft.name.trim()) {
      setIncomeFormError('Income source name is required.');
      return false;
    }
    if (incomeDraft.amount <= 0) {
      setIncomeFormError('Income amount must be greater than 0.');
      return false;
    }
    await addIncomeItem(uid, pid, {
      name: incomeDraft.name.trim(),
      amount: incomeDraft.amount,
      active: incomeDraft.active !== false,
    });
    setIncomeDraft({ name: '', amount: 0, active: true });
    setIncomeFormError('');
    return true;
  }

  async function saveIncomeRow(item: IncomeItem) {
    if (!uid || !pid || readOnly || !item.id) return;
    const edit = incomeEdits[item.id];
    if (!edit) return;
    const name = edit.name.trim();
    const amount = Math.max(0, parseMoney(edit.amount));
    if (!name) {
      setIncomeFormError('Income source name is required.');
      return;
    }
    if (amount <= 0) {
      setIncomeFormError('Income amount must be greater than 0.');
      return;
    }
    setIncomeEdits((prev) => ({ ...prev, [item.id!]: { ...edit, saving: true } }));
    try {
      await updateIncomeItem(uid, pid, item.id, {
        name,
        amount,
        active: item.active !== false,
      });
      setIncomeEdits((prev) => ({
        ...prev,
        [item.id!]: {
          ...edit,
          name,
          amount: String(amount || ''),
          dirty: false,
          saving: false,
        },
      }));
      setIncomeEditingId((prev) => (prev === item.id ? null : prev));
      setIncomeFormError('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setIncomeFormError(message || 'Could not save income row.');
      setIncomeEdits((prev) => ({ ...prev, [item.id!]: { ...edit, saving: false } }));
    }
  }

  async function toggleIncomeActive(item: IncomeItem, active: boolean) {
    if (!uid || !pid || readOnly || !item.id) return;
    const previous = item.active !== false;
    setIncomeItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, active } : row)));
    try {
      await updateIncomeItem(uid, pid, item.id, { active });
    } catch {
      setIncomeItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, active: previous } : row)));
      Alert.alert('Update failed', 'Could not update the income active state. Please retry.');
    }
  }

  async function deleteIncomeRow(id?: string) {
    if (!uid || !pid || readOnly || !id) return;
    await deleteIncomeItem(uid, pid, id);
    setIncomeEditingId((prev) => (prev === id ? null : prev));
  }

  async function addPlanRow(): Promise<boolean> {
    if (!uid || !pid || readOnly) return false;
    if (!planDraft.name.trim()) {
      setPlanFormError('Plan item name is required.');
      return false;
    }
    if (planDraft.amount <= 0) {
      setPlanFormError('Plan amount must be greater than 0.');
      return false;
    }

    const nextPriority = planWithPriority.reduce((max, row) => Math.max(max, row.priority), 0) + 1;
    await addPlanItem(uid, pid, {
      name: planDraft.name.trim(),
      amount: planDraft.amount,
      group: planDraft.group,
      tags: planDraft.tags ?? [],
      priority: nextPriority as any,
    } as any);

    setPlanDraft({ name: '', amount: 0, group: planDraft.group });
    setPlanFormError('');
    return true;
  }

  async function addExpenseTemplateToPlan(): Promise<boolean> {
    if (!uid || !pid || readOnly || !selectedExpenseId) return false;
    const selected = expenseItems.find((row) => row.id === selectedExpenseId);
    if (!selected) return false;
    const nextPriority = planWithPriority.reduce((max, row) => Math.max(max, row.priority), 0) + 1;
    const suggestion = suggestionForSource(selected, accounts, APP_CURRENCY);
    setDefaultsError('');
    try {
      // BUDG-3: stable link exp_{expenseItemId}; pressing Add is the explicit act that applies the account.
      const result = await addLinkedPlanLine(uid, pid, {
        expenseItemId: selectedExpenseId,
        name: selected.name,
        amount: selected.amount,
        group: selected.group as string,
        tags: selected.tags ?? [],
        priority: nextPriority,
        accountId: addAccountId,
        suggestedAccountId: suggestion.accountId,
      });
      if (!result.created) {
        setDefaultsError(`${selected.name} is already in this month.`);
        return false;
      }
    } catch (e: unknown) {
      setDefaultsError(e instanceof Error ? e.message : String(e));
      return false;
    }

    // Deactivate from expenses templates
    await updateExpense(uid, selectedExpenseId, { active: false });
    return true;
  }

  async function savePlanRow(item: PlanWithId): Promise<boolean> {
    if (!uid || !pid || readOnly || !item.id) return false;
    const edit = planEdits[item.id];
    if (!edit) return false;
    const name = edit.name.trim();
    const amount = Math.max(0, parseMoney(edit.amount));
    const tags = parseTagsInput(edit.tagsInput);
    if (!name) {
      setPlanFormError('Plan item name is required.');
      return false;
    }
    if (amount <= 0) {
      setPlanFormError('Plan amount must be greater than 0.');
      return false;
    }
    setPlanEdits((prev) => ({ ...prev, [item.id!]: { ...edit, saving: true } }));
    try {
      await updatePlanItem(uid, pid, item.id, {
        name,
        amount,
        group: item.group,
        tags,
        priority: item.priority as any,
      } as any);
      setPlanEdits((prev) => ({
        ...prev,
        [item.id!]: {
          ...edit,
          name,
          amount: String(amount || ''),
          tagsInput: tagsToInput(tags),
          dirty: false,
          saving: false,
        },
      }));
      setPlanEditingId((prev) => (prev === item.id ? null : prev));
      setPlanFormError('');
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setPlanFormError(message || 'Could not save plan row.');
      setPlanEdits((prev) => ({ ...prev, [item.id!]: { ...edit, saving: false } }));
      return false;
    }
  }

  async function deletePlanRow(id?: string) {
    if (!uid || !pid || readOnly || !id) return;
    await deletePlanItem(uid, pid, id);
    const existingAllocation = allocationByItemId[id];
    if (existingAllocation?.id) await deleteAllocation(uid, pid, existingAllocation.id);
    setPlanEditingId((prev) => (prev === id ? null : prev));
  }

  async function toggleReconcilePinned(item: ReconcileRow, enabled: boolean) {
    if (!uid || !pid || readOnly) return;
    if (item.spendFlag === 'SPENT') return;
    await updatePlanItem(uid, pid, item.id, { reconcilePinned: enabled } as any);
  }

  /** BUDG-3: linked lines ask "only this month" vs "future default"; unlinked lines keep assignAccount (AC-5). */
  function pickAccount(item: PlanWithId, accountId: string) {
    if (!uid || !pid || readOnly) return;
    const line = planItems.find((row) => row.id === item.id);
    if (!line || !isLinkedLine(line)) {
      void assignAccount(item, accountId);
      return;
    }
    if ((line.plannedAccountId || '') === accountId) return;
    const source = sourceFor(line);
    setDefaultsError('');
    setPendingAccountChange({
      lineId: item.id,
      name: item.name,
      group: String(item.group),
      accountId,
      sourceLabel: line.sourceType === 'RECURRING' ? `template "${source?.name ?? item.name}"` : `"${source?.name ?? item.name}"`,
    });
  }

  async function confirmAccountChange(scope: 'LINE' | 'FUTURE') {
    if (!uid || !pid || !pendingAccountChange) return;
    setDefaultsBusy(true);
    try {
      await setLineAccount(uid, pid, { lineId: pendingAccountChange.lineId, accountId: pendingAccountChange.accountId, scope, group: pendingAccountChange.group });
      setPendingAccountChange(null);
    } catch (e: unknown) {
      setDefaultsError(e instanceof Error ? e.message : String(e));
    } finally {
      setDefaultsBusy(false);
    }
  }

  async function applyAllSuggestions() {
    if (!uid || !pid || readOnly) return;
    setDefaultsBusy(true);
    try {
      const result = await applySuggestedLineAccounts(uid, pid, suggestedLines.map((row) => row.line.id!));
      setDefaultsError(result.skipped.length ? `${result.skipped.length} line(s) skipped: choose their account.` : '');
      setReviewOpen(false);
    } catch (e: unknown) {
      setDefaultsError(e instanceof Error ? e.message : String(e));
    } finally {
      setDefaultsBusy(false);
    }
  }

  async function assignAccount(item: PlanWithId, accountId: string) {
    if (!uid || !pid || readOnly) return;
    const existing = allocationByItemId[item.id];

    if (!accountId) {
      if (existing?.id) await deleteAllocation(uid, pid, existing.id);
      await updatePlanItem(uid, pid, item.id, { plannedAccountId: '' } as any);
      return;
    }

    await upsertAllocationForBudgetItem(uid, pid, {
      sourceType: 'PLAN',
      sourceItemId: item.id,
      sourceItemName: item.name,
      accountId,
      amount: item.amount,
      tag: planGroupToTag(item.group),
      note: existing?.note ?? '',
    });
    await updatePlanItem(uid, pid, item.id, { plannedAccountId: accountId } as any);
  }

  const markSpentIdRef = useRef('');
  async function markSpent(row: ReconcileRow) {
    if (!uid || !pid || !row.id) return;
    const allocation = allocationByItemId[row.id];
    if (!allocation) {
      Alert.alert('No account assigned', 'Please assign an account to this item before marking as spent.');
      return;
    }
    const alreadySpent = Math.max(0, Number(spentByItemId[row.id] || 0));
    const remainingToPlanned = Math.max(0, Number(row.amount || 0) - alreadySpent);
    if (remainingToPlanned <= 0) {
      Alert.alert('Already spent', `${row.name} is already fully spent.`);
      return;
    }
    const spentAmount = Math.min(Math.max(0, Number(row.funded || 0)), remainingToPlanned);
    if (spentAmount <= 0) return;

    setMarkingSpent(row.id);
    try {
      // BUDG-40 AC-3 (F-4, F-7): written once under this line sheet's id (a double tap or retry is a no-op),
      // never into a DECIDED month, dated the local day (not the UTC day) into the viewed month.
      if (!markSpentIdRef.current) markSpentIdRef.current = newClientId();
      const created = await addTransactionOnce(uid, pid, markSpentIdRef.current, {
        name: row.name,
        amount: spentAmount,
        group: row.group,
        date: localDateISO(),
        paidFromAccountId: allocation.accountId,
        accountId: allocation.accountId,
        planItemId: row.id,
        categoryId: row.id,
        note: `Spent from budget: ${row.name}`,
      } as any);
      markSpentIdRef.current = newClientId(); // recorded: a further tap in this sheet is a new expense
      if (!created) Alert.alert('Already recorded', `${row.name} was already marked as spent.`);
      else if (spentAmount >= remainingToPlanned) Alert.alert('Transaction recorded', `${row.name} marked as spent.`);
      else Alert.alert('Transaction recorded', `${row.name} marked as partial spent.`);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not record transaction.');
    } finally {
      setMarkingSpent(null);
    }
  }

  const accountOptions = useMemo(
    () => [
      { label: 'Unassigned', value: '' },
      ...accounts
        .filter((row): row is Account & { id: string } => Boolean(row.id))
        .map((row) => ({
          label: row.archived ? `${row.name} (archived)` : row.name,
          value: row.id,
        })),
    ],
    [accounts]
  );

  const expenseOptions = useMemo(
    () =>
      expenseItems
        .filter((row): row is ExpenseItem & { id: string } => Boolean(row.id))
        .filter((row) => row.active !== false)
        .map((row) => ({
          label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${planGroupLabel(row.group as any)}`,
          value: row.id,
        })),
    [expenseItems]
  );

  // BUDG-3: sources by doc id (never by name) and per-line resolution.
  const sourceFor = (line: PlanItem): { name: string; defaultAccountId?: string } | null => {
    if (line.sourceType === 'EXPENSE_ITEM') return expenseItems.find((row) => row.id === line.sourceId) ?? null;
    if (line.sourceType === 'RECURRING') return recurringRows.find((row) => row.id === line.sourceId) ?? null;
    return null;
  };

  const resolutionByLineId = useMemo(() => {
    const map: Record<string, Resolution> = {};
    planItems.forEach((line) => {
      if (!line.id) return;
      map[line.id] = resolveLineAccount({ line, source: sourceFor(line), accounts, appCurrency: APP_CURRENCY });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planItems, expenseItems, recurringRows, accounts]);

  const accountName = (id: string) => accounts.find((row) => row.id === id)?.name ?? 'Unknown account';

  const suggestedLines = useMemo(
    () =>
      planItems
        .filter((line) => line.id && resolutionByLineId[line.id]?.kind === 'SUGGEST')
        .map((line) => ({ line, accountId: (resolutionByLineId[line.id!] as { accountId: string }).accountId })),
    [planItems, resolutionByLineId]
  );
  const repairLines = useMemo(
    () => planItems.filter((line) => line.id && resolutionByLineId[line.id]?.kind === 'REPAIR'),
    [planItems, resolutionByLineId]
  );

  const selectedExpense = expenseItems.find((row) => row.id === selectedExpenseId) ?? null;
  const addSuggestion = suggestionForSource(selectedExpense, accounts, APP_CURRENCY);
  useEffect(() => {
    setAddAccountId(addSuggestion.accountId);
  }, [selectedExpenseId, addSuggestion.accountId]);

  const eligibleAccountOptions = useMemo(
    () => [
      { label: 'No account', value: '' },
      ...accounts
        .filter((row): row is Account & { id: string } => Boolean(row.id) && !row.archived)
        .map((row) => ({ label: row.name, value: row.id })),
    ],
    [accounts]
  );


  const plannedTotal = planTotals.needs + planTotals.wants + planTotals.sd;
  const unallocatedTotal = incomeTotal - plannedTotal;
  const inactiveIncomeTotal = Math.max(0, incomeGrossTotal - incomeTotal);

  const groupDotColor: Record<PlanGroup, string> = {
    NEED: 'bg-needs',
    WANT: 'bg-wants',
    SAVINGS_DEBT: 'bg-savings',
  };


  // ---- BUDG-8 S5: layout state only; every write below goes through the handlers above, unchanged. ----
  const monthLabel = monthTitle(String(pid));
  const nextLabel = monthTitle(nextPeriodId(String(pid)));
  const wide = width >= 1024;
  const lineSheet = useSheet();
  const incomeSheet = useSheet();
  const addSheet = useSheet();
  const [lineId, setLineId] = useState<string | null>(null);
  const [planAmountText, setPlanAmountText] = useState('');
  const [planTagsText, setPlanTagsText] = useState('');
  const [incomeAmountText, setIncomeAmountText] = useState('');

  const lineRow = lineId ? spendingRows.find((row) => row.id === lineId) ?? null : null;
  const lineReconcile = lineId ? reconcileRows.find((row) => row.id === lineId) ?? null : null;
  const lineResolution = lineId ? resolutionByLineId[lineId] : undefined;
  const lineAllocation = lineId ? allocationByItemId[lineId] : undefined;
  const lineSpentCount = lineId ? transactions.filter((tx) => String(tx.planItemId || tx.categoryId || '').trim() === lineId).length : 0;
  // Same amount markSpent() records: what is funded, capped at what is left of the plan.
  const markAmount = lineReconcile
    ? Math.min(
        Math.max(0, Number(lineReconcile.funded || 0)),
        Math.max(0, Number(lineReconcile.amount || 0) - Math.max(0, Number(spentByItemId[lineReconcile.id] || 0)))
      )
    : 0;

  function openLine(id: string, e?: unknown) {
    markSpentIdRef.current = newClientId(); // one Mark as spent id per opened line sheet
    resetPlanEditFromSource(id);
    setPlanEditingId(id);
    setPlanFormError('');
    setDefaultsError('');
    setLineId(id);
    lineSheet.show(e);
  }

  function pickLineAccount(accountId: string) {
    if (!lineRow) return;
    const line = planItems.find((row) => row.id === lineRow.id);
    if (line && isLinkedLine(line) && (line.plannedAccountId || '') !== accountId) {
      // "Only this month / Also use for future months" opens once the line sheet has closed.
      const target = lineRow;
      lineSheet.hide(() => pickAccount(target, accountId));
      return;
    }
    pickAccount(lineRow, accountId);
  }

  async function saveLine() {
    if (!lineRow) return;
    if (await savePlanRow(lineRow)) lineSheet.hide();
  }

  function removeLine() {
    if (!lineRow) return;
    const id = lineRow.id;
    const message = `Remove ${lineRow.name} from ${monthLabel}? This cannot be undone.`;
    const run = () => lineSheet.hide(() => void deletePlanRow(id));
    if (Platform.OS === 'web') {
      if (window.confirm(message)) run();
      return;
    }
    Alert.alert('Remove line', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run },
    ]);
  }

  function openAdd(group: string, e?: unknown) {
    setPlanDraft((prev) => ({ ...prev, group: group as PlanGroup }));
    setPlanFormError('');
    setDefaultsError('');
    addSheet.show(e);
  }

  async function addLine() {
    if (!(await addPlanRow())) return;
    setPlanAmountText('');
    setPlanTagsText('');
    addSheet.hide();
  }

  async function addCost() {
    if (await addExpenseTemplateToPlan()) addSheet.hide();
  }

  async function addIncome() {
    if (await addIncomeRow()) setIncomeAmountText('');
  }

  const ADD_LABEL: Record<PlanGroup, string> = { NEED: 'Add a need', WANT: 'Add a want', SAVINGS_DEBT: 'Add savings or debt' };
  const groups: PlanGroupData[] = PLAN_GROUP_OPTIONS.map((group) => ({
    value: group.value,
    label: group.label,
    dotClass: groupDotColor[group.value as PlanGroup],
    addLabel: ADD_LABEL[group.value as PlanGroup],
    rows: spendingRows
      .filter((row) => row.group === group.value)
      .map((row) => {
        const res = resolutionByLineId[row.id];
        const note =
          res?.kind === 'SUGGEST' && !readOnly
            ? `Suggested: ${accountName((res as { accountId: string }).accountId)}`
            : row.plannedAccountId
              ? `Paid from ${accountName(row.plannedAccountId)}`
              : undefined;
        return { id: row.id, name: row.name, planned: Number(row.amount || 0), spent: row.spent, note, needsAccount: res?.kind === 'REPAIR' && !readOnly };
      }),
  }));

  if (!periodState) {
    return (
      <View testID="plan-loading" className="mx-auto w-full gap-4 md:max-w-2xl">
        <LoadingState />
        <LoadingState rows={2} />
      </View>
    );
  }

  // Viewing a month never creates it (BUDG-1 AC-3): Create is an explicit tap.
  if (!periodState.exists) {
    return (
      <ScrollView className="flex-1" contentContainerClassName="pb-8">
        <View testID="plan-not-started" className="mx-auto w-full gap-4 md:max-w-2xl">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text accessibilityRole="header" className="text-xl font-bold text-foreground dark:text-zinc-50">{monthLabel}</Text>
            <AppBadge label="Not started" variant="secondary" />
          </View>
          <View className="items-center gap-3 rounded-xl border border-border bg-card px-4 py-8 dark:border-zinc-800 dark:bg-zinc-900">
            <MaterialCommunityIcons name="calendar-blank-outline" size={32} color="#717182" />
            <Text className="text-center text-base text-foreground dark:text-zinc-50">There is no budget for this month yet. Creating it starts a blank draft.</Text>
            <AppButton label={`Create ${monthLabel} draft`} size="touch" onPress={createThisMonth} disabled={templatePending} />
          </View>
        </View>
      </ScrollView>
    );
  }

  const figure = (label: string, value: string) => (
    <View className="min-h-8 flex-row items-center gap-3">
      <Text className="min-w-0 flex-1 text-sm text-muted-foreground dark:text-zinc-400">{label}</Text>
      <Text className="shrink-0 text-base font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );

  const header = (
    <View className="gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text accessibilityRole="header" className="text-xl font-bold text-foreground dark:text-zinc-50">{title && title !== pid ? title : monthLabel}</Text>
        <AppBadge label={readOnly ? 'Closed' : 'Open'} variant={readOnly ? 'secondary' : 'success'} />
      </View>
      <Text className="text-sm text-muted-foreground dark:text-zinc-400">
        {readOnly ? 'This month is closed. You can look, but not change it.' : 'You can still change this month.'}
      </Text>
    </View>
  );

  const summary = (
    <View testID="plan-summary" className="gap-1 rounded-xl border border-border bg-card p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-900">
      {figure('Income', fmtMoney(incomeTotal))}
      {figure('Planned', fmtMoney(plannedTotal))}
      {figure('Spent so far', fmtMoney(totalSpentAcrossBudget))}
      <View className="mt-1 min-h-11 flex-row items-center gap-3 border-t border-border pt-2 dark:border-zinc-800">
        <Text className="min-w-0 flex-1 text-base font-medium text-foreground dark:text-zinc-50">
          {unallocatedTotal >= 0 ? 'Not planned yet' : 'Planned beyond income'}
        </Text>
        <Text
          className={cn('shrink-0 text-xl font-bold', unallocatedTotal >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive dark:text-red-300')}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {fmtMoney(Math.abs(unallocatedTotal))}
        </Text>
      </View>
      <SplitDisclosure
        readOnly={readOnly}
        planned={planTotals}
        targetPct={pct}
        targetAmounts={autoTargets}
        title={title}
        onTitle={setTitle}
        onSaveTitle={() => void saveTitle()}
        pctInputs={{ needs: pNeeds, wants: pWants, sd: pSd }}
        onPct={(key, v) => (key === 'needs' ? setPNeeds(v) : key === 'wants' ? setPWants(v) : setPSd(v))}
        onSaveTargets={() => void saveTargets()}
      />
    </View>
  );

  const banner = (
    <ReconcileBanner
      suggested={suggestedLines.length}
      repair={repairLines.length}
      error={addSheet.open || lineSheet.open ? '' : defaultsError}
      readOnly={readOnly}
      onReview={() => setReviewOpen(true)}
    />
  );

  const yearPlan =
    uid && pid && !readOnly ? (
      <FromYearPlanCard
        uid={uid}
        pid={pid}
        periodExists={Boolean(periodState?.exists)}
        status={status}
        planItems={planItems}
        accounts={accounts}
        expenses={expenseItems}
        nextPriority={planWithPriority.reduce((max, row) => Math.max(max, row.priority), 0) + 1}
      />
    ) : null;

  // A blank month: nothing is copied until this tap (BUDG-1: "Add from templates" separate from Create).
  const blankStart =
    !readOnly && !planItems.length ? (
      <View testID="start-from-regular" className="gap-3 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Start from your regular costs</Text>
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`${monthLabel} is blank. Copy your repeats in once, or add lines yourself below.`}</Text>
        <AppButton
          label={templatePending ? 'Adding…' : 'Add regular costs'}
          size="touch"
          className="self-start"
          onPress={addFromTemplates}
          disabled={templatePending}
        />
      </View>
    ) : null;

  const incomeRow = (
    <ListGroup title="Money coming in">
      <ListRow
        testID="income-row"
        title="Income"
        sub={`${incomeItems.length} ${incomeItems.length === 1 ? 'source' : 'sources'}${inactiveIncomeTotal > 0 ? ` · ${fmtMoney(inactiveIncomeTotal)} switched off` : ''}`}
        amount={fmtMoney(incomeTotal)}
        onPress={incomeSheet.show}
      />
    </ListGroup>
  );

  const finish = (
    <FinishMonthCard
      monthLabel={monthLabel}
      nextLabel={nextLabel}
      readOnly={readOnly}
      onCloseMonth={closeBudget}
      onCloseAndStart={closeAndStartNextBudget}
      onDelete={() => void removeBudget()}
    />
  );

  return (
    <ScrollView className="flex-1" contentContainerClassName="pb-8">
      <View testID="month-plan" className="mx-auto w-full gap-6 md:max-w-2xl lg:max-w-none lg:flex-row lg:items-start">
        <View className="min-w-0 gap-6 lg:flex-[2]">
          {header}
          {wide ? null : (
            <>
              {summary}
              {banner}
            </>
          )}
          {blankStart}
          <PlanGroupList groups={groups} wide={wide} readOnly={readOnly} onOpenLine={openLine} onAddLine={openAdd} />
          {incomeRow}
          {wide ? null : yearPlan}
          {wide ? null : finish}
        </View>
        {wide ? (
          <View className="min-w-0 gap-6 lg:flex-1">
            {summary}
            {banner}
            {yearPlan}
            {finish}
          </View>
        ) : null}
      </View>

      <LineSheet
        open={lineSheet.open && Boolean(lineRow)}
        onClose={() => lineSheet.hide()}
        monthLabel={monthLabel}
        readOnly={readOnly}
        line={lineRow ? { id: lineRow.id, name: lineRow.name, amount: Number(lineRow.amount || 0) } : null}
        spent={lineRow?.spent ?? 0}
        spentCount={lineSpentCount}
        edit={lineId ? planEdits[lineId] ?? null : null}
        onEdit={(patch) => {
          if (lineId) setPlanEditField(lineId, patch);
        }}
        onSave={() => void saveLine()}
        accountId={lineRow?.plannedAccountId || ''}
        accountLabel={lineRow?.plannedAccountId ? accountName(lineRow.plannedAccountId) : 'No account'}
        accountOptions={accountOptions}
        onPickAccount={pickLineAccount}
        accountHint={
          lineResolution?.kind === 'SUGGEST' ? `Suggested: ${accountName((lineResolution as { accountId: string }).accountId)} · Review applies it` : undefined
        }
        repairText={lineResolution?.kind === 'REPAIR' ? repairReasonText((lineResolution as { reason: any }).reason) : undefined}
        markSpent={
          lineReconcile && lineAllocation && markAmount > 0
            ? {
                amount: markAmount,
                accountName: accountName(lineAllocation.accountId),
                date: localDateISO(),
                busy: markingSpent === lineReconcile.id,
                onPress: () => void markSpent(lineReconcile),
              }
            : null
        }
        pinned={
          lineReconcile
            ? {
                value: lineReconcile.reconcilePinned === true,
                disabled: lineReconcile.spendFlag === 'SPENT',
                onChange: (value) => void toggleReconcilePinned(lineReconcile, value),
              }
            : null
        }
        onRemove={removeLine}
        onOpenActivity={() => lineSheet.hide(() => router.push(`/transactions?month=${pid}` as any))}
        error={planFormError || defaultsError}
      />

      <AddLineSheet
        open={addSheet.open}
        onClose={() => addSheet.hide()}
        monthLabel={monthLabel}
        groupOptions={PLAN_GROUP_OPTIONS}
        draft={{ name: planDraft.name, amount: planAmountText, group: planDraft.group, tags: planTagsText }}
        onDraft={(patch) => {
          if (patch.name !== undefined) setPlanDraft((prev) => ({ ...prev, name: patch.name as string }));
          if (patch.amount !== undefined) {
            setPlanAmountText(patch.amount);
            setPlanDraft((prev) => ({ ...prev, amount: parseMoney(patch.amount as string) }));
          }
          if (patch.group !== undefined) setPlanDraft((prev) => ({ ...prev, group: patch.group as PlanGroup }));
          if (patch.tags !== undefined) {
            setPlanTagsText(patch.tags);
            setPlanDraft((prev) => ({ ...prev, tags: parseTagsInput(patch.tags as string) }));
          }
        }}
        onAddLine={() => void addLine()}
        formError={planFormError}
        costOptions={expenseOptions}
        costId={selectedExpenseId}
        onCost={setSelectedExpenseId}
        costAccountOptions={eligibleAccountOptions}
        costAccountId={addAccountId}
        onCostAccount={setAddAccountId}
        costHint={
          selectedExpense && addSuggestion.accountId
            ? addAccountId === addSuggestion.accountId
              ? `Default for ${selectedExpense.name}: ${accountName(addSuggestion.accountId)}`
              : `Only this line · default stays ${accountName(addSuggestion.accountId)}`
            : undefined
        }
        costRepair={selectedExpense && addSuggestion.reason ? `${repairReasonText(addSuggestion.reason)} · choose an account` : undefined}
        onAddCost={() => void addCost()}
        costError={defaultsError}
        onAddFromTemplates={() => addSheet.hide(() => void addFromTemplates())}
        templatePending={templatePending}
      />

      <IncomeSheet
        open={incomeSheet.open}
        onClose={() => incomeSheet.hide()}
        monthLabel={monthLabel}
        readOnly={readOnly}
        items={incomeItems}
        edits={incomeEdits}
        activeTotal={incomeTotal}
        pausedTotal={inactiveIncomeTotal}
        onEdit={(id, patch) => setIncomeEditField(id, patch)}
        onSave={(item) => void saveIncomeRow(item as IncomeItem)}
        onToggle={(item, value) => void toggleIncomeActive(item as IncomeItem, value)}
        onRemove={(id) => void deleteIncomeRow(id)}
        draft={{ name: incomeDraft.name, amount: incomeAmountText }}
        onDraft={(patch) => {
          if (patch.name !== undefined) setIncomeDraft((prev) => ({ ...prev, name: patch.name as string }));
          if (patch.amount !== undefined) {
            setIncomeAmountText(patch.amount);
            setIncomeDraft((prev) => ({ ...prev, amount: parseMoney(patch.amount as string) }));
          }
        }}
        onAdd={() => void addIncome()}
        error={incomeFormError}
      />

      <AppSheet open={Boolean(pendingAccountChange)} onClose={() => setPendingAccountChange(null)} title="Use this account for" testID="account-choice-sheet">
        {pendingAccountChange ? (
          <View className="gap-3">
            <Text className="text-base text-foreground dark:text-zinc-50">
              {`${pendingAccountChange.name} → ${pendingAccountChange.accountId ? accountName(pendingAccountChange.accountId) : 'No account'}`}
            </Text>
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">Nothing is posted or transferred. Other months, locked budgets and posted expenses stay as they are.</Text>
            <AppButton label="Only this month" size="touch" onPress={() => confirmAccountChange('LINE')} disabled={defaultsBusy} />
            <AppButton
              label="Also use for future months"
              variant="outline"
              size="touch"
              onPress={() => confirmAccountChange('FUTURE')}
              disabled={defaultsBusy || !pendingAccountChange.accountId}
            />
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`Future months: new lines from ${pendingAccountChange.sourceLabel} will suggest this account.`}</Text>
            {defaultsError ? <Text className="text-sm text-destructive dark:text-red-300">{defaultsError}</Text> : null}
            <AppButton label="Cancel" variant="ghost" size="touch" onPress={() => setPendingAccountChange(null)} />
          </View>
        ) : null}
      </AppSheet>

      <AppSheet open={reviewOpen} onClose={() => setReviewOpen(false)} title="Apply suggested accounts" testID="review-sheet">
        <View className="gap-3">
          {suggestedLines.map(({ line, accountId }) => (
            <View key={line.id} className="min-h-12 flex-row flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 dark:border-zinc-800">
              <Text className="min-w-0 flex-1 text-base text-foreground dark:text-zinc-50" numberOfLines={1}>{line.name}</Text>
              <Text className="shrink-0 text-base font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>{fmtMoney(line.amount || 0)}</Text>
              <Text className="w-full text-sm text-muted-foreground dark:text-zinc-400">{accountName(accountId)}</Text>
            </View>
          ))}
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Each line earmarks its amount in that account, as choosing an account does today. Nothing is posted.</Text>
          <AppButton label={defaultsBusy ? 'Applying…' : 'Apply all'} size="touch" onPress={applyAllSuggestions} disabled={defaultsBusy || !suggestedLines.length} />
          <AppButton label="Cancel" variant="ghost" size="touch" onPress={() => setReviewOpen(false)} />
        </View>
      </AppSheet>
    </ScrollView>
  );
}
