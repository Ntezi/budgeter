// BUDG-8 S4 Home view-model (spec 02). Pure: maps numbers the dashboard already reads
// (income, plan totals, transactions, accounts report, periods) to words. No repo call.
import { addMonthsToId, monthTitle } from '../rules/months';

export type HomeTone = 'current' | 'past' | 'future' | 'closed';

export type HomeSummaryInput = {
  monthId: string;
  todayMonthId: string;
  todayDay: number;
  daysInMonth: number;
  closed: boolean;
  planned: number;
  spent: number;
};

export type HomeSummary = {
  tone: HomeTone;
  label: string;
  amount: number;
  over: boolean;
  progress: number;
  usedPct: number;
  sentence: string;
};

export const monthName = (monthId: string) => monthTitle(monthId).split(' ')[0];

export function homeSummary(i: HomeSummaryInput, money: (n: number) => string): HomeSummary {
  const name = monthName(i.monthId);
  const tone: HomeTone = i.closed ? 'closed' : i.monthId < i.todayMonthId ? 'past' : i.monthId > i.todayMonthId ? 'future' : 'current';
  const left = i.planned - i.spent;
  const over = left < 0;
  const usedPct = i.planned > 0 ? Math.round((i.spent / i.planned) * 100) : 0;
  const progress = Math.max(0, Math.min(100, usedPct));
  const spentOf = `Spent ${money(i.spent)} of ${money(i.planned)}`;
  if (tone === 'future') {
    return { tone, label: `Planned for ${name}`, amount: i.planned, over: false, progress, usedPct, sentence: i.spent ? spentOf : 'Nothing spent yet.' };
  }
  const label = tone === 'closed' ? `${name} (closed)` : tone === 'past' ? `Left at month end in ${name}` : `Left to spend in ${name}`;
  const daysLeft = tone === 'current' ? Math.max(0, i.daysInMonth - i.todayDay) : 0;
  const tail = over
    ? `${money(Math.abs(left))} over plan.`
    : tone === 'current'
      ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left.`
      : 'Final numbers.';
  return { tone, label, amount: left, over, progress, usedPct, sentence: `${spentOf} · ${tail}` };
}

export type NeedsYouItem = { id: string; icon: string; title: string; amount?: string; href: string; tone: 'danger' | 'warning' | 'info' };

export type NeedsYouInput = {
  monthId: string;
  todayMonthId: string;
  todayDay: number;
  overdraftCount: number;
  unlinkedSpent: number;
  unlinkedCount: number;
  nextMonthExists: boolean;
};

/** Read-only reminders; tapping only navigates. Empty list = the section is hidden (spec 02). */
export function needsYou(i: NeedsYouInput, money: (n: number) => string): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  if (i.overdraftCount > 0) {
    out.push({ id: 'overdrawn', icon: 'alert-circle-outline', tone: 'danger', href: '/accounts', title: `${i.overdraftCount} ${i.overdraftCount === 1 ? 'account is' : 'accounts are'} overdrawn` });
  }
  if (i.unlinkedCount > 0) {
    out.push({
      id: 'unlinked',
      icon: 'help-circle-outline',
      tone: 'warning',
      href: `/transactions?month=${i.monthId}&scope=UNCATEGORIZED`,
      title: `${i.unlinkedCount} ${i.unlinkedCount === 1 ? 'cost has' : 'costs have'} no plan line`,
      amount: money(i.unlinkedSpent),
    });
  }
  const next = addMonthsToId(i.monthId, 1);
  if (i.monthId === i.todayMonthId && i.todayDay >= 25 && !i.nextMonthExists) {
    out.push({ id: 'next-month', icon: 'calendar-plus', tone: 'info', href: `/budgets/${next}`, title: `Start ${monthName(next)}'s plan` });
  }
  return out.slice(0, 3);
}
