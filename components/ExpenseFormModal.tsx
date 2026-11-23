import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { DropdownField } from '@/components/ui/DropdownField';
import { fmtMoney, parseMoney } from '@/lib/format';
import { computeFundedBudgetByItemId, hasFundedAmount } from '@/lib/funding';
import { isDateISO, localDateISO, postingPeriodId } from '@/lib/rules/postingMonth';
import { monthTitle } from '@/lib/rules/months';
import { createPeriodIfAbsent, watchPeriodState, type PeriodState } from '@/lib/repo/periodCreate';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { watchIncomeItems } from '@/lib/repo/income';
import { type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { type Account, watchAccounts } from '@/lib/repo/accounts';
import { addTransaction } from '@/lib/repo/transactions';

type Props = {
  open: boolean;
  uid: string | null | undefined;
  onClose: () => void;
  onSaved?: (periodId: string) => void;
};

/**
 * Expense form (BUDG-1 AC-5): owns date, budget line, account and amount. It is
 * initialised once when opened and posts to the month of its own date, never to
 * the month being viewed behind it.
 */
export function ExpenseFormModal({ open, uid, onClose, onSaved }: Props) {
  const [date, setDate] = useState(localDateISO());
  const [planItemId, setPlanItemId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const [periodState, setPeriodState] = useState<PeriodState | null>(null);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!open) return;
    setDate(localDateISO());
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
    const unsubs = [
      watchPeriodState(uid, postingPid, setPeriodState),
      watchPlanTotals(uid, postingPid, (_totals, rows) => setPlanItems(rows)),
      watchIncomeItems(uid, postingPid, (_rows, activeTotal) => setIncomeTotal(activeTotal)),
      watchAllocations(uid, postingPid, setAllocations),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [open, uid, postingPid]);

  useEffect(() => {
    if (!open || !uid) return;
    return watchAccounts(uid, setAccounts);
  }, [open, uid]);

  const funded = useMemo(() => computeFundedBudgetByItemId(planItems as any, incomeTotal), [planItems, incomeTotal]);
  const planOptions = useMemo(
    () =>
      planItems
        .filter((row) => row.id)
        .map((row) => ({ value: String(row.id), label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${row.group}` })),
    [planItems]
  );
  const accountOptions = useMemo(() => accounts.filter((row) => row.id).map((row) => ({ value: String(row.id), label: row.name })), [accounts]);
  const selectedPlan = planItems.find((row) => row.id === planItemId);
  const selectedAccount = accounts.find((row) => row.id === accountId);
  const amount = parseMoney(amountText);

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

  async function save() {
    if (!uid || pendingRef.current) return;
    if (!dateValid) return setError('Enter the expense date as YYYY-MM-DD.');
    if (!periodState?.exists) return setError(`There is no ${monthTitle(postingPid)} budget yet.`);
    if (periodState.status === 'DECIDED') return setError(`${monthTitle(postingPid)} is closed and view-only.`);
    if (!selectedPlan?.id) return setError('Choose the budget line this expense belongs to.');
    if (!hasFundedAmount(funded, selectedPlan.id)) return setError('This budget item is not funded in that month.');
    if (!selectedAccount?.id) return setError('Choose the account that paid.');
    if (!amount || amount <= 0) return setError('Amount must be greater than 0.');
    pendingRef.current = true;
    setPending(true);
    try {
      await addTransaction(uid, postingPid, {
        name: selectedPlan.name,
        categoryId: selectedPlan.id,
        planItemId: selectedPlan.id,
        group: selectedPlan.group,
        amount,
        date,
        note: note.trim(),
        paidFromAccountId: selectedAccount.id,
      });
      onSaved?.(postingPid);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const locked = periodState?.status === 'DECIDED';
  const missing = periodState !== null && !periodState.exists;

  return (
    <AppModal open={open} onClose={onClose} title="Add Expense">
      <View className="gap-3">
        <View className="gap-1">
          <Text className="text-xs text-muted-foreground">Date</Text>
          <AppInput value={date} onChangeText={(value) => { setDate(value.trim()); setPlanItemId(''); }} placeholder="YYYY-MM-DD" className="h-9" />
        </View>
        {missing ? (
          <View className="gap-2">
            <Text className="text-xs text-muted-foreground">There is no {monthTitle(postingPid)} budget yet. Expenses post to the month of their date.</Text>
            <AppButton label={`Create ${monthTitle(postingPid)} draft`} variant="outline" size="sm" onPress={createPostingMonth} disabled={pending} />
          </View>
        ) : null}
        {locked ? <Text className="text-xs text-muted-foreground">{monthTitle(postingPid)} is closed and view-only. Choose a date in an open month.</Text> : null}
        <View className="gap-1">
          <Text className="text-xs text-muted-foreground">Budget line</Text>
          <DropdownField value={planItemId} options={planOptions} onChange={choosePlan} placeholder="Select budget line" disabled={!periodState?.exists || locked} menuStrategy="inline" menuClassName="max-h-44" />
        </View>
        <View className="gap-1">
          <Text className="text-xs text-muted-foreground">Paid from</Text>
          <DropdownField value={accountId} options={accountOptions} onChange={setAccountId} placeholder="Select account" menuStrategy="inline" menuClassName="max-h-44" />
        </View>
        <View className="gap-1">
          <Text className="text-xs text-muted-foreground">Amount</Text>
          <AppInput value={amountText} onChangeText={setAmountText} placeholder="0.00" keyboardType="decimal-pad" className="h-9" />
        </View>
        <AppInput value={note} onChangeText={setNote} placeholder="Note (optional)" className="h-9" />
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50" accessibilityLiveRegion="polite">
          {dateValid
            ? `Posts to ${monthTitle(postingPid)} · ${selectedAccount?.name || 'choose account'} · ${fmtMoney(amount || 0)}`
            : 'Enter a valid date to see where this posts'}
        </Text>
        {error ? <Text className="text-xs text-red-600 dark:text-red-300">{error}</Text> : null}
        <View className="flex-row flex-wrap justify-end gap-2">
          <AppButton label="Cancel" variant="outline" size="sm" onPress={onClose} />
          <AppButton label={pending ? 'Saving…' : 'Save Expense'} size="sm" onPress={save} disabled={pending || locked || missing} textClassName="text-white" />
        </View>
      </View>
    </AppModal>
  );
}
