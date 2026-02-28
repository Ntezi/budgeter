import {doc, getDoc, getDocs, query} from 'firebase/firestore';
import {db} from '../firebase';
import {accountsCol, type Account} from './accounts';
import {
  allocationsCol,
  listAllAllocations,
  periodWalletAccountsCol,
  toAllocationTotals,
  type Allocation,
  type PeriodWalletAccount,
} from './allocations';
import {incomeCol, type IncomeItem} from './income';
import {planCol, type PlanItem} from './plans';
import {listAllTransactions, txCol, type Tx} from './transactions';
import type {PeriodDoc} from './periods';
import type {WalletTag} from '../domain';
import {
  getAccountCurrentAmount,
  sumCashMovementByAccount,
  sumSpendingByAccount,
  transactionSignedBudgetAmount,
  type AllocationWithPeriod,
} from '../accounting';
import { docMatchesActiveScope, scopedPeriodDocId } from './scope';

export type BudgetTotals = {
  incomeTotal: number;
  plan: {needs: number; wants: number; sd: number; total: number};
  transactions: {needs: number; wants: number; sd: number; total: number};
  allocations: {needs: number; wants: number; savings: number; total: number};
};

export type PeriodReport = {
  periodId: string;
  period: PeriodDoc | null;
  incomeItems: IncomeItem[];
  planItems: PlanItem[];
  transactions: Tx[];
  allocations: Allocation[];
  walletAccounts: PeriodWalletAccount[];
  accounts: Account[];
  totals: BudgetTotals;
};

export type AccountReport = {
  accounts: Account[];
  allocations: (Allocation & {periodId: string})[];
  totalsByAccount: Record<string, number>;
  spendingByAccount: Record<string, number>;
  cashMovementByAccount: Record<string, number>;
  currentByAccount: Record<string, number>;
  totalsByTag: Record<WalletTag, number>;
  totals: {
    openingBalance: number;
    allocated: number;
    spent: number;
    cashMovement: number;
    current: number;
    computed: number;
    activeCount: number;
    archivedCount: number;
    overdraftCount: number;
  };
};

export async function fetchPeriodReport(uid: string, pid: string): Promise<PeriodReport> {
  const [
    periodSnap,
    incomeSnap,
    planSnap,
    txSnap,
    allocSnap,
    walletSnap,
    accountsSnap,
  ] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'periods', scopedPeriodDocId(pid))),
    getDocs(query(incomeCol(uid, pid))),
    getDocs(query(planCol(uid, pid))),
    getDocs(query(txCol(uid, pid))),
    getDocs(query(allocationsCol(uid, pid))),
    getDocs(query(periodWalletAccountsCol(uid, pid))),
    getDocs(query(accountsCol(uid))),
  ]);

  const periodRow = periodSnap.exists() ? (periodSnap.data() as PeriodDoc) : null;
  const period = periodRow && docMatchesActiveScope(periodRow as any) ? periodRow : null;
  const incomeItems: IncomeItem[] = [];
  const planItems: PlanItem[] = [];
  const transactions: Tx[] = [];
  const allocations: Allocation[] = [];
  const walletAccounts: PeriodWalletAccount[] = [];
  const accounts: Account[] = [];

  incomeSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as IncomeItem)};
    if (!docMatchesActiveScope(row as any)) return;
    incomeItems.push(row);
  });
  planSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as PlanItem)};
    if (!docMatchesActiveScope(row as any)) return;
    planItems.push(row);
  });
  txSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as Tx)};
    if (!docMatchesActiveScope(row as any)) return;
    transactions.push(row);
  });
  allocSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as Allocation)};
    if (!docMatchesActiveScope(row as any)) return;
    allocations.push(row);
  });
  walletSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as PeriodWalletAccount)};
    if (!docMatchesActiveScope(row as any)) return;
    walletAccounts.push({
      ...row,
      accountId: row.accountId || d.id,
    });
  });
  accountsSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as Account)};
    if (!docMatchesActiveScope(row as any)) return;
    accounts.push(row);
  });

  let incomeTotal = 0;
  for (const item of incomeItems) {
    if (item.active === false) continue;
    incomeTotal += item.amount || 0;
  }

  const planTotals = {needs: 0, wants: 0, sd: 0};
  for (const item of planItems) {
    if (item.group === 'NEED') planTotals.needs += item.amount || 0;
    else if (item.group === 'WANT') planTotals.wants += item.amount || 0;
    else planTotals.sd += item.amount || 0;
  }

  const txTotals = {needs: 0, wants: 0, sd: 0};
  for (const item of transactions) {
    const amount = transactionSignedBudgetAmount(item);
    if (!amount) continue;
    if (item.group === 'NEED') txTotals.needs += amount;
    else if (item.group === 'WANT') txTotals.wants += amount;
    else txTotals.sd += amount;
  }

  const allocationTotals = toAllocationTotals(allocations);

  return {
    periodId: pid,
    period,
    incomeItems,
    planItems,
    transactions,
    allocations,
    walletAccounts,
    accounts,
    totals: {
      incomeTotal,
      plan: {
        ...planTotals,
        total: planTotals.needs + planTotals.wants + planTotals.sd,
      },
      transactions: {
        ...txTotals,
        total: txTotals.needs + txTotals.wants + txTotals.sd,
      },
      allocations: allocationTotals,
    },
  };
}

export async function fetchAccountsReport(uid: string): Promise<AccountReport> {
  const [accountsSnap, allocations, transactions] = await Promise.all([
    getDocs(query(accountsCol(uid))),
    listAllAllocations(uid),
    listAllTransactions(uid),
  ]);

  const accounts: Account[] = [];
  accountsSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as Account)};
    if (!docMatchesActiveScope(row as any)) return;
    accounts.push(row);
  });

  const totalsByAccount: Record<string, number> = {};
  const totalsByTag: Record<WalletTag, number> = {
    NEEDS: 0,
    WANTS: 0,
    SAVINGS: 0,
  };
  const spendingByAccount: Record<string, number> = {};
  const cashMovementByAccount: Record<string, number> = {};
  const currentByAccount: Record<string, number> = {};
  let allocated = 0;

  for (const row of allocations) {
    const amount = row.amount || 0;
    allocated += amount;
    if (row.accountId) {
      totalsByAccount[row.accountId] = (totalsByAccount[row.accountId] ?? 0) + amount;
    }
    if (row.tag && totalsByTag[row.tag as WalletTag] !== undefined) {
      totalsByTag[row.tag as WalletTag] += amount;
    }
  }

  const spendingMap = sumSpendingByAccount(
    transactions,
    allocations as AllocationWithPeriod[]
  );
  spendingMap.forEach((amount, accountId) => {
    spendingByAccount[accountId] = amount;
  });
  const cashMovementMap = sumCashMovementByAccount(transactions);
  cashMovementMap.forEach((amount, accountId) => {
    cashMovementByAccount[accountId] = amount;
  });

  let spent = 0;
  Object.values(spendingByAccount).forEach((amount) => {
    spent += amount;
  });
  let cashMovement = 0;
  Object.values(cashMovementByAccount).forEach((amount) => {
    cashMovement += amount;
  });

  let openingBalance = 0;
  let current = 0;
  let activeCount = 0;
  let archivedCount = 0;
  let overdraftCount = 0;
  for (const account of accounts) {
    const accountId = String(account.id || '').trim();
    openingBalance += account.openingBalance || 0;
    const accountCurrent = getAccountCurrentAmount(account, cashMovementByAccount[accountId] || 0);
    if (accountId) currentByAccount[accountId] = accountCurrent;
    current += accountCurrent;
    if (accountCurrent < 0) overdraftCount += 1;
    if (account.archived) archivedCount += 1;
    else activeCount += 1;
  }

  return {
    accounts,
    allocations,
    totalsByAccount,
    spendingByAccount,
    cashMovementByAccount,
    currentByAccount,
    totalsByTag,
    totals: {
      openingBalance,
      allocated,
      spent,
      cashMovement,
      current,
      computed: current,
      activeCount,
      archivedCount,
      overdraftCount,
    },
  };
}
