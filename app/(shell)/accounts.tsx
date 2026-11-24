// BUDG-8 S8 Accounts (briefs/redesign/05): Balances list, account detail, Move money, add/edit sheets.
// Data and writes unchanged: subscriptions in useAccountsData (moved from this file), transfer writes in
// moveMoney (moved from saveTransfers), account and manual-balance writes below with the same payloads.
import React, { useMemo, useState } from 'react';
import { Pressable, Switch, Text, View, ScrollView, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AccountDetail } from '@/components/accounts/AccountDetail';
import { AccountsSegment } from '@/components/accounts/AccountsSegment';
import { MoveMoneyFields, MoveMoneyFooter, useMoveMoney, type MovePrefill } from '@/components/accounts/MoveMoney';
import { useAccountsData, useAccountsPeriod } from '@/components/accounts/useAccountsData';
import { useAddSheet } from '@/components/add/AddSheetContext';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState, LoadingState } from '@/components/patterns/States';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { cn } from '@/lib/cn';
import { walletTypeOptions, type WalletType } from '@/lib/domain';
import { fmtMoney, parseMoney } from '@/lib/format';
import { addAccount, updateAccount } from '@/lib/repo/accounts';
import { clearAccountPeriodCurrentManual, setAccountPeriodCurrentManual } from '@/lib/repo/accountPeriodOverrides';
import { monthTitle } from '@/lib/rules/months';
import type { AccountViewModel } from '@/lib/view-models/useAccountViewModels';
import { useAuthUser } from '@/providers/AuthProvider';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';

type AccountForm = {
  id: string; // '' = new
  name: string;
  type: WalletType;
  openingBalance: string;
  archived: boolean;
  dailyReminderEnabled: boolean;
};

const TYPE_LABEL: Record<WalletType, string> = { BANK: 'Bank', MOMO: 'Mobile money', CASH: 'Cash', OTHER: 'Other' };
const tabular = { fontVariant: ['tabular-nums' as const] };

function railColor(type?: WalletType) {
  if (type === 'BANK') return 'bg-blue-500';
  if (type === 'MOMO') return 'bg-emerald-500';
  if (type === 'CASH') return 'bg-amber-500';
  return 'bg-zinc-500';
}

function AccountRow({ vm, balance, selected, onPress }: { vm: AccountViewModel; balance: number; selected?: boolean; onPress: () => void }) {
  return (
    <View className={selected ? 'bg-muted/60 dark:bg-zinc-800/60' : undefined}>
      <ListRow
        testID={`account-row-${vm.accountId}`}
        title={vm.accountName}
        titleLines={2}
        sub={TYPE_LABEL[(vm.accountType ?? 'OTHER') as WalletType] ?? 'Other'}
        amount={fmtMoney(balance)}
        amountClassName={balance < 0 ? 'text-destructive dark:text-red-300' : undefined}
        onPress={onPress}
        left={<View className={cn('h-10 w-1 rounded-full', railColor(vm.accountType))} />}
      />
    </View>
  );
}

export default function AccountsScreen() {
  const user = useAuthUser();
  const uid = useWorkspaceUid();
  const pid = useAccountsPeriod();
  const data = useAccountsData(uid, pid);
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const { openAdd } = useAddSheet();
  const updatedBy = user?.uid || uid || '';
  const month = monthTitle(pid);

  const [desktopId, setDesktopId] = useState('');
  const [archivedOpen, setArchivedOpen] = useState(false);

  const moveSheet = useSheet();
  const [movePrefill, setMovePrefill] = useState<MovePrefill>({});
  const move = useMoveMoney({ active: moveSheet.open, uid, pid, data, prefill: movePrefill, updatedBy });

  const accountSheet = useSheet();
  const [form, setForm] = useState<AccountForm | null>(null);
  const [formError, setFormError] = useState('');
  const [archiveAsk, setArchiveAsk] = useState(false);

  const manualSheet = useSheet();
  const [manualId, setManualId] = useState('');
  const [manualDraft, setManualDraft] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualPending, setManualPending] = useState(false);

  const active = useMemo(() => data.accountRows.filter((r) => r.accountId && !r.archived), [data.accountRows]);
  const archived = useMemo(() => data.accountRows.filter((r) => r.accountId && r.archived), [data.accountRows]);
  // BUDG-40 F-1: the month's balance (cash.current, as the old screen); Home reads the same summary.
  const { total, overdrawn } = data.summary;
  const toMove = active.filter((r) => r.budget.unfunded > 0);

  const phoneId = typeof params.id === 'string' ? params.id : '';
  const selectedId = desktop ? desktopId || active[0]?.accountId || '' : phoneId;
  const selected = selectedId ? data.byAccountId.get(selectedId) ?? null : null;

  function openMove(e: unknown, toId?: string, fromId?: string) {
    setMovePrefill({ toId, fromId });
    moveSheet.show(e);
  }

  function select(id: string) {
    if (desktop) setDesktopId(id);
    else router.push(`/accounts?id=${encodeURIComponent(id)}` as any);
  }

  function openAccountForm(e: unknown, id?: string) {
    const account = id ? data.accountById.get(id) : undefined;
    setForm(
      account && id
        ? {
            id,
            name: account.name,
            type: (account.type ?? 'OTHER') as WalletType,
            openingBalance: String(Number(account.openingBalance || 0)),
            archived: account.archived === true,
            dailyReminderEnabled: account.dailyReminderEnabled === true,
          }
        : { id: '', name: '', type: 'BANK', openingBalance: '', archived: false, dailyReminderEnabled: false }
    );
    setFormError('');
    setArchiveAsk(false);
    accountSheet.show(e);
  }

  async function saveAccount(archivedNext?: boolean) {
    if (!uid || !form) return;
    if (!form.name.trim()) {
      setFormError('Account name is required.');
      return;
    }
    const openingBalance = parseMoney(form.openingBalance) || 0;
    if (!form.id) {
      // Same payload as the old createAccount().
      await addAccount(uid, {
        name: form.name.trim(),
        type: form.type,
        openingBalance,
        dailyReminderEnabled: form.dailyReminderEnabled,
        archived: false,
        currencyCode: 'GHS',
      });
    } else {
      // Same payload as the old saveEditingAccount().
      await updateAccount(uid, form.id, {
        name: form.name.trim(),
        type: form.type,
        openingBalance,
        dailyReminderEnabled: form.dailyReminderEnabled,
        archived: archivedNext ?? form.archived,
      });
    }
    accountSheet.hide();
  }

  function openManual(e: unknown, id: string) {
    const vm = data.byAccountId.get(id);
    if (!vm) return;
    setManualId(id);
    setManualDraft(String(vm.cash.currentManual ?? vm.cash.currentAuto));
    setManualError('');
    manualSheet.show(e);
  }

  async function saveManual() {
    if (!uid || !pid || !manualId || manualPending) return;
    const raw = manualDraft.trim();
    if (!raw) return setManualError('Current amount is required.');
    const amount = parseMoney(raw);
    if (!Number.isFinite(amount)) return setManualError('Enter a valid amount.');
    setManualPending(true);
    try {
      await setAccountPeriodCurrentManual(uid, { accountId: manualId, periodId: pid, currentManual: amount, updatedBy });
      manualSheet.hide();
    } catch (e: unknown) {
      setManualError(e instanceof Error ? e.message : 'Could not save current amount.');
    } finally {
      setManualPending(false);
    }
  }

  async function resetManual() {
    if (!uid || !pid || !manualId) return;
    try {
      await clearAccountPeriodCurrentManual(uid, manualId, pid);
      manualSheet.hide();
    } catch (e: unknown) {
      setManualError(e instanceof Error ? e.message : 'Could not reset current amount.');
    }
  }

  const detail = selected ? (
    <AccountDetail
      vm={selected}
      pid={pid}
      closed={data.closed}
      transactions={data.transactions}
      onBack={desktop ? undefined : () => (router.canGoBack() ? router.back() : router.replace('/accounts' as any))}
      onMove={(toId) => openMove(undefined, toId && toId === selected.accountId && selected.budget.unfunded > 0 ? toId : undefined, toId && selected.budget.unfunded > 0 ? undefined : selected.accountId)}
      onAddExpense={openAdd}
      onEdit={() => openAccountForm(undefined, selected.accountId)}
      onManual={() => openManual(undefined, selected.accountId)}
      onSeeAll={() => router.push(`/transactions?month=${pid}&account=${encodeURIComponent(selected.accountId)}` as any)}
    />
  ) : null;

  const balances = !data.accountsLoaded ? (
    <LoadingState rows={4} testID="accounts-loading" />
  ) : !active.length ? (
    <View className="gap-3">
      <EmptyState icon="bank-outline" message="Add where your money lives: bank, mobile money, cash." actionLabel="Add account" onAction={() => openAccountForm(undefined)} testID="accounts-empty" />
      {archived.length ? <AppButton label="Show archived" variant="ghost" size="touch" onPress={() => setArchivedOpen(true)} /> : null}
    </View>
  ) : (
    <View className="gap-5">
      <View className="gap-1" testID="accounts-total">
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`Balance in ${month.split(' ')[0]}`}</Text>
        <Text className={cn('text-3xl font-bold', total < 0 ? 'text-destructive dark:text-red-300' : 'text-foreground dark:text-zinc-50')} style={tabular}>
          {fmtMoney(total)}
        </Text>
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">
          across {active.length} {active.length === 1 ? 'account' : 'accounts'}
          {overdrawn ? <Text className="text-destructive dark:text-red-300">{` · ${overdrawn} overdrawn`}</Text> : null}
          {data.closed ? ` · ${month.split(' ')[0]} is closed` : ''}
        </Text>
      </View>

      {toMove.length && !data.closed ? (
        <ListGroup title={`Money to move (${toMove.length})`} testID="accounts-to-move">
          {toMove.map((r) => (
            <ListRow
              key={r.accountId}
              title={`${r.accountName} needs ${fmtMoney(r.budget.unfunded)} more`}
              titleLines={0}
              onPress={() => openMove(undefined, r.accountId)}
              testID={`to-move-${r.accountId}`}
            />
          ))}
        </ListGroup>
      ) : null}

      <ListGroup testID="accounts-list">
        {active.map((r) => (
          <AccountRow key={r.accountId} vm={r} balance={r.cash.current} selected={desktop && r.accountId === selectedId} onPress={() => select(r.accountId)} />
        ))}
      </ListGroup>
    </View>
  );

  const footerBlock = data.accountsLoaded ? (
    <View className="gap-3">
      {archived.length ? (
        <>
          <Pressable accessibilityRole="button" aria-expanded={archivedOpen} onPress={() => setArchivedOpen((v) => !v)} className="min-h-11 flex-row items-center gap-2 rounded-lg px-1">
            <Text className="min-w-0 flex-1 text-sm font-medium text-muted-foreground dark:text-zinc-400">Archived ({archived.length})</Text>
            <MaterialCommunityIcons name={archivedOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
          </Pressable>
          {archivedOpen ? (
            <ListGroup testID="accounts-archived">
              {archived.map((r) => (
                <AccountRow key={r.accountId} vm={r} balance={r.cash.current} selected={desktop && r.accountId === selectedId} onPress={() => select(r.accountId)} />
              ))}
            </ListGroup>
          ) : null}
        </>
      ) : null}
      {active.length ? <AppButton label="Add account" variant="outline" size="touch" className="w-full" onPress={(e?: unknown) => openAccountForm(e)} /> : null}
    </View>
  ) : null;

  const phoneDetail = !desktop && phoneId;
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <PageHeader title="Accounts" switcher={<AccountsSegment active="balances" month={pid} />} />
      {phoneDetail ? (
        selected ? detail : data.accountsLoaded ? <EmptyState icon="bank-off-outline" message="This account was not found." actionLabel="All accounts" onAction={() => router.replace('/accounts' as any)} /> : <LoadingState rows={4} />
      ) : desktop ? (
        <View className="flex-row items-start gap-8">
          <View className="min-w-0 flex-1 gap-4">
            {balances}
            {footerBlock}
          </View>
          <View className="min-w-0 flex-1 rounded-xl border border-border bg-card p-6 dark:border-zinc-800 dark:bg-zinc-900" testID="accounts-side">
            {detail ?? <Text className="text-sm text-muted-foreground dark:text-zinc-400">Choose an account to see its month.</Text>}
          </View>
        </View>
      ) : (
        <>
          {balances}
          {footerBlock}
        </>
      )}

      <AppSheet
        open={moveSheet.open}
        onClose={() => moveSheet.hide()}
        title="Move money"
        testID="move-sheet"
        footer={moveSheet.open ? <MoveMoneyFooter m={move} onDone={() => moveSheet.hide()} onCancel={() => moveSheet.hide()} /> : null}
      >
        {moveSheet.open ? <MoveMoneyFields m={move} /> : null}
      </AppSheet>

      <AppSheet
        open={accountSheet.open}
        onClose={() => accountSheet.hide()}
        title={form?.id ? 'Edit account' : 'Add account'}
        testID="account-sheet"
        footer={
          accountSheet.open && form ? (
            <>
              {formError ? <Text role="alert" className="text-sm text-red-600 dark:text-red-300">{formError}</Text> : null}
              <AppButton label="Save" accessibilityLabel={form.id ? 'Save account' : 'Add account'} size="touch-lg" className="w-full" textClassName="text-base" onPress={() => void saveAccount()} />
              <AppButton label="Cancel" variant="ghost" size="touch" onPress={() => accountSheet.hide()} />
            </>
          ) : null
        }
      >
        {accountSheet.open && form ? (
          <View className="gap-4">
            <FormField label="Name">
              <AppInput autoFocus value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Household account" accessibilityLabel="Account name" style={{ height: 44 }} />
            </FormField>
            <FormField label="Type">
              <AppSegmented<WalletType> touch value={form.type} onChange={(type) => setForm({ ...form, type })} options={walletTypeOptions.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
            </FormField>
            <FormField label="Opening balance (optional)">
              <AppInput value={form.openingBalance} onChangeText={(openingBalance) => setForm({ ...form, openingBalance })} placeholder="0.00" keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Opening balance" style={{ height: 44 }} />
            </FormField>
            <View className="min-h-11 flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50">Daily reminder</Text>
              <Switch value={form.dailyReminderEnabled} onValueChange={(dailyReminderEnabled) => setForm({ ...form, dailyReminderEnabled })} accessibilityLabel="Daily reminder" />
            </View>
            {/* The reminder itself (on/off, email, hour) lives only in Settings › Daily reminder. */}
            <AppButton
              label="Reminder email and time"
              variant="ghost"
              size="touch"
              className="self-start px-0"
              testID="account-reminder-settings-link"
              onPress={() => accountSheet.hide(() => router.push('/settings?page=reminder' as never))}
            />
            {form.id ? (
              archiveAsk ? (
                <View className="gap-2 rounded-xl border border-border p-3 dark:border-zinc-800" testID="archive-confirm">
                  <Text className="text-sm text-foreground dark:text-zinc-50">{`Archive ${form.name}? Its history stays.`}</Text>
                  <View className="flex-row gap-3">
                    <AppButton label="Keep" variant="outline" size="touch" className="flex-1" onPress={() => setArchiveAsk(false)} />
                    <AppButton label="Archive" variant="destructive" size="touch" className="flex-1" onPress={() => void saveAccount(true)} />
                  </View>
                </View>
              ) : form.archived ? (
                <AppButton label="Restore account" variant="outline" size="touch" onPress={() => void saveAccount(false)} />
              ) : (
                <AppButton label="Archive account" variant="ghost" size="touch" onPress={() => setArchiveAsk(true)} />
              )
            ) : null}
          </View>
        ) : null}
      </AppSheet>

      <AppSheet
        open={manualSheet.open}
        onClose={() => manualSheet.hide()}
        title="Manual balance"
        testID="manual-sheet"
        footer={
          manualSheet.open ? (
            <>
              {manualError ? <Text role="alert" className="text-sm text-red-600 dark:text-red-300">{manualError}</Text> : null}
              <AppButton label={manualPending ? 'Saving…' : 'Save balance'} size="touch-lg" className="w-full" textClassName="text-base" onPress={() => void saveManual()} />
              {data.byAccountId.get(manualId)?.cash.currentManual != null ? <AppButton label="Use the calculated balance" variant="ghost" size="touch" onPress={() => void resetManual()} /> : null}
            </>
          ) : null
        }
      >
        {manualSheet.open ? (
          <FormField label={`Balance for ${month}`}>
            <AppInput autoFocus value={manualDraft} onChangeText={setManualDraft} keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Manual balance" testID="manual-input" style={{ height: 44 }} />
          </FormField>
        ) : null}
      </AppSheet>
    </ScrollView>
  );
}
