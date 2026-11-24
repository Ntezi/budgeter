// BUDG-43 AC-3: "To approve" at the top of the Catalog page. Items added from a shopping list
// (by the household or by the chef on a shared list) wait here; they work on lists meanwhile.
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSheet } from '@/components/patterns/AppSheet';
import { cn } from '@/lib/cn';
import { db } from '@/lib/firebase';
import { approvePendingIn, removePendingIn, mergePendingIntoIn } from '@/lib/repo/catalogPendingOps';
import { pendingOriginLabel } from '@/lib/rules/catalogPending';
import { searchCatalog } from '@/lib/rules/catalogMatch';
import type { ShoppingCatalogItem } from '@/lib/repo/shopping';

function addedOn(value: unknown): string {
  const d = value && typeof (value as { toDate?: () => Date }).toDate === 'function' ? (value as { toDate: () => Date }).toDate() : null;
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PendingBadge({ count }: { count: number }) {
  if (!count) return null;
  return <AppBadge label={`To approve (${count})`} variant="warning" />;
}

export function PendingSection({ uid, pending, approved, onError }: { uid: string; pending: ShoppingCatalogItem[]; approved: ShoppingCatalogItem[]; onError: (message: string) => void }) {
  const [busy, setBusy] = useState('');
  const [mergeFor, setMergeFor] = useState<ShoppingCatalogItem | null>(null);
  const [search, setSearch] = useState('');
  const choices = useMemo(() => {
    const pool = approved.filter((row) => row.id);
    return (search.trim() ? searchCatalog(search, pool, 30) : pool.slice(0, 30));
  }, [approved, search]);

  if (!pending.length) return null;

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Could not update the catalog.');
    } finally {
      setBusy('');
    }
  }

  return (
    <View className="gap-2" testID="catalog-pending">
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50" accessibilityRole="header">{`To approve (${pending.length})`}</Text>
      </View>
      <Text className="text-xs text-muted-foreground dark:text-zinc-400">Added from a shopping list. They work on lists now; approve to keep them, or merge with an item you have.</Text>
      <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
        {pending.map((row, i) => {
          const id = row.id as string;
          const when = addedOn(row.addedAt);
          return (
            <View key={id} testID={`pending-row-${id}`} className={cn('gap-2 px-4 py-2.5 lg:px-3 lg:py-2', i > 0 && 'border-t border-border dark:border-zinc-800')}>
              <View className="min-w-0">
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{row.name}</Text>
                <Text className="text-xs text-muted-foreground dark:text-zinc-400" numberOfLines={2}>
                  {[pendingOriginLabel(row), when].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <AppButton label="Approve" variant="outline" size="touch" disabled={busy === id} accessibilityLabel={`Approve ${row.name}`} onPress={() => void act(id, () => approvePendingIn(db, uid, id))} />
                <AppButton label="Use existing" variant="ghost" size="touch" disabled={busy === id || !approved.length} accessibilityLabel={`Use existing for ${row.name}`} onPress={() => { setSearch(''); setMergeFor(row); }} />
                <AppButton label="Remove" variant="ghost" size="touch" disabled={busy === id} accessibilityLabel={`Remove ${row.name}`} onPress={() => void act(id, () => removePendingIn(db, uid, id))} />
              </View>
            </View>
          );
        })}
      </View>
      <AppSheet open={Boolean(mergeFor)} onClose={() => setMergeFor(null)} title={mergeFor ? `Use an existing item for ${mergeFor.name}` : 'Use existing'} testID="pending-use-existing-sheet">
        {mergeFor ? (
          <View className="gap-3">
            <Text className="text-xs text-muted-foreground dark:text-zinc-400">List items that use this name point to the item you pick. The name is kept as another spelling of it.</Text>
            <AppInput value={search} onChangeText={setSearch} placeholder="Search items" accessibilityLabel="Search existing items" />
            <View className="overflow-hidden rounded-xl border border-border dark:border-zinc-800">
              {choices.map((row, i) => (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${row.name}`}
                  onPress={() => {
                    const target = mergeFor;
                    setMergeFor(null);
                    void act(target.id as string, () => mergePendingIntoIn(db, uid, { id: target.id as string, name: target.name }, row.id as string));
                  }}
                  className={cn('min-h-11 lg:min-h-9 justify-center px-4 py-2 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60', i > 0 && 'border-t border-border dark:border-zinc-800')}
                >
                  <Text className="text-sm text-foreground dark:text-zinc-50" numberOfLines={1}>{row.name}</Text>
                </Pressable>
              ))}
              {!choices.length ? <Text className="px-4 py-2 text-sm text-muted-foreground dark:text-zinc-400">No items match this search.</Text> : null}
            </View>
          </View>
        ) : null}
      </AppSheet>
    </View>
  );
}
