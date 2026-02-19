import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useAuthUser } from '@/providers/AuthProvider';
import { type PeriodDoc, periodTitleFromId, watchPeriods } from '@/lib/repo/periods';
import { fetchAccountsReport, fetchPeriodReport, type AccountReport, type PeriodReport } from '@/lib/repo/reports';
import { buildWorkbook, exportWorkbook } from '@/lib/export';
import { fmtMoney } from '@/lib/format';
import { PieChart } from '@/components/components/PieChart';
import { Colors } from '@/lib/budget';
import { walletTagLabel } from '@/lib/domain';
import { useThemeMode } from '@/providers/ThemeProvider';

const CHART_COLORS = [Colors.needs, Colors.wants, Colors.sd];

function buildBudgetWorkbook(report: PeriodReport) {
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
    Amount: row.amount || 0,
    Note: row.note ?? '',
  }));

  const allocationRows = report.allocations.map((row) => ({
    Account: accountById.get(row.accountId)?.name ?? row.accountId,
    Tag: row.tag,
    Amount: row.amount || 0,
    'Source Type': row.sourceType ?? '',
    'Source Item': row.sourceItemName ?? '',
  }));

  return buildWorkbook({
    Summary: summary,
    Income: incomeRows,
    Plan: planRows,
    Transactions: transactionRows,
    Allocations: allocationRows,
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
  const uid = useAuthUser()?.uid;
  const { theme } = useThemeMode();

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [reportsById, setReportsById] = useState<Record<string, PeriodReport>>({});
  const [loadingById, setLoadingById] = useState<Record<string, boolean>>({});
  const [exportingById, setExportingById] = useState<Record<string, boolean>>({});

  const [accountReport, setAccountReport] = useState<AccountReport | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountExporting, setAccountExporting] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, setPeriods);
  }, [uid]);

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

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Reports</Text>
        <Text className="text-sm text-muted-foreground">Export budgets to Excel and inspect allocations/account summaries.</Text>
      </View>

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

      <View className="gap-3">
        {periods.map((period) => {
          const report = reportsById[period.id];
          const loading = loadingById[period.id];
          const exporting = exportingById[period.id];
          const title = period.title ?? periodTitleFromId(period.id);
          const remaining = report ? report.totals.incomeTotal - report.totals.transactions.total : 0;

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
                    label={exporting ? 'Exporting...' : 'Export'}
                    onPress={() => void exportBudget(period.id)}
                    variant="outline"
                    size="sm"
                    disabled={exporting || loading}
                  />
                </View>
              </View>

              {report ? (
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
