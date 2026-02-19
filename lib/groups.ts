import type { PlanGroup } from '@/lib/repo/plans';
import type { WalletTag } from '@/lib/domain';

export const PLAN_GROUP_OPTIONS: Array<{ label: string; value: PlanGroup }> = [
  { label: 'Needs', value: 'NEED' },
  { label: 'Wants', value: 'WANT' },
  { label: 'Savings-Debt', value: 'SAVINGS_DEBT' },
];

export function planGroupLabel(group: PlanGroup) {
  if (group === 'NEED') return 'Needs';
  if (group === 'WANT') return 'Wants';
  return 'Savings-Debt';
}

export function planGroupToTag(group: PlanGroup): WalletTag {
  if (group === 'NEED') return 'NEEDS';
  if (group === 'WANT') return 'WANTS';
  return 'SAVINGS';
}

export const GROUP_COLOR_CLASS: Record<PlanGroup, string> = {
  NEED: 'bg-needs',
  WANT: 'bg-wants',
  SAVINGS_DEBT: 'bg-savings',
};

export const GROUP_TEXT_COLOR_CLASS: Record<PlanGroup, string> = {
  NEED: 'text-blue-700 dark:text-blue-300',
  WANT: 'text-pink-700 dark:text-pink-300',
  SAVINGS_DEBT: 'text-emerald-700 dark:text-emerald-300',
};
