// BUDG-8 S8: the Accounts data subscriptions, moved unchanged out of app/(shell)/accounts.tsx so the
// Accounts screen and the Add sheet's Move money read the same figures. Reads only; no write here.
import { useEffect, useMemo, useState } from 'react';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import { watchAccountPeriodOverridesForPeriod } from '@/lib/repo/accountPeriodOverrides';
import { type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { watchIncomeItems } from '@/lib/repo/income';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { type Tx, watchTransactions } from '@/lib/repo/transactions';
import { useAccountViewModels } from '@/lib/view-models/useAccountViewModels';
import { useWorkspace } from '@/providers/WorkspaceProvider';

/** The period the Accounts screen has always used: the workspace's active period, else this month. */
export function useAccountsPeriod() {
  const { activePeriodId } = useWorkspace();
  const [pid, setPid] = useState(activePeriodId || periodIdFromDate());
  useEffect(() => {
    setPid(activePeriodId || periodIdFromDate());
  }, [activePeriodId]);
  return pid;
}

/** `uid` null = inactive (no subscriptions), so a closed Add sheet costs nothing. */
export function useAccountsData(uid: string | null | undefined, selectedPid: string) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [currentManualByAccountId, setCurrentManualByAccountId] = useState<Record<string, number>>({});
  const [allPeriods, setAllPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [allTransactionsByPeriod, setAllTransactionsByPeriod] = useState<Record<string, Tx[]>>({});

  useEffect(() => {
    if (!uid) return;
    return watchAccounts(
      uid,
      (rows) => {
        setAccounts(rows);
        setAccountsLoaded(true);
      },
      { includeArchived: true }
    );
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchAllocations(uid, selectedPid, (rows) => setAllocations(rows));
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchTransactions(uid, selectedPid, setTransactions);
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) {
      setCurrentManualByAccountId({});
      return;
    }
    return watchAccountPeriodOverridesForPeriod(uid, selectedPid, setCurrentManualByAccountId);
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, items) => {
      setPlanItems(items);
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchIncomeItems(uid, selectedPid, (_items, activeTotal) => {
      setIncomeTotal(activeTotal);
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid) {
      setAllPeriods([]);
      return;
    }
    return watchPeriods(uid, setAllPeriods);
  }, [uid]);

  const allPeriodIdsKey = useMemo(
    () => allPeriods.map((row) => row.id).sort((a, b) => a.localeCompare(b)).join('|'),
    [allPeriods]
  );

  useEffect(() => {
    if (!uid || !allPeriods.length) {
      setAllTransactionsByPeriod({});
      return;
    }
    const periodIds = allPeriods.map((row) => row.id);
    setAllTransactionsByPeriod((prev) => {
      const next: Record<string, Tx[]> = {};
      periodIds.forEach((pid) => {
        next[pid] = prev[pid] ?? [];
      });
      return next;
    });
    const unsubs = periodIds.map((pid) =>
      watchTransactions(uid, pid, (rows) => {
        setAllTransactionsByPeriod((prev) => ({ ...prev, [pid]: rows }));
      })
    );
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [allPeriodIdsKey, allPeriods, uid]);

  const allTransactions = useMemo(() => Object.values(allTransactionsByPeriod).flat(), [allTransactionsByPeriod]);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((row) => {
      if (row.id) map.set(row.id, row);
    });
    return map;
  }, [accounts]);

  const { rows: accountRows, byAccountId } = useAccountViewModels({
    accounts,
    periodId: selectedPid,
    planItems,
    allocations,
    periodTransactions: transactions,
    allTransactions,
    incomeTotal,
    currentManualByAccountId,
  });

  const periodStatus = allPeriods.find((p) => p.id === selectedPid)?.status;
  return { accounts, accountsLoaded, accountById, accountRows, byAccountId, transactions, planItems, periodStatus, closed: periodStatus === 'DECIDED' };
}
