// Pure month rules for New Budget (BUDG-1 AC-2). Month ids are `YYYY-MM`; all
// month arithmetic goes through Date (local calendar), never string math.

export type MonthChoiceKind = 'NEW' | 'OPEN_DRAFT' | 'OPEN_LOCKED';
export type MonthRelation = 'PAST' | 'CURRENT' | 'NEXT';

export type MonthChoice = {
  id: string;
  title: string;
  kind: MonthChoiceKind;
  relation: MonthRelation;
};

export type PeriodLike = { id: string; status?: string | null };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DEFAULT_PAST_WINDOW = 3;

const MONTH_ID = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthId(value: string): boolean {
  return MONTH_ID.test(String(value || ''));
}

export function monthIdFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonthsToId(monthId: string, delta: number): string {
  const match = MONTH_ID.exec(monthId);
  if (!match) throw new Error(`Invalid month id "${monthId}"`);
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
  return monthIdFromDate(date);
}

export function monthTitle(monthId: string): string {
  const match = MONTH_ID.exec(monthId);
  if (!match) return monthId;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

export function kindForPeriod(period: PeriodLike | undefined): MonthChoiceKind {
  if (!period) return 'NEW';
  return period.status === 'DECIDED' ? 'OPEN_LOCKED' : 'OPEN_DRAFT';
}

/**
 * Months offered by New Budget, oldest first.
 * - the current local month (the default) and the month after it, whatever their state;
 * - months inside the past window that do not exist yet (missing past months).
 * Existing past months are not offered: they are already listed on the Budgets screen.
 */
export function newBudgetChoices(
  todayLocal: Date,
  periods: PeriodLike[],
  pastWindow: number = DEFAULT_PAST_WINDOW
): MonthChoice[] {
  const byId = new Map(periods.map((row) => [row.id, row]));
  const current = monthIdFromDate(todayLocal);
  const out: MonthChoice[] = [];
  const window = Math.max(0, Math.min(6, Math.floor(pastWindow)));
  for (let back = window; back >= 1; back -= 1) {
    const id = addMonthsToId(current, -back);
    if (!byId.has(id)) out.push({ id, title: monthTitle(id), kind: 'NEW', relation: 'PAST' });
  }
  const next = addMonthsToId(current, 1);
  out.push({ id: current, title: monthTitle(current), kind: kindForPeriod(byId.get(current)), relation: 'CURRENT' });
  out.push({ id: next, title: monthTitle(next), kind: kindForPeriod(byId.get(next)), relation: 'NEXT' });
  return out;
}

export function defaultChoiceId(choices: MonthChoice[]): string {
  return (choices.find((row) => row.relation === 'CURRENT') ?? choices[0])?.id ?? '';
}

export function choiceActionLabel(choice: MonthChoice): string {
  if (choice.kind === 'NEW') return `Creates ${choice.title} · blank draft`;
  if (choice.kind === 'OPEN_DRAFT') return `Opens ${choice.title} · existing draft`;
  return `Opens ${choice.title} · locked, read-only`;
}
