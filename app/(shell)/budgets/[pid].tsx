import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
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
import { watchExpenses, type ExpenseItem } from '@/lib/repo/expenses';
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
import { firstTag, parseTagsInput, tagsLabel, tagsToInput } from '@/lib/tags';

const SECTION_OPTIONS = [
  { label: 'Income', value: 'INCOME' },
  { label: 'Spending Plan', value: 'PLAN' },
  { label: 'Reconcile', value: 'RECONCILE' },
] as const;

const GROUP_ORDER: Record<PlanGroup, number> = {
  NEED: 0,
  WANT: 1,
  SAVINGS_DEBT: 2,
};

type SectionKey = (typeof SECTION_OPTIONS)[number]['value'];
type PlanWithId = PlanItem & { id: string; priority: number };
type ReconcileRow = PlanWithId & { funded: number; unfunded: number; fundingOrder: number };
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

export default function BudgetDetailScreen() {
  const { pid } = useLocalSearchParams<{ pid: string }>();
  const router = useRouter();
  const uid = useWorkspaceUid();

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<PeriodStatus>('DRAFT');
  const [pNeeds, setPNeeds] = useState('50');
  const [pWants, setPWants] = useState('30');
  const [pSd, setPSd] = useState('20');

  const [section, setSection] = useState<SectionKey>('PLAN');

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
  const [planTagFilter, setPlanTagFilter] = useState('ALL');
  const [planSortMode, setPlanSortMode] = useState<'PRIORITY' | 'TAG'>('PRIORITY');

  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
  const [selectedExpenseId, setSelectedExpenseId] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [draggingPlanId, setDraggingPlanId] = useState<string | null>(null);

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
      unExpenses();
      unAlloc();
      unAccounts();
    };
  }, [uid, pid]);

  useEffect(() => {
    if (planSortMode !== 'TAG' && planTagFilter !== 'ALL') {
      setPlanTagFilter('ALL');
    }
  }, [planSortMode, planTagFilter]);

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

  const hasInactiveIncome = useMemo(() => incomeItems.some((row) => row.active === false), [incomeItems]);

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
        return;
      }
    }
    setIncomeEditingId(id);
    setIncomeFormError('');
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
        return;
      }
    }
    setPlanEditingId(id);
    setPlanFormError('');
  }

  function cancelPlanEdit(id: string) {
    resetPlanEditFromSource(id);
    setPlanEditingId((prev) => (prev === id ? null : prev));
    setPlanFormError('');
  }

  const fundingOrder = useMemo(() => {
    const rows = [...planWithPriority];
    if (hasInactiveIncome) {
      rows.sort((a, b) => {
        const groupDiff = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
        if (groupDiff !== 0) return groupDiff;
        return a.priority - b.priority;
      });
      return rows;
    }
    rows.sort((a, b) => a.priority - b.priority);
    return rows;
  }, [hasInactiveIncome, planWithPriority]);

  const reconcileRows = useMemo<ReconcileRow[]>(() => {
    let remaining = incomeTotal;
    return fundingOrder.map((item, index) => {
      const amount = item.amount || 0;
      const funded = Math.min(amount, Math.max(remaining, 0));
      remaining = Math.max(0, remaining - amount);
      return {
        ...item,
        fundingOrder: index + 1,
        funded,
        unfunded: Math.max(0, amount - funded),
      };
    });
  }, [fundingOrder, incomeTotal]);

  const reconcileByGroup = useMemo(() => {
    const grouped: Record<PlanGroup, ReconcileRow[]> = {
      NEED: [],
      WANT: [],
      SAVINGS_DEBT: [],
    };
    reconcileRows.forEach((row) => grouped[row.group].push(row));
    return grouped;
  }, [reconcileRows]);

  const priorityPositionByItemId = useMemo(() => {
    const map: Record<string, { index: number; total: number }> = {};
    PLAN_GROUP_OPTIONS.forEach((group) => {
      const rows = planWithPriority.filter((row) => row.group === group.value).sort((a, b) => a.priority - b.priority);
      rows.forEach((row, index) => {
        map[row.id] = { index, total: rows.length };
      });
    });
    return map;
  }, [planWithPriority]);

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

  async function reorderPriorityWithinGroup(group: PlanGroup, itemId: string, direction: -1 | 1) {
    if (!uid || !pid || readOnly) return;
    const rows = planWithPriority
      .filter((row) => row.group === group)
      .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.name.localeCompare(b.name)));
    const index = rows.findIndex((row) => row.id === itemId);
    if (index < 0) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= rows.length) return;

    const reordered = [...rows];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);

    for (let i = 0; i < reordered.length; i += 1) {
      const row = reordered[i];
      const nextPriority = i + 1;
      if (row.priority !== nextPriority) {
        await updatePlanItem(uid, pid, row.id, { priority: nextPriority as any } as any);
      }
    }
  }

  async function reorderPriorityWithinGroupByDrop(group: PlanGroup, sourceItemId: string, targetItemId: string) {
    if (!uid || !pid || readOnly) return;
    if (sourceItemId === targetItemId) return;

    const rows = planWithPriority
      .filter((row) => row.group === group)
      .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.name.localeCompare(b.name)));
    const fromIndex = rows.findIndex((row) => row.id === sourceItemId);
    const toIndex = rows.findIndex((row) => row.id === targetItemId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reordered = [...rows];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    for (let i = 0; i < reordered.length; i += 1) {
      const row = reordered[i];
      const nextPriority = i + 1;
      if (row.priority !== nextPriority) {
        await updatePlanItem(uid, pid, row.id, { priority: nextPriority as any } as any);
      }
    }
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

  const planTagOptions = useMemo(() => {
    const tags = [...new Set(planWithPriority.flatMap((row) => row.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return [{ label: 'All tags', value: 'ALL' }, ...tags.map((tag) => ({ label: `#${tag}`, value: tag }))];
  }, [planWithPriority]);

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
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Budget Meta</Text>
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
        <Text className="text-xs text-muted-foreground">
          Auto targets: Needs {fmtMoney(autoTargets.needs)} · Wants {fmtMoney(autoTargets.wants)} · Savings {fmtMoney(autoTargets.sd)}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Plan targets: Needs {fmtMoney(planTotals.needs)} ({Math.round(planRealPct.needs)}%) · Wants {fmtMoney(planTotals.wants)} ({Math.round(planRealPct.wants)}%) · Savings {fmtMoney(planTotals.sd)} ({Math.round(planRealPct.sd)}%)
        </Text>
        {!readOnly ? (
          <View className="flex-row gap-2">
            <AppButton label="Save Title" onPress={saveTitle} variant="outline" />
            <AppButton label="Save Targets" onPress={saveTargets} variant="outline" />
          </View>
        ) : null}
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
        </AppCard>
      ) : null}

      {section === 'PLAN' ? (
        <View className="gap-3">
          <AppCard className="gap-2">
            <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
              {planSortMode === 'TAG' ? (
                <View className="w-full md:w-64">
                  <DropdownField value={planTagFilter} options={planTagOptions} onChange={setPlanTagFilter} placeholder="Filter by tag" menuStrategy="inline" />
                </View>
              ) : <View />}
              <AppSegmented
                value={planSortMode}
                onChange={(value) => setPlanSortMode(value as 'PRIORITY' | 'TAG')}
                compact
                options={[
                  { label: 'Priority', value: 'PRIORITY' },
                  { label: 'Tag', value: 'TAG' },
                ]}
              />
            </View>
          </AppCard>
          {PLAN_GROUP_OPTIONS.map((group) => {
            let rows = planWithPriority.filter((item) => item.group === group.value);
            if (planSortMode === 'TAG' && planTagFilter !== 'ALL') rows = rows.filter((item) => (item.tags || []).includes(planTagFilter));
            if (planSortMode === 'TAG') {
              rows = [...rows].sort((a, b) => {
                const ta = firstTag(a.tags);
                const tb = firstTag(b.tags);
                if (ta !== tb) return ta.localeCompare(tb);
                return a.priority - b.priority;
              });
            }
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

                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View className="min-w-[840px] flex-1">
                    <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                      <Text className={`${planCol.name} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Item Name</Text>
                      <Text className={`${planCol.tags} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Tags</Text>
                      <Text className={`${planCol.amount} text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Amount</Text>
                      <Text className={`${planCol.actions} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Actions</Text>
                    </View>

                    {rows.map((row) => {
                      const edit = planEdits[row.id];
                      if (!edit) return null;
                      const isEditing = planEditingId === row.id;
                      const dirty = edit.dirty;
                      const editTags = parseTagsInput(edit.tagsInput);
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
                          {readOnly ? (
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

                        <View className={`${planCol.tags} pr-2`}>
                          {readOnly ? (
                            <Text className="text-xs text-muted-foreground">{tagsLabel(row.tags)}</Text>
                          ) : isEditing ? (
                            <AppInput
                              value={edit.tagsInput}
                              onChangeText={(value) => setPlanEditField(row.id, { tagsInput: value })}
                              placeholder="utilities, groceries"
                              className="h-9"
                            />
                          ) : (
                            <Text className="text-xs text-muted-foreground">{tagsLabel(row.tags)}</Text>
                          )}
                          {!readOnly && isEditing && editTags.length ? <Text className="mt-1 text-xs text-muted-foreground">{tagsLabel(editTags)}</Text> : null}
                        </View>

                        <View className={`${planCol.amount} pr-2`}>
                          {readOnly ? (
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
                            isEditing ? (
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
              {hasInactiveIncome
                ? 'One or more income items are deactivated. Funding now runs Needs → Wants → Savings-Debt, then item priority inside each category.'
                : 'Funding follows item priority. Deactivate an income item to enforce category-first allocation order.'}
            </Text>
            {!readOnly ? (
              <Text className="text-xs text-muted-foreground">
                Drag rows by handle, or click a handle then click another row handle to drop.
              </Text>
            ) : null}
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
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View className="min-w-[1120px] flex-1">
                      <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                        <Text className="w-[52px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drag</Text>
                        <Text className="w-[56px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</Text>
                        <Text className="w-[250px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</Text>
                        <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</Text>
                        <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funded</Text>
                        <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unfunded</Text>
                        <Text className="w-[110px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</Text>
                        <Text className="w-[300px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</Text>
                        <Text className="w-[160px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</Text>
                      </View>

                      {rows.map((row) => {
                        const allocation = allocationByItemId[row.id];
                        const statusLabel = row.unfunded <= 0 ? 'Funded' : row.funded > 0 ? 'Partial' : 'Unfunded';
                        const statusVariant = row.unfunded <= 0 ? 'success' : row.funded > 0 ? 'warning' : 'danger';
                        const priorityMeta = priorityPositionByItemId[row.id];
                        const canDrag = Platform.OS === 'web' && !readOnly;
                        const canDropHere = !readOnly && Boolean(draggingPlanId) && draggingPlanId !== row.id;
                        return (
                          <View
                            key={row.id}
                            className={cn(
                              'flex-row items-center border-b border-border py-2 hover:bg-muted/35 dark:border-zinc-800 dark:hover:bg-zinc-800/55',
                              draggingPlanId === row.id ? 'bg-muted/30 dark:bg-zinc-800/30' : ''
                            )}
                            {...(canDrag
                              ? ({
                                  draggable: true,
                                  onDragStart: (event: any) => {
                                    setDraggingPlanId(row.id);
                                    if (event?.dataTransfer) {
                                      event.dataTransfer.effectAllowed = 'move';
                                      event.dataTransfer.setData('text/plain', row.id);
                                    }
                                  },
                                  onDragEnd: () => setDraggingPlanId(null),
                                  onDragOver: (event: any) => {
                                    event.preventDefault();
                                    if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
                                  },
                                  onDrop: (event: any) => {
                                    event.preventDefault();
                                    const sourceId =
                                      event?.dataTransfer?.getData?.('text/plain') || draggingPlanId || '';
                                    if (sourceId && sourceId !== row.id) {
                                      void reorderPriorityWithinGroupByDrop(row.group, sourceId, row.id);
                                    }
                                    setDraggingPlanId(null);
                                  },
                                } as any)
                              : {})}
                          >
                            <View className="w-[52px] items-center">
                              <Pressable
                                {...(canDrag
                                  ? ({
                                      draggable: true,
                                      onDragStart: (event: any) => {
                                        setDraggingPlanId(row.id);
                                        if (event?.dataTransfer) {
                                          event.dataTransfer.effectAllowed = 'move';
                                          event.dataTransfer.setData('text/plain', row.id);
                                        }
                                      },
                                      onDragEnd: () => setDraggingPlanId(null),
                                    } as any)
                                  : {})}
                                onPress={() => {
                                  if (readOnly) return;
                                  if (!draggingPlanId || draggingPlanId === row.id) {
                                    setDraggingPlanId(draggingPlanId === row.id ? null : row.id);
                                    return;
                                  }
                                  void reorderPriorityWithinGroupByDrop(row.group, draggingPlanId, row.id);
                                  setDraggingPlanId(null);
                                }}
                                className={cn(
                                  'h-8 w-8 items-center justify-center rounded-md',
                                  canDrag ? 'cursor-grab bg-muted/40 dark:bg-zinc-800/50' : '',
                                  !readOnly && draggingPlanId === row.id ? 'border border-primary/40 bg-primary/10 dark:bg-zinc-700/50' : ''
                                )}
                                {...({ title: canDropHere ? 'Drop here' : 'Pick row for drag' } as any)}
                              >
                                <MaterialCommunityIcons
                                  name="drag-horizontal-variant"
                                  size={18}
                                  color={canDrag ? '#717182' : '#A1A1AA'}
                                />
                              </Pressable>
                            </View>
                            <Text className="w-[56px] text-sm text-foreground dark:text-zinc-50">{row.fundingOrder}</Text>

                            <View className="w-[250px] pr-2">
                              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                              <Text className="text-xs text-muted-foreground">Priority {row.priority}</Text>
                              {row.tags?.length ? <Text className="text-xs text-muted-foreground">{tagsLabel(row.tags)}</Text> : null}
                            </View>

                            <Text className="w-[120px] text-right text-sm text-foreground dark:text-zinc-50">{fmtMoney(row.amount)}</Text>
                            <Text className="w-[120px] text-right text-sm font-semibold text-blue-700 dark:text-blue-300">{fmtMoney(row.funded)}</Text>
                            <Text className="w-[120px] text-right text-sm text-muted-foreground">{fmtMoney(row.unfunded)}</Text>

                            <View className="w-[110px] items-center">
                              <AppBadge label={statusLabel} variant={statusVariant as any} />
                            </View>

                            <View className="w-[300px] pr-2">
                              <DropdownField
                                value={allocation?.accountId ?? ''}
                                options={accountOptions}
                                onChange={(value) => assignAccount(row, value)}
                                disabled={readOnly}
                                placeholder="Select account"
                                className="w-full"
                                menuStrategy="inline"
                                menuClassName="min-w-[320px] max-h-52"
                                triggerClassName="bg-background dark:bg-zinc-900"
                              />
                            </View>

                            <View className="w-[160px] flex-row items-center justify-center gap-2">
                              {!readOnly ? (
                                <>
                                  {canDropHere ? (
                                    <IconActionButton
                                      icon="arrow-collapse-down"
                                      label="Drop here"
                                      onPress={() => {
                                        if (!draggingPlanId) return;
                                        void reorderPriorityWithinGroupByDrop(row.group, draggingPlanId, row.id);
                                        setDraggingPlanId(null);
                                      }}
                                    />
                                  ) : null}
                                  <IconActionButton
                                    icon="arrow-up"
                                    label="Move up"
                                    disabled={!priorityMeta || priorityMeta.index === 0}
                                    onPress={() => reorderPriorityWithinGroup(row.group, row.id, -1)}
                                  />
                                  <IconActionButton
                                    icon="arrow-down"
                                    label="Move down"
                                    disabled={!priorityMeta || priorityMeta.index >= priorityMeta.total - 1}
                                    onPress={() => reorderPriorityWithinGroup(row.group, row.id, 1)}
                                  />
                                </>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : (
                  <Text className="text-sm text-muted-foreground">No {group.label.toLowerCase()} items in this budget.</Text>
                )}
              </AppCard>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}
