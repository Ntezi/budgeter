import {useLocalSearchParams, useRouter} from 'expo-router';
import {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, Button, Alert, Platform, Pressable, TextInput, useWindowDimensions} from 'react-native';
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
  deleteAllocation,
  upsertAllocationForBudgetItem,
  watchAllocations,
  type Allocation,
} from '@/lib/repo/allocations';
import type {WalletTag} from '@/lib/domain';

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
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, {
    accountId: string;
  }>>({});

  const readOnly = status === 'DECIDED';
  const {width} = useWindowDimensions();
  const isCompact = width < 720;
  const isWide = width >= 1100;

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
    const unAlloc = watchAllocations(uid, pid, (rows) => {
      setAllocations(rows);
    });
    const unAccounts = watchAccounts(uid, setAccounts, {includeArchived: true});
    return () => {
      unP();
      unI();
      unM();
      unAlloc();
      unAccounts();
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

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((row): row is Account & {id: string} => Boolean(row.id))
        .map((row) => ({
          label: row.archived ? `${row.name} (archived)` : row.name,
          value: row.id,
          archived: row.archived === true,
        })),
    [accounts]
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

  useEffect(() => {
    setAllocationDrafts((prev) => {
      const next: Record<string, {accountId: string}> = {};
      for (const item of planItemsWithId) {
        const existing = planAllocationsByItemId[item.id];
        const prevDraft = prev[item.id];
        next[item.id] = {
          accountId: existing?.accountId ?? prevDraft?.accountId ?? '',
        };
      }
      return next;
    });
  }, [planItemsWithId, planAllocationsByItemId]);

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
    const warning = readOnly
      ? 'This budget is DECIDED. Deleting will remove all items and cannot be undone.'
      : 'Delete this draft budget and all its items? This cannot be undone.';
    if (Platform.OS === 'web') {
      const ok = window.confirm(warning);
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
    Alert.alert('Delete budget?', warning, [
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
    const name = it.name.trim();
    if (!name) return;
    await updateIncomeItem(uid, pid, it.id, {name, amount: it.amount});
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
    const name = it.name.trim();
    if (!name) return;
    await updatePlanItem(uid, pid, it.id, {name, amount: it.amount, group: it.group});
    await savePlanAllocation(it as PlanItem & {id: string});
  };
  const delPlan = async (id?: string) => {
    if (!uid || !pid || readOnly || !id) return;
    await deletePlanItem(uid, pid, id);
    await clearPlanAllocation(id);
  };

  function patchAllocationDraft(itemId: string, patch: Partial<{
    accountId: string;
  }>) {
    setAllocationDrafts((prev) => ({
      ...prev,
      [itemId]: {
        accountId: patch.accountId ?? prev[itemId]?.accountId ?? '',
      },
    }));
  }

  async function savePlanAllocation(item: PlanItem & {id: string}) {
    if (!uid || !pid) return;
    const draft = allocationDrafts[item.id];
    const existing = planAllocationsByItemId[item.id];
    if (!draft?.accountId) {
      if (existing?.id) await deleteAllocation(uid, pid, existing.id);
      return;
    }
    const amount = Number(item.amount) || 0;
    if (amount <= 0) {
      if (existing?.id) await deleteAllocation(uid, pid, existing.id);
      return;
    }
    await upsertAllocationForBudgetItem(uid, pid, {
      sourceType: 'PLAN',
      sourceItemId: item.id,
      sourceItemName: item.name,
      accountId: draft.accountId,
      amount,
      tag: planGroupToWalletTag(item.group),
      note: existing?.note ?? '',
    });
  }

  async function saveIncomeSection() {
    if (!uid || !pid || readOnly) return;
    for (const it of incomeItems) {
      if (!it.id) continue;
      const name = it.name.trim();
      if (!name) continue;
      await updateIncomeItem(uid, pid, it.id, {name, amount: it.amount});
    }
  }

  async function savePlanSection(group: PlanGroup) {
    if (!uid || !pid || readOnly) return;
    const items = planItemsWithId.filter((it) => it.group === group);
    for (const it of items) {
      await savePlan(it);
    }
  }

  async function clearPlanAllocation(itemId: string) {
    if (!uid || !pid) return;
    const existing = planAllocationsByItemId[itemId];
    if (!existing?.id) return;
    await deleteAllocation(uid, pid, existing.id);
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, isWide && styles.containerWide]}>
      <Text style={styles.h1}>{titleText || pid}</Text>
      <View style={styles.rowHeader}>
        <Text style={[styles.badge, readOnly ? styles.badgeDecided : styles.badgeDraft]}>
          {readOnly ? 'DECIDED' : 'DRAFT'}
        </Text>
        <View style={styles.inline}>
          {!readOnly ? <Button title="Finalize" onPress={finalize}/> : null}
          <Button title="Delete" color="#EF4444" onPress={handleDelete}/>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>Title</Text>
        <TextInput
          style={[styles.input, readOnly && styles.inputDisabled]}
          value={titleText}
          onChangeText={setTitleText}
          editable={!readOnly}
          placeholder="Budget title"
        />
        <Button title="Save title" onPress={saveTitle} disabled={readOnly}/>
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
            showSave={false}
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
            saveLabel="Add"
          />
        ) : null}
        <Button title="Save income items" onPress={saveIncomeSection} disabled={readOnly}/>
      </AccordionSection>

      <AccordionSection
        title="Auto Targets (by % of total income)"
        subtitle={`Needs ${pNeeds}% · Wants ${pWants}% · S&D ${pSd}%`}
      >
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>Needs %</Text>
          <TextInput
            style={[styles.input, styles.targetInput, readOnly && styles.inputDisabled]}
            value={pNeeds}
            onChangeText={setPNeeds}
            inputMode="decimal"
            editable={!readOnly}
          />
        </View>
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>Wants %</Text>
          <TextInput
            style={[styles.input, styles.targetInput, readOnly && styles.inputDisabled]}
            value={pWants}
            onChangeText={setPWants}
            inputMode="decimal"
            editable={!readOnly}
          />
        </View>
        <View style={styles.targetRow}>
          <Text style={styles.targetLabel}>Savings & Debts %</Text>
          <TextInput
            style={[styles.input, styles.targetInput, readOnly && styles.inputDisabled]}
            value={pSd}
            onChangeText={setPSd}
            inputMode="decimal"
            editable={!readOnly}
          />
        </View>
        <Button title="Save targets" onPress={saveAutoPct} disabled={readOnly}/>
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
          onDeleteItem={(it) => delPlan(it.id)}
          newItem={newPlan}
          setNewItem={setNewPlan}
          onAddItem={saveNewPlan}
          total={totals.needs}
          readOnly={readOnly}
          accountOptions={accountOptions}
          allocationDrafts={allocationDrafts}
          onSelectAccount={(itemId, accountId) => patchAllocationDraft(itemId, {accountId})}
          isCompact={isCompact}
          onSaveSection={() => savePlanSection('NEED')}
          saveLabel="Save needs items"
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
          onDeleteItem={(it) => delPlan(it.id)}
          newItem={newPlan}
          setNewItem={setNewPlan}
          onAddItem={saveNewPlan}
          total={totals.wants}
          readOnly={readOnly}
          accountOptions={accountOptions}
          allocationDrafts={allocationDrafts}
          onSelectAccount={(itemId, accountId) => patchAllocationDraft(itemId, {accountId})}
          isCompact={isCompact}
          onSaveSection={() => savePlanSection('WANT')}
          saveLabel="Save wants items"
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
          onDeleteItem={(it) => delPlan(it.id)}
          newItem={newPlan}
          setNewItem={setNewPlan}
          onAddItem={saveNewPlan}
          total={totals.sd}
          readOnly={readOnly}
          accountOptions={accountOptions}
          allocationDrafts={allocationDrafts}
          onSelectAccount={(itemId, accountId) => patchAllocationDraft(itemId, {accountId})}
          isCompact={isCompact}
          onSaveSection={() => savePlanSection('SAVINGS_DEBT')}
          saveLabel="Save savings items"
        />
      </AccordionSection>

      <View style={styles.inline}>
        <Button title="Manage accounts" onPress={() => router.push('/(tabs)/accounts')}/>
        <Button title="Recurring templates" onPress={() => router.push('/(tabs)/recurring')}/>
      </View>
    </ScrollView>
  );
}

function PlanSection({
  group,
  items,
  onChangeItem,
  onDeleteItem,
  newItem,
  setNewItem,
  onAddItem,
  total,
  readOnly,
  accountOptions,
  allocationDrafts,
  onSelectAccount,
  isCompact,
  onSaveSection,
  saveLabel,
}: {
  group: PlanGroup;
  items: PlanItem[];
  onChangeItem: (it: PlanItem, patch: Partial<PlanItem>) => void;
  onDeleteItem: (it: PlanItem) => void;
  newItem: PlanItem;
  setNewItem: (it: PlanItem) => void;
  onAddItem: () => void;
  total: number;
  readOnly: boolean;
  accountOptions: AccountOption[];
  allocationDrafts: Record<string, {accountId: string}>;
  onSelectAccount: (itemId: string, accountId: string) => void;
  isCompact: boolean;
  onSaveSection?: () => void;
  saveLabel?: string;
}) {
  const itemsWithId = items.filter((it): it is PlanItem & {id: string} => Boolean(it.id));
  return (
    <View style={styles.sectionBody}>
      {!accountOptions.length ? (
        <Text style={styles.help}>Create an account in the Accounts tab to map items here.</Text>
      ) : null}
      {itemsWithId.map((it) => (
        <PlanItemRow
          key={it.id}
          item={it}
          onChange={(p) => onChangeItem(it, p)}
          onDelete={() => onDeleteItem(it)}
          accountOptions={accountOptions}
          selectedAccountId={allocationDrafts[it.id]?.accountId ?? ''}
          onSelectAccount={(accountId) => onSelectAccount(it.id, accountId)}
          disabled={readOnly}
          isCompact={isCompact}
        />
      ))}
      {!readOnly ? (
        <EditRow
          addMode
          name={newItem.group === group ? newItem.name : ''}
          amount={newItem.group === group ? newItem.amount : 0}
          onChange={(p) => setNewItem({...newItem, group, ...p})}
          onSave={onAddItem}
          saveLabel="Add"
        />
      ) : null}
      {!readOnly && onSaveSection ? (
        <Button title={saveLabel ?? 'Save items'} onPress={onSaveSection}/>
      ) : null}
      <Text style={styles.help}>Subtotal: {fmtMoney(total)}</Text>
    </View>
  );
}

type AccountOption = {label: string; value: string; archived?: boolean};

function PlanItemRow({
  item,
  onChange,
  onDelete,
  accountOptions,
  selectedAccountId,
  onSelectAccount,
  disabled,
  isCompact,
}: {
  item: PlanItem & {id: string};
  onChange: (patch: Partial<PlanItem>) => void;
  onDelete: () => void;
  accountOptions: AccountOption[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  disabled: boolean;
  isCompact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    accountOptions.find((option) => option.value === selectedAccountId)?.label ??
    (selectedAccountId ? 'Unknown account' : undefined);
  const hasAccounts = accountOptions.length > 0;
  return (
    <View style={[styles.planRow, isCompact && styles.planRowStack]}>
      <TextInput
        style={[styles.input, styles.planName, isCompact && styles.fullWidth, disabled && styles.inputDisabled]}
        placeholder="Name"
        value={item.name}
        onChangeText={(text) => onChange({name: text})}
        editable={!disabled}
      />
      <TextInput
        style={[styles.input, styles.planAmount, isCompact && styles.fullWidth, disabled && styles.inputDisabled]}
        keyboardType="numeric"
        inputMode="decimal"
        placeholder="0"
        value={String(item.amount || '')}
        onChangeText={(text) => onChange({amount: parseMoney(text)})}
        editable={!disabled}
      />
      <View style={[styles.dropdownWrap, isCompact && styles.fullWidth]}>
        <Pressable
          style={[
            styles.dropdownTrigger,
            (!hasAccounts || disabled) && styles.dropdownDisabled,
            isCompact && styles.fullWidth,
          ]}
          disabled={!hasAccounts || disabled}
          onPress={() => hasAccounts && !disabled && setOpen((v) => !v)}
        >
          <Text
            style={[styles.dropdownText, !selectedAccountId && styles.dropdownPlaceholder]}
            numberOfLines={1}
          >
            {selectedLabel ?? (hasAccounts ? 'Select account' : 'No accounts')}
          </Text>
          <Text style={styles.dropdownChevron}>{open ? '▴' : '▾'}</Text>
        </Pressable>
        {open && hasAccounts ? (
          <View style={styles.dropdownMenu}>
            <Pressable
              style={[styles.dropdownOption, !selectedAccountId && styles.dropdownOptionActive]}
              onPress={() => {
                onSelectAccount('');
                setOpen(false);
              }}
            >
              <Text
                style={[
                  styles.dropdownOptionText,
                  !selectedAccountId && styles.dropdownOptionTextActive,
                ]}
              >
                Unassigned
              </Text>
            </Pressable>
            {accountOptions.map((option) => {
              const active = option.value === selectedAccountId;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                  onPress={() => {
                    onSelectAccount(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      {!disabled ? (
        <View style={[styles.actionRow, isCompact && styles.fullWidth]}>
          <Pressable
            style={({pressed}) => [styles.btn, styles.del, pressed && styles.btnPressed]}
            onPress={onDelete}
          >
            <Text style={styles.btnText}>Del</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function planGroupToWalletTag(group: PlanGroup): WalletTag {
  if (group === 'NEED') return 'NEEDS';
  if (group === 'WANT') return 'WANTS';
  return 'SAVINGS';
}

const styles = StyleSheet.create({
  container: {padding: 16, gap: 16, width: '100%'},
  containerWide: {maxWidth: 1100, alignSelf: 'center'},
  h1: {fontSize: 22, fontWeight: '700'},
  h2: {fontSize: 16, fontWeight: '700', marginBottom: 8},
  rowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10},
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
  sectionBody: {gap: 8},
  inline: {flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap'},
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputDisabled: {backgroundColor: '#F3F4F6', color: '#6B7280'},
  targetRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap'},
  targetLabel: {fontSize: 13, color: '#111827', fontWeight: '600'},
  targetInput: {width: 120, textAlign: 'right'},
  planRow: {flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'},
  planRowStack: {flexDirection: 'column', alignItems: 'stretch'},
  planName: {flexGrow: 1, minWidth: 180},
  planAmount: {width: 120, minWidth: 120, textAlign: 'right'},
  fullWidth: {width: '100%'},
  dropdownWrap: {minWidth: 180, flexGrow: 1},
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dropdownDisabled: {backgroundColor: '#F3F4F6'},
  dropdownText: {fontSize: 13, color: '#111827'},
  dropdownPlaceholder: {color: '#9CA3AF'},
  dropdownChevron: {fontSize: 12, color: '#6B7280'},
  dropdownMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    zIndex: 10,
    elevation: 2,
  },
  dropdownOption: {paddingHorizontal: 10, paddingVertical: 8},
  dropdownOptionActive: {backgroundColor: '#EEF2FF'},
  dropdownOptionText: {fontSize: 13, color: '#374151'},
  dropdownOptionTextActive: {color: '#1E3A8A', fontWeight: '700'},
  actionRow: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 64,
    alignItems: 'center',
    cursor: 'pointer',
  },
  save: {backgroundColor: '#10B981'},
  del: {backgroundColor: '#EF4444'},
  btnPressed: {opacity: 0.85},
  btnText: {color: '#fff', fontWeight: '700'},
});
