import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
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
  archiveAccount,
  deleteAccount,
  type Account,
  updateAccount,
  watchAccounts,
} from '@/lib/repo/accounts';
import { listAllAllocations, type Allocation, watchAllocations } from '@/lib/repo/allocations';
import { setReminderSettings, watchReminderSettings } from '@/lib/repo/settings';
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
};

export default function AccountsScreen() {
  const user = useAuthUser();
  const uid = user?.uid;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPid] = useState(periodIdFromDate());
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allTimeAllocations, setAllTimeAllocations] = useState<(Allocation & { periodId: string })[]>([]);

  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(false);
  const [dailyReminderEmail, setDailyReminderEmail] = useState('');
  const [dailyReminderHourUtc, setDailyReminderHourUtc] = useState('07');

  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<AccountDraft>({
    name: '',
    type: 'BANK',
  });
  const [editing, setEditing] = useState<EditingAccount | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unAccounts = watchAccounts(uid, setAccounts, { includeArchived: true });
    const unReminders = watchReminderSettings(uid, (settings) => {
      setDailyReminderEnabled(settings.dailyBalanceReminderEnabled === true);
      setDailyReminderEmail(settings.dailyBalanceReminderEmail ?? user?.email ?? '');
      setDailyReminderHourUtc(String(settings.dailyBalanceReminderHourUtc ?? 7).padStart(2, '0'));
    });

    return () => {
      unAccounts();
      unReminders();
    };
  }, [uid, user?.email]);

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
    return 'bg-slate-500';
  }

  async function createAccount() {
    if (!uid || !draft.name.trim()) return;
    await addAccount(uid, {
      name: draft.name.trim(),
      type: draft.type,
      openingBalance: 0,
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

  async function saveEditingAccount() {
    if (!uid || !editing) return;
    await updateAccount(uid, editing.id, {
      name: editing.name.trim(),
      type: editing.type,
      openingBalance: editing.openingBalance || 0,
    });
    setEditing(null);
  }

  async function saveReminders() {
    if (!uid) return;
    await setReminderSettings(uid, {
      dailyBalanceReminderEnabled: dailyReminderEnabled,
      dailyBalanceReminderEmail: dailyReminderEmail.trim() || user?.email || '',
      dailyBalanceReminderHourUtc: Number(dailyReminderHourUtc) || 7,
    });
    Alert.alert('Saved', 'Reminder settings are saved to Firestore.');
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-slate-100">Accounts</Text>
        <Text className="text-sm text-muted-foreground">
          Remaining balance updates when account details change.
        </Text>
      </View>

      <View className="flex-row items-center justify-end">
        <AppButton onPress={() => setShowCreate((prev) => !prev)}>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name={showCreate ? 'close' : 'plus'} size={18} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-primary-foreground dark:text-slate-900">
              {showCreate ? 'Close' : 'Add Account'}
            </Text>
          </View>
        </AppButton>
      </View>

      {showCreate ? (
        <AppCard className="gap-3">
          <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Add New Account</Text>
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
                <Text className="text-sm font-semibold text-primary-foreground dark:text-slate-900">Create</Text>
              </View>
            </AppButton>
            <AppButton variant="outline" onPress={() => setShowCreate(false)}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Cancel</Text>
              </View>
            </AppButton>
          </View>
        </AppCard>
      ) : null}

      {editing ? (
        <AppCard className="gap-3">
          <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Edit Account</Text>
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
          <View className="flex-row gap-2">
            <AppButton onPress={saveEditingAccount}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-primary-foreground dark:text-slate-900">Save</Text>
              </View>
            </AppButton>
            <AppButton variant="outline" onPress={() => setEditing(null)}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Cancel</Text>
              </View>
            </AppButton>
          </View>
        </AppCard>
      ) : null}

      <View className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((row) => {
          const id = row.id ?? '';
          const allocated = totalByAccount.get(id) ?? 0;
          const computed = (row.openingBalance || 0) + allocated;

          return (
            <AppCard key={id || row.name} className="overflow-hidden p-0">
              <View className="flex-row">
                <View className={cn('w-1', railColor(row.type))} />
                <View className="flex-1 gap-3 p-4">
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground dark:text-slate-100">{row.name}</Text>
                      <Text className="text-xs uppercase tracking-wider text-muted-foreground">{row.type ?? 'OTHER'}</Text>
                    </View>
                    <View className="flex-row items-center gap-2">
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
                          })
                        }
                      />
                      <IconActionButton
                        icon={row.archived ? 'archive-arrow-up-outline' : 'archive-arrow-down-outline'}
                        label={row.archived ? 'Unarchive account' : 'Archive account'}
                        variant="muted"
                        onPress={() => row.id && uid && archiveAccount(uid, row.id, !row.archived)}
                      />
                      <IconActionButton icon="trash-can-outline" label="Delete account" variant="danger" onPress={() => removeAccount(row)} />
                    </View>
                  </View>

                  <Text className={cn('text-3xl font-bold', computed < 0 ? 'text-red-600 dark:text-red-300' : 'text-foreground dark:text-slate-100')}>
                    {fmtMoney(computed)}
                  </Text>

                  <View className="gap-1">
                    <Text className="text-xs text-muted-foreground">Opening: {fmtMoney(row.openingBalance || 0)}</Text>
                    <Text className="text-xs text-muted-foreground">Allocated: {fmtMoney(allocated)}</Text>
                  </View>

                  <View className="flex-row items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                    <Text className="text-xs text-muted-foreground">{row.archived ? 'Archived' : 'Active'}</Text>
                    <AppBadge label={row.archived ? 'Paused' : 'Live'} variant={row.archived ? 'secondary' : 'success'} />
                  </View>
                </View>
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

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-slate-100">Daily Balance Reminder</Text>
        <View className="flex-row items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
          <Text className="text-sm text-foreground dark:text-slate-100">Enable reminder email</Text>
          <Switch value={dailyReminderEnabled} onValueChange={setDailyReminderEnabled} />
        </View>
        <AppInput
          value={dailyReminderEmail}
          onChangeText={setDailyReminderEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
        />
        <AppInput
          value={dailyReminderHourUtc}
          onChangeText={(value) => setDailyReminderHourUtc(String(parseMoney(value)).padStart(2, '0').slice(0, 2))}
          keyboardType="number-pad"
          placeholder="UTC hour (0-23)"
        />
        <AppButton label="Save Reminder Settings" onPress={saveReminders} />
      </AppCard>
    </ScrollView>
  );
}
