import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
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

type ImportCandidate = {
  key: string;
  name: string;
  category: string;
  tags: string[];
  suggestedQty: number;
  suggestedPrice: number;
  assignedPeriodId?: string;
  assignedPlanItemId?: string;
  assignedPlanItemName?: string;
  assignedGroup?: PlanItem['group'];
  latestAt: number;
};

function normalize(input: string) {
  return input.trim().toLowerCase();
}

function timestampMs(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object') {
    const raw = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof raw.toMillis === 'function') {
      try {
        return raw.toMillis();
      } catch {
        return 0;
      }
    }
    if (typeof raw.seconds === 'number') {
      return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1_000_000);
    }
  }
  return 0;
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
  const [actionDialogItemId, setActionDialogItemId] = useState<string | null>(null);
  const [editDialogItemId, setEditDialogItemId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSearch, setImportSearch] = useState('');
  const [importCategoryFilter, setImportCategoryFilter] = useState('ALL');
  const [importSelection, setImportSelection] = useState<Record<string, boolean>>({});
  const [importError, setImportError] = useState('');
  const [importingItems, setImportingItems] = useState(false);

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
    setActionDialogItemId(null);
    setEditDialogItemId(null);
    setEditingItemId(null);
    setImportOpen(false);
    setImportSearch('');
    setImportCategoryFilter('ALL');
    setImportSelection({});
    setImportError('');
  }, [itemsOpen]);

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
  const actionRow = useMemo(
    () => (actionDialogItemId ? rowById[actionDialogItemId] || null : null),
    [actionDialogItemId, rowById]
  );
  const editRow = useMemo(
    () => (editDialogItemId ? rowById[editDialogItemId] || null : null),
    [editDialogItemId, rowById]
  );

  const selectedListTotalPrice = useMemo(
    () => items.reduce((sum, row) => sum + (row.completed ? row.cost || 0 : effectiveLinePrice(row)), 0),
    [items]
  );

  const selectedListCompletedCount = useMemo(
    () => items.filter((row) => row.completed === true).length,
    [items]
  );
  const existingItemKeys = useMemo(
    () => new Set(items.map((row) => normalize(row.name || '')).filter(Boolean)),
    [items]
  );

  useEffect(() => {
    if (!actionDialogItemId) return;
    if (rowById[actionDialogItemId]) return;
    setActionDialogItemId(null);
  }, [actionDialogItemId, rowById]);

  useEffect(() => {
    if (!editDialogItemId) return;
    if (rowById[editDialogItemId]) return;
    setEditDialogItemId(null);
    setEditingItemId((prev) => (prev === editDialogItemId ? null : prev));
  }, [editDialogItemId, rowById]);

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

  const importCandidates = useMemo<ImportCandidate[]>(() => {
    const byName = new Map<string, ImportCandidate>();

    allItems.forEach((row) => {
      const key = normalize(row.name || '');
      if (!key) return;
      const ts = Math.max(timestampMs(row.updatedAt), timestampMs(row.createdAt));
      const current = byName.get(key);
      const candidate: ImportCandidate = {
        key,
        name: row.name || key,
        category: row.category || '',
        tags: row.tags || [],
        suggestedQty: Math.max(1, Number(row.quantity || 1)),
        suggestedPrice: Math.max(0, Number(row.price || 0)),
        assignedPeriodId: row.assignedPeriodId,
        assignedPlanItemId: row.assignedPlanItemId,
        assignedPlanItemName: row.assignedPlanItemName,
        assignedGroup: row.assignedGroup as PlanItem['group'] | undefined,
        latestAt: ts,
      };
      if (!current || ts >= current.latestAt) {
        byName.set(key, candidate);
      } else if (current) {
        byName.set(key, {
          ...current,
          category: current.category || candidate.category,
          tags: [...new Set([...(current.tags || []), ...(candidate.tags || [])])],
        });
      }
    });

    catalogRows.forEach((row) => {
      const key = normalize(row.name || '');
      if (!key) return;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, {
          key,
          name: row.name || key,
          category: row.category || '',
          tags: row.tags || [],
          suggestedQty: 1,
          suggestedPrice: 0,
          latestAt: Math.max(timestampMs(row.updatedAt), timestampMs(row.createdAt)),
        });
        return;
      }
      byName.set(key, {
        ...existing,
        name: existing.name || row.name || key,
        category: existing.category || row.category || '',
        tags: [...new Set([...(existing.tags || []), ...(row.tags || [])])],
      });
    });

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems, catalogRows]);

  const importCategoryOptions = useMemo(() => {
    const names = [...new Set(importCandidates.map((row) => row.category.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
    return [{ label: 'All categories', value: 'ALL' }, ...names.map((name) => ({ label: name, value: name }))];
  }, [importCandidates]);

  const filteredImportCandidates = useMemo(() => {
    const q = normalize(importSearch);
    const rows = importCandidates.filter((row) => {
      if (importCategoryFilter !== 'ALL' && row.category !== importCategoryFilter) return false;
      if (!q) return true;
      return normalize(row.name).includes(q) || normalize(row.category || '').includes(q);
    });
    return rows;
  }, [importCandidates, importSearch, importCategoryFilter]);

  const selectedImportCount = useMemo(
    () => Object.values(importSelection).filter(Boolean).length,
    [importSelection]
  );

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

  function openImportModal() {
    if (!selectedListId) return;
    setImportOpen(true);
    setImportSearch('');
    setImportCategoryFilter('ALL');
    setImportSelection({});
    setImportError('');
  }

  function toggleImportSelection(key: string) {
    setImportSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function selectAllFilteredImports() {
    const next: Record<string, boolean> = {};
    filteredImportCandidates.forEach((row) => {
      if (existingItemKeys.has(row.key)) return;
      next[row.key] = true;
    });
    setImportSelection((prev) => ({ ...prev, ...next }));
  }

  function clearImportSelection() {
    setImportSelection({});
  }

  async function importSelectedItems() {
    if (!uid || !selectedListId) return;
    const picks = importCandidates.filter((row) => importSelection[row.key]);
    if (!picks.length) {
      setImportError('Select at least one item to import.');
      return;
    }

    const existingNames = new Set(existingItemKeys);
    let added = 0;
    let skipped = 0;

    setImportingItems(true);
    setImportError('');
    try {
      for (const pick of picks) {
        if (existingNames.has(pick.key)) {
          skipped += 1;
          continue;
        }
        await addShoppingListItem(uid, selectedListId, {
          name: pick.name,
          quantity: Math.max(1, Number(pick.suggestedQty || 1)),
          price: Math.max(0, Number(pick.suggestedPrice || 0)),
          category: pick.category || '',
          tags: pick.tags || [],
          bought: false,
          completed: false,
          cost: 0,
          assignedPeriodId: pick.assignedPeriodId || selectedPid,
          assignedPlanItemId: pick.assignedPlanItemId || '',
          assignedPlanItemName: pick.assignedPlanItemName || '',
          assignedGroup: (pick.assignedGroup || undefined) as any,
        });
        if (pick.category) await addShoppingCategory(uid, pick.category);
        existingNames.add(pick.key);
        added += 1;
      }

      if (!added) {
        setImportError('Selected items already exist in this shopping list.');
        return;
      }

      setImportOpen(false);
      setImportSelection({});
      setImportSearch('');
      setImportCategoryFilter('ALL');
      setItemError(
        skipped ? `${added} items imported. ${skipped} duplicate item(s) were skipped.` : `${added} items imported.`
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setImportError(message || 'Could not import items.');
    } finally {
      setImportingItems(false);
    }
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
      setEditDialogItemId((prev) => (prev === itemId ? null : prev));
      setActionDialogItemId((prev) => (prev === itemId ? null : prev));
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
    resetItemEditFromSource(itemId);
    setEditingItemId(itemId);
    setEditDialogItemId(itemId);
    setActionDialogItemId(null);
    setItemError('');
  }

  function cancelItemEdit(itemId: string) {
    resetItemEditFromSource(itemId);
    setEditingItemId((prev) => (prev === itemId ? null : prev));
    setEditDialogItemId((prev) => (prev === itemId ? null : prev));
    setItemError('');
  }

  function openItemsModal(listId: string) {
    setSelectedListId(listId);
    setItemError('');
    setActionDialogItemId(null);
    setEditDialogItemId(null);
    setEditingItemId(null);
    setImportOpen(false);
    setImportSearch('');
    setImportCategoryFilter('ALL');
    setImportSelection({});
    setImportError('');
    setItemsOpen(true);
  }

  function openItemActions(row: ShoppingListItem) {
    if (!row.id) return;
    setActionDialogItemId(row.id);
    setItemError('');
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
    setEditDialogItemId((prev) => (prev === row.id ? null : prev));
    setActionDialogItemId((prev) => (prev === row.id ? null : prev));
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
                <IconActionButton
                  icon="database-import-outline"
                  label="Import from shopping items"
                  onPress={openImportModal}
                  disabled={!importCandidates.length}
                />
              </View>
              <Text className="text-[11px] text-muted-foreground">
                Import from your saved shopping items. Latest qty and price are suggested automatically.
              </Text>

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
                const completed = row.completed === true;
                const rowId = row.id || `${normalize(row.name || 'item')}-${index}`;
                const quantity = Math.max(1, Number(row.quantity || 1));
                const unitPrice = Math.max(0, Number(row.price || 0));
                const lineTotal = quantity * unitPrice;
                return (
                  <View
                    key={rowId}
                    className="rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted/35 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/55"
                  >
                    <View className="flex-row items-start gap-3">
                      <View className="min-w-0 flex-1 gap-1">
                        <Text className="text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={2}>
                          {row.name}
                        </Text>
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-[11px] text-muted-foreground">Qty {quantity}</Text>
                          <Text className="text-[11px] text-muted-foreground">Price {fmtMoney(unitPrice)}</Text>
                          <Text className="text-[11px] font-semibold text-foreground dark:text-zinc-50">Total {fmtMoney(lineTotal)}</Text>
                          {completed ? <AppBadge label="Completed" variant="success" /> : null}
                        </View>
                      </View>

                      <View className="items-end gap-2">
                        <View className="flex-row items-center gap-1">
                          <Text className="text-[11px] text-muted-foreground">Bought</Text>
                          <Switch value={row.bought === true} onValueChange={(value) => void toggleBought(row, value)} />
                        </View>
                        <IconActionButton
                          icon="dots-horizontal-circle-outline"
                          label="Item actions"
                          onPress={() => openItemActions(row)}
                        />
                      </View>
                    </View>
                  </View>
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
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Shopping Items"
        contentClassName="max-w-2xl"
      >
        <View className="gap-3">
          <Text className="text-xs text-muted-foreground">
            Search by item name or category, select multiple items, then import into this shopping list.
          </Text>

          <View className="gap-2 md:flex-row md:items-center">
            <View className="flex-1">
              <AppInput
                value={importSearch}
                onChangeText={setImportSearch}
                placeholder="Search items or categories"
                className="h-9"
              />
            </View>
            <View className="md:w-64">
              <DropdownField
                value={importCategoryFilter}
                options={importCategoryOptions}
                onChange={setImportCategoryFilter}
                placeholder="All categories"
                menuStrategy="inline"
                menuClassName="max-h-52"
              />
            </View>
          </View>

          <View className="flex-row flex-wrap items-center gap-2">
            <AppBadge label={`${filteredImportCandidates.length} found`} variant="outline" />
            <AppBadge label={`${selectedImportCount} selected`} variant="secondary" />
            <AppButton variant="outline" size="sm" label="Select all" onPress={selectAllFilteredImports} />
            <AppButton variant="ghost" size="sm" label="Clear" onPress={clearImportSelection} />
          </View>

          <View className="max-h-80 gap-2 overflow-hidden rounded-lg border border-border bg-card p-2 dark:border-zinc-800 dark:bg-zinc-900">
            <ScrollView nestedScrollEnabled>
              <View className="gap-1">
                {filteredImportCandidates.map((row) => {
                  const selected = importSelection[row.key] === true;
                  const existsInCurrent = existingItemKeys.has(row.key);
                  return (
                    <Pressable
                      key={row.key}
                      onPress={() => {
                        if (existsInCurrent) return;
                        toggleImportSelection(row.key);
                      }}
                      className={`rounded-md border px-3 py-2 ${
                        existsInCurrent
                          ? 'border-border/60 bg-muted/20 opacity-70 dark:border-zinc-800 dark:bg-zinc-800/20'
                          : selected
                            ? 'border-primary/50 bg-primary/5 dark:border-zinc-700 dark:bg-zinc-800/70'
                            : 'border-border bg-card hover:bg-muted/35 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <View className="flex-row items-start gap-2">
                        <MaterialCommunityIcons
                          name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={18}
                          color={existsInCurrent ? '#717182' : selected ? '#22C55E' : '#717182'}
                        />
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
                            {row.name}
                          </Text>
                          <View className="mt-1 flex-row flex-wrap items-center gap-2">
                            {row.category ? <AppBadge label={row.category} variant="outline" /> : null}
                            <Text className="text-[11px] text-muted-foreground">Suggested qty {Math.max(1, Number(row.suggestedQty || 1))}</Text>
                            <Text className="text-[11px] text-muted-foreground">Suggested price {fmtMoney(Math.max(0, Number(row.suggestedPrice || 0)))}</Text>
                            {existsInCurrent ? <AppBadge label="Already in list" variant="secondary" /> : null}
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}

                {!filteredImportCandidates.length ? (
                  <View className="py-4">
                    <Text className="text-sm text-muted-foreground">No items match this search/filter.</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>

          {importError ? <Text className="text-xs text-destructive">{importError}</Text> : null}

          <View className="flex-row justify-end gap-2">
            <AppButton variant="outline" label="Cancel" onPress={() => setImportOpen(false)} />
            <AppButton
              label={importingItems ? 'Importing...' : `Import Selected (${selectedImportCount})`}
              onPress={importSelectedItems}
              disabled={importingItems || selectedImportCount === 0}
            />
          </View>
        </View>
      </AppModal>

      <AppModal
        open={Boolean(actionRow)}
        onClose={() => setActionDialogItemId(null)}
        title={actionRow ? actionRow.name : 'Item Actions'}
        contentClassName="max-w-sm"
      >
        <View className="gap-3">
          <Text className="text-xs text-muted-foreground">Choose what you want to do with this shopping item.</Text>
          <AppButton
            variant="outline"
            label="Edit"
            onPress={() => {
              if (!actionRow?.id) return;
              beginItemEdit(actionRow.id);
            }}
          />
          <AppButton
            variant="outline"
            label={actionRow?.completed ? 'Already Completed' : 'Complete'}
            disabled={actionRow?.completed === true}
            onPress={() => {
              if (!actionRow) return;
              setActionDialogItemId(null);
              openCompleteModal(actionRow);
            }}
          />
          <AppButton
            variant="destructive"
            label="Delete"
            onPress={() => {
              if (!actionRow) return;
              void removeItem(actionRow);
            }}
          />
          <AppButton variant="ghost" label="Cancel" onPress={() => setActionDialogItemId(null)} />
        </View>
      </AppModal>

      <AppModal
        open={Boolean(editDialogItemId && editRow)}
        onClose={() => {
          if (!editDialogItemId) return;
          cancelItemEdit(editDialogItemId);
        }}
        title={editRow ? `Edit ${editRow.name}` : 'Edit Item'}
        contentClassName="max-w-md"
      >
        {editRow && editDialogItemId ? (
          <View className="gap-3">
            <View className="rounded-md border border-border bg-muted/25 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/35">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">Name</Text>
              <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{editRow.name}</Text>
            </View>

            <View className="flex-row items-center gap-2">
              <View className="w-20">
                <Text className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Qty</Text>
                <AppInput
                  value={itemEdits[editDialogItemId]?.quantity ?? String(Math.max(1, Number(editRow.quantity || 1)))}
                  onChangeText={(value) => setItemEditField(editDialogItemId, { quantity: value })}
                  keyboardType="number-pad"
                  className="h-9 text-center"
                  placeholder="Qty"
                />
              </View>
              <View className="w-28">
                <Text className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Price</Text>
                <AppInput
                  value={itemEdits[editDialogItemId]?.price ?? String(Number(editRow.price || 0) || '')}
                  onChangeText={(value) => setItemEditField(editDialogItemId, { price: value })}
                  keyboardType="decimal-pad"
                  className="h-9 text-right"
                  placeholder="Price"
                />
              </View>
              <View className="flex-1 pt-5">
                <Text className="text-right text-xs text-muted-foreground">
                  Total {fmtMoney(Math.max(1, Number(itemEdits[editDialogItemId]?.quantity || editRow.quantity || 1)) * Math.max(0, parseMoney(itemEdits[editDialogItemId]?.price ?? String(editRow.price || 0))))}
                </Text>
              </View>
            </View>

            {itemError ? <Text className="text-xs text-destructive">{itemError}</Text> : null}

            <View className="flex-row justify-end gap-2">
              <AppButton
                variant="outline"
                label="Cancel"
                onPress={() => {
                  cancelItemEdit(editDialogItemId);
                }}
              />
              <AppButton
                label="Save"
                onPress={() => void saveItemEdits(editDialogItemId)}
                disabled={!itemEdits[editDialogItemId]?.dirty || Boolean(itemEdits[editDialogItemId]?.saving)}
              />
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
