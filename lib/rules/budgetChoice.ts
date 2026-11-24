// BUDG-40 AC-2 (F-2): the budget (month) an expense goes to. Default = the month of its date; the user may
// choose another open month (budgets run payday to payday, so a 27 June expense often belongs in July's).
// A manual choice sticks for the open form, whatever the date does; reset when the form reopens.
import { monthTitle } from './months';
import { isDateISO, postingPeriodId } from './postingMonth';

const PERIOD_ID = /^\d{4}-(0[1-9]|1[0-2])$/;

export type BudgetPeriodRow = { id: string; status?: string | null };
export type BudgetOption = { value: string; label: string };

/** The budget an expense goes to: the manual choice when there is one, else the month of the date ('' when the date is not valid). */
export function chosenBudgetId(dateISO: string, manual: string | null | undefined): string {
  if (manual && PERIOD_ID.test(manual)) return manual;
  const value = String(dateISO || '').trim();
  return isDateISO(value) ? postingPeriodId(value) : '';
}

/** Open (not DECIDED) existing months, newest first, one entry per month. */
export function openBudgetIds(rows: BudgetPeriodRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) if (PERIOD_ID.test(String(row.id)) && row.status !== 'DECIDED') ids.add(String(row.id));
  return [...ids].sort((a, b) => b.localeCompare(a));
}

/**
 * Options for the Budget field: the open months, newest first. When the current budget is not one of them
 * (the month of the date is closed or has no budget yet) it is listed first with what is wrong, so the field
 * always shows where the expense would go; it can never be saved there.
 */
export function budgetOptions(rows: BudgetPeriodRow[], current: string): BudgetOption[] {
  const open = openBudgetIds(rows);
  const out = open.map((id) => ({ value: id, label: monthTitle(id) }));
  if (current && !open.includes(current)) {
    const closed = rows.some((row) => row.id === current && row.status === 'DECIDED');
    out.unshift({ value: current, label: `${monthTitle(current)} (${closed ? 'closed' : 'no budget yet'})` });
  }
  return out;
}
