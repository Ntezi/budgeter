import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  addShoppingCategory,
  type ShoppingCatalogItem,
  addShoppingList,
  addShoppingListItem,
  deleteShoppingList,
  deleteShoppingListItem,
  type ShoppingList,
  type ShoppingListItem,
  upsertShoppingCatalogItem,
  updateShoppingListItem,
  watchShoppingCatalog,
  watchShoppingListItems,
  watchShoppingLists,
} from '@/lib/repo/shopping';
import { addTransaction } from '@/lib/repo/transactions';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { fmtMoney, parseMoney } from '@/lib/format';
import { planGroupLabel } from '@/lib/groups';

type PlanOption = { id: string; label: string; group: PlanItem['group'] };
type Suggestion = {
  name: string;
  category?: string;
  tags: string[];
  assignedPlanItemId?: string;
  assignedPlanItemName?: string;
  assignedGroup?: PlanItem['group'];
};

type ItemEditState = {
  quantity: string;
  price: string;
  dirty: boolean;
  saving: boolean;
};

type SwipeActionVariant = 'default' | 'success' | 'danger' | 'muted';

type SwipeRowProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  actionWidth: number;
  children: React.ReactNode;
  actions: React.ReactNode;
};

type SwipeActionButtonProps = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  variant?: SwipeActionVariant;
  disabled?: boolean;
  onPress: () => void;
};

function SwipeRow({ open, onOpen, onClose, actionWidth, children, actions }: SwipeRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const dragStart = useRef(0);

  const snapTo = useCallback(
    (next: number) => {
      currentX.current = next;
      Animated.timing(translateX, {
        toValue: next,
        duration: 160,
        useNativeDriver: true,
      }).start();
    },
    [translateX]
  );

  useEffect(() => {
    snapTo(open ? -actionWidth : 0);
  }, [actionWidth, open, snapTo]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          dragStart.current = currentX.current;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const next = Math.max(-actionWidth, Math.min(0, dragStart.current + gestureState.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const next = dragStart.current + gestureState.dx;
          const openByDistance = next <= -actionWidth * 0.4;
          const openByVelocity = gestureState.vx < -0.35;
          if (openByDistance || openByVelocity) {
            onOpen();
            return;
          }
          onClose();
        },
        onPanResponderTerminate: () => {
          if (open) onOpen();
          else onClose();
        },
      }),
    [actionWidth, onClose, onOpen, open, translateX]
  );

  return (
    <View className="relative overflow-hidden">
      <View className="absolute inset-y-0 right-0 flex-row items-stretch" style={{ width: actionWidth }}>
        {actions}
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

function SwipeActionButton({ icon, label, variant = 'default', disabled, onPress }: SwipeActionButtonProps) {
  const variantClass =
    variant === 'danger'
      ? 'bg-destructive/90'
      : variant === 'success'
        ? 'bg-emerald-600/90'
        : variant === 'muted'
          ? 'bg-zinc-500/90'
          : 'bg-slate-600/90';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...({ title: label } as any)}
      onPress={onPress}
      disabled={disabled}
      className={`w-12 items-center justify-center border-l border-black/10 active:opacity-80 ${variantClass} ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <MaterialCommunityIcons name={icon} size={18} color="#FFFFFF" />
    </Pressable>
  );
}

function normalize(input: string) {
  return input.trim().toLowerCase();
}

export default function ShoppingScreen() {
  const uid = useWorkspaceUid();
  const router = useRouter();
  const { action } = useLocalSearchParams<{ action?: string }>();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [itemsOpen, setItemsOpen] = useState(false);
  const [catalogRows, setCatalogRows] = useState<ShoppingCatalogItem[]>([]);

  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [itemsByListId, setItemsByListId] = useState<Record<string, ShoppingListItem[]>>({});

  const [createListOpen, setCreateListOpen] = useState(false);
  const [listDraftName, setListDraftName] = useState('');
  const [listError, setListError] = useState('');

  const [itemDraftName, setItemDraftName] = useState('');
  const [itemDraftQuantity, setItemDraftQuantity] = useState('1');
  const [itemDraftPrice, setItemDraftPrice] = useState('');
  const [itemError, setItemError] = useState('');
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEditState>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [openActionItemId, setOpenActionItemId] = useState<string | null>(null);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeItemId, setCompleteItemId] = useState('');
  const [completeCostInput, setCompleteCostInput] = useState('');
  const [completePlanId, setCompletePlanId] = useState('');
  const [completeError, setCompleteError] = useState('');
  const [finalizingList, setFinalizingList] = useState(false);

  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  useEffect(() => {
    if (!uid) return;
    return watchShoppingLists(uid, (rows) => {
      setLists(rows);
      setSelectedListId((prev) => {
        if (!rows.length) {
          setItemsOpen(false);
          return '';
        }
        if (!prev) return rows[0]?.id || '';
        return rows.some((row) => row.id === prev) ? prev : rows[0]?.id || '';
      });
    });
  }, [uid]);

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
    if (itemsOpen) return;
    setOpenActionItemId(null);
  }, [itemsOpen]);

  useEffect(() => {
    if (!openActionItemId) return;
    if (items.some((row) => row.id === openActionItemId)) return;
    setOpenActionItemId(null);
  }, [items, openActionItemId]);

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
      if (!next.some((period) => period.id === selectedPid) && next[0]?.id) {
        setSelectedPid(next[0].id);
      }
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, rows) => setPlanItems(rows));
  }, [uid, selectedPid]);

  useEffect(() => {
    if (action !== 'new-list' && action !== 'new-item') return;

    if (action === 'new-list') {
      setCreateListOpen(true);
      setListError('');
      router.replace('/shopping');
      return;
    }

    if (!lists.length) {
      setCreateListOpen(true);
      setItemError('Create a shopping list first.');
      router.replace('/shopping');
      return;
    }

    const listId = selectedListId || lists[0]?.id || '';
    setSelectedListId(listId);
    setItemsOpen(true);
    router.replace('/shopping');
  }, [action, lists, selectedListId, router]);

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
    const totalPrice = allItems.reduce((sum, row) => {
      const quantity = Math.max(1, Number(row.quantity || 1));
      const estimated = Math.max(0, Number(row.price || 0)) * quantity;
      return sum + (row.completed ? row.cost || estimated : estimated);
    }, 0);
    return { completed, pending, spent, totalPrice };
  }, [allItems]);

  function effectiveLinePrice(row: ShoppingListItem) {
    const quantity = Math.max(1, Number(row.quantity || 1));
    const unitPrice = Math.max(0, Number(row.price || 0));
    return unitPrice * quantity;
  }

  const displayItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const byCompletion = Number(a.completed === true) - Number(b.completed === true);
      if (byCompletion !== 0) return byCompletion;
      return normalize(a.name || '').localeCompare(normalize(b.name || ''));
    });
  }, [items]);
  const rowById = useMemo(
    () =>
      Object.fromEntries(
        items.filter((row): row is ShoppingListItem & { id: string } => Boolean(row.id)).map((row) => [row.id, row])
      ) as Record<string, ShoppingListItem & { id: string }>,
    [items]
  );

  const selectedListTotalPrice = useMemo(
    () => items.reduce((sum, row) => sum + (row.completed ? row.cost || 0 : effectiveLinePrice(row)), 0),
    [items]
  );

  const selectedListCompletedCount = useMemo(
    () => items.filter((row) => row.completed === true).length,
    [items]
  );

  useEffect(() => {
    setItemEdits((prev) => {
      const next: Record<string, ItemEditState> = {};
      items.forEach((row) => {
        if (!row.id) return;
        const existing = prev[row.id];
        if (existing?.dirty || existing?.saving) {
          next[row.id] = existing;
          return;
        }
        next[row.id] = {
          quantity: String(Math.max(1, Number(row.quantity || 1))),
          price: String(Number(row.price || 0) || ''),
          dirty: false,
          saving: false,
        };
      });
      return next;
    });
  }, [items]);

  const suggestionPool = useMemo<Suggestion[]>(() => {
    const byName = new Map<string, Suggestion>();
    catalogRows.forEach((row) => {
      const key = (row.name || '').trim().toLowerCase();
      if (!key) return;
      if (!byName.has(key)) {
        byName.set(key, {
          name: row.name,
          category: row.category || '',
          tags: row.tags ?? [],
        });
        return;
      }
      const existing = byName.get(key)!;
      byName.set(key, {
        ...existing,
        category: existing.category || row.category || '',
        tags: [...new Set([...(existing.tags || []), ...(row.tags || [])])],
      });
    });
    allItems.forEach((row) => {
      const key = (row.name || '').trim().toLowerCase();
      if (!key) return;
      if (!byName.has(key)) {
        byName.set(key, {
          name: row.name,
          category: row.category || '',
          tags: row.tags ?? [],
          assignedPlanItemId: row.assignedPlanItemId,
          assignedPlanItemName: row.assignedPlanItemName,
          assignedGroup: row.assignedGroup as PlanItem['group'] | undefined,
        });
        return;
      }
      const existing = byName.get(key)!;
      byName.set(key, {
        ...existing,
        category: existing.category || row.category || '',
        tags: [...new Set([...(existing.tags || []), ...(row.tags || [])])],
      });
    });

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems, catalogRows]);

  const suggestionByName = useMemo(() => {
    const out: Record<string, Suggestion> = {};
    suggestionPool.forEach((row) => {
      out[row.name.trim().toLowerCase()] = row;
    });
    return out;
  }, [suggestionPool]);

  const itemNameSuggestions = useMemo(() => {
    const q = itemDraftName.trim().toLowerCase();
    if (!q) return suggestionPool.slice(0, 8);
    return suggestionPool.filter((row) => row.name.toLowerCase().includes(q) && row.name.toLowerCase() !== q).slice(0, 8);
  }, [itemDraftName, suggestionPool]);

  const completingRow = useMemo(() => items.find((row) => row.id === completeItemId) || null, [items, completeItemId]);

  useEffect(() => {
    if (!completeOpen || completingRow) return;
    setCompleteOpen(false);
    setCompleteItemId('');
  }, [completeOpen, completingRow]);

  function listPendingCount(list: ShoppingList) {
    const rows = list.id ? itemsByListId[list.id] || [] : [];
    return rows.filter((row) => row.completed !== true).length;
  }

  function listTotalPrice(list: ShoppingList) {
    const rows = list.id ? itemsByListId[list.id] || [] : [];
    return rows.reduce((sum, row) => sum + (row.completed ? row.cost || 0 : effectiveLinePrice(row)), 0);
  }

  async function createList() {
    if (!uid) return;
    const name = listDraftName.trim();
    if (!name) {
      setListError('Shopping list name is required.');
      return;
    }
    const ref = await addShoppingList(uid, name);
    setListDraftName('');
    setListError('');
    setCreateListOpen(false);
    setSelectedListId(ref.id);
    setItemsOpen(true);
  }

  async function removeList(list: ShoppingList) {
    if (!uid || !list.id) return;
    await deleteShoppingList(uid, list.id);
    if (selectedListId === list.id) {
      setSelectedListId('');
      setItemsOpen(false);
    }
  }

  async function addItem() {
    if (!uid || !selectedListId) return;
    const name = itemDraftName.trim();
    const existingName = normalize(name);
    if (items.some((row) => normalize(row.name || '') === existingName)) {
      setItemError('This item already exists in the current shopping list.');
      return;
    }
    const qtyParsed = Number.parseInt(itemDraftQuantity.trim(), 10);
    const quantity = Number.isFinite(qtyParsed) && qtyParsed > 0 ? qtyParsed : 1;
    const price = Math.max(0, parseMoney(itemDraftPrice));
    if (!name) {
      setItemError('Item name is required.');
      return;
    }

    const remembered = suggestionByName[name.toLowerCase()];
    const rememberedPlanId = remembered?.assignedPlanItemId || '';
    const rememberedPlan = planOptions.find((option) => option.id === rememberedPlanId);
    const category = remembered?.category || '';
    const tags = remembered?.tags || [];

    await addShoppingListItem(uid, selectedListId, {
      name,
      quantity,
      price,
      category,
      tags,
      bought: false,
      completed: false,
      cost: 0,
      assignedPeriodId: selectedPid,
      assignedPlanItemId: rememberedPlan?.id || rememberedPlanId,
      assignedPlanItemName: rememberedPlan?.label || remembered?.assignedPlanItemName || '',
      assignedGroup: (rememberedPlan?.group || remembered?.assignedGroup || undefined) as any,
    });
    await upsertShoppingCatalogItem(uid, {
      name,
      category,
      tags,
    });
    if (category) await addShoppingCategory(uid, category);

    setItemDraftName('');
    setItemDraftQuantity('1');
    setItemDraftPrice('');
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

  function setItemEditField(id: string, patch: Partial<{ quantity: string; price: string }>) {
    const source = rowById[id];
    if (!source) return;
    setItemEdits((prev) => {
      const existing = prev[id] || {
        quantity: String(Math.max(1, Number(source.quantity || 1))),
        price: String(Number(source.price || 0) || ''),
        dirty: false,
        saving: false,
      };
      const next = {
        ...existing,
        ...patch,
      };
      const sourceQty = Math.max(1, Number(source.quantity || 1));
      const draftQty = Number.parseInt(next.quantity.trim(), 10);
      const normalizedQty = Number.isFinite(draftQty) && draftQty > 0 ? draftQty : sourceQty;
      const sourcePrice = Math.max(0, Number(source.price || 0));
      const draftPrice = Math.max(0, parseMoney(next.price));
      next.dirty = normalizedQty !== sourceQty || draftPrice !== sourcePrice;
      return { ...prev, [id]: next };
    });
  }

  async function saveItemEdits(itemId: string) {
    if (!uid || !selectedListId || !itemId) return;
    const source = rowById[itemId];
    const draft = itemEdits[itemId];
    if (!source || !draft) return;
    const qtyParsed = Number.parseInt(draft.quantity.trim(), 10);
    const price = Math.max(0, parseMoney(draft.price));
    if (!Number.isFinite(qtyParsed) || qtyParsed < 1) {
      setItemError('Quantity must be at least 1.');
      return;
    }

    setItemEdits((prev) => ({ ...prev, [itemId]: { ...draft, saving: true } }));
    try {
      await updateShoppingListItem(uid, selectedListId, itemId, { quantity: qtyParsed, price });
      await upsertShoppingCatalogItem(uid, {
        name: source.name,
        category: source.category || '',
        tags: source.tags || [],
      });
      setItemError('');
      setItemEdits((prev) => ({
        ...prev,
        [itemId]: { ...draft, quantity: String(qtyParsed), price: String(price || ''), dirty: false, saving: false },
      }));
      setEditingItemId((prev) => (prev === itemId ? null : prev));
      setOpenActionItemId((prev) => (prev === itemId ? null : prev));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setItemError(message || 'Could not save shopping item.');
      setItemEdits((prev) => ({ ...prev, [itemId]: { ...draft, saving: false } }));
    }
  }

  function resetItemEditFromSource(itemId: string) {
    const source = rowById[itemId];
    if (!source) return;
    setItemEdits((prev) => ({
      ...prev,
      [itemId]: {
        quantity: String(Math.max(1, Number(source.quantity || 1))),
        price: String(Number(source.price || 0) || ''),
        dirty: false,
        saving: false,
      },
    }));
  }

  function beginItemEdit(itemId: string) {
    if (editingItemId && editingItemId !== itemId) {
      const current = itemEdits[editingItemId];
      if (current?.dirty) {
        setItemError('Save or cancel the current edited item first.');
        return;
      }
    }
    setEditingItemId(itemId);
    setOpenActionItemId(itemId);
    setItemError('');
  }

  function cancelItemEdit(itemId: string) {
    resetItemEditFromSource(itemId);
    setEditingItemId((prev) => (prev === itemId ? null : prev));
    setOpenActionItemId((prev) => (prev === itemId ? null : prev));
    setItemError('');
  }

  function openItemsModal(listId: string) {
    setSelectedListId(listId);
    setItemError('');
    setOpenActionItemId(null);
    setItemsOpen(true);
  }

  function openCompleteModal(row: ShoppingListItem) {
    if (row.assignedPeriodId && periods.some((period) => period.id === row.assignedPeriodId)) {
      setSelectedPid(row.assignedPeriodId);
    }
    setCompleteItemId(row.id || '');
    const fallbackCost = effectiveLinePrice(row);
    setCompleteCostInput(String(row.cost || fallbackCost || ''));
    setCompletePlanId(row.assignedPlanItemId || '');
    setCompleteError('');
    setCompleteOpen(true);
  }

  async function saveCompleteItem() {
    if (!uid || !selectedListId || !completeItemId || !completingRow) return;

    const cost = parseMoney(completeCostInput);
    if (!Number.isFinite(cost) || cost < 0) {
      setCompleteError('Enter a valid amount before saving.');
      return;
    }

    const plan = planOptions.find((option) => option.id === completePlanId);
    const group = plan?.group ?? (completingRow.assignedGroup as PlanItem['group'] | undefined) ?? 'NEED';
    const categoryId = completePlanId;

    try {
      await updateShoppingListItem(uid, selectedListId, completeItemId, {
        bought: true,
        completed: true,
        cost,
        assignedPeriodId: selectedPid,
        assignedPlanItemId: categoryId,
        assignedPlanItemName: categoryId ? plan?.label || completingRow.assignedPlanItemName || '' : '',
        assignedGroup: (group || 'NEED') as any,
      });

      setCompleteOpen(false);
      setCompleteItemId('');
      setCompleteError('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setCompleteError(message || 'Could not complete item.');
    }
  }

  async function removeItem(row: ShoppingListItem) {
    if (!uid || !selectedListId || !row.id) return;
    await deleteShoppingListItem(uid, selectedListId, row.id);
    setEditingItemId((prev) => (prev === row.id ? null : prev));
    setOpenActionItemId((prev) => (prev === row.id ? null : prev));
  }

  async function finalizeShoppingList() {
    if (!uid || !selectedListId) return;
    const completedRows = items.filter((row): row is ShoppingListItem & { id: string } => Boolean(row.id) && row.completed === true);
    if (!completedRows.length) {
      setItemError('No completed items to finalize.');
      return;
    }

    setFinalizingList(true);
    setItemError('');
    try {
      for (const row of completedRows) {
        const amount = Math.max(0, Number(row.cost || effectiveLinePrice(row)));
        const pid = row.assignedPeriodId || selectedPid;
        const group = (row.assignedGroup as PlanItem['group'] | undefined) || 'NEED';
        const categoryId = row.assignedPlanItemId || '';
        const category = row.category || '';

        await upsertShoppingCatalogItem(uid, {
          name: row.name,
          category,
          tags: row.tags || [],
        });
        if (category) await addShoppingCategory(uid, category);

        if (!row.assignedTxId && amount > 0) {
          const txPayload: Record<string, unknown> = {
            name: row.name,
            amount,
            group,
            date: new Date().toISOString().slice(0, 10),
            note: `Shopping list "${selectedList?.name || ''}" item "${row.name}"`,
            shoppingListId: selectedListId,
            shoppingListName: selectedList?.name || '',
            shoppingItemId: row.id,
            shoppingItemName: row.name,
          };
          if (categoryId) txPayload.categoryId = categoryId;
          await addTransaction(uid, pid, txPayload as any);
        }

        await deleteShoppingListItem(uid, selectedListId, row.id);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setItemError(message || 'Could not finalize shopping list.');
    } finally {
      setFinalizingList(false);
    }
  }

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-24">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Shopping Lists</Text>
          <Text className="text-sm text-muted-foreground">Create lists and open each one in a focused drawer-style dialog.</Text>
        </View>

        <AppCard className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Shopping Lists</Text>
            <IconActionButton icon="playlist-plus" label="New shopping list" onPress={() => setCreateListOpen(true)} />
          </View>

          <View className="gap-2">
            {lists.map((list) => {
              const pending = listPendingCount(list);
              return (
                <Pressable
                  key={list.id}
                  onPress={() => list.id && openItemsModal(list.id)}
                  className="rounded-lg border border-border bg-card px-3 py-3 hover:bg-muted/30 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/55"
                  {...({ title: `Open shopping list ${list.name}` } as any)}
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{list.name}</Text>
                      <Text className="text-xs text-muted-foreground">Pending: {pending} · Total {fmtMoney(listTotalPrice(list))}</Text>
                    </View>
                    {pending === 0 ? <AppBadge label="Done" variant="success" /> : null}
                    <IconActionButton
                      icon="open-in-new"
                      label="Open list"
                      onPress={(event: any) => {
                        event?.stopPropagation?.();
                        if (list.id) openItemsModal(list.id);
                      }}
                    />
                    <IconActionButton
                      icon="trash-can-outline"
                      label="Delete list"
                      variant="danger"
                      onPress={(event: any) => {
                        event?.stopPropagation?.();
                        void removeList(list);
                      }}
                    />
                  </View>
                </Pressable>
              );
            })}

            {!lists.length ? (
              <Text className="text-xs text-muted-foreground">No lists yet. Use the New List action.</Text>
            ) : null}
          </View>
        </AppCard>

        <AppCard className="gap-2">
          <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Shopping Summary</Text>
          <View className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <View className="rounded-md border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Lists</Text>
              <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{lists.length}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Pending</Text>
              <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{totals.pending}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Completed</Text>
              <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{totals.completed}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Completed Spend</Text>
              <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{fmtMoney(totals.spent)}</Text>
            </View>
            <View className="rounded-md border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Total Price</Text>
              <Text className="text-lg font-semibold text-foreground dark:text-zinc-50">{fmtMoney(totals.totalPrice)}</Text>
            </View>
          </View>
        </AppCard>
      </ScrollView>

      <AppModal open={createListOpen} onClose={() => setCreateListOpen(false)} title="Create Shopping List">
        <View className="gap-3">
          <AppInput value={listDraftName} onChangeText={setListDraftName} placeholder="e.g. Weekly Groceries" />
          {listError ? <Text className="text-xs text-destructive">{listError}</Text> : null}
          <View className="flex-row justify-end gap-2">
            <AppButton variant="outline" onPress={() => setCreateListOpen(false)} label="Cancel" />
            <AppButton onPress={createList} label="Create" />
          </View>
        </View>
      </AppModal>

      <AppModal
        open={itemsOpen && Boolean(selectedList)}
        onClose={() => setItemsOpen(false)}
        title={selectedList ? selectedList.name : 'Shopping List'}
        contentClassName="max-w-3xl"
      >
        {selectedList ? (
          <View className="gap-3">
            <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <Text className="text-xs text-muted-foreground">Pending checklist items for this shopping list.</Text>
              <View className="flex-row items-center gap-2">
                <AppBadge label={`List Total ${fmtMoney(selectedListTotalPrice)}`} variant="outline" />
                <AppBadge label={`Completed ${selectedListCompletedCount}`} variant="secondary" />
                <AppButton
                  variant="outline"
                  size="sm"
                  label={finalizingList ? 'Finalizing...' : `Done & Clear (${selectedListCompletedCount})`}
                  onPress={finalizeShoppingList}
                  disabled={finalizingList || selectedListCompletedCount === 0}
                />
              </View>
            </View>

            <View className="gap-2 rounded-lg border border-border bg-muted/20 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <View className="flex-row flex-wrap items-center gap-2">
                <View className="min-w-[180px] flex-1">
                  <AppInput value={itemDraftName} onChangeText={setItemDraftName} placeholder="New item name" className="h-9" />
                </View>
                <View className="w-20">
                  <AppInput
                    value={itemDraftQuantity}
                    onChangeText={setItemDraftQuantity}
                    placeholder="Qty"
                    keyboardType="number-pad"
                    className="h-9 text-center"
                  />
                </View>
                <View className="w-28">
                  <AppInput
                    value={itemDraftPrice}
                    onChangeText={setItemDraftPrice}
                    placeholder="Price"
                    keyboardType="decimal-pad"
                    className="h-9 text-right"
                  />
                </View>
                <IconActionButton icon="plus" label="Add shopping item" onPress={addItem} />
              </View>

              {itemNameSuggestions.length && itemDraftName.trim() ? (
                <View className="max-h-36 overflow-hidden rounded-md border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
                  <ScrollView nestedScrollEnabled>
                    {itemNameSuggestions.map((row) => (
                      <Pressable
                        key={row.name}
                        className="px-3 py-2 hover:bg-muted/35 dark:hover:bg-zinc-800/55"
                        onPress={() => {
                          setItemDraftName(row.name);
                        }}
                        {...({ title: `Use suggestion ${row.name}` } as any)}
                      >
                        <Text className="text-sm text-foreground dark:text-zinc-50">{row.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {itemError ? <Text className="text-xs text-destructive">{itemError}</Text> : null}
            </View>

            <View className="gap-2">
              {displayItems.map((row, index) => {
                const edit = row.id ? itemEdits[row.id] : undefined;
                const dirty = Boolean(edit?.dirty);
                const isEditing = Boolean(row.id && editingItemId === row.id);
                const completed = row.completed === true;
                const rowId = row.id || `${normalize(row.name || 'item')}-${index}`;
                const actionOpen = Boolean(row.id && openActionItemId === row.id);
                const lineTotal = (() => {
                  const quantity = Math.max(1, Number((isEditing ? edit?.quantity : row.quantity) || 1));
                  const price = Math.max(0, parseMoney(isEditing ? edit?.price ?? '' : String(row.price || '')));
                  return price * quantity;
                })();
                return (
                  <SwipeRow
                    key={rowId}
                    open={actionOpen}
                    actionWidth={192}
                    onOpen={() => row.id && setOpenActionItemId(row.id)}
                    onClose={() => {
                      if (!row.id) return;
                      setOpenActionItemId((prev) => (prev === row.id ? null : prev));
                    }}
                    actions={
                      <View className="h-full flex-row">
                        <SwipeActionButton
                          icon={row.bought === true ? 'cart-remove' : 'cart-check'}
                          label={row.bought === true ? 'Mark not bought' : 'Mark bought'}
                          variant="muted"
                          disabled={completed}
                          onPress={() => void toggleBought(row, row.bought !== true)}
                        />
                        {isEditing ? (
                          <>
                            <SwipeActionButton
                              icon="content-save-outline"
                              label="Save item"
                              variant="success"
                              disabled={completed || !dirty || Boolean(edit?.saving)}
                              onPress={() => row.id && saveItemEdits(row.id)}
                            />
                            <SwipeActionButton
                              icon="close"
                              label="Cancel edit"
                              variant="default"
                              onPress={() => row.id && cancelItemEdit(row.id)}
                            />
                            <SwipeActionButton
                              icon="trash-can-outline"
                              label="Delete item"
                              variant="danger"
                              onPress={() => removeItem(row)}
                            />
                          </>
                        ) : (
                          <>
                            <SwipeActionButton
                              icon="pencil-outline"
                              label="Edit item"
                              variant="default"
                              disabled={completed}
                              onPress={() => row.id && beginItemEdit(row.id)}
                            />
                            <SwipeActionButton
                              icon="check-circle-outline"
                              label="Complete item"
                              variant="success"
                              disabled={completed}
                              onPress={() => openCompleteModal(row)}
                            />
                            <SwipeActionButton
                              icon="trash-can-outline"
                              label="Delete item"
                              variant="danger"
                              onPress={() => removeItem(row)}
                            />
                          </>
                        )}
                      </View>
                    }
                  >
                    <View
                      className={`rounded-lg border px-3 py-2 dark:border-zinc-800 ${
                        dirty
                          ? 'border-primary/40 bg-primary/5 dark:bg-zinc-800/70'
                          : 'border-border bg-card hover:bg-muted/35 dark:bg-zinc-900 dark:hover:bg-zinc-800/55'
                      }`}
                    >
                      <View className="flex-row items-center gap-2">
                        <View className="min-w-0 flex-1 gap-1">
                          <Text className="text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={2}>
                            {row.name}
                          </Text>
                          <View className="flex-row flex-wrap items-center gap-2">
                            <Text className="text-[11px] text-muted-foreground">Qty {Math.max(1, Number(row.quantity || 1))}</Text>
                            {row.bought === true ? <AppBadge label="Bought" variant="secondary" /> : null}
                            {completed ? <AppBadge label="Completed" variant="success" /> : null}
                            {dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
                          </View>
                        </View>

                        {isEditing ? (
                          <View className="flex-row items-center gap-2">
                            <View className="w-14">
                              <AppInput
                                value={edit?.quantity ?? String(Math.max(1, Number(row.quantity || 1)))}
                                onChangeText={(value) => row.id && setItemEditField(row.id, { quantity: value })}
                                className="h-8 px-2 text-center text-xs"
                                keyboardType="number-pad"
                                placeholder="Qty"
                                editable={!completed}
                              />
                            </View>
                            <View className="w-20">
                              <AppInput
                                value={edit?.price ?? String(Number(row.price || 0) || '')}
                                onChangeText={(value) => row.id && setItemEditField(row.id, { price: value })}
                                className="h-8 px-2 text-right text-xs"
                                keyboardType="decimal-pad"
                                placeholder="Price"
                                editable={!completed}
                              />
                            </View>
                            <Text className="w-20 text-right text-xs font-semibold text-foreground dark:text-zinc-50">
                              {fmtMoney(lineTotal)}
                            </Text>
                          </View>
                        ) : (
                          <View className="flex-row items-center gap-1">
                            <Text className="w-12 text-right text-xs text-muted-foreground">x{Math.max(1, Number(row.quantity || 1))}</Text>
                            <Text className="w-20 text-right text-xs font-semibold text-foreground dark:text-zinc-50">
                              {fmtMoney(lineTotal)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </SwipeRow>
                );
              })}

              {!displayItems.length ? (
                <View className="py-4">
                  <Text className="text-sm text-muted-foreground">No pending items in this list.</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </AppModal>

      <AppModal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title={`Complete ${completingRow?.name || 'Item'}`}
        contentClassName="max-w-2xl"
      >
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Budget Period</Text>
            <DropdownField
              value={selectedPid}
              options={periodOptions}
              onChange={setSelectedPid}
              placeholder="Select period"
              menuStrategy="inline"
            />
          </View>

          <View className="gap-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Amount</Text>
            <AppInput
              value={completeCostInput}
              onChangeText={setCompleteCostInput}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="text-right"
            />
          </View>

          <View className="gap-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Budget Item</Text>
            <DropdownField
              value={completePlanId}
              options={[{ label: 'Optional budget item', value: '' }, ...planOptions.map((option) => ({ label: option.label, value: option.id }))]}
              onChange={setCompletePlanId}
              placeholder="Optional budget item"
              menuStrategy="inline"
              menuClassName="max-h-56"
            />
            {!planOptions.length ? <Text className="text-xs text-muted-foreground">No budget items available for this period.</Text> : null}
          </View>

          {completeError ? <Text className="text-xs text-destructive">{completeError}</Text> : null}

          <View className="flex-row justify-end gap-2">
            <AppButton variant="outline" onPress={() => setCompleteOpen(false)} label="Cancel" />
            <AppButton onPress={saveCompleteItem}>
              <View className="flex-row items-center gap-2">
                <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
                <Text className="text-sm font-medium text-primary-foreground">Save & Complete</Text>
              </View>
            </AppButton>
          </View>
        </View>
      </AppModal>
    </View>
  );
}
