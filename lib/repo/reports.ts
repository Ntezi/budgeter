import {doc, getDoc, getDocs, orderBy, query} from 'firebase/firestore';
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
import {txCol, type Tx} from './transactions';
import type {PeriodDoc} from './periods';
import type {WalletTag} from '../domain';

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
  totalsByTag: Record<WalletTag, number>;
  totals: {
    openingBalance: number;
    allocated: number;
    computed: number;
    activeCount: number;
    archivedCount: number;
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
    getDoc(doc(db, 'users', uid, 'periods', pid)),
    getDocs(query(incomeCol(uid, pid), orderBy('createdAt', 'asc'))),
    getDocs(query(planCol(uid, pid), orderBy('createdAt', 'asc'))),
    getDocs(query(txCol(uid, pid), orderBy('date', 'asc'))),
    getDocs(query(allocationsCol(uid, pid), orderBy('createdAt', 'asc'))),
    getDocs(query(periodWalletAccountsCol(uid, pid), orderBy('createdAt', 'asc'))),
    getDocs(query(accountsCol(uid), orderBy('createdAt', 'asc'))),
  ]);

  const period = periodSnap.exists() ? (periodSnap.data() as PeriodDoc) : null;
  const incomeItems: IncomeItem[] = [];
  const planItems: PlanItem[] = [];
  const transactions: Tx[] = [];
  const allocations: Allocation[] = [];
  const walletAccounts: PeriodWalletAccount[] = [];
  const accounts: Account[] = [];

  incomeSnap.forEach((d) => incomeItems.push({id: d.id, ...(d.data() as IncomeItem)}));
  planSnap.forEach((d) => planItems.push({id: d.id, ...(d.data() as PlanItem)}));
  txSnap.forEach((d) => transactions.push({id: d.id, ...(d.data() as Tx)}));
  allocSnap.forEach((d) => allocations.push({id: d.id, ...(d.data() as Allocation)}));
  walletSnap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as PeriodWalletAccount)};
    walletAccounts.push({
      ...row,
      accountId: row.accountId || d.id,
    });
  });
  accountsSnap.forEach((d) => accounts.push({id: d.id, ...(d.data() as Account)}));

  let incomeTotal = 0;
  for (const item of incomeItems) incomeTotal += item.amount || 0;

  const planTotals = {needs: 0, wants: 0, sd: 0};
  for (const item of planItems) {
    if (item.group === 'NEED') planTotals.needs += item.amount || 0;
    else if (item.group === 'WANT') planTotals.wants += item.amount || 0;
    else planTotals.sd += item.amount || 0;
  }

  const txTotals = {needs: 0, wants: 0, sd: 0};
  for (const item of transactions) {
    if (item.group === 'NEED') txTotals.needs += item.amount || 0;
    else if (item.group === 'WANT') txTotals.wants += item.amount || 0;
    else txTotals.sd += item.amount || 0;
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
  const [accountsSnap, allocations] = await Promise.all([
    getDocs(query(accountsCol(uid), orderBy('createdAt', 'asc'))),
    listAllAllocations(uid),
  ]);

  const accounts: Account[] = [];
  accountsSnap.forEach((d) => accounts.push({id: d.id, ...(d.data() as Account)}));

  const totalsByAccount: Record<string, number> = {};
  const totalsByTag: Record<WalletTag, number> = {
    NEEDS: 0,
    WANTS: 0,
    SAVINGS: 0,
  };
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

  let openingBalance = 0;
  let activeCount = 0;
  let archivedCount = 0;
  for (const account of accounts) {
    openingBalance += account.openingBalance || 0;
    if (account.archived) archivedCount += 1;
    else activeCount += 1;
  }

  return {
    accounts,
    allocations,
    totalsByAccount,
    totalsByTag,
    totals: {
      openingBalance,
      allocated,
      computed: openingBalance + allocated,
      activeCount,
      archivedCount,
    },
  };
}
