import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { AppModal } from '@/components/ui/AppModal';
import { useAuthUser } from '@/providers/AuthProvider';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { fmtMoney, parseMoney } from '@/lib/format';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { walletTypeOptions, type WalletType } from '@/lib/domain';
import {
  addAccount,
  type Account,
  updateAccount,
  watchAccounts,
} from '@/lib/repo/accounts';
import { type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { type Tx, watchTransactions } from '@/lib/repo/transactions';
import { watchIncomeItems } from '@/lib/repo/income';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import {
  clearAccountPeriodCurrentManual,
  setAccountPeriodCurrentManual,
  watchAccountPeriodOverridesForPeriod,
} from '@/lib/repo/accountPeriodOverrides';
import { cn } from '@/lib/cn';
import { useAccountViewModels } from '@/lib/view-models/useAccountViewModels';

type AccountDraft = {
  name: string;
  type: WalletType;
  openingBalance: number;
  dailyReminderEnabled: boolean;
};

type EditingAccount = {
  id: string;
  name: string;
  type: WalletType;
  openingBalance: number;
  archived: boolean;
  dailyReminderEnabled: boolean;
};

export default function AccountsScreen() {
  const user = useAuthUser();
  const uid = useWorkspaceUid();
  const { activePeriodId } = useWorkspace();
  const [selectedPid, setSelectedPid] = useState(activePeriodId || periodIdFromDate());

  useEffect(() => {
    setSelectedPid(activePeriodId || periodIdFromDate());
  }, [activePeriodId]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [currentManualByAccountId, setCurrentManualByAccountId] = useState<Record<string, number>>({});
  const [allPeriods, setAllPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [allTransactionsByPeriod, setAllTransactionsByPeriod] = useState<Record<string, Tx[]>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [draft, setDraft] = useState<AccountDraft>({
    name: '',
    type: 'BANK',
    openingBalance: 0,
    dailyReminderEnabled: false,
  });

  const [editing, setEditing] = useState<EditingAccount | null>(null);
  const [editError, setEditError] = useState('');

  const [detailsAccountId, setDetailsAccountId] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAccountId, setAdjustAccountId] = useState('');
  const [adjustCurrentDraft, setAdjustCurrentDraft] = useState('');
  const [adjustCurrentError, setAdjustCurrentError] = useState('');
  const [adjustingCurrent, setAdjustingCurrent] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchAccounts(uid, setAccounts, { includeArchived: true });
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchAllocations(uid, selectedPid, (rows) => setAllocations(rows));
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchTransactions(uid, selectedPid, setTransactions);
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) {
      setCurrentManualByAccountId({});
      return;
    }
    return watchAccountPeriodOverridesForPeriod(uid, selectedPid, setCurrentManualByAccountId);
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, items) => {
      setPlanItems(items);
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchIncomeItems(uid, selectedPid, (_items, activeTotal) => {
      setIncomeTotal(activeTotal);
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid) {
      setAllPeriods([]);
      return;
    }
    return watchPeriods(uid, setAllPeriods);
  }, [uid]);

  const allPeriodIdsKey = useMemo(
    () => allPeriods.map((row) => row.id).sort((a, b) => a.localeCompare(b)).join('|'),
    [allPeriods]
  );

  useEffect(() => {
    if (!uid || !allPeriods.length) {
      setAllTransactionsByPeriod({});
      return;
    }

    const periodIds = allPeriods.map((row) => row.id);
    setAllTransactionsByPeriod((prev) => {
      const next: Record<string, Tx[]> = {};
      periodIds.forEach((pid) => {
        next[pid] = prev[pid] ?? [];
      });
      return next;
    });

    const unsubs = periodIds.map((pid) =>
      watchTransactions(uid, pid, (rows) => {
        setAllTransactionsByPeriod((prev) => ({
          ...prev,
          [pid]: rows,
        }));
      })
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [allPeriodIdsKey, allPeriods, uid]);

  const allTransactions = useMemo(() => Object.values(allTransactionsByPeriod).flat(), [allTransactionsByPeriod]);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((row) => {
      if (!row.id) return;
      map.set(row.id, row);
    });
    return map;
  }, [accounts]);

  const { rows: accountRows, byAccountId } = useAccountViewModels({
    accounts,
    periodId: selectedPid,
    planItems,
    allocations,
    periodTransactions: transactions,
    allTransactions,
    incomeTotal,
    currentManualByAccountId,
  });

  const details = detailsAccountId ? byAccountId.get(detailsAccountId) ?? null : null;
  const editingVm = editing ? byAccountId.get(editing.id) ?? null : null;
  const adjustVm = adjustAccountId ? byAccountId.get(adjustAccountId) ?? null : null;

  function resetDraft() {
    setDraft({
      name: '',
      type: 'BANK',
      openingBalance: 0,
      dailyReminderEnabled: false,
    });
    setCreateError('');
  }

  async function createAccount() {
    if (!uid) return;
    if (!draft.name.trim()) {
      setCreateError('Account name is required.');
      return;
    }
    await addAccount(uid, {
      name: draft.name.trim(),
      type: draft.type,
      openingBalance: draft.openingBalance || 0,
      dailyReminderEnabled: draft.dailyReminderEnabled,
      archived: false,
      currencyCode: 'GHS',
    });
    resetDraft();
    setCreateOpen(false);
  }

  async function toggleReminder(accountId: string, enabled: boolean) {
    if (!uid || !accountId) return;
    await updateAccount(uid, accountId, { dailyReminderEnabled: enabled });
  }

  function openEditing(accountId: string) {
    const account = accountById.get(accountId);
    const accountVm = byAccountId.get(accountId);
    if (!account) return;
    const editableActualBalance = Number(accountVm?.cash.current ?? account.openingBalance ?? 0);
    setEditing({
      id: accountId,
      name: account.name,
      type: (account.type ?? 'OTHER') as WalletType,
      openingBalance: Number.isFinite(editableActualBalance) ? editableActualBalance : 0,
      archived: account.archived === true,
      dailyReminderEnabled: account.dailyReminderEnabled === true,
    });
    setEditError('');
  }

  async function saveEditingAccount() {
    if (!uid || !editing) return;
    if (!editing.name.trim()) {
      setEditError('Account name is required.');
      return;
    }
    const actualBalance = Number(editing.openingBalance) || 0;
    await updateAccount(uid, editing.id, {
      name: editing.name.trim(),
      type: editing.type,
      openingBalance: actualBalance,
      dailyReminderEnabled: editing.dailyReminderEnabled,
      archived: editing.archived,
    });
    if (selectedPid) {
      await setAccountPeriodCurrentManual(uid, {
        accountId: editing.id,
        periodId: selectedPid,
        currentManual: actualBalance,
        updatedBy: user?.uid || uid,
      });
    }
    setEditing(null);
    setEditError('');
  }

  function openAdjustCurrent(accountId: string) {
    const vm = byAccountId.get(accountId);
    if (!vm) return;
    setAdjustAccountId(accountId);
    setAdjustCurrentDraft(String(vm.cash.current));
    setAdjustCurrentError('');
    setAdjustOpen(true);
  }

  async function saveAdjustedCurrent() {
    if (!uid || !selectedPid || !adjustAccountId || adjustingCurrent) return;
    const raw = adjustCurrentDraft.trim();
    if (!raw) {
      setAdjustCurrentError('Current amount is required.');
      return;
    }
    const amount = parseMoney(raw);
    if (!Number.isFinite(amount)) {
      setAdjustCurrentError('Enter a valid amount.');
      return;
    }
    setAdjustingCurrent(true);
    try {
      await setAccountPeriodCurrentManual(uid, {
        accountId: adjustAccountId,
        periodId: selectedPid,
        currentManual: amount,
        updatedBy: user?.uid || uid,
      });
      setAdjustOpen(false);
      setAdjustCurrentError('');
    } catch (e: unknown) {
      setAdjustCurrentError(e instanceof Error ? e.message : 'Could not save current amount.');
    } finally {
      setAdjustingCurrent(false);
    }
  }

  async function resetAdjustedCurrent(accountId: string) {
    if (!uid || !selectedPid || !accountId) return;
    try {
      await clearAccountPeriodCurrentManual(uid, accountId, selectedPid);
      if (adjustAccountId === accountId) {
        setAdjustOpen(false);
        setAdjustCurrentError('');
      }
    } catch (e: unknown) {
      Alert.alert('Reset failed', e instanceof Error ? e.message : 'Could not reset current amount.');
    }
  }

  function railColor(type?: WalletType) {
    if (type === 'BANK') return 'bg-blue-500';
    if (type === 'MOMO') return 'bg-emerald-500';
    if (type === 'CASH') return 'bg-amber-500';
    return 'bg-zinc-500';
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Accounts</Text>
          <Text className="text-sm text-muted-foreground">
            Summary cards show key balances. Tap a card for full Cash and Budget details.
          </Text>
        </View>
        <AppButton onPress={() => setCreateOpen(true)}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text className="text-sm font-medium text-white">Add Account</Text>
          </View>
        </AppButton>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accountRows.map((row) => (
          <Pressable key={row.accountId || row.accountName} onPress={() => row.accountId && setDetailsAccountId(row.accountId)}>
            <AppCard className="overflow-hidden p-0">
              <View className="flex-row">
                <View className={cn('w-1', railColor(row.accountType))} />
                <View className="flex-1 gap-2 px-4 py-4">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{row.accountName}</Text>
                      <View className="mt-0.5 flex-row items-center gap-2">
                        <Text className="text-xs uppercase tracking-wider text-muted-foreground">{row.accountType ?? 'OTHER'}</Text>
                        {row.archived ? <AppBadge label="Archived" variant="secondary" /> : null}
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#717182" />
                  </View>

                  <View className="gap-0.5">
                    <Text className={cn('text-3xl font-bold', row.cash.current < 0 ? 'text-red-700 dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>
                      {fmtMoney(row.cash.current)}
                    </Text>
                    <Text className="text-xs text-muted-foreground">Current (Actual)</Text>
                  </View>

                  {row.cash.topUpNeeded > 0 ? (
                    <View className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 dark:border-amber-900 dark:bg-amber-950/30">
                      <Text className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        Remaining to be in this account: {fmtMoney(row.cash.topUpNeeded)}
                      </Text>
                    </View>
                  ) : null}

                  <View className="gap-1 rounded-md border border-border bg-muted/20 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Allocated</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.budget.allocated)}</Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Funded</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.budget.funded)}</Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Unfunded</Text>
                      <Text className={cn('text-xs font-medium', row.budget.unfunded > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground dark:text-zinc-50')}>
                        {fmtMoney(row.budget.unfunded)}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Spent (from this account)</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(row.budget.spentFrom)}</Text>
                    </View>
                  </View>

                </View>
              </View>
            </AppCard>
          </Pressable>
        ))}

        {!accountRows.length ? (
          <AppCard>
            <Text className="text-sm text-muted-foreground">No accounts yet. Add one to enable account tracking.</Text>
          </AppCard>
        ) : null}
      </View>

      <AppModal
        open={Boolean(details)}
        onClose={() => setDetailsAccountId('')}
        title={`Account Details · ${details?.accountName || ''}`}
      >
        {details ? (
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{details.accountName}</Text>
                <AppBadge label={details.accountType || 'OTHER'} variant="outline" />
                {details.archived ? <AppBadge label="Archived" variant="secondary" /> : null}
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="text-xs text-muted-foreground">Reminder</Text>
                <Switch
                  value={details.reminderEnabled}
                  onValueChange={(value) => void toggleReminder(details.accountId, value)}
                />
              </View>
            </View>

            <View className="gap-1 rounded-md border border-border bg-muted/20 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cash</Text>
              <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Current (Actual)</Text><Text className={cn('text-xs font-medium', details.cash.current < 0 ? 'text-red-700 dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>{fmtMoney(details.cash.current)}</Text></View>
              <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Expected (Funded - Spent from this account)</Text><Text className={cn('text-xs font-medium', details.cash.currentAuto < 0 ? 'text-red-700 dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>{fmtMoney(details.cash.currentAuto)}</Text></View>
              {details.cash.currentManual !== null ? (
                <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Manual Current Override</Text><Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(details.cash.currentManual)}</Text></View>
              ) : null}
              {details.cash.topUpNeeded > 0 ? (
                <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Remaining to be in this account</Text><Text className="text-xs font-medium text-amber-700 dark:text-amber-300">{fmtMoney(details.cash.topUpNeeded)}</Text></View>
              ) : null}
              <View className="mt-2 flex-row flex-wrap gap-2">
                <AppButton size="sm" variant="outline" label="Adjust Current" onPress={() => openAdjustCurrent(details.accountId)} />
                {details.cash.currentManual !== null ? (
                  <AppButton
                    size="sm"
                    variant="outline"
                    label="Reset to Auto"
                    onPress={() => void resetAdjustedCurrent(details.accountId)}
                  />
                ) : null}
              </View>
            </View>

            <View className="gap-1 rounded-md border border-border bg-muted/20 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Budget</Text>
              <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Allocated</Text><Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(details.budget.allocated)}</Text></View>
              <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Funded</Text><Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(details.budget.funded)}</Text></View>
              <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Spent (from this account)</Text><Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(details.budget.spentFrom)}</Text></View>
              <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Remaining (Funded - Spent from this account)</Text><Text className={cn('text-xs font-medium', details.budget.remaining < 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>{fmtMoney(details.budget.remaining)}</Text></View>
              <View className="flex-row items-center justify-between"><Text className="text-xs text-muted-foreground">Unfunded</Text><Text className={cn('text-xs font-medium', details.budget.unfunded > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground dark:text-zinc-50')}>{fmtMoney(details.budget.unfunded)}</Text></View>
              {details.assignedItems.length ? (
                <View className="mt-2 gap-1 rounded-md border border-border/60 bg-card px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/70">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned Budget Items</Text>
                  {details.assignedItems.map((item) => (
                    <View key={item.id} className="flex-row items-center justify-between gap-2">
                      <View className="flex-1">
                        <Text className="text-xs text-foreground dark:text-zinc-50">{item.name}</Text>
                        <Text className="text-[11px] text-muted-foreground">
                          Allocated {fmtMoney(item.allocated)} · Funded {fmtMoney(item.funded)} · Spent {fmtMoney(item.spent)}
                        </Text>
                      </View>
                      <Text className={cn('text-xs font-medium', item.remaining < 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>
                        {fmtMoney(item.remaining)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View className="flex-row justify-between gap-2">
              <AppButton variant="outline" label="Edit" onPress={() => openEditing(details.accountId)} />
              <AppButton variant="outline" label="Close" onPress={() => setDetailsAccountId('')} />
            </View>
          </View>
        ) : null}
      </AppModal>

      <AppModal
        open={adjustOpen}
        onClose={() => {
          if (adjustingCurrent) return;
          setAdjustOpen(false);
          setAdjustCurrentError('');
        }}
        title={`Adjust Current · ${adjustVm?.accountName || ''}`}
      >
        {adjustVm ? (
          <View className="gap-3">
            <View className="gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">Expected (Auto)</Text>
                <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(adjustVm.cash.currentAuto)}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">Current (Actual)</Text>
                <Text className={cn('text-xs font-medium', adjustVm.cash.current < 0 ? 'text-red-700 dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>
                  {fmtMoney(adjustVm.cash.current)}
                </Text>
              </View>
            </View>

            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Current (Actual) for {selectedPid}</Text>
              <AppInput
                value={adjustCurrentDraft}
                onChangeText={setAdjustCurrentDraft}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>

            {adjustCurrentError ? <Text className="text-xs text-destructive">{adjustCurrentError}</Text> : null}

            <View className="flex-row justify-between gap-2">
              <AppButton
                variant="outline"
                label="Reset to Auto"
                onPress={() => void resetAdjustedCurrent(adjustVm.accountId)}
              />
              <View className="flex-row gap-2">
                <AppButton
                  variant="outline"
                  label="Cancel"
                  onPress={() => setAdjustOpen(false)}
                  disabled={adjustingCurrent}
                />
                <AppButton
                  label={adjustingCurrent ? 'Saving...' : 'Save'}
                  onPress={() => void saveAdjustedCurrent()}
                  disabled={adjustingCurrent}
                />
              </View>
            </View>
          </View>
        ) : null}
      </AppModal>

      <AppModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetDraft();
        }}
        title="Add Account"
      >
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Name</Text>
            <AppInput value={draft.name} onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))} placeholder="Wallet name" />
          </View>

          <View className="gap-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Type</Text>
            <AppSegmented
              value={draft.type}
              compact
              onChange={(value) => setDraft((prev) => ({ ...prev, type: value as WalletType }))}
              options={walletTypeOptions.map((value) => ({ label: value, value }))}
            />
          </View>

          <View className="gap-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Opening Balance</Text>
            <AppInput
              value={String(draft.openingBalance || '')}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, openingBalance: parseMoney(value) }))}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>

          <View className="flex-row items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
            <Text className="text-sm text-muted-foreground">Daily balance reminder</Text>
            <Switch value={draft.dailyReminderEnabled} onValueChange={(value) => setDraft((prev) => ({ ...prev, dailyReminderEnabled: value }))} />
          </View>

          {createError ? <Text className="text-xs text-destructive">{createError}</Text> : null}

          <View className="flex-row justify-end gap-2">
            <AppButton variant="outline" onPress={() => setCreateOpen(false)} label="Cancel" />
            <AppButton onPress={createAccount} label="Create" />
          </View>
        </View>
      </AppModal>

      <AppModal
        open={Boolean(editing)}
        onClose={() => {
          setEditing(null);
          setEditError('');
        }}
        title="Edit Account"
      >
        {editing ? (
          <View className="gap-3">
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Name</Text>
              <AppInput
                value={editing.name}
                onChangeText={(value) => setEditing((prev) => (prev ? { ...prev, name: value } : prev))}
                placeholder="Wallet name"
              />
            </View>

            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Type</Text>
              <AppSegmented
                value={editing.type}
                compact
                onChange={(value) => setEditing((prev) => (prev ? { ...prev, type: value as WalletType } : prev))}
                options={walletTypeOptions.map((value) => ({ label: value, value }))}
              />
            </View>

            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Opening Balance (Actual)</Text>
              <AppInput
                value={String(editing.openingBalance || '')}
                onChangeText={(value) =>
                  setEditing((prev) => (prev ? { ...prev, openingBalance: parseMoney(value) } : prev))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>

            <View className="flex-row flex-wrap gap-2">
              <AppBadge label={`Current ${fmtMoney(editingVm?.cash.current || 0)}`} variant="outline" />
              <AppBadge label={`Allocated ${fmtMoney(editingVm?.budget.allocated || 0)}`} variant="outline" />
              <AppBadge label={`Funded ${fmtMoney(editingVm?.budget.funded || 0)}`} variant="outline" />
              <AppBadge label={`Spent From ${fmtMoney(editingVm?.budget.spentFrom || 0)}`} variant="outline" />
              <AppBadge label={`Top-up ${fmtMoney(editingVm?.cash.topUpNeeded || 0)}`} variant="outline" />
            </View>

            <View className="flex-row items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
              <Text className="text-sm text-muted-foreground">Daily reminder</Text>
              <Switch
                value={editing.dailyReminderEnabled}
                onValueChange={(value) => setEditing((prev) => (prev ? { ...prev, dailyReminderEnabled: value } : prev))}
              />
            </View>

            <View className="flex-row items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
              <Text className="text-sm text-muted-foreground">Archived</Text>
              <Switch
                value={editing.archived}
                onValueChange={(value) => setEditing((prev) => (prev ? { ...prev, archived: value } : prev))}
              />
            </View>

            {editError ? <Text className="text-xs text-destructive">{editError}</Text> : null}

            <View className="flex-row justify-end gap-2">
              <AppButton variant="outline" onPress={() => setEditing(null)} label="Cancel" />
              <AppButton onPress={saveEditingAccount} label="Save" />
            </View>
          </View>
        ) : null}
      </AppModal>
    </ScrollView>
  );
}
