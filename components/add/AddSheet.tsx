import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField, FormRow } from '@/components/patterns/FormLayout';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { EmptyState } from '@/components/patterns/States';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { useExpenseForm } from '@/components/add/useExpenseForm';
import { ShoppingItemSegment } from '@/components/add/ShoppingItemSegment';
import { MoveMoneyFields, MoveMoneyFooter, useMoveMoney } from '@/components/accounts/MoveMoney';
import { useAccountsData, useAccountsPeriod } from '@/components/accounts/useAccountsData';
import { useAuthUser } from '@/providers/AuthProvider';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';
import { monthTitle } from '@/lib/rules/months';
import { localDateISO } from '@/lib/rules/postingMonth';

export type AddKind = 'expense' | 'move' | 'shopping';
const GROUPS: { key: string; label: string }[] = [
  { key: 'NEED', label: 'Needs' },
  { key: 'WANT', label: 'Wants' },
  { key: 'SAVINGS_DEBT', label: 'Savings' },
];
const CHIP_COUNT = 3;

type Props = { open: boolean; uid: string | null | undefined; onClose: () => void; onSaved: (periodId: string) => void; onGo: (href: string) => void };

/** BUDG-8 S3 Add sheet (briefs/redesign/04): Expense / Move money / Shopping item. */
export function AddSheet({ open, uid, onClose, onSaved, onGo }: Props) {
  const [kind, setKind] = useState<AddKind>('expense');
  const [allLines, setAllLines] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const f = useExpenseForm(open, uid, onSaved);
  // BUDG-8 S8: Move money is finished here (same form and writes as the Accounts screen).
  const user = useAuthUser();
  const moveActive = open && kind === 'move';
  const movePid = useAccountsPeriod();
  const moveData = useAccountsData(moveActive ? uid : null, movePid);
  const mv = useMoveMoney({ active: moveActive, uid, pid: movePid, data: moveData, updatedBy: user?.uid || uid || '' });

  useEffect(() => {
    if (!open) return;
    setKind('expense');
    setAllLines(false);
    setNoteOpen(false);
  }, [open]);

  const month = f.postingPid ? monthTitle(f.postingPid) : '';
  const chips = f.recentLines.slice(0, CHIP_COUNT);
  if (f.selectedPlan && !chips.some((l) => l.id === f.selectedPlan?.id)) chips.push(f.selectedPlan);
  const noLines = !!f.periodState?.exists && f.lines.length === 0;
  const isToday = f.date === localDateISO();

  const footer =
    kind === 'expense' ? (
      <>
        <Text testID="posts-to" className="text-sm font-semibold text-foreground dark:text-zinc-50" accessibilityLiveRegion="polite">
          {f.dateValid
            ? `Posts to ${month} · ${f.selectedAccount?.name || 'choose account'} · ${fmtMoney(f.amount || 0)} · ${f.date}`
            : 'Enter a valid date to see where this posts'}
        </Text>
        {f.error ? <Text role="alert" className="text-sm text-red-600 dark:text-red-300">{f.error}</Text> : null}
        <AppButton
          testID="save-expense"
          label={f.pending ? 'Saving…' : 'Save expense'}
          accessibilityLabel="Save expense"
          size="touch-lg"
          className="w-full"
          disabled={!f.ready}
          onPress={() => void f.save().then((ok) => ok && onClose())}
        />
        <AppButton label="Cancel" variant="ghost" size="touch" onPress={onClose} />
      </>
    ) : kind === 'move' ? (
      <MoveMoneyFooter m={mv} onDone={onClose} onCancel={onClose} />
    ) : null;

  return (
    <AppSheet open={open} onClose={onClose} title="Add" testID="add-sheet" footer={footer}>
      <AppSegmented<AddKind>
        value={kind}
        onChange={setKind}
        touch
        full // Q-4: three equal tabs across the sheet; 'Shopping item' wraps to two lines at 320
        options={[
          { label: 'Expense', value: 'expense' },
          { label: 'Move money', value: 'move' },
          { label: 'Shopping item', value: 'shopping' },
        ]}
      />
      {kind === 'move' ? (
        <MoveMoneyFields m={mv} />
      ) : null}
      {kind === 'shopping' && open ? <ShoppingItemSegment open={open} uid={uid} onDone={() => undefined} onGo={onGo} /> : null}
      {kind === 'expense' ? (
        <View className="gap-4">
          <FormField label="Amount">
            <AppInput
              testID="expense-amount"
              autoFocus
              value={f.amountText}
              onChangeText={f.setAmountText}
              placeholder="0.00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              accessibilityLabel="Amount"
              className="h-14 text-3xl font-semibold"
            />
          </FormField>

          {f.missing ? (
            <View className="gap-2">
              <Text className="text-sm text-foreground dark:text-zinc-50">{month} has no budget yet. Create it, or choose another open budget below.</Text>
              <AppButton label={`Create ${month} draft`} variant="outline" size="touch" onPress={f.createPostingMonth} disabled={f.pending} />
            </View>
          ) : null}
          {f.locked ? <Text className="text-sm text-foreground dark:text-zinc-50">{month} is closed and view-only. Choose an open budget below.</Text> : null}

          {noLines && !f.locked ? (
            <EmptyState icon="clipboard-text-outline" message={`Plan ${month} first to choose a line`} actionLabel={`Plan ${month}`} onAction={() => onGo(`/budgets/${f.postingPid}`)} />
          ) : null}
          {f.lines.length && !f.locked ? (
            <View className="gap-2">
              <Text nativeID="what-for" className="text-sm font-medium text-foreground dark:text-zinc-50">What for?</Text>
              <View className="flex-row flex-wrap gap-2" aria-labelledby="what-for">
                {chips.map((line) => {
                  const active = line.id === f.planItemId;
                  return (
                    <Pressable
                      key={line.id}
                      accessibilityRole="button"
                      accessibilityLabel={line.name}
                      aria-pressed={active}
                      onPress={() => f.choosePlan(String(line.id))}
                      className={cn(
                        'h-11 lg:h-9 max-w-full justify-center rounded-full border px-4',
                        active ? 'border-primary bg-primary dark:border-zinc-800 dark:bg-zinc-50' : 'border-border bg-card dark:border-zinc-800 dark:bg-zinc-900'
                      )}
                    >
                      <Text numberOfLines={1} className={cn('text-sm font-medium', active ? 'text-white dark:text-zinc-900' : 'text-foreground dark:text-zinc-50')}>
                        {line.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {f.lines.length > CHIP_COUNT ? (
                  <Pressable accessibilityRole="button" aria-expanded={allLines} onPress={() => setAllLines((v) => !v)} className="h-11 lg:h-9 justify-center rounded-full px-3">
                    <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{allLines ? 'Fewer lines' : 'All lines ›'}</Text>
                  </Pressable>
                ) : null}
              </View>
              {allLines
                ? GROUPS.map((g) => {
                    const rows = f.lines.filter((l) => (g.key === 'SAVINGS_DEBT' ? !['NEED', 'WANT'].includes(String(l.group)) : l.group === g.key));
                    if (!rows.length) return null;
                    return (
                      <ListGroup key={g.key} title={g.label}>
                        {rows.map((l) => (
                          <ListRow
                            key={l.id}
                            title={l.name}
                            sub={`Left ${fmtMoney(f.leftFor(String(l.id)))}`}
                            accessibilityLabel={`${l.name}, left ${fmtMoney(f.leftFor(String(l.id)))}`}
                            onPress={() => {
                              f.choosePlan(String(l.id));
                              setAllLines(false);
                            }}
                          />
                        ))}
                      </ListGroup>
                    );
                  })
                : null}
            </View>
          ) : null}

          <FormRow label="Paid from">
            <DropdownField
              value={f.accountId}
              options={f.accounts.filter((a) => a.id).map((a) => ({ value: String(a.id), label: a.name }))}
              onChange={f.setAccountId}
              placeholder="Choose account"
              className="w-full"
              triggerClassName="min-h-11 lg:min-h-9"
              menuStrategy="inline"
              menuClassName="max-h-44"
            />
          </FormRow>
          <FormRow label="Date">
            <View className="w-full flex-row items-center justify-end gap-2">
              {isToday ? <Text className="text-xs text-muted-foreground dark:text-zinc-400">Today</Text> : null}
              <AppInput value={f.date} onChangeText={f.setDate} placeholder="YYYY-MM-DD" accessibilityLabel="Date" className="w-36" />
            </View>
          </FormRow>
          {/* BUDG-40 AC-2: the budget this expense goes to; follows the date until chosen here. */}
          <FormRow label="Budget">
            <View testID="expense-budget" className="w-full">
              <DropdownField
                value={f.postingPid}
                options={f.budgetOptions}
                onChange={f.chooseBudget}
                placeholder="Enter a date first"
                className="w-full"
                triggerClassName="min-h-11 lg:min-h-9"
                menuStrategy="inline"
                menuClassName="max-h-44"
              />
            </View>
          </FormRow>
          {noteOpen ? (
            <FormField label="Note">
              <AppInput autoFocus value={f.note} onChangeText={f.setNote} placeholder="Note (optional)" className="" />
            </FormField>
          ) : (
            <AppButton label="+ Add a note" variant="ghost" size="touch" className="self-start" onPress={() => setNoteOpen(true)} />
          )}
        </View>
      ) : null}
    </AppSheet>
  );
}
