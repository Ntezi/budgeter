import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppModal } from '@/components/ui/AppModal';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { cn } from '@/lib/cn';
import { computeFundedBudgetByItemId, hasFundedAmount } from '@/lib/funding';
import { fmtMoney, parseMoney } from '@/lib/format';
import { planGroupLabel } from '@/lib/groups';
import { watchIncomeItems } from '@/lib/repo/income';
import { periodIdFromDate } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import {
  type ShoppingCatalogItem,
  addShoppingList,
  addShoppingListItem,
  deleteShoppingListItem,
  type ShoppingList,
  type ShoppingListItem,
  updateShoppingListItem,
  upsertShoppingCatalogItem,
  watchShoppingCatalog,
  watchShoppingListItems,
  watchShoppingLists,
} from '@/lib/repo/shopping';
import { addTransaction } from '@/lib/repo/transactions';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';

type PlanOption = {
  id: string;
  name: string;
  label: string;
  group: PlanItem['group'];
};

type CompletionInput = {
  quantity: string;
  price: string;
  planItemId: string;
};

function normalize(input: string) {
  return input.trim().toLowerCase();
}

function parseQuantity(input: string) {
  const value = parseInt(input, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeItemTag(input: string) {
  return input.trim();
}

function isValidItemTag(tag: string) {
  return tag.length >= 1 && tag.length <= 10;
}

export default function ShoppingScreen() {
  const { activePeriodId } = useWorkspace();
  const uid = useWorkspaceUid();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const targetPid = activePeriodId || periodIdFromDate();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [catalogRows, setCatalogRows] = useState<ShoppingCatalogItem[]>([]);

  const [createListOpen, setCreateListOpen] = useState(false);
  const [listDraftName, setListDraftName] = useState('');
  const [listError, setListError] = useState('');

  const [itemDraftName, setItemDraftName] = useState('');
  const [itemError, setItemError] = useState('');

  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editItemError, setEditItemError] = useState('');
  const [editDraft, setEditDraft] = useState({
    id: '',
    name: '',
    quantity: '1',
    planItemId: '',
  });
  const [tagEditOpen, setTagEditOpen] = useState(false);
  const [tagEditError, setTagEditError] = useState('');
  const [tagDraft, setTagDraft] = useState({
    id: '',
    name: '',
    tag: '',
  });

  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [activeIncomeTotal, setActiveIncomeTotal] = useState(0);

  const [importOpen, setImportOpen] = useState(false);
  const [importSearch, setImportSearch] = useState('');
  const [importCategoryFilter, setImportCategoryFilter] = useState('ALL');
  const [importSelection, setImportSelection] = useState<Record<string, boolean>>({});

  const [completing, setCompleting] = useState(false);
  const [itemInputs, setItemInputs] = useState<Record<string, CompletionInput>>({});
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [finalizingCompletion, setFinalizingCompletion] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchShoppingLists(uid, (rows) => {
      setLists(rows);
      if (selectedListId && !rows.some((row) => row.id === selectedListId)) {
        setSelectedListId(rows[0]?.id || '');
        return;
      }
      if (!selectedListId && rows.length > 0 && isWide) {
        setSelectedListId(rows[0].id || '');
      }
    });
  }, [uid, selectedListId, isWide]);

  useEffect(() => {
    if (!uid) return;
    return watchShoppingCatalog(uid, setCatalogRows);
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedListId) {
      setItems([]);
      return;
    }
    return watchShoppingListItems(uid, selectedListId, setItems);
  }, [uid, selectedListId]);

  useEffect(() => {
    if (!uid || !targetPid) return;
    return watchPlanTotals(uid, targetPid, (_totals, nextRows) => setPlanItems(nextRows));
  }, [uid, targetPid]);

  useEffect(() => {
    if (!uid || !targetPid) return;
    return watchIncomeItems(uid, targetPid, (_rows, activeTotal) => {
      setActiveIncomeTotal(activeTotal);
    });
  }, [uid, targetPid]);

  const selectedList = useMemo(() => lists.find((row) => row.id === selectedListId) || null, [lists, selectedListId]);

  const planOptions = useMemo<PlanOption[]>(
    () =>
      planItems
        .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          group: row.group,
          label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${planGroupLabel(row.group)}`,
        })),
    [planItems]
  );

  const planById = useMemo(() => {
    const map = new Map<string, PlanOption>();
    planOptions.forEach((row) => map.set(row.id, row));
    return map;
  }, [planOptions]);

  const planByName = useMemo(() => {
    const map = new Map<string, PlanOption>();
    planOptions.forEach((row) => {
      const key = normalize(row.name);
      if (!map.has(key)) map.set(key, row);
    });
    return map;
  }, [planOptions]);

  const fundedByPlanId = useMemo(
    () =>
      computeFundedBudgetByItemId(
        planItems
          .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
          .map((row, index) => ({
            id: row.id,
            name: row.name,
            amount: row.amount,
            group: row.group,
            priority: Number((row as any).priority) || index + 1,
            reconcilePinned: Boolean((row as any).reconcilePinned),
          })),
        activeIncomeTotal
      ),
    [activeIncomeTotal, planItems]
  );

  const fundedPlanOptions = useMemo(
    () => planOptions.filter((row) => hasFundedAmount(fundedByPlanId, row.id)),
    [fundedByPlanId, planOptions]
  );

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    catalogRows.forEach((row) => {
      const category = String(row.category || '').trim();
      if (category) names.add(category);
    });
    return [{ label: 'All categories', value: 'ALL' }, ...Array.from(names).sort((a, b) => a.localeCompare(b)).map((name) => ({ label: name, value: name }))];
  }, [catalogRows]);

  const importCandidates = useMemo(() => {
    const q = normalize(importSearch);
    return catalogRows
      .filter((row) => {
        if (importCategoryFilter !== 'ALL' && normalize(row.category || '') !== normalize(importCategoryFilter)) {
          return false;
        }
        if (!q) return true;
        return normalize(row.name || '').includes(q) || normalize(row.category || '').includes(q);
      })
      .slice(0, 80);
  }, [catalogRows, importCategoryFilter, importSearch]);

  const suggestedRows = useMemo(() => {
    const q = normalize(itemDraftName);
    if (!q) return [];
    return catalogRows.filter((row) => normalize(row.name || '').includes(q)).slice(0, 10);
  }, [catalogRows, itemDraftName]);

  const displayItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.bought !== b.bought) return a.bought ? 1 : -1;
      return normalize(a.name || '').localeCompare(normalize(b.name || ''));
    });
  }, [items]);

  const estimatedTotal = useMemo(() => {
    return displayItems.reduce((acc, item) => {
      const unitPrice = item.price || 0;
      if (unitPrice <= 0) return acc;
      return acc + unitPrice * (item.quantity || 1);
    }, 0);
  }, [displayItems]);

  const selectedItems = useMemo(
    () => displayItems.filter((item) => item.bought),
    [displayItems]
  );

  const selectedTotal = useMemo(() => {
    return selectedItems.reduce((acc, item) => {
      const unitPrice = item.price || 0;
      if (unitPrice <= 0) return acc;
      return acc + unitPrice * (item.quantity || 1);
    }, 0);
  }, [selectedItems]);

  const selectedMissingUnitPriceCount = useMemo(
    () => selectedItems.filter((item) => (item.price || 0) <= 0).length,
    [selectedItems]
  );

  const completionTargetItems = useMemo(() => {
    if (selectedItems.length > 0) return selectedItems;
    return displayItems;
  }, [displayItems, selectedItems]);

  const completionScopeLabel = selectedItems.length > 0 ? 'selected items' : 'shopping items';
  const isShoppingListEmpty = displayItems.length === 0;

  function resolvePlanForItemName(name: string, catalog?: ShoppingCatalogItem | null) {
    const catalogPlanId = String(catalog?.assignedPlanItemId || '').trim();
    if (catalogPlanId) {
      const fromCatalog = planById.get(catalogPlanId);
      if (fromCatalog) return fromCatalog;
    }
    const catalogPlanName = String(catalog?.assignedPlanItemName || '').trim();
    if (catalogPlanName) {
      const fromCatalogName = planByName.get(normalize(catalogPlanName));
      if (fromCatalogName) return fromCatalogName;
    }
    return planByName.get(normalize(name)) || null;
  }

  async function createList() {
    if (!uid) return;
    const name = listDraftName.trim();
    if (!name) {
      setListError('List name is required.');
      return;
    }

    const ref = await addShoppingList(uid, name);
    setListDraftName('');
    setListError('');
    setCreateListOpen(false);
    setSelectedListId(ref.id);
  }

  async function addItemFromCatalog(catalog: ShoppingCatalogItem) {
    if (!uid || !selectedListId) return;
    const name = String(catalog.name || '').trim();
    if (!name) return;
    const plan = resolvePlanForItemName(name, catalog);

    await addShoppingListItem(uid, selectedListId, {
      name,
      quantity: 1,
      price: catalog.lastPrice || 0,
      category: catalog.category || '',
      tags: catalog.tags || [],
      assignedPlanItemId: plan?.id || '',
      assignedPlanItemName: plan?.name || '',
      assignedGroup: plan?.group,
      bought: false,
      completed: false,
    });
  }

  async function addItem() {
    if (!uid || !selectedListId) return;
    const name = itemDraftName.trim();
    if (!name) {
      setItemError('Item name is required.');
      return;
    }

    const catalog = catalogRows.find((row) => normalize(row.name || '') === normalize(name));
    const plan = resolvePlanForItemName(name, catalog);

    await addShoppingListItem(uid, selectedListId, {
      name,
      quantity: 1,
      price: catalog?.lastPrice || 0,
      category: catalog?.category || '',
      tags: catalog?.tags || [],
      assignedPlanItemId: plan?.id || '',
      assignedPlanItemName: plan?.name || '',
      assignedGroup: plan?.group,
      bought: false,
      completed: false,
    });

    setItemDraftName('');
    setItemError('');
  }

  async function toggleBought(item: ShoppingListItem) {
    if (!uid || !selectedListId || !item.id) return;
    await updateShoppingListItem(uid, selectedListId, item.id, { bought: !item.bought });
  }

  async function removeItem(item: ShoppingListItem) {
    if (!uid || !selectedListId || !item.id) return;
    await deleteShoppingListItem(uid, selectedListId, item.id);
  }

  function openEditItem(item: ShoppingListItem) {
    const assigned = String(item.assignedPlanItemId || '').trim();
    setEditDraft({
      id: item.id || '',
      name: item.name || '',
      quantity: String(item.quantity || 1),
      planItemId: assigned,
    });
    setEditItemError('');
    setEditItemOpen(true);
  }

  function openTagEdit(item: ShoppingListItem) {
    if (!item.id) return;
    setTagDraft({
      id: item.id,
      name: item.name || '',
      tag: String(item.tag || ''),
    });
    setTagEditError('');
    setTagEditOpen(true);
  }

  async function saveEditedItem() {
    if (!uid || !selectedListId || !editDraft.id) return;
    const name = editDraft.name.trim();
    if (!name) {
      setEditItemError('Item name is required.');
      return;
    }

    const quantity = parseQuantity(editDraft.quantity || '1');
    if (!quantity) {
      setEditItemError('Quantity must be at least 1.');
      return;
    }

    const selectedPlan = planById.get(editDraft.planItemId);
    await updateShoppingListItem(uid, selectedListId, editDraft.id, {
      name,
      quantity,
      assignedPlanItemId: selectedPlan?.id || '',
      assignedPlanItemName: selectedPlan?.name || '',
      assignedGroup: selectedPlan?.group,
    });

    setEditItemOpen(false);
    setEditItemError('');
  }

  async function saveItemTag() {
    if (!uid || !selectedListId || !tagDraft.id) return;
    const nextTag = normalizeItemTag(tagDraft.tag);
    if (!isValidItemTag(nextTag)) {
      setTagEditError('Tag must be between 5 and 10 characters.');
      return;
    }

    await updateShoppingListItem(uid, selectedListId, tagDraft.id, {
      tag: nextTag,
    });
    setTagEditOpen(false);
    setTagEditError('');
  }

  function startCompletion() {
    if (savingCompletion || finalizingCompletion) return;
    if (!completionTargetItems.length) {
      Alert.alert('No items to complete', 'Add shopping items first, then start completion.');
      return;
    }

    const nextInputs: Record<string, CompletionInput> = {};
    completionTargetItems.forEach((item) => {
      if (!item.id) return;
      const assignedPlanId = String(item.assignedPlanItemId || '').trim();
      const assignedPlanName = String(item.assignedPlanItemName || '').trim();
      const assignedByName = assignedPlanName ? planByName.get(normalize(assignedPlanName)) : null;

      const qty = item.quantity || 1;
      const savedTotal = Math.max(0, Number(item.cost || 0));
      const unitPrice = item.price || 0;
      const total = savedTotal > 0 ? savedTotal : unitPrice > 0 ? unitPrice * qty : 0;

      nextInputs[item.id] = {
        quantity: String(qty),
        price: total > 0 ? String(total) : '',
        planItemId: assignedPlanId || assignedByName?.id || '',
      };
    });
    setItemInputs(nextInputs);
    setCompleting(true);
  }

  const completionValidation = useMemo(() => {
    const missingQuantity: string[] = [];
    const missingPrice: string[] = [];
    const missingBudget: string[] = [];
    const nonFundedBudget: string[] = [];

    completionTargetItems.forEach((item) => {
      if (!item.id) return;
      const input = itemInputs[item.id];
      const qty = parseQuantity(input?.quantity || '0');
      const price = Math.max(0, parseMoney(input?.price || '0'));
      const planItemId = String(input?.planItemId || '').trim();

      if (!qty) missingQuantity.push(item.name || 'Unnamed item');
      if (price <= 0) missingPrice.push(item.name || 'Unnamed item');
      if (!planItemId || !planById.has(planItemId)) missingBudget.push(item.name || 'Unnamed item');
      else if (!hasFundedAmount(fundedByPlanId, planItemId)) nonFundedBudget.push(item.name || 'Unnamed item');
    });

    return {
      missingQuantity,
      missingPrice,
      missingBudget,
      nonFundedBudget,
      ready:
        completionTargetItems.length > 0 &&
        missingQuantity.length === 0 &&
        missingPrice.length === 0 &&
        missingBudget.length === 0 &&
        nonFundedBudget.length === 0,
    };
  }, [completionTargetItems, fundedByPlanId, itemInputs, planById]);

  async function handleSaveAndBack() {
    if (savingCompletion || finalizingCompletion) return;
    if (!uid || !selectedListId) return;
    if (!completionTargetItems.length) {
      setCompleting(false);
      return;
    }

    setSavingCompletion(true);
    try {
      for (const item of completionTargetItems) {
        if (!item.id) continue;
        const input = itemInputs[item.id];
        const quantity = parseQuantity(input?.quantity || '0');
        const totalAmount = Math.max(0, parseMoney(input?.price || '0'));
        const selectedPlan = planById.get(String(input?.planItemId || '').trim());
        const planId = selectedPlan?.id || String(item.assignedPlanItemId || '').trim();
        const planName = selectedPlan?.name || String(item.assignedPlanItemName || '').trim();
        const planGroup = selectedPlan?.group ?? item.assignedGroup;

        const patch: Partial<ShoppingListItem> = {
          assignedPlanItemId: planId,
          assignedPlanItemName: planName,
          assignedGroup: planGroup,
          cost: totalAmount > 0 ? totalAmount : 0,
        };

        if (quantity > 0) patch.quantity = quantity;

        if (quantity > 0 && totalAmount > 0) {
          const unitPrice = totalAmount / quantity;
          patch.price = unitPrice;
          await upsertShoppingCatalogItem(uid, {
            name: item.name,
            category: item.category || '',
            tags: item.tags || [],
            assignedPlanItemId: planId,
            assignedPlanItemName: planName,
            assignedGroup: planGroup,
            price: unitPrice,
            quantity,
          });
        }

        await updateShoppingListItem(uid, selectedListId, item.id, patch);
      }

      setCompleting(false);
      Alert.alert('Saved', 'Shopping progress saved. You can return later to complete.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save shopping progress.');
    } finally {
      setSavingCompletion(false);
    }
  }

  async function handleDoneAndClear() {
    if (savingCompletion || finalizingCompletion) return;
    if (!uid || !selectedListId || !selectedList) return;
    if (!completionValidation.ready) {
      Alert.alert(
        'Complete required fields',
        `Fill quantity, total amount, and funded budget item for every ${completionScopeLabel} first.`
      );
      return;
    }

    setFinalizingCompletion(true);
    try {
      for (const item of completionTargetItems) {
        if (!item.id) continue;
        const input = itemInputs[item.id];
        const quantity = parseQuantity(input?.quantity || '0');
        const totalAmount = Math.max(0, parseMoney(input?.price || '0'));
        const unitPrice = quantity > 0 ? totalAmount / quantity : 0;

        const plan = planById.get(String(input?.planItemId || '').trim());
        if (!plan || !quantity || totalAmount <= 0 || !hasFundedAmount(fundedByPlanId, plan.id)) continue;

        await addTransaction(uid, targetPid, {
          name: plan.name,
          amount: totalAmount,
          group: plan.group,
          date: new Date().toISOString().slice(0, 10),
          note: `Shopping: ${selectedList.name} · Item: ${item.name}`,
          categoryId: plan.id,
          shoppingListId: selectedListId,
          shoppingListName: selectedList.name,
          shoppingItemId: item.id,
          shoppingItemName: item.name,
        });

        await upsertShoppingCatalogItem(uid, {
          name: item.name,
          category: item.category || '',
          tags: item.tags || [],
          assignedPlanItemId: plan.id,
          assignedPlanItemName: plan.name,
          assignedGroup: plan.group,
          price: unitPrice,
          quantity,
        });

        await deleteShoppingListItem(uid, selectedListId, item.id);
      }

      setCompleting(false);
      setItemInputs({});
      if (!isWide) setSelectedListId('');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to complete shopping list.');
    } finally {
      setFinalizingCompletion(false);
    }
  }

  async function importSelected() {
    if (!uid || !selectedListId) return;
    const picks = catalogRows.filter((row) => importSelection[row.id || '']);

    for (const row of picks) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      const plan = resolvePlanForItemName(name, row);
      await addShoppingListItem(uid, selectedListId, {
        name,
        quantity: 1,
        price: row.lastPrice || 0,
        category: row.category || '',
        tags: row.tags || [],
        assignedPlanItemId: plan?.id || '',
        assignedPlanItemName: plan?.name || '',
        assignedGroup: plan?.group,
        bought: false,
        completed: false,
      });
    }

    setImportOpen(false);
    setImportSearch('');
    setImportCategoryFilter('ALL');
    setImportSelection({});
  }

  const renderLists = () => (
    <AppCard className="flex-1 border-border bg-card dark:border-zinc-800 dark:bg-zinc-900 md:max-w-xs">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-foreground dark:text-zinc-50">Lists</Text>
        <IconActionButton icon="plus" label="New List" onPress={() => setCreateListOpen(true)} />
      </View>
      <ScrollView>
        {lists.map((list) => (
          <Pressable
            key={list.id}
            onPress={() => setSelectedListId(list.id || '')}
            className={cn(
              'mb-2 rounded-lg border p-3',
              selectedListId === list.id
                ? 'border-primary/30 bg-primary/10 dark:border-primary/40 dark:bg-primary/20'
                : 'border-transparent bg-muted/30 dark:bg-zinc-800/40'
            )}
          >
            <Text className="font-medium text-foreground dark:text-zinc-100">{list.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </AppCard>
  );

  const renderItems = () => {
    if (!selectedList) {
      return (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground dark:text-zinc-400">Select a list to view items</Text>
        </View>
      );
    }

    return (
      <View className="flex-1 gap-3">
        {!isWide ? (
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => setSelectedListId('')} className="flex-row items-center gap-1">
              <MaterialCommunityIcons name="chevron-left" size={20} color="#717182" />
              <Text className="font-medium text-primary dark:text-blue-400">Lists</Text>
            </Pressable>
            {!completing ? (
              <View className="flex-row gap-2">
                <AppButton label="Import" onPress={() => setImportOpen(true)} variant="outline" size="sm" />
                <AppButton label="Complete" onPress={startCompletion} variant="outline" size="sm" disabled={isShoppingListEmpty} />
              </View>
            ) : null}
          </View>
        ) : null}

        <AppCard className="flex-1 border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          <View className="mb-3 flex-row items-center justify-between gap-2">
            <View>
              <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{selectedList.name}</Text>
              {!completing ? (
                <View>
                  <Text className="text-xs font-medium text-muted-foreground">
                    List total: {fmtMoney(estimatedTotal)}
                  </Text>
                  <Text className="text-xs font-medium text-muted-foreground">
                    Selected total: {fmtMoney(selectedTotal)} ({selectedItems.length} item{selectedItems.length === 1 ? '' : 's'})
                  </Text>
                  {selectedMissingUnitPriceCount > 0 ? (
                    <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {selectedMissingUnitPriceCount} selected item{selectedMissingUnitPriceCount === 1 ? '' : 's'} missing unit price
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
            {isWide && !completing ? (
              <View className="flex-row gap-2">
                <AppButton label="Import" onPress={() => setImportOpen(true)} variant="outline" size="sm" />
                <AppButton label="Complete" onPress={startCompletion} variant="outline" size="sm" disabled={isShoppingListEmpty} />
              </View>
            ) : null}
          </View>

          {!completing ? (
            <>
              <View className="relative z-50 mb-3">
                <AppInput
                  value={itemDraftName}
                  onChangeText={setItemDraftName}
                  placeholder="Add item..."
                  className="flex-1"
                  style={{ height: 56 }}
                />
                {itemDraftName.trim().length > 0 ? (
                  <View className="absolute left-0 right-0 top-full mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                    <ScrollView keyboardShouldPersistTaps="handled" className="max-h-48">
                      {suggestedRows.map((row) => (
                        <Pressable
                          key={row.id}
                          className="border-b border-border p-3 active:bg-muted/50 dark:border-zinc-800"
                          onPress={() => {
                            void addItemFromCatalog(row);
                            setItemDraftName('');
                          }}
                        >
                          <Text className="text-foreground dark:text-zinc-100">{row.name}</Text>
                          {row.category ? <Text className="text-xs text-muted-foreground">{row.category}</Text> : null}
                        </Pressable>
                      ))}
                      {!catalogRows.some((row) => normalize(row.name || '') === normalize(itemDraftName)) ? (
                        <Pressable
                          className="p-3 active:bg-muted/50"
                          onPress={() => {
                            void addItem();
                          }}
                        >
                          <Text className="font-medium text-primary">Add &quot;{itemDraftName.trim()}&quot;</Text>
                        </Pressable>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : null}
              </View>

              {itemError ? <Text className="mb-2 text-xs text-destructive">{itemError}</Text> : null}

              <ScrollView className="flex-1">
                {displayItems.map((item) => {
                  const budgetLabel =
                    item.assignedPlanItemName ||
                    planById.get(String(item.assignedPlanItemId || '').trim())?.name ||
                    'Unassigned budget item';
                  const hasBudget = Boolean(String(item.assignedPlanItemId || '').trim());
                  const itemTag = normalizeItemTag(String(item.tag || ''));
                  const unitPrice = item.price || 0;
                  const hasUnitPrice = unitPrice > 0;
                  const estCost = hasUnitPrice ? unitPrice * (item.quantity || 1) : 0;

                  return (
                    <View
                      key={item.id}
                      className={cn(
                        'flex-row items-center justify-between gap-2 border-b border-border p-3 dark:border-zinc-800',
                        !hasUnitPrice && 'bg-amber-50/60 dark:bg-amber-950/20'
                      )}
                    >
                      <View className="flex-row flex-1 items-center gap-3">
                        <Switch value={item.bought} onValueChange={() => toggleBought(item)} />
                        <Pressable className="flex-1 py-1" onPress={() => openTagEdit(item)}>
                          <View className="flex-row flex-wrap items-center gap-1">
                            <Text
                              className={cn(
                                'text-foreground dark:text-zinc-100',
                                item.bought && 'text-muted-foreground line-through dark:text-zinc-500'
                              )}
                            >
                              {item.name} {item.quantity && item.quantity > 1 ? `(x${item.quantity})` : ''}
                            </Text>
                            {itemTag ? (
                              <Text className="text-xs text-muted-foreground dark:text-zinc-400">[{itemTag}]</Text>
                            ) : null}
                          </View>
                          <View className="flex-row items-center gap-2">
                            <Text className={cn('text-xs', hasBudget ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-300')}>
                              {budgetLabel}
                            </Text>
                            {hasUnitPrice ? (
                              <Text className="text-xs font-medium text-muted-foreground">
                                · {fmtMoney(unitPrice)}/ea · Est. {fmtMoney(estCost)}
                              </Text>
                            ) : (
                              <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                                · Missing unit price
                              </Text>
                            )}
                          </View>
                        </Pressable>
                      </View>
                      <View className="flex-row gap-1">
                        {isWide ? <IconActionButton icon="pencil-outline" label="Edit item" onPress={() => openEditItem(item)} />: null}
                        <IconActionButton icon="trash-can-outline" label="Delete item" variant="danger" onPress={() => removeItem(item)} />
                      </View>
                    </View>
                  );
                })}
                {!displayItems.length ? (
                  <Text className="py-8 text-center text-muted-foreground dark:text-zinc-400">No items yet</Text>
                ) : null}
              </ScrollView>
            </>
          ) : (
            <View className="flex-1">
              <Text className="mb-3 text-sm text-muted-foreground dark:text-zinc-400">
                Fill quantity, total amount, and budget item for each {completionScopeLabel} before clearing.
              </Text>

              {!completionValidation.ready ? (
                <View className="mb-3 gap-1 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-950/20">
                  {completionValidation.missingQuantity.length ? (
                    <Text className="text-xs text-amber-700 dark:text-amber-200">Missing quantity: {completionValidation.missingQuantity.length} item(s)</Text>
                  ) : null}
                  {completionValidation.missingPrice.length ? (
                    <Text className="text-xs text-amber-700 dark:text-amber-200">Missing total: {completionValidation.missingPrice.length} item(s)</Text>
                  ) : null}
                  {completionValidation.missingBudget.length ? (
                    <Text className="text-xs text-amber-700 dark:text-amber-200">Missing budget item: {completionValidation.missingBudget.length} item(s)</Text>
                  ) : null}
                  {completionValidation.nonFundedBudget.length ? (
                    <Text className="text-xs text-amber-700 dark:text-amber-200">
                      Non-funded budget item selected: {completionValidation.nonFundedBudget.length} item(s)
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <ScrollView className="mb-4 flex-1">
                {completionTargetItems.map((item) => {
                  if (!item.id) return null;
                  const itemTag = normalizeItemTag(String(item.tag || ''));
                  return (
                    <View key={item.id} className="gap-2 border-b border-border p-3 dark:border-zinc-800">
                      <View className="flex-row flex-wrap items-center gap-1">
                        <Text className="text-foreground dark:text-zinc-100" numberOfLines={1}>
                          {item.name}
                        </Text>
                        {itemTag ? <Text className="text-xs text-muted-foreground dark:text-zinc-400">[{itemTag}]</Text> : null}
                      </View>
                      <View className={cn('gap-2', isWide ? 'flex-row items-center' : '')}>
                        <AppInput
                          value={itemInputs[item.id]?.quantity}
                          onChangeText={(value) =>
                            setItemInputs((prev) => ({
                              ...prev,
                              [item.id!]: { ...prev[item.id!], quantity: value },
                            }))
                          }
                          className={cn('h-9 text-center', isWide ? 'w-20' : 'w-full')}
                          placeholder="Qty"
                          keyboardType="numeric"
                        />
                        <AppInput
                          value={itemInputs[item.id]?.price}
                          onChangeText={(value) =>
                            setItemInputs((prev) => ({
                              ...prev,
                              [item.id!]: { ...prev[item.id!], price: value },
                            }))
                          }
                          className={cn('h-9 text-right', isWide ? 'w-28' : 'w-full')}
                          placeholder="Total"
                          keyboardType="decimal-pad"
                        />
                        <View className="flex-1">
                          <DropdownField
                            value={itemInputs[item.id]?.planItemId || ''}
                            options={[
                              { label: 'Select funded budget item', value: '' },
                              ...fundedPlanOptions.map((row) => ({ label: row.label, value: row.id })),
                            ]}
                            onChange={(value) =>
                              setItemInputs((prev) => ({
                                ...prev,
                                [item.id!]: { ...prev[item.id!], planItemId: value },
                              }))
                            }
                            placeholder="Funded budget item"
                            menuStrategy="inline"
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View className="flex-row flex-wrap gap-2">
                <AppButton
                  label="Cancel"
                  onPress={() => setCompleting(false)}
                  variant="outline"
                  className="flex-1 min-w-[110px]"
                  disabled={savingCompletion || finalizingCompletion}
                />
                <AppButton
                  label={savingCompletion ? 'Saving...' : 'Save & Back'}
                  onPress={() => {
                    void handleSaveAndBack();
                  }}
                  variant="outline"
                  className="flex-1 min-w-[130px]"
                  disabled={savingCompletion || finalizingCompletion}
                />
                <AppButton
                  label={finalizingCompletion ? 'Finalizing...' : 'Done & Clear'}
                  onPress={() => {
                    void handleDoneAndClear();
                  }}
                  className="flex-1 min-w-[130px]"
                  textClassName="text-white"
                  disabled={savingCompletion || finalizingCompletion}
                />
              </View>
            </View>
          )}
        </AppCard>
      </View>
    );
  };

  const selectedImportCount = Object.values(importSelection).filter(Boolean).length;

  return (
    <View className={cn('flex-1 gap-4 bg-background dark:bg-zinc-950', isWide ? 'p-4' : 'px-1.5 pb-4 pt-1')}>
      {isWide ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Shopping</Text>
        </View>
      ) : null}

      <View className={cn('flex-1', isWide ? 'flex-row gap-4' : 'flex-col')}>
        {!selectedListId || isWide ? renderLists() : null}
        {selectedListId || isWide ? renderItems() : null}
      </View>

      <AppModal open={createListOpen} onClose={() => setCreateListOpen(false)} title="New Shopping List">
        <View className="gap-4">
          <AppInput value={listDraftName} onChangeText={setListDraftName} placeholder="List name (e.g. Weekly Groceries)" />
          {listError ? <Text className="text-xs text-destructive">{listError}</Text> : null}
          <View className="flex-row gap-2">
            <AppButton label="Cancel" onPress={() => setCreateListOpen(false)} variant="outline" />
            <AppButton label="Create" onPress={createList} textClassName="text-white" />
          </View>
        </View>
      </AppModal>

      <AppModal open={editItemOpen} onClose={() => setEditItemOpen(false)} title="Edit Shopping Item">
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">Item</Text>
            <AppInput value={editDraft.name} onChangeText={(value) => setEditDraft((prev) => ({ ...prev, name: value }))} />
          </View>
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">Quantity</Text>
            <AppInput
              value={editDraft.quantity}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, quantity: value }))}
              keyboardType="numeric"
            />
          </View>
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">Budget Item</Text>
            <DropdownField
              value={editDraft.planItemId}
              options={[{ label: 'Unassigned', value: '' }, ...planOptions.map((row) => ({ label: row.label, value: row.id }))]}
              onChange={(value) => setEditDraft((prev) => ({ ...prev, planItemId: value }))}
              placeholder="Select budget item"
              menuStrategy="inline"
            />
          </View>
          {editItemError ? <Text className="text-xs text-destructive">{editItemError}</Text> : null}
          <View className="flex-row gap-2">
            <AppButton label="Cancel" onPress={() => setEditItemOpen(false)} variant="outline" className="flex-1" />
            <AppButton label="Save" onPress={saveEditedItem} className="flex-1" textClassName="text-white" />
          </View>
        </View>
      </AppModal>

      <AppModal open={tagEditOpen} onClose={() => setTagEditOpen(false)} title="Shopping Item Tag">
        <View className="gap-3">
          <Text className="text-xs text-muted-foreground">
            {tagDraft.name ? `Tag for ${tagDraft.name}` : 'Add a short tag'}
          </Text>
          <AppInput
            value={tagDraft.tag}
            onChangeText={(value) => {
              setTagDraft((prev) => ({ ...prev, tag: value }));
              if (tagEditError) setTagEditError('');
            }}
            placeholder="1 to 10 characters"
            maxLength={10}
          />
          <Text className="text-xs text-muted-foreground">{normalizeItemTag(tagDraft.tag).length}/10</Text>
          {tagEditError ? <Text className="text-xs text-destructive">{tagEditError}</Text> : null}
          <View className="flex-row gap-2">
            <AppButton label="Cancel" onPress={() => setTagEditOpen(false)} variant="outline" className="flex-1" />
            <AppButton
              label="Save Tag"
              onPress={saveItemTag}
              className="flex-1"
              textClassName="text-white"
              disabled={!isValidItemTag(normalizeItemTag(tagDraft.tag))}
            />
          </View>
        </View>
      </AppModal>

      <AppModal open={importOpen} onClose={() => setImportOpen(false)} title="Import Items">
        <View className="gap-3">
          <AppInput
            value={importSearch}
            onChangeText={setImportSearch}
            placeholder="Search by item name or category"
            style={{ height: 48 }}
          />
          <DropdownField
            value={importCategoryFilter}
            options={categoryOptions}
            onChange={setImportCategoryFilter}
            placeholder="Filter category"
            menuStrategy="inline"
          />
          <ScrollView className="max-h-80">
            {importCandidates.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => setImportSelection((prev) => ({ ...prev, [row.id!]: !prev[row.id!] }))}
                className={cn(
                  'border-b border-border p-3 dark:border-zinc-800',
                  importSelection[row.id!] && 'bg-primary/5 dark:bg-primary/10'
                )}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-foreground dark:text-zinc-100">{row.name}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {(row.category || 'No category') + (row.assignedPlanItemName ? ` · ${row.assignedPlanItemName}` : '')}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name={importSelection[row.id!] ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20}
                    color={importSelection[row.id!] ? '#22C55E' : '#717182'}
                  />
                </View>
              </Pressable>
            ))}
            {!importCandidates.length ? (
              <Text className="py-4 text-center text-sm text-muted-foreground">No items found for this filter.</Text>
            ) : null}
          </ScrollView>
          <View className="flex-row justify-end gap-2">
            <AppButton label="Cancel" onPress={() => setImportOpen(false)} variant="outline" />
            <AppButton
              label={`Import Selected (${selectedImportCount})`}
              onPress={importSelected}
              textClassName="text-white"
              disabled={selectedImportCount === 0}
            />
          </View>
        </View>
      </AppModal>
    </View>
  );
}
