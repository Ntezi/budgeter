import {useLocalSearchParams, useRouter} from 'expo-router';
import {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Alert, Platform, Pressable, TextInput} from 'react-native';
import {useAuthUser} from '@/providers/AuthProvider';
import {
  getOrCreatePeriod, watchPeriod, setTargetPct, setPeriodTitle, setPeriodStatus,
  deletePeriod, PeriodDoc, PeriodStatus,
} from '@/lib/repo/periods';
import {fmtMoney, parseMoney, parsePct100} from '@/lib/format';
import {EditRow} from '@/components/EditRow';
import {AccordionSection} from '@/components/AccordionSection';
import {
  IncomeItem, addIncomeItem, deleteIncomeItem, updateIncomeItem, watchIncomeItems
} from '@/lib/repo/income';
import {
  PlanItem, PlanGroup, addPlanItem, deletePlanItem, updatePlanItem, watchPlanTotals
} from '@/lib/repo/plans';
import {watchAccounts, type Account} from '@/lib/repo/accounts';
import {
  addPeriodWalletAccount,
  deleteAllocation,
  removePeriodWalletAccount,
  upsertAllocationForBudgetItem,
  watchAllocations,
  watchPeriodWalletAccounts,
  type Allocation,
  type AllocationTotals,
} from '@/lib/repo/allocations';
import type {WalletTag} from '@/lib/domain';
import {TagPill} from '@/components/TagPill';

export default function BudgetDetail() {
  const {pid} = useLocalSearchParams<{pid: string}>();
  const router = useRouter();
  const user = useAuthUser();
  const uid = user?.uid;
  const [titleText, setTitleText] = useState('');
  const [status, setStatus] = useState<PeriodStatus>('DRAFT');

  const [pNeeds, setPNeeds] = useState('50');
  const [pWants, setPWants] = useState('30');
  const [pSd, setPSd] = useState('20');

  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([]);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [newIncome, setNewIncome] = useState<IncomeItem>({name: '', amount: 0});

  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [totals, setTotals] = useState({needs: 0, wants: 0, sd: 0});
  const [newPlan, setNewPlan] = useState<PlanItem>({name: '', amount: 0, group: 'NEED'});

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [walletAccountIds, setWalletAccountIds] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocationTotals, setAllocationTotals] = useState<AllocationTotals>({
    needs: 0,
    wants: 0,
    savings: 0,
    total: 0,
  });
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, {
    accountId: string;
    amount: number;
    tag: WalletTag;
    note: string;
  }>>({});

  const readOnly = status === 'DECIDED';

  useEffect(() => {
    if (!uid || !pid) return;
    getOrCreatePeriod(uid, pid);
    const unP = watchPeriod(uid, pid, (p: PeriodDoc) => {
      setTitleText(p.title ?? '');
      setStatus((p.status as PeriodStatus) ?? 'DRAFT');
      setPNeeds(String(Math.round((p.targetPct?.needs ?? 0.5) * 100)));
      setPWants(String(Math.round((p.targetPct?.wants ?? 0.3) * 100)));
      setPSd(String(Math.round((p.targetPct?.sd ?? 0.2) * 100)));
    });
    const unI = watchIncomeItems(uid, pid, (items, total) => {
      setIncomeItems(items);
      setIncomeTotal(total);
    });
    const unM = watchPlanTotals(uid, pid, (t, items) => {
      setTotals(t);
      setPlanItems(items);
    });
    const unAlloc = watchAllocations(uid, pid, (rows, totals) => {
      setAllocations(rows);
      setAllocationTotals(totals);
    });
    const unAccounts = watchAccounts(uid, setAccounts, {includeArchived: true});
    const unWallet = watchPeriodWalletAccounts(uid, pid, setWalletAccountIds);
    return () => {
      unP();
      unI();
      unM();
      unAlloc();
      unAccounts();
      unWallet();
    };
  }, [uid, pid]);

  const pct = useMemo(() => ({
    needs: parsePct100(pNeeds),
    wants: parsePct100(pWants),
    sd: parsePct100(pSd),
  }), [pNeeds, pWants, pSd]);

  const autoTargets = useMemo(() => ({
    needs: incomeTotal * pct.needs,
    wants: incomeTotal * pct.wants,
    sd: incomeTotal * pct.sd,
  }), [incomeTotal, pct]);

  const accountById = useMemo(
    () => Object.fromEntries(
      accounts
        .filter((row): row is Account & {id: string} => Boolean(row.id))
        .map((row) => [row.id, row])
    ),
    [accounts]
  );

  const selectableAccounts = useMemo(
    () =>
      accounts.filter((row): row is Account & {id: string} => {
        const id = row.id;
        if (!id) return false;
        return !row.archived || walletAccountIds.includes(id);
      }),
    [accounts, walletAccountIds]
  );

  const selectedWalletAccounts = useMemo(
    () => walletAccountIds
      .map((id) => accountById[id])
      .filter((row): row is Account & {id: string} => Boolean(row)),
    [walletAccountIds, accountById]
  );

  const planItemsWithId = useMemo(
    () => planItems.filter((item): item is PlanItem & {id: string} => Boolean(item.id)),
    [planItems]
  );

  const planAllocationsByItemId = useMemo(() => {
    const map: Record<string, Allocation> = {};
    for (const row of allocations) {
      if (row.sourceType === 'PLAN' && row.sourceItemId) map[row.sourceItemId] = row;
    }
    return map;
  }, [allocations]);

  const allocatedPlanCount = useMemo(
    () => Object.keys(planAllocationsByItemId).length,
    [planAllocationsByItemId]
  );

  useEffect(() => {
    setAllocationDrafts((prev) => {
      const next: Record<string, {accountId: string; amount: number; tag: WalletTag; note: string}> = {};
      for (const item of planItemsWithId) {
        const existing = planAllocationsByItemId[item.id];
        const prevDraft = prev[item.id];
        next[item.id] = {
          accountId: existing?.accountId ?? prevDraft?.accountId ?? walletAccountIds[0] ?? '',
          amount: existing?.amount ?? prevDraft?.amount ?? item.amount ?? 0,
          tag: existing?.tag ?? prevDraft?.tag ?? planGroupToWalletTag(item.group),
          note: existing?.note ?? prevDraft?.note ?? '',
        };
      }
      return next;
    });
  }, [planItemsWithId, planAllocationsByItemId, walletAccountIds]);

  async function saveTitle() {
    if (!uid || !pid) return;
    await setPeriodTitle(uid, pid, titleText.trim());
  }

  async function saveAutoPct() {
    if (!uid || !pid) return;
    await setTargetPct(uid, pid, pct);
  }

  async function finalize() {
    if (!uid || !pid) return;
    const message =
      'Mark this budget as DECIDED. Plan, income, and transactions lock. Wallet allocations remain editable.';
    if (Platform.OS === 'web') {
      const ok = window.confirm(message);
      if (!ok) return;
      try {
        await setPeriodStatus(uid, pid, 'DECIDED');
      } catch (e: unknown) {
        const reason = e instanceof Error ? e.message : String(e);
        alert(`Finalize failed: ${reason}`);
      }
      return;
    }
    Alert.alert('Finalize budget?', message, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Finalize',
        style: 'destructive',
        onPress: async () => {
          try {
            await setPeriodStatus(uid, pid, 'DECIDED');
          } catch (e: unknown) {
            const reason = e instanceof Error ? e.message : String(e);
            Alert.alert('Error', reason);
          }
        },
      },
    ]);
  }

  async function handleDelete() {
    if (!uid || !pid) return;
    if (readOnly) {
      const msg = 'Decided budgets are view-only. Unfinalize support can be added if needed.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Blocked', msg);
      }
      return;
    }
    if (Platform.OS === 'web') {
      const ok = window.confirm('Delete this draft budget and all its items? This cannot be undone.');
      if (!ok) return;
      try {
        await deletePeriod(uid, pid);
        router.replace('/(tabs)/budgets');
      } catch (e: unknown) {
        const reason = e instanceof Error ? e.message : String(e);
        alert(`Delete failed: ${reason}`);
      }
      return;
    }
    Alert.alert('Delete budget?', 'Remove the budget and all items (transactions, income, manual plan).', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePeriod(uid, pid);
            router.replace('/(tabs)/budgets');
          } catch (e: unknown) {
            const reason = e instanceof Error ? e.message : String(e);
            Alert.alert('Delete failed', reason);
          }
        },
      },
    ]);
  }

  const saveNewIncome = async () => {
    if (!uid || !pid || readOnly || !newIncome.name || !newIncome.amount) return;
    await addIncomeItem(uid, pid, newIncome);
    setNewIncome({name: '', amount: 0});
  };
  const saveIncome = async (it: IncomeItem) => {
    if (!uid || !pid || readOnly || !it.id) return;
    await updateIncomeItem(uid, pid, it.id, {name: it.name, amount: it.amount});
  };
  const delIncome = async (id?: string) => {
    if (!uid || !pid || readOnly || !id) return;
    await deleteIncomeItem(uid, pid, id);
  };

  const saveNewPlan = async () => {
    if (!uid || !pid || readOnly || !newPlan.name || !newPlan.amount) return;
    await addPlanItem(uid, pid, newPlan);
    setNewPlan({name: '', amount: 0, group: newPlan.group});
  };
  const savePlan = async (it: PlanItem) => {
    if (!uid || !pid || readOnly || !it.id) return;
    await updatePlanItem(uid, pid, it.id, {name: it.name, amount: it.amount, group: it.group});
  };
  const delPlan = async (id?: string) => {
    if (!uid || !pid || readOnly || !id) return;
    await deletePlanItem(uid, pid, id);
  };

  function patchAllocationDraft(itemId: string, patch: Partial<{
    accountId: string;
    amount: number;
    tag: WalletTag;
    note: string;
  }>) {
    setAllocationDrafts((prev) => ({
      ...prev,
      [itemId]: {
        accountId: patch.accountId ?? prev[itemId]?.accountId ?? '',
        amount: patch.amount ?? prev[itemId]?.amount ?? 0,
        tag: patch.tag ?? prev[itemId]?.tag ?? 'NEEDS',
        note: patch.note ?? prev[itemId]?.note ?? '',
      },
    }));
  }

  async function includeWalletAccount(accountId: string) {
    if (!uid || !pid) return;
    await addPeriodWalletAccount(uid, pid, accountId);
  }

  async function excludeWalletAccount(accountId: string) {
    if (!uid || !pid) return;
    const used = allocations.some((row) => row.accountId === accountId && (row.amount || 0) > 0);
    if (used) {
      Alert.alert(
        'Account in use',
        'Re-assign or clear allocations linked to this account before removing it from this budget wallet.'
      );
      return;
    }
    await removePeriodWalletAccount(uid, pid, accountId);
  }

  async function savePlanAllocation(item: PlanItem & {id: string}) {
    if (!uid || !pid) return;
    const draft = allocationDrafts[item.id];
    if (!draft?.accountId) {
      Alert.alert('Select account', `Pick an account for "${item.name}" first.`);
      return;
    }
    const amount = Number(draft.amount) || 0;
    if (amount <= 0) {
      const existing = planAllocationsByItemId[item.id];
      if (existing?.id) await deleteAllocation(uid, pid, existing.id);
      return;
    }
    await addPeriodWalletAccount(uid, pid, draft.accountId);
    await upsertAllocationForBudgetItem(uid, pid, {
      sourceType: 'PLAN',
      sourceItemId: item.id,
      sourceItemName: item.name,
      accountId: draft.accountId,
      amount,
      tag: draft.tag,
      note: draft.note.trim(),
    });
  }

  async function clearPlanAllocation(itemId: string) {
    if (!uid || !pid) return;
    const existing = planAllocationsByItemId[itemId];
    if (!existing?.id) return;
    await deleteAllocation(uid, pid, existing.id);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>{titleText || pid}</Text>
      <View style={styles.rowHeader}>
        <Text style={[styles.badge, readOnly ? styles.badgeDecided : styles.badgeDraft]}>
          {readOnly ? 'DECIDED' : 'DRAFT'}
        </Text>
        <View style={styles.inline}>
          {!readOnly ? <Button title="Finalize" onPress={finalize}/> : null}
          {!readOnly ? <Button title="Delete" color="#EF4444" onPress={handleDelete}/> : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Title</Text>
        <EditRow
          name={titleText}
          amount={0}
          onChange={(p) => 'name' in p && setTitleText(String(p.name))}
          onSave={saveTitle}
          addMode
          disabled={readOnly}
        />
      </View>

      <AccordionSection
        title="Income items"
        subtitle={`Total: ${fmtMoney(incomeTotal)}`}
        defaultOpen
      >
        {incomeItems.map((it) => (
          <EditRow
            key={it.id}
            name={it.name}
            amount={it.amount}
            onChange={(p) => Object.assign(it, p)}
            onSave={() => saveIncome(it)}
            onDelete={() => delIncome(it.id)}
            disabled={readOnly}
          />
        ))}
        {!readOnly ? (
          <EditRow
            addMode
            name={newIncome.name}
            amount={newIncome.amount}
            onChange={(p) => setNewIncome({...newIncome, ...p})}
            onSave={saveNewIncome}
          />
        ) : null}
      </AccordionSection>

      <AccordionSection
        title="Auto Targets (by % of total income)"
        subtitle={`Needs ${pNeeds}% · Wants ${pWants}% · S&D ${pSd}%`}
      >
        <EditRow
          name="Needs %"
          amount={Number(pNeeds)}
          onChange={(p) => p.amount !== undefined && setPNeeds(String(p.amount))}
          onSave={saveAutoPct}
          disabled={readOnly}
        />
        <EditRow
          name="Wants %"
          amount={Number(pWants)}
          onChange={(p) => p.amount !== undefined && setPWants(String(p.amount))}
          onSave={saveAutoPct}
          disabled={readOnly}
        />
        <EditRow
          name="Savings & Debts %"
          amount={Number(pSd)}
          onChange={(p) => p.amount !== undefined && setPSd(String(p.amount))}
          onSave={saveAutoPct}
          disabled={readOnly}
        />
        <Text style={styles.help}>
          Targets → Needs {fmtMoney(autoTargets.needs)} · Wants {fmtMoney(autoTargets.wants)} ·
          S&D {fmtMoney(autoTargets.sd)}
        </Text>
      </AccordionSection>

      <AccordionSection
        title="Needs (manual items)"
        subtitle={`Subtotal: ${fmtMoney(totals.needs)}`}
      >
        <PlanSection
          group="NEED"
          items={planItems.filter((i) => i.group === 'NEED')}
          onChangeItem={(it, patch) => Object.assign(it, patch)}
          onSaveItem={savePlan}
          onDeleteItem={(it) => delPlan(it.id)}
          newItem={newPlan}
          setNewItem={setNewPlan}
          onAddItem={saveNewPlan}
          total={totals.needs}
          readOnly={readOnly}
        />
      </AccordionSection>

      <AccordionSection
        title="Wants (manual items)"
        subtitle={`Subtotal: ${fmtMoney(totals.wants)}`}
      >
        <PlanSection
          group="WANT"
          items={planItems.filter((i) => i.group === 'WANT')}
          onChangeItem={(it, patch) => Object.assign(it, patch)}
          onSaveItem={savePlan}
          onDeleteItem={(it) => delPlan(it.id)}
          newItem={newPlan}
          setNewItem={setNewPlan}
          onAddItem={saveNewPlan}
          total={totals.wants}
          readOnly={readOnly}
        />
      </AccordionSection>

      <AccordionSection
        title="Savings & Debts (manual items)"
        subtitle={`Subtotal: ${fmtMoney(totals.sd)}`}
      >
        <PlanSection
          group="SAVINGS_DEBT"
          items={planItems.filter((i) => i.group === 'SAVINGS_DEBT')}
          onChangeItem={(it, patch) => Object.assign(it, patch)}
          onSaveItem={savePlan}
          onDeleteItem={(it) => delPlan(it.id)}
          newItem={newPlan}
          setNewItem={setNewPlan}
          onAddItem={saveNewPlan}
          total={totals.sd}
          readOnly={readOnly}
        />
      </AccordionSection>

      <View style={styles.card}>
        <Text style={styles.h2}>Wallet Allocations</Text>
        <Text style={styles.help}>
          Build a wallet for this period by selecting accounts, then map budget items to those accounts.
        </Text>

        <AccordionSection
          title="1) Wallet Accounts In This Budget"
          subtitle={`${selectedWalletAccounts.length} selected`}
          defaultOpen
        >
          {!selectableAccounts.length ? (
            <Text style={styles.help}>Create accounts first in the Accounts tab.</Text>
          ) : null}
          <View style={styles.walletGrid}>
            {selectableAccounts.map((account) => {
              const selected = walletAccountIds.includes(account.id);
              return (
                <Pressable
                  key={account.id}
                  style={[styles.walletChip, selected && styles.walletChipActive]}
                  onPress={() =>
                    selected ? excludeWalletAccount(account.id) : includeWalletAccount(account.id)
                  }
                >
                  <Text style={[styles.walletName, selected && styles.walletNameActive]}>{account.name}</Text>
                  <Text style={[styles.walletHint, selected && styles.walletHintActive]}>
                    Type: {account.type ?? 'OTHER'}
                  </Text>
                  <Text style={[styles.walletHint, selected && styles.walletHintActive]}>
                    {selected ? 'In this budget wallet' : 'Tap to include'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AccordionSection>

        <AccordionSection
          title="2) Allocate Plan Items To Wallet Accounts"
          subtitle={`${allocatedPlanCount}/${planItemsWithId.length} items mapped`}
          defaultOpen
        >
          {!planItemsWithId.length ? (
            <Text style={styles.help}>Add plan items first, then allocate each item to an account.</Text>
          ) : null}
          {!!planItemsWithId.length && !selectedWalletAccounts.length ? (
            <Text style={styles.help}>Select at least one wallet account above to start allocating.</Text>
          ) : null}

          {planItemsWithId.map((item) => {
            const draft = allocationDrafts[item.id] ?? {
              accountId: selectedWalletAccounts[0]?.id ?? '',
              amount: item.amount || 0,
              tag: planGroupToWalletTag(item.group),
              note: '',
            };
            const existing = planAllocationsByItemId[item.id];
            return (
              <View key={item.id} style={styles.allocRowCard}>
                <View style={styles.rowHeader}>
                  <View style={{flex: 1}}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.help}>Planned: {fmtMoney(item.amount || 0)}</Text>
                  </View>
                  <TagPill tag={planGroupToWalletTag(item.group)}/>
                </View>

                <View style={styles.accountPickWrap}>
                  {selectedWalletAccounts.map((account) => {
                    const active = draft.accountId === account.id;
                    return (
                      <Pressable
                        key={account.id}
                        style={[styles.accountPick, active && styles.accountPickActive]}
                        onPress={() => patchAllocationDraft(item.id, {accountId: account.id})}
                      >
                        <Text style={[styles.accountPickText, active && styles.accountPickTextActive]}>
                          {account.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.input}
                  value={String(draft.amount || '')}
                  onChangeText={(value) => patchAllocationDraft(item.id, {amount: parseMoney(value)})}
                  inputMode="decimal"
                  placeholder="Allocation amount"
                />
                <TextInput
                  style={styles.input}
                  value={draft.note}
                  onChangeText={(note) => patchAllocationDraft(item.id, {note})}
                  placeholder="Note (optional)"
                />
                <View style={styles.inline}>
                  <Button
                    title="Save allocation"
                    onPress={() => savePlanAllocation(item)}
                    disabled={!selectedWalletAccounts.length}
                  />
                  {existing ? (
                    <Button
                      title="Clear"
                      color="#B91C1C"
                      onPress={() => clearPlanAllocation(item.id)}
                    />
                  ) : null}
                </View>
                <Text style={styles.help}>
                  {existing
                    ? `Current → ${accountById[existing.accountId]?.name ?? 'Unknown account'} (${fmtMoney(existing.amount || 0)})`
                    : 'No allocation yet'}
                </Text>
              </View>
            );
          })}
        </AccordionSection>

        <View style={styles.row}>
          <TagPill tag="NEEDS"/>
          <Text>{fmtMoney(allocationTotals.needs)}</Text>
          <TagPill tag="WANTS"/>
          <Text>{fmtMoney(allocationTotals.wants)}</Text>
          <TagPill tag="SAVINGS"/>
          <Text>{fmtMoney(allocationTotals.savings)}</Text>
        </View>
        <Text style={styles.help}>Total allocated: {fmtMoney(allocationTotals.total)}</Text>
        {incomeTotal > 0 ? (
          <>
            <Text style={styles.help}>
              Remaining vs auto target (Needs): {fmtMoney(autoTargets.needs - allocationTotals.needs)}
            </Text>
            <Text style={styles.help}>
              Remaining vs auto target (Wants): {fmtMoney(autoTargets.wants - allocationTotals.wants)}
            </Text>
            <Text style={styles.help}>
              Remaining vs auto target (Savings): {fmtMoney(autoTargets.sd - allocationTotals.savings)}
            </Text>
          </>
        ) : (
          <Text style={styles.help}>Set income to compare allocations against targets.</Text>
        )}
        <View style={styles.inline}>
          <Button title="Manage accounts" onPress={() => router.push('/(tabs)/accounts')}/>
          <Button title="Recurring templates" onPress={() => router.push('/(tabs)/recurring')}/>
        </View>
      </View>
    </ScrollView>
  );
}

function PlanSection({
  group,
  items,
  onChangeItem,
  onSaveItem,
  onDeleteItem,
  newItem,
  setNewItem,
  onAddItem,
  total,
  readOnly,
}: {
  group: PlanGroup;
  items: PlanItem[];
  onChangeItem: (it: PlanItem, patch: Partial<PlanItem>) => void;
  onSaveItem: (it: PlanItem) => void;
  onDeleteItem: (it: PlanItem) => void;
  newItem: PlanItem;
  setNewItem: (it: PlanItem) => void;
  onAddItem: () => void;
  total: number;
  readOnly: boolean;
}) {
  return (
    <View style={styles.sectionBody}>
      {items.map((it) => (
        <EditRow
          key={it.id}
          name={it.name}
          amount={it.amount}
          onChange={(p) => onChangeItem(it, p)}
          onSave={() => onSaveItem(it)}
          onDelete={() => onDeleteItem(it)}
          disabled={readOnly}
        />
      ))}
      {!readOnly ? (
        <EditRow
          addMode
          name={newItem.group === group ? newItem.name : ''}
          amount={newItem.group === group ? newItem.amount : 0}
          onChange={(p) => setNewItem({...newItem, group, ...p})}
          onSave={onAddItem}
        />
      ) : null}
      <Text style={styles.help}>Subtotal: {fmtMoney(total)}</Text>
    </View>
  );
}

function planGroupToWalletTag(group: PlanGroup): WalletTag {
  if (group === 'NEED') return 'NEEDS';
  if (group === 'WANT') return 'WANTS';
  return 'SAVINGS';
}

const styles = StyleSheet.create({
  container: {padding: 16, gap: 16},
  h1: {fontSize: 22, fontWeight: '700'},
  h2: {fontSize: 16, fontWeight: '700', marginBottom: 8},
  rowTitle: {fontSize: 14, fontWeight: '700'},
  rowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    color: '#111',
    fontWeight: '700',
  },
  badgeDraft: {backgroundColor: '#DBEAFE'},
  badgeDecided: {backgroundColor: '#DCFCE7'},
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  help: {color: '#6B7280', fontSize: 12},
  row: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8},
  sectionBody: {gap: 6},
  inline: {flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap'},
  walletGrid: {gap: 8},
  walletChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    padding: 10,
    gap: 6,
  },
  walletChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  walletName: {fontSize: 14, fontWeight: '700', color: '#111827'},
  walletNameActive: {color: '#1D4ED8'},
  walletHint: {fontSize: 12, color: '#6B7280'},
  walletHintActive: {color: '#1D4ED8'},
  allocRowCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 10,
    gap: 8,
    marginBottom: 8,
  },
  accountPickWrap: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  accountPick: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
  },
  accountPickActive: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  accountPickText: {fontSize: 12, fontWeight: '600', color: '#374151'},
  accountPickTextActive: {color: '#1E40AF'},
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
