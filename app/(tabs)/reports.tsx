import {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, Button, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {periodTitleFromId, watchPeriods, type PeriodDoc} from '@/lib/repo/periods';
import {
  fetchAccountsReport,
  fetchPeriodReport,
  type AccountReport,
  type PeriodReport,
} from '@/lib/repo/reports';
import {buildWorkbook, exportWorkbook} from '@/lib/export';
import {fmtMoney} from '@/lib/format';
import {AccordionSection} from '@/components/AccordionSection';
import {EmptyState} from '@/components/EmptyState';
import {StatCard} from '@/components/StatCard';
import {PieChart} from '@/components/components/PieChart';
import {Colors} from '@/lib/budget';
import {walletTagLabel} from '@/lib/domain';

const CHART_COLORS = [Colors.needs, Colors.wants, Colors.sd];

function buildBudgetWorkbook(report: PeriodReport) {
  const accountById = new Map<string, PeriodReport['accounts'][number]>();
  for (const account of report.accounts) {
    if (account.id) accountById.set(account.id, account);
  }

  const allocationsBySource = new Map<string, PeriodReport['allocations'][number]>();
  for (const allocation of report.allocations) {
    if (allocation.sourceType && allocation.sourceItemId) {
      allocationsBySource.set(`${allocation.sourceType}:${allocation.sourceItemId}`, allocation);
    }
  }

  const remaining = report.totals.incomeTotal - report.totals.transactions.total;
  const plannedRemaining = report.totals.incomeTotal - report.totals.plan.total;

  const summaryRows = [
    {Metric: 'Period ID', Value: report.periodId},
    {Metric: 'Title', Value: report.period?.title ?? periodTitleFromId(report.periodId)},
    {Metric: 'Status', Value: report.period?.status ?? 'DRAFT'},
    {Metric: 'Income Total', Value: report.totals.incomeTotal},
    {Metric: 'Plan Total', Value: report.totals.plan.total},
    {Metric: 'Spent Total', Value: report.totals.transactions.total},
    {Metric: 'Remaining (Income - Spent)', Value: remaining},
    {Metric: 'Planned Remaining (Income - Plan)', Value: plannedRemaining},
    {Metric: 'Allocations Total', Value: report.totals.allocations.total},
    {Metric: 'Plan Needs', Value: report.totals.plan.needs},
    {Metric: 'Plan Wants', Value: report.totals.plan.wants},
    {Metric: 'Plan Savings & Debts', Value: report.totals.plan.sd},
    {Metric: 'Spent Needs', Value: report.totals.transactions.needs},
    {Metric: 'Spent Wants', Value: report.totals.transactions.wants},
    {Metric: 'Spent Savings & Debts', Value: report.totals.transactions.sd},
    {Metric: 'Allocated Needs', Value: report.totals.allocations.needs},
    {Metric: 'Allocated Wants', Value: report.totals.allocations.wants},
    {Metric: 'Allocated Savings', Value: report.totals.allocations.savings},
  ];

  const incomeRows = report.incomeItems.map((item) => {
    const alloc = item.id ? allocationsBySource.get(`INCOME:${item.id}`) : undefined;
    return {
      Name: item.name,
      Amount: item.amount || 0,
      'Allocation Account': alloc ? accountById.get(alloc.accountId)?.name ?? alloc.accountId : '',
      'Allocation Tag': alloc?.tag ?? '',
      'Allocation Amount': alloc?.amount ?? 0,
      Note: alloc?.note ?? '',
    };
  });

  const planRows = report.planItems.map((item) => {
    const alloc = item.id ? allocationsBySource.get(`PLAN:${item.id}`) : undefined;
    return {
      Group: item.group,
      Name: item.name,
      Amount: item.amount || 0,
      'Allocation Account': alloc ? accountById.get(alloc.accountId)?.name ?? alloc.accountId : '',
      'Allocation Tag': alloc?.tag ?? '',
      'Allocation Amount': alloc?.amount ?? 0,
      Note: alloc?.note ?? '',
    };
  });

  const transactionRows = report.transactions.map((tx) => ({
    Date: tx.date ?? '',
    Name: tx.name ?? '',
    Group: tx.group,
    Amount: tx.amount || 0,
    Note: tx.note ?? '',
  }));

  const allocationRows = report.allocations.map((alloc) => ({
    Account: accountById.get(alloc.accountId)?.name ?? alloc.accountId,
    'Account ID': alloc.accountId,
    Tag: alloc.tag,
    Amount: alloc.amount || 0,
    'Source Type': alloc.sourceType ?? '',
    'Source Item': alloc.sourceItemName ?? '',
    'Source Item ID': alloc.sourceItemId ?? '',
    Note: alloc.note ?? '',
  }));

  const accountRows = report.accounts.map((account) => ({
    Account: account.name,
    Type: account.type ?? 'OTHER',
    Currency: account.currencyCode ?? '',
    'Opening Balance': account.openingBalance || 0,
    Archived: account.archived ? 'Yes' : 'No',
  }));

  const walletAccountRows = report.walletAccounts.map((row) => ({
    Account: accountById.get(row.accountId)?.name ?? row.accountId,
    'Account ID': row.accountId,
  }));

  return buildWorkbook({
    Summary: summaryRows,
    Income: incomeRows,
    Plan: planRows,
    Transactions: transactionRows,
    Allocations: allocationRows,
    Accounts: accountRows,
    'Wallet Accounts': walletAccountRows,
  });
}

function buildAccountsWorkbook(report: AccountReport) {
  const accountById = new Map<string, AccountReport['accounts'][number]>();
  for (const account of report.accounts) {
    if (account.id) accountById.set(account.id, account);
  }

  const allocationCounts: Record<string, number> = {};
  for (const allocation of report.allocations) {
    if (!allocation.accountId) continue;
    allocationCounts[allocation.accountId] = (allocationCounts[allocation.accountId] ?? 0) + 1;
  }

  const summaryRows = [
    {Metric: 'Accounts', Value: report.accounts.length},
    {Metric: 'Active Accounts', Value: report.totals.activeCount},
    {Metric: 'Archived Accounts', Value: report.totals.archivedCount},
    {Metric: 'Opening Balance Total', Value: report.totals.openingBalance},
    {Metric: 'Allocated Total', Value: report.totals.allocated},
    {Metric: 'Computed Balance Total', Value: report.totals.computed},
  ];

  const accountRows = report.accounts.map((account) => {
    const allocated = account.id ? report.totalsByAccount[account.id] ?? 0 : 0;
    const computed = (account.openingBalance || 0) + allocated;
    return {
      Account: account.name,
      Type: account.type ?? 'OTHER',
      Currency: account.currencyCode ?? '',
      'Opening Balance': account.openingBalance || 0,
      'Allocated Total': allocated,
      'Computed Balance': computed,
      Archived: account.archived ? 'Yes' : 'No',
      'Allocation Count': account.id ? allocationCounts[account.id] ?? 0 : 0,
    };
  });

  const tagRows = Object.entries(report.totalsByTag).map(([tag, amount]) => ({
    Tag: walletTagLabel[tag as keyof typeof walletTagLabel] ?? tag,
    Amount: amount,
  }));

  const allocationRows = report.allocations.map((alloc) => ({
    Period: alloc.periodId,
    Account: accountById.get(alloc.accountId)?.name ?? alloc.accountId,
    Tag: alloc.tag,
    Amount: alloc.amount || 0,
    'Source Type': alloc.sourceType ?? '',
    'Source Item': alloc.sourceItemName ?? '',
    Note: alloc.note ?? '',
  }));

  return buildWorkbook({
    Summary: summaryRows,
    Accounts: accountRows,
    'Allocations by Tag': tagRows,
    Allocations: allocationRows,
  });
}

export default function Reports() {
  const uid = useAuthUser()?.uid;
  const [periods, setPeriods] = useState<(PeriodDoc & {id: string})[]>([]);
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
    async (pid: string, opts?: {force?: boolean}) => {
      if (!uid) return undefined;
      if (!opts?.force && reportsById[pid]) return reportsById[pid];
      if (loadingById[pid]) return undefined;
      setLoadingById((prev) => ({...prev, [pid]: true}));
      try {
        const report = await fetchPeriodReport(uid, pid);
        setReportsById((prev) => ({...prev, [pid]: report}));
        return report;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        Alert.alert('Report failed', message);
        return undefined;
      } finally {
        setLoadingById((prev) => ({...prev, [pid]: false}));
      }
    },
    [uid, reportsById, loadingById]
  );

  useEffect(() => {
    if (!uid) return;
    const first = periods[0]?.id;
    if (!first || reportsById[first] || loadingById[first]) return;
    loadReport(first).catch(() => undefined);
  }, [uid, periods, reportsById, loadingById, loadReport]);

  useEffect(() => {
    if (!uid) return;
    setAccountLoading(true);
    fetchAccountsReport(uid)
      .then((report) => setAccountReport(report))
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        Alert.alert('Accounts report failed', message);
      })
      .finally(() => setAccountLoading(false));
  }, [uid]);

  const accountRows = useMemo(() => {
    if (!accountReport) return [] as Array<{
      id: string;
      name: string;
      type: string;
      archived: boolean;
      opening: number;
      allocated: number;
      computed: number;
    }>;
    return accountReport.accounts
      .filter((account): account is PeriodReport['accounts'][number] & {id: string} => Boolean(account.id))
      .map((account) => {
        const allocated = accountReport.totalsByAccount[account.id] ?? 0;
        return {
          id: account.id,
          name: account.name,
          type: account.type ?? 'OTHER',
          archived: account.archived === true,
          opening: account.openingBalance || 0,
          allocated,
          computed: (account.openingBalance || 0) + allocated,
        };
      })
      .sort((a, b) => b.computed - a.computed);
  }, [accountReport]);

  const allocationTagChart = useMemo(() => {
    if (!accountReport) return [] as {x: string; y: number}[];
    return [
      {x: 'Needs', y: accountReport.totalsByTag.NEEDS || 0},
      {x: 'Wants', y: accountReport.totalsByTag.WANTS || 0},
      {x: 'Savings', y: accountReport.totalsByTag.SAVINGS || 0},
    ];
  }, [accountReport]);

  async function handleExportBudget(pid: string) {
    if (!uid) return;
    if (exportingById[pid]) return;
    setExportingById((prev) => ({...prev, [pid]: true}));
    try {
      const report = (reportsById[pid] ?? (await loadReport(pid))) as PeriodReport | undefined;
      if (!report) return;
      const workbook = buildBudgetWorkbook(report);
      await exportWorkbook(workbook, `budget_${pid}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Export failed', message);
    } finally {
      setExportingById((prev) => ({...prev, [pid]: false}));
    }
  }

  async function handleRefreshBudget(pid: string) {
    await loadReport(pid, {force: true});
  }

  async function handleExportAccounts() {
    if (!uid || accountExporting) return;
    setAccountExporting(true);
    try {
      const report = accountReport ?? (await fetchAccountsReport(uid));
      if (!accountReport) setAccountReport(report);
      const workbook = buildAccountsWorkbook(report);
      await exportWorkbook(workbook, 'accounts_summary');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Export failed', message);
    } finally {
      setAccountExporting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Reports</Text>
      <Text style={styles.help}>Export budgets to Excel, review account summaries, and inspect allocations.</Text>

      <View style={styles.card}>
        <View style={styles.rowHeader}>
          <Text style={styles.h2}>Accounts summary</Text>
          <Button
            title={accountExporting ? 'Exporting...' : 'Export Excel'}
            onPress={handleExportAccounts}
            disabled={accountExporting || accountLoading}
          />
        </View>
        {accountLoading ? <Text style={styles.help}>Loading account summary...</Text> : null}
        {!accountLoading && !accountReport ? (
          <EmptyState title="No accounts yet" hint="Create accounts to unlock wallet summaries." />
        ) : null}
        {accountReport ? (
          <>
            <View style={styles.statRow}>
              <StatCard title="Opening" value={fmtMoney(accountReport.totals.openingBalance)} />
              <StatCard title="Allocated" value={fmtMoney(accountReport.totals.allocated)} />
              <StatCard title="Computed" value={fmtMoney(accountReport.totals.computed)} />
            </View>
            <View style={styles.chartBlock}>
              <Text style={styles.cardTitle}>Allocations by tag (all time)</Text>
              <PieChart
                data={allocationTagChart}
                total={Math.max(accountReport.totals.allocated, 1)}
                colors={CHART_COLORS}
              />
            </View>
            <View style={styles.table}>
              {accountRows.map((row) => (
                <View key={row.id} style={styles.tableRow}>
                  <View style={{flex: 1}}>
                    <Text style={styles.rowTitle}>{row.name}</Text>
                    <Text style={styles.rowSub}>
                      {row.type} · {row.archived ? 'Archived' : 'Active'}
                    </Text>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text style={styles.rowValue}>{fmtMoney(row.computed)}</Text>
                    <Text style={styles.rowSub}>{fmtMoney(row.allocated)} allocated</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.h2}>Budget reports</Text>
        <Text style={styles.help}>Open a period to load details and export an Excel workbook.</Text>
      </View>

      {!periods.length ? (
        <EmptyState title="No budgets yet" hint="Create a budget period to generate reports." />
      ) : null}

      {periods.map((period) => {
        const report = reportsById[period.id];
        const loading = loadingById[period.id];
        const exporting = exportingById[period.id];
        const title = period.title ?? periodTitleFromId(period.id);
        const subtitle = `${period.id} · ${period.status ?? 'DRAFT'}`;
        const planChart = report
          ? [
              {x: 'Needs', y: report.totals.plan.needs},
              {x: 'Wants', y: report.totals.plan.wants},
              {x: 'Savings', y: report.totals.plan.sd},
            ]
          : [];
        const actualChart = report
          ? [
              {x: 'Needs', y: report.totals.transactions.needs},
              {x: 'Wants', y: report.totals.transactions.wants},
              {x: 'Savings', y: report.totals.transactions.sd},
            ]
          : [];
        const remaining = report ? report.totals.incomeTotal - report.totals.transactions.total : 0;
        return (
          <AccordionSection key={period.id} title={title} subtitle={subtitle}>
            <View style={styles.inline}>
              <Button
                title={exporting ? 'Exporting...' : 'Export Excel'}
                onPress={() => handleExportBudget(period.id)}
                disabled={exporting || loading}
              />
              <Button
                title={loading ? 'Loading...' : 'Refresh'}
                onPress={() => handleRefreshBudget(period.id)}
                disabled={loading}
              />
            </View>
            {!report && !loading ? (
              <Text style={styles.help}>Load details to see totals and charts for this budget.</Text>
            ) : null}
            {loading ? <Text style={styles.help}>Loading report data...</Text> : null}
            {report ? (
              <>
                <View style={styles.statRow}>
                  <StatCard title="Income" value={fmtMoney(report.totals.incomeTotal)} />
                  <StatCard title="Planned" value={fmtMoney(report.totals.plan.total)} />
                  <StatCard title="Spent" value={fmtMoney(report.totals.transactions.total)} />
                  <StatCard
                    title="Remaining"
                    value={fmtMoney(remaining)}
                    tone={remaining >= 0 ? 'positive' : 'danger'}
                  />
                </View>
                <View style={styles.chartBlock}>
                  <Text style={styles.cardTitle}>Planned distribution</Text>
                  <PieChart
                    data={planChart}
                    total={Math.max(report.totals.plan.total, 1)}
                    colors={CHART_COLORS}
                  />
                </View>
                <View style={styles.chartBlock}>
                  <Text style={styles.cardTitle}>Actual spending distribution</Text>
                  <PieChart
                    data={actualChart}
                    total={Math.max(report.totals.transactions.total, 1)}
                    colors={CHART_COLORS}
                  />
                </View>
                <View style={styles.table}>
                  <View style={styles.tableRow}>
                    <Text style={styles.rowSub}>Income items</Text>
                    <Text style={styles.rowValue}>{report.incomeItems.length}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={styles.rowSub}>Plan items</Text>
                    <Text style={styles.rowValue}>{report.planItems.length}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={styles.rowSub}>Transactions</Text>
                    <Text style={styles.rowValue}>{report.transactions.length}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={styles.rowSub}>Allocations</Text>
                    <Text style={styles.rowValue}>{report.allocations.length}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </AccordionSection>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {padding: 16, gap: 16},
  h1: {fontSize: 24, fontWeight: '700'},
  h2: {fontSize: 16, fontWeight: '700'},
  help: {fontSize: 12, color: '#6B7280'},
  sectionHeader: {gap: 4},
  card: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  inline: {flexDirection: 'row', gap: 10, flexWrap: 'wrap'},
  statRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  chartBlock: {gap: 6},
  cardTitle: {fontSize: 14, fontWeight: '700', color: '#111827'},
  table: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  rowTitle: {fontSize: 14, fontWeight: '700', color: '#111827'},
  rowSub: {fontSize: 12, color: '#6B7280'},
  rowValue: {fontSize: 13, fontWeight: '700', color: '#111827'},
});
