// BUDG-2: add/edit a dated year item. Existing controls only (AppInput, DropdownField,
// AppButton, AppModal). Editing an item that months already include shows a preview of the
// affected lines before anything is applied (AC-6).
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppModal } from '@/components/ui/AppModal';
import { DropdownField } from '@/components/ui/DropdownField';
import type { Account } from '@/lib/repo/accounts';
import type { ExpenseItem } from '@/lib/repo/expenses';
import { APP_CURRENCY } from '@/lib/repo/planLines';
import { addYearItem, previewYearEdit, removeYearItemFromMonth, saveYearEdit, type YearItemRow } from '@/lib/repo/yearPlan';
import { minorToInput, parseMinorInput } from '@/lib/money';
import { fmtMoney } from '@/lib/format';
import { PLAN_GROUP_OPTIONS } from '@/lib/groups';
import { monthTitle } from '@/lib/rules/months';
import { suggestionForSource } from '@/lib/rules/defaultAccount';
import { budgetInChoices, validateYearItem, type PreviewRow, type YearGroup, type YearItemInput, type YearItemStatus } from '@/lib/rules/yearPlan';

type Props = {
  uid: string;
  open: boolean;
  onClose: () => void;
  item: YearItemRow | null;
  defaultDueDate: string;
  accounts: Account[];
  expenses: ExpenseItem[];
};

const STATUS_OPTIONS = [
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Done', value: 'DONE' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export function YearItemForm({ uid, open, onClose, item, defaultDueDate, accounts, expenses }: Props) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [budgetIn, setBudgetIn] = useState('');
  const [estimate, setEstimate] = useState('');
  const [group, setGroup] = useState<string>('NEED');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState<string>('ACTIVE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? '');
    setDueDate(item?.dueDate ?? defaultDueDate);
    setBudgetIn(item?.budgetInPeriodId ?? '');
    setEstimate(minorToInput(item?.estimateMinor));
    setGroup(item?.group ?? 'NEED');
    setCategoryId(item?.sourceExpenseItemId ?? '');
    setAccountId(item?.fundingAccountId ?? '');
    setStatus(item?.status ?? 'ACTIVE');
    setError('');
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, defaultDueDate]);

  const monthOptions = useMemo(
    () => budgetInChoices(dueDate).map((pid) => ({ value: pid, label: pid === dueDate.slice(0, 7) ? `${monthTitle(pid)} (due month)` : monthTitle(pid) })),
    [dueDate]
  );
  const category = expenses.find((row) => row.id === categoryId) ?? null;
  const suggestion = suggestionForSource(category, accounts, APP_CURRENCY);
  const accountOptions = [
    { label: 'No account', value: '' },
    ...accounts.filter((a) => a.id && !a.archived).map((a) => ({ label: a.name, value: a.id! })),
  ];

  function onCategory(next: string) {
    setCategoryId(next);
    const row = expenses.find((e) => e.id === next);
    if (row?.group) setGroup(String(row.group));
    const s = suggestionForSource(row, accounts, APP_CURRENCY);
    if (!accountId && s.accountId) setAccountId(s.accountId); // BUDG-3 default suggestion
  }

  function buildInput(): YearItemInput | null {
    const parsed = parseMinorInput(estimate);
    if (parsed.error) {
      setError(parsed.error);
      return null;
    }
    const input: YearItemInput = {
      title: title.trim(),
      kind: parsed.minor ? 'EXPENSE' : 'EVENT',
      dueDate: dueDate.trim(),
      budgetInPeriodId: budgetIn && budgetInChoices(dueDate.trim()).includes(budgetIn) ? budgetIn : dueDate.trim().slice(0, 7),
      estimateMinor: parsed.minor ?? undefined,
      group: group as YearGroup,
      sourceExpenseItemId: categoryId || undefined,
      fundingAccountId: accountId || undefined,
      status: status as YearItemStatus,
      note: item?.note,
    };
    const errors = validateYearItem(input);
    if (errors.length) {
      setError(errors.join(' '));
      return null;
    }
    return input;
  }

  async function save() {
    if (busy) return;
    setError('');
    const input = buildInput();
    if (!input) return;
    setBusy(true);
    try {
      if (!item) {
        await addYearItem(uid, input);
        onClose();
      } else if (!preview && (item.linkedPeriodIds ?? []).length) {
        const rows = await previewYearEdit(uid, item.id, input);
        if (rows.length) setPreview(rows);
        else {
          await saveYearEdit(uid, item.id, input, { expectedRevision: Number(item.revision ?? 0), applyToDrafts: false });
          onClose();
        }
      } else {
        await saveYearEdit(uid, item.id, input, { expectedRevision: Number(item.revision ?? 0), applyToDrafts: false });
        onClose();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply(applyToDrafts: boolean) {
    const input = buildInput();
    if (!input || !item || busy) return;
    setBusy(true);
    try {
      await saveYearEdit(uid, item.id, input, { expectedRevision: Number(item.revision ?? 0), applyToDrafts });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeFrom(pid: string) {
    if (!item || busy) return;
    setBusy(true);
    try {
      await removeYearItemFromMonth(uid, pid, item.id);
      setPreview((rows) => (rows ? rows.filter((r) => r.pid !== pid) : rows));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const hasUpdates = Boolean(preview?.some((r) => r.action === 'update'));

  return (
    <AppModal presentation="sheet" open={open} onClose={onClose} title={item ? 'Edit year item' : 'Add dated item'} testID="year-item-sheet">
      {preview ? (
        <View className="gap-3" testID="year-edit-preview">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Months that include this item</Text>
          {preview.map((row) => (
            <View key={row.pid} className="gap-1 rounded-lg border border-border p-3 dark:border-zinc-800">
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{monthTitle(row.pid)}</Text>
              {row.action === 'update' ? (
                <Text className="text-xs text-muted-foreground">{`Will change ${fmtMoney(row.from)} → ${fmtMoney(row.to)}`}</Text>
              ) : row.action === 'locked-unchanged' ? (
                <Text className="text-xs text-muted-foreground">{`Locked · stays ${fmtMoney(row.from)}`}</Text>
              ) : (
                <View className="gap-2">
                  <Text className="text-xs text-amber-700 dark:text-amber-300">{`Item is ${row.reason}; this month keeps ${fmtMoney(row.from)} until you remove it`}</Text>
                  <AppButton label={`Remove from ${monthTitle(row.pid)}`} variant="outline" size="touch" onPress={() => removeFrom(row.pid)} disabled={busy} />
                </View>
              )}
            </View>
          ))}
          {error ? <Text className="text-xs text-red-600 dark:text-red-300">{error}</Text> : null}
          <View className="flex-row flex-wrap justify-end gap-2">
            <AppButton label="Back" variant="outline" size="touch" onPress={() => setPreview(null)} disabled={busy} />
            <AppButton label="Save year plan only" variant="outline" size="touch" onPress={() => apply(false)} disabled={busy} />
            {hasUpdates ? <AppButton label="Apply to drafts" size="touch" onPress={() => apply(true)} disabled={busy} textClassName="text-white" /> : null}
          </View>
        </View>
      ) : (
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Title</Text>
            <AppInput className="" value={title} onChangeText={setTitle} placeholder="e.g. Residence card renewal" accessibilityLabel="Title" maxLength={80} />
          </View>
          <View className="z-20 flex-col gap-3 md:flex-row">
            <View className="gap-1 md:flex-1">
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Due date</Text>
              <AppInput className="" value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" accessibilityLabel="Due date" maxLength={10} />
            </View>
            <View className="z-20 gap-1 md:flex-1">
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Budget in</Text>
              <DropdownField
                value={budgetIn || dueDate.slice(0, 7)}
                options={monthOptions}
                onChange={setBudgetIn}
                placeholder="Due month"
                menuStrategy="inline" triggerClassName="h-11 lg:h-9"
                menuClassName="max-h-44"
                disabled={!monthOptions.length}
              />
            </View>
          </View>
          <View className="gap-1">
            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Estimate (leave empty for date only)</Text>
            <AppInput className="" value={estimate} onChangeText={setEstimate} placeholder="Date only" keyboardType="decimal-pad" accessibilityLabel="Estimate" />
          </View>
          {estimate.trim() ? (
            <>
              <View className="z-10 gap-1">
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Category</Text>
                <DropdownField
                  value={categoryId}
                  options={[{ label: 'No category', value: '' }, ...expenses.filter((e) => e.id).map((e) => ({ label: e.name, value: e.id! }))]}
                  onChange={onCategory}
                  placeholder="No category"
                  menuStrategy="inline" triggerClassName="h-11 lg:h-9"
                  menuClassName="max-h-44"
                />
              </View>
              <View className="gap-1">
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Group</Text>
                <DropdownField value={group} options={PLAN_GROUP_OPTIONS as any} onChange={setGroup} menuStrategy="inline" triggerClassName="h-11 lg:h-9" />
              </View>
              <View className="gap-1">
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Funding account (optional)</Text>
                <DropdownField value={accountId} options={accountOptions} onChange={setAccountId} placeholder="No account" menuStrategy="inline" triggerClassName="h-11 lg:h-9" menuClassName="max-h-44" />
                {category && suggestion.accountId ? (
                  <Text className="text-xs text-muted-foreground">{`Default for ${category.name}: ${accounts.find((a) => a.id === suggestion.accountId)?.name ?? ''}`}</Text>
                ) : null}
              </View>
            </>
          ) : null}
          {item ? (
            <View className="gap-1">
              <Text className="text-xs text-muted-foreground">Status</Text>
              <DropdownField value={status} options={STATUS_OPTIONS} onChange={setStatus} menuStrategy="inline" triggerClassName="h-11 lg:h-9" />
            </View>
          ) : null}
          <Text className="text-xs text-muted-foreground">Nothing is added to a month until you add it from that month&apos;s draft.</Text>
          {error ? <Text className="text-xs text-red-600 dark:text-red-300">{error}</Text> : null}
          <View className="flex-row flex-wrap justify-end gap-2">
            <AppButton label="Cancel" variant="outline" size="touch" onPress={onClose} />
            <AppButton label={busy ? 'Saving…' : 'Save'} size="touch" onPress={save} disabled={busy} textClassName="text-white" />
          </View>
        </View>
      )}
    </AppModal>
  );
}
