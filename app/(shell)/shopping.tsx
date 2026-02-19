import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  addShoppingList,
  addShoppingListItem,
  deleteShoppingList,
  deleteShoppingListItem,
  type ShoppingList,
  type ShoppingListItem,
  updateShoppingList,
  updateShoppingListItem,
  watchShoppingListItems,
  watchShoppingLists,
} from '@/lib/repo/shopping';
import { addTransaction } from '@/lib/repo/transactions';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { fmtMoney, parseMoney } from '@/lib/format';
import { planGroupLabel } from '@/lib/groups';
import { firstTag, parseTagsInput, tagsLabel, tagsToInput } from '@/lib/tags';

type PlanOption = { id: string; label: string; group: PlanItem['group'] };
type Suggestion = {
  name: string;
  tags: string[];
  assignedPlanItemId?: string;
  assignedPlanItemName?: string;
  assignedGroup?: PlanItem['group'];
};

export default function ShoppingScreen() {
  const uid = useWorkspaceUid();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [itemsByListId, setItemsByListId] = useState<Record<string, ShoppingListItem[]>>({});

  const [listDraftName, setListDraftName] = useState('');
  const [itemDraftName, setItemDraftName] = useState('');
  const [itemDraftTags, setItemDraftTags] = useState<string[]>([]);
  const [itemDraftPlanId, setItemDraftPlanId] = useState('');
  const [listError, setListError] = useState('');
  const [itemError, setItemError] = useState('');
  const [tagFilter, setTagFilter] = useState('ALL');
  const [sortMode, setSortMode] = useState<'CREATED' | 'TAG'>('CREATED');

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [planByItemId, setPlanByItemId] = useState<Record<string, string>>({});
  const [assignErrorByItemId, setAssignErrorByItemId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!uid) return;
    return watchShoppingLists(uid, (rows) => {
      setLists(rows);
      setSelectedListId((prev) => {
        if (!prev) return '';
        return rows.some((row) => row.id === prev) ? prev : '';
      });
    });
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedListId) {
      setItems([]);
      return;
    }
    return watchShoppingListItems(uid, selectedListId, setItems);
  }, [uid, selectedListId]);

  useEffect(() => {
    if (!uid || !lists.length) {
      setItemsByListId({});
      return;
    }

    const unsubs = lists
      .filter((list): list is ShoppingList & { id: string } => Boolean(list.id))
      .map((list) =>
        watchShoppingListItems(uid, list.id, (rows) => {
          setItemsByListId((prev) => ({ ...prev, [list.id]: rows }));
        })
      );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [uid, lists]);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, (next) => {
      setPeriods(next);
      if (!next.some((period) => period.id === selectedPid) && next[0]?.id) setSelectedPid(next[0].id);
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, rows) => setPlanItems(rows));
  }, [uid, selectedPid]);

  const selectedList = useMemo(() => lists.find((list) => list.id === selectedListId) || null, [lists, selectedListId]);

  const periodOptions = useMemo(
    () => periods.map((period) => ({ label: period.title || period.id, value: period.id })),
    [periods]
  );

  const planOptions = useMemo<PlanOption[]>(
    () =>
      planItems
        .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
        .map((row) => ({
          id: row.id,
          label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${planGroupLabel(row.group)}`,
          group: row.group,
        })),
    [planItems]
  );

  const allItems = useMemo(() => Object.values(itemsByListId).flat(), [itemsByListId]);

  const totals = useMemo(() => {
    const completed = allItems.filter((row) => row.completed === true).length;
    const pending = allItems.filter((row) => row.completed !== true).length;
    const spent = allItems.reduce((sum, row) => sum + (row.completed ? row.cost || 0 : 0), 0);
    return { completed, pending, spent };
  }, [allItems]);

  const tagOptions = useMemo(() => {
    const tags = [...new Set(items.flatMap((row) => row.tags || []))].sort((a, b) => a.localeCompare(b));
    return [{ label: 'All tags', value: 'ALL' }, ...tags.map((tag) => ({ label: `#${tag}`, value: tag }))];
  }, [items]);

  const displayItems = useMemo(() => {
    let out = items.filter((row) => row.completed !== true);
    if (tagFilter !== 'ALL') out = out.filter((row) => (row.tags || []).includes(tagFilter));
    if (sortMode === 'TAG') {
      out = [...out].sort((a, b) => {
        const ta = firstTag(a.tags);
        const tb = firstTag(b.tags);
        if (ta !== tb) return ta.localeCompare(tb);
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    return out;
  }, [items, sortMode, tagFilter]);

  const suggestionPool = useMemo<Suggestion[]>(() => {
    const byName = new Map<string, Suggestion>();
    allItems
      .filter((row) => row.completed === true)
      .forEach((row) => {
        const key = (row.name || '').trim().toLowerCase();
        if (!key || byName.has(key)) return;
        byName.set(key, {
          name: row.name,
          tags: row.tags ?? [],
          assignedPlanItemId: row.assignedPlanItemId,
          assignedPlanItemName: row.assignedPlanItemName,
          assignedGroup: row.assignedGroup as PlanItem['group'] | undefined,
        });
      });

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  const suggestionByName = useMemo(() => {
    const out: Record<string, Suggestion> = {};
    suggestionPool.forEach((row) => {
      out[row.name.trim().toLowerCase()] = row;
    });
    return out;
  }, [suggestionPool]);

  const suggestions = useMemo(() => {
    const q = itemDraftName.trim().toLowerCase();
    if (!q) return suggestionPool.slice(0, 8);
    return suggestionPool.filter((row) => row.name.toLowerCase().includes(q) && row.name.toLowerCase() !== q).slice(0, 8);
  }, [itemDraftName, suggestionPool]);

  function listPendingCount(list: ShoppingList) {
    const rows = list.id ? itemsByListId[list.id] || [] : [];
    return rows.filter((row) => row.completed !== true).length;
  }

  async function createList() {
    if (!uid) return;
    const name = listDraftName.trim();
    if (!name) {
      setListError('Shopping list name is required.');
      return;
    }
    await addShoppingList(uid, name);
    setListDraftName('');
    setListError('');
  }

  async function saveList(list: ShoppingList) {
    if (!uid || !list.id) return;
    if (!list.name.trim()) {
      setListError('Shopping list name cannot be empty.');
      return;
    }
    await updateShoppingList(uid, list.id, { name: list.name.trim() });
    setListError('');
  }

  async function removeList(list: ShoppingList) {
    if (!uid || !list.id) return;
    await deleteShoppingList(uid, list.id);
    if (selectedListId === list.id) setSelectedListId('');
  }

  async function addItem() {
    if (!uid || !selectedListId) return;
    const name = itemDraftName.trim();
    if (!name) {
      setItemError('Item name is required.');
      return;
    }

    const remembered = suggestionByName[name.toLowerCase()];
    const planId = itemDraftPlanId || remembered?.assignedPlanItemId || '';
    const plan = planOptions.find((option) => option.id === planId);

    await addShoppingListItem(uid, selectedListId, {
      name,
      tags: itemDraftTags,
      bought: false,
      completed: false,
      cost: 0,
      assignedPeriodId: selectedPid,
      assignedPlanItemId: plan?.id || remembered?.assignedPlanItemId || '',
      assignedPlanItemName: plan?.label || remembered?.assignedPlanItemName || '',
      assignedGroup: (plan?.group || remembered?.assignedGroup || undefined) as any,
    });

    setItemDraftName('');
    setItemDraftTags([]);
    setItemDraftPlanId('');
    setItemError('');
  }

  async function saveItem(row: ShoppingListItem) {
    if (!uid || !selectedListId || !row.id) return;
    if (!row.name.trim()) {
      setItemError('Item name is required.');
      return;
    }

    const planId = planByItemId[row.id] || row.assignedPlanItemId || '';
    const plan = planOptions.find((option) => option.id === planId);

    await updateShoppingListItem(uid, selectedListId, row.id, {
      name: row.name.trim(),
      tags: row.tags ?? [],
      cost: row.cost || 0,
      bought: row.bought === true,
      completed: row.completed === true,
      assignedPeriodId: selectedPid,
      assignedPlanItemId: plan?.id || '',
      assignedPlanItemName: plan?.label || '',
      assignedGroup: (plan?.group || undefined) as any,
    });
    setItemError('');
  }

  async function toggleBought(row: ShoppingListItem, bought: boolean) {
    if (!uid || !selectedListId || !row.id) return;
    setItems((prev) => prev.map((item) => (item.id === row.id ? { ...item, bought, completed: bought ? item.completed : false } : item)));
    await updateShoppingListItem(uid, selectedListId, row.id, {
      bought,
      completed: bought ? row.completed === true : false,
    });
  }

  async function completeItem(row: ShoppingListItem) {
    if (!uid || !selectedListId || !row.id) return;

    const cost = Number(row.cost || 0);
    if (!Number.isFinite(cost) || cost < 0) {
      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: 'Enter a valid cost before completing.' }));
      return;
    }

    if (row.assignedTxId) {
      await updateShoppingListItem(uid, selectedListId, row.id, {
        bought: true,
        completed: true,
        cost,
      });
      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: '' }));
      return;
    }

    const selectedPlanId = planByItemId[row.id] || row.assignedPlanItemId || '';
    const plan = planOptions.find((option) => option.id === selectedPlanId);
    const group = plan?.group ?? (row.assignedGroup as PlanItem['group'] | undefined) ?? 'NEED';
    const categoryId = plan?.id || row.assignedPlanItemId || '';

    const txPayload: Record<string, unknown> = {
      name: row.name,
      amount: cost,
      group,
      date: new Date().toISOString().slice(0, 10),
      note: `Shopping list "${selectedList?.name || ''}" item "${row.name}"`,
      shoppingListId: selectedListId,
      shoppingListName: selectedList?.name || '',
      shoppingItemId: row.id,
      shoppingItemName: row.name,
    };
    if (categoryId) txPayload.categoryId = categoryId;

    try {
      const txRef = await addTransaction(uid, selectedPid, txPayload as any);

      await updateShoppingListItem(uid, selectedListId, row.id, {
        bought: true,
        completed: true,
        cost,
        assignedPeriodId: selectedPid,
        assignedPlanItemId: categoryId,
        assignedPlanItemName: plan?.label || row.assignedPlanItemName || '',
        assignedGroup: (group || 'NEED') as any,
        assignedTxId: txRef.id,
      });

      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: '' }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: message || 'Could not complete item.' }));
    }
  }

  async function assignToBudget(row: ShoppingListItem) {
    if (!uid || !selectedListId || !selectedPid || !row.id) return;
    if (row.assignedTxId) return;

    const selectedPlanId = planByItemId[row.id] || row.assignedPlanItemId || '';
    const plan = planOptions.find((option) => option.id === selectedPlanId);
    if (!plan) {
      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: 'Choose a budget item first.' }));
      return;
    }

    const amount = Number(row.cost || 0);
    if (!row.completed || !Number.isFinite(amount) || amount < 0) {
      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: 'Complete item with cost before assigning.' }));
      return;
    }

    try {
      const txRef = await addTransaction(uid, selectedPid, {
        name: row.name,
        amount,
        group: plan.group,
        date: new Date().toISOString().slice(0, 10),
        categoryId: plan.id,
        note: `Shopping list "${selectedList?.name || ''}" item "${row.name}"`,
        shoppingListId: selectedListId,
        shoppingListName: selectedList?.name || '',
        shoppingItemId: row.id,
        shoppingItemName: row.name,
      } as any);

      await updateShoppingListItem(uid, selectedListId, row.id, {
        assignedPeriodId: selectedPid,
        assignedPlanItemId: plan.id,
        assignedPlanItemName: plan.label,
        assignedGroup: plan.group,
        assignedTxId: txRef.id,
      });

      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: '' }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setAssignErrorByItemId((prev) => ({ ...prev, [row.id || '']: message || 'Could not assign item.' }));
    }
  }

  async function removeItem(row: ShoppingListItem) {
    if (!uid || !selectedListId || !row.id) return;
    await deleteShoppingListItem(uid, selectedListId, row.id);
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Shopping Lists</Text>
        <Text className="text-sm text-muted-foreground">Create lists first, then open one list to manage its items.</Text>
      </View>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Lists</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{lists.length}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Pending items</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{totals.pending}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Completed spend</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{fmtMoney(totals.spent)}</Text>
        </AppCard>
      </View>

      {!selectedList ? (
        <AppCard className="gap-3">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Your Shopping Lists</Text>

          <View className="flex-row items-end gap-2">
            <View className="flex-1 gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">New List</Text>
              <AppInput value={listDraftName} onChangeText={setListDraftName} placeholder="e.g. Weekly Groceries" />
            </View>
            <IconActionButton icon="plus" label="Create list" onPress={createList} />
          </View>
          {listError ? <Text className="text-xs text-destructive">{listError}</Text> : null}

          <View className="gap-2">
            {lists.map((list) => (
              <View key={list.id} className="rounded-lg border border-border bg-card px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 gap-1">
                    <AppInput
                      value={list.name}
                      onChangeText={(value) => setLists((prev) => prev.map((row) => (row.id === list.id ? { ...row, name: value } : row)))}
                      className="h-8"
                    />
                    <Text className="text-xs text-muted-foreground">Pending items: {listPendingCount(list)}</Text>
                  </View>
                  <IconActionButton icon="content-save-outline" label="Save list name" onPress={() => saveList(list)} />
                  <IconActionButton icon="playlist-edit" label="Open list" onPress={() => setSelectedListId(list.id || '')} />
                  <IconActionButton icon="trash-can-outline" label="Delete list" variant="danger" onPress={() => removeList(list)} />
                </View>
              </View>
            ))}
            {!lists.length ? <Text className="text-xs text-muted-foreground">No lists yet. Create one.</Text> : null}
          </View>
        </AppCard>
      ) : (
        <AppCard className="gap-3">
          <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <View className="flex-row items-center gap-2">
              <IconActionButton icon="arrow-left" label="Back to lists" onPress={() => setSelectedListId('')} />
              <View>
                <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">{selectedList.name}</Text>
                <Text className="text-xs text-muted-foreground">Completed items are hidden and become suggestions.</Text>
              </View>
            </View>
            <View className="w-full md:w-72">
              <DropdownField
                value={selectedPid}
                options={periodOptions}
                onChange={setSelectedPid}
                placeholder="Select budget period"
                menuStrategy="overlay"
              />
            </View>
          </View>
          {!planOptions.length ? (
            <Text className="text-xs text-muted-foreground">
              No budget items found in this period. Create plan items in Budgets first.
            </Text>
          ) : null}

          <View className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">New Item</Text>
              <AppInput value={itemDraftName} onChangeText={setItemDraftName} placeholder="e.g. Rice" />
            </View>
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Text>
              <AppInput value={tagsToInput(itemDraftTags)} onChangeText={(value) => setItemDraftTags(parseTagsInput(value))} placeholder="vegetables, utilities" />
            </View>
            <View className="gap-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Budget Item</Text>
              <DropdownField
                value={itemDraftPlanId}
                options={[{ label: 'Optional budget item', value: '' }, ...planOptions.map((opt) => ({ label: opt.label, value: opt.id }))]}
                onChange={setItemDraftPlanId}
                placeholder="Optional budget item"
                menuStrategy="inline"
                menuClassName="max-h-48"
              />
            </View>
          </View>

          <View className="flex-row flex-wrap items-center gap-2">
            <IconActionButton icon="plus" label="Add list item" onPress={addItem} />
            <View className="w-56">
              <DropdownField value={tagFilter} options={tagOptions} onChange={setTagFilter} placeholder="Filter by tag" menuStrategy="overlay" />
            </View>
            <AppBadge label={sortMode === 'TAG' ? 'Sorted by tag' : 'Sorted by created'} variant="outline" />
            <IconActionButton
              icon={sortMode === 'TAG' ? 'sort-alphabetical-variant' : 'sort-clock-ascending-outline'}
              label="Toggle sort mode"
              onPress={() => setSortMode((prev) => (prev === 'TAG' ? 'CREATED' : 'TAG'))}
            />
          </View>

          {suggestions.length ? (
            <View className="gap-1">
              <Text className="text-xs text-muted-foreground">Suggestions from completed items</Text>
              <View className="flex-row flex-wrap gap-2">
                {suggestions.map((row) => (
                  <Pressable
                    key={row.name}
                    onPress={() => {
                      setItemDraftName(row.name);
                      setItemDraftTags(row.tags || []);
                      setItemDraftPlanId(row.assignedPlanItemId || '');
                    }}
                    className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/40"
                    {...({ title: `Use suggestion: ${row.name}` } as any)}
                  >
                    <Text className="text-xs text-foreground dark:text-zinc-50">{row.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {itemError ? <Text className="text-xs text-destructive">{itemError}</Text> : null}

          <View className="gap-2">
            {displayItems.map((row) => {
              const isAssigned = Boolean(row.assignedTxId);
              const rowError = assignErrorByItemId[row.id || ''];
              const selectedPlanId = planByItemId[row.id || ''] || row.assignedPlanItemId || '';

              return (
                <AppCard key={row.id} className="gap-3 border border-border/70 p-3 dark:border-zinc-800">
                  <View className="gap-2 md:flex-row md:items-start">
                    <View className="gap-2 md:flex-1">
                      <View className="gap-1">
                        <Text className="text-xs uppercase tracking-wide text-muted-foreground">Item</Text>
                        <AppInput
                          value={row.name}
                          onChangeText={(value) => setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, name: value } : it)))}
                          className="h-9"
                        />
                      </View>
                      <View className="gap-1">
                        <Text className="text-xs uppercase tracking-wide text-muted-foreground">Tags</Text>
                        <AppInput
                          value={tagsToInput(row.tags)}
                          onChangeText={(value) => setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, tags: parseTagsInput(value) } : it)))}
                          placeholder="utilities, vegetables"
                          className="h-9"
                        />
                      </View>
                    </View>

                    <View className="gap-2 md:w-[360px]">
                      <View className="flex-row items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                        <Text className="text-xs font-medium text-muted-foreground">Bought</Text>
                        <Switch value={row.bought === true} onValueChange={(value) => void toggleBought(row, value)} />
                      </View>
                      <View className="gap-1">
                        <Text className="text-xs uppercase tracking-wide text-muted-foreground">Cost</Text>
                        <AppInput
                          value={String(row.cost || '')}
                          onChangeText={(value) => setItems((prev) => prev.map((it) => (it.id === row.id ? { ...it, cost: parseMoney(value) } : it)))}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          className="h-9 text-right"
                        />
                      </View>
                      <View className="flex-row flex-wrap items-center gap-2">
                        <AppBadge label={row.bought ? 'Bought' : 'Pending'} variant={row.bought ? 'warning' : 'secondary'} />
                        {row.tags?.length ? <AppBadge label={tagsLabel(row.tags)} variant="outline" /> : null}
                        {isAssigned ? <AppBadge label="Added to transactions" variant="success" /> : null}
                      </View>
                    </View>
                  </View>

                  <View className="gap-2 rounded-md border border-border bg-muted/20 p-2 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <Text className="text-xs uppercase tracking-wide text-muted-foreground">Budget Item</Text>
                    <DropdownField
                      value={selectedPlanId}
                      options={[{ label: 'Select budget item', value: '' }, ...planOptions.map((opt) => ({ label: opt.label, value: opt.id }))]}
                      onChange={(value) => setPlanByItemId((prev) => ({ ...prev, [row.id || '']: value }))}
                      placeholder="Select budget item"
                      menuStrategy="inline"
                      menuClassName="max-h-48"
                    />
                  </View>

                  <View className="flex-row flex-wrap items-center justify-end gap-2">
                    <IconActionButton icon="content-save-outline" label="Save item" onPress={() => saveItem(row)} />
                    <IconActionButton icon="check-circle-outline" label="Complete item" onPress={() => completeItem(row)} />
                    <IconActionButton
                      icon={isAssigned ? 'check-decagram-outline' : 'arrow-top-right'}
                      label={isAssigned ? 'Already assigned to transaction' : 'Assign to selected budget'}
                      disabled={isAssigned}
                      onPress={() => assignToBudget(row)}
                    />
                    <IconActionButton icon="trash-can-outline" label="Delete item" variant="danger" onPress={() => removeItem(row)} />
                  </View>

                  {isAssigned ? (
                    <Text className="text-xs text-muted-foreground">
                      Added to transactions ({row.assignedPeriodId}) under {row.assignedPlanItemName || row.assignedGroup || 'Needs'}.
                    </Text>
                  ) : null}
                  {rowError ? <Text className="text-xs text-destructive">{rowError}</Text> : null}
                </AppCard>
              );
            })}

            {!displayItems.length ? (
              <View className="py-4">
                <Text className="text-sm text-muted-foreground">No pending items in this list.</Text>
              </View>
            ) : null}
          </View>
        </AppCard>
      )}
    </ScrollView>
  );
}
