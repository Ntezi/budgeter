// BUDG-8 S8 Move money (briefs/redesign/05 "Move money sheet"): one form used by the Accounts screen's
// sheet and the Add sheet's "Move money" segment. Writes only through moveMoney() (unchanged transfer logic).
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { newClientId } from '@/lib/repo/transactions';
import { moveMoney, transferDate } from '@/components/accounts/transferWrites';
import type { useAccountsData } from '@/components/accounts/useAccountsData';
import { cn } from '@/lib/cn';
import { fmtMoney, parseMoney } from '@/lib/format';
import { monthTitle } from '@/lib/rules/months';
import { defaultSource, freeToMove, prefillAmount } from '@/lib/view-models/accountFigures';

type Data = ReturnType<typeof useAccountsData>;
export type MovePrefill = { toId?: string; fromId?: string };

const money2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function useMoveMoney(opts: { active: boolean; uid: string | null | undefined; pid: string; data: Data; prefill?: MovePrefill; updatedBy: string }) {
  const { active, uid, pid, data, prefill, updatedBy } = opts;
  const rows = useMemo(() => data.accountRows.filter((r) => r.accountId && !r.archived), [data.accountRows]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [split, setSplit] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);

  // Reset on open; pre-fill once the figures have loaded (until the user edits).
  useEffect(() => {
    if (!active) return;
    setFromId('');
    setToId(prefill?.toId ?? '');
    setAmountText('');
    setSplit(false);
    setSplitAmounts({});
    setError('');
    setTouched(false);
  }, [active, prefill?.toId, prefill?.fromId]);

  useEffect(() => {
    if (!active || touched || !rows.length) return;
    const to = prefill?.toId ? data.byAccountId.get(prefill.toId) : undefined;
    const from = prefill?.fromId ? data.byAccountId.get(prefill.fromId) : defaultSource(rows, to?.accountId ?? '');
    if (!from) return;
    setFromId(from.accountId);
    if (to) {
      setToId(to.accountId);
      const amt = prefillAmount(from, to);
      setAmountText(amt > 0 ? money2(amt) : '');
    }
  }, [active, touched, rows, data.byAccountId, prefill?.toId, prefill?.fromId]);

  const from = fromId ? data.byAccountId.get(fromId) ?? null : null;
  const to = toId ? data.byAccountId.get(toId) ?? null : null;
  const free = freeToMove(from);
  const destinations = rows.filter((r) => r.accountId !== fromId);
  const selected = split
    ? destinations.map((r) => ({ accountId: r.accountId, parsedAmount: Math.max(0, parseMoney(splitAmounts[r.accountId] || '')) })).filter((r) => r.parsedAmount > 0)
    : to && toId !== fromId
      ? [{ accountId: toId, parsedAmount: Math.max(0, parseMoney(amountText)) }].filter((r) => r.parsedAmount > 0)
      : [];
  const total = selected.reduce((s, r) => s + r.parsedAmount, 0);
  const over = !!from && total > free + 1e-9;
  const ready = !!uid && !!from && selected.length > 0 && !over && !data.closed && !pending;
  const date = transferDate();

  function edit<T>(set: (v: T) => void) {
    return (v: T) => {
      setTouched(true);
      setError('');
      set(v);
    };
  }

  const formKeyRef = useRef(newClientId().slice(0, 18)); // H-2: one key per open form
  async function save() {
    if (!uid || !pid || !from || pending) return false;
    if (!selected.length) {
      setError('Choose where the money goes and enter an amount.');
      return false;
    }
    if (over) {
      setError(`${from.accountName} has ${fmtMoney(free)} free to move.`);
      return false;
    }
    setPending(true);
    try {
      await moveMoney({ uid, periodId: pid, source: from, rows: selected, destinationById: (id) => data.byAccountId.get(id), updatedBy, formKey: formKeyRef.current });
      formKeyRef.current = newClientId().slice(0, 18); // the next move is a new write
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not move money.');
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    pid, rows, destinations, from, to, fromId, toId, free, amountText, split, splitAmounts, selected, total, over, ready, pending, error, date, closed: data.closed, loaded: data.accountsLoaded,
    setFromId: edit((id: string) => {
      setFromId(id);
      if (id === toId) setToId('');
    }),
    setToId: edit(setToId),
    setAmountText: edit(setAmountText),
    setSplit: edit(setSplit),
    setSplitAmount: (id: string, v: string) => edit((x: string) => setSplitAmounts((p) => ({ ...p, [id]: x })))(v),
    save,
  };
}
export type MoveMoneyState = ReturnType<typeof useMoveMoney>;

function AccountChips({ label, rows, value, onPick, testID }: { label: string; rows: MoveMoneyState['rows']; value: string; onPick: (id: string) => void; testID: string }) {
  return (
    <View role="radiogroup" aria-label={label} testID={testID} className="flex-row flex-wrap gap-2">
      {rows.map((r) => {
        const on = r.accountId === value;
        return (
          <Pressable
            key={r.accountId}
            role="radio"
            aria-checked={on}
            accessibilityLabel={`${label} ${r.accountName}`}
            onPress={() => onPick(r.accountId)}
            className={cn(
              'h-11 lg:h-9 max-w-full justify-center rounded-full border px-4',
              on ? 'border-primary bg-primary dark:border-zinc-700 dark:bg-zinc-800' : 'border-border bg-background hover:bg-muted dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800'
            )}
          >
            <Text numberOfLines={1} className={cn('text-sm font-medium', on ? 'text-primary-foreground dark:text-zinc-50' : 'text-foreground dark:text-zinc-50')}>
              {r.accountName}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const muted = 'text-xs text-muted-foreground dark:text-zinc-400';
const tabular = { fontVariant: ['tabular-nums' as const] };

export function MoveMoneyFields({ m }: { m: MoveMoneyState }) {
  const month = monthTitle(m.pid);
  if (m.loaded && m.rows.length < 2) {
    return <Text className="text-sm text-foreground dark:text-zinc-50">Add a second account to move money between accounts.</Text>;
  }
  return (
    <View className="gap-4" testID="move-money-form">
      {m.closed ? (
        <Text role="alert" className="text-sm font-medium text-foreground dark:text-zinc-50">
          {month.split(' ')[0]} is closed. Money can&apos;t be moved in a closed month.
        </Text>
      ) : null}
      <FormField label="From">
        <AccountChips label="From" rows={m.rows} value={m.fromId} onPick={m.setFromId} testID="move-from" />
        {m.from ? <Text className={muted} style={tabular}>Free to move {fmtMoney(m.free)}</Text> : null}
      </FormField>
      {!m.split ? (
        <>
          <FormField label="To">
            <AccountChips label="To" rows={m.destinations} value={m.toId} onPick={m.setToId} testID="move-to" />
            {m.to ? <Text className={muted} style={tabular}>{m.to.budget.unfunded > 0 ? `Still needs ${fmtMoney(m.to.budget.unfunded)}` : 'Needs nothing more this month'}</Text> : null}
          </FormField>
          <FormField label="Amount">
            <AppInput
              testID="move-amount"
              value={m.amountText}
              onChangeText={m.setAmountText}
              placeholder="0.00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              accessibilityLabel="Amount to move"
              className="h-14 text-3xl font-semibold"
            />
          </FormField>
        </>
      ) : (
        <View className="gap-2" testID="move-split">
          <Text className="text-sm font-medium text-foreground dark:text-zinc-50">To several accounts</Text>
          {m.destinations.map((r) => (
            <View key={r.accountId} className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm text-foreground dark:text-zinc-50">{r.accountName}</Text>
                {r.budget.unfunded > 0 ? <Text className={muted} style={tabular}>Still needs {fmtMoney(r.budget.unfunded)}</Text> : null}
              </View>
              <AppInput
                value={m.splitAmounts[r.accountId] || ''}
                onChangeText={(v) => m.setSplitAmount(r.accountId, v)}
                placeholder="0.00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                accessibilityLabel={`Amount to ${r.accountName}`}
                style={{ height: 44, width: 112 }}
              />
            </View>
          ))}
          <Text className="text-sm font-medium text-foreground dark:text-zinc-50" style={tabular}>Total {fmtMoney(m.total)}</Text>
        </View>
      )}
      <View className="min-h-11 lg:min-h-9 flex-row items-center justify-between gap-3">
        <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Date</Text>
        <Text className="text-sm text-foreground dark:text-zinc-50" style={tabular}>Today · {m.date}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        aria-expanded={m.split}
        onPress={() => m.setSplit(!m.split)}
        className="min-h-11 lg:min-h-9 flex-row items-center gap-2 self-start rounded-lg px-1"
      >
        <MaterialCommunityIcons name={m.split ? 'minus' : 'plus'} size={18} color="#717182" />
        <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{m.split ? 'Move to one account' : 'Split to several accounts'}</Text>
      </Pressable>
    </View>
  );
}

export function MoveMoneyFooter({ m, onDone, onCancel }: { m: MoveMoneyState; onDone: () => void; onCancel: () => void }) {
  const month = monthTitle(m.pid);
  const toLabel = m.split ? `${m.selected.length} ${m.selected.length === 1 ? 'account' : 'accounts'}` : m.to?.accountName || 'choose account';
  return (
    <>
      <Text testID="move-summary" className="text-sm font-semibold text-foreground dark:text-zinc-50" accessibilityLiveRegion="polite" style={tabular}>
        {`Moves ${fmtMoney(m.total)} from ${m.from?.accountName || 'choose account'} to ${toLabel} · ${m.date} · ${month}`}
      </Text>
      {m.over && m.from ? (
        <Text role="alert" className="text-sm text-red-600 dark:text-red-300">{`${m.from.accountName} has ${fmtMoney(m.free)} free to move.`}</Text>
      ) : m.error ? (
        <Text role="alert" className="text-sm text-red-600 dark:text-red-300">{m.error}</Text>
      ) : null}
      <AppButton
        testID="move-save"
        label={m.pending ? 'Moving…' : 'Move money'}
        accessibilityLabel="Move money"
        size="touch-lg"
        className="w-full"
        disabled={!m.ready}
        onPress={() => void m.save().then((ok) => ok && onDone())}
      />
      <AppButton label="Cancel" variant="ghost" size="touch" onPress={onCancel} />
    </>
  );
}
