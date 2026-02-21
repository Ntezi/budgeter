import type { PlanGroup } from './repo/plans';

type FundingPlanItem = {
  id: string;
  name: string;
  amount?: number;
  group: PlanGroup;
  priority?: number;
  reconcilePinned?: boolean;
};

const PINNED_GROUP_ORDER: Record<PlanGroup, number> = {
  NEED: 0,
  SAVINGS_DEBT: 1,
  WANT: 2,
};

function compareFundingOrder(a: FundingPlanItem, b: FundingPlanItem) {
  const aPinned = a.reconcilePinned === true;
  const bPinned = b.reconcilePinned === true;
  if (aPinned !== bPinned) return aPinned ? -1 : 1;

  if (aPinned && bPinned) {
    const groupDiff = PINNED_GROUP_ORDER[a.group] - PINNED_GROUP_ORDER[b.group];
    if (groupDiff !== 0) return groupDiff;
  }

  const priorityA = Number(a.priority ?? Number.MAX_SAFE_INTEGER);
  const priorityB = Number(b.priority ?? Number.MAX_SAFE_INTEGER);
  if (priorityA !== priorityB) return priorityA - priorityB;

  return String(a.name || '').localeCompare(String(b.name || ''));
}

export function computeFundedBudgetByItemId(items: FundingPlanItem[], activeIncomeTotal: number) {
  const out: Record<string, number> = {};
  const ordered = [...items].sort(compareFundingOrder);
  let remaining = Math.max(0, Number(activeIncomeTotal || 0));

  ordered.forEach((item) => {
    const amount = Math.max(0, Number(item.amount || 0));
    const funded = Math.min(amount, remaining);
    out[item.id] = funded;
    remaining = Math.max(0, remaining - amount);
  });

  return out;
}

export function hasFundedAmount(fundedById: Record<string, number>, itemId: string) {
  return Number(fundedById[itemId] || 0) > 0;
}
