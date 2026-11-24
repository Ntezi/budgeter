import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fmtMoney } from '@/lib/format';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { periodIdFromDate, type PeriodDoc, watchPeriod, watchPeriods } from '@/lib/repo/periods';
import { watchIncomeItems } from '@/lib/repo/income';
import { watchPlanTotals } from '@/lib/repo/plans';
import { watchAllocations } from '@/lib/repo/allocations';
import { addMonthsToId, isMonthId, monthIdFromDate, monthTitle } from '@/lib/rules/months';
import { watchTransactions, type Tx } from '@/lib/repo/transactions';
import { planGroupLabel } from '@/lib/groups';
import { useAccountsData } from '@/components/accounts/useAccountsData';
import { PageHeader } from '@/components/patterns/PageHeader';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { EmptyState, LoadingState } from '@/components/patterns/States';
import { MonthSummaryCard, type SpendChip } from '@/components/home/MonthSummaryCard';
import { HomeSection } from '@/components/home/HomeSection';
import { homeSummary, monthName, needsYou } from '@/lib/view-models/homeSummary';
import { transactionSignedBudgetAmount } from '@/lib/accounting';

export default function DashboardScreen() {
  const router = useRouter();
  const uid = useWorkspaceUid();
  const { activePeriodId } = useWorkspace();
  const fallbackPid = periodIdFromDate();
  const params = useLocalSearchParams<{ month?: string }>();
  const viewedMonth = typeof params.month === 'string' && isMonthId(params.month) ? params.month : '';
  const pid = viewedMonth || activePeriodId || fallbackPid;

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [targetPct, setTargetPct] = useState({ needs: 0.5, wants: 0.3, sd: 0.2 });
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [planTotals, setPlanTotals] = useState({ needs: 0, wants: 0, sd: 0 });
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [allocationTotals, setAllocationTotals] = useState({ needs: 0, wants: 0, savings: 0, total: 0 });
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  // BUDG-40 F-1: the Accounts row and the overdrawn reminder read the Accounts screen's own hook and summary
  // for the viewed month (cash.current per account), so Home and Accounts show the same numbers.
  const accountsData = useAccountsData(uid, pid);


  useEffect(() => {
    if (!uid) return;

    const unPeriod = watchPeriod(uid, pid, (period) => {
      setTargetPct(period.targetPct ?? { needs: 0.5, wants: 0.3, sd: 0.2 });
    });
    const unIncome = watchIncomeItems(uid, pid, (_rows, activeTotal) => setIncomeTotal(activeTotal));
    const unPlan = watchPlanTotals(uid, pid, (totals) => setPlanTotals(totals));
    const unTx = watchTransactions(uid, pid, setTransactions);
    const unAlloc = watchAllocations(uid, pid, (_rows, totals) => setAllocationTotals(totals));
    const unList = watchPeriods(uid, (rows) => {
      setPeriods(rows);
      setPeriodsLoaded(true);
    });

    return () => {
      unPeriod();
      unIncome();
      unPlan();
      unTx();
      unAlloc();
      unList();
    };
  }, [uid, pid]);

  const actualTotals = useMemo(() => {
    const res = { needs: 0, wants: 0, sd: 0, shopping: 0, uncategorized: 0, uncategorizedCount: 0, total: 0 };
    transactions.forEach((tx) => {
      const amt = transactionSignedBudgetAmount(tx);
      if (!amt) return;
      res.total += amt;
      if (tx.group === 'NEED') res.needs += amt;
      else if (tx.group === 'WANT') res.wants += amt;
      else res.sd += amt;

      if (tx.shoppingListId || tx.shoppingItemId) res.shopping += amt;
      if (!tx.categoryId) {
        res.uncategorized += amt;
        res.uncategorizedCount += 1;
      }
    });
    return res;
  }, [transactions]);

  // Same figures as before BUDG-8 (planned = plan line totals, spent = budget-signed transactions).
  const plannedTotal = planTotals.needs + planTotals.wants + planTotals.sd;
  const spentTotal = actualTotals.total;
  const period = periods.find((p) => p.id === pid);
  const closed = period?.status === 'DECIDED';
  const now = new Date();
  const todayMonthId = monthIdFromDate(now);
  const [py, pm] = pid.split('-').map(Number);
  const name = monthName(pid);
  void targetPct;
  void allocationTotals;

  const summary = homeSummary(
    { monthId: pid, todayMonthId, todayDay: now.getDate(), daysInMonth: new Date(py, pm, 0).getDate(), closed, planned: plannedTotal, spent: spentTotal },
    (n) => fmtMoney(n)
  );
  const attention = needsYou(
    {
      monthId: pid,
      todayMonthId,
      todayDay: now.getDate(),
      overdraftCount: accountsData.summary.overdrawn,
      unlinkedSpent: actualTotals.uncategorized,
      unlinkedCount: actualTotals.uncategorizedCount,
      nextMonthExists: periods.some((p) => p.id === addMonthsToId(pid, 1)),
    },
    (n) => fmtMoney(n)
  );

  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .filter((tx) => transactionSignedBudgetAmount(tx) !== 0)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, 5),
    [transactions]
  );

  const activity = (extra = '') => router.push(`/transactions?month=${pid}${extra}` as any);
  const chips: SpendChip[] = [
    { id: 'NEED', label: planGroupLabel('NEED'), amount: fmtMoney(actualTotals.needs), dotClassName: 'bg-needs', value: actualTotals.needs },
    { id: 'WANT', label: planGroupLabel('WANT'), amount: fmtMoney(actualTotals.wants), dotClassName: 'bg-wants', value: actualTotals.wants },
    { id: 'SAVINGS_DEBT', label: 'Savings', // D-7: glossary word, fits at 320
    amount: fmtMoney(actualTotals.sd), dotClassName: 'bg-savings', value: actualTotals.sd },
  ].map((c) => ({
    id: c.id,
    label: c.label,
    amount: c.amount,
    dotClassName: c.dotClassName,
    accessibilityLabel: `${c.label} spend ${c.amount}, open ${c.label} costs for ${monthTitle(pid)}`,
    onPress: () => activity(`&group=${c.id}`),
  }));
  chips.push({
    id: 'SHOP',
    label: 'Shop',
    amount: fmtMoney(actualTotals.shopping),
    dotClassName: 'bg-zinc-500',
    accessibilityLabel: `Shopping spend ${fmtMoney(actualTotals.shopping)}, open shopping transactions for ${monthTitle(pid)}`,
    onPress: () => activity('&scope=SHOPPING'),
  });
  const details = [
    { label: 'Income planned', value: fmtMoney(incomeTotal) },
    { label: 'Planned costs', value: fmtMoney(plannedTotal) },
    { label: 'Spent', value: fmtMoney(spentTotal) },
    { label: 'Saved so far (income − spent)', value: fmtMoney(incomeTotal - spentTotal) },
  ];

  const { total: accountsTotal, activeCount: accountsCount, overdrawn } = accountsData.summary;

  const needsYouSection = attention.length ? (
    <HomeSection title={`Needs you (${attention.length})`} testID="home-needs-you">
      <ListGroup>
        {attention.map((it) => (
          <ListRow
            key={it.id}
            title={it.title}
            titleLines={0}
            titleTestID="home-needs-you-label"
            sub={it.sub}
            subLines={0}
            amount={it.amount}
            onPress={() => router.push(it.href as any)}
            left={
              <MaterialCommunityIcons
                name={it.icon as any}
                size={22}
                color={it.tone === 'danger' ? '#D4183D' : it.tone === 'warning' ? '#717182' : '#3B82F6'}
              />
            }
          />
        ))}
      </ListGroup>
    </HomeSection>
  ) : null;

  const accountsSection = (
    <HomeSection title="Accounts" testID="home-accounts">
      {!accountsData.accountsLoaded ? (
        <LoadingState rows={1} />
      ) : (
        <ListGroup>
          <ListRow
            title={`In ${accountsCount} ${accountsCount === 1 ? 'account' : 'accounts'}`}
            sub={overdrawn > 0 ? `${overdrawn} overdrawn · balance in ${name}` : `Balance in ${name}`}
            subLines={2}
            amount={fmtMoney(accountsTotal)}
            amountClassName={accountsTotal < 0 ? 'text-destructive dark:text-red-300' : undefined}
            onPress={() => router.push('/accounts' as any)}
          />
        </ListGroup>
      )}
    </HomeSection>
  );

  const recentSection = (
    <HomeSection
      title="Recent"
      testID="home-recent"
      actions={[
        { label: 'Add expense', onPress: () => router.push('/transactions?action=new-expense' as any) },
        { label: 'See all', accessibilityLabel: `See all costs in ${monthTitle(pid)}`, onPress: () => activity() },
      ]}
    >
      {recentTransactions.length ? (
        <ListGroup>
          {recentTransactions.map((tx) => (
            <ListRow
              key={tx.id}
              title={tx.name || 'No name'}
              sub={[tx.group ? planGroupLabel(tx.group as any) : null, tx.date, tx.shoppingItemName ? 'Shopping' : null].filter(Boolean).join(' · ')}
              amount={fmtMoney(tx.amount || 0)}
              onPress={() => activity()}
            />
          ))}
        </ListGroup>
      ) : (
        <Text className="px-1 py-3 text-sm text-muted-foreground dark:text-zinc-400">Nothing spent in {name} yet.</Text>
      )}
    </HomeSection>
  );

  const loading = !periodsLoaded;
  const wide = useWindowDimensions().width >= 1024;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-8" testID="home-screen">
      <PageHeader title="Home" />
      {loading ? (
        <View testID="home-loading" className="gap-6">
          <View className="h-40 rounded-xl bg-muted dark:bg-zinc-800" />
          <LoadingState rows={3} />
        </View>
      ) : (
        <View className="gap-6 lg:flex-row lg:items-start">
          <View className="min-w-0 gap-6 lg:flex-[2]">
            {period ? (
              <MonthSummaryCard summary={summary} amount={fmtMoney(summary.amount)} chips={chips} details={details} />
            ) : (
              <EmptyState
                testID="home-no-plan"
                icon="calendar-blank"
                message={`No plan for ${name} yet.`}
                actionLabel={`Plan ${name}`}
                onAction={() => router.push(`/budgets/${pid}` as any)}
              />
            )}
            {wide ? null : needsYouSection}
            {recentSection}
            {wide ? null : accountsSection}
          </View>
          {wide ? (
            <View className="min-w-0 flex-1 gap-6">
              {needsYouSection}
              {accountsSection}
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
