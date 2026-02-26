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
import { type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { type Tx, watchTransactions } from '@/lib/repo/transactions';
import { watchIncomeItems } from '@/lib/repo/income';
import { type PlanGroup, type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { cn } from '@/lib/cn';
import { sumSpendingByAccount } from '@/lib/accounting';

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

type AssignedPlanItemRow = {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  remaining: number;
};

type SpendFlag = 'NOT_SPENT' | 'PARTIAL_SPENT' | 'SPENT';

const RECONCILE_PINNED_GROUP_ORDER: Record<PlanGroup, number> = {
  NEED: 0,
  SAVINGS_DEBT: 1,
  WANT: 2,
};

function computeSpendFlag(spent: number, planned: number): SpendFlag {
  const safeSpent = Math.max(0, Number(spent || 0));
  const safePlanned = Math.max(0, Number(planned || 0));
  if (safeSpent <= 0) return 'NOT_SPENT';
  if (safePlanned > 0 && safeSpent >= safePlanned) return 'SPENT';
  return 'PARTIAL_SPENT';
}

export default function AccountsScreen() {
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
    return watchTransactions(uid, selectedPid, setTransactions);
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

  const planAccountByItemId = useMemo(() => {
    const map = new Map<string, string>();
    allocations.forEach((row) => {
      if (row.sourceType !== 'PLAN') return;
      const sourceItemId = String(row.sourceItemId || '').trim();
      const accountId = String(row.accountId || '').trim();
      if (!sourceItemId || !accountId) return;
      map.set(sourceItemId, accountId);
    });
    return map;
  }, [allocations]);

  const planWithPriority = useMemo(() => {
    return planItems
      .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
      .map((row, index) => ({
        ...row,
        id: row.id!,
        priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : index + 1,
      }));
  }, [planItems]);

  const periodAllocatedByAccount = useMemo(() => {
    const map = new Map<string, number>();
    planWithPriority.forEach((row) => {
      const accountId = planAccountByItemId.get(row.id) || '';
      if (!accountId) return;
      map.set(accountId, (map.get(accountId) ?? 0) + Math.max(0, Number(row.amount || 0)));
    });
    return map;
  }, [planAccountByItemId, planWithPriority]);

  const periodSpentByPlanId = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((row) => {
      const planId = String(row.categoryId || '').trim();
      if (!planId) return;
      map.set(planId, (map.get(planId) ?? 0) + Math.max(0, Number(row.amount || 0)));
    });
    return map;
  }, [transactions]);

  const spendFlagByPlanId = useMemo(() => {
    const map = new Map<string, SpendFlag>();
    const itemIds = new Set<string>();
    planWithPriority.forEach((row) => itemIds.add(row.id));
    periodSpentByPlanId.forEach((_amount, itemId) => itemIds.add(itemId));
    itemIds.forEach((itemId) => {
      const spent = periodSpentByPlanId.get(itemId) ?? 0;
      const planned = planWithPriority.find((row) => row.id === itemId)?.amount ?? 0;
      map.set(itemId, computeSpendFlag(spent, planned));
    });
    return map;
  }, [periodSpentByPlanId, planWithPriority]);

  const fundingOrder = useMemo(() => {
    const rows = [...planWithPriority];
    rows.sort((a, b) => {
      const aSpendFlag = spendFlagByPlanId.get(a.id) || 'NOT_SPENT';
      const bSpendFlag = spendFlagByPlanId.get(b.id) || 'NOT_SPENT';
      const aPrioritized =
        aSpendFlag === 'PARTIAL_SPENT' || (a.reconcilePinned === true && aSpendFlag !== 'SPENT');
      const bPrioritized =
        bSpendFlag === 'PARTIAL_SPENT' || (b.reconcilePinned === true && bSpendFlag !== 'SPENT');
      if (aPrioritized !== bPrioritized) return aPrioritized ? -1 : 1;

      if (aPrioritized && bPrioritized) {
        const groupDiff = RECONCILE_PINNED_GROUP_ORDER[a.group] - RECONCILE_PINNED_GROUP_ORDER[b.group];
        if (groupDiff !== 0) return groupDiff;
      }

      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [planWithPriority, spendFlagByPlanId]);

  const fundedByPlanId = useMemo(() => {
    let remaining = Math.max(0, Number(incomeTotal || 0));
    const map = new Map<string, number>();
    fundingOrder.forEach((row) => {
      const amount = Math.max(0, Number(row.amount || 0));
      const funded = Math.min(amount, Math.max(remaining, 0));
      map.set(row.id, funded);
      remaining = Math.max(0, remaining - amount);
    });
    return map;
  }, [fundingOrder, incomeTotal]);

  const periodFundedByAccount = useMemo(() => {
    const map = new Map<string, number>();
    planWithPriority.forEach((row) => {
      const accountId = planAccountByItemId.get(row.id) || '';
      if (!accountId) return;
      map.set(accountId, (map.get(accountId) ?? 0) + (fundedByPlanId.get(row.id) ?? 0));
    });
    return map;
  }, [fundedByPlanId, planAccountByItemId, planWithPriority]);

  const periodSpentByAccount = useMemo(() => {
    if (!selectedPid) return new Map<string, number>();
    return sumSpendingByAccount(
      transactions.map((row) => ({ ...row, periodId: selectedPid })),
      allocations.map((row) => ({ ...row, periodId: selectedPid }))
    );
  }, [allocations, selectedPid, transactions]);

  const assignedPlanItemsByAccount = useMemo(() => {
    const map = new Map<string, AssignedPlanItemRow[]>();
    planWithPriority.forEach((row) => {
      const accountId = planAccountByItemId.get(row.id) || '';
      if (!accountId) return;
      const spent = periodSpentByPlanId.get(row.id) ?? 0;
      const funded = fundedByPlanId.get(row.id) ?? 0;
      const allocated = Math.max(0, Number(row.amount || 0));

      const entry: AssignedPlanItemRow = {
        id: row.id,
        name: row.name || 'Budget item',
        allocated,
        spent,
        remaining: funded - spent,
      };

      const current = map.get(accountId) ?? [];
      current.push(entry);
      map.set(accountId, current);
    });

    map.forEach((rows, accountId) => {
      rows.sort((a, b) => a.name.localeCompare(b.name));
      map.set(accountId, rows);
    });
    return map;
  }, [fundedByPlanId, periodSpentByPlanId, planAccountByItemId, planWithPriority]);

  const assignedItemsViewerRows = useMemo(() => {
    if (!assignedItemsViewer) return [];
    return assignedPlanItemsByAccount.get(assignedItemsViewer.accountId) ?? [];
  }, [assignedItemsViewer, assignedPlanItemsByAccount]);

  const editingAllocated = useMemo(() => {
    if (!editing) return 0;
    return periodAllocatedByAccount.get(editing.id) ?? 0;
  }, [periodAllocatedByAccount, editing]);

  const editingFunded = useMemo(() => {
    if (!editing) return 0;
    return periodFundedByAccount.get(editing.id) ?? 0;
  }, [periodFundedByAccount, editing]);

  const editingSpent = useMemo(() => {
    if (!editing) return 0;
    return periodSpentByAccount.get(editing.id) ?? 0;
  }, [periodSpentByAccount, editing]);

  const editingRemaining = useMemo(() => {
    if (!editing) return 0;
    return editingFunded - editingSpent;
  }, [editingFunded, editingSpent, editing]);

  const editingUnfunded = useMemo(() => {
    if (!editing) return 0;
    return editingAllocated - editingFunded;
  }, [editingAllocated, editingFunded, editing]);

  function railColor(type?: WalletType) {
    if (type === 'BANK') return 'bg-blue-500';
    if (type === 'MOMO') return 'bg-emerald-500';
    if (type === 'CASH') return 'bg-amber-500';
    return 'bg-zinc-500';
  }

  function isNearEqual(a: number, b: number) {
    return Math.abs(a - b) < 0.0001;
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
      openingBalance: editing.currentAmount || 0,
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
          const allocatedAmount = periodAllocatedByAccount.get(id) ?? 0;
          const fundedAmount = periodFundedByAccount.get(id) ?? 0;
          const spentAmount = periodSpentByAccount.get(id) ?? 0;
          const currentAmount = Number(row.openingBalance || 0);
          const remainingTarget = fundedAmount - spentAmount;
          const isDeficit = remainingTarget > currentAmount;
          const isSurplus = remainingTarget < currentAmount;
          const remainingAmount = isDeficit
            ? -Math.abs(remainingTarget - currentAmount)
            : isSurplus
              ? remainingTarget + currentAmount
              : remainingTarget;
          const unfundedAmount = allocatedAmount - fundedAmount;
          const remainingColorClass = isDeficit
            ? 'text-red-700 dark:text-red-300'
            : isSurplus
              ? 'text-emerald-700 dark:text-emerald-300'
              : isNearEqual(fundedAmount, remainingTarget)
                ? 'text-foreground dark:text-zinc-50'
                : 'text-amber-700 dark:text-amber-300';
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
                            currentAmount,
                            archived: row.archived === true,
                            dailyReminderEnabled: reminderEnabled,
                          })
                        }
                      />
                      <IconActionButton icon="trash-can-outline" label="Delete account" variant="danger" onPress={() => removeAccount(row)} />
                    </View>
                  </View>

                  <Text className={cn('mt-2 text-3xl font-bold', remainingColorClass)}>
                    {fmtMoney(remainingAmount)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Remaining Amount (Funded - Spent{isDeficit ? ' · Deficit' : isSurplus ? ' · Surplus' : ''})
                  </Text>

                  <View className="mt-1 gap-1 rounded-md border border-border bg-muted/20 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Allocated</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(allocatedAmount)}</Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Funded</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(fundedAmount)}</Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Spent</Text>
                      <Text className="text-xs font-medium text-foreground dark:text-zinc-50">{fmtMoney(spentAmount)}</Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Remaining</Text>
                      <Text className={cn('text-xs font-medium', remainingColorClass)}>{fmtMoney(remainingAmount)}</Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Unfunded</Text>
                      <Text
                        className={cn(
                          'text-xs font-medium',
                          unfundedAmount > 0
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-foreground dark:text-zinc-50'
                        )}
                      >
                        {fmtMoney(unfundedAmount)}
                      </Text>
                    </View>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="text-xs text-muted-foreground">Current</Text>
                      <Text
                        className={cn(
                          'text-xs font-medium',
                          currentAmount < 0
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-foreground dark:text-zinc-50'
                        )}
                      >
                        {fmtMoney(currentAmount)}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-1 flex-row items-center justify-between rounded-md border border-border bg-muted/20 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <Text className="text-xs text-muted-foreground">Assigned items {assignedItems.length}</Text>
                    <IconActionButton
                      icon="eye-outline"
                      label="View assigned items"
                      onPress={() => row.id && setAssignedItemsViewer({ accountId: row.id, accountName: row.name })}
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
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Current Amount (Real)</Text>
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
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Current Amount (Real)</Text>
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
              <AppBadge label={`Funded ${fmtMoney(editingFunded)}`} variant="outline" />
              <AppBadge label={`Spent ${fmtMoney(editingSpent)}`} variant="outline" />
              <AppBadge label={`Remaining ${fmtMoney(editingRemaining)}`} variant="outline" />
              <AppBadge label={`Unfunded ${fmtMoney(editingUnfunded)}`} variant="outline" />
              <AppBadge label={`Current ${fmtMoney(editing.currentAmount || 0)}`} variant="outline" />
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
              <View key={item.id} className="gap-1 rounded-md border border-border bg-muted/20 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
                  {item.name}
                </Text>
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-xs text-muted-foreground">
                    Allocated {fmtMoney(item.allocated)} · Spent {fmtMoney(item.spent)}
                  </Text>
                  <Text
                    className={cn(
                      'text-sm font-semibold',
                      item.remaining < 0 ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
                    )}
                  >
                    {fmtMoney(item.remaining)}
                  </Text>
                </View>
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
