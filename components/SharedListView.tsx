// Chef view of exactly one shared list (BUDG-4 AC-4/AC-5, SEC-9). Only the
// chef-visible fields exist here: no prices, totals, catalog or budget data.
// On any listener error (revoke = permission-denied) both listeners are torn down
// and the in-memory items are cleared.
// BUDG-8 S11: same layout as the household list (AddItemBar, ItemRow sections, ItemSheet) minus
// prices, footer, receipts, catalog and totals.
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AccessEndedState, EmptyState, LoadingState } from '@/components/patterns/States';
import { AddItemBar } from '@/components/shopping/AddItemBar';
import { ItemRow, ItemSection, qtyLabel } from '@/components/shopping/ItemRow';
import { ItemSheet } from '@/components/shopping/ItemSheet';
import { AppButton } from '@/components/ui/AppButton';
import { db } from '@/lib/firebase';
import { displayListName } from '@/lib/repo/sharedListsCore';
import { leaveShareIn } from '@/lib/repo/sharedListsOps';
import { useSheetEffects } from '@/components/shopping/useSheetEffects';
import {
  addSharedItem,
  deleteSharedItem,
  updateSharedItem,
  watchShare,
  watchSharedItems,
  type SharedItem,
  type SharedList,
} from '@/lib/repo/sharedLists';

type Draft = { id: string; name: string; quantity: string; unit: string; category: string; note: string };

export function SharedListView({ shareId, myUid, onBack, showBack = true }: { shareId: string; myUid: string; onBack: () => void; showBack?: boolean }) {
  const [share, setShare] = useState<SharedList | null>(null);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [ended, setEnded] = useState(false);
  const [newName, setNewName] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  useSheetEffects(Boolean(draft), () => setDraft(null));

  useEffect(() => {
    let stopItems: (() => void) | null = null;
    const end = () => {
      stopItems?.();
      stopItems = null;
      setItems([]);
      setEnded(true);
    };
    const stopShare = watchShare(
      shareId,
      (row) => {
        if (!row || row.status !== 'ACTIVE') return end();
        setShare(row);
        if (!stopItems) stopItems = watchSharedItems(shareId, setItems, end);
      },
      end
    );
    return () => {
      stopShare();
      stopItems?.();
    };
  }, [shareId]);

  async function run(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'permission-denied') {
        setItems([]);
        setEnded(true);
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  }

  async function addQuick() {
    const name = newName.trim();
    if (!name) return;
    await run(() => addSharedItem(shareId, myUid, { name, quantity: 1, status: 'TO_BUY' }));
    setNewName('');
  }

  async function saveDraft() {
    if (!draft) return;
    const quantity = Number(draft.quantity || '0');
    if (!draft.name.trim()) return setError('Item name is required.');
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 9999) return setError('Quantity must be 0 to 9999.');
    const fields = { name: draft.name.trim(), quantity, unit: draft.unit, category: draft.category.trim(), note: draft.note.trim() };
    await run(() => (draft.id ? updateSharedItem(shareId, myUid, draft.id, fields) : addSharedItem(shareId, myUid, { ...fields, status: 'TO_BUY' })));
    setDraft(null);
  }

  const back = showBack ? (
    <AppButton label="‹ Lists" variant="ghost" size="touch" className="self-start px-1" accessibilityLabel="Back to lists" onPress={onBack} />
  ) : null;

  if (ended) {
    return (
      <View className="gap-4" testID="chef-access-ended">
        {back}
        <Text role="heading" aria-level={2} className="text-xl font-bold text-foreground dark:text-zinc-50">Access ended</Text>
        <AccessEndedState />
      </View>
    );
  }
  if (!share) return <LoadingState testID="shared-loading" />;

  const toBuy = items.filter((i) => i.status !== 'GOT_IT');
  const got = items.filter((i) => i.status === 'GOT_IT');
  const row = (item: SharedItem) => (
    <ItemRow
      key={item.id}
      testID="shopping-item"
      name={item.name}
      qty={qtyLabel(item.quantity, item.unit)}
      sub={[item.note, item.category].filter(Boolean).join(' · ') || undefined}
      got={item.status === 'GOT_IT'}
      onToggle={() => void run(() => updateSharedItem(shareId, myUid, item.id!, { status: item.status === 'GOT_IT' ? 'TO_BUY' : 'GOT_IT' }))}
      onPress={() => setDraft({ id: item.id!, name: item.name, quantity: String(item.quantity ?? 1), unit: item.unit || '', category: item.category || '', note: item.note || '' })}
    />
  );
  const editing = draft?.id ? items.find((i) => i.id === draft.id) : undefined;

  return (
    <View className="min-h-0 flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-6" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          {back}
          <Text role="heading" aria-level={2} className="text-xl font-bold text-foreground dark:text-zinc-50" numberOfLines={2}>{displayListName(share.listName) || 'Shared list'}</Text>
          <Text className="text-xs text-muted-foreground dark:text-zinc-400">Shared by the household · you can add items and tick them off</Text>
        </View>
        <AddItemBar value={newName} onChangeText={setNewName} onSubmit={() => void addQuick()} error={error} />
        {!items.length ? <EmptyState icon="playlist-plus" message="Add the first item above." testID="list-empty" /> : null}
        {items.length && !toBuy.length ? (
          <View className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 md:p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
            <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{`All ${items.length} item${items.length === 1 ? '' : 's'} got.`}</Text>
          </View>
        ) : null}
        {toBuy.length ? <ItemSection title="To buy" count={toBuy.length}>{toBuy.map(row)}</ItemSection> : null}
        {got.length ? <ItemSection title="Got it" count={got.length}>{got.map(row)}</ItemSection> : null}
        {share.chefUid === myUid ? (
          <View className="gap-2" testID="chef-leave">
            {confirmLeave ? (
              <>
                <Text className="text-sm text-foreground dark:text-zinc-50">Leave this list? The household keeps it; you lose access.</Text>
                <View className="flex-row flex-wrap gap-2">
                  <AppButton label="Leave" variant="destructive" size="touch" accessibilityLabel="Confirm leave this list" onPress={() => void run(() => leaveShareIn(db, shareId))} />
                  <AppButton label="Cancel" variant="ghost" size="touch" accessibilityLabel="Keep this list" onPress={() => setConfirmLeave(false)} />
                </View>
              </>
            ) : (
              <AppButton label="Leave this list" variant="ghost" size="touch" className="self-start px-1" accessibilityLabel="Leave this list" onPress={() => setConfirmLeave(true)} />
            )}
          </View>
        ) : null}
      </ScrollView>

      <ItemSheet
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit item' : 'Add item'}
        draft={draft || { name: '', quantity: '1', unit: '', category: '', note: '' }}
        onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
        error={error}
        saveLabel="Save"
        onSave={() => void saveDraft()}
        onDelete={
          editing && editing.createdBy === myUid
            ? () => {
                void run(() => deleteSharedItem(shareId, editing.id!));
                setDraft(null);
              }
            : undefined
        }
      />
    </View>
  );
}
