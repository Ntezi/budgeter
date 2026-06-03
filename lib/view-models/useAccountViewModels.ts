import { useMemo } from 'react';
import { transactionCashDeltas, transactionSignedBudgetAmount } from '@/lib/accounting';
import type { WalletType } from '@/lib/domain';
import type { Account } from '@/lib/repo/accounts';
import type { Allocation } from '@/lib/repo/allocations';
import type { PlanGroup, PlanItem } from '@/lib/repo/plans';
import type { Tx } from '@/lib/repo/transactions';

type SpendFlag = 'NOT_SPENT' | 'PARTIAL_SPENT' | 'SPENT';

const RECONCILE_PINNED_GROUP_ORDER: Record<string, number> = {
  NEED: 0,
  SAVINGS_DEBT: 1,
  WANT: 2,
};

function computeSpendFlag(spent: number, planned: number): SpendFlag {
  const safeSpent = Math.max(0, Number(spent || 0));
  const safePlanned = Math.max(0, Number(planned || 0));
  if (safeSpent <= 0) return 'NOT_SPENT';
  if (safePlanned > 0 && safeSpent >= safePlanned) return 'SPENT';
  return 'PARTIAL_SPENT';
}

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

function txType(tx: Tx) {
  return tx.type || 'EXPENSE';
}

function planItemIdOf(tx: Tx) {
  return normalizeId(tx.planItemId || tx.categoryId);
}

function paidFromAccountIdOf(tx: Tx) {
  return normalizeId(tx.paidFromAccountId || tx.accountId);
}

function resolvedTxAccountId(tx: Tx, plannedAccountByPlanItemId: Map<string, string>) {
  const direct = paidFromAccountIdOf(tx);
  if (direct) return direct;
  const planItemId = planItemIdOf(tx);
  if (!planItemId) return '';
  return normalizeId(plannedAccountByPlanItemId.get(planItemId));
}

function toAmount(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

export type AccountAssignedItemViewModel = {
  id: string;
  name: string;
  allocated: number;
  funded: number;
  spent: number;
  remaining: number;
};

export type AccountCashViewModel = {
  opening: number;
  movementAllTime: number;
  current: number;
  currentAuto: number;
  currentManual: number | null;
  unallocated: number;
  topUpNeeded: number;
  periodInflow: number;
  periodOutflow: number;
  periodNet: number;
  transferIn: number;
  transferOut: number;
};

export type AccountBudgetViewModel = {
  allocated: number;
  funded: number;
  spentFrom: number;
  remaining: number;
  unfunded: number;
};

export type AccountPeriodMetrics = {
  allocated: number;
  funded: number;
  unfunded: number;
  spentFrom: number;
  currentAuto: number;
  currentManual: number | null;
  currentDisplayed: number;
  unallocated: number;
  topUpNeeded: number;
};

export type AccountViewModel = {
  accountId: string;
  accountName: string;
  accountType?: WalletType;
  archived: boolean;
  reminderEnabled: boolean;
  cash: AccountCashViewModel;
  budget: AccountBudgetViewModel;
  assignedItems: AccountAssignedItemViewModel[];
};

export type UseAccountViewModelsParams = {
  accounts: Account[];
  periodId: string;
  planItems: PlanItem[];
  allocations: Allocation[];
  periodTransactions: Tx[];
  allTransactions: Tx[];
  incomeTotal: number;
  currentManualByAccountId?: Record<string, number | null | undefined>;
};

export function computeAccountPeriodMetrics(input: {
  accountId: string;
  periodId: string;
  planItems: PlanItem[];
  fundedByPlanId: Map<string, number>;
  plannedAccountByPlanItemId: Map<string, string>;
  periodTransactions: Tx[];
  currentManual?: number | null;
}): AccountPeriodMetrics {
  const accountId = normalizeId(input.accountId);
  if (!accountId) {
    return {
      allocated: 0,
      funded: 0,
      unfunded: 0,
      spentFrom: 0,
      currentAuto: 0,
      currentManual: null,
      currentDisplayed: 0,
      unallocated: 0,
      topUpNeeded: 0,
    };
  }

  let allocated = 0;
  let funded = 0;

  input.planItems.forEach((row) => {
    const planId = normalizeId(row.id);
    const plannedAccountId =
      normalizeId((row as any).plannedAccountId) ||
      normalizeId(input.plannedAccountByPlanItemId.get(planId));
    if (!plannedAccountId || plannedAccountId !== accountId) return;
    allocated += Math.max(0, toAmount(row.amount));
    if (!planId) return;
    funded += Math.max(0, toAmount(input.fundedByPlanId.get(planId)));
  });

  let spentFrom = 0;
  input.periodTransactions.forEach((tx) => {
    if (resolvedTxAccountId(tx, input.plannedAccountByPlanItemId) !== accountId) return;
    const type = txType(tx);
    const amount = Math.abs(toAmount(tx.amount));
    if (!amount) return;
    if (type === 'EXPENSE') spentFrom += amount;
    else if (type === 'REFUND') spentFrom -= amount;
  });

  const unfunded = Math.max(0, allocated - funded);
  const currentAuto = funded - spentFrom;
  const currentManual = Number.isFinite(Number(input.currentManual)) ? Number(input.currentManual) : null;
  const currentDisplayed = currentManual ?? currentAuto;
  const unallocated = currentDisplayed - currentAuto;
  const topUpNeeded = Math.max(0, currentAuto - currentDisplayed);

  return {
    allocated,
    funded,
    unfunded,
    spentFrom,
    currentAuto,
    currentManual,
    currentDisplayed,
    unallocated,
    topUpNeeded,
  };
}

function buildAccountViewModels(params: UseAccountViewModelsParams): AccountViewModel[] {
  const {
    accounts,
    periodId,
    planItems,
    allocations,
    periodTransactions,
    allTransactions,
    incomeTotal,
    currentManualByAccountId,
  } = params;

  // Plan-item-to-account mapping keeps legacy fallback behavior while plannedAccountId adoption completes.
  const plannedAccountByPlanItemId = new Map<string, string>();
  allocations.forEach((row) => {
    if (row.sourceType !== 'PLAN') return;
    const planId = normalizeId(row.sourceItemId);
    const accountId = normalizeId(row.accountId);
    if (!planId || !accountId) return;
    plannedAccountByPlanItemId.set(planId, accountId);
  });
  planItems.forEach((row) => {
    const planId = normalizeId(row.id);
    const plannedAccountId = normalizeId((row as any).plannedAccountId);
    if (!planId || !plannedAccountId) return;
    plannedAccountByPlanItemId.set(planId, plannedAccountId);
  });

  const planWithPriority = planItems
    .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
    .map((row, index) => ({
      ...row,
      id: row.id!,
      priority: Number.isFinite(Number((row as any).priority)) ? Number((row as any).priority) : index + 1,
      reconcilePinned: (row as any).reconcilePinned === true,
    }));

  const spentByPlanId = new Map<string, number>();
  periodTransactions.forEach((tx) => {
    const planId = planItemIdOf(tx);
    if (!planId) return;
    spentByPlanId.set(planId, (spentByPlanId.get(planId) ?? 0) + transactionSignedBudgetAmount(tx));
  });

  const spendFlagByPlanId = new Map<string, SpendFlag>();
  const planIds = new Set<string>();
  planWithPriority.forEach((row) => planIds.add(row.id));
  spentByPlanId.forEach((_amount, id) => planIds.add(id));
  planIds.forEach((planId) => {
    const spent = spentByPlanId.get(planId) ?? 0;
    const planned = planWithPriority.find((row) => row.id === planId)?.amount ?? 0;
    spendFlagByPlanId.set(planId, computeSpendFlag(spent, planned));
  });

  const fundingOrder = [...planWithPriority].sort((a, b) => {
    const aSpendFlag = spendFlagByPlanId.get(a.id) || 'NOT_SPENT';
    const bSpendFlag = spendFlagByPlanId.get(b.id) || 'NOT_SPENT';
    const aPrioritized = aSpendFlag === 'PARTIAL_SPENT' || (a.reconcilePinned === true && aSpendFlag !== 'SPENT');
    const bPrioritized = bSpendFlag === 'PARTIAL_SPENT' || (b.reconcilePinned === true && bSpendFlag !== 'SPENT');
    if (aPrioritized !== bPrioritized) return aPrioritized ? -1 : 1;

    if (aPrioritized && bPrioritized) {
      const aOrder = RECONCILE_PINNED_GROUP_ORDER[a.group as PlanGroup] ?? Number.MAX_SAFE_INTEGER;
      const bOrder = RECONCILE_PINNED_GROUP_ORDER[b.group as PlanGroup] ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }

    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });

  const fundedByPlanId = new Map<string, number>();
  let remainingIncome = Math.max(0, toAmount(incomeTotal));
  fundingOrder.forEach((row) => {
    const amount = Math.max(0, toAmount(row.amount));
    const funded = Math.min(amount, Math.max(remainingIncome, 0));
    fundedByPlanId.set(row.id, funded);
    remainingIncome = Math.max(0, remainingIncome - amount);
  });

  const assignedByAccount = new Map<string, AccountAssignedItemViewModel[]>();
  planWithPriority.forEach((row) => {
    const accountId =
      normalizeId((row as any).plannedAccountId) ||
      normalizeId(plannedAccountByPlanItemId.get(row.id));
    if (!accountId) return;
    const allocated = Math.max(0, toAmount(row.amount));
    const funded = Math.max(0, toAmount(fundedByPlanId.get(row.id)));
    const spent = toAmount(spentByPlanId.get(row.id));
    const rows = assignedByAccount.get(accountId) ?? [];
    rows.push({
      id: row.id,
      name: row.name || 'Budget item',
      allocated,
      funded,
      spent,
      remaining: funded - spent,
    });
    assignedByAccount.set(accountId, rows);
  });
  assignedByAccount.forEach((rows) => rows.sort((a, b) => a.name.localeCompare(b.name)));

  const allTimeCashMovementByAccount = new Map<string, number>();
  allTransactions.forEach((tx) => {
    transactionCashDeltas(tx).forEach(({ accountId, delta }) => {
      if (!accountId || !delta) return;
      allTimeCashMovementByAccount.set(accountId, (allTimeCashMovementByAccount.get(accountId) || 0) + delta);
    });
  });

  const periodFlowByAccount = new Map<string, { inflow: number; outflow: number; net: number; transferIn: number; transferOut: number }>();
  periodTransactions.forEach((tx) => {
    const type = txType(tx);
    const amount = Math.abs(toAmount(tx.amount));
    transactionCashDeltas(tx).forEach(({ accountId, delta }) => {
      if (!accountId) return;
      const current = periodFlowByAccount.get(accountId) ?? {
        inflow: 0,
        outflow: 0,
        net: 0,
        transferIn: 0,
        transferOut: 0,
      };
      if (delta >= 0) current.inflow += delta;
      else current.outflow += Math.abs(delta);
      current.net += delta;
      if (type === 'TRANSFER') {
        if (delta >= 0) current.transferIn += amount;
        else current.transferOut += amount;
      }
      periodFlowByAccount.set(accountId, current);
    });
  });

  return accounts.map((account) => {
    const accountId = normalizeId(account.id);
    const opening = toAmount(account.openingBalance);
    const movementAllTime = allTimeCashMovementByAccount.get(accountId) ?? 0;
    const periodFlow = periodFlowByAccount.get(accountId) ?? {
      inflow: 0,
      outflow: 0,
      net: 0,
      transferIn: 0,
      transferOut: 0,
    };

    const metrics = computeAccountPeriodMetrics({
      accountId,
      periodId,
      planItems: planWithPriority,
      fundedByPlanId,
      plannedAccountByPlanItemId,
      periodTransactions,
      currentManual: currentManualByAccountId?.[accountId] ?? null,
    });

    return {
      accountId,
      accountName: account.name || accountId || 'Account',
      accountType: account.type,
      archived: account.archived === true,
      reminderEnabled: account.dailyReminderEnabled === true,
      cash: {
        opening,
        movementAllTime,
        current: metrics.currentDisplayed,
        currentAuto: metrics.currentAuto,
        currentManual: metrics.currentManual,
        unallocated: metrics.unallocated,
        topUpNeeded: metrics.topUpNeeded,
        periodInflow: periodFlow.inflow,
        periodOutflow: periodFlow.outflow,
        periodNet: periodFlow.net,
        transferIn: periodFlow.transferIn,
        transferOut: periodFlow.transferOut,
      },
      budget: {
        allocated: metrics.allocated,
        funded: metrics.funded,
        spentFrom: metrics.spentFrom,
        remaining: metrics.currentAuto,
        unfunded: metrics.unfunded,
      },
      assignedItems: assignedByAccount.get(accountId) ?? [],
    } satisfies AccountViewModel;
  });
}

export function useAccountViewModels(params: UseAccountViewModelsParams) {
  const rows = useMemo(
    () => buildAccountViewModels(params),
    [
      params.accounts,
      params.periodId,
      params.planItems,
      params.allocations,
      params.periodTransactions,
      params.allTransactions,
      params.incomeTotal,
      params.currentManualByAccountId,
    ]
  );

  const byAccountId = useMemo(() => {
    const map = new Map<string, AccountViewModel>();
    rows.forEach((row) => {
      if (!row.accountId) return;
      map.set(row.accountId, row);
    });
    return map;
  }, [rows]);

  return { rows, byAccountId };
}
