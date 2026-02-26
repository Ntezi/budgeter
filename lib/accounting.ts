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
  const direct = normalizeId(tx.accountId);
  if (direct) return direct;

  const categoryId = normalizeId(tx.categoryId);
  if (!categoryId) return '';

  return allocationIndex.get(periodId)?.get(categoryId) || '';
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

    const amount = toAmount(tx.amount);
    totals.set(accountId, (totals.get(accountId) || 0) + amount);
  });

  return totals;
}

export function getAccountCurrentAmount(account: Account, spentAmount = 0) {
  return toAmount(account.openingBalance) - toAmount(spentAmount);
}
