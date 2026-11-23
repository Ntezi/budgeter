// BUDG-8 S13: Regular costs › Repeats. Layout from briefs/redesign/06; repo calls and written fields as before.
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { RegularCostsView } from '@/components/regular/RegularCostsView';
import { draftValues, type RegularDraft, type RegularGroup, type RegularItem } from '@/components/regular/types';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  addRecurring,
  deleteRecurring,
  inspectBudgetSeedState,
  seedBudgetFromRecurring,
  type Recurring,
  updateRecurring,
  watchRecurring,
} from '@/lib/repo/recurring';
import { createPeriodIfAbsent } from '@/lib/repo/periodCreate';
import { nextMonthMeta, periodIdFromDate, periodTitleFromId } from '@/lib/repo/periods';
import { applyAllocationDefaultsForPeriod } from '@/lib/repo/allocations';

export default function RecurringScreen() {
  const router = useRouter();
  const uid = useWorkspaceUid();
  const [rows, setRows] = useState<Recurring[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const [isGeneratingCurrent, setIsGeneratingCurrent] = useState(false);
  const [isCreatingNextBudget, setIsCreatingNextBudget] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchRecurring(uid, (next) => {
      setRows(next);
      setLoaded(true);
    });
  }, [uid]);

  const items: RegularItem[] = useMemo(
    () =>
      rows
        .filter((row): row is Recurring & { id: string } => Boolean(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name || '',
          amount: Number(row.amount || 0),
          group: ((row.flow ?? 'EXPENSE') === 'INCOME' ? 'INCOME' : row.group ?? 'NEED') as RegularGroup,
          active: row.active !== false,
          tags: row.tags || [],
          defaultAccountId: row.defaultAccountId,
        })),
    [rows]
  );

  async function save(id: string | null, draft: RegularDraft): Promise<string | null> {
    if (!uid) return 'Not signed in.';
    const { name, amount, tags } = draftValues(draft);
    const flow = draft.group === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const group = flow === 'INCOME' ? undefined : (draft.group as Recurring['group']);
    if (!name) return 'Template name is required.';
    if (!id) {
      if (amount <= 0) return 'Amount must be greater than 0.';
      await addRecurring(uid, { flow, name, amount, tags, group, dayOfMonth: 1, active: draft.active, note: undefined });
      return null;
    }
    const source = rows.find((row) => row.id === id);
    await updateRecurring(uid, id, {
      flow,
      name,
      amount,
      tags,
      group,
      dayOfMonth: source?.dayOfMonth ?? 1,
      active: draft.active,
      note: source?.note?.trim() || undefined,
    });
    return null;
  }

  async function generateCurrentPeriod() {
    if (!uid || isGeneratingCurrent || isCreatingNextBudget) return;
    setIsGeneratingCurrent(true);
    try {
      const pid = periodIdFromDate();
      await createPeriodIfAbsent(uid, pid, { title: periodTitleFromId(pid) });

      const state = await inspectBudgetSeedState(uid, pid);
      let overwriteRecurring = false;
      if (state.existingPlanRows > 0 || state.existingIncomeRows > 0) {
        const message =
          `${periodTitleFromId(pid)} already has lines.\n` +
          `Plan lines: ${state.existingPlanRows}\n` +
          `Income lines: ${state.existingIncomeRows}\n\n` +
          'Replacing removes only lines that came from repeats before. Lines you added yourself stay.';

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          overwriteRecurring = window.confirm(`${message}\n\nOK replaces lines from repeats. Cancel keeps them and adds what is missing.`);
        } else {
          const choice = await new Promise<'cancel' | 'keep' | 'overwrite'>((resolve) => {
            Alert.alert(
              'This month has lines',
              message,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
                { text: 'Keep existing', onPress: () => resolve('keep') },
                { text: 'Replace lines from repeats', style: 'destructive', onPress: () => resolve('overwrite') },
              ],
              { cancelable: true, onDismiss: () => resolve('cancel') }
            );
          });
          if (choice === 'cancel') return;
          overwriteRecurring = choice === 'overwrite';
        }
      }

      const out = await seedBudgetFromRecurring(uid, pid, rows, { overwriteRecurring });
      setNotice(`${periodTitleFromId(pid)}: ${out.planWritten} plan lines and ${out.incomeWritten} income lines from repeats.`);
      router.push(`/budgets/${pid}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setNotice(`Could not add repeats to this month: ${message || 'an unexpected error occurred.'}`);
    } finally {
      setIsGeneratingCurrent(false);
    }
  }

  async function createNextBudgetFromRecurring() {
    if (!uid || isGeneratingCurrent || isCreatingNextBudget) return;
    setIsCreatingNextBudget(true);
    try {
      const next = nextMonthMeta();
      await createPeriodIfAbsent(uid, next.id, { title: next.title });
      const seeded = await seedBudgetFromRecurring(uid, next.id, rows);
      const defaults = await applyAllocationDefaultsForPeriod(uid, next.id);
      setNotice(`${next.title}: ${seeded.planWritten} plan lines, ${seeded.incomeWritten} income lines, ${defaults} accounts suggested.`);
      router.push(`/budgets/${next.id}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setNotice(`Could not start next month: ${message || 'an unexpected error occurred.'}`);
    } finally {
      setIsCreatingNextBudget(false);
    }
  }

  const busy = isGeneratingCurrent || isCreatingNextBudget;
  const next = nextMonthMeta();
  const footer = (
    <View testID="repeats-use" className="gap-3 rounded-xl border border-border bg-card p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Text role="heading" aria-level={2} className="text-base font-semibold text-foreground dark:text-zinc-50">Use repeats in a month</Text>
      <Text className="text-sm text-muted-foreground dark:text-zinc-400">Active repeats become plan and income lines. Paused ones are skipped.</Text>
      <View className="flex-row flex-wrap gap-2">
        <AppButton label={isCreatingNextBudget ? 'Starting…' : `Start ${next.title}`} size="touch" disabled={busy} onPress={createNextBudgetFromRecurring} />
        <AppButton
          label={isGeneratingCurrent ? 'Adding…' : `Add to ${periodTitleFromId(periodIdFromDate())}`}
          variant="outline"
          size="touch"
          disabled={busy}
          onPress={generateCurrentPeriod}
        />
        <AppButton label="Import from a file" variant="ghost" size="touch" onPress={() => router.push('/settings?page=import&kind=regular')} />
      </View>
    </View>
  );

  return (
    <>
      <RegularCostsView
        kind="repeats"
        uid={uid}
        items={items}
        loaded={loaded}
        notice={notice}
        onSave={save}
        onDelete={async (id) => {
          if (uid) await deleteRecurring(uid, id);
        }}
        footer={footer}
      />
    </>
  );
}
