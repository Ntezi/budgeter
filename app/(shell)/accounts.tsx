import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppModal } from '@/components/ui/AppModal';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { fmtMoney, parseMoney } from '@/lib/format';
import { periodIdFromDate } from '@/lib/repo/periods';
import { walletTypeOptions, type WalletType } from '@/lib/domain';
import {
  addAccount,
  deleteAccount,
  type Account,
  updateAccount,
  watchAccounts,
} from '@/lib/repo/accounts';
import { listAllAllocations, type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { watchIncomeItems, type IncomeItem } from '@/lib/repo/income';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { cn } from '@/lib/cn';

const GROUP_ORDER: Record<PlanItem['group'], number> = {
  NEED: 0,
  WANT: 1,
  SAVINGS_DEBT: 2,
};

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
  currentAmount: number;
  archived: boolean;
  dailyReminderEnabled: boolean;
};

export default function AccountsScreen() {
  const uid = useWorkspaceUid();
  const { activePeriodId } = useWorkspace();
  const [selectedPid, setSelectedPid] = useState(activePeriodId || periodIdFromDate());

  useEffect(() => {
    setSelectedPid(activePeriodId || periodIdFromDate());
  }, [activePeriodId]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allTimeAllocations, setAllTimeAllocations] = useState<(Allocation & { periodId: string })[]>([]);
  const [periodIncomeItems, setPeriodIncomeItems] = useState<IncomeItem[]>([]);
  const [periodActiveIncomeTotal, setPeriodActiveIncomeTotal] = useState(0);
  const [periodPlanItems, setPeriodPlanItems] = useState<PlanItem[]>([]);

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
  const [assignedItemsViewer, setAssignedItemsViewer] = useState<{ accountId: string; accountName: string } | null>(null);

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
    const unIncome = watchIncomeItems(uid, selectedPid, (rows, activeTotal) => {
      setPeriodIncomeItems(rows);
      setPeriodActiveIncomeTotal(activeTotal);
    });
    const unPlan = watchPlanTotals(uid, selectedPid, (_totals, rows) => setPeriodPlanItems(rows));
    return () => {
      unIncome();
      unPlan();
    };
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid) return;
    listAllAllocations(uid).then(setAllTimeAllocations);
  }, [uid, allocations]);

  const totalByAccount = useMemo(() => {
    const map = new Map<string, number>();
    allTimeAllocations.forEach((row) => {
      map.set(row.accountId, (map.get(row.accountId) ?? 0) + (row.amount || 0));
    });
    return map;
  }, [allTimeAllocations]);

  const editingAllocated = useMemo(() => {
    if (!editing) return 0;
    return totalByAccount.get(editing.id) ?? 0;
  }, [editing, totalByAccount]);

  const editingRemaining = useMemo(() => {
    if (!editing) return 0;
    return editing.currentAmount || 0;
  }, [editing]);

  const hasInactiveIncome = useMemo(() => periodIncomeItems.some((row) => row.active === false), [periodIncomeItems]);

  const planWithPriority = useMemo(
    () =>
      [...periodPlanItems]
        .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
        .map((row, index) => ({ ...row, priority: Number((row as any).priority) || index + 1 })),
    [periodPlanItems]
  );

  const fundingOrder = useMemo(() => {
    const rows = [...planWithPriority];
    if (hasInactiveIncome) {
      rows.sort((a, b) => {
        const groupDiff = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
        if (groupDiff !== 0) return groupDiff;
        return a.priority - b.priority;
      });
      return rows;
    }
    rows.sort((a, b) => a.priority - b.priority);
    return rows;
  }, [hasInactiveIncome, planWithPriority]);

  const unfundedByPlanId = useMemo(() => {
    const map = new Map<string, number>();
    let remaining = periodActiveIncomeTotal;
    fundingOrder.forEach((row) => {
      const amount = row.amount || 0;
      const funded = Math.min(amount, Math.max(remaining, 0));
      const unfunded = Math.max(0, amount - funded);
      map.set(row.id, unfunded);
      remaining = Math.max(0, remaining - amount);
    });
    return map;
  }, [fundingOrder, periodActiveIncomeTotal]);

  const periodAllocatedByAccount = useMemo(() => {
    const map = new Map<string, number>();
    allocations.forEach((row) => {
      map.set(row.accountId, (map.get(row.accountId) ?? 0) + (row.amount || 0));
    });
    return map;
  }, [allocations]);

  const unfundedDeductionByAccount = useMemo(() => {
    const map = new Map<string, number>();
    allocations.forEach((row) => {
      if (row.sourceType !== 'PLAN' || !row.sourceItemId) return;
      const unfunded = unfundedByPlanId.get(row.sourceItemId) ?? 0;
      if (unfunded <= 0) return;
      const deduction = Math.min(unfunded, row.amount || 0);
      map.set(row.accountId, (map.get(row.accountId) ?? 0) + deduction);
    });
    return map;
  }, [allocations, unfundedByPlanId]);

  const assignedPlanItemsByAccount = useMemo(() => {
    const map = new Map<string, { id: string; name: string; amount: number; unfunded: number }[]>();
    allocations.forEach((row) => {
      if (row.sourceType !== 'PLAN' || !row.accountId) return;
      const itemId = row.sourceItemId || '';
      const unfunded = itemId ? Math.min(unfundedByPlanId.get(itemId) ?? 0, row.amount || 0) : 0;
      const entry = {
        id: itemId || `allocation-${row.id || row.accountId}-${row.amount || 0}`,
        name: row.sourceItemName || 'Budget item',
        amount: row.amount || 0,
        unfunded,
      };
      const current = map.get(row.accountId) ?? [];
      current.push(entry);
      map.set(row.accountId, current);
    });
    map.forEach((rows, accountId) => {
      rows.sort((a, b) => a.name.localeCompare(b.name));
      map.set(accountId, rows);
    });
    return map;
  }, [allocations, unfundedByPlanId]);

  const assignedItemsViewerRows = useMemo(() => {
    if (!assignedItemsViewer) return [];
    return assignedPlanItemsByAccount.get(assignedItemsViewer.accountId) ?? [];
  }, [assignedItemsViewer, assignedPlanItemsByAccount]);

  function railColor(type?: WalletType) {
    if (type === 'BANK') return 'bg-blue-500';
    if (type === 'MOMO') return 'bg-emerald-500';
    if (type === 'CASH') return 'bg-amber-500';
    return 'bg-zinc-500';
  }

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

  async function removeAccount(row: Account) {
    if (!uid || !row.id) return;
    await deleteAccount(uid, row.id);
  }

  async function toggleReminder(row: Account, enabled: boolean) {
    if (!uid || !row.id) return;
    await updateAccount(uid, row.id, { dailyReminderEnabled: enabled });
  }

  async function saveEditingAccount() {
    if (!uid || !editing) return;
    if (!editing.name.trim()) {
      setEditError('Account name is required.');
      return;
    }
    await updateAccount(uid, editing.id, {
      name: editing.name.trim(),
      type: editing.type,
      openingBalance: (editing.currentAmount || 0) - editingAllocated,
      dailyReminderEnabled: editing.dailyReminderEnabled,
      archived: editing.archived,
    });
    setEditing(null);
    setEditError('');
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Accounts</Text>
          <Text className="text-sm text-muted-foreground">Manage wallets, balances, and daily reminder preferences.</Text>
        </View>
        <AppButton onPress={() => setCreateOpen(true)}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
            <Text className="text-sm font-medium text-white">Add Account</Text>
          </View>
        </AppButton>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((row) => {
          const id = row.id ?? '';
          const periodAllocated = periodAllocatedByAccount.get(id) ?? 0;
          const remainingUnfunded = hasInactiveIncome ? unfundedDeductionByAccount.get(id) ?? 0 : 0;
          const currentBalance = periodAllocated - remainingUnfunded;
          const assignedItems = assignedPlanItemsByAccount.get(id) ?? [];
          const reminderEnabled = row.dailyReminderEnabled === true;

          return (
            <AppCard key={id || row.name} className="overflow-hidden p-0">
              <View className="flex-row">
                <View className={cn('w-1', railColor(row.type))} />
                <View className="flex-1 gap-2 px-4 py-4">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground dark:text-zinc-50">{row.name}</Text>
                      <View className="mt-0.5 flex-row items-center gap-2">
                        <Text className="text-xs uppercase tracking-wider text-muted-foreground">{row.type ?? 'OTHER'}</Text>
                        {row.archived ? <AppBadge label="Archived" variant="secondary" /> : null}
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <IconActionButton
                        icon="pencil-outline"
                        label="Edit account"
                        onPress={() =>
                          row.id &&
                          setEditing({
                            id: row.id,
                            name: row.name,
                            type: (row.type ?? 'OTHER') as WalletType,
                            currentAmount: currentBalance,
                            archived: row.archived === true,
                            dailyReminderEnabled: reminderEnabled,
                          })
                        }
                      />
                      <IconActionButton icon="trash-can-outline" label="Delete account" variant="danger" onPress={() => removeAccount(row)} />
                    </View>
                  </View>

                  <Text className={cn('mt-2 text-3xl font-bold', currentBalance < 0 ? 'text-red-600 dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>
                    {fmtMoney(currentBalance)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Current Allocated
                  </Text>
                  <Text className="text-xs text-muted-foreground">Allocated this period {fmtMoney(periodAllocated)}</Text>
                  {hasInactiveIncome && remainingUnfunded > 0 ? (
                    <Text className="text-xs text-amber-700 dark:text-amber-300">
                      Remaining to fund {fmtMoney(remainingUnfunded)}
                    </Text>
                  ) : null}
                  <View className="mt-1 flex-row items-center justify-between rounded-md border border-border bg-muted/20 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <Text className="text-xs text-muted-foreground">
                      Assigned items {assignedItems.length}
                    </Text>
                    <IconActionButton
                      icon="eye-outline"
                      label="View assigned items"
                      onPress={() =>
                        row.id && setAssignedItemsViewer({ accountId: row.id, accountName: row.name })
                      }
                      disabled={!row.id}
                    />
                  </View>
                </View>
              </View>

              <View className="flex-row items-center justify-between border-t border-border bg-muted/30 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                <View className="flex-row items-center gap-2">
                  <MaterialCommunityIcons name="bell-outline" size={16} color="#717182" />
                  <Text className="text-sm text-muted-foreground">{reminderEnabled ? 'Reminders on' : 'Reminders off'}</Text>
                </View>
                <Switch value={reminderEnabled} onValueChange={(value) => toggleReminder(row, value)} />
              </View>
            </AppCard>
          );
        })}

        {!accounts.length ? (
          <AppCard>
            <Text className="text-sm text-muted-foreground">No accounts yet. Add one to enable wallet mapping.</Text>
          </AppCard>
        ) : null}
      </View>

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
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Current Amount Allocated</Text>
              <AppInput
                value={String(editing.currentAmount || '')}
                onChangeText={(value) =>
                  setEditing((prev) => (prev ? { ...prev, currentAmount: parseMoney(value) } : prev))
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>
            <View className="flex-row flex-wrap gap-2">
              <AppBadge label={`Allocated ${fmtMoney(editingAllocated)}`} variant="outline" />
              <AppBadge label={`Current ${fmtMoney(editingRemaining)}`} variant="outline" />
              <AppBadge label={`Remaining ${fmtMoney(editingAllocated - editingRemaining)}`} variant="outline" />
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

      <AppModal
        open={Boolean(assignedItemsViewer)}
        onClose={() => setAssignedItemsViewer(null)}
        title={`Assigned Items · ${assignedItemsViewer?.accountName || ''}`}
      >
        <View className="gap-2">
          {assignedItemsViewerRows.length ? (
            assignedItemsViewerRows.map((item) => (
              <View key={item.id} className="flex-row items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="flex-1 text-sm text-foreground dark:text-zinc-50" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(item.amount)}</Text>
                {item.unfunded > 0 ? (
                  <Text className="text-xs text-amber-700 dark:text-amber-300">+{fmtMoney(item.unfunded)}</Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text className="text-sm text-muted-foreground">No assigned budget items for this account in the current period.</Text>
          )}
          <View className="flex-row justify-end">
            <AppButton variant="outline" label="Close" onPress={() => setAssignedItemsViewer(null)} />
          </View>
        </View>
      </AppModal>
    </ScrollView>
  );
}
