import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { useAuthUser } from '@/providers/AuthProvider';
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
import { cn } from '@/lib/cn';

type AccountDraft = {
  name: string;
  type: WalletType;
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
  const uid = useAuthUser()?.uid;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPid] = useState(periodIdFromDate());
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allTimeAllocations, setAllTimeAllocations] = useState<(Allocation & { periodId: string })[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AccountDraft>({ name: '', type: 'BANK' });
  const [editing, setEditing] = useState<EditingAccount | null>(null);

  useEffect(() => {
    if (!uid) return;
    return watchAccounts(uid, setAccounts, { includeArchived: true });
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchAllocations(uid, selectedPid, (rows) => setAllocations(rows));
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
    return (editing.openingBalance || 0) + editingAllocated;
  }, [editing, editingAllocated]);

  function railColor(type?: WalletType) {
    if (type === 'BANK') return 'bg-blue-500';
    if (type === 'MOMO') return 'bg-emerald-500';
    if (type === 'CASH') return 'bg-amber-500';
    return 'bg-zinc-500';
  }

  async function createAccount() {
    if (!uid || !draft.name.trim()) return;
    await addAccount(uid, {
      name: draft.name.trim(),
      type: draft.type,
      openingBalance: 0,
      dailyReminderEnabled: false,
      archived: false,
      currencyCode: 'GHS',
    });
    setDraft((prev) => ({ ...prev, name: '' }));
    setShowCreate(false);
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
    await updateAccount(uid, editing.id, {
      name: editing.name.trim(),
      type: editing.type,
      openingBalance: editing.openingBalance || 0,
      dailyReminderEnabled: editing.dailyReminderEnabled,
      archived: editing.archived,
    });
    setEditing(null);
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Accounts</Text>
        <Text className="text-sm text-muted-foreground">Manage your wallets and reminder preferences.</Text>
      </View>

      <View className="flex-row items-center justify-end">
        <AppButton onPress={() => setShowCreate((prev) => !prev)}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name={showCreate ? 'close' : 'plus'} size={18} color="#FFFFFF" />
            <Text className="text-sm font-medium text-primary-foreground">{showCreate ? 'Close' : 'Add Account'}</Text>
          </View>
        </AppButton>
      </View>

      {showCreate ? (
        <AppCard className="gap-3">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Add New Account</Text>
          <AppInput value={draft.name} onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))} placeholder="Wallet name" />
          <AppSegmented
            value={draft.type}
            compact
            onChange={(value) => setDraft((prev) => ({ ...prev, type: value as WalletType }))}
            options={walletTypeOptions.map((value) => ({ label: value, value }))}
          />
          <View className="flex-row gap-2">
            <AppButton onPress={createAccount}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
                <Text className="text-sm font-medium text-primary-foreground">Create</Text>
              </View>
            </AppButton>
            <AppButton variant="outline" onPress={() => setShowCreate(false)}>
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Cancel</Text>
            </AppButton>
          </View>
        </AppCard>
      ) : null}

      {editing ? (
        <AppCard className="gap-3">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Edit Account</Text>
          <AppInput
            value={editing.name}
            onChangeText={(value) => setEditing((prev) => (prev ? { ...prev, name: value } : prev))}
            placeholder="Wallet name"
          />
          <AppSegmented
            value={editing.type}
            compact
            onChange={(value) => setEditing((prev) => (prev ? { ...prev, type: value as WalletType } : prev))}
            options={walletTypeOptions.map((value) => ({ label: value, value }))}
          />
          <AppInput
            value={String(editing.openingBalance || '')}
            onChangeText={(value) =>
              setEditing((prev) => (prev ? { ...prev, openingBalance: parseMoney(value) } : prev))
            }
            keyboardType="decimal-pad"
            placeholder="Opening balance"
          />
          <View className="flex-row flex-wrap gap-2">
            <AppBadge label={`Opening ${fmtMoney(editing.openingBalance || 0)}`} variant="outline" />
            <AppBadge label={`Allocated ${fmtMoney(editingAllocated)}`} variant="outline" />
            <AppBadge label={`Remaining ${fmtMoney(editingRemaining)}`} variant="outline" />
          </View>

          <View className="flex-row items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="bell-outline" size={16} color="#717182" />
              <Text className="text-sm text-muted-foreground">Daily reminder</Text>
            </View>
            <Switch
              value={editing.dailyReminderEnabled}
              onValueChange={(value) => setEditing((prev) => (prev ? { ...prev, dailyReminderEnabled: value } : prev))}
            />
          </View>

          <View className="flex-row gap-2">
            <AppButton onPress={saveEditingAccount}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" />
                <Text className="text-sm font-medium text-primary-foreground">Save</Text>
              </View>
            </AppButton>
            <AppButton
              variant="outline"
              onPress={() => setEditing((prev) => (prev ? { ...prev, archived: !prev.archived } : prev))}
            >
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{editing.archived ? 'Unarchive' : 'Archive'}</Text>
            </AppButton>
            <AppButton variant="outline" onPress={() => setEditing(null)}>
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Cancel</Text>
            </AppButton>
          </View>
        </AppCard>
      ) : null}

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((row) => {
          const id = row.id ?? '';
          const allocated = totalByAccount.get(id) ?? 0;
          const computed = (row.openingBalance || 0) + allocated;
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
                            openingBalance: row.openingBalance || 0,
                            archived: row.archived === true,
                            dailyReminderEnabled: reminderEnabled,
                          })
                        }
                      />
                      <IconActionButton icon="trash-can-outline" label="Delete account" variant="danger" onPress={() => removeAccount(row)} />
                    </View>
                  </View>

                  <Text className={cn('mt-2 text-3xl font-bold', computed < 0 ? 'text-red-600 dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>
                    {fmtMoney(computed)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">Opening: {fmtMoney(row.openingBalance || 0)}</Text>
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
    </ScrollView>
  );
}
