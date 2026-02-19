import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { useAuthUser } from '@/providers/AuthProvider';
import {
  deletePeriod,
  getOrCreatePeriod,
  setPeriodStatus,
  setPeriodTitle,
  setTargetPct,
  type PeriodDoc,
  type PeriodStatus,
  watchPeriod,
} from '@/lib/repo/periods';
import { addIncomeItem, deleteIncomeItem, type IncomeItem, updateIncomeItem, watchIncomeItems } from '@/lib/repo/income';
import { addPlanItem, deletePlanItem, type PlanGroup, type PlanItem, updatePlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import {
  deleteAllocation,
  type Allocation,
  upsertAllocationForBudgetItem,
  watchAllocations,
} from '@/lib/repo/allocations';
import { fmtMoney, parseMoney, parsePct100 } from '@/lib/format';
import { planGroupLabel, PLAN_GROUP_OPTIONS, planGroupToTag } from '@/lib/groups';

const SECTION_OPTIONS = [
  { label: 'Income', value: 'INCOME' },
  { label: 'Spending Plan', value: 'PLAN' },
  { label: 'Reconcile', value: 'RECONCILE' },
] as const;

type SectionKey = (typeof SECTION_OPTIONS)[number]['value'];

type PlanWithId = PlanItem & { id: string; priority: number };

export default function BudgetDetailScreen() {
  const { pid } = useLocalSearchParams<{ pid: string }>();
  const router = useRouter();
  const uid = useAuthUser()?.uid;

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<PeriodStatus>('DRAFT');
  const [pNeeds, setPNeeds] = useState('50');
  const [pWants, setPWants] = useState('30');
  const [pSd, setPSd] = useState('20');

  const [section, setSection] = useState<SectionKey>('PLAN');

  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [incomeDraft, setIncomeDraft] = useState<IncomeItem>({ name: '', amount: 0 });
  const [incomeTotal, setIncomeTotal] = useState(0);

  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [planTotals, setPlanTotals] = useState({ needs: 0, wants: 0, sd: 0 });
  const [planDraft, setPlanDraft] = useState<PlanItem>({ name: '', amount: 0, group: 'NEED' });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);

  const readOnly = status === 'DECIDED';

  useEffect(() => {
    if (!uid || !pid) return;

    getOrCreatePeriod(uid, pid);

    const unPeriod = watchPeriod(uid, pid, (period: PeriodDoc) => {
      setTitle(period.title ?? pid);
      setStatus((period.status as PeriodStatus) ?? 'DRAFT');
      setPNeeds(String(Math.round((period.targetPct?.needs ?? 0.5) * 100)));
      setPWants(String(Math.round((period.targetPct?.wants ?? 0.3) * 100)));
      setPSd(String(Math.round((period.targetPct?.sd ?? 0.2) * 100)));
    });

    const unIncome = watchIncomeItems(uid, pid, (rows, total) => {
      setIncomeItems(rows);
      setIncomeTotal(total);
    });

    const unPlan = watchPlanTotals(uid, pid, (totals, rows) => {
      setPlanTotals(totals);
      setPlanItems(rows);
    });

    const unAlloc = watchAllocations(uid, pid, (rows) => setAllocations(rows));
    const unAccounts = watchAccounts(uid, setAccounts, { includeArchived: true });

    return () => {
      unPeriod();
      unIncome();
      unPlan();
      unAlloc();
      unAccounts();
    };
  }, [uid, pid]);

  const pct = useMemo(
    () => ({
      needs: parsePct100(pNeeds),
      wants: parsePct100(pWants),
      sd: parsePct100(pSd),
    }),
    [pNeeds, pWants, pSd]
  );

  const autoTargets = useMemo(
    () => ({
      needs: incomeTotal * pct.needs,
      wants: incomeTotal * pct.wants,
      sd: incomeTotal * pct.sd,
    }),
    [incomeTotal, pct]
  );

  const realPlanTotal = planTotals.needs + planTotals.wants + planTotals.sd;
  const realPlanPct = useMemo(
    () => ({
      needs: realPlanTotal > 0 ? (planTotals.needs / realPlanTotal) * 100 : 0,
      wants: realPlanTotal > 0 ? (planTotals.wants / realPlanTotal) * 100 : 0,
      sd: realPlanTotal > 0 ? (planTotals.sd / realPlanTotal) * 100 : 0,
    }),
    [planTotals, realPlanTotal]
  );

  const allocationByItemId = useMemo(() => {
    const map: Record<string, Allocation & { id: string }> = {};
    allocations.forEach((row) => {
      if (row.sourceType !== 'PLAN' || !row.sourceItemId || !row.id) return;
      map[row.sourceItemId] = row as Allocation & { id: string };
    });
    return map;
  }, [allocations]);

  const planWithPriority = useMemo<PlanWithId[]>(() => {
    const withId = planItems.filter((row): row is PlanItem & { id: string } => Boolean(row.id));
    return [...withId]
      .map((row, index) => ({ ...row, priority: Number((row as any).priority) || index + 1 }))
      .sort((a, b) => a.priority - b.priority);
  }, [planItems]);

  const reconcileRows = useMemo(() => {
    let remaining = incomeTotal;
    return planWithPriority.map((item) => {
      const funded = Math.min(item.amount || 0, Math.max(remaining, 0));
      remaining = Math.max(0, remaining - (item.amount || 0));
      return {
        ...item,
        funded,
        unfunded: Math.max(0, (item.amount || 0) - funded),
      };
    });
  }, [incomeTotal, planWithPriority]);

  const remainingIncome = useMemo(
    () => Math.max(0, incomeTotal - reconcileRows.reduce((sum, row) => sum + row.funded, 0)),
    [incomeTotal, reconcileRows]
  );

  const totalUnfunded = useMemo(() => reconcileRows.reduce((sum, row) => sum + row.unfunded, 0), [reconcileRows]);

  async function saveTitle() {
    if (!uid || !pid || readOnly) return;
    await setPeriodTitle(uid, pid, title.trim());
  }

  async function saveTargets() {
    if (!uid || !pid || readOnly) return;
    await setTargetPct(uid, pid, pct);
  }

  async function toggleFinalize() {
    if (!uid || !pid) return;
    const nextStatus: PeriodStatus = readOnly ? 'DRAFT' : 'DECIDED';
    await setPeriodStatus(uid, pid, nextStatus);
  }

  async function removeBudget() {
    if (!uid || !pid) return;

    const performDelete = async () => {
      await deletePeriod(uid, pid);
      router.replace('/budgets');
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm('Delete this budget and all nested records? This cannot be undone.');
      if (!ok) return;
      await performDelete();
      return;
    }

    Alert.alert('Delete Budget', 'Delete this budget and all nested records? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void performDelete() },
    ]);
  }

  async function addIncomeRow() {
    if (!uid || !pid || readOnly) return;
    if (!incomeDraft.name.trim() || incomeDraft.amount <= 0) return;
    await addIncomeItem(uid, pid, { name: incomeDraft.name.trim(), amount: incomeDraft.amount });
    setIncomeDraft({ name: '', amount: 0 });
  }

  async function saveIncomeRow(item: IncomeItem) {
    if (!uid || !pid || readOnly || !item.id) return;
    await updateIncomeItem(uid, pid, item.id, {
      name: item.name.trim(),
      amount: item.amount,
    });
  }

  async function deleteIncomeRow(id?: string) {
    if (!uid || !pid || readOnly || !id) return;
    await deleteIncomeItem(uid, pid, id);
  }

  async function addPlanRow() {
    if (!uid || !pid || readOnly) return;
    if (!planDraft.name.trim() || planDraft.amount <= 0) return;

    const nextPriority = planWithPriority.reduce((max, row) => Math.max(max, row.priority), 0) + 1;

    await addPlanItem(uid, pid, {
      name: planDraft.name.trim(),
      amount: planDraft.amount,
      group: planDraft.group,
      priority: nextPriority as any,
    } as any);

    setPlanDraft({ name: '', amount: 0, group: planDraft.group });
  }

  async function savePlanRow(item: PlanWithId) {
    if (!uid || !pid || readOnly || !item.id) return;
    await updatePlanItem(uid, pid, item.id, {
      name: item.name.trim(),
      amount: item.amount,
      group: item.group,
      priority: item.priority as any,
    } as any);
  }

  async function deletePlanRow(id?: string) {
    if (!uid || !pid || readOnly || !id) return;
    await deletePlanItem(uid, pid, id);
    const existingAllocation = allocationByItemId[id];
    if (existingAllocation?.id) await deleteAllocation(uid, pid, existingAllocation.id);
  }

  async function applyAutoRule() {
    if (!uid || !pid || readOnly) return;

    const recommended: Omit<PlanWithId, 'id'>[] = [
      {
        name: 'General Needs',
        amount: Number((incomeTotal * 0.5).toFixed(2)),
        group: 'NEED',
        priority: 1,
      },
      {
        name: 'General Wants',
        amount: Number((incomeTotal * 0.3).toFixed(2)),
        group: 'WANT',
        priority: 2,
      },
      {
        name: 'Savings Goal',
        amount: Number((incomeTotal * 0.2).toFixed(2)),
        group: 'SAVINGS_DEBT',
        priority: 3,
      },
    ];

    for (const row of planWithPriority) {
      await deletePlanItem(uid, pid, row.id);
    }

    for (const row of recommended) {
      await addPlanItem(uid, pid, row as any);
    }
  }

  async function reorderPriority(itemId: string, direction: -1 | 1) {
    if (!uid || !pid || readOnly) return;
    const index = planWithPriority.findIndex((row) => row.id === itemId);
    if (index < 0) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= planWithPriority.length) return;

    const next = [...planWithPriority];
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;

    for (let i = 0; i < next.length; i += 1) {
      const row = next[i];
      const newPriority = i + 1;
      if (row.priority !== newPriority) {
        await updatePlanItem(uid, pid, row.id, { priority: newPriority as any } as any);
      }
    }
  }

  async function assignAccount(item: PlanWithId, accountId: string) {
    if (!uid || !pid) return;
    const existing = allocationByItemId[item.id];

    if (!accountId) {
      if (existing?.id) await deleteAllocation(uid, pid, existing.id);
      return;
    }

    await upsertAllocationForBudgetItem(uid, pid, {
      sourceType: 'PLAN',
      sourceItemId: item.id,
      sourceItemName: item.name,
      accountId,
      amount: item.amount,
      tag: planGroupToTag(item.group),
      note: existing?.note ?? '',
    });
  }

  const accountOptions = useMemo(
    () => [
      { label: 'Unassigned', value: '' },
      ...accounts
        .filter((row): row is Account & { id: string } => Boolean(row.id))
        .map((row) => ({
          label: row.archived ? `${row.name} (archived)` : row.name,
          value: row.id,
        })),
    ],
    [accounts]
  );

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-bold text-foreground dark:text-slate-100">{title || pid}</Text>
          <AppBadge label={status} variant={readOnly ? 'secondary' : 'success'} />
        </View>
        <Text className="text-sm text-muted-foreground">
          {readOnly
            ? 'DECIDED locks Income and Plan editing. Transactions and Allocations remain editable.'
            : 'DRAFT mode allows editing all planning sections.'}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <AppButton label={readOnly ? 'Reopen Draft' : 'Finalize'} onPress={toggleFinalize} variant={readOnly ? 'secondary' : 'primary'} />
        <AppButton label="Delete" onPress={removeBudget} variant="destructive" />
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Income</Text>
          <Text className="mt-1 text-xl font-bold text-foreground dark:text-slate-100">{fmtMoney(incomeTotal)}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Planned</Text>
          <Text className="mt-1 text-xl font-bold text-foreground dark:text-slate-100">
            {fmtMoney(planTotals.needs + planTotals.wants + planTotals.sd)}
          </Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Unallocated</Text>
          <Text
            className={`mt-1 text-xl font-bold ${(incomeTotal - (planTotals.needs + planTotals.wants + planTotals.sd)) >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}
          >
            {fmtMoney(incomeTotal - (planTotals.needs + planTotals.wants + planTotals.sd))}
          </Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Budget Meta</Text>
        <View className="gap-2">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Title</Text>
          <AppInput value={title} onChangeText={setTitle} editable={!readOnly} />
        </View>
        <View className="flex-row flex-wrap gap-2">
          <View className="min-w-[96px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Needs %</Text>
            <AppInput value={pNeeds} onChangeText={setPNeeds} editable={!readOnly} keyboardType="decimal-pad" />
          </View>
          <View className="min-w-[96px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Wants %</Text>
            <AppInput value={pWants} onChangeText={setPWants} editable={!readOnly} keyboardType="decimal-pad" />
          </View>
          <View className="min-w-[96px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Savings %</Text>
            <AppInput value={pSd} onChangeText={setPSd} editable={!readOnly} keyboardType="decimal-pad" />
          </View>
        </View>
        <Text className="text-xs text-muted-foreground">
          Auto targets: Needs {fmtMoney(autoTargets.needs)} · Wants {fmtMoney(autoTargets.wants)} · Savings {fmtMoney(autoTargets.sd)}
        </Text>
        {!readOnly ? (
          <View className="flex-row gap-2">
            <AppButton label="Save Title" onPress={saveTitle} variant="outline" />
            <AppButton label="Save Targets" onPress={saveTargets} variant="outline" />
          </View>
        ) : null}
      </AppCard>

      <AppCard className="gap-3">
        <AppSegmented value={section} onChange={setSection} options={SECTION_OPTIONS as any} />

        {section === 'INCOME' ? (
          <View className="gap-3">
            {incomeItems.map((row) => (
              <View key={row.id} className="rounded-lg border border-border p-3 dark:border-slate-700">
                <View className="gap-2">
                  <AppInput value={row.name} onChangeText={(value) => setIncomeItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, name: value } : it)))} editable={!readOnly} placeholder="Income source" />
                  <AppInput
                    value={String(row.amount || '')}
                    onChangeText={(value) =>
                      setIncomeItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, amount: parseMoney(value) } : it)))
                    }
                    editable={!readOnly}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                </View>
                {!readOnly ? (
                  <View className="mt-2 flex-row gap-2">
                    <IconActionButton icon="content-save-outline" label="Save income row" onPress={() => saveIncomeRow(row)} />
                    <IconActionButton icon="trash-can-outline" label="Delete income row" variant="danger" onPress={() => deleteIncomeRow(row.id)} />
                  </View>
                ) : null}
              </View>
            ))}

            {!readOnly ? (
              <View className="rounded-lg border border-dashed border-border p-3 dark:border-slate-700">
                <Text className="mb-2 text-sm font-semibold text-foreground dark:text-slate-100">Add Income Source</Text>
                <View className="gap-2">
                  <AppInput value={incomeDraft.name} onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, name: value }))} placeholder="Name" />
                  <AppInput
                    value={String(incomeDraft.amount || '')}
                    onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                    placeholder="Amount"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View className="mt-2">
                  <AppButton onPress={addIncomeRow} size="sm">
                    <View className="flex-row items-center gap-1.5">
                      <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                      <Text className="text-xs font-semibold text-primary-foreground dark:text-slate-900">Add Income</Text>
                    </View>
                  </AppButton>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {section === 'PLAN' ? (
          <View className="gap-4">
            <View className="rounded-lg border border-border bg-muted/50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Manual Real Percent (from current plan)</Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                Needs {Math.round(realPlanPct.needs)}% · Wants {Math.round(realPlanPct.wants)}% · Savings {Math.round(realPlanPct.sd)}%
              </Text>
            </View>

            {!readOnly ? (
              <AppButton label="Auto-fill 50/30/20" onPress={applyAutoRule} variant="outline" />
            ) : null}

            {PLAN_GROUP_OPTIONS.map((group) => {
              const rows = planWithPriority.filter((item) => item.group === group.value);
              const subtotal = rows.reduce((sum, row) => sum + (row.amount || 0), 0);
              return (
                <View key={group.value} className="gap-2">
                  <Text className="text-sm font-semibold text-foreground dark:text-slate-100">
                    {group.label} · {fmtMoney(subtotal)}
                  </Text>
                  {rows.map((row) => (
                    <View key={row.id} className="rounded-lg border border-border p-3 dark:border-slate-700">
                      <View className="gap-2">
                        <AppInput
                          value={row.name}
                          onChangeText={(value) =>
                            setPlanItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, name: value } : it)))
                          }
                          editable={!readOnly}
                          placeholder="Plan item"
                        />
                        <AppInput
                          value={String(row.amount || '')}
                          onChangeText={(value) =>
                            setPlanItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, amount: parseMoney(value) } : it)))
                          }
                          editable={!readOnly}
                          keyboardType="decimal-pad"
                          placeholder="0"
                        />
                      </View>
                      {!readOnly ? (
                        <View className="mt-2 flex-row gap-2">
                          <IconActionButton icon="content-save-outline" label="Save plan row" onPress={() => savePlanRow(row)} />
                          <IconActionButton icon="trash-can-outline" label="Delete plan row" variant="danger" onPress={() => deletePlanRow(row.id)} />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              );
            })}

            {!readOnly ? (
              <View className="rounded-lg border border-dashed border-border p-3 dark:border-slate-700">
                <Text className="mb-2 text-sm font-semibold text-foreground dark:text-slate-100">Add Plan Item</Text>
                <View className="gap-2">
                  <AppInput value={planDraft.name} onChangeText={(value) => setPlanDraft((prev) => ({ ...prev, name: value }))} placeholder="Name" />
                  <AppInput
                    value={String(planDraft.amount || '')}
                    onChangeText={(value) => setPlanDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                    placeholder="Amount"
                    keyboardType="decimal-pad"
                  />
                  <AppSegmented
                    value={planDraft.group}
                    onChange={(value) => setPlanDraft((prev) => ({ ...prev, group: value as PlanGroup }))}
                    compact
                    options={PLAN_GROUP_OPTIONS}
                  />
                </View>
                <View className="mt-2">
                  <AppButton size="sm" onPress={addPlanRow}>
                    <View className="flex-row items-center gap-1.5">
                      <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                      <Text className="text-xs font-semibold text-primary-foreground dark:text-slate-900">Add Item</Text>
                    </View>
                  </AppButton>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {section === 'RECONCILE' ? (
          <View className="gap-3">
            <View className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <AppCard className="p-3">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Total Income</Text>
                <Text className="text-base font-semibold text-foreground dark:text-slate-100">{fmtMoney(incomeTotal)}</Text>
              </AppCard>
              <AppCard className="p-3">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Funded</Text>
                <Text className="text-base font-semibold text-blue-700 dark:text-blue-300">
                  {fmtMoney(reconcileRows.reduce((sum, row) => sum + row.funded, 0))}
                </Text>
              </AppCard>
              <AppCard className="p-3">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Remaining</Text>
                <Text className="text-base font-semibold text-emerald-700 dark:text-emerald-300">{fmtMoney(remainingIncome)}</Text>
              </AppCard>
              <AppCard className="p-3">
                <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Unfunded</Text>
                <Text className="text-base font-semibold text-red-700 dark:text-red-300">{fmtMoney(totalUnfunded)}</Text>
              </AppCard>
            </View>

            <Text className="text-xs text-muted-foreground">
              Priority order controls funding sequence. Partial funding is allowed when available income runs out.
            </Text>

            {reconcileRows.map((row, index) => {
              const allocation = allocationByItemId[row.id];
              const statusLabel = row.unfunded <= 0 ? 'Funded' : row.funded > 0 ? 'Partial' : 'Unfunded';
              const statusVariant = row.unfunded <= 0 ? 'success' : row.funded > 0 ? 'warning' : 'danger';
              return (
                <AppCard key={row.id} className="gap-2 p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-foreground dark:text-slate-100">
                      #{index + 1} · {row.name}
                    </Text>
                    <AppBadge label={statusLabel} variant={statusVariant as any} />
                  </View>
                  <Text className="text-xs text-muted-foreground">{planGroupLabel(row.group)}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    <AppBadge label={`Planned ${fmtMoney(row.amount)}`} variant="outline" />
                    <AppBadge label={`Funded ${fmtMoney(row.funded)}`} variant="outline" />
                    <AppBadge label={`Unfunded ${fmtMoney(row.unfunded)}`} variant="outline" />
                  </View>

                  <View className="gap-1">
                    <Text className="text-xs text-muted-foreground">Account Mapping</Text>
                    <DropdownField
                      value={allocation?.accountId ?? ''}
                      options={accountOptions}
                      onChange={(value) => assignAccount(row, value)}
                      placeholder="Select account"
                    />
                  </View>

                  {!readOnly ? (
                    <View className="flex-row gap-2">
                      <IconActionButton
                        icon="arrow-up"
                        label="Move up"
                        disabled={index === 0}
                        onPress={() => reorderPriority(row.id, -1)}
                      />
                      <IconActionButton
                        icon="arrow-down"
                        label="Move down"
                        disabled={index === reconcileRows.length - 1}
                        onPress={() => reorderPriority(row.id, 1)}
                      />
                    </View>
                  ) : null}
                </AppCard>
              );
            })}
          </View>
        ) : null}
      </AppCard>
    </ScrollView>
  );
}
