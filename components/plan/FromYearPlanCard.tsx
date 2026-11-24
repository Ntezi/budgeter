// BUDG-2 "From your year plan" in a DRAFT month: one "Add to this month" per matching item,
// Review (prefilled amount, group, account: no retyping) and Skip. Ids are deterministic
// (year_{itemId}), so a double tap, retry or reopening never adds a second line (AC-4).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { DropdownField } from '@/components/ui/DropdownField';
import type { Account } from '@/lib/repo/accounts';
import type { ExpenseItem } from '@/lib/repo/expenses';
import type { PlanItem } from '@/lib/repo/plans';
import { APP_CURRENCY } from '@/lib/repo/planLines';
import {
  includeYearItemInMonth,
  skipYearItemInMonth,
  unskipYearItemInMonth,
  watchYearDecisions,
  watchYearItems,
  type YearItemRow,
} from '@/lib/repo/yearPlan';
import { fmtMoney } from '@/lib/format';
import { planGroupLabel, PLAN_GROUP_OPTIONS } from '@/lib/groups';
import { fromMinor, minorToInput, parseMinorInput } from '@/lib/money';
import { accountIneligibility, suggestionForSource } from '@/lib/rules/defaultAccount';
import { offersForDraft, type DecisionLike } from '@/lib/rules/yearPlan';

type Props = {
  uid: string;
  pid: string;
  periodExists: boolean;
  status: string;
  planItems: PlanItem[];
  accounts: Account[];
  expenses: ExpenseItem[];
  nextPriority: number;
};

type Review = { amount: string; group: string; accountId: string };

export function FromYearPlanCard({ uid, pid, periodExists, status, planItems, accounts, expenses, nextPriority }: Props) {
  const [items, setItems] = useState<YearItemRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionLike[]>([]);
  const [review, setReview] = useState<Record<string, Review>>({});
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const busyRef = useRef(new Set<string>());

  useEffect(() => watchYearItems(uid, setItems), [uid]);
  useEffect(() => watchYearDecisions(uid, pid, setDecisions), [uid, pid]);

  const offers = useMemo(
    () => offersForDraft(pid, periodExists ? { status } : null, items, planItems, decisions) as YearItemRow[],
    [pid, periodExists, status, items, planItems, decisions]
  );
  const skipped = useMemo(
    () => items.filter((i) => decisions.some((d) => d.id === i.id && d.decision === 'SKIPPED') && !planItems.some((l) => l.id === `year_${i.id}`)),
    [items, decisions, planItems]
  );

  function suggestedFor(item: YearItemRow) {
    if (item.fundingAccountId && !accountIneligibility(item.fundingAccountId, accounts, APP_CURRENCY)) return item.fundingAccountId;
    const category = expenses.find((e) => e.id === item.sourceExpenseItemId);
    return suggestionForSource(category, accounts, APP_CURRENCY).accountId;
  }
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '';

  async function run(itemId: string, fn: () => Promise<unknown>) {
    if (busyRef.current.has(itemId)) return; // double tap: ignored here, and the id makes it harmless anyway
    busyRef.current.add(itemId);
    setBusyId(itemId);
    setError('');
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current.delete(itemId);
      setBusyId('');
    }
  }

  function add(item: YearItemRow) {
    const suggested = suggestedFor(item);
    const r = review[item.id];
    let amountMinor: number | undefined;
    if (r) {
      const parsed = parseMinorInput(r.amount);
      if (parsed.error || !parsed.minor) {
        setError(parsed.error ?? 'Plan amount must be greater than 0.');
        return;
      }
      amountMinor = parsed.minor;
    }
    return run(item.id, async () => {
      await includeYearItemInMonth(uid, pid, {
        itemId: item.id,
        accountId: r ? r.accountId : suggested,
        suggestedAccountId: suggested,
        amountMinor,
        group: r?.group || item.group || 'NEED',
        priority: nextPriority,
      });
      setReview(({ [item.id]: _done, ...rest }) => rest);
    });
  }

  function openReview(item: YearItemRow) {
    setReview((prev) => ({
      ...prev,
      [item.id]: { amount: minorToInput(item.estimateMinor), group: item.group ?? 'NEED', accountId: suggestedFor(item) },
    }));
  }

  if (!periodExists || status === 'DECIDED' || (!offers.length && !skipped.length)) return null;
  const accountOptions = [{ label: 'No account', value: '' }, ...accounts.filter((a) => a.id && !a.archived).map((a) => ({ label: a.name, value: a.id! }))];

  return (
    <AppCard className="gap-3 rounded-xl p-3 md:p-4" testID="from-year-plan">
      <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">From your year plan</Text>
      {offers.length ? (
        <Text className="text-xs text-muted-foreground">Budgeted in this month. Nothing is added until you choose.</Text>
      ) : null}
      {offers.map((item) => {
        const suggested = suggestedFor(item);
        const r = review[item.id];
        return (
          <View key={item.id} className="gap-2 border-b border-border py-3 last:border-b-0 dark:border-zinc-800" testID={`year-offer-${item.id}`}>
            <View className="flex-row items-center gap-3">
              <Text className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{item.title}</Text>
              <Text className="shrink-0 text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>{fmtMoney(fromMinor(item.estimateMinor!))}</Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              {`Due ${item.dueDate} · ${planGroupLabel((item.group ?? 'NEED') as any)}${suggested ? ` · ${accountName(suggested)}` : ''}`}
            </Text>
            {r ? (
              <View className="gap-2">
                <AppInput
                  value={r.amount}
                  onChangeText={(v) => setReview((prev) => ({ ...prev, [item.id]: { ...r, amount: v } }))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Amount for ${item.title}`}
                  className="h-11 lg:h-9 text-sm"
                />
                <View className="z-10">
                  <DropdownField
                    value={r.group}
                    options={PLAN_GROUP_OPTIONS as any}
                    onChange={(v) => setReview((prev) => ({ ...prev, [item.id]: { ...r, group: v } }))}
                    menuStrategy="inline"
                    triggerClassName="h-11 lg:h-9"
                  />
                </View>
                <DropdownField
                  value={r.accountId}
                  options={accountOptions}
                  onChange={(v) => setReview((prev) => ({ ...prev, [item.id]: { ...r, accountId: v } }))}
                  placeholder="No account"
                  menuStrategy="inline"
                  menuClassName="max-h-44"
                  triggerClassName="h-11 lg:h-9"
                />
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              <AppButton
                label={busyId === item.id ? 'Adding…' : 'Add to this month'}
                size="touch"
                onPress={() => add(item)}
                disabled={busyId === item.id}
                textClassName="text-white"
              />
              {r ? (
                <AppButton label="Cancel" variant="outline" size="touch" onPress={() => setReview(({ [item.id]: _c, ...rest }) => rest)} />
              ) : (
                <AppButton label="Review" variant="outline" size="touch" onPress={() => openReview(item)} />
              )}
              <AppButton label="Skip" variant="ghost" size="touch" onPress={() => run(item.id, () => skipYearItemInMonth(uid, pid, item.id))} disabled={busyId === item.id} />
            </View>
          </View>
        );
      })}
      {skipped.length ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-xs text-muted-foreground">{`Skipped: ${skipped.map((i) => i.title).join(', ')}`}</Text>
          {skipped.map((i) => (
            <AppButton key={i.id} label={`Bring back ${i.title}`} variant="ghost" size="touch" onPress={() => run(i.id, () => unskipYearItemInMonth(uid, pid, i.id))} />
          ))}
        </View>
      ) : null}
      {error ? <Text className="text-xs text-red-600 dark:text-red-300">{error}</Text> : null}
    </AppCard>
  );
}
