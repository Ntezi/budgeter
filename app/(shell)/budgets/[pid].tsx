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
import { cn } from '@/lib/cn';

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

  const incomeCol = {
    name: 'w-[320px]',
    amount: 'w-[150px]',
    actions: 'w-[120px]',
  };

  const planCol = {
    name: 'w-[320px]',
    amount: 'w-[150px]',
    actions: 'w-[120px]',
  };

  const plannedTotal = planTotals.needs + planTotals.wants + planTotals.sd;
  const unallocatedTotal = incomeTotal - plannedTotal;

  const groupDotColor: Record<PlanGroup, string> = {
    NEED: 'bg-needs',
    WANT: 'bg-wants',
    SAVINGS_DEBT: 'bg-savings',
  };

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-2 border-b border-border pb-4 dark:border-zinc-800">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-2xl font-bold text-foreground dark:text-zinc-50">{title || pid}</Text>
              <View className="flex-row items-center gap-1">
                <MaterialCommunityIcons
                  name={readOnly ? 'lock-outline' : 'lock-open-outline'}
                  size={14}
                  color={readOnly ? '#717182' : '#16A34A'}
                />
                <AppBadge label={status} variant={readOnly ? 'secondary' : 'success'} className="px-2.5" />
              </View>
            </View>
            <Text className="text-sm text-muted-foreground">
              {readOnly
                ? 'DECIDED locks Income and Plan editing. Transactions and Allocations remain editable.'
                : 'DRAFT mode allows editing all planning sections.'}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <AppButton
              label={readOnly ? 'Reopen Draft' : 'Finalize'}
              onPress={toggleFinalize}
              variant={readOnly ? 'outline' : 'primary'}
              size="sm"
            />
            <IconActionButton icon="trash-can-outline" label="Delete budget" variant="danger" onPress={removeBudget} />
          </View>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Income</Text>
            <MaterialCommunityIcons name="cash-plus" size={16} color="#16A34A" />
          </View>
          <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{fmtMoney(incomeTotal)}</Text>
        </AppCard>
        <AppCard className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Planned</Text>
            <MaterialCommunityIcons name="target" size={16} color="#717182" />
          </View>
          <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{fmtMoney(plannedTotal)}</Text>
        </AppCard>
        <AppCard
          className={cn(
            'gap-1',
            unallocatedTotal >= 0
              ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
              : 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20'
          )}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Unallocated</Text>
            <MaterialCommunityIcons name={unallocatedTotal >= 0 ? 'check-circle-outline' : 'alert-circle-outline'} size={16} color={unallocatedTotal >= 0 ? '#16A34A' : '#D4183D'} />
          </View>
          <Text className={cn('text-xl font-bold', unallocatedTotal >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
            {fmtMoney(unallocatedTotal)}
          </Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Budget Meta</Text>
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

      <AppCard className="gap-2 p-3">
        <AppSegmented value={section} onChange={setSection} options={SECTION_OPTIONS as any} />
      </AppCard>

      {section === 'INCOME' ? (
        <AppCard className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Income Sources</Text>
            {readOnly ? <Text className="text-xs italic text-muted-foreground">Locked in DECIDED mode</Text> : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View className="min-w-[620px] flex-1">
              <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                <Text className={`${incomeCol.name} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Source Name</Text>
                <Text className={`${incomeCol.amount} text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Amount</Text>
                <Text className={`${incomeCol.actions} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Actions</Text>
              </View>

              {incomeItems.map((row) => (
                <View key={row.id} className="flex-row items-center border-b border-border py-2 dark:border-zinc-800">
                  <View className={`${incomeCol.name} pr-2`}>
                    {readOnly ? (
                      <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                    ) : (
                      <AppInput
                        value={row.name}
                        onChangeText={(value) =>
                          setIncomeItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, name: value } : it)))
                        }
                        placeholder="Income source"
                        className="h-9"
                      />
                    )}
                  </View>

                  <View className={`${incomeCol.amount} pr-2`}>
                    {readOnly ? (
                      <Text className="text-right text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                    ) : (
                      <AppInput
                        value={String(row.amount || '')}
                        onChangeText={(value) =>
                          setIncomeItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, amount: parseMoney(value) } : it)))
                        }
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        className="h-9 text-right"
                      />
                    )}
                  </View>

                  <View className={`${incomeCol.actions} flex-row items-center justify-center gap-2`}>
                    {!readOnly ? (
                      <>
                        <IconActionButton icon="content-save-outline" label="Save income row" onPress={() => saveIncomeRow(row)} />
                        <IconActionButton icon="trash-can-outline" label="Delete income row" variant="danger" onPress={() => deleteIncomeRow(row.id)} />
                      </>
                    ) : null}
                  </View>
                </View>
              ))}

              {!readOnly ? (
                <View className="flex-row items-center border-b border-border bg-muted/40 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <View className={`${incomeCol.name} pr-2`}>
                    <AppInput
                      value={incomeDraft.name}
                      onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, name: value }))}
                      placeholder="New source..."
                      className="h-9"
                    />
                  </View>
                  <View className={`${incomeCol.amount} pr-2`}>
                    <AppInput
                      value={String(incomeDraft.amount || '')}
                      onChangeText={(value) => setIncomeDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      className="h-9 text-right"
                    />
                  </View>
                  <View className={`${incomeCol.actions} items-center`}>
                    <IconActionButton icon="plus" label="Add income row" onPress={addIncomeRow} />
                  </View>
                </View>
              ) : null}

              <View className="flex-row items-center bg-muted/60 py-2 dark:bg-zinc-800/50">
                <Text className={`${incomeCol.name} text-sm font-semibold text-foreground dark:text-zinc-50`}>Total Income</Text>
                <Text className={`${incomeCol.amount} text-right text-sm font-semibold text-foreground dark:text-zinc-50`}>{fmtMoney(incomeTotal)}</Text>
                <View className={incomeCol.actions} />
              </View>
            </View>
          </ScrollView>
        </AppCard>
      ) : null}

      {section === 'PLAN' ? (
        <View className="gap-3">
          {PLAN_GROUP_OPTIONS.map((group) => {
            const rows = planWithPriority.filter((item) => item.group === group.value);
            const subtotal = rows.reduce((sum, row) => sum + (row.amount || 0), 0);
            return (
              <AppCard key={group.value} className="gap-2">
                <View className="flex-row items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 dark:bg-zinc-800/40">
                  <View className="flex-row items-center gap-2">
                    <View className={cn('h-2.5 w-2.5 rounded-full', groupDotColor[group.value])} />
                    <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{group.label}</Text>
                  </View>
                  <AppBadge label={fmtMoney(subtotal)} variant="outline" />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View className="min-w-[620px] flex-1">
                    <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                      <Text className={`${planCol.name} text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Item Name</Text>
                      <Text className={`${planCol.amount} text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Amount</Text>
                      <Text className={`${planCol.actions} text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>Actions</Text>
                    </View>

                    {rows.map((row) => (
                      <View key={row.id} className="flex-row items-center border-b border-border py-2 dark:border-zinc-800">
                        <View className={`${planCol.name} pr-2`}>
                          {readOnly ? (
                            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                          ) : (
                            <AppInput
                              value={row.name}
                              onChangeText={(value) =>
                                setPlanItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, name: value } : it)))
                              }
                              placeholder="Plan item"
                              className="h-9"
                            />
                          )}
                        </View>

                        <View className={`${planCol.amount} pr-2`}>
                          {readOnly ? (
                            <Text className="text-right text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.amount || 0)}</Text>
                          ) : (
                            <AppInput
                              value={String(row.amount || '')}
                              onChangeText={(value) =>
                                setPlanItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, amount: parseMoney(value) } : it)))
                              }
                              keyboardType="decimal-pad"
                              placeholder="0.00"
                              className="h-9 text-right"
                            />
                          )}
                        </View>

                        <View className={`${planCol.actions} flex-row items-center justify-center gap-2`}>
                          {!readOnly ? (
                            <>
                              <IconActionButton icon="content-save-outline" label="Save plan row" onPress={() => savePlanRow(row)} />
                              <IconActionButton icon="trash-can-outline" label="Delete plan row" variant="danger" onPress={() => deletePlanRow(row.id)} />
                            </>
                          ) : null}
                        </View>
                      </View>
                    ))}

                    {!rows.length ? (
                      <View className="py-3">
                        <Text className="text-sm text-muted-foreground">No items planned in this category.</Text>
                      </View>
                    ) : null}
                  </View>
                </ScrollView>
              </AppCard>
            );
          })}

          {!readOnly ? (
            <AppCard className="gap-2">
              <Text className="mb-2 text-sm font-semibold text-foreground dark:text-zinc-50">Add Plan Item</Text>
              <View className="flex-row flex-wrap items-end gap-2">
                <View className="min-w-[220px] flex-1 gap-1">
                  <Text className="text-xs text-muted-foreground">Name</Text>
                  <AppInput value={planDraft.name} onChangeText={(value) => setPlanDraft((prev) => ({ ...prev, name: value }))} placeholder="e.g. Rent" className="h-9" />
                </View>
                <View className="min-w-[200px] gap-1">
                  <Text className="text-xs text-muted-foreground">Category</Text>
                  <AppSegmented
                    value={planDraft.group}
                    onChange={(value) => setPlanDraft((prev) => ({ ...prev, group: value as PlanGroup }))}
                    compact
                    options={PLAN_GROUP_OPTIONS}
                  />
                </View>
                <View className="w-[130px] gap-1">
                  <Text className="text-xs text-muted-foreground">Amount</Text>
                  <AppInput
                    value={String(planDraft.amount || '')}
                    onChangeText={(value) => setPlanDraft((prev) => ({ ...prev, amount: parseMoney(value) }))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    className="h-9 text-right"
                  />
                </View>
                <IconActionButton icon="plus" label="Add plan item" onPress={addPlanRow} />
              </View>
            </AppCard>
          ) : null}
        </View>
      ) : null}

      {section === 'RECONCILE' ? (
        <AppCard className="gap-3">
          <View className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Total Income</Text>
              <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{fmtMoney(incomeTotal)}</Text>
            </View>
            <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Funded</Text>
              <Text className="text-base font-semibold text-blue-700 dark:text-blue-300">
                {fmtMoney(reconcileRows.reduce((sum, row) => sum + row.funded, 0))}
              </Text>
            </View>
            <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Remaining</Text>
              <Text className="text-base font-semibold text-emerald-700 dark:text-emerald-300">{fmtMoney(remainingIncome)}</Text>
            </View>
            <View className="rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xxs uppercase tracking-wide text-muted-foreground">Unfunded</Text>
              <Text className="text-base font-semibold text-red-700 dark:text-red-300">{fmtMoney(totalUnfunded)}</Text>
            </View>
          </View>

          <Text className="text-xs text-muted-foreground">
            Priority order controls funding sequence. Partial funding is allowed when available income runs out.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View className="min-w-[1040px] flex-1">
              <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                <Text className="w-[50px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</Text>
                <Text className="w-[250px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</Text>
                <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned</Text>
                <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funded</Text>
                <Text className="w-[120px] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unfunded</Text>
                <Text className="w-[110px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</Text>
                <Text className="w-[270px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</Text>
                <Text className="w-[120px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</Text>
              </View>

              {reconcileRows.map((row, index) => {
                const allocation = allocationByItemId[row.id];
                const statusLabel = row.unfunded <= 0 ? 'Funded' : row.funded > 0 ? 'Partial' : 'Unfunded';
                const statusVariant = row.unfunded <= 0 ? 'success' : row.funded > 0 ? 'warning' : 'danger';
                return (
                  <View key={row.id} className="flex-row items-center border-b border-border py-2 dark:border-zinc-800">
                    <Text className="w-[50px] text-sm text-foreground dark:text-zinc-50">{index + 1}</Text>

                    <View className="w-[250px] pr-2">
                      <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                      <Text className="text-xs text-muted-foreground">{planGroupLabel(row.group)}</Text>
                    </View>

                    <Text className="w-[120px] text-right text-sm text-foreground dark:text-zinc-50">{fmtMoney(row.amount)}</Text>
                    <Text className="w-[120px] text-right text-sm font-semibold text-blue-700 dark:text-blue-300">{fmtMoney(row.funded)}</Text>
                    <Text className="w-[120px] text-right text-sm text-muted-foreground">{fmtMoney(row.unfunded)}</Text>

                    <View className="w-[110px] items-center">
                      <AppBadge label={statusLabel} variant={statusVariant as any} />
                    </View>

                    <View className="w-[270px] pr-2">
                      <DropdownField
                        value={allocation?.accountId ?? ''}
                        options={accountOptions}
                        onChange={(value) => assignAccount(row, value)}
                        placeholder="Select account"
                        className="w-full"
                        menuStrategy="inline"
                        menuClassName="min-w-[270px] max-h-44"
                      />
                    </View>

                    <View className="w-[120px] flex-row items-center justify-center gap-2">
                      {!readOnly ? (
                        <>
                          <IconActionButton icon="arrow-up" label="Move up" disabled={index === 0} onPress={() => reorderPriority(row.id, -1)} />
                          <IconActionButton
                            icon="arrow-down"
                            label="Move down"
                            disabled={index === reconcileRows.length - 1}
                            onPress={() => reorderPriority(row.id, 1)}
                          />
                        </>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </AppCard>
      ) : null}
    </ScrollView>
  );
}
