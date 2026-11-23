import { uniqueMonthLabels } from '@/lib/chart';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSheet } from '@/components/patterns/AppSheet';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState, LoadingState } from '@/components/patterns/States';
import { Disclosure, LabelValue, PricesCard, ReportCard, SpendBreakdownCard, TrendCard, type ShareRow, type TrendRange } from '@/components/reports/ReportCards';
import { ExportSheet } from '@/components/reports/ExportSheet';
import { addMonthsToId } from '@/lib/rules/months';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { type PeriodDoc, periodIdFromDate, periodTitleFromId, watchPeriods } from '@/lib/repo/periods';
import { fetchAccountsReport, fetchPeriodReport, type AccountReport, type PeriodReport } from '@/lib/repo/reports';
import { watchExpenses, type ExpenseItem } from '@/lib/repo/expenses';
import { buildWorkbook, exportWorkbook } from '@/lib/export';
import { fmtMoney } from '@/lib/format';
import { walletTagLabel } from '@/lib/domain';
import { useThemeMode } from '@/providers/ThemeProvider';
import { transactionSignedBudgetAmount } from '@/lib/accounting';

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
import { watchAccounts } from '@/lib/repo/accounts';


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
    const amount = Math.max(0, transactionSignedBudgetAmount(row));
    if (!amount) return;
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
    Type: row.type || 'EXPENSE',
    Date: row.date ?? '',
    Name: row.name ?? '',
    Group: row.group,
    'Budget Item ID': row.planItemId ?? row.categoryId ?? '',
    'Paid From Account': row.paidFromAccountId ?? row.accountId ?? '',
    'Transfer To Account': row.toAccountId ?? '',
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
    const allTimeSpent = accountId ? accountReport?.spendingByAccount[accountId] ?? 0 : 0;
    const realCurrent = accountId
      ? (accountReport?.currentByAccount[accountId] ?? (account.openingBalance || 0))
      : (account.openingBalance || 0);
    return {
      Account: account.name,
      Type: account.type ?? 'OTHER',
      'Opening Balance': account.openingBalance || 0,
      'In Budget Wallet': accountId && walletAccountIds.has(accountId) ? 'Yes' : 'No',
      'Budget Allocation': accountId ? periodAllocationByAccount[accountId] || 0 : 0,
      'All-time Allocation': allTimeAllocated,
      'All-time Spent': allTimeSpent,
      'Real Current': realCurrent,
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
    const spent = account.id ? report.spendingByAccount[account.id] ?? 0 : 0;
    const realCurrent = account.id
      ? (report.currentByAccount[account.id] ?? (account.openingBalance || 0))
      : (account.openingBalance || 0);
    return {
      Account: account.name,
      Type: account.type ?? 'OTHER',
      'Opening Balance': account.openingBalance || 0,
      'Allocated Total': allocated,
      'Spent Total': spent,
      'Real Current': realCurrent,
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
      { Metric: 'Spent Total', Value: report.totals.spent },
      { Metric: 'Real Current Total', Value: report.totals.current },
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
  const [accountsVersion, setAccountsVersion] = useState(0);

  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [shoppingItemsByListId, setShoppingItemsByListId] = useState<Record<string, ShoppingListItem[]>>({});
  const [expenseRows, setExpenseRows] = useState<ExpenseItem[]>([]);

  const [catalog, setCatalog] = useState<ShoppingCatalogItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  // BUDG-8 S14: viewed month from the MonthChip, trend range, export sheet.
  const params = useLocalSearchParams<{ month?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const exportSheet = useSheet();
  const [range, setRange] = useState<TrendRange>('6');
  const [exportError, setExportError] = useState('');
  const [periodsLoaded, setPeriodsLoaded] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, (rows) => {
      setPeriods(rows);
      setPeriodsLoaded(true);
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return watchAccounts(
      uid,
      () => {
        setAccountsVersion((prev) => prev + 1);
      },
      { includeArchived: true }
    );
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


  const priceTrend = useMemo(() => {
    if (!priceHistory.length) return null;
    const prices = priceHistory.map((row) => Math.max(0, Number(row.price || 0)));
    const quantities = priceHistory.map((row) => Math.max(0, Number(row.quantity || 0)));
    const first = prices[0] || 0;
    const latest = prices[prices.length - 1] || 0;
    const previous = prices.length > 1 ? prices[prices.length - 2] || 0 : 0;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
    const averageQuantity = quantities.reduce((sum, value) => sum + value, 0) / quantities.length;
    const previousChange = prices.length > 1 ? latest - previous : 0;
    const previousChangePct = previous > 0 ? (previousChange / previous) * 100 : 0;
    const totalChange = latest - first;
    const totalChangePct = first > 0 ? (totalChange / first) * 100 : 0;
    return {
      count: priceHistory.length,
      latest,
      min,
      max,
      average,
      averageQuantity,
      range: max - min,
      previousChange,
      previousChangePct,
      totalChange,
      totalChangePct,
      lastDate: priceHistory[priceHistory.length - 1]?.createdAt,
    };
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
  }, [uid, accountsVersion]);

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
      setExportError("The file couldn't be made. Try again.");
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
      setExportError("The file couldn't be made. Try again.");
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
      setExportError("The file couldn't be made. Try again.");
    } finally {
      setFullExportingById((prev) => ({ ...prev, [pid]: false }));
    }
  }


  // ---- BUDG-8 S14 layout (08-reports-export.md); the calculations above are unchanged ----
  const monthParam = typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month) ? params.month : '';
  const pid = monthParam || periodIdFromDate();
  const monthLabel = periodTitleFromId(pid);
  const monthName = monthLabel.split(' ')[0];
  const period = periods.find((row) => row.id === pid);
  const report = reportsById[pid];
  const lineColor = theme === 'dark' ? '#22C55E' : '#16A34A';
  const axisColor = theme === 'dark' ? '#A1A1AA' : '#717182';

  // Data refreshes on open: the viewed month and the trend range load without a button.
  useEffect(() => {
    if (period) void loadReport(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, period?.id]);
  useEffect(() => {
    periods.slice(0, Number(range)).forEach((row) => {
      if (!reportsById[row.id]) void loadReport(row.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, range]);

  const spentNow = report?.totals.transactions.total || 0;
  const shareRows: ShareRow[] = report
    ? [
        { label: 'Needs', amount: report.totals.transactions.needs || 0, color: 'bg-needs' },
        { label: 'Wants', amount: report.totals.transactions.wants || 0, color: 'bg-wants' },
        { label: 'Savings', amount: report.totals.transactions.sd || 0, color: 'bg-savings' },
      ].map((row) => ({ ...row, pct: (row.amount / Math.max(spentNow, 1)) * 100 }))
    : [];
  const insight = report ? analyzePeriodBehavior(report) : null;

  const trendRows = periods
    .slice(0, Number(range))
    .filter((row) => reportsById[row.id])
    .reverse();
  const trendLabels = uniqueMonthLabels(trendRows.map((row) => row.id), periodTitleFromId);
  const trendPoints = trendRows.map((row, i) => ({ x: trendLabels[i], y: reportsById[row.id].totals.transactions.total || 0 }));
  const prevId = addMonthsToId(pid, -1);
  const prevReport = reportsById[prevId];
  let trendSentence = 'Spending per month for the months you have.';
  if (report && prevReport) {
    const prevSpent = prevReport.totals.transactions.total || 0;
    const diff = spentNow - prevSpent;
    const pct = prevSpent > 0 ? Math.round((Math.abs(diff) / prevSpent) * 100) : 0;
    trendSentence =
      diff === 0 || pct === 0
        ? `Spent about the same as ${periodTitleFromId(prevId).split(' ')[0]}.`
        : `Spent ${pct}% ${diff < 0 ? 'less' : 'more'} than ${periodTitleFromId(prevId).split(' ')[0]}.`;
  }

  function runMonthExport(kind: 'summary' | 'everything') {
    setExportError('');
    void (kind === 'summary' ? exportBudget(pid) : exportCompleteBudget(pid));
  }

  const exportButton = (
    <AppButton label="Export" accessibilityLabel="Export" size="touch" variant={desktop ? 'primary' : 'outline'} onPress={(e) => exportSheet.show(e)} />
  );
  const cardWrap = 'min-w-0 lg:basis-[48%] lg:grow';

  return (
    <View testID="reports" className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-8">
        <PageHeader
          title="Reports"
          right={
            <>
              {period?.status === 'DECIDED' ? <AppBadge label="Closed" variant="secondary" /> : null}
              {desktop ? exportButton : null}
            </>
          }
        />
        <View className="w-full gap-6 md:max-w-2xl lg:max-w-none lg:flex-row lg:flex-wrap">
          {periodsLoaded && !period ? (
            <View className={cardWrap}>
              <EmptyState
                testID="report-not-started"
                message={`No plan or spending for ${monthName}.`}
                actionLabel={`Plan ${monthName}`}
                onAction={() => router.push(`/budgets?month=${pid}`)}
              />
            </View>
          ) : (
            <View className={cardWrap}>
              <SpendBreakdownCard
                title={`Where did ${monthName}'s money go?`}
                loading={!report}
                spent={spentNow}
                rows={shareRows}
                topLine={insight && insight.topSpendName ? { name: insight.topSpendName, amount: insight.topSpendAmount } : undefined}
                byTag={allocationTagChart}
              />
            </View>
          )}
          <View className={cardWrap}>
            <TrendCard range={range} onRange={setRange} loading={periods.slice(0, Number(range)).some((row) => loadingById[row.id])} points={trendPoints} sentence={trendSentence} lineColor={lineColor} axisColor={axisColor} />
          </View>
          {period ? (
            <View className={cardWrap}>
              <ReportCard title="Did we stick to the plan?" testID="report-plan">
                {insight && report ? (
                  <View className="gap-1">
                    <LabelValue
                      label="Lines over plan"
                      value={String(insight.overspentCount)}
                      sub={insight.overspentCount ? `${fmtMoney(insight.overspentAmount)} over in total` : 'None so far'}
                      onPress={() => router.push(`/budgets/${pid}`)}
                    />
                    <LabelValue label="Planned vs spent" value={`${round1(insight.planUtilizationPct)}%`} />
                    <LabelValue label="Left from income" value={fmtMoney((report.totals.incomeTotal || 0) - spentNow)} />
                  </View>
                ) : (
                  <LoadingState rows={2} />
                )}
                <Disclosure label="How we calculate">
                  <View className="gap-2">
                    <Text className="text-sm text-muted-foreground dark:text-zinc-400">Across the months in the comparison above.</Text>
                    {behaviorSignals.map((signal) => (
                      <LabelValue key={signal.id} label={signal.label} value={signal.value} sub={signal.detail} valueClassName={toneClass(signal.tone)} />
                    ))}
                  </View>
                </Disclosure>
              </ReportCard>
            </View>
          ) : null}
          <View className={cardWrap}>
            <PricesCard
              options={itemOptions}
              value={selectedItemId}
              onPick={setSelectedItemId}
              points={chartData}
              latest={
                priceTrend
                  ? { price: priceTrend.latest, change: priceTrend.previousChange, changePct: priceTrend.previousChangePct, min: priceTrend.min, max: priceTrend.max, count: priceTrend.count }
                  : undefined
              }
              onCatalog={() => router.push('/shopping-items')}
              lineColor={lineColor}
              axisColor={axisColor}
            />
          </View>
        </View>
        <View className="w-full gap-6 md:max-w-2xl lg:max-w-none">
          <View className="rounded-xl border border-border bg-card px-4 dark:border-zinc-800 dark:bg-zinc-900">
            <LabelValue label="Accounts" value="Balances" onPress={() => router.push('/accounts')} />
          </View>
          {!desktop ? (
            <View testID="report-export" className="gap-3 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <Text role="heading" aria-level={2} className="text-lg font-semibold text-foreground dark:text-zinc-50">Export</Text>
              <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`${monthLabel} workbook and the accounts workbook, as .xlsx files.`}</Text>
              {exportButton}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <ExportSheet
        open={exportSheet.open}
        onClose={() => exportSheet.hide()}
        monthLabel={monthLabel}
        busyMonth={Boolean(exportingById[pid] || fullExportingById[pid] || loadingById[pid])}
        busyAccounts={accountExporting || accountLoading}
        error={exportError}
        onMonth={runMonthExport}
        onAccounts={() => {
          setExportError('');
          void exportAccounts();
        }}
      />
    </View>
  );
}
