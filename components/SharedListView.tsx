// Chef view of exactly one shared list (BUDG-4 AC-4/AC-5, SEC-9). Only the
// chef-visible fields exist here: no prices, totals, catalog or budget data.
// On any listener error (revoke = permission-denied) both listeners are torn down
// and the in-memory items are cleared.
// BUDG-8 S11: same layout as the household list (AddItemBar, ItemRow sections, ItemSheet) minus
// prices, footer, receipts, catalog and totals.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AccessEndedState, EmptyState, LoadingState } from '@/components/patterns/States';
import { AddItemBar } from '@/components/shopping/AddItemBar';
import { ItemRow, ItemSection, qtyLabel } from '@/components/shopping/ItemRow';
import { ItemSheet } from '@/components/shopping/ItemSheet';
import { AppButton } from '@/components/ui/AppButton';
import { db } from '@/lib/firebase';
import { displayListName } from '@/lib/repo/sharedListsCore';
import { leaveShareIn } from '@/lib/repo/sharedListsOps';
import { useSheetEffects } from '@/components/shopping/useSheetEffects';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { RemoveConfirmDialog, SelectBar, UndoNotice, useSelectModeEffects } from '@/components/shopping/RemoveControls';
import { removeShoppingItemsIn, restoreShoppingItemsIn, type RemovedSnapshot } from '@/lib/repo/shoppingRemoveOps';
import { CHEF_REMOVE_REASON, chefCanRemove, pruneSelected, toggleSelectAll, toggleSelected } from '@/lib/rules/shoppingRemoval';
import { cn } from '@/lib/cn';
import {
  addSharedItem,
  deleteSharedItem,
  updateSharedItem,
  watchShare,
  watchSharedItems,
  watchCatalogCopy,
  type CatalogCopyRow,
  type SharedItem,
  type SharedList,
} from '@/lib/repo/sharedLists';
import { searchCatalog } from '@/lib/rules/catalogMatch';

type Draft = { id: string; name: string; quantity: string; unit: string; category: string; note: string };

export function SharedListView({ shareId, myUid, onBack, showBack = true }: { shareId: string; myUid: string; onBack: () => void; showBack?: boolean }) {
  const [share, setShare] = useState<SharedList | null>(null);
  const [items, setItems] = useState<SharedItem[]>([]);
  // BUDG-43 AC-4: the owner's catalog as names, units and categories only (sharedLists/{shareId}/catalog).
  const [catalog, setCatalog] = useState<CatalogCopyRow[]>([]);
  const [ended, setEnded] = useState(false);
  const [newName, setNewName] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  useSheetEffects(Boolean(draft), () => setDraft(null));
  // BUDG-42: the chef removes only the items the chef added (firestore.rules); the rest show why not.
  const optionsSheet = useSheet();
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [removeAsk, setRemoveAsk] = useState<null | { ids: string[] }>(null);
  const [removing, setRemoving] = useState(false);
  const [undo, setUndo] = useState<null | { key: number; name: string; snapshots: RemovedSnapshot[] }>(null);
  const removeAskRef = useRef(false);
  removeAskRef.current = Boolean(removeAsk);
  useSelectModeEffects(selectMode, () => {
    if (!removeAskRef.current) setSelectMode(false);
  });
  const ownIds = items.filter((i) => i.id && chefCanRemove(i, myUid)).map((i) => i.id as string);
  const ownKey = ownIds.join('|');
  useEffect(() => {
    setPicked((prev) => pruneSelected(prev, ownKey ? ownKey.split('|') : []));
  }, [ownKey]);

  async function removeOne(item: SharedItem) {
    await run(async () => {
      const { snapshots } = await removeShoppingItemsIn(db, { shareId }, [{ id: item.id!, private: false, shared: true }], { snapshot: true });
      setUndo({ key: Date.now(), name: item.name, snapshots });
    });
  }
  async function confirmRemove() {
    if (!removeAsk) return;
    setRemoving(true);
    await run(() => removeShoppingItemsIn(db, { shareId }, removeAsk.ids.map((id) => ({ id, private: false, shared: true }))));
    setRemoving(false);
    setRemoveAsk(null);
    setSelectMode(false);
    setPicked([]);
  }

  useEffect(() => {
    let stopItems: (() => void) | null = null;
    let stopCatalog: (() => void) | null = null;
    const end = () => {
      stopItems?.();
      stopItems = null;
      stopCatalog?.();
      stopCatalog = null;
      setCatalog([]);
      setItems([]);
      setEnded(true);
    };
    const stopShare = watchShare(
      shareId,
      (row) => {
        if (!row || row.status !== 'ACTIVE') return end();
        setShare(row);
        if (!stopItems) stopItems = watchSharedItems(shareId, setItems, end);
        // A copy that cannot be read (older share without one) only means no suggestions.
        if (!stopCatalog) stopCatalog = watchCatalogCopy(shareId, setCatalog, () => setCatalog([]));
      },
      end
    );
    return () => {
      stopShare();
      stopItems?.();
      stopCatalog?.();
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
    // A typed name that is the owner's catalog item takes its unit and category too.
    const hit = catalog.find((row) => row.name.trim().toLowerCase() === name.toLowerCase());
    await run(() => addSharedItem(shareId, myUid, { name: hit?.name || name, quantity: 1, unit: hit?.unit || undefined, category: hit?.category || undefined, status: 'TO_BUY' }));
    setNewName('');
  }

  async function addPicked(id: string) {
    const row = catalog.find((r) => r.id === id);
    if (!row) return;
    await run(() => addSharedItem(shareId, myUid, { name: row.name, quantity: 1, unit: row.unit || undefined, category: row.category || undefined, status: 'TO_BUY' }));
    setNewName('');
  }
  const typedName = newName.trim().toLowerCase();
  const chefSuggestions = typedName ? searchCatalog(newName, catalog, 8).map((row) => ({ id: row.id, name: row.name })) : [];

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
      sub={[item.note, item.category, ...(item.tags || [])].filter(Boolean).join(' · ') || undefined}
      got={item.status === 'GOT_IT'}
      onToggle={() => void run(() => updateSharedItem(shareId, myUid, item.id!, { status: item.status === 'GOT_IT' ? 'TO_BUY' : 'GOT_IT' }))}
      onPress={() => setDraft({ id: item.id!, name: item.name, quantity: String(item.quantity ?? 1), unit: item.unit || '', category: item.category || '', note: item.note || '' })}
      onRemove={chefCanRemove(item, myUid) ? () => void removeOne(item) : undefined}
      removeBlockedReason={chefCanRemove(item, myUid) ? undefined : CHEF_REMOVE_REASON}
      onLongPress={() => {
        setUndo(null);
        setPicked(chefCanRemove(item, myUid) ? [item.id!] : []);
        setSelectMode(true);
      }}
      selectMode={selectMode}
      selected={picked.includes(item.id!)}
      onSelect={chefCanRemove(item, myUid) ? () => setPicked((prev) => toggleSelected(prev, item.id!)) : undefined}
    />
  );
  const editing = draft?.id ? items.find((i) => i.id === draft.id) : undefined;

  return (
    <View className="min-h-0 flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-6" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          {back}
          <View className="flex-row items-start gap-2">
            <Text role="heading" aria-level={2} className="min-w-0 flex-1 text-xl font-bold text-foreground dark:text-zinc-50" numberOfLines={2}>{displayListName(share.listName) || 'Shared list'}</Text>
            {items.length ? (
              <AppButton accessibilityLabel="List options" variant="outline" size="touch" className="w-11 lg:w-9 px-0" onPress={(e) => optionsSheet.show(e)}>
                <MaterialCommunityIcons name="dots-horizontal" size={22} color="#717182" />
              </AppButton>
            ) : null}
          </View>
          <Text className="text-xs text-muted-foreground dark:text-zinc-400">Shared by the household · you can add items and tick them off</Text>
        </View>
        {selectMode ? (
          <SelectBar
            count={picked.length}
            allSelected={ownIds.length > 0 && picked.length === ownIds.length}
            onSelectAll={() => setPicked((prev) => toggleSelectAll(prev, ownIds))}
            onRemove={() => setRemoveAsk({ ids: picked })}
            onCancel={() => setSelectMode(false)}
          />
        ) : (
          <AddItemBar
            value={newName}
            onChangeText={setNewName}
            onSubmit={() => void addQuick()}
            suggestions={catalog.length ? chefSuggestions : undefined}
            onPick={(id) => void addPicked(id)}
            offerNew={!chefSuggestions.some((s) => s.name.trim().toLowerCase() === typedName)}
            error={error}
          />
        )}
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

      {undo ? (
        <UndoNotice
          key={undo.key}
          name={undo.name}
          onDone={() => setUndo(null)}
          onUndo={() => {
            const last = undo;
            setUndo(null);
            void run(() => restoreShoppingItemsIn(db, last.snapshots, myUid));
          }}
        />
      ) : null}
      <AppSheet open={optionsSheet.open} onClose={() => optionsSheet.hide()} title={displayListName(share.listName) || 'List options'} testID="list-options">
        <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          {[
            { label: 'Select items', run: () => { setUndo(null); setPicked([]); setSelectMode(true); }, disabled: !ownIds.length },
            ...(got.some((i) => chefCanRemove(i, myUid))
              ? [{ label: `Remove got items you added (${got.filter((i) => chefCanRemove(i, myUid)).length})`, run: () => setRemoveAsk({ ids: got.filter((i) => chefCanRemove(i, myUid)).map((i) => i.id!) }), danger: true }]
              : []),
            ...(ownIds.length === items.length ? [{ label: 'Remove all items', run: () => setRemoveAsk({ ids: ownIds }), danger: true }] : []),
          ].map((action, i) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              disabled={action.disabled}
              onPress={() => optionsSheet.hide(action.run)}
              className={cn('min-h-11 lg:min-h-9 justify-center px-4 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60', i > 0 && 'border-t border-border dark:border-zinc-800', action.disabled && 'opacity-50')}
            >
              <Text className={cn('text-sm font-medium', action.danger ? 'text-destructive dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>{action.label}</Text>
            </Pressable>
          ))}
          {ownIds.length < items.length ? (
            <Text className="border-t border-border px-4 py-2 text-xs text-muted-foreground dark:border-zinc-800 dark:text-zinc-400">You can remove only the items you added.</Text>
          ) : null}
        </View>
      </AppSheet>
      <RemoveConfirmDialog
        open={Boolean(removeAsk)}
        count={removeAsk?.ids.length || 0}
        listName={displayListName(share.listName) || 'this list'}
        busy={removing}
        onClose={() => setRemoveAsk(null)}
        onConfirm={() => void confirmRemove()}
      />
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
