// BUDG-2 Year view inside Plan: annual outline, upcoming dated items and the items of the
// year by due month. Reads only; writes happen in YearItemForm (year items, outline) and in a
// month's draft (From your year plan). Existing components and classes only.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { DropdownField } from '@/components/ui/DropdownField';
import { YearItemForm } from '@/components/plan/YearItemForm';
import { useSheet } from '@/components/patterns/AppSheet';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import { watchExpenses, type ExpenseItem } from '@/lib/repo/expenses';
import type { PeriodDoc } from '@/lib/repo/periods';
import { saveOutline, watchYearItems, watchYearLines, watchYearOutline, type YearItemRow } from '@/lib/repo/yearPlan';
import { fmtMoney } from '@/lib/format';
import { fromMinor } from '@/lib/money';
import { monthTitle } from '@/lib/rules/months';
import { budgetInOf, hasEstimate, itemsByDueMonth, statusOf, upcoming, yearTotals, type LinkedLine } from '@/lib/rules/yearPlan';

const UPCOMING_DAYS = 60;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dueLabel(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1] ?? m} ${y}`;
}

type Props = { uid: string; periods: (PeriodDoc & { id: string })[] };

export function YearPlanView({ uid, periods }: Props) {
  const router = useRouter();
  const today = localIso(new Date());
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [items, setItems] = useState<YearItemRow[]>([]);
  const [lines, setLines] = useState<LinkedLine[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [outline, setOutline] = useState('');
  const [outlineDraft, setOutlineDraft] = useState<string | null>(null);
  const [outlineMsg, setOutlineMsg] = useState('');
  // Same sheet rules as every other plan sheet: Escape from anywhere, Back closes it, focus returns to the trigger.
  const form = useSheet();
  const [editing, setEditing] = useState<YearItemRow | null>(null);

  useEffect(() => watchYearItems(uid, setItems), [uid]);
  useEffect(() => watchAccounts(uid, setAccounts, { includeArchived: true }), [uid]);
  useEffect(() => watchExpenses(uid, setExpenses), [uid]);
  useEffect(() => {
    setOutlineDraft(null);
    return watchYearOutline(uid, year, setOutline);
  }, [uid, year]);
  const linkKey = items.map((i) => `${i.id}:${(i.linkedPeriodIds ?? []).join(',')}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => watchYearLines(uid, items, setLines), [uid, linkKey]);

  const periodById = useMemo(() => Object.fromEntries(periods.map((p) => [p.id, p])), [periods]);
  const yearItems = useMemo(() => items.filter((i) => String(i.dueDate).startsWith(`${year}-`)), [items, year]);
  const byMonth = useMemo(() => itemsByDueMonth(yearItems, year), [yearItems, year]);
  const soon = useMemo(() => upcoming(items, today, UPCOMING_DAYS), [items, today]);
  const totals = useMemo(() => yearTotals(yearItems, lines), [yearItems, lines]);
  const freeMonths = Object.entries(byMonth).filter(([, rows]) => !rows.length).map(([pid]) => MONTHS_SHORT[Number(pid.slice(5)) - 1]);

  const [closedMonths, setClosedMonths] = useState<Record<string, boolean>>({});

  function openForm(item: YearItemRow | null, e?: unknown) {
    setEditing(item);
    form.show(e);
  }

  function whereBudgeted(item: YearItemRow) {
    if (!hasEstimate(item)) return { label: 'Date only', variant: 'outline' as const, pid: '' };
    const pid = budgetInOf(item);
    if ((item.linkedPeriodIds ?? []).includes(pid)) return { label: `In ${monthTitle(pid)} budget`, variant: 'success' as const, pid };
    return { label: `Budget in ${monthTitle(pid)}`, variant: 'warning' as const, pid };
  }

  function renderItem(item: YearItemRow, showOpen?: boolean) {
    const where = whereBudgeted(item);
    const period = where.pid ? periodById[where.pid] : undefined;
    const canAdd = showOpen && where.variant === 'warning' && period && (period.status ?? 'DRAFT') === 'DRAFT';
    const state = statusOf(item);
    return (
      <View key={item.id} className="gap-1 border-t border-border px-4 py-3 dark:border-zinc-800" testID={`year-item-${item.id}`}>
        <Pressable onPress={(e) => openForm(item, e)} accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} className="min-h-11 justify-center">
          <View className="flex-row items-center gap-3">
            <Text className="min-w-0 flex-1 text-base font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{item.title}</Text>
            <Text className="shrink-0 text-base font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
              {hasEstimate(item) ? fmtMoney(fromMinor(item.estimateMinor!)) : '—'}
            </Text>
          </View>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`Due ${dueLabel(item.dueDate)}${state !== 'ACTIVE' ? ` · ${state.toLowerCase()}` : ''}`}</Text>
        </Pressable>
        <View className="flex-row flex-wrap items-center gap-2">
          <AppBadge label={where.label} variant={where.variant} />
          {canAdd ? (
            <AppButton label={`Open ${monthTitle(where.pid)}`} variant="ghost" size="touch" onPress={() => router.push(`/budgets/${where.pid}`)} />
          ) : null}
        </View>
      </View>
    );
  }

  const outlineValue = outlineDraft ?? outline;
  async function saveOutlineText() {
    setOutlineMsg('');
    try {
      await saveOutline(uid, year, outlineValue);
      setOutlineDraft(null);
      setOutlineMsg('Saved');
    } catch (e: unknown) {
      setOutlineMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const yearOptions = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => ({ label: String(y), value: String(y) }));

  return (
    <View className="gap-4" testID="year-plan-view">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="z-20 w-32">
          <DropdownField value={String(year)} options={yearOptions} onChange={(v) => setYear(Number(v))} menuStrategy="inline" triggerClassName="h-11" />
        </View>
        <AppButton label="Add dated item" size="touch" onPress={(e) => openForm(null, e)} />
      </View>

      <View className="gap-2">
        <Text className="px-1 text-base font-semibold text-foreground dark:text-zinc-50">{`Upcoming · next ${UPCOMING_DAYS} days`}</Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          {soon.length ? soon.map((item) => renderItem(item, true)) : (
            <Text className="px-4 py-4 text-base text-muted-foreground dark:text-zinc-400">Nothing due in the next {UPCOMING_DAYS} days.</Text>
          )}
        </View>
      </View>

      <View className="gap-2" testID="year-months">
        <Text className="px-1 text-base font-semibold text-foreground dark:text-zinc-50">{`${year} by month`}</Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          {Object.entries(byMonth)
            .filter(([, rows]) => rows.length)
            .map(([pid, rows], i) => {
              const isClosed = closedMonths[pid] === true;
              const sum = rows.reduce((acc, r) => acc + (hasEstimate(r) ? fromMinor(r.estimateMinor!) : 0), 0);
              return (
                <View key={pid} className={i > 0 ? 'border-t border-border dark:border-zinc-800' : undefined}>
                  <Pressable
                    accessibilityRole="button"
                    aria-expanded={!isClosed}
                    onPress={() => setClosedMonths((prev) => ({ ...prev, [pid]: !isClosed }))}
                    className="min-h-12 flex-row items-center gap-3 px-4"
                  >
                    <Text className="min-w-0 flex-1 text-base font-semibold text-foreground dark:text-zinc-50" numberOfLines={1}>{monthTitle(pid)}</Text>
                    <Text className="shrink-0 text-sm text-muted-foreground dark:text-zinc-400">{`${rows.length} ${rows.length === 1 ? 'item' : 'items'} · ${fmtMoney(sum)}`}</Text>
                    <MaterialCommunityIcons name={isClosed ? 'chevron-down' : 'chevron-up'} size={20} color="#717182" />
                  </Pressable>
                  {isClosed ? null : rows.map((item) => renderItem(item))}
                </View>
              );
            })}
          {freeMonths.length === 12 ? (
            <Text className="px-4 py-4 text-base text-muted-foreground dark:text-zinc-400">Add dates you must not forget, like renewals.</Text>
          ) : null}
        </View>
      </View>
      <AppCard className="gap-2">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{`Outline ${year}`}</Text>
        <AppInput
          value={outlineValue}
          onChangeText={(v) => {
            setOutlineDraft(v);
            setOutlineMsg('');
          }}
          multiline
          placeholder="Goals and big moments for this year"
          accessibilityLabel={`Outline ${year}`}
          className="min-h-20 py-2 text-base"
        />
        <View className="flex-row items-center justify-end gap-2">
          {outlineMsg ? <Text className="text-xs text-muted-foreground">{outlineMsg}</Text> : null}
          <AppButton label="Save outline" variant="outline" size="touch" onPress={saveOutlineText} disabled={outlineDraft === null} />
        </View>
        <View className="mt-1 gap-1 border-t border-border pt-2 dark:border-zinc-800" testID="year-totals">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-muted-foreground">Planned for the year</Text>
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{fmtMoney(fromMinor(totals.totalMinor))}</Text>
          </View>
          <Text className="text-xs text-muted-foreground">
            {`${fmtMoney(fromMinor(totals.inBudgetsMinor))} already in monthly budgets · ${fmtMoney(fromMinor(totals.estimatesMinor))} estimates not yet budgeted`}
          </Text>
        </View>
      </AppCard>

      {freeMonths.length ? (
        <Text className="text-xs text-muted-foreground">{freeMonths.length === 12 ? `No dated items in ${year} yet.` : `Nothing planned in ${freeMonths.join(', ')}.`}</Text>
      ) : null}

      <YearItemForm
        uid={uid}
        open={form.open}
        onClose={() => form.hide()}
        item={editing ? items.find((i) => i.id === editing.id) ?? editing : null}
        defaultDueDate={year === thisYear ? today : `${year}-01-01`}
        accounts={accounts}
        expenses={expenses}
      />
    </View>
  );
}
