// BUDG-8 S13: Regular costs › Categories. Layout from briefs/redesign/06; repo calls and written fields as before.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { RegularCostsView } from '@/components/regular/RegularCostsView';
import { draftValues, type RegularDraft, type RegularGroup, type RegularItem } from '@/components/regular/types';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { addExpense, deleteExpense, type ExpenseItem, updateExpense, watchExpenses } from '@/lib/repo/expenses';
import { addPlanItem, type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { addRecurring } from '@/lib/repo/recurring';
import { periodIdFromDate, periodTitleFromId, watchPeriods } from '@/lib/repo/periods';

export default function ExpensesScreen() {
  const uid = useWorkspaceUid();
  const [rows, setRows] = useState<ExpenseItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!uid) return;
    const unExpenses = watchExpenses(uid, (next) => {
      setRows(next);
      setLoaded(true);
    });
    const unPeriods = watchPeriods(uid, (next) => {
      if (!next.some((row) => row.id === selectedPid) && next[0]?.id) setSelectedPid(next[0].id);
    });
    return () => {
      unExpenses();
      unPeriods();
    };
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, items) => setPlanItems(items));
  }, [uid, selectedPid]);

  const items: RegularItem[] = useMemo(
    () =>
      rows
        .filter((row): row is ExpenseItem & { id: string } => Boolean(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name || '',
          amount: Number(row.amount || 0),
          group: (row.group || 'NEED') as RegularGroup,
          active: row.active !== false,
          tags: row.tags || [],
          defaultAccountId: row.defaultAccountId,
        })),
    [rows]
  );

  async function save(id: string | null, draft: RegularDraft): Promise<string | null> {
    if (!uid) return 'Not signed in.';
    const { name, amount, tags } = draftValues(draft);
    if (!name) return 'Expense name is required.';
    if (amount <= 0) return 'Amount must be greater than 0.';
    const group = draft.group as ExpenseItem['group'];
    if (!id) {
      await addExpense(uid, { name, amount, group, tags, note: '', active: draft.active });
      return null;
    }
    const source = rows.find((row) => row.id === id);
    await updateExpense(uid, id, { name, amount, group, tags, note: String(source?.note || '').trim(), active: draft.active });
    return null;
  }

  async function addToBudget(row: RegularItem) {
    if (!uid) return;
    const targetPid = selectedPid || periodIdFromDate();
    const maxPriority = planItems.reduce((max, item) => Math.max(max, Number((item as any).priority) || 0), 0);
    try {
      await addPlanItem(uid, targetPid, {
        name: row.name,
        amount: row.amount,
        group: row.group as any,
        tags: row.tags ?? [],
        priority: maxPriority + 1,
      } as any);
      // Automatically deactivate from expenses (unchanged behaviour).
      await updateExpense(uid, row.id, { active: false });
      const msg = `${row.name} added to ${periodTitleFromId(targetPid)} and paused here.`;
      setNotice(msg);
      Alert.alert('Added to budget', msg);
    } catch (e: unknown) {
      setNotice(`Could not add to the month: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function makeRepeat(row: RegularItem) {
    if (!uid) return;
    const source = rows.find((r) => r.id === row.id);
    await addRecurring(uid, {
      flow: 'EXPENSE',
      name: row.name,
      amount: row.amount,
      group: row.group as any,
      tags: row.tags ?? [],
      dayOfMonth: 1,
      active: row.active !== false,
      note: source?.note,
    });
    const msg = `${row.name} is now also a repeat.`;
    setNotice(msg);
    Alert.alert('Recurring template created', msg);
  }

  return (
    <RegularCostsView
      kind="categories"
      uid={uid}
      items={items}
      loaded={loaded}
      notice={notice}
      onSave={save}
      onDelete={async (id) => {
        if (uid) await deleteExpense(uid, id);
      }}
      extras={(item) =>
        item ? (
          <View className="flex-row flex-wrap gap-2">
            <AppButton label={`Add to ${periodTitleFromId(selectedPid)}`} variant="outline" size="touch" onPress={() => addToBudget(item)} />
            <AppButton label="Make it a repeat" variant="outline" size="touch" onPress={() => makeRepeat(item)} />
          </View>
        ) : null
      }
    />
  );
}
