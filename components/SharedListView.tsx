// Chef view of exactly one shared list (BUDG-4 AC-4/AC-5, SEC-9). Only the
// chef-visible fields exist here: no prices, totals, catalog or budget data.
// On any listener error (revoke = permission-denied) both listeners are torn down
// and the in-memory items are cleared.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppModal } from '@/components/ui/AppModal';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { cn } from '@/lib/cn';
import { SHOPPING_UNITS } from '@/lib/rules/catalogMatch';
import {
  addSharedItem,
  deleteSharedItem,
  updateSharedItem,
  watchShare,
  watchSharedItems,
  type SharedItem,
  type SharedList,
} from '@/lib/repo/sharedLists';

const UNIT_OPTIONS = [{ label: 'No unit', value: '' }, ...SHOPPING_UNITS.map((u) => ({ label: u, value: u }))];
type Draft = { id: string; name: string; quantity: string; unit: string; category: string; note: string };

export function SharedListView({ shareId, myUid, onBack }: { shareId: string; myUid: string; onBack: () => void }) {
  const [share, setShare] = useState<SharedList | null>(null);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [ended, setEnded] = useState(false);
  const [newName, setNewName] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

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

  if (ended) {
    return (
      <AppCard className="flex-1 border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
        <View className="flex-1 items-center justify-center gap-3 py-8">
          <Text className="text-lg font-bold text-foreground dark:text-zinc-50">Access ended</Text>
          <Text className="text-center text-sm text-muted-foreground dark:text-zinc-400">The household stopped sharing this list.</Text>
          <AppButton label="Back to lists" variant="outline" onPress={onBack} />
        </View>
      </AppCard>
    );
  }

  return (
    <View className="flex-1 gap-3">
      <AppCard className="flex-1 border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
        <View className="mb-3 gap-1">
          <Pressable onPress={onBack} className="flex-row items-center gap-1">
            <MaterialCommunityIcons name="chevron-left" size={20} color="#717182" />
            <Text className="font-medium text-primary dark:text-blue-400">Lists</Text>
          </Pressable>
          <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{share?.listName || 'Shared list'}</Text>
          <Text className="text-xs font-medium text-muted-foreground">Shared with you · you can add items and check them off</Text>
        </View>

        <View className="mb-3 flex-row gap-2">
          <AppInput value={newName} onChangeText={setNewName} placeholder="Add item..." className="flex-1" style={{ height: 56 }} onSubmitEditing={() => void addQuick()} />
          <AppButton label="Add" onPress={() => void addQuick()} />
        </View>
        {error ? <Text className="mb-2 text-xs text-destructive">{error}</Text> : null}

        <ScrollView className="flex-1">
          {items.map((item) => {
            const got = item.status === 'GOT_IT';
            return (
              <View key={item.id} className="flex-row items-center justify-between gap-2 border-b border-border p-3 dark:border-zinc-800">
                <View className="flex-row flex-1 items-center gap-3">
                  <Switch
                    value={got}
                    accessibilityLabel={`${got ? 'Got it' : 'To buy'}: ${item.name}`}
                    onValueChange={() => void run(() => updateSharedItem(shareId, myUid, item.id!, { status: got ? 'TO_BUY' : 'GOT_IT' }))}
                  />
                  <Pressable
                    className="flex-1 py-1"
                    onPress={() => setDraft({ id: item.id!, name: item.name, quantity: String(item.quantity ?? 1), unit: item.unit || '', category: item.category || '', note: item.note || '' })}
                  >
                    <Text className={cn('text-foreground dark:text-zinc-100', got && 'text-muted-foreground line-through dark:text-zinc-500')}>
                      {item.name} {item.quantity && (item.quantity > 1 || item.unit) ? `(x${item.quantity}${item.unit ? ` ${item.unit}` : ''})` : ''}
                    </Text>
                    {item.category || item.note ? (
                      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                        {[item.category, item.note].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
                {item.createdBy === myUid ? (
                  <IconActionButton icon="trash-can-outline" label="Delete item" variant="danger" onPress={() => void run(() => deleteSharedItem(shareId, item.id!))} />
                ) : null}
              </View>
            );
          })}
          {!items.length ? <Text className="py-8 text-center text-muted-foreground dark:text-zinc-400">No items yet</Text> : null}
        </ScrollView>
      </AppCard>

      <AppModal open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? 'Edit Item' : 'Add Item'}>
        {draft ? (
          <View className="gap-3">
            <AppInput value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="Item name" />
            <View className="flex-row gap-2">
              <AppInput value={draft.quantity} onChangeText={(v) => setDraft({ ...draft, quantity: v })} placeholder="Qty" keyboardType="numeric" className="w-20 text-center" />
              <View className="flex-1">
                <DropdownField value={draft.unit} options={UNIT_OPTIONS} onChange={(v) => setDraft({ ...draft, unit: v })} placeholder="Unit" menuStrategy="inline" />
              </View>
            </View>
            <AppInput value={draft.category} onChangeText={(v) => setDraft({ ...draft, category: v })} placeholder="Category" />
            <AppInput value={draft.note} onChangeText={(v) => setDraft({ ...draft, note: v })} placeholder="Note" />
            <View className="flex-row gap-2">
              <AppButton label="Cancel" variant="outline" className="flex-1" onPress={() => setDraft(null)} />
              <AppButton label="Save" className="flex-1" textClassName="text-white" onPress={() => void saveDraft()} />
            </View>
          </View>
        ) : null}
      </AppModal>
    </View>
  );
}
