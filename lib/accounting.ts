import type { Account } from '@/lib/repo/accounts';
import type { Allocation } from '@/lib/repo/allocations';
import type { Tx } from '@/lib/repo/transactions';

export type AllocationWithPeriod = Allocation & {
  periodId: string;
};

export type TxWithPeriod = Tx & {
  periodId: string;
};

type PlanAllocationIndex = Map<string, Map<string, string>>;

function normalizeId(input?: string | null) {
  return String(input || '').trim();
}

function toAmount(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function transactionType(tx: Tx) {
  return tx.type || 'EXPENSE';
}

export function transactionPlanItemId(tx: Tx) {
  const planItemId = normalizeId(tx.planItemId);
  if (planItemId) return planItemId;
  return normalizeId(tx.categoryId);
}

export function transactionPaidFromAccountId(tx: Tx) {
  const paidFrom = normalizeId(tx.paidFromAccountId);
  if (paidFrom) return paidFrom;
  return normalizeId(tx.accountId);
}

export function transactionSignedBudgetAmount(tx: Tx) {
  const amount = Math.abs(toAmount(tx.amount));
  const type = transactionType(tx);
  if (type === 'EXPENSE') return amount;
  if (type === 'REFUND') return -amount;
  return 0;
}

export function transactionCashDeltas(tx: Tx): Array<{ accountId: string; delta: number }> {
  const type = transactionType(tx);
  const amount = toAmount(tx.amount);
  const absAmount = Math.abs(amount);
  const fromAccountId = transactionPaidFromAccountId(tx);
  const toAccountId = normalizeId(tx.toAccountId);

  if (type === 'EXPENSE') {
    return fromAccountId ? [{ accountId: fromAccountId, delta: -absAmount }] : [];
  }
  if (type === 'INCOME' || type === 'REFUND') {
    return fromAccountId ? [{ accountId: fromAccountId, delta: absAmount }] : [];
  }
  if (type === 'TRANSFER') {
    const rows: Array<{ accountId: string; delta: number }> = [];
    if (fromAccountId) rows.push({ accountId: fromAccountId, delta: -absAmount });
    if (toAccountId) rows.push({ accountId: toAccountId, delta: absAmount });
    return rows;
  }
  if (type === 'ADJUSTMENT') {
    return fromAccountId ? [{ accountId: fromAccountId, delta: amount }] : [];
  }
  return [];
}

export function buildPlanAllocationIndex(rows: AllocationWithPeriod[]): PlanAllocationIndex {
  const byPeriod = new Map<string, Map<string, string>>();

  rows.forEach((row) => {
    if (row.sourceType !== 'PLAN') return;
    const periodId = normalizeId(row.periodId);
    const sourceItemId = normalizeId(row.sourceItemId);
    const accountId = normalizeId(row.accountId);
    if (!periodId || !sourceItemId || !accountId) return;

    if (!byPeriod.has(periodId)) byPeriod.set(periodId, new Map<string, string>());
    byPeriod.get(periodId)!.set(sourceItemId, accountId);
  });

  return byPeriod;
}

export function resolveTransactionAccountId(
  tx: Tx,
  periodId: string,
  allocationIndex: PlanAllocationIndex
): string {
  const direct = transactionPaidFromAccountId(tx);
  if (direct) return direct;

  const planItemId = transactionPlanItemId(tx);
  if (!planItemId) return '';

  return allocationIndex.get(periodId)?.get(planItemId) || '';
}

export function sumSpendingByAccount(
  transactions: TxWithPeriod[],
  allocations: AllocationWithPeriod[]
): Map<string, number> {
  const allocationIndex = buildPlanAllocationIndex(allocations);
  const totals = new Map<string, number>();

  transactions.forEach((tx) => {
    const periodId = normalizeId(tx.periodId);
    if (!periodId) return;
    const accountId = resolveTransactionAccountId(tx, periodId, allocationIndex);
    if (!accountId) return;

    const amount = transactionSignedBudgetAmount(tx);
    if (!amount) return;
    totals.set(accountId, (totals.get(accountId) || 0) + amount);
  });

  return totals;
}

export function sumCashMovementByAccount(transactions: Tx[]) {
  const totals = new Map<string, number>();
  transactions.forEach((tx) => {
    transactionCashDeltas(tx).forEach(({ accountId, delta }) => {
      if (!accountId || !delta) return;
      totals.set(accountId, (totals.get(accountId) || 0) + delta);
    });
  });
  return totals;
}

export function getAccountCurrentAmount(account: Account, cashMovement = 0) {
  return toAmount(account.openingBalance) + toAmount(cashMovement);
}
