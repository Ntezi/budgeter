// BUDG-8 S13: the Regular costs list (06-expenses-recurring.md), shared by /expenses and /recurring.
import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSheet } from '@/components/patterns/AppSheet';
import { EmptyState, LoadingState } from '@/components/patterns/States';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import { APP_CURRENCY } from '@/lib/repo/planLines';
import { accountIneligibility } from '@/lib/rules/defaultAccount';
import { QuickAddRow } from './QuickAddRow';
import { RegularCostsHeader } from './RegularCostsHeader';
import { RegularItemPanel, RegularItemSheet } from './RegularItemSheet';
import { RegularRow } from './RegularRow';
import { GROUP_DOT, GROUP_LABEL, draftFromItem, emptyDraft, groupsFor, matchesSearch, nounFor, type RegularDraft, type RegularGroup, type RegularItem, type RegularKind } from './types';

type Props = {
  kind: RegularKind;
  uid: string | null;
  items: RegularItem[];
  loaded: boolean;
  onSave: (id: string | null, draft: RegularDraft) => Promise<string | null>;
  onDelete: (id: string) => Promise<void>;
  /** Extra actions inside the item form (e.g. "Add to November 2026"). */
  extras?: (item: RegularItem | null) => ReactNode;
  /** Below the list (e.g. "Start a month from repeats", "Import from a file"). */
  footer?: ReactNode;
  notice?: string;
};

type Selection = { item: RegularItem | null; initial: RegularDraft; key: number } | null;

export function RegularCostsView(p: Props) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1024;
  const sheet = useSheet();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<'ALL' | RegularGroup>('ALL');
  const [sel, setSel] = useState<Selection>(null);
  const noun = nounFor(p.kind);

  useEffect(() => (p.uid ? watchAccounts(p.uid, setAccounts, { includeArchived: true }) : undefined), [p.uid]);

  const groups = groupsFor(p.kind);
  const visible = useMemo(() => p.items.filter((it) => (chip === 'ALL' || it.group === chip) && matchesSearch(it, search)), [p.items, chip, search]);

  function subLine(item: RegularItem): { text: string; warn?: boolean } {
    if (item.group === 'INCOME') return { text: 'Income · every month' };
    const id = item.defaultAccountId;
    const every = p.kind === 'repeats' ? ' · every month' : '';
    if (!id) return { text: p.kind === 'repeats' ? 'Every month · no account yet' : 'No default account' };
    if (accounts.length && accountIneligibility(id, accounts, APP_CURRENCY)) return { text: 'Account archived · choose another', warn: true };
    const name = accounts.find((a) => a.id === id)?.name;
    if (!name) return { text: p.kind === 'repeats' ? 'Every month' : 'Default account set' };
    return { text: p.kind === 'repeats' ? `${name}${every}` : `Default: ${name}` };
  }

  function open(item: RegularItem | null, initial: RegularDraft, e?: unknown) {
    setSel({ item, initial, key: Date.now() });
    if (!desktop) sheet.show(e);
  }
  const openNew = (prefill?: Partial<RegularDraft>, e?: unknown) =>
    open(null, emptyDraft({ group: chip === 'ALL' ? 'NEED' : chip, ...prefill }), e);
  const close = () => (desktop ? setSel(null) : sheet.hide());
  // Keep the open item in step with the list (e.g. its default account changed).
  const selItem = sel?.item ? p.items.find((it) => it.id === sel.item!.id) ?? null : null;
  const formProps = sel
    ? {
        kind: p.kind,
        uid: p.uid,
        item: selItem,
        initial: sel.initial,
        onSave: (d: RegularDraft) => p.onSave(selItem?.id ?? null, d),
        onDelete: selItem ? () => p.onDelete(selItem.id) : undefined,
        onDone: close,
        extras: p.extras?.(selItem),
      }
    : null;

  const list = !p.loaded ? (
    <LoadingState testID="regular-loading" />
  ) : !p.items.length ? (
    <EmptyState
      testID="regular-empty"
      message={p.kind === 'repeats' ? 'Add what comes back every month, like salary or rent.' : 'Add the things you spend on, like rent or groceries.'}
      actionLabel={`Add ${noun}`}
      onAction={() => openNew()}
    />
  ) : (
    <View className="gap-6">
      {groups.map((g) => {
        const rows = visible.filter((it) => it.group === g);
        if (!rows.length) return null;
        const total = rows.filter((r) => r.active).reduce((s, r) => s + (r.amount || 0), 0);
        return (
          <View key={g} testID={`regular-group-${g}`} className="gap-2">
            <View className="flex-row items-center gap-2 px-1">
              <View className={cn('h-2.5 w-2.5 rounded-full', GROUP_DOT[g])} />
              <Text role="heading" aria-level={2} className="min-w-0 flex-1 text-sm font-semibold text-foreground dark:text-zinc-50">
                {GROUP_LABEL[g]}
              </Text>
              <Text className="shrink-0 text-sm text-muted-foreground dark:text-zinc-400" style={{ fontVariant: ['tabular-nums'] }}>
                {`${fmtMoney(total)} / month`}
              </Text>
            </View>
            <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
              {rows.map((it, i) => {
                const sub = subLine(it);
                return (
                  <View key={it.id} className={i > 0 ? 'border-t border-border dark:border-zinc-800' : undefined}>
                    <RegularRow item={it} sub={sub.text} warn={sub.warn} selected={desktop && sel?.item?.id === it.id} onPress={(e) => open(it, draftFromItem(it), e)} />
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
      {!visible.length ? (
        <EmptyState
          testID="regular-empty-filter"
          message={chip !== 'ALL' ? `No ${GROUP_LABEL[chip]} ${noun === 'category' ? 'categories' : 'repeats'}.` : `Nothing matches “${search.trim()}”.`}
          actionLabel="Clear filter"
          onAction={() => {
            setChip('ALL');
            setSearch('');
          }}
        />
      ) : null}
      <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
        <QuickAddRow onOpen={(pre, e) => openNew(pre, e)} />
      </View>
    </View>
  );

  const toolbar = p.items.length ? (
    <View className="gap-3 lg:flex-row lg:items-center">
      <View className="min-w-0 lg:w-72">
        <AppInput accessibilityLabel="Search" placeholder="Search name or tag" value={search} onChangeText={setSearch} className="h-11 text-base" style={{ height: 44 }} />
      </View>
      <View className="flex-row flex-wrap gap-2" accessibilityLabel="Filter by group">
        {(['ALL', ...groups] as const).map((g) => {
          const on = chip === g;
          return (
            <Pressable
              key={g}
              accessibilityRole="button"
              aria-pressed={on}
              onPress={() => setChip(g)}
              className={cn(
                'h-11 min-w-11 items-center justify-center rounded-full border px-4',
                on ? 'border-primary bg-primary dark:bg-zinc-50' : 'border-border bg-card dark:border-zinc-800 dark:bg-zinc-900'
              )}
            >
              <Text className={cn('text-sm font-medium', on ? 'text-white dark:text-zinc-900' : 'text-foreground dark:text-zinc-50')}>{g === 'ALL' ? 'All' : GROUP_LABEL[g]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ) : null;

  const addButton = <AppButton label={`+ Add ${noun}`} size={desktop ? 'touch' : 'touch-lg'} className={desktop ? undefined : 'w-full'} onPress={(e) => openNew(undefined, e)} />;

  return (
    <View testID="regular-costs" className="flex-1">
      <View className="min-h-0 flex-1 flex-row gap-6">
        <ScrollView className="min-w-0 flex-[2]" contentContainerClassName="gap-5 pb-6">
          <RegularCostsHeader kind={p.kind} right={desktop ? addButton : undefined} />
          {p.notice ? (
            <Text role="status" className="rounded-xl bg-muted px-4 py-3 text-sm text-foreground dark:bg-zinc-800 dark:text-zinc-50">
              {p.notice}
            </Text>
          ) : null}
          {toolbar}
          {list}
          {p.footer}
        </ScrollView>
        {desktop ? (
          <ScrollView className="min-w-0 flex-1" contentContainerClassName="pb-6">
            {formProps ? (
              <RegularItemPanel key={sel!.key} {...formProps} />
            ) : (
              <View className="rounded-xl border border-dashed border-border p-5 dark:border-zinc-800">
                <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`Pick a ${noun} to change it, or add a new one.`}</Text>
              </View>
            )}
          </ScrollView>
        ) : null}
      </View>
      {!desktop ? <View className="pt-3">{addButton}</View> : null}
      {!desktop && formProps ? <RegularItemSheet key={sel!.key} {...formProps} open={sheet.open} onClose={() => sheet.hide()} /> : null}
    </View>
  );
}
