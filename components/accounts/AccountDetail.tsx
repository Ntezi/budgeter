// BUDG-8 S8 account detail (briefs/redesign/05 "Account detail"): pushed screen on phone/tablet, right
// panel on desktop. Figures come from accountFigures() (renamed, same numbers as before).
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { AppButton } from '@/components/ui/AppButton';
import type { Tx } from '@/lib/repo/transactions';
import { fmtMoney } from '@/lib/format';
import { monthTitle } from '@/lib/rules/months';
import { accountFigures, accountHint } from '@/lib/view-models/accountFigures';
import type { AccountViewModel } from '@/lib/view-models/useAccountViewModels';

const tabular = { fontVariant: ['tabular-nums' as const] };

type Props = {
  vm: AccountViewModel;
  /** Opening balance + all-time cash movement (as Home). */
  balance: number;
  pid: string;
  closed: boolean;
  transactions: Tx[];
  onBack?: () => void;
  onMove: (toId?: string) => void;
  onAddExpense: (e?: unknown) => void;
  onEdit: () => void;
  onManual: () => void;
  onSeeAll: () => void;
};

function Figure({ label, value, onPress, testID }: { label: string; value: number; onPress?: () => void; testID?: string }) {
  return <ListRow title={label} amount={fmtMoney(value)} onPress={onPress} testID={testID} amountClassName={value < 0 ? 'text-destructive dark:text-red-300' : undefined} />;
}

export function AccountDetail({ vm, balance, pid, closed, transactions, onBack, onMove, onAddExpense, onEdit, onManual, onSeeAll }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const f = accountFigures(vm);
  const hint = accountHint(vm, fmtMoney, balance);
  const monthName = monthTitle(pid).split(' ')[0];
  const recent = transactions
    .filter((t) => t.paidFromAccountId === vm.accountId || t.accountId === vm.accountId || t.toAccountId === vm.accountId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);
  const signed = (t: Tx) => (t.type === 'TRANSFER' && t.toAccountId === vm.accountId ? Number(t.amount || 0) : -Number(t.amount || 0));

  return (
    <View className="gap-5" testID="account-detail">
      <View className="flex-row items-center gap-2">
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to accounts" onPress={onBack} className="h-11 w-11 items-center justify-center rounded-full hover:bg-muted dark:hover:bg-zinc-800">
            <MaterialCommunityIcons name="chevron-left" size={24} color="#717182" />
          </Pressable>
        ) : null}
        <Text role="heading" aria-level={2} numberOfLines={1} className="min-w-0 flex-1 text-lg font-semibold text-foreground dark:text-zinc-50">
          {vm.accountName}
        </Text>
        <AppButton label="Edit" variant="ghost" size="touch" onPress={onEdit} accessibilityLabel={`Edit ${vm.accountName}`} />
      </View>

      <View className="gap-1">
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">Balance today</Text>
        <Text testID="account-balance" className={balance < 0 ? 'text-3xl font-bold text-destructive dark:text-red-300' : 'text-3xl font-bold text-foreground dark:text-zinc-50'} style={tabular}>
          {fmtMoney(balance)}
        </Text>
        {vm.archived ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">Archived · its history stays.</Text> : null}
        {/* D-8: the status line moved here from the Accounts row (one-line type only there). */}
        <Text testID="account-hint" className={hint.tone === 'danger' ? 'text-sm text-destructive dark:text-red-300' : 'text-sm text-muted-foreground dark:text-zinc-400'}>
          {hint.text}
        </Text>
      </View>

      {closed ? (
        <Text className="text-sm text-foreground dark:text-zinc-50">{monthName} is closed. These numbers are final.</Text>
      ) : vm.archived ? null : (
        <View className="flex-row flex-wrap gap-3">
          <AppButton label="Move money" size="touch" onPress={() => onMove(vm.accountId)} testID="detail-move" className="min-w-36 flex-1" />
          <AppButton label="Add expense" variant="outline" size="touch" onPress={onAddExpense} className="min-w-36 flex-1" />
        </View>
      )}

      <ListGroup title={`This month (${monthName})`} testID="account-month">
        <Figure label="Set aside for plans" value={f.setAside} />
        <Figure label="Moved in" value={f.movedIn} />
        <Figure label="Still to move" value={f.stillToMove} onPress={!closed && f.stillToMove > 0 ? () => onMove(vm.accountId) : undefined} testID="detail-still-to-move" />
        <Figure label="Spent from here" value={f.spent} />
        <Figure label="Not planned yet" value={f.notPlanned} />
        <Figure label="Actual this month" value={f.actual} onPress={onManual} testID="detail-actual" />
      </ListGroup>

      {vm.assignedItems.length ? (
        <ListGroup title={`Plan lines paid from here (${vm.assignedItems.length})`} testID="account-lines">
          {vm.assignedItems.map((it) => (
            <ListRow key={it.id} title={it.name} sub={`Spent ${fmtMoney(it.spent)}`} amount={fmtMoney(it.allocated)} />
          ))}
        </ListGroup>
      ) : null}

      <ListGroup title="Recent activity" testID="account-recent">
        {recent.length ? (
          recent.map((t) => <ListRow key={t.id} title={t.type === 'TRANSFER' ? 'Moved money' : t.name || 'Expense'} sub={t.date} amount={fmtMoney(signed(t))} />)
        ) : (
          <ListRow title={`Nothing in ${monthName} yet`} />
        )}
        <ListRow title="See all activity" onPress={onSeeAll} />
      </ListGroup>

      <View className="gap-2">
        <Pressable accessibilityRole="button" aria-expanded={moreOpen} onPress={() => setMoreOpen((v) => !v)} className="min-h-11 flex-row items-center gap-2 rounded-lg px-1">
          <Text className="min-w-0 flex-1 text-sm font-medium text-muted-foreground dark:text-zinc-400">Opening balance · Manual balance</Text>
          <MaterialCommunityIcons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
        </Pressable>
        {moreOpen ? (
          <ListGroup testID="account-settings">
            <ListRow title="Opening balance" amount={fmtMoney(vm.cash.opening)} onPress={onEdit} />
            <ListRow
              title="Actual this month (set by hand)"
              sub={`Moved in minus spent: ${fmtMoney(vm.cash.currentAuto)}`}
              amount={fmtMoney(vm.cash.current)}
              onPress={onManual}
            />
          </ListGroup>
        ) : null}
      </View>
    </View>
  );
}
