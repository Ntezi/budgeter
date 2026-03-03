import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppModal } from '@/components/ui/AppModal';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  deletePeriod,
  createPeriod,
  getOrCreatePeriod,
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
import { seedBudgetForNewPeriod } from '@/lib/repo/recurring';
import { fmtMoney, parseMoney, parsePct100 } from '@/lib/format';
import { planGroupLabel, PLAN_GROUP_OPTIONS, planGroupToTag } from '@/lib/groups';
import { cn } from '@/lib/cn';
import { parseTagsInput, tagsLabel, tagsToInput } from '@/lib/tags';

import { addTransaction, watchTransactions, type Tx } from '@/lib/repo/transactions';

const SECTION_OPTIONS = [
  { label: 'Income', value: 'INCOME' },
  { label: 'Spending Plan', value: 'PLAN' },
  { label: 'Spending Details', value: 'SPENDING' },
  { label: 'Reconcile', value: 'RECONCILE' },
] as const;

const RECONCILE_PINNED_GROUP_ORDER: Record<PlanGroup, number> = {
  NEED: 0,
  SAVINGS_DEBT: 1,
  WANT: 2,
};

type SectionKey = (typeof SECTION_OPTIONS)[number]['value'];
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

export default function BudgetDetailScreen() {
  const { pid } = useLocalSearchParams<{ pid: string }>();
  const router = useRouter();
  const uid = useWorkspaceUid();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<PeriodStatus>('DRAFT');
  const [pNeeds, setPNeeds] = useState('50');
  const [pWants, setPWants] = useState('30');
  const [pSd, setPSd] = useState('20');

  const [section, setSection] = useState<SectionKey>('PLAN');
  const [metaVisible, setMetaVisible] = useState(false);
  const [mobileDetail, setMobileDetail] = useState<{ section: SectionKey; id: string } | null>(null);

  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [incomeEdits, setIncomeEdits] = useState<Record<string, IncomeEditState>>({});
  const [incomeEditingId, setIncomeEditingId] = useState<string | null>(null);
  const [incomeDraft, setIncomeDraft] = useState<IncomeItem>({ name: '', amount: 0, active: true });
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [incomeGrossTotal, setIncomeGrossTotal] = useState(0);
  const [incomeFormError, setIncomeFormError] = useState('');

  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [planEdits, setPlanEdits] = useState<Record<string, PlanEditState>>({});
  const [planEditingId, setPlanEditingId] = useState<string | null>(null);
  const [planTotals, setPlanTotals] = useState({ needs: 0, wants: 0, sd: 0 });
  const [planDraft, setPlanDraft] = useState<PlanItem>({ name: '', amount: 0, group: 'NEED' });
  const [planFormError, setPlanFormError] = useState('');

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [markingSpent, setMarkingSpent] = useState<string | null>(null);

  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
  const [selectedExpenseId, setSelectedExpenseId] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);

  const readOnly = status === 'DECIDED';

  useEffect(() => {
    if (!uid || !pid) return;

    getOrCreatePeriod(uid, pid);

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

    return () => {
      unPeriod();
      unIncome();
      unPlan();
      unTx();
      unExpenses();
      unAlloc();
      unAccounts();
    };
  }, [uid, pid]);

  const spentByItemId = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions.forEach((row) => {
      const categoryId = String(row.categoryId || '').trim();
      if (!categoryId) return;
      totals[categoryId] = (totals[categoryId] || 0) + Number(row.amount || 0);
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

  const spentItemIds = useMemo(() => {
    const out = new Set<string>();
    Object.entries(spendFlagByItemId).forEach(([itemId, flag]) => {
      if (flag === 'SPENT') out.add(itemId);
    });
    return out;
  }, [spendFlagByItemId]);

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

  const spendingByGroup = useMemo(() => {
    const grouped: Record<PlanGroup, SpendingRow[]> = {
      NEED: [],
      WANT: [],
      SAVINGS_DEBT: [],
    };
    spendingRows.forEach((row) => grouped[row.group].push(row));
    return grouped;
  }, [spendingRows]);

  const spendingTotalsByGroup = useMemo(() => {
    const totals: Record<PlanGroup, { planned: number; spent: number; remaining: number }> = {
      NEED: { planned: 0, spent: 0, remaining: 0 },
      WANT: { planned: 0, spent: 0, remaining: 0 },
      SAVINGS_DEBT: { planned: 0, spent: 0, remaining: 0 },
    };
    spendingRows.forEach((row) => {
      totals[row.group].planned += Number(row.amount || 0);
      totals[row.group].spent += row.spent;
      totals[row.group].remaining += row.remaining;
    });
    return totals;
  }, [spendingRows]);

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

  function resetIncomeEditFromSource(id: string) {
    const source = incomeItems.find((row) => row.id === id);
    if (!source) return;
    setIncomeEdits((prev) => ({
      ...prev,
      [id]: {
        name: source.name || '',
        amount: String(Number(source.amount || 0) || ''),
        dirty: false,
        saving: false,
      },
    }));
  }

  function beginIncomeEdit(id: string) {
    if (incomeEditingId && incomeEditingId !== id) {
      const current = incomeEdits[incomeEditingId];
      if (current?.dirty) {
        setIncomeFormError('Save or cancel the current edited income row first.');
        return false;
      }
    }
    setIncomeEditingId(id);
    setIncomeFormError('');
    return true;
  }

  function cancelIncomeEdit(id: string) {
    resetIncomeEditFromSource(id);
    setIncomeEditingId((prev) => (prev === id ? null : prev));
    setIncomeFormError('');
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

  function beginPlanEdit(id: string) {
    if (planEditingId && planEditingId !== id) {
      const current = planEdits[planEditingId];
      if (current?.dirty) {
        setPlanFormError('Save or cancel the current edited plan row first.');
        return false;
      }
    }
    setPlanEditingId(id);
    setPlanFormError('');
    return true;
  }

  function cancelPlanEdit(id: string) {
    resetPlanEditFromSource(id);
    setPlanEditingId((prev) => (prev === id ? null : prev));
    setPlanFormError('');
  }

  const fundingOrder = useMemo(() => {
    const rows = [...planWithPriority];
    rows.sort((a, b) => {
      const aSpendFlag = spendFlagByItemId[a.id] || 'NOT_SPENT';
      const bSpendFlag = spendFlagByItemId[b.id] || 'NOT_SPENT';
      const aIsSpent = aSpendFlag === 'SPENT';
      const bIsSpent = bSpendFlag === 'SPENT';
      const aPinned = a.reconcilePinned === true && !aIsSpent;
      const bPinned = b.reconcilePinned === true && !bIsSpent;
      const aPrioritized = aIsSpent || aPinned;
      const bPrioritized = bIsSpent || bPinned;
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
      const spendFlag = spendFlagByItemId[item.id] || 'NOT_SPENT';
      const isSpent = spendFlag === 'SPENT';
      const funded = isSpent ? amount : Math.min(amount, Math.max(remaining, 0));
      remaining = Math.max(0, remaining - amount);
      const prioritized = isSpent || item.reconcilePinned === true;
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

  const reconcileByGroup = useMemo(() => {
    const grouped: Record<PlanGroup, ReconcileRow[]> = {
      NEED: [],
      WANT: [],
      SAVINGS_DEBT: [],
    };
    reconcileRows.forEach((row) => grouped[row.group].push(row));
    return grouped;
  }, [reconcileRows]);

  const reconcileTotalsByGroup = useMemo(() => {
    const totals: Record<PlanGroup, { planned: number; funded: number; unfunded: number }> = {
      NEED: { planned: 0, funded: 0, unfunded: 0 },
      WANT: { planned: 0, funded: 0, unfunded: 0 },
      SAVINGS_DEBT: { planned: 0, funded: 0, unfunded: 0 },
    };

    reconcileRows.forEach((row) => {
      totals[row.group].planned += row.amount || 0;
      totals[row.group].funded += row.funded;
      totals[row.group].unfunded += row.unfunded;
    });
    return totals;
  }, [reconcileRows]);

  const fundedTotal = useMemo(() => reconcileRows.reduce((sum, row) => sum + row.funded, 0), [reconcileRows]);
  const totalUnfunded = useMemo(() => reconcileRows.reduce((sum, row) => sum + row.unfunded, 0), [reconcileRows]);
  const remainingIncome = useMemo(() => Math.max(0, incomeTotal - fundedTotal), [incomeTotal, fundedTotal]);

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
    await createPeriod(uid, nextPid, periodTitleFromId(nextPid));
    try {
      await seedBudgetForNewPeriod(uid, nextPid);
      await applyAllocationDefaultsForPeriod(uid, nextPid);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (!String(message).includes('DECIDED')) throw e;
    }
    router.push(`/budgets/${nextPid}`);
  }

  async function removeBudget() {
    if (!uid || !pid) return;

    const performDelete = async () => {
      await deletePeriod(uid, pid);
      router.replace('/budgets');
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm('Delete this budget and all nested records? This cannot be undone.');
      if (!ok) return;
      await performDelete();
      return;
    }

    Alert.alert('Delete Budget', 'Delete this budget and all nested records? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void performDelete() },
    ]);
  }

  async function addIncomeRow() {
    if (!uid || !pid || readOnly) return;
    if (!incomeDraft.name.trim()) {
      setIncomeFormError('Income source name is required.');
      return;
    }
    if (incomeDraft.amount <= 0) {
      setIncomeFormError('Income amount must be greater than 0.');
      return;
    }
    await addIncomeItem(uid, pid, {
      name: incomeDraft.name.trim(),
      amount: incomeDraft.amount,
      active: incomeDraft.active !== false,
    });
    setIncomeDraft({ name: '', amount: 0, active: true });
    setIncomeFormError('');
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

  async function addPlanRow() {
    if (!uid || !pid || readOnly) return;
    if (!planDraft.name.trim()) {
      setPlanFormError('Plan item name is required.');
      return;
    }
    if (planDraft.amount <= 0) {
      setPlanFormError('Plan amount must be greater than 0.');
      return;
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
  }

  async function addExpenseTemplateToPlan() {
    if (!uid || !pid || readOnly || !selectedExpenseId) return;
    const selected = expenseItems.find((row) => row.id === selectedExpenseId);
    if (!selected) return;
    const nextPriority = planWithPriority.reduce((max, row) => Math.max(max, row.priority), 0) + 1;
    await addPlanItem(uid, pid, {
      name: selected.name,
      amount: selected.amount,
      group: selected.group as any,
      tags: selected.tags ?? [],
      priority: nextPriority as any,
    } as any);

    // Deactivate from expenses templates
    await updateExpense(uid, selectedExpenseId, { active: false });
  }

  async function savePlanRow(item: PlanWithId) {
    if (!uid || !pid || readOnly || !item.id) return;
    const edit = planEdits[item.id];
    if (!edit) return;
    const name = edit.name.trim();
    const amount = Math.max(0, parseMoney(edit.amount));
    const tags = parseTagsInput(edit.tagsInput);
    if (!name) {
      setPlanFormError('Plan item name is required.');
      return;
    }
    if (amount <= 0) {
      setPlanFormError('Plan amount must be greater than 0.');
      return;
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setPlanFormError(message || 'Could not save plan row.');
      setPlanEdits((prev) => ({ ...prev, [item.id!]: { ...edit, saving: false } }));
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

  async function assignAccount(item: PlanWithId, accountId: string) {
    if (!uid || !pid || readOnly) return;
    const existing = allocationByItemId[item.id];

    if (!accountId) {
      if (existing?.id) await deleteAllocation(uid, pid, existing.id);
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
  }

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
      await addTransaction(uid, pid, {
        name: row.name,
        amount: spentAmount,
        group: row.group,
        date: new Date().toISOString().slice(0, 10),
        accountId: allocation.accountId,
        categoryId: row.id,
        note: `Spent from budget: ${row.name}`,
      } as any);
      if (spentAmount >= remainingToPlanned) Alert.alert('Transaction recorded', `${row.name} marked as spent.`);
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

  const incomeCol = {
    name: 'w-[300px]',
    amount: 'w-[150px]',
    active: 'w-[110px]',
    actions: 'w-[130px]',
  };

  const planCol = {
    name: 'w-[320px]',
    tags: 'w-[220px]',
    amount: 'w-[150px]',
    actions: 'w-[120px]',
  };

  const plannedTotal = planTotals.needs + planTotals.wants + planTotals.sd;
  const unallocatedTotal = incomeTotal - plannedTotal;
  const inactiveIncomeTotal = Math.max(0, incomeGrossTotal - incomeTotal);
  const planRealPct = useMemo(
    () => ({
      needs: plannedTotal > 0 ? (planTotals.needs / plannedTotal) * 100 : 0,
      wants: plannedTotal > 0 ? (planTotals.wants / plannedTotal) * 100 : 0,
      sd: plannedTotal > 0 ? (planTotals.sd / plannedTotal) * 100 : 0,
    }),
    [planTotals, plannedTotal]
  );

  const groupDotColor: Record<PlanGroup, string> = {
    NEED: 'bg-needs',
    WANT: 'bg-wants',
    SAVINGS_DEBT: 'bg-savings',
  };

  const mobileIncomeRow = useMemo(
    () => (mobileDetail?.section === 'INCOME' ? incomeItems.find((row) => row.id === mobileDetail.id) || null : null),
    [incomeItems, mobileDetail]
  );
  const mobileIncomeEdit = mobileIncomeRow?.id ? incomeEdits[mobileIncomeRow.id] : null;
  const mobilePlanRow = useMemo(
    () => (mobileDetail?.section === 'PLAN' ? planWithPriority.find((row) => row.id === mobileDetail.id) || null : null),
    [mobileDetail, planWithPriority]
  );
  const mobilePlanEdit = mobilePlanRow?.id ? planEdits[mobilePlanRow.id] : null;
  const mobileSpendingRow = useMemo(
    () => (mobileDetail?.section === 'SPENDING' ? spendingRows.find((row) => row.id === mobileDetail.id) || null : null),
    [mobileDetail, spendingRows]
  );
  const mobileReconcileRow = useMemo(
    () => (mobileDetail?.section === 'RECONCILE' ? reconcileRows.find((row) => row.id === mobileDetail.id) || null : null),
    [mobileDetail, reconcileRows]
  );
  const mobileReconcileAllocation = mobileReconcileRow ? allocationByItemId[mobileReconcileRow.id] : null;

  function openMobileIncomeDetail(id: string) {
    if (!beginIncomeEdit(id)) return;
    setMobileDetail({ section: 'INCOME', id });
  }

  function openMobilePlanDetail(id: string) {
    if (!beginPlanEdit(id)) return;
    setMobileDetail({ section: 'PLAN', id });
  }

  function openMobileSpendingDetail(id: string) {
    setMobileDetail({ section: 'SPENDING', id });
  }

  function openMobileReconcileDetail(id: string) {
    setMobileDetail({ section: 'RECONCILE', id });
  }

  function closeMobileDetail() {
    if (!mobileDetail) return;
    if (mobileDetail.section === 'INCOME') cancelIncomeEdit(mobileDetail.id);
    if (mobileDetail.section === 'PLAN') cancelPlanEdit(mobileDetail.id);
    setMobileDetail(null);
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-2 border-b border-border pb-4 dark:border-zinc-800">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold text-foreground dark:text-zinc-50">{title || pid}</Text>
              <View className="flex-row items-center gap-1">
                <MaterialCommunityIcons
                  name={readOnly ? 'lock-outline' : 'lock-open-outline'}
                  size={14}
                  color={readOnly ? '#717182' : '#16A34A'}
                />
                <AppBadge label={status} variant={readOnly ? 'secondary' : 'success'} className="px-2.5" />
              </View>
            </View>
            <Text className="text-sm text-muted-foreground">
              {readOnly
                ? 'Budget is closed (DECIDED) and now view-only.'
                : 'DRAFT mode allows editing all planning sections.'}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <AppButton
              label={readOnly ? 'Closed' : 'Close Budget'}
              onPress={closeBudget}
              variant={readOnly ? 'outline' : 'primary'}
              size="sm"
              disabled={readOnly}
              textClassName={readOnly ? undefined : "text-white"}
            />
            <AppButton
              label={readOnly ? 'Start Next Budget' : 'Close & Start Next'}
              onPress={closeAndStartNextBudget}
              variant="outline"
              size="sm"
            />
            <IconActionButton icon="trash-can-outline" label="Delete budget" variant="danger" onPress={removeBudget} />
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Income (Active)</Text>
            <MaterialCommunityIcons name="cash-plus" size={16} color="#16A34A" />
          </View>
          <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{fmtMoney(incomeTotal)}</Text>
          <Text className="text-xs text-muted-foreground">
            Gross {fmtMoney(incomeGrossTotal)} {inactiveIncomeTotal > 0 ? `· Disabled ${fmtMoney(inactiveIncomeTotal)}` : ''}
          </Text>
        </AppCard>
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Planned</Text>
            <MaterialCommunityIcons name="target" size={16} color="#717182" />
          </View>
          <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{fmtMoney(plannedTotal)}</Text>
        </AppCard>
        <AppCard
          className={cn(
            'gap-1',
            unallocatedTotal >= 0
              ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
              : 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20'
          )}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Unallocated</Text>
            <MaterialCommunityIcons
              name={unallocatedTotal >= 0 ? 'check-circle-outline' : 'alert-circle-outline'}
              size={16}
              color={unallocatedTotal >= 0 ? '#16A34A' : '#D4183D'}
            />
          </View>
          <Text className={cn('text-xl font-bold', unallocatedTotal >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
            {fmtMoney(unallocatedTotal)}
          </Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Budget Meta</Text>
          <IconActionButton icon="cog-outline" label="Toggle Meta" onPress={() => setMetaVisible(!metaVisible)} />
        </View>

        {metaVisible && (
          <View className="gap-3">
            <View className="gap-2">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Title</Text>
              <AppInput value={title} onChangeText={setTitle} editable={!readOnly} />
            </View>
            <View className="flex-row flex-wrap gap-2">
              <View className="min-w-[96px] flex-1 gap-1">
                <Text className="text-xs text-muted-foreground">Needs %</Text>
                <AppInput value={pNeeds} onChangeText={setPNeeds} editable={!readOnly} keyboardType="decimal-pad" />
              </View>
              <View className="min-w-[96px] flex-1 gap-1">
                <Text className="text-xs text-muted-foreground">Wants %</Text>
                <AppInput value={pWants} onChangeText={setPWants} editable={!readOnly} keyboardType="decimal-pad" />
              </View>
              <View className="min-w-[96px] flex-1 gap-1">
                <Text className="text-xs text-muted-foreground">Savings %</Text>
                <AppInput value={pSd} onChangeText={setPSd} editable={!readOnly} keyboardType="decimal-pad" />
              </View>
            </View>
            {!readOnly ? (
              <View className="flex-row gap-2">
                <AppButton label="Save Title" onPress={saveTitle} variant="outline" />
                <AppButton label="Save Targets" onPress={saveTargets} variant="outline" />
              </View>
            ) : null}
          </View>
        )}

        <View className="gap-1 mt-1">
          <Text className="text-xs text-muted-foreground font-medium">
            Auto targets: Needs {fmtMoney(autoTargets.needs)} · Wants {fmtMoney(autoTargets.wants)} · Savings {fmtMoney(autoTargets.sd)}
          </Text>
          <Text className="text-xs text-muted-foreground font-medium">
            Plan targets: Needs {fmtMoney(planTotals.needs)} ({Math.round(planRealPct.needs)}%) · Wants {fmtMoney(planTotals.wants)} ({Math.round(planRealPct.wants)}%) · Savings {fmtMoney(planTotals.sd)} ({Math.round(planRealPct.sd)}%)
          </Text>
        </View>
      </AppCard>

      <AppCard className="gap-2 p-3">
        <AppSegmented value={section} onChange={setSection} options={SECTION_OPTIONS as any} />
      </AppCard>

      {section === 'INCOME' ? (
        <AppCard className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Income Sources</Text>
            {readOnly ? <Text className="text-xs italic text-muted-foreground">Locked in DECIDED mode</Text> : null}
          </View>

          {!isCompact ? (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View className="min-w-[760px] flex-1">
              <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                <Text className={`${incomeCol.name} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Source Name</Text>
                <Text className={`${incomeCol.amount} text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Amount</Text>
                <Text className={`${incomeCol.active} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Active</Text>
                <Text className={`${incomeCol.actions} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Actions</Text>
              </View>

              {incomeItems.map((row) => {
                const edit = row.id ? incomeEdits[row.id] : null;
                if (!row.id || !edit) return null;
                const isEditing = incomeEditingId === row.id;
                const dirty = edit.dirty;
                return (
                <View
                  key={row.id}
                  className={cn(
                    'flex-row items-center border-b py-2 dark:border-zinc-800',
                    dirty
                      ? 'border-primary/40 bg-primary/5 dark:bg-zinc-800/70'
                      : 'border-border hover:bg-muted/35 dark:hover:bg-zinc-800/55'
                  )}
                >
                  <View className={`${incomeCol.name} pr-2`}>
                    {readOnly ? (
                      <Text className={cn('text-sm font-medium', row.active === false ? 'text-muted-foreground line-through' : 'text-foreground dark:text-zinc-50')}>
                        {row.name}
                      </Text>
                    ) : isEditing ? (
                      <AppInput
                        value={edit.name}
                        onChangeText={(value) => setIncomeEditField(row.id!, { name: value })}
                        placeholder="Income source"
                        className="h-9"
                      />
                    ) : (
                      <Text className={cn('text-sm font-medium', row.active === false ? 'text-muted-foreground line-through' : 'text-foreground dark:text-zinc-50')}>
                        {row.name}
                      </Text>
                    )}
                  </View>

                  <View className={`${incomeCol.amount} pr-2`}>
                    {readOnly ? (
                      <Text className={cn('text-right text-sm font-medium', row.active === false ? 'text-muted-foreground' : 'text-foreground dark:text-zinc-50')}>
                        {fmtMoney(row.amount || 0)}
                      </Text>
                    ) : isEditing ? (
                      <AppInput
                        value={edit.amount}
                        onChangeText={(value) => setIncomeEditField(row.id!, { amount: value })}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        className="h-9 text-right"
                      />
                    ) : (
                      <Text className={cn('text-right text-sm font-medium', row.active === false ? 'text-muted-foreground' : 'text-foreground dark:text-zinc-50')}>
                        {fmtMoney(row.amount || 0)}
                      </Text>
                    )}
                  </View>

                  <View className={`${incomeCol.active} items-center`}>
                    {readOnly ? (
                      <AppBadge label={row.active === false ? 'Inactive' : 'Active'} variant={row.active === false ? 'secondary' : 'success'} />
                    ) : (
                      <Switch
                        value={row.active !== false}
                        onValueChange={(value) => void toggleIncomeActive(row, value)}
                      />
                    )}
                  </View>

                  <View className={`${incomeCol.actions} flex-row items-center justify-center gap-2`}>
                    {!readOnly ? (
                      isEditing ? (
                        <>
                          {dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
                          <IconActionButton icon="content-save-outline" label="Save income row" onPress={() => saveIncomeRow(row)} disabled={!dirty || edit.saving} />
                          <IconActionButton icon="close" label="Cancel edit" variant="muted" onPress={() => cancelIncomeEdit(row.id!)} />
                        </>
                      ) : (
                        <>
                          <IconActionButton icon="pencil-outline" label="Edit income row" onPress={() => beginIncomeEdit(row.id!)} />
                          <IconActionButton icon="trash-can-outline" label="Delete income row" variant="danger" onPress={() => deleteIncomeRow(row.id)} />
                        </>
                      )
                    ) : null}
                  </View>
                </View>
              )})}

              {!readOnly ? (
                <View className="flex-row items-center border-b border-border bg-muted/40 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <View className={`${incomeCol.name} pr-2`}>
                    <AppInput
                      value={incomeDraft.name}
                      onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, name: value }))}
                      placeholder="New source..."
                      className="h-9"
                    />
                  </View>
                  <View className={`${incomeCol.amount} pr-2`}>
                    <AppInput
                      value={String(incomeDraft.amount || '')}
                      onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      className="h-9 text-right"
                    />
                  </View>
                  <View className={`${incomeCol.active} items-center`}>
                    <Switch value={incomeDraft.active !== false} onValueChange={(value) => setIncomeDraft((prev) => ({ ...prev, active: value }))} />
                  </View>
                  <View className={`${incomeCol.actions} items-center`}>
                    <IconActionButton icon="plus" label="Add income row" onPress={addIncomeRow} />
                  </View>
                </View>
              ) : null}
              {incomeFormError ? (
                <View className="py-1">
                  <Text className="text-xs text-destructive">{incomeFormError}</Text>
                </View>
              ) : null}

              <View className="flex-row items-center bg-muted/60 py-2 dark:bg-zinc-800/50">
                <Text className={`${incomeCol.name} text-sm font-semibold text-foreground dark:text-zinc-50`}>Active Income</Text>
                <Text className={`${incomeCol.amount} text-right text-sm font-semibold text-foreground dark:text-zinc-50`}>{fmtMoney(incomeTotal)}</Text>
                <View className={incomeCol.active} />
                <View className={incomeCol.actions} />
              </View>
            </View>
          </ScrollView>
          ) : (
            <View className="gap-2">
              {!readOnly ? (
                <View className="flex-row items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                  <View className="flex-1">
                    <AppInput
                      value={incomeDraft.name}
                      onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, name: value }))}
                      placeholder="New source..."
                      className="h-9"
                    />
                  </View>
                  <View className="w-28">
                    <AppInput
                      value={String(incomeDraft.amount || '')}
                      onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      className="h-9 text-right"
                    />
                  </View>
                  <IconActionButton icon="plus" label="Add income row" onPress={addIncomeRow} />
                </View>
              ) : null}

              {incomeFormError ? (
                <View className="py-1">
                  <Text className="text-xs text-destructive">{incomeFormError}</Text>
                </View>
              ) : null}

              <View className="overflow-hidden rounded-lg border border-border dark:border-zinc-800">
                <View className="flex-row border-b border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <Text className="w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source</Text>
                  <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</Text>
                </View>
                {incomeItems.map((row) => (
                  <Pressable
                    key={row.id}
                    className="flex-row items-center border-b border-border px-3 py-2 last:border-b-0 dark:border-zinc-800"
                    onPress={() => row.id && openMobileIncomeDetail(row.id)}
                  >
                    <Text className={cn('w-[180px] text-sm font-medium', row.active === false ? 'text-muted-foreground line-through' : 'text-foreground dark:text-zinc-50')} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text className={cn('flex-1 text-sm', row.active === false ? 'text-muted-foreground' : 'text-foreground dark:text-zinc-50')}>
                      {fmtMoney(row.amount || 0)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </AppCard>
      ) : null}

      {section === 'PLAN' ? (
        <View className="gap-3">
          {PLAN_GROUP_OPTIONS.map((group) => {
            let rows = planWithPriority.filter((item) => item.group === group.value);
            const subtotal = rows.reduce((sum, row) => sum + (row.amount || 0), 0);
            return (
              <AppCard key={group.value} className="gap-2">
                <View className="flex-row items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 dark:bg-zinc-800/40">
                  <View className="flex-row items-center gap-2">
                    <View className={cn('h-2.5 w-2.5 rounded-full', groupDotColor[group.value])} />
                    <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{group.label}</Text>
                  </View>
                  <AppBadge label={fmtMoney(subtotal)} variant="outline" />
                </View>

                {!isCompact ? (
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View className="min-w-[840px] flex-1">
                    <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                      <Text className={`${planCol.name} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Item Name</Text>
                      <Text className={`${planCol.amount} text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Amount</Text>
                      <Text className={`${planCol.actions} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Actions</Text>
                    </View>

                    {rows.map((row) => {
                      const edit = planEdits[row.id];
                      if (!edit) return null;
                      const isEditing = planEditingId === row.id;
                      const dirty = edit.dirty;
                      const isSpent = spentItemIds.has(row.id);
                      return (
                      <View
                        key={row.id}
                        className={cn(
                          'flex-row items-center border-b py-2 dark:border-zinc-800',
                          dirty
                            ? 'border-primary/40 bg-primary/5 dark:bg-zinc-800/70'
                            : 'border-border hover:bg-muted/35 dark:hover:bg-zinc-800/55'
                        )}
                      >
                        <View className={`${planCol.name} pr-2`}>
                          {readOnly || isSpent ? (
                            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                          ) : isEditing ? (
                            <AppInput
                              value={edit.name}
                              onChangeText={(value) => setPlanEditField(row.id, { name: value })}
                              placeholder="Plan item"
                              className="h-9"
                            />
                          ) : (
                            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                          )}
                        </View>

                        <View className={`${planCol.amount} pr-2`}>
                          {readOnly || isSpent ? (
                            <Text className="text-right text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                          ) : isEditing ? (
                            <AppInput
                              value={edit.amount}
                              onChangeText={(value) => setPlanEditField(row.id, { amount: value })}
                              keyboardType="decimal-pad"
                              placeholder="0.00"
                              className="h-9 text-right"
                            />
                          ) : (
                            <Text className="text-right text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                          )}
                        </View>

                        <View className={`${planCol.actions} flex-row items-center justify-center gap-2`}>
                          {!readOnly ? (
                            isSpent ? (
                              <AppBadge label="Spent" variant="success" />
                            ) : isEditing ? (
                              <>
                                {dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
                                <IconActionButton icon="content-save-outline" label="Save plan row" onPress={() => savePlanRow(row)} disabled={!dirty || edit.saving} />
                                <IconActionButton icon="close" label="Cancel edit" variant="muted" onPress={() => cancelPlanEdit(row.id)} />
                              </>
                            ) : (
                              <>
                                <IconActionButton icon="pencil-outline" label="Edit plan row" onPress={() => beginPlanEdit(row.id)} />
                                <IconActionButton icon="trash-can-outline" label="Delete plan row" variant="danger" onPress={() => deletePlanRow(row.id)} />
                              </>
                            )
                          ) : null}
                        </View>
                      </View>
                    )})}

                    {!rows.length ? (
                      <View className="py-3">
                        <Text className="text-sm text-muted-foreground">No items planned in this category.</Text>
                      </View>
                    ) : null}
                  </View>
                </ScrollView>
                ) : (
                  <View className="overflow-hidden rounded-lg border border-border dark:border-zinc-800">
                    <View className="flex-row border-b border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
                      <Text className="w-[190px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</Text>
                      <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</Text>
                    </View>
                    {rows.map((row) => (
                      <Pressable
                        key={row.id}
                        className="flex-row items-center border-b border-border px-3 py-2 last:border-b-0 dark:border-zinc-800"
                        onPress={() => openMobilePlanDetail(row.id)}
                      >
                        <Text className="w-[190px] text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
                          {row.name}
                        </Text>
                        <Text className="flex-1 text-sm text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                      </Pressable>
                    ))}
                    {!rows.length ? (
                      <View className="py-3">
                        <Text className="text-center text-sm text-muted-foreground">No items planned in this category.</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </AppCard>
            );
          })}

          {!readOnly ? (
            <AppCard className="gap-3">
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Add Plan Item</Text>

              {expenseOptions.length ? (
                <View className="gap-2 rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/20">
                  <Text className="text-xs uppercase tracking-wide text-muted-foreground">Add from Expense Templates</Text>
                  <View className="flex-col gap-2 md:flex-row md:items-center">
                    <View className="flex-1">
                      <DropdownField
                        value={selectedExpenseId}
                        options={expenseOptions}
                        onChange={setSelectedExpenseId}
                        placeholder="Select template"
                        menuStrategy="inline"
                      />
                    </View>
                    <AppButton label="Add Template" variant="outline" size="sm" onPress={addExpenseTemplateToPlan} />
                  </View>
                </View>
              ) : null}

              <View className="flex-row flex-wrap items-end gap-2">
                <View className="min-w-[220px] flex-1 gap-1">
                  <Text className="text-xs text-muted-foreground">Name</Text>
                  <AppInput value={planDraft.name} onChangeText={(value) => setPlanDraft((prev) => ({ ...prev, name: value }))} placeholder="e.g. Rent" className="h-9" />
                </View>
                <View className="min-w-[200px] gap-1">
                  <Text className="text-xs text-muted-foreground">Category</Text>
                  <AppSegmented
                    value={planDraft.group}
                    onChange={(value) => setPlanDraft((prev) => ({ ...prev, group: value as PlanGroup }))}
                    compact
                    options={PLAN_GROUP_OPTIONS}
                  />
                </View>
                <View className="w-[130px] gap-1">
                  <Text className="text-xs text-muted-foreground">Amount</Text>
                  <AppInput
                    value={String(planDraft.amount || '')}
                    onChangeText={(value) => setPlanDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    className="h-9 text-right"
                  />
                </View>
                <View className="min-w-[220px] flex-1 gap-1">
                  <Text className="text-xs text-muted-foreground">Tags</Text>
                  <AppInput
                    value={tagsToInput(planDraft.tags)}
                    onChangeText={(value) => setPlanDraft((prev) => ({ ...prev, tags: parseTagsInput(value) }))}
                    placeholder="utilities, vegetables"
                    className="h-9"
                  />
                </View>
                <IconActionButton icon="plus" label="Add plan item" onPress={addPlanRow} />
              </View>
              {planFormError ? <Text className="text-xs text-destructive">{planFormError}</Text> : null}
            </AppCard>
          ) : null}
        </View>
      ) : null}

      {section === 'SPENDING' ? (
        <View className="gap-3">
          <AppCard className="gap-3">
            <View className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Planned Total</Text>
                <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{fmtMoney(plannedTotal)}</Text>
              </View>
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Spent Total</Text>
                <Text className="text-base font-semibold text-blue-700 dark:text-blue-300">{fmtMoney(totalSpentAcrossBudget)}</Text>
              </View>
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Remaining Total</Text>
                <Text
                  className={cn(
                    'text-base font-semibold',
                    plannedTotal - totalSpentAcrossBudget < 0
                      ? 'text-red-700 dark:text-red-300'
                      : 'text-emerald-700 dark:text-emerald-300'
                  )}
                >
                  {fmtMoney(plannedTotal - totalSpentAcrossBudget)}
                </Text>
              </View>
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Spent Items</Text>
                <Text className="text-base font-semibold text-foreground dark:text-zinc-50">
                  {spendingRows.filter((row) => row.spent > 0).length}/{spendingRows.length}
                </Text>
              </View>
            </View>

            <Text className="text-xs text-muted-foreground">
              Remaining = Planned - Spent. If spending exceeds planned amount, the remaining value is negative.
            </Text>
          </AppCard>

          {PLAN_GROUP_OPTIONS.map((group) => {
            const rows = spendingByGroup[group.value];
            const totals = spendingTotalsByGroup[group.value];
            return (
              <AppCard key={group.value} className="gap-3">
                <View className="flex-row items-center justify-between rounded-md bg-muted/30 px-3 py-2 dark:bg-zinc-800/30">
                  <View className="flex-row items-center gap-2">
                    <View className={cn('h-2.5 w-2.5 rounded-full', groupDotColor[group.value])} />
                    <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{group.label}</Text>
                  </View>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <AppBadge label={`Planned ${fmtMoney(totals.planned)}`} variant="outline" />
                    <AppBadge label={`Spent ${fmtMoney(totals.spent)}`} variant="success" />
                    <AppBadge
                      label={`Remaining ${fmtMoney(totals.remaining)}`}
                      variant={totals.remaining < 0 ? 'danger' : 'secondary'}
                    />
                  </View>
                </View>

                {rows.length ? (
                  !isCompact ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View className="min-w-[880px] flex-1">
                      <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                        <Text className="w-[280px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</Text>
                        <Text className="w-[150px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</Text>
                        <Text className="w-[150px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spent</Text>
                        <Text className="w-[150px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remaining</Text>
                        <Text className="w-[120px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</Text>
                      </View>

                      {rows.map((row) => (
                        <View
                          key={row.id}
                          className={cn(
                            'flex-row items-center border-b border-border py-2 dark:border-zinc-800',
                            row.spent > 0 ? 'bg-primary/5 dark:bg-zinc-800/55' : 'hover:bg-muted/35 dark:hover:bg-zinc-800/45'
                          )}
                        >
                          <View className="w-[280px] pr-2">
                            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                            {row.tags?.length ? (
                              <Text className="text-xs text-muted-foreground dark:text-zinc-400">{tagsLabel(row.tags)}</Text>
                            ) : null}
                          </View>
                          <Text className="w-[150px] text-right text-sm text-foreground dark:text-zinc-100">{fmtMoney(row.amount || 0)}</Text>
                          <Text className="w-[150px] text-right text-sm font-semibold text-blue-700 dark:text-blue-300">{fmtMoney(row.spent)}</Text>
                          <Text
                            className={cn(
                              'w-[150px] text-right text-sm font-semibold',
                              row.remaining < 0
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-emerald-700 dark:text-emerald-300'
                            )}
                          >
                            {fmtMoney(row.remaining)}
                          </Text>
                          <View className="w-[120px] items-center">
                            {row.spendFlag === 'SPENT' ? (
                              <AppBadge label="Spent" variant="success" />
                            ) : row.spendFlag === 'PARTIAL_SPENT' ? (
                              <AppBadge label="Partial spent" variant="warning" />
                            ) : (
                              <AppBadge label="Pending" variant="secondary" />
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  ) : (
                    <View className="overflow-hidden rounded-lg border border-border dark:border-zinc-800">
                      <View className="flex-row border-b border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
                        <Text className="w-[190px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</Text>
                        <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</Text>
                      </View>
                      {rows.map((row) => (
                        <Pressable
                          key={row.id}
                          className="flex-row items-center border-b border-border px-3 py-2 last:border-b-0 dark:border-zinc-800"
                          onPress={() => openMobileSpendingDetail(row.id)}
                        >
                          <Text className="w-[190px] text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text className="flex-1 text-sm text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )
                ) : (
                  <Text className="text-sm text-muted-foreground">No {group.label.toLowerCase()} items in this budget.</Text>
                )}
              </AppCard>
            );
          })}
        </View>
      ) : null}

      {section === 'RECONCILE' ? (
        <View className="gap-3">
          <AppCard className="gap-3">
            <View className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Active Income</Text>
                <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{fmtMoney(incomeTotal)}</Text>
              </View>
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Funded</Text>
                <Text className="text-base font-semibold text-blue-700 dark:text-blue-300">{fmtMoney(fundedTotal)}</Text>
              </View>
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Remaining</Text>
                <Text className="text-base font-semibold text-emerald-700 dark:text-emerald-300">{fmtMoney(remainingIncome)}</Text>
              </View>
              <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Unfunded</Text>
                <Text className="text-base font-semibold text-red-700 dark:text-red-300">{fmtMoney(totalUnfunded)}</Text>
              </View>
            </View>

            <Text className="text-xs text-muted-foreground">
              Toggle rows to prioritize funding in this order: Needs → Savings-Debt → Wants, then by item priority.
            </Text>
            <Text className="text-xs text-muted-foreground">Spent rows are auto-prioritized, fully funded, and their prioritize toggle is disabled.</Text>
          </AppCard>

          {PLAN_GROUP_OPTIONS.map((group) => {
            const rows = reconcileByGroup[group.value];
            const totals = reconcileTotalsByGroup[group.value];
            return (
              <AppCard key={group.value} className="gap-3">
                <View className="flex-row items-center justify-between rounded-md bg-muted/30 px-3 py-2 dark:bg-zinc-800/30">
                  <View className="flex-row items-center gap-2">
                    <View className={cn('h-2.5 w-2.5 rounded-full', groupDotColor[group.value])} />
                    <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{group.label}</Text>
                  </View>
                  <View className="flex-row flex-wrap items-center gap-2">
                    <AppBadge label={`Planned ${fmtMoney(totals.planned)}`} variant="outline" />
                    <AppBadge label={`Funded ${fmtMoney(totals.funded)}`} variant="success" />
                    <AppBadge label={`Unfunded ${fmtMoney(totals.unfunded)}`} variant={totals.unfunded > 0 ? 'warning' : 'secondary'} />
                  </View>
                </View>

                {rows.length ? (
                  !isCompact ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View className="min-w-[1140px] flex-1">
                      <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                        <Text className="w-[260px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</Text>
                        <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</Text>
                        <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funded</Text>
                        <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unfunded</Text>
                        <Text className="w-[100px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funding</Text>
                        <Text className="w-[140px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spend Flag</Text>
                        <Text className="w-[200px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</Text>
                        <Text className="w-[100px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spent</Text>
                        <Text className="w-[100px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prioritize</Text>
                      </View>

                      {rows.map((row) => {
                        const allocation = allocationByItemId[row.id];
                        const statusLabel = row.unfunded <= 0 ? 'Funded' : row.funded > 0 ? 'Partial' : 'Unfunded';
                        const statusVariant = row.unfunded <= 0 ? 'success' : row.funded > 0 ? 'warning' : 'danger';
                        const isSpent = row.spendFlag === 'SPENT';
                        const spendFlagLabel =
                          row.spendFlag === 'SPENT'
                            ? 'Spent'
                            : row.spendFlag === 'PARTIAL_SPENT'
                              ? 'Partial spent'
                              : 'Not spent';
                        const spendFlagVariant =
                          row.spendFlag === 'SPENT'
                            ? 'success'
                            : row.spendFlag === 'PARTIAL_SPENT'
                              ? 'warning'
                              : 'secondary';
                        const canPrioritize = row.spendFlag !== 'SPENT';
                        const prioritizeValue = row.spendFlag === 'SPENT' ? true : row.reconcilePinned === true;
                        return (
                          <View
                            key={row.id}
                            className={cn(
                              'flex-row items-center border-b border-border py-2 dark:border-zinc-800',
                              row.prioritized ? 'bg-primary/5 dark:bg-zinc-800/65' : 'hover:bg-muted/35 dark:hover:bg-zinc-800/55'
                            )}
                          >
                            <View className="w-[260px] pr-2">
                              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                              {row.tags?.length ? <Text className="text-xs text-muted-foreground dark:text-zinc-400">{tagsLabel(row.tags)}</Text> : null}
                            </View>

                            <Text className="w-[120px] text-right text-sm text-foreground dark:text-zinc-100">{fmtMoney(row.amount)}</Text>
                            <Text className="w-[120px] text-right text-sm font-semibold text-blue-700 dark:text-blue-300">{fmtMoney(row.funded)}</Text>
                            <Text className="w-[120px] text-right text-sm text-muted-foreground dark:text-zinc-400">{fmtMoney(row.unfunded)}</Text>

                            <View className="w-[100px] items-center">
                              <AppBadge label={statusLabel} variant={statusVariant as any} />
                            </View>

                            <View className="w-[140px] items-center">
                              <AppBadge label={spendFlagLabel} variant={spendFlagVariant as any} />
                            </View>

                            <View className="w-[200px] pr-2">
                              <DropdownField
                                value={allocation?.accountId ?? ''}
                                options={accountOptions}
                                onChange={(value) => assignAccount(row, value)}
                                disabled={readOnly || isSpent}
                                placeholder="Select account"
                                className="w-full"
                                menuStrategy="inline"
                                triggerClassName="bg-background dark:bg-zinc-900"
                              />
                            </View>

                            <View className="w-[100px] items-center">
                              {isSpent ? (
                                <AppBadge label="Spent" variant="success" />
                              ) : row.funded > 0 ? (
                                <IconActionButton
                                  icon={markingSpent === row.id ? "loading" : "cash-check"}
                                  label="Mark Spent"
                                  onPress={() => markSpent(row)}
                                  variant="primary"
                                  disabled={markingSpent !== null}
                                />
                              ) : null}
                            </View>

                            <View className="w-[100px] items-center">
                              {readOnly ? (
                                <AppBadge
                                  label={prioritizeValue ? 'On' : 'Off'}
                                  variant={prioritizeValue ? 'success' : 'secondary'}
                                />
                              ) : (
                                <Switch
                                  value={prioritizeValue}
                                  onValueChange={(value) => void toggleReconcilePinned(row, value)}
                                  disabled={!canPrioritize}
                                />
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  ) : (
                    <View className="overflow-hidden rounded-lg border border-border dark:border-zinc-800">
                      <View className="flex-row border-b border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
                        <Text className="w-[190px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</Text>
                        <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</Text>
                      </View>
                      {rows.map((row) => (
                        <Pressable
                          key={row.id}
                          className="flex-row items-center border-b border-border px-3 py-2 last:border-b-0 dark:border-zinc-800"
                          onPress={() => openMobileReconcileDetail(row.id)}
                        >
                          <Text className="w-[190px] text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
                            {row.name}
                          </Text>
                          <Text className="flex-1 text-sm text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )
                ) : (
                  <Text className="text-sm text-muted-foreground">No {group.label.toLowerCase()} items in this budget.</Text>
                )}
              </AppCard>
            );
          })}
        </View>
      ) : null}

      <AppModal
        open={Boolean(isCompact && mobileDetail)}
        onClose={closeMobileDetail}
        title={
          mobileDetail?.section === 'INCOME'
            ? 'Income Details'
            : mobileDetail?.section === 'PLAN'
              ? 'Plan Item Details'
              : mobileDetail?.section === 'SPENDING'
                ? 'Spending Details'
                : mobileDetail?.section === 'RECONCILE'
                  ? 'Reconcile Details'
                  : 'Details'
        }
      >
        <View className="gap-3">
          {mobileDetail?.section === 'INCOME' && mobileIncomeRow && mobileIncomeEdit ? (
            <>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Source Name</Text>
                <AppInput
                  value={mobileIncomeEdit.name}
                  onChangeText={(value) => setIncomeEditField(mobileIncomeRow.id!, { name: value })}
                  editable={!readOnly}
                />
              </View>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Amount</Text>
                <AppInput
                  value={mobileIncomeEdit.amount}
                  onChangeText={(value) => setIncomeEditField(mobileIncomeRow.id!, { amount: value })}
                  keyboardType="decimal-pad"
                  editable={!readOnly}
                />
              </View>
              <View className="flex-row items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-sm text-muted-foreground">Active</Text>
                <Switch
                  value={mobileIncomeRow.active !== false}
                  onValueChange={(value) => void toggleIncomeActive(mobileIncomeRow, value)}
                  disabled={readOnly}
                />
              </View>
              <View className="flex-row justify-end gap-2">
                {!readOnly ? (
                  <IconActionButton
                    icon="trash-can-outline"
                    label="Delete income row"
                    variant="danger"
                    onPress={async () => {
                      await deleteIncomeRow(mobileIncomeRow.id);
                      setMobileDetail(null);
                    }}
                  />
                ) : null}
                <AppButton variant="outline" label="Close" onPress={closeMobileDetail} />
                {!readOnly ? (
                  <AppButton
                    label={mobileIncomeEdit.saving ? 'Saving...' : 'Save'}
                    onPress={() => saveIncomeRow(mobileIncomeRow)}
                    disabled={!mobileIncomeEdit.dirty || mobileIncomeEdit.saving}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          {mobileDetail?.section === 'PLAN' && mobilePlanRow && mobilePlanEdit ? (
            <>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Item Name</Text>
                <AppInput
                  value={mobilePlanEdit.name}
                  onChangeText={(value) => setPlanEditField(mobilePlanRow.id, { name: value })}
                  editable={!readOnly && !spentItemIds.has(mobilePlanRow.id)}
                />
              </View>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Amount</Text>
                <AppInput
                  value={mobilePlanEdit.amount}
                  onChangeText={(value) => setPlanEditField(mobilePlanRow.id, { amount: value })}
                  keyboardType="decimal-pad"
                  editable={!readOnly && !spentItemIds.has(mobilePlanRow.id)}
                />
              </View>
              <View className="flex-row flex-wrap gap-2">
                <AppBadge label={planGroupLabel(mobilePlanRow.group)} variant="outline" />
                {spentItemIds.has(mobilePlanRow.id) ? <AppBadge label="Spent" variant="success" /> : null}
                {mobilePlanEdit.dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
              </View>
              <View className="flex-row justify-end gap-2">
                {!readOnly && !spentItemIds.has(mobilePlanRow.id) ? (
                  <IconActionButton
                    icon="trash-can-outline"
                    label="Delete plan row"
                    variant="danger"
                    onPress={async () => {
                      await deletePlanRow(mobilePlanRow.id);
                      setMobileDetail(null);
                    }}
                  />
                ) : null}
                <AppButton variant="outline" label="Close" onPress={closeMobileDetail} />
                {!readOnly && !spentItemIds.has(mobilePlanRow.id) ? (
                  <AppButton
                    label={mobilePlanEdit.saving ? 'Saving...' : 'Save'}
                    onPress={() => savePlanRow(mobilePlanRow)}
                    disabled={!mobilePlanEdit.dirty || mobilePlanEdit.saving}
                  />
                ) : null}
              </View>
            </>
          ) : null}

          {mobileDetail?.section === 'SPENDING' && mobileSpendingRow ? (
            <>
              <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{mobileSpendingRow.name}</Text>
              <View className="flex-row flex-wrap gap-2">
                <AppBadge label={`Planned ${fmtMoney(mobileSpendingRow.amount || 0)}`} variant="outline" />
                <AppBadge label={`Spent ${fmtMoney(mobileSpendingRow.spent)}`} variant="success" />
                <AppBadge label={`Remaining ${fmtMoney(mobileSpendingRow.remaining)}`} variant={mobileSpendingRow.remaining < 0 ? 'danger' : 'secondary'} />
              </View>
              {mobileSpendingRow.tags?.length ? (
                <Text className="text-xs text-muted-foreground">{tagsLabel(mobileSpendingRow.tags)}</Text>
              ) : null}
              <View className="flex-row justify-end">
                <AppButton variant="outline" label="Close" onPress={closeMobileDetail} />
              </View>
            </>
          ) : null}

          {mobileDetail?.section === 'RECONCILE' && mobileReconcileRow ? (
            <>
              <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{mobileReconcileRow.name}</Text>
              <View className="flex-row flex-wrap gap-2">
                <AppBadge label={`Planned ${fmtMoney(mobileReconcileRow.amount || 0)}`} variant="outline" />
                <AppBadge label={`Funded ${fmtMoney(mobileReconcileRow.funded)}`} variant="success" />
                <AppBadge label={`Unfunded ${fmtMoney(mobileReconcileRow.unfunded)}`} variant={mobileReconcileRow.unfunded > 0 ? 'warning' : 'secondary'} />
              </View>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Account</Text>
                <DropdownField
                  value={mobileReconcileAllocation?.accountId ?? ''}
                  options={accountOptions}
                  onChange={(value) => assignAccount(mobileReconcileRow, value)}
                  disabled={readOnly || mobileReconcileRow.spendFlag === 'SPENT'}
                  placeholder="Select account"
                  menuStrategy="inline"
                />
              </View>
              <View className="flex-row items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-sm text-muted-foreground">Prioritize</Text>
                <Switch
                  value={mobileReconcileRow.spendFlag === 'SPENT' ? true : mobileReconcileRow.reconcilePinned === true}
                  onValueChange={(value) => void toggleReconcilePinned(mobileReconcileRow, value)}
                  disabled={readOnly || mobileReconcileRow.spendFlag === 'SPENT'}
                />
              </View>
              <View className="flex-row justify-end gap-2">
                {!readOnly && mobileReconcileRow.spendFlag !== 'SPENT' ? (
                  <AppButton
                    label={markingSpent === mobileReconcileRow.id ? 'Recording...' : 'Mark Spent'}
                    onPress={() => markSpent(mobileReconcileRow)}
                    disabled={markingSpent !== null || !(mobileReconcileRow.funded > 0)}
                  />
                ) : null}
                <AppButton variant="outline" label="Close" onPress={closeMobileDetail} />
              </View>
            </>
          ) : null}
        </View>
      </AppModal>
    </ScrollView>
  );
}
