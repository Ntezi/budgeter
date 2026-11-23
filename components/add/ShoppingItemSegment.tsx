import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { EmptyState } from '@/components/patterns/States';
import { AddItemBar } from '@/components/shopping/AddItemBar';
import { AppButton } from '@/components/ui/AppButton';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';
import { periodIdFromDate } from '@/lib/repo/periods';
import {
  addShoppingCatalogAlias,
  addShoppingListItem,
  createShoppingCatalogItem,
  watchShoppingCatalog,
  watchShoppingLists,
  type ShoppingCatalogItem,
  type ShoppingList,
} from '@/lib/repo/shopping';
import { planCatalogWrite, searchCatalog, suggestCatalogMatches, type AddChoice } from '@/lib/rules/catalogMatch';
import { useAuthUser } from '@/providers/AuthProvider';
import { useWorkspace } from '@/providers/WorkspaceProvider';

type Props = { open: boolean; uid: string | null | undefined; onDone: (message: string) => void; onGo: (href: string) => void };

/**
 * BUDG-8 S10 "Shopping item" in the Add sheet: pick a list, type 2-3 letters, tap a catalog
 * suggestion (reuse, BUDG-4 AC-2) or add a new name with the duplicate hint (Use existing /
 * Keep separate, never merged on its own) and Save to catalog or list only. Same repo calls as
 * the Shopping screen; quantity, unit and note are edited on the list.
 */
export function ShoppingItemSegment({ open, uid, onDone, onGo }: Props) {
  const { activePeriodId } = useWorkspace();
  const myUid = useAuthUser()?.uid || '';
  const targetPid = activePeriodId || periodIdFromDate();
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [catalog, setCatalog] = useState<ShoppingCatalogItem[]>([]);
  const [listId, setListId] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(''); // a typed name waiting for the duplicate choice
  const [choice, setChoice] = useState('');
  const [saveToCatalog, setSaveToCatalog] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open || !uid) return;
    const stopLists = watchShoppingLists(uid, (rows) => setLists(rows.filter((r) => !String(r.periodId || '').trim() || r.periodId === targetPid)));
    const stopCatalog = watchShoppingCatalog(uid, setCatalog);
    return () => {
      stopLists();
      stopCatalog();
    };
  }, [open, uid, targetPid]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPending('');
    setChoice('');
    setSaveToCatalog(true);
    setError('');
    setNotice('');
  }, [open]);

  useEffect(() => {
    if (lists?.length && !lists.some((l) => l.id === listId)) setListId(lists[0].id || '');
  }, [lists, listId]);

  const list = lists?.find((l) => l.id === listId);
  const mirror = list?.shareId && myUid ? { shareId: list.shareId, actorUid: myUid } : undefined;
  const suggestions = useMemo(() => searchCatalog(name, catalog, 6), [name, catalog]);
  const candidates = useMemo(() => (pending ? suggestCatalogMatches({ name: pending }, catalog) : []), [pending, catalog]);

  async function add(item: { name: string; catalog?: ShoppingCatalogItem; catalogItemId: string }) {
    if (!uid || !listId) return;
    setBusy(true);
    setError('');
    try {
      await addShoppingListItem(
        uid,
        listId,
        {
          name: item.name,
          quantity: 1,
          price: item.catalog?.lastPrice || 0,
          category: item.catalog?.category || '',
          tags: item.catalog?.tags || [],
          catalogItemId: item.catalogItemId,
          assignedPlanItemId: item.catalog?.assignedPlanItemId || '',
          assignedPlanItemName: item.catalog?.assignedPlanItemName || '',
          assignedGroup: item.catalog?.assignedGroup,
          bought: false,
          completed: false,
        },
        mirror
      );
      setName('');
      setPending('');
      setChoice('');
      const message = `${item.name} added to ${list?.name || 'the list'}.`;
      setNotice(message);
      onDone(message);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not add the item.');
    } finally {
      setBusy(false);
    }
  }

  async function addTyped() {
    if (!uid) return;
    const typed = pending.trim();
    const c: AddChoice = choice.startsWith('use:')
      ? { kind: 'use-existing', catalogItemId: choice.slice(4) }
      : choice === 'keep'
        ? { kind: 'keep-separate', saveToCatalog }
        : { kind: 'new', saveToCatalog };
    try {
      const write = planCatalogWrite(c, candidates.length);
      if (write.catalog === 'reuse') {
        const row = catalog.find((r) => r.id === write.catalogItemId);
        if (write.addAlias && row && row.name.trim().toLowerCase() !== typed.toLowerCase()) await addShoppingCatalogAlias(uid, write.catalogItemId, typed);
        return add({ name: row?.name || typed, catalog: row, catalogItemId: write.catalogItemId });
      }
      const catalogItemId = write.catalog === 'create' ? await createShoppingCatalogItem(uid, { name: typed, category: '' }) : '';
      return add({ name: typed, catalogItemId });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not add the item.');
    }
  }

  if (lists === null) return <Text className="text-base text-muted-foreground dark:text-zinc-400">Loading your lists…</Text>;
  if (!lists.length) return <EmptyState icon="cart-outline" message="Make a list for your next shop." actionLabel="Go to Shopping" onAction={() => onGo('/shopping')} />;

  return (
    <View className="gap-4" testID="add-shopping-item">
      <View className="gap-2">
        <Text nativeID="add-to-list" className="text-sm font-medium text-foreground dark:text-zinc-50">Add to</Text>
        <View className="flex-row flex-wrap gap-2" aria-labelledby="add-to-list">
          {lists.map((l) => {
            const on = l.id === listId;
            return (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                aria-pressed={on}
                onPress={() => setListId(l.id || '')}
                className={cn('h-11 max-w-full justify-center rounded-full border px-4', on ? 'border-primary bg-primary dark:border-zinc-100 dark:bg-zinc-50' : 'border-border bg-card dark:border-zinc-800 dark:bg-zinc-900')}
              >
                <Text numberOfLines={1} className={cn('text-sm font-medium', on ? 'text-white dark:text-zinc-900' : 'text-foreground dark:text-zinc-50')}>{l.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <AddItemBar
        value={name}
        onChangeText={(v) => {
          setName(v);
          setPending('');
          setChoice('');
        }}
        onSubmit={() => name.trim() && setPending(name.trim())}
        suggestions={pending ? undefined : suggestions.filter((r) => r.id).map((r) => ({ id: r.id as string, name: r.name, sub: [r.category, (r.lastPrice || 0) > 0 ? `last ${fmtMoney(r.lastPrice || 0)} each` : 'No comparable price'].filter(Boolean).join(' · ') }))}
        onPick={(id) => {
          const row = catalog.find((r) => r.id === id);
          if (row) void add({ name: row.name, catalog: row, catalogItemId: id });
        }}
        offerNew={!catalog.some((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())}
        error={error}
      />
      {pending ? (
        <View className="gap-3">
          {candidates.length ? (
            <View className="gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <Text className="text-sm font-semibold text-amber-700 dark:text-amber-300">Already in your catalog?</Text>
              {candidates.map((m) => (
                <View key={m.item.id} className="flex-row flex-wrap items-center gap-2">
                  <Text className="min-w-0 flex-1 text-base text-foreground dark:text-zinc-50" numberOfLines={1}>{m.item.name}</Text>
                  <AppButton label={choice === `use:${m.item.id}` ? 'Using this' : 'Use existing'} size="touch" variant={choice === `use:${m.item.id}` ? 'primary' : 'outline'} onPress={() => setChoice(`use:${m.item.id}`)} />
                </View>
              ))}
              <AppButton label={choice === 'keep' ? 'Keeping separate' : 'Keep separate'} size="touch" variant={choice === 'keep' ? 'primary' : 'outline'} className="self-start" onPress={() => setChoice('keep')} />
            </View>
          ) : null}
          {!choice.startsWith('use:') ? (
            <View className="min-h-11 flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-base text-foreground dark:text-zinc-50">Save to catalog for next time</Text>
              <Switch value={saveToCatalog} onValueChange={setSaveToCatalog} accessibilityLabel="Save to catalog" />
            </View>
          ) : null}
          <AppButton className="dark:bg-zinc-50" label={busy ? 'Adding…' : `Add "${pending}" to list`} size="touch-lg" textClassName="text-base dark:text-zinc-900" disabled={busy || (candidates.length > 0 && !choice)} onPress={() => void addTyped()} />
        </View>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite" className="text-base text-foreground dark:text-zinc-50">{notice}</Text> : null}
      <Text className="text-sm text-muted-foreground dark:text-zinc-400">Ticking an item off never posts money.</Text>
    </View>
  );
}
