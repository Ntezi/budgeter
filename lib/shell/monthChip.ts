// MonthChip rules (BUDG-8 00 "Month context control"): the chip shows the viewed month and its
// only effect is the ?month= URL parameter. It never creates a period and never sets where an
// expense posts (that follows the form's own date, lib/rules/postingMonth.ts).
import { isMonthId, monthIdFromDate } from '../rules/months';

export type MonthStatus = 'OPEN' | 'CLOSED' | 'NOT_STARTED';
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The viewed month: a valid ?month=, else the workspace's active period, else this local month. */
export function viewedMonthId(param: unknown, activePeriodId?: string | null, now: Date = new Date()): string {
  if (typeof param === 'string' && isMonthId(param)) return param;
  if (activePeriodId && isMonthId(activePeriodId)) return activePeriodId;
  return monthIdFromDate(now);
}

export function chipLabel(monthId: string): string {
  const [y, m] = monthId.split('-').map(Number);
  return `${SHORT[m - 1]} ${y}`;
}

export function shortMonth(monthId: string): string {
  return SHORT[Number(monthId.slice(5, 7)) - 1];
}

export function monthStatus(periods: { id: string; status?: string | null }[], monthId: string): MonthStatus {
  const row = periods.find((p) => p.id === monthId);
  if (!row) return 'NOT_STARTED';
  return row.status === 'DECIDED' ? 'CLOSED' : 'OPEN';
}

export const STATUS_WORD: Record<MonthStatus, string> = { OPEN: 'Open', CLOSED: 'Closed', NOT_STARTED: 'Not started' };

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/** The one write the chip makes: URL params for router.setParams. */
export function monthChipParams(monthId: string): { month: string } {
  if (!isMonthId(monthId)) throw new Error(`Invalid month "${monthId}"`);
  return { month: monthId };
}
