import { useEffect, useMemo, useRef, useState } from 'react';
import { parseMoney } from '@/lib/format';
import { computeFundedBudgetByItemId, hasFundedAmount } from '@/lib/funding';
import { isDateISO, localDateISO, postingPeriodId } from '@/lib/rules/postingMonth';
import { monthTitle } from '@/lib/rules/months';
import { createPeriodIfAbsent, watchPeriodState, type PeriodState } from '@/lib/repo/periodCreate';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { watchIncomeItems } from '@/lib/repo/income';
import { type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { type Account, watchAccounts } from '@/lib/repo/accounts';
import { addTransactionOnce, newClientId, type Tx, watchTransactions } from '@/lib/repo/transactions';

/**
 * Expense form logic (BUDG-1 AC-5), moved unchanged from components/ExpenseFormModal.tsx for the
 * BUDG-8 Add sheet: initialised once when opened, posts to the month of its own date (never the
 * viewed month), missing month -> explicit create, closed month -> blocked, one write on Save.
 * Added read-only: the posting month's transactions, to order line chips by last use and show Left.
 */
export function useExpenseForm(open: boolean, uid: string | null | undefined, onSaved?: (periodId: string) => void) {
  const [date, setDateState] = useState(localDateISO());
  const [planItemId, setPlanItemId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const txIdRef = useRef(''); // H-2: one id per open form; a retry or a second Save reuses it

  const [periodState, setPeriodState] = useState<PeriodState | null>(null);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [monthTx, setMonthTx] = useState<Tx[]>([]);

  useEffect(() => {
    if (!open) return;
    txIdRef.current = newClientId();
    setDateState(localDateISO());
    setPlanItemId('');
    setAccountId('');
    setAmountText('');
    setNote('');
    setError('');
  }, [open]);

  const dateValid = isDateISO(date);
  const postingPid = dateValid ? postingPeriodId(date) : '';

  useEffect(() => {
    if (!open || !uid || !postingPid) return;
    setPeriodState(null);
    setPlanItems([]);
    setMonthTx([]);
    const unsubs = [
      watchPeriodState(uid, postingPid, setPeriodState),
      watchPlanTotals(uid, postingPid, (_totals, rows) => setPlanItems(rows)),
      watchIncomeItems(uid, postingPid, (_rows, activeTotal) => setIncomeTotal(activeTotal)),
      watchAllocations(uid, postingPid, setAllocations),
      watchTransactions(uid, postingPid, setMonthTx),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [open, uid, postingPid]);

  useEffect(() => {
    if (!open || !uid) return;
    return watchAccounts(uid, setAccounts);
  }, [open, uid]);

  const funded = useMemo(() => computeFundedBudgetByItemId(planItems as any, incomeTotal), [planItems, incomeTotal]);
  const lines = useMemo(() => planItems.filter((row) => row.id), [planItems]);
  const spentByLine = useMemo(() => {
    const out: Record<string, number> = {};
    for (const tx of monthTx) {
      const id = tx.planItemId || tx.categoryId;
      if (id && (tx.type ?? 'EXPENSE') === 'EXPENSE') out[id] = (out[id] || 0) + (Number(tx.amount) || 0);
    }
    return out;
  }, [monthTx]);
  /** Lines most recently used first (from the posting month), then plan order. */
  const recentLines = useMemo(() => {
    const last: Record<string, string> = {};
    for (const tx of monthTx) {
      const id = tx.planItemId || tx.categoryId;
      if (id && String(tx.date || '') > (last[id] || '')) last[id] = String(tx.date || '');
    }
    return [...lines].sort((a, b) => (last[String(b.id)] || '').localeCompare(last[String(a.id)] || ''));
  }, [lines, monthTx]);
  const leftFor = (id: string) => (funded[id] || 0) - (spentByLine[id] || 0);

  const selectedPlan = planItems.find((row) => row.id === planItemId);
  const selectedAccount = accounts.find((row) => row.id === accountId);
  const amount = parseMoney(amountText);

  function setDate(value: string) {
    setDateState(value.trim());
    setPlanItemId('');
  }

  function choosePlan(id: string) {
    setPlanItemId(id);
    setError('');
    if (accountId) return;
    const fromAllocation = allocations.find((row) => row.sourceType === 'PLAN' && row.sourceItemId === id)?.accountId;
    const planned = (planItems.find((row) => row.id === id) as any)?.plannedAccountId || fromAllocation || '';
    if (planned && accounts.some((row) => row.id === planned)) setAccountId(planned);
  }

  async function createPostingMonth() {
    if (!uid || !postingPid || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await createPeriodIfAbsent(uid, postingPid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function save(): Promise<boolean> {
    if (!uid || pendingRef.current) return false;
    if (!dateValid) return void setError('Enter the expense date as YYYY-MM-DD.'), false;
    if (!periodState?.exists) return void setError(`There is no ${monthTitle(postingPid)} budget yet.`), false;
    if (periodState.status === 'DECIDED') return void setError(`${monthTitle(postingPid)} is closed and view-only.`), false;
    if (!selectedPlan?.id) return void setError('Choose the budget line this expense belongs to.'), false;
    if (!hasFundedAmount(funded, selectedPlan.id)) return void setError('This budget item is not funded in that month.'), false;
    if (!selectedAccount?.id) return void setError('Choose the account that paid.'), false;
    if (!amount || amount <= 0) return void setError('Amount must be greater than 0.'), false;
    pendingRef.current = true;
    setPending(true);
    try {
      if (!txIdRef.current) txIdRef.current = newClientId();
      await addTransactionOnce(uid, postingPid, txIdRef.current, {
        name: selectedPlan.name,
        categoryId: selectedPlan.id,
        planItemId: selectedPlan.id,
        group: selectedPlan.group,
        amount,
        date,
        note: note.trim(),
        paidFromAccountId: selectedAccount.id,
      });
      txIdRef.current = newClientId(); // saved: a further Save in this form is a new expense
      onSaved?.(postingPid);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const locked = periodState?.status === 'DECIDED';
  const missing = periodState !== null && !periodState.exists;
  const ready = dateValid && !!periodState?.exists && !locked && !!selectedPlan?.id && !!selectedAccount?.id && amount > 0 && !pending;

  return {
    date, setDate, dateValid, postingPid, planItemId, choosePlan, accountId, setAccountId, amountText, setAmountText, note, setNote,
    error, pending, periodState, locked, missing, ready, lines, recentLines, leftFor, accounts, selectedPlan, selectedAccount, amount,
    createPostingMonth, save,
  };
}
