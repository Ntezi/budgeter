import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { PageHeader } from '@/components/patterns/PageHeader';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { YearPlanView } from '@/components/plan/YearPlanView';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { MonthPlanView } from '@/components/plan/MonthPlanView';
import { NewMonthSheet } from '@/components/plan/NewMonthSheet';
import { viewedMonthId } from '@/lib/shell/monthChip';
import { type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { createPeriodIfAbsent } from '@/lib/repo/periodCreate';
import { choiceActionLabel, defaultChoiceId, newBudgetChoices, type MonthChoice } from '@/lib/rules/months';

export default function BudgetsScreen() {
  const uid = useWorkspaceUid();
  const router = useRouter();
  // BUDG-2: Month | Year inside Plan; the view is kept in the URL so Back and reload keep it.
  const params = useLocalSearchParams<{ view?: string; month?: string; new?: string }>();
  const { activePeriodId } = useWorkspace();
  const viewedMonth = viewedMonthId(params.month, activePeriodId);
  const view: 'MONTH' | 'YEAR' = params.view === 'year' ? 'YEAR' : 'MONTH';
  const setView = (next: 'MONTH' | 'YEAR') => router.setParams({ view: next === 'YEAR' ? 'year' : undefined } as any);

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, (rows) => {
      setPeriods(rows);
      setPeriodsLoaded(true);
    });
  }, [uid]);

  // New month (was New Budget, BUDG-1 AC-2/AC-3): current local month by default, next month,
  // missing recent months; existing months open instead of being created again.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosenId, setChosenId] = useState('');
  const [pending, setPending] = useState(false);
  const [createError, setCreateError] = useState('');
  const pendingRef = useRef(false);
  // BUDG-8 03: the sheet lists this month first, then next month, then missing earlier months (same rows).
  const choices = useMemo(() => {
    const rank = { CURRENT: 0, NEXT: 1, PAST: 2 } as Record<string, number>;
    return [...newBudgetChoices(new Date(), periods)].sort((a, b) => (rank[a.relation] ?? 3) - (rank[b.relation] ?? 3));
  }, [periods]);
  const chosen: MonthChoice | undefined = choices.find((row) => row.id === chosenId);

  function openPicker() {
    setChosenId(defaultChoiceId(newBudgetChoices(new Date(), periods)));
    setCreateError('');
    setPickerOpen(true);
  }

  // BUDG-8 01: onboarding step 3 links to /budgets?new=1, which opens the New month sheet once the
  // months are known (so the default choice is right); the param is dropped so Back/reload do not reopen it.
  useEffect(() => {
    if (params.new !== '1' || !periodsLoaded) return;
    router.setParams({ new: undefined } as any);
    openPicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.new, periodsLoaded]);

  function choiceLabel(row: MonthChoice) {
    const when = row.relation === 'CURRENT' ? 'this month' : row.relation === 'NEXT' ? 'next month' : 'missing';
    const state = row.kind === 'OPEN_DRAFT' ? ', draft exists' : row.kind === 'OPEN_LOCKED' ? ', locked' : '';
    return `${row.title} · ${when}${state}`;
  }

  async function confirmChoice() {
    if (!uid || !chosen || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setCreateError('');
    try {
      if (chosen.kind === 'NEW') await createPeriodIfAbsent(uid, chosen.id, { title: chosen.title });
      setPickerOpen(false);
      router.push(`/budgets/${chosen.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <PageHeader
        title={view === 'YEAR' ? 'Year plan' : 'Plan'}
        right={
          view === 'MONTH' ? (
            <AppButton onPress={openPicker} accessibilityLabel="New month" testID="new-month-link" size="touch" variant="ghost">
              <View className="flex-row items-center gap-1">
                <MaterialCommunityIcons name="plus" size={18} color="#717182" />
                <Text className="text-sm font-medium text-foreground underline dark:text-zinc-50">New month</Text>
              </View>
            </AppButton>
          ) : undefined
        }
        switcher={
          <AppSegmented
            touch
            full
            value={view}
            onChange={setView}
            options={[
              { label: 'Month', value: 'MONTH' },
              { label: 'Year', value: 'YEAR' },
            ]}
          />
        }
      />

      {view === 'YEAR' && uid ? <YearPlanView uid={uid} periods={periods} /> : null}

      {/* BUDG-8 S5: Month shows the viewed month's plan inline; viewing never creates it. */}
      {view === 'MONTH' ? <MonthPlanView pid={viewedMonth} /> : null}

      <NewMonthSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        choices={choices.map((row) => ({ id: row.id, label: choiceLabel(row), kind: row.kind }))}
        chosenId={chosenId}
        onChoose={setChosenId}
        actionLine={chosen ? choiceActionLabel(chosen) : ''}
        buttonLabel={pending ? 'Working…' : chosen?.kind === 'NEW' ? `Create ${chosen.title}` : chosen ? `Open ${chosen.title}` : 'Choose a month'}
        onConfirm={confirmChoice}
        disabled={pending || !chosen}
        error={createError}
      />
    </ScrollView>
  );
}
