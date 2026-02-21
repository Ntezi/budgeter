import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppProgressBar } from '@/components/ui/AppProgressBar';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { type PeriodDoc, periodTitleFromId, watchPeriods } from '@/lib/repo/periods';
import { fetchAccountsReport, fetchPeriodReport, type AccountReport, type PeriodReport } from '@/lib/repo/reports';
import { watchExpenses, type ExpenseItem } from '@/lib/repo/expenses';
import { buildWorkbook, exportWorkbook } from '@/lib/export';
import { fmtMoney } from '@/lib/format';
import { PieChart } from '@/components/components/PieChart';
import { Colors } from '@/lib/budget';
import { walletTagLabel } from '@/lib/domain';
import { useThemeMode } from '@/providers/ThemeProvider';

import { DropdownField } from '@/components/ui/DropdownField';
import { LineChart } from '@/components/components/LineChart';
import {
  watchShoppingListItems,
  watchShoppingLists,
  watchShoppingCatalog,
  watchPriceHistory,
  type ShoppingList,
  type ShoppingListItem,
  type ShoppingCatalogItem,
  type PriceHistoryEntry,
} from '@/lib/repo/shopping';

const CHART_COLORS = [Colors.needs, Colors.wants, Colors.sd];

type PeriodBehaviorInsight = {
  burnRatePct: number;
  planUtilizationPct: number;
  variance: number;
  txCount: number;
  averageTx: number;
  uncategorizedCount: number;
  shoppingTxCount: number;
  shoppingTxAmount: number;
  overspentCount: number;
  overspentAmount: number;
  topSpendName: string;
  topSpendAmount: number;
};

type BehaviorSignal = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
};

type BudgetWorkbookRows = {
  summaryRows: Record<string, unknown>[];
  incomeRows: Record<string, unknown>[];
  planRows: Record<string, unknown>[];
  transactionRows: Record<string, unknown>[];
  allocationRows: Record<string, unknown>[];
};

function toPct(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return (part / total) * 100;
}

function round1(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function toneClass(tone: BehaviorSignal['tone']) {
  if (tone === 'good') return 'text-emerald-700 dark:text-emerald-300';
  if (tone === 'warn') return 'text-amber-700 dark:text-amber-300';
  if (tone === 'bad') return 'text-red-700 dark:text-red-300';
  return 'text-foreground dark:text-zinc-50';
}

function analyzePeriodBehavior(report: PeriodReport): PeriodBehaviorInsight {
  const spentTotal = Math.max(0, Number(report.totals.transactions.total || 0));
  const incomeTotal = Math.max(0, Number(report.totals.incomeTotal || 0));
  const plannedTotal = Math.max(0, Number(report.totals.plan.total || 0));

  const byBudgetId = new Map<string, { name: string; planned: number; spent: number }>();
  const fallbackByName = new Map<string, number>();
  report.planItems.forEach((item) => {
    const id = String(item.id || '').trim();
    if (!id) return;
    byBudgetId.set(id, {
      name: item.name || id,
      planned: Math.max(0, Number(item.amount || 0)),
      spent: 0,
    });
  });

  let uncategorizedCount = 0;
  let shoppingTxCount = 0;
  let shoppingTxAmount = 0;

  report.transactions.forEach((row) => {
    const amount = Math.max(0, Number(row.amount || 0));
    const budgetId = String(row.categoryId || '').trim();
    const txName = String(row.name || '').trim() || 'Uncategorized';
    if (budgetId && byBudgetId.has(budgetId)) {
      const entry = byBudgetId.get(budgetId)!;
      entry.spent += amount;
    } else {
      fallbackByName.set(txName, (fallbackByName.get(txName) || 0) + amount);
    }
    if (!budgetId) uncategorizedCount += 1;
    if (row.shoppingListId || row.shoppingItemId) {
      shoppingTxCount += 1;
      shoppingTxAmount += amount;
    }
  });

  const overspentRows = Array.from(byBudgetId.values()).filter((row) => row.spent > row.planned);
  const overspentAmount = overspentRows.reduce((sum, row) => sum + (row.spent - row.planned), 0);

  const topBudgetSpend = Array.from(byBudgetId.values()).reduce(
    (best, row) => (row.spent > best.amount ? { name: row.name, amount: row.spent } : best),
    { name: '', amount: 0 }
  );
  const topFallbackSpend = Array.from(fallbackByName.entries()).reduce(
    (best, [name, amount]) => (amount > best.amount ? { name, amount } : best),
    { name: '', amount: 0 }
  );
  const topSpend = topFallbackSpend.amount > topBudgetSpend.amount ? topFallbackSpend : topBudgetSpend;

  return {
    burnRatePct: toPct(spentTotal, incomeTotal),
    planUtilizationPct: toPct(spentTotal, plannedTotal),
    variance: plannedTotal - spentTotal,
    txCount: report.transactions.length,
    averageTx: report.transactions.length ? spentTotal / report.transactions.length : 0,
    uncategorizedCount,
    shoppingTxCount,
    shoppingTxAmount,
    overspentCount: overspentRows.length,
    overspentAmount,
    topSpendName: topSpend.name,
    topSpendAmount: topSpend.amount,
  };
}

function buildBudgetWorkbookRows(report: PeriodReport): BudgetWorkbookRows {
  const accountById = new Map<string, PeriodReport['accounts'][number]>();
  report.accounts.forEach((account) => {
    if (account.id) accountById.set(account.id, account);
  });

  const allocationsBySource = new Map<string, PeriodReport['allocations'][number]>();
  report.allocations.forEach((row) => {
    if (!row.sourceType || !row.sourceItemId) return;
    allocationsBySource.set(`${row.sourceType}:${row.sourceItemId}`, row);
  });

  const summary = [
    { Metric: 'Period ID', Value: report.periodId },
    { Metric: 'Title', Value: report.period?.title ?? periodTitleFromId(report.periodId) },
    { Metric: 'Status', Value: report.period?.status ?? 'DRAFT' },
    { Metric: 'Income Total', Value: report.totals.incomeTotal },
    { Metric: 'Plan Total', Value: report.totals.plan.total },
    { Metric: 'Spent Total', Value: report.totals.transactions.total },
    { Metric: 'Remaining', Value: report.totals.incomeTotal - report.totals.transactions.total },
    { Metric: 'Allocations Total', Value: report.totals.allocations.total },
  ];

  const incomeRows = report.incomeItems.map((item) => {
    const allocation = item.id ? allocationsBySource.get(`INCOME:${item.id}`) : undefined;
    return {
      Name: item.name,
      Amount: item.amount || 0,
      Active: item.active === false ? 'No' : 'Yes',
      'Allocation Account': allocation ? accountById.get(allocation.accountId)?.name ?? allocation.accountId : '',
      'Allocation Amount': allocation?.amount ?? 0,
    };
  });

  const planRows = report.planItems.map((item) => {
    const allocation = item.id ? allocationsBySource.get(`PLAN:${item.id}`) : undefined;
    return {
      Group: item.group,
      Name: item.name,
      Amount: item.amount || 0,
      'Allocation Account': allocation ? accountById.get(allocation.accountId)?.name ?? allocation.accountId : '',
      'Allocation Amount': allocation?.amount ?? 0,
      Priority: (item as any).priority ?? '',
    };
  });

  const transactionRows = report.transactions.map((row) => ({
    Date: row.date ?? '',
    Name: row.name ?? '',
    Group: row.group,
    'Budget Item ID': row.categoryId ?? '',
    Amount: row.amount || 0,
    Note: row.note ?? '',
    'Shopping List': row.shoppingListName ?? '',
    'Shopping Item': row.shoppingItemName ?? '',
  }));

  const allocationRows = report.allocations.map((row) => ({
    Account: accountById.get(row.accountId)?.name ?? row.accountId,
    Tag: row.tag,
    Amount: row.amount || 0,
    'Source Type': row.sourceType ?? '',
    'Source Item': row.sourceItemName ?? '',
  }));

  return {
    summaryRows: summary,
    incomeRows,
    planRows,
    transactionRows,
    allocationRows,
  };
}

function buildBudgetWorkbook(report: PeriodReport) {
  const rows = buildBudgetWorkbookRows(report);
  return buildWorkbook({
    Summary: rows.summaryRows,
    Income: rows.incomeRows,
    Plan: rows.planRows,
    Transactions: rows.transactionRows,
    Allocations: rows.allocationRows,
  });
}

function buildShoppingRowsForPeriod(
  report: PeriodReport,
  shoppingLists: ShoppingList[],
  shoppingItemsByListId: Record<string, ShoppingListItem[]>
) {
  const planIds = new Set(
    report.planItems.map((item) => String(item.id || '').trim()).filter(Boolean)
  );
  const listNameById = new Map<string, string>();
  shoppingLists.forEach((list) => {
    if (!list.id) return;
    listNameById.set(list.id, list.name || list.id);
  });

  const shoppingTxRows = report.transactions
    .filter((row) => row.shoppingListId || row.shoppingItemId)
    .map((row) => ({
      Date: row.date ?? '',
      'Shopping List': row.shoppingListName ?? row.shoppingListId ?? '',
      'Shopping Item': row.shoppingItemName ?? row.shoppingItemId ?? '',
      'Budget Item': row.name ?? '',
      'Budget Item ID': row.categoryId ?? '',
      Group: row.group,
      Amount: row.amount || 0,
      Note: row.note ?? '',
    }));

  const shoppingOpenRows: Record<string, unknown>[] = [];
  Object.entries(shoppingItemsByListId).forEach(([listId, items]) => {
    const listName = listNameById.get(listId) || listId;
    items.forEach((item) => {
      const assignedPeriodId = String(item.assignedPeriodId || '').trim();
      const assignedPlanItemId = String(item.assignedPlanItemId || '').trim();
      const linkedByPeriod = assignedPeriodId === report.periodId;
      const linkedByPlan = !assignedPeriodId && assignedPlanItemId ? planIds.has(assignedPlanItemId) : false;
      if (!linkedByPeriod && !linkedByPlan) return;

      const quantity = Math.max(1, Number(item.quantity || 1));
      const unitPrice = Math.max(0, Number(item.price || 0));
      shoppingOpenRows.push({
        'Shopping List': listName,
        Item: item.name || '',
        Quantity: quantity,
        'Unit Price': unitPrice,
        'Estimated Total': unitPrice * quantity,
        Category: item.category || '',
        'Budget Item': item.assignedPlanItemName || '',
        'Budget Item ID': item.assignedPlanItemId || '',
        'Assigned Period': assignedPeriodId,
        Status: item.bought ? 'Bought' : 'Pending',
      });
    });
  });

  return { shoppingTxRows, shoppingOpenRows };
}

function buildCompleteBudgetWorkbook(params: {
  report: PeriodReport;
  accountReport: AccountReport | null;
  expenseRows: ExpenseItem[];
  shoppingLists: ShoppingList[];
  shoppingItemsByListId: Record<string, ShoppingListItem[]>;
}) {
  const { report, accountReport, expenseRows, shoppingLists, shoppingItemsByListId } = params;
  const baseRows = buildBudgetWorkbookRows(report);
  const periodInsights = analyzePeriodBehavior(report);
  const { shoppingTxRows, shoppingOpenRows } = buildShoppingRowsForPeriod(
    report,
    shoppingLists,
    shoppingItemsByListId
  );

  const walletAccountIds = new Set(report.walletAccounts.map((row) => row.accountId));
  const periodAllocationByAccount: Record<string, number> = {};
  report.allocations.forEach((row) => {
    const accountId = String(row.accountId || '').trim();
    if (!accountId) return;
    periodAllocationByAccount[accountId] = (periodAllocationByAccount[accountId] || 0) + (row.amount || 0);
  });

  const accountRows = report.accounts.map((account) => {
    const accountId = String(account.id || '').trim();
    const allTimeAllocated = accountId ? accountReport?.totalsByAccount[accountId] ?? 0 : 0;
    return {
      Account: account.name,
      Type: account.type ?? 'OTHER',
      'Opening Balance': account.openingBalance || 0,
      'In Budget Wallet': accountId && walletAccountIds.has(accountId) ? 'Yes' : 'No',
      'Budget Allocation': accountId ? periodAllocationByAccount[accountId] || 0 : 0,
      'All-time Allocation': allTimeAllocated,
      Archived: account.archived ? 'Yes' : 'No',
    };
  });

  const expenseExportRows = expenseRows.map((row) => ({
    Name: row.name,
    Group: row.group,
    Amount: row.amount || 0,
    Active: row.active === false ? 'No' : 'Yes',
    Tags: (row.tags || []).join(', '),
    Note: row.note || '',
  }));

  const reportRows = [
    { Area: 'Budget', Metric: 'Period ID', Value: report.periodId, Detail: '' },
    { Area: 'Budget', Metric: 'Title', Value: report.period?.title || periodTitleFromId(report.periodId), Detail: '' },
    { Area: 'Budget', Metric: 'Status', Value: report.period?.status ?? 'DRAFT', Detail: '' },
    { Area: 'Budget', Metric: 'Income', Value: report.totals.incomeTotal, Detail: '' },
    { Area: 'Budget', Metric: 'Planned', Value: report.totals.plan.total, Detail: '' },
    { Area: 'Budget', Metric: 'Spent', Value: report.totals.transactions.total, Detail: '' },
    { Area: 'Budget', Metric: 'Remaining', Value: report.totals.incomeTotal - report.totals.transactions.total, Detail: '' },
    { Area: 'Behavior', Metric: 'Burn Rate %', Value: round1(periodInsights.burnRatePct), Detail: 'Spent / Income' },
    { Area: 'Behavior', Metric: 'Plan Utilization %', Value: round1(periodInsights.planUtilizationPct), Detail: 'Spent / Planned' },
    { Area: 'Behavior', Metric: 'Plan Variance', Value: periodInsights.variance, Detail: 'Planned - Spent' },
    { Area: 'Behavior', Metric: 'Transactions', Value: periodInsights.txCount, Detail: '' },
    { Area: 'Behavior', Metric: 'Avg Transaction', Value: periodInsights.averageTx, Detail: '' },
    { Area: 'Behavior', Metric: 'Overspent Budget Items', Value: periodInsights.overspentCount, Detail: '' },
    { Area: 'Behavior', Metric: 'Overspent Amount', Value: periodInsights.overspentAmount, Detail: '' },
    { Area: 'Behavior', Metric: 'Shopping Tx Count', Value: periodInsights.shoppingTxCount, Detail: '' },
    { Area: 'Behavior', Metric: 'Shopping Tx Amount', Value: periodInsights.shoppingTxAmount, Detail: '' },
    { Area: 'Behavior', Metric: 'Uncategorized Tx Count', Value: periodInsights.uncategorizedCount, Detail: '' },
    {
      Area: 'Behavior',
      Metric: 'Top Spending Budget Item',
      Value: periodInsights.topSpendName || '',
      Detail: periodInsights.topSpendName ? String(periodInsights.topSpendAmount) : '',
    },
  ];

  const walletRows = report.walletAccounts.map((row) => ({
    'Account ID': row.accountId,
    Account: row.accountId,
  }));

  const accountTagRows = accountReport
    ? Object.entries(accountReport.totalsByTag).map(([tag, amount]) => ({
        Tag: walletTagLabel[tag as keyof typeof walletTagLabel] ?? tag,
        Amount: amount,
      }))
    : [];

  return buildWorkbook({
    Report: reportRows,
    Summary: baseRows.summaryRows,
    Income: baseRows.incomeRows,
    Plan: baseRows.planRows,
    Transactions: baseRows.transactionRows,
    Allocations: baseRows.allocationRows,
    Expenses: expenseExportRows,
    Accounts: accountRows,
    'Budget Wallet': walletRows,
    'Shopping Tx': shoppingTxRows,
    'Shopping Open': shoppingOpenRows,
    ...(accountTagRows.length ? { 'Account Tags': accountTagRows } : {}),
  });
}

function buildAccountsWorkbook(report: AccountReport) {
  const accountRows = report.accounts.map((account) => {
    const allocated = account.id ? report.totalsByAccount[account.id] ?? 0 : 0;
    return {
      Account: account.name,
      Type: account.type ?? 'OTHER',
      'Opening Balance': account.openingBalance || 0,
      'Allocated Total': allocated,
      'Computed Balance': (account.openingBalance || 0) + allocated,
      Archived: account.archived ? 'Yes' : 'No',
    };
  });

  const tagRows = Object.entries(report.totalsByTag).map(([tag, amount]) => ({
    Tag: walletTagLabel[tag as keyof typeof walletTagLabel] ?? tag,
    Amount: amount,
  }));

  const allocationRows = report.allocations.map((row) => ({
    Period: row.periodId,
    Account: row.accountId,
    Tag: row.tag,
    Amount: row.amount || 0,
    Source: row.sourceItemName ?? '',
  }));

  return buildWorkbook({
    Summary: [
      { Metric: 'Accounts', Value: report.accounts.length },
      { Metric: 'Opening Balance Total', Value: report.totals.openingBalance },
      { Metric: 'Allocated Total', Value: report.totals.allocated },
      { Metric: 'Computed Total', Value: report.totals.computed },
    ],
    Accounts: accountRows,
    'Allocations by Tag': tagRows,
    Allocations: allocationRows,
  });
}

export default function ReportsScreen() {
  const uid = useWorkspaceUid();
  const { theme } = useThemeMode();

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [reportsById, setReportsById] = useState<Record<string, PeriodReport>>({});
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});
  const [exportingById, setExportingById] = useState<Record<string, boolean>>({});
  const [fullExportingById, setFullExportingById] = useState<Record<string, boolean>>({});

  const [accountReport, setAccountReport] = useState<AccountReport | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountExporting, setAccountExporting] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);

  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [shoppingItemsByListId, setShoppingItemsByListId] = useState<Record<string, ShoppingListItem[]>>({});
  const [expenseRows, setExpenseRows] = useState<ExpenseItem[]>([]);

  const [catalog, setCatalog] = useState<ShoppingCatalogItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, setPeriods);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return watchShoppingCatalog(uid, setCatalog);
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedItemId) {
      setPriceHistory([]);
      return;
    }
    return watchPriceHistory(uid, selectedItemId, setPriceHistory);
  }, [uid, selectedItemId]);

  useEffect(() => {
    if (!uid) return;
    return watchExpenses(uid, setExpenseRows);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return watchShoppingLists(uid, setShoppingLists);
  }, [uid]);

  useEffect(() => {
    if (!uid || !shoppingLists.length) return;
    const unsubs = shoppingLists.map((list) => {
      if (!list.id) return () => {};
      return watchShoppingListItems(uid, list.id, (items) => {
        setShoppingItemsByListId((prev) => ({ ...prev, [list.id!]: items }));
      });
    });
    return () => unsubs.forEach((unsub) => unsub());
  }, [uid, shoppingLists]);

  const shoppingTotals = useMemo(() => {
    const allItems = Object.values(shoppingItemsByListId).flat();
    const completed = allItems.filter((row) => row.completed === true).length;
    const pending = allItems.filter((row) => row.completed !== true).length;
    const spent = allItems.reduce((sum, row) => sum + (row.completed ? row.cost || 0 : 0), 0);
    const totalPrice = allItems.reduce((sum, row) => {
      const quantity = Math.max(1, Number(row.quantity || 1));
      const estimated = Math.max(0, Number(row.price || 0)) * quantity;
      return sum + (row.completed ? row.cost || estimated : estimated);
    }, 0);
    return { completed, pending, spent, totalPrice };
  }, [shoppingItemsByListId]);

  const expenseTotals = useMemo(() => {
    const active = expenseRows.filter((row) => row.active !== false);
    const total = active.reduce((sum, row) => sum + (row.amount || 0), 0);
    return { count: expenseRows.length, activeCount: active.length, total };
  }, [expenseRows]);

  const itemOptions = useMemo(() => {
    return catalog
      .map((item) => ({ label: item.name, value: item.id || '' }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog]);

  const chartData = useMemo(() => {
    return priceHistory.map((row) => ({
      x: new Date(row.createdAt).toLocaleDateString(),
      y: row.price,
    }));
  }, [priceHistory]);

  const loadReport = useCallback(
    async (pid: string, force?: boolean) => {
      if (!uid) return undefined;
      if (!force && reportsById[pid]) return reportsById[pid];
      if (loadingById[pid]) return undefined;

      setLoadingById((prev) => ({ ...prev, [pid]: true }));
      try {
        const report = await fetchPeriodReport(uid, pid);
        setReportsById((prev) => ({ ...prev, [pid]: report }));
        return report;
      } catch (e: unknown) {
        Alert.alert('Report failed', e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setLoadingById((prev) => ({ ...prev, [pid]: false }));
      }
    },
    [uid, reportsById, loadingById]
  );

  useEffect(() => {
    if (!uid) return;
    setAccountLoading(true);
    fetchAccountsReport(uid)
      .then(setAccountReport)
      .catch((e: unknown) => Alert.alert('Account report failed', e instanceof Error ? e.message : String(e)))
      .finally(() => setAccountLoading(false));
  }, [uid]);

  const allocationTagChart = useMemo(() => {
    if (!accountReport) return [] as { x: string; y: number }[];
    return [
      { x: 'Needs', y: accountReport.totalsByTag.NEEDS || 0 },
      { x: 'Wants', y: accountReport.totalsByTag.WANTS || 0 },
      { x: 'Savings', y: accountReport.totalsByTag.SAVINGS || 0 },
    ];
  }, [accountReport]);

  const loadedReports = useMemo(
    () => periods.map((period) => reportsById[period.id]).filter(Boolean) as PeriodReport[],
    [periods, reportsById]
  );

  const portfolioTotals = useMemo(() => {
    return loadedReports.reduce(
      (acc, report) => {
        acc.income += report.totals.incomeTotal || 0;
        acc.planned += report.totals.plan.total || 0;
        acc.spent += report.totals.transactions.total || 0;
        acc.needs += report.totals.transactions.needs || 0;
        acc.wants += report.totals.transactions.wants || 0;
        acc.savings += report.totals.transactions.sd || 0;
        return acc;
      },
      { income: 0, planned: 0, spent: 0, needs: 0, wants: 0, savings: 0 }
    );
  }, [loadedReports]);

  const trendRows = useMemo(
    () =>
      loadedReports.map((report) => ({
        periodId: report.periodId,
        title: report.period?.title || periodTitleFromId(report.periodId),
        income: report.totals.incomeTotal || 0,
        spent: report.totals.transactions.total || 0,
        remaining: (report.totals.incomeTotal || 0) - (report.totals.transactions.total || 0),
      })),
    [loadedReports]
  );

  const categoryShare = useMemo(() => {
    const total = Math.max(portfolioTotals.spent, 1);
    return [
      { label: 'Needs', amount: portfolioTotals.needs, pct: (portfolioTotals.needs / total) * 100, color: 'bg-needs' },
      { label: 'Wants', amount: portfolioTotals.wants, pct: (portfolioTotals.wants / total) * 100, color: 'bg-wants' },
      { label: 'Savings-Debt', amount: portfolioTotals.savings, pct: (portfolioTotals.savings / total) * 100, color: 'bg-savings' },
    ];
  }, [portfolioTotals]);

  const behaviorSignals = useMemo<BehaviorSignal[]>(() => {
    const signals: BehaviorSignal[] = [];
    const income = Math.max(0, portfolioTotals.income);
    const spent = Math.max(0, portfolioTotals.spent);
    const planned = Math.max(0, portfolioTotals.planned);
    const burnRate = toPct(spent, income);
    signals.push({
      id: 'burn-rate',
      label: 'Budget Burn Rate',
      value: `${round1(burnRate)}%`,
      detail: `${fmtMoney(spent)} spent out of ${fmtMoney(income)} income.`,
      tone: loadedReports.length ? (burnRate <= 80 ? 'good' : burnRate <= 100 ? 'warn' : 'bad') : 'neutral',
    });

    const planGap = planned - spent;
    const planGapPct = toPct(Math.abs(planGap), Math.max(planned, 1));
    signals.push({
      id: 'plan-accuracy',
      label: 'Plan Accuracy',
      value: `${round1(planGapPct)}% gap`,
      detail:
        planGap >= 0
          ? `Spending is ${fmtMoney(planGap)} below plan.`
          : `Spending is ${fmtMoney(Math.abs(planGap))} above plan.`,
      tone: loadedReports.length ? (planGapPct <= 10 ? 'good' : planGapPct <= 25 ? 'warn' : 'bad') : 'neutral',
    });

    const avgLoadedIncome = loadedReports.length ? income / loadedReports.length : 0;
    const expensePressure = loadedReports.length ? toPct(expenseTotals.total, Math.max(avgLoadedIncome, 1)) : 0;
    signals.push({
      id: 'expense-pressure',
      label: 'Expense Pressure',
      value: `${round1(expensePressure)}%`,
      detail:
        loadedReports.length > 0
          ? `Active expense templates (${fmtMoney(expenseTotals.total)}) vs average loaded income (${fmtMoney(avgLoadedIncome)}).`
          : 'Load budgets to benchmark expense templates against income.',
      tone: loadedReports.length ? (expensePressure <= 45 ? 'good' : expensePressure <= 65 ? 'warn' : 'bad') : 'neutral',
    });

    const shoppingTotal = shoppingTotals.completed + shoppingTotals.pending;
    const shoppingCompletion = toPct(shoppingTotals.completed, Math.max(shoppingTotal, 1));
    signals.push({
      id: 'shopping-hygiene',
      label: 'Shopping Completion',
      value: `${round1(shoppingCompletion)}%`,
      detail:
        shoppingTotal > 0
          ? `${shoppingTotals.completed}/${shoppingTotal} shopping items completed.`
          : 'No shopping items yet.',
      tone: shoppingCompletion >= 80 ? 'good' : shoppingCompletion >= 60 ? 'warn' : shoppingTotal === 0 ? 'neutral' : 'bad',
    });

    const uncategorizedTx = loadedReports.reduce(
      (sum, report) => sum + report.transactions.filter((row) => !String(row.categoryId || '').trim()).length,
      0
    );
    signals.push({
      id: 'transaction-quality',
      label: 'Transaction Classification',
      value: `${uncategorizedTx}`,
      detail:
        loadedReports.length > 0
          ? 'Transactions without budget-item mapping across loaded budgets.'
          : 'Load budgets to check transaction classification quality.',
      tone: loadedReports.length ? (uncategorizedTx === 0 ? 'good' : uncategorizedTx <= 5 ? 'warn' : 'bad') : 'neutral',
    });

    return signals;
  }, [expenseTotals.total, loadedReports, portfolioTotals, shoppingTotals.completed, shoppingTotals.pending]);

  async function exportBudget(pid: string) {
    if (!uid || exportingById[pid]) return;
    setExportingById((prev) => ({ ...prev, [pid]: true }));
    try {
      const report = reportsById[pid] ?? (await loadReport(pid));
      if (!report) return;
      await exportWorkbook(buildBudgetWorkbook(report), `budget_${pid}`);
    } catch (e: unknown) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExportingById((prev) => ({ ...prev, [pid]: false }));
    }
  }

  async function exportAccounts() {
    if (!uid || accountExporting) return;
    setAccountExporting(true);
    try {
      const report = accountReport ?? (await fetchAccountsReport(uid));
      if (!accountReport) setAccountReport(report);
      await exportWorkbook(buildAccountsWorkbook(report), 'accounts_summary');
    } catch (e: unknown) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setAccountExporting(false);
    }
  }

  async function exportCompleteBudget(pid: string) {
    if (!uid || fullExportingById[pid]) return;
    setFullExportingById((prev) => ({ ...prev, [pid]: true }));
    try {
      const report = reportsById[pid] ?? (await loadReport(pid));
      if (!report) return;
      const accountSnapshot = accountReport ?? (await fetchAccountsReport(uid));
      if (!accountReport) setAccountReport(accountSnapshot);
      await exportWorkbook(
        buildCompleteBudgetWorkbook({
          report,
          accountReport: accountSnapshot,
          expenseRows,
          shoppingLists,
          shoppingItemsByListId,
        }),
        `budget_${pid}_full`
      );
    } catch (e: unknown) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setFullExportingById((prev) => ({ ...prev, [pid]: false }));
    }
  }

  async function loadLatestReports() {
    if (!periods.length || loadingLatest) return;
    setLoadingLatest(true);
    try {
      const latest = periods.slice(0, 6).map((period) => period.id);
      await Promise.all(latest.map((pid) => loadReport(pid, true)));
    } finally {
      setLoadingLatest(false);
    }
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Reports</Text>
        <Text className="text-sm text-muted-foreground">Track budgeting behavior and export complete selected-budget workbooks.</Text>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <AppCard className="gap-2">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Expense Summary</Text>
          <View className="grid grid-cols-3 gap-2">
            <View className="rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">Templates</Text>
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{expenseTotals.count}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</Text>
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{expenseTotals.activeCount}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">Active Total</Text>
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{fmtMoney(expenseTotals.total)}</Text>
            </View>
          </View>
        </AppCard>

        <AppCard className="gap-2">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Shopping Summary</Text>
          <View className="grid grid-cols-4 gap-2">
            <View className="rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">Pending</Text>
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{shoppingTotals.pending}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed</Text>
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{shoppingTotals.completed}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">Spent</Text>
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{fmtMoney(shoppingTotals.spent)}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Est.</Text>
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{fmtMoney(shoppingTotals.totalPrice)}</Text>
            </View>
          </View>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <View>
          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Behavior Signals</Text>
          <Text className="text-xs text-muted-foreground">Insights across budgeting, expenses, transactions, and shopping quality.</Text>
        </View>
        <View className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {behaviorSignals.map((signal) => (
            <View key={signal.id} className="rounded-md border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-xs uppercase tracking-wide text-muted-foreground">{signal.label}</Text>
                <Text className={`text-sm font-semibold ${toneClass(signal.tone)}`}>{signal.value}</Text>
              </View>
              <Text className="mt-1 text-xs text-muted-foreground">{signal.detail}</Text>
            </View>
          ))}
        </View>
      </AppCard>

      <AppCard className="gap-4">
        <View>
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Shopping Price Trends</Text>
          <Text className="text-xs text-muted-foreground">Select an item to see its price history.</Text>
        </View>
        
        <View className="w-full md:w-80">
          <DropdownField
            value={selectedItemId}
            options={[{ label: 'Select an item...', value: '' }, ...itemOptions]}
            onChange={setSelectedItemId}
            placeholder="Select an item..."
            menuStrategy="inline"
          />
        </View>

        {selectedItemId && chartData.length > 0 ? (
          <View>
            <LineChart
              data={chartData}
              lineColor={theme === 'dark' ? '#22C55E' : '#16A34A'}
              axisColor={theme === 'dark' ? '#A1A1AA' : '#717182'}
            />
          </View>
        ) : selectedItemId ? (
          <Text className="text-sm text-muted-foreground py-4">No price history available for this item.</Text>
        ) : null}
      </AppCard>

      <AppCard className="gap-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View>
            <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Accounts Summary</Text>
            <Text className="text-xs text-muted-foreground">All-time totals by account and allocation tag.</Text>
          </View>
          <AppButton
            label={accountExporting ? 'Exporting...' : 'Export Excel'}
            onPress={exportAccounts}
            disabled={accountExporting || accountLoading}
            variant="outline"
          />
        </View>

        {accountLoading ? <Text className="text-sm text-muted-foreground">Loading account summary...</Text> : null}

        {accountReport ? (
          <View className="gap-4">
            <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <AppCard className="p-3">
                <Text className="text-xs uppercase tracking-wide text-muted-foreground">Opening</Text>
                <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">
                  {fmtMoney(accountReport.totals.openingBalance)}
                </Text>
              </AppCard>
              <AppCard className="p-3">
                <Text className="text-xs uppercase tracking-wide text-muted-foreground">Allocated</Text>
                <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">
                  {fmtMoney(accountReport.totals.allocated)}
                </Text>
              </AppCard>
              <AppCard className="p-3">
                <Text className="text-xs uppercase tracking-wide text-muted-foreground">Computed</Text>
                <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">
                  {fmtMoney(accountReport.totals.computed)}
                </Text>
              </AppCard>
            </View>

            <View>
              <Text className="mb-2 text-sm font-semibold text-foreground dark:text-zinc-50">Allocation mix by tag</Text>
              <PieChart
                data={allocationTagChart}
                total={Math.max(accountReport.totals.allocated, 1)}
                colors={CHART_COLORS}
                labelColor={theme === 'dark' ? '#FAFAFA' : '#09090B'}
              />
            </View>
          </View>
        ) : (
          !accountLoading && <Text className="text-sm text-muted-foreground">No accounts report available yet.</Text>
        )}
      </AppCard>

      <AppCard className="gap-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View>
            <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Portfolio Summary</Text>
            <Text className="text-xs text-muted-foreground">Cross-budget totals and trend analytics.</Text>
          </View>
          <AppButton
            label={loadingLatest ? 'Loading...' : 'Load Latest 6 Budgets'}
            onPress={() => void loadLatestReports()}
            variant="outline"
            disabled={loadingLatest || !periods.length}
          />
        </View>

        <View className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <AppCard className="p-3">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Loaded Budgets</Text>
            <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{loadedReports.length}</Text>
          </AppCard>
          <AppCard className="p-3">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Income</Text>
            <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{fmtMoney(portfolioTotals.income)}</Text>
          </AppCard>
          <AppCard className="p-3">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Spent</Text>
            <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{fmtMoney(portfolioTotals.spent)}</Text>
          </AppCard>
          <AppCard className="p-3">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</Text>
            <Text
              className={`text-lg font-semibold ${
                portfolioTotals.income - portfolioTotals.spent >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
              }`}
            >
              {fmtMoney(portfolioTotals.income - portfolioTotals.spent)}
            </Text>
          </AppCard>
        </View>

        {loadedReports.length ? (
          <>
            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Category Spend Share</Text>
              {categoryShare.map((row) => (
                <View key={row.label} className="gap-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-foreground dark:text-zinc-50">{row.label}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {fmtMoney(row.amount)} · {Math.round(row.pct)}%
                    </Text>
                  </View>
                  <AppProgressBar value={row.pct} indicatorClassName={row.color} />
                </View>
              ))}
            </View>

            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Monthly Trend</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="min-w-[560px] rounded-md border border-border dark:border-zinc-800">
                  <View className="flex-row border-b border-border px-3 py-2 dark:border-zinc-800">
                    <Text className="w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Period</Text>
                    <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income</Text>
                    <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spent</Text>
                    <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remaining</Text>
                  </View>
                  {trendRows.map((row) => (
                    <View key={row.periodId} className="flex-row border-b border-border px-3 py-2 last:border-b-0 dark:border-zinc-800">
                      <View className="w-[180px]">
                        <Text className="text-sm text-foreground dark:text-zinc-50">{row.title}</Text>
                        <Text className="text-xs text-muted-foreground">{row.periodId}</Text>
                      </View>
                      <Text className="w-[120px] text-right text-sm text-foreground dark:text-zinc-50">{fmtMoney(row.income)}</Text>
                      <Text className="w-[120px] text-right text-sm text-foreground dark:text-zinc-50">{fmtMoney(row.spent)}</Text>
                      <Text className={`w-[120px] text-right text-sm ${row.remaining >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {fmtMoney(row.remaining)}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </>
        ) : (
          <Text className="text-sm text-muted-foreground">Load budgets to view aggregate trend reports.</Text>
        )}
      </AppCard>

      <View className="gap-3">
        {periods.map((period) => {
          const report = reportsById[period.id];
          const loading = loadingById[period.id];
          const exporting = exportingById[period.id];
          const fullExporting = fullExportingById[period.id];
          const title = period.title ?? periodTitleFromId(period.id);
          const remaining = report ? report.totals.incomeTotal - report.totals.transactions.total : 0;
          const periodInsight = report ? analyzePeriodBehavior(report) : null;

          return (
            <AppCard key={period.id} className="gap-3">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <View>
                  <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{title}</Text>
                  <View className="mt-1 flex-row items-center gap-2">
                    <Text className="text-xs text-muted-foreground">{period.id}</Text>
                    <AppBadge label={period.status ?? 'DRAFT'} variant={period.status === 'DECIDED' ? 'secondary' : 'success'} />
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <AppButton
                    label={loading ? 'Loading...' : 'Refresh'}
                    onPress={() => void loadReport(period.id, true)}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                  />
                  <AppButton
                    label={exporting ? 'Exporting...' : 'Export Core'}
                    onPress={() => void exportBudget(period.id)}
                    variant="outline"
                    size="sm"
                    disabled={exporting || loading || fullExporting}
                  />
                  <AppButton
                    label={fullExporting ? 'Exporting...' : 'Export Full'}
                    onPress={() => void exportCompleteBudget(period.id)}
                    variant="outline"
                    size="sm"
                    disabled={fullExporting || loading || exporting}
                  />
                </View>
              </View>

              {report ? (
                <View className="gap-2">
                  <View className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <AppCard className="p-3">
                      <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Income</Text>
                      <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{fmtMoney(report.totals.incomeTotal)}</Text>
                    </AppCard>
                    <AppCard className="p-3">
                      <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Planned</Text>
                      <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{fmtMoney(report.totals.plan.total)}</Text>
                    </AppCard>
                    <AppCard className="p-3">
                      <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Spent</Text>
                      <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{fmtMoney(report.totals.transactions.total)}</Text>
                    </AppCard>
                    <AppCard className="p-3">
                      <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Remaining</Text>
                      <Text className={`text-base font-semibold ${remaining >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {fmtMoney(remaining)}
                      </Text>
                    </AppCard>
                  </View>

                  {periodInsight ? (
                    <>
                      <View className="grid grid-cols-1 gap-2 md:grid-cols-4">
                        <AppCard className="p-3">
                          <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Burn Rate</Text>
                          <Text className={`text-base font-semibold ${periodInsight.burnRatePct <= 100 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                            {round1(periodInsight.burnRatePct)}%
                          </Text>
                        </AppCard>
                        <AppCard className="p-3">
                          <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Plan Use</Text>
                          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">
                            {round1(periodInsight.planUtilizationPct)}%
                          </Text>
                        </AppCard>
                        <AppCard className="p-3">
                          <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Transactions</Text>
                          <Text className="text-base font-semibold text-foreground dark:text-zinc-50">
                            {periodInsight.txCount} · {fmtMoney(periodInsight.averageTx)} avg
                          </Text>
                        </AppCard>
                        <AppCard className="p-3">
                          <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Overspent Items</Text>
                          <Text className={`text-base font-semibold ${periodInsight.overspentCount ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                            {periodInsight.overspentCount} · {fmtMoney(periodInsight.overspentAmount)}
                          </Text>
                        </AppCard>
                      </View>

                      <View className="rounded-md border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                        <Text className="text-xs text-foreground dark:text-zinc-100">
                          Top spending item: {periodInsight.topSpendName || 'None'} {periodInsight.topSpendName ? `(${fmtMoney(periodInsight.topSpendAmount)})` : ''}
                        </Text>
                        <Text className="mt-1 text-xs text-muted-foreground">
                          Shopping-linked transactions: {periodInsight.shoppingTxCount} ({fmtMoney(periodInsight.shoppingTxAmount)})
                        </Text>
                        <Text className="mt-1 text-xs text-muted-foreground">
                          Uncategorized transactions: {periodInsight.uncategorizedCount}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              ) : (
                <Text className="text-sm text-muted-foreground">Load details to view this period’s report and export workbook.</Text>
              )}
            </AppCard>
          );
        })}

        {!periods.length ? (
          <AppCard>
            <Text className="text-sm text-muted-foreground">No budgets found. Create a budget first.</Text>
          </AppCard>
        ) : null}
      </View>
    </ScrollView>
  );
}
