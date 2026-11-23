// BUDG-8 S8 (briefs/redesign/05): the Accounts screen's words over the existing account view-model.
// Pure renaming and ordering: every figure is read from AccountViewModel as accounts.tsx showed it before.
import type { AccountViewModel } from '@/lib/view-models/useAccountViewModels';

type Vm = Pick<AccountViewModel, 'cash' | 'budget'>;

export type AccountFigures = {
  /** "Actual this month" = cash.current (was "Current (Actual)"; a hand-set figure, 0 when none). */
  actual: number;
  /** "Set aside for plans" = budget.allocated (was "Allocated"). */
  setAside: number;
  /** "Moved in" = budget.funded (was "Funded"). */
  movedIn: number;
  /** "Still to move" = budget.unfunded (was "Unfunded"). */
  stillToMove: number;
  /** "Spent from here" = budget.spentFrom (was "Spent"). */
  spent: number;
  /** "Not planned yet" = cash.unallocated (was "Unallocated cash"). */
  notPlanned: number;
  /** "Free to move" = the old transferableAmount(): unallocated when positive, else the balance floored at 0. */
  freeToMove: number;
};

export function freeToMove(vm: { cash: { current: number; unallocated: number } } | null | undefined) {
  if (!vm) return 0;
  if (vm.cash.unallocated > 0) return vm.cash.unallocated;
  return Math.max(0, vm.cash.current);
}

export function accountFigures(vm: Vm): AccountFigures {
  return {
    actual: vm.cash.current,
    setAside: vm.budget.allocated,
    movedIn: vm.budget.funded,
    stillToMove: vm.budget.unfunded,
    spent: vm.budget.spentFrom,
    notPlanned: vm.cash.unallocated,
    freeToMove: freeToMove(vm),
  };
}

export type AccountHint = { tone: 'danger' | 'warning' | 'muted'; text: string };

/**
 * One hint line per account, most urgent first (spec 05 "Hint line priority"). `balanceToday` is the
 * opening balance + all-time cash movement (the figure Home shows), not the period's cash.current.
 */
export function accountHint(vm: Vm, money: (n: number) => string, balanceToday: number): AccountHint {
  const f = accountFigures(vm);
  if (balanceToday < 0) return { tone: 'danger', text: `Overdrawn by ${money(-balanceToday)}` };
  if (f.stillToMove > 0) return { tone: 'warning', text: `${money(f.stillToMove)} still to move here` };
  if (f.notPlanned < 0) return { tone: 'danger', text: `${money(-f.notPlanned)} more planned than you have` };
  return { tone: 'muted', text: 'All set' };
}

/** Default source for moving money into `toId`: the other active account with the most free to move. */
export function defaultSource<T extends Vm & { accountId: string; archived: boolean }>(rows: T[], toId: string): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!r.accountId || r.archived || r.accountId === toId) continue;
    if (!best || freeToMove(r) > freeToMove(best)) best = r;
  }
  return best;
}

/** Amount to pre-fill: what `to` still needs, capped at what `from` has free; never negative. */
export function prefillAmount(from: Vm | null | undefined, to: Vm | null | undefined) {
  const cap = freeToMove(from ?? null);
  const need = to ? Math.max(0, to.budget.unfunded) : 0;
  return Math.max(0, Math.min(need || cap, cap));
}
