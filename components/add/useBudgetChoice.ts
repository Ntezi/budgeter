import { useEffect, useMemo, useState } from 'react';
import { watchPeriods } from '@/lib/repo/periods';
import { budgetOptions, chosenBudgetId, openBudgetIds, type BudgetPeriodRow } from '@/lib/rules/budgetChoice';

/**
 * BUDG-40 AC-2: the Budget field of the three expense forms (Add expense, Record expense, receipt
 * "Record new expense"). Follows the date until the user picks a month; the pick then stays for this
 * opening of the form. Nothing is created here.
 */
export function useBudgetChoice(open: boolean, uid: string | null | undefined, dateISO: string) {
  const [manual, setManual] = useState<string | null>(null);
  const [rows, setRows] = useState<BudgetPeriodRow[]>([]);

  useEffect(() => {
    if (open) setManual(null);
  }, [open]);

  useEffect(() => {
    if (!open || !uid) return;
    return watchPeriods(uid, (list) => setRows(list.map((row) => ({ id: String(row.id), status: row.status }))));
  }, [open, uid]);

  const budgetId = chosenBudgetId(dateISO, manual);
  const options = useMemo(() => budgetOptions(rows, budgetId), [rows, budgetId]);
  const isOpen = useMemo(() => openBudgetIds(rows).includes(budgetId), [rows, budgetId]);
  return { budgetId, options, isOpen, manual: manual !== null, choose: (id: string) => setManual(id || null) };
}
