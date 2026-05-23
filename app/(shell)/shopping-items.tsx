import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppModal } from '@/components/ui/AppModal';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  addShoppingCategory,
  backfillShoppingCatalogFromLists,
  buildShoppingCatalogCsv,
  deleteShoppingCategory,
  deleteShoppingCatalogItem,
  type ShoppingCatalogItem,
  type ShoppingCategory,
  importShoppingCatalogCsv,
  shoppingCatalogCsvHeader,
  updateShoppingCatalogItem,
  upsertShoppingCatalogItem,
  watchShoppingCatalog,
  watchShoppingCategories,
  watchPriceHistory,
  type PriceHistoryEntry,
} from '@/lib/repo/shopping';
import { exportTextFile } from '@/lib/export';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { fmtMoney } from '@/lib/format';
import { planGroupLabel } from '@/lib/groups';
import { parseTagsInput, tagsToInput } from '@/lib/tags';

type CatalogDraft = {
  name: string;
  category: string;
  tagsInput: string;
  assignedPlanItemId: string;
};

type CatalogEdit = {
  name: string;
  category: string;
  tagsInput: string;
  assignedPlanItemId: string;
  dirty: boolean;
  saving: boolean;
};

const BULK_KEEP = '__KEEP__';
const BULK_NONE = '__NONE__';
type BulkScope = 'SELECTED' | 'CATEGORY' | 'BUDGET';

function normalize(input: string) {
  return input.trim().toLowerCase();
}

export default function ShoppingItemsScreen() {
  const uid = useWorkspaceUid();
  const { width } = useWindowDimensions();
  const isCompact = width < 768;

  const [rows, setRows] = useState<ShoppingCatalogItem[]>([]);
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [periods, setPeriods] = useState<(PeriodDoc & { id: string })[]>([]);
  const [selectedPid, setSelectedPid] = useState(periodIdFromDate());
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);

  const [draft, setDraft] = useState<CatalogDraft>({ name: '', category: '', tagsInput: '', assignedPlanItemId: '' });
  const [categoryDraft, setCategoryDraft] = useState('');
  const [csvText, setCsvText] = useState(`${shoppingCatalogCsvHeader}\n`);

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'NAME' | 'CATEGORY'>('NAME');

  const [edits, setEdits] = useState<Record<string, CatalogEdit>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [screenError, setScreenError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkScope, setBulkScope] = useState<BulkScope>('SELECTED');
  const [bulkSourceValue, setBulkSourceValue] = useState('');
  const [bulkCategoryValue, setBulkCategoryValue] = useState(BULK_KEEP);
  const [bulkPlanItemId, setBulkPlanItemId] = useState(BULK_KEEP);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const [selectedItem, setSelectedItem] = useState<ShoppingCatalogItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);

  useEffect(() => {
    if (!uid) return;
    const unCatalog = watchShoppingCatalog(uid, setRows);
    const unCategories = watchShoppingCategories(uid, setCategories);
    return () => {
      unCatalog();
      unCategories();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || !selectedItem?.id) {
      setPriceHistory([]);
      return;
    }
    return watchPriceHistory(uid, selectedItem.id, setPriceHistory);
  }, [uid, selectedItem]);

  useEffect(() => {
    if (!uid) return;
    return watchPeriods(uid, (next) => {
      setPeriods(next);
      if (!next.some((row) => row.id === selectedPid) && next[0]?.id) {
        setSelectedPid(next[0].id);
      }
    });
  }, [uid, selectedPid]);

  useEffect(() => {
    if (!uid || !selectedPid) return;
    return watchPlanTotals(uid, selectedPid, (_totals, nextItems) => setPlanItems(nextItems));
  }, [uid, selectedPid]);

  useEffect(() => {
    setEdits((prev) => {
      const next: Record<string, CatalogEdit> = {};
      rows.forEach((row) => {
        if (!row.id) return;
        const existing = prev[row.id];
        if (existing?.dirty || existing?.saving) {
          next[row.id] = existing;
          return;
        }
        next[row.id] = {
          name: row.name || '',
          category: row.category || '',
          tagsInput: tagsToInput(row.tags),
          assignedPlanItemId: String(row.assignedPlanItemId || ''),
          dirty: false,
          saving: false,
        };
      });
      return next;
    });
  }, [rows]);

  const categoryNames = useMemo(() => {
    const fromRows = rows.map((row) => String(row.category || '').trim()).filter(Boolean);
    const fromCategories = categories.map((row) => String(row.name || '').trim()).filter(Boolean);
    return [...new Set([...fromCategories, ...fromRows])].sort((a, b) => a.localeCompare(b));
  }, [rows, categories]);

  const planOptions = useMemo(() => {
    const rowsWithId = planItems.filter((row): row is PlanItem & { id: string } => Boolean(row.id));
    return rowsWithId.map((row) => ({
      value: row.id,
      label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${planGroupLabel(row.group)}`,
      group: row.group,
      name: row.name,
    }));
  }, [planItems]);

  const displayRows = useMemo(() => {
    const q = normalize(search);
    let out = [...rows];
    if (q) {
      out = out.filter((row) => {
        const name = normalize(row.name || '');
        const category = normalize(row.category || '');
        const planName = normalize(row.assignedPlanItemName || '');
        return name.includes(q) || category.includes(q) || planName.includes(q);
      });
    }
    // Category filter removed
    if (sortMode === 'CATEGORY') {
      out.sort((a, b) => {
        const ca = String(a.category || '');
        const cb = String(b.category || '');
        if (ca !== cb) return ca.localeCompare(cb);
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      return out;
    }
    out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return out;
  }, [rows, search, sortMode]);

  const bulkSourceOptions = useMemo(() => {
    if (bulkScope === 'SELECTED') return [];
    if (bulkScope === 'CATEGORY') {
      return [
        { label: 'Select category', value: '' },
        { label: 'No category', value: BULK_NONE },
        ...categoryNames.map((name) => ({ label: name, value: name })),
      ];
    }
    return [
      { label: 'Select budget item', value: '' },
      { label: 'Unassigned', value: BULK_NONE },
      ...planOptions.map((option) => ({ label: option.label, value: option.value })),
    ];
  }, [bulkScope, categoryNames, planOptions]);

  const bulkTargetCategoryOptions = useMemo(
    () => [
      { label: 'No category change', value: BULK_KEEP },
      { label: 'Clear category', value: '' },
      ...categoryNames.map((name) => ({ label: name, value: name })),
    ],
    [categoryNames]
  );

  const bulkTargetPlanOptions = useMemo(
    () => [
      { label: 'No budget change', value: BULK_KEEP },
      { label: 'Unassigned', value: '' },
      ...planOptions.map((option) => ({ label: option.label, value: option.value })),
    ],
    [planOptions]
  );

  const bulkMatchedRows = useMemo(() => {
    if (bulkScope === 'SELECTED') {
      return rows.filter((row) => row.id && selectedIds[row.id]);
    }
    if (!bulkSourceValue) return [];
    return rows.filter((row) => {
      if (bulkScope === 'CATEGORY') {
        const category = String(row.category || '').trim();
        return bulkSourceValue === BULK_NONE ? !category : normalize(category) === normalize(bulkSourceValue);
      }
      const planId = String(row.assignedPlanItemId || '').trim();
      return bulkSourceValue === BULK_NONE ? !planId : planId === bulkSourceValue;
    });
  }, [bulkScope, bulkSourceValue, rows, selectedIds]);

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);
  const visibleSelectableRows = useMemo(() => displayRows.filter((row) => Boolean(row.id)), [displayRows]);
  const allVisibleSelected = visibleSelectableRows.length > 0 && visibleSelectableRows.every((row) => selectedIds[row.id!]);

  function toggleSelected(id?: string) {
    if (!id) return;
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function setVisibleSelection(selected: boolean) {
    setSelectedIds((prev) => {
      const next = { ...prev };
      visibleSelectableRows.forEach((row) => {
        if (!row.id) return;
        if (selected) next[row.id] = true;
        else delete next[row.id];
      });
      return next;
    });
  }

  function setEditField(id: string, patch: Partial<CatalogEdit>) {
    const source = rows.find((row) => row.id === id);
    if (!source) return;
    setEdits((prev) => {
      const existing =
        prev[id] ||
        ({
          name: source.name || '',
          category: source.category || '',
          tagsInput: tagsToInput(source.tags),
          assignedPlanItemId: String(source.assignedPlanItemId || ''),
          dirty: false,
          saving: false,
        } as CatalogEdit);
      const next = { ...existing, ...patch };
      next.dirty =
        normalize(next.name) !== normalize(source.name || '') ||
        next.category.trim() !== String(source.category || '').trim() ||
        tagsToInput(parseTagsInput(next.tagsInput)) !== tagsToInput(source.tags) ||
        next.assignedPlanItemId !== String(source.assignedPlanItemId || '');
      return { ...prev, [id]: next };
    });
  }

  function resetEditFromSource(id: string) {
    const source = rows.find((row) => row.id === id);
    if (!source) return;
    setEdits((prev) => ({
      ...prev,
      [id]: {
        name: source.name || '',
        category: source.category || '',
        tagsInput: tagsToInput(source.tags),
        assignedPlanItemId: String(source.assignedPlanItemId || ''),
        dirty: false,
        saving: false,
      },
    }));
  }

  function beginEdit(id: string) {
    if (editingId && editingId !== id) {
      const current = edits[editingId];
      if (current?.dirty) {
        setScreenError('Save or cancel the current edited row first.');
        return false;
      }
    }
    setEditingId(id);
    setScreenError('');
    return true;
  }

  function cancelEdit(id: string) {
    resetEditFromSource(id);
    setEditingId((prev) => (prev === id ? null : prev));
    setScreenError('');
  }

  async function addCategory() {
    if (!uid) return;
    const name = categoryDraft.trim();
    if (!name) {
      setScreenError('Category name is required.');
      return;
    }
    await addShoppingCategory(uid, name);
    setCategoryDraft('');
    setScreenError('');
  }

  async function removeCategory(name: string) {
    if (!uid) return;
    const match = categories.find((row) => normalize(String(row.name || '')) === normalize(name));
    if (!match?.id) return;
    await deleteShoppingCategory(uid, match.id);
  }

  async function addCatalogItem() {
    if (!uid) return;
    const name = draft.name.trim();
    if (!name) {
      setScreenError('Item name is required.');
      return;
    }
    const category = draft.category.trim();
    const tags = parseTagsInput(draft.tagsInput);
    const assignedPlan = planOptions.find((row) => row.value === draft.assignedPlanItemId);

    await upsertShoppingCatalogItem(uid, {
      name,
      category,
      tags,
      assignedPlanItemId: assignedPlan?.value || '',
      assignedPlanItemName: assignedPlan?.name || '',
      assignedGroup: assignedPlan?.group,
    });
    if (category) await addShoppingCategory(uid, category);
    setDraft({ name: '', category, tagsInput: '', assignedPlanItemId: draft.assignedPlanItemId });
    setScreenError('');
  }

  async function saveCatalogItem(row: ShoppingCatalogItem) {
    if (!uid || !row.id) return;
    const edit = edits[row.id];
    if (!edit) return;
    const name = edit.name.trim();
    const category = edit.category.trim();
    const tags = parseTagsInput(edit.tagsInput);
    const assignedPlan = planOptions.find((option) => option.value === edit.assignedPlanItemId);
    if (!name) {
      setScreenError('Item name is required.');
      return;
    }

    setEdits((prev) => ({ ...prev, [row.id!]: { ...edit, saving: true } }));
    try {
      const newId = await upsertShoppingCatalogItem(uid, {
        name,
        category,
        tags,
        assignedPlanItemId: assignedPlan?.value || '',
        assignedPlanItemName: assignedPlan?.name || '',
        assignedGroup: assignedPlan?.group,
      });
      if (category) await addShoppingCategory(uid, category);
      if (row.id !== newId) await deleteShoppingCatalogItem(uid, row.id);
      setEdits((prev) => ({
        ...prev,
        [newId]: {
          name,
          category,
          tagsInput: tagsToInput(tags),
          assignedPlanItemId: assignedPlan?.value || '',
          dirty: false,
          saving: false,
        },
      }));
      setEditingId((prev) => (prev === row.id ? null : prev));
      setScreenError('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setScreenError(message || 'Could not save item.');
      setEdits((prev) => ({ ...prev, [row.id!]: { ...edit, saving: false } }));
    }
  }

  async function removeCatalogItem(row: ShoppingCatalogItem) {
    if (!uid || !row.id) return;
    await deleteShoppingCatalogItem(uid, row.id);
    setEditingId((prev) => (prev === row.id ? null : prev));
  }

  async function syncFromExistingLists() {
    if (!uid) return;
    setSyncing(true);
    try {
      const count = await backfillShoppingCatalogFromLists(uid);
      Alert.alert('Sync completed', `${count} shopping list items were synced into the items library.`);
    } finally {
      setSyncing(false);
    }
  }

  async function importCsv() {
    if (!uid) return;
    setImporting(true);
    try {
      const count = await importShoppingCatalogCsv(uid, csvText);
      setCsvText(`${shoppingCatalogCsvHeader}\n`);
      Alert.alert('Import complete', `${count} catalog items imported.`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setScreenError(message || 'CSV import failed.');
    } finally {
      setImporting(false);
    }
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportTextFile(buildShoppingCatalogCsv(displayRows), `shopping_items_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setScreenError(message || 'CSV export failed.');
    } finally {
      setExporting(false);
    }
  }

  async function applyBulkUpdate() {
    if (!uid || bulkUpdating) return;
    if (bulkScope !== 'SELECTED' && !bulkSourceValue) {
      setScreenError('Select the category or budget item to update.');
      return;
    }
    if (bulkCategoryValue === BULK_KEEP && bulkPlanItemId === BULK_KEEP) {
      setScreenError('Choose a new category or budget item for the bulk update.');
      return;
    }
    if (!bulkMatchedRows.length) {
      setScreenError('No shopping items match this bulk update filter.');
      return;
    }

    const assignedPlan = planOptions.find((option) => option.value === bulkPlanItemId);
    const nextCategory = bulkCategoryValue === BULK_KEEP ? undefined : bulkCategoryValue.trim();
    setBulkUpdating(true);
    try {
      for (const row of bulkMatchedRows) {
        if (!row.id) continue;
        await updateShoppingCatalogItem(uid, row.id, {
          ...(nextCategory !== undefined ? { category: nextCategory } : {}),
          ...(bulkPlanItemId !== BULK_KEEP
            ? {
                assignedPlanItemId: assignedPlan?.value || '',
                assignedPlanItemName: assignedPlan?.name || '',
                assignedGroup: assignedPlan?.group,
              }
            : {}),
        });
      }
      if (nextCategory) await addShoppingCategory(uid, nextCategory);
      setScreenError('');
      Alert.alert('Bulk update complete', `${bulkMatchedRows.length} shopping item${bulkMatchedRows.length === 1 ? '' : 's'} updated.`);
      if (bulkScope === 'SELECTED') setSelectedIds({});
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setScreenError(message || 'Bulk update failed.');
    } finally {
      setBulkUpdating(false);
    }
  }

  const periodOptions = periods.map((row) => ({
    label: row.title || row.id,
    value: row.id,
  }));

  function openItemDetail(row: ShoppingCatalogItem) {
    if (!row.id) return;
    const canEdit = beginEdit(row.id);
    if (!canEdit) return;
    setSelectedItem(row);
  }

  function closeItemDetail() {
    if (selectedItem?.id) cancelEdit(selectedItem.id);
    setSelectedItem(null);
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
      <View className="gap-1">
        <Text className="text-3xl font-bold text-foreground dark:text-zinc-50">Shopping Items</Text>
        <Text className="text-sm text-muted-foreground">Reusable shopping items library with category management and CSV import.</Text>
      </View>

      <AppCard className="gap-2">
        <Text className="text-xs uppercase tracking-wide text-muted-foreground">Budget Mapping Period</Text>
        <View className="w-full md:w-80">
          <DropdownField
            value={selectedPid}
            options={periodOptions}
            onChange={setSelectedPid}
            placeholder="Select period"
            menuStrategy="inline"
          />
        </View>
        <Text className="text-xs text-muted-foreground">
          Assign each shopping item to a budget item so imported list items and transactions stay linked.
        </Text>
      </AppCard>

      <View className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Items</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{rows.length}</Text>
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Categories</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">{categoryNames.length}</Text>
        </AppCard>
        <AppCard className="gap-2">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Sync Source</Text>
          <Text className="text-xs text-muted-foreground">Existing shopping lists</Text>
          <AppButton size="sm" variant="outline" label={syncing ? 'Syncing...' : 'Sync from Lists'} onPress={syncFromExistingLists} disabled={syncing} />
        </AppCard>
        <AppCard className="gap-2">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">CSV Import</Text>
          <Text className="text-xs text-muted-foreground">name,category,tags,budgetItemName</Text>
          <AppButton size="sm" variant="outline" label={exporting ? 'Exporting...' : 'Export CSV'} onPress={exportCsv} disabled={exporting || displayRows.length === 0} />
        </AppCard>
        <AppCard>
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Mapped to Budget</Text>
          <Text className="mt-1 text-xl font-semibold text-foreground dark:text-zinc-50">
            {rows.filter((row) => String(row.assignedPlanItemId || '').trim().length > 0).length}
          </Text>
        </AppCard>
      </View>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Manage Categories</Text>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <AppInput value={categoryDraft} onChangeText={setCategoryDraft} placeholder="e.g. Vegetables" className="h-9" />
          </View>
          <IconActionButton icon="plus" label="Add category" onPress={addCategory} />
        </View>
        <View className="flex-row flex-wrap gap-2">
          {categoryNames.map((name) => (
            <View key={name} className="flex-row items-center gap-1 rounded-full border border-border bg-muted/20 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-800/30">
              <Text className="text-xs text-foreground dark:text-zinc-50">{name}</Text>
              <IconActionButton
                icon="close"
                iconSize={14}
                label={`Delete category ${name}`}
                variant="danger"
                className="h-5 w-5 rounded-full"
                onPress={() => removeCategory(name)}
              />
            </View>
          ))}
          {!categoryNames.length ? <Text className="text-xs text-muted-foreground">No categories yet.</Text> : null}
        </View>
      </AppCard>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Add Shopping Item</Text>
        <View className="flex-row flex-wrap items-end gap-2">
          <View className="min-w-[220px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Name</Text>
            <AppInput value={draft.name} onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))} placeholder="e.g. Rice" className="h-9" />
          </View>
          <View className="min-w-[200px] gap-1">
            <Text className="text-xs text-muted-foreground">Category</Text>
            <DropdownField
              value={draft.category}
              options={[{ label: 'No category', value: '' }, ...categoryNames.map((name) => ({ label: name, value: name }))]}
              onChange={(value) => setDraft((prev) => ({ ...prev, category: value }))}
              menuStrategy="inline"
            />
          </View>
          <View className="min-w-[220px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Tags</Text>
            <AppInput
              value={draft.tagsInput}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, tagsInput: value }))}
              placeholder="utilities, vegetables"
              className="h-9"
            />
          </View>
          <View className="min-w-[280px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Budget Item</Text>
            <DropdownField
              value={draft.assignedPlanItemId}
              options={[{ label: 'Unassigned', value: '' }, ...planOptions.map((row) => ({ label: row.label, value: row.value }))]}
              onChange={(value) => setDraft((prev) => ({ ...prev, assignedPlanItemId: value }))}
              placeholder="Link to budget item"
              menuStrategy="inline"
            />
          </View>
          <IconActionButton icon="plus" label="Add shopping catalog item" onPress={addCatalogItem} />
        </View>
      </AppCard>

      <AppCard className="gap-3">
        <View className="flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <View>
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Bulk Update Shopping Items</Text>
            <Text className="text-xs text-muted-foreground">
              Update selected items or all items that currently share the same category or budget item.
            </Text>
          </View>
          <Text className="text-xs font-semibold text-muted-foreground">
            Matches: {bulkMatchedRows.length}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-end gap-2">
          <View className="min-w-[180px] gap-1">
            <Text className="text-xs text-muted-foreground">Find by</Text>
            <AppSegmented
              value={bulkScope}
              compact
              onChange={(value) => {
                setBulkScope(value as BulkScope);
                setBulkSourceValue('');
              }}
              options={[
                { label: 'Selected', value: 'SELECTED' },
                { label: 'Category', value: 'CATEGORY' },
                { label: 'Budget Item', value: 'BUDGET' },
              ]}
            />
          </View>
          {bulkScope === 'SELECTED' ? (
            <View className="min-w-[240px] flex-1 gap-1">
              <Text className="text-xs text-muted-foreground">Selected Items</Text>
              <View className="flex-row flex-wrap items-center gap-2">
                <AppBadge label={`${selectedCount} selected`} variant={selectedCount ? 'default' : 'outline'} />
                <AppButton
                  label={allVisibleSelected ? 'Clear Visible' : 'Select Visible'}
                  size="sm"
                  variant="outline"
                  onPress={() => setVisibleSelection(!allVisibleSelected)}
                  disabled={visibleSelectableRows.length === 0}
                />
                <AppButton
                  label="Clear All"
                  size="sm"
                  variant="ghost"
                  onPress={() => setSelectedIds({})}
                  disabled={selectedCount === 0}
                />
              </View>
            </View>
          ) : (
            <View className="min-w-[240px] flex-1 gap-1">
              <Text className="text-xs text-muted-foreground">
                Current {bulkScope === 'CATEGORY' ? 'Category' : 'Budget Item'}
              </Text>
              <DropdownField
                value={bulkSourceValue}
                options={bulkSourceOptions}
                onChange={setBulkSourceValue}
                menuStrategy="inline"
              />
            </View>
          )}
          <View className="min-w-[220px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Set Category</Text>
            <DropdownField
              value={bulkCategoryValue}
              options={bulkTargetCategoryOptions}
              onChange={setBulkCategoryValue}
              menuStrategy="inline"
            />
          </View>
          <View className="min-w-[280px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Set Budget Item</Text>
            <DropdownField
              value={bulkPlanItemId}
              options={bulkTargetPlanOptions}
              onChange={setBulkPlanItemId}
              menuStrategy="inline"
            />
          </View>
          <AppButton
            label={bulkUpdating ? 'Updating...' : `Update ${bulkMatchedRows.length}`}
            onPress={applyBulkUpdate}
            disabled={bulkUpdating || bulkMatchedRows.length === 0 || (bulkCategoryValue === BULK_KEEP && bulkPlanItemId === BULK_KEEP)}
            textClassName="text-white"
          />
        </View>
      </AppCard>

      <AppCard className="gap-3">
        <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <View className="w-full md:w-72">
            <AppInput value={search} onChangeText={setSearch} placeholder="Search by name, category or budget..." className="h-9" />
          </View>
          <AppSegmented
            value={sortMode}
            compact
            onChange={(value) => setSortMode(value as 'NAME' | 'CATEGORY')}
            options={[
              { label: 'Name', value: 'NAME' },
              { label: 'Category', value: 'CATEGORY' },
            ]}
          />
        </View>

        {!isCompact ? (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View className="min-w-[1220px] flex-1">
              <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
                <Text className="w-[48px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pick</Text>
                <Text className="w-[220px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</Text>
                <Text className="w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</Text>
                <Text className="w-[420px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Budget Item</Text>
                <Text className="w-[160px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</Text>
              </View>

              {displayRows.map((row) => {
                const edit = row.id ? edits[row.id] : null;
                if (!row.id || !edit) return null;
                const isEditing = editingId === row.id;
                return (
                  <Pressable
                    key={row.id}
                    onPress={() => !isEditing && setSelectedItem(row)}
                    className={`flex-row items-center border-b py-2 dark:border-zinc-800 ${
                      edit.dirty
                        ? 'border-primary/40 bg-primary/5 dark:bg-zinc-800/70'
                        : 'border-border hover:bg-muted/35 dark:hover:bg-zinc-800/55'
                    }`}
                  >
                    <View className="w-[48px] pr-2">
                      <Pressable
                        onPress={() => toggleSelected(row.id)}
                        className="h-9 w-9 items-center justify-center rounded-md border border-border bg-background dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <MaterialCommunityIcons
                          name={selectedIds[row.id] ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={20}
                          color={selectedIds[row.id] ? '#22C55E' : '#717182'}
                        />
                      </Pressable>
                    </View>
                    <View className="w-[220px] pr-2">
                      {isEditing ? (
                        <AppInput value={edit.name} onChangeText={(value) => setEditField(row.id!, { name: value })} className="h-9" />
                      ) : (
                        <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                      )}
                    </View>
                    <View className="w-[180px] pr-2">
                      {isEditing ? (
                        <DropdownField
                          value={edit.category}
                          options={[{ label: 'No category', value: '' }, ...categoryNames.map((name) => ({ label: name, value: name }))]}
                          onChange={(value) => setEditField(row.id!, { category: value })}
                          menuStrategy="inline"
                        />
                      ) : (
                        <Text className="text-xs text-muted-foreground">{row.category || 'No category'}</Text>
                      )}
                    </View>
                    <View className="w-[420px] pr-2">
                      {isEditing ? (
                        <DropdownField
                          value={edit.assignedPlanItemId}
                          options={[{ label: 'Unassigned', value: '' }, ...planOptions.map((option) => ({ label: option.label, value: option.value }))]}
                          onChange={(value) => setEditField(row.id!, { assignedPlanItemId: value })}
                          placeholder="Link to budget item"
                          menuStrategy="inline"
                        />
                      ) : (
                        <Text className="text-xs text-muted-foreground">
                          {row.assignedPlanItemName || 'Unassigned'}
                        </Text>
                      )}
                    </View>
                    <View className="w-[160px] flex-row items-center justify-center gap-2">
                      {isEditing ? (
                        <>
                          {edit.dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
                          <IconActionButton icon="content-save-outline" label="Save shopping item" onPress={() => saveCatalogItem(row)} disabled={!edit.dirty || edit.saving} />
                          <IconActionButton icon="close" label="Cancel edit" variant="muted" onPress={() => cancelEdit(row.id!)} />
                        </>
                      ) : (
                        <>
                          <IconActionButton icon="pencil-outline" label="Edit shopping item" onPress={() => beginEdit(row.id!)} />
                          <IconActionButton icon="trash-can-outline" label="Delete shopping item" variant="danger" onPress={() => removeCatalogItem(row)} />
                        </>
                      )}
                    </View>
                  </Pressable>
                );
              })}

              {!displayRows.length ? (
                <View className="py-4">
                  <Text className="text-sm text-muted-foreground">No shopping items found for this filter.</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        ) : (
          <View className="overflow-hidden rounded-lg border border-border dark:border-zinc-800">
            <View className="flex-row border-b border-border bg-muted/30 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
              <Text className="w-[44px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pick</Text>
              <Text className="w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</Text>
              <Text className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</Text>
            </View>
            {displayRows.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => openItemDetail(row)}
                className="flex-row items-center border-b border-border px-3 py-2 last:border-b-0 dark:border-zinc-800"
              >
                <Pressable
                  onPress={() => toggleSelected(row.id)}
                  className="mr-2 h-8 w-8 items-center justify-center rounded-md border border-border bg-background dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <MaterialCommunityIcons
                    name={row.id && selectedIds[row.id] ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20}
                    color={row.id && selectedIds[row.id] ? '#22C55E' : '#717182'}
                  />
                </Pressable>
                <Text className="w-[180px] text-sm font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>
                  {row.name}
                </Text>
                <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
                  {row.category || 'No category'}
                </Text>
              </Pressable>
            ))}
            {!displayRows.length ? (
              <View className="py-4">
                <Text className="text-center text-sm text-muted-foreground">No shopping items found for this filter.</Text>
              </View>
            ) : null}
          </View>
        )}
      </AppCard>

      <AppCard className="gap-3">
        <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Import CSV</Text>
        <Text className="text-xs text-muted-foreground">CSV format: {shoppingCatalogCsvHeader}</Text>
        <Text className="text-xs text-muted-foreground">Example: Rice,Groceries,vegetables|staples,Groceries</Text>
        <Text className="text-xs text-muted-foreground">Quantity and price are intentionally excluded from this import.</Text>
        <AppInput
          value={csvText}
          onChangeText={setCsvText}
          multiline
          numberOfLines={7}
          className="h-36 items-start py-2"
          autoCapitalize="none"
        />
        <View className="flex-row justify-end">
          <AppButton onPress={importCsv} variant="outline" label={importing ? 'Importing...' : 'Import CSV'} disabled={importing} />
        </View>
      </AppCard>

      {screenError ? (
        <AppCard>
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#D4183D" />
            <Text className="text-sm text-destructive">{screenError}</Text>
          </View>
        </AppCard>
      ) : null}

      <AppModal
        open={Boolean(selectedItem)}
        onClose={closeItemDetail}
        title={selectedItem?.name || 'Item Details'}
      >
        <View className="gap-4">
          {selectedItem?.id && edits[selectedItem.id] ? (
            <View className="gap-3">
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Name</Text>
                <AppInput
                  value={edits[selectedItem.id].name}
                  onChangeText={(value) => setEditField(selectedItem.id!, { name: value })}
                />
              </View>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Category</Text>
                <DropdownField
                  value={edits[selectedItem.id].category}
                  options={[{ label: 'No category', value: '' }, ...categoryNames.map((name) => ({ label: name, value: name }))]}
                  onChange={(value) => setEditField(selectedItem.id!, { category: value })}
                  menuStrategy="inline"
                />
              </View>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Budget Item</Text>
                <DropdownField
                  value={edits[selectedItem.id].assignedPlanItemId}
                  options={[{ label: 'Unassigned', value: '' }, ...planOptions.map((option) => ({ label: option.label, value: option.value }))]}
                  onChange={(value) => setEditField(selectedItem.id!, { assignedPlanItemId: value })}
                  placeholder="Link to budget item"
                  menuStrategy="inline"
                />
              </View>
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Tags</Text>
                <AppInput
                  value={edits[selectedItem.id].tagsInput}
                  onChangeText={(value) => setEditField(selectedItem.id!, { tagsInput: value })}
                  placeholder="utilities, groceries"
                />
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <AppBadge label={`Last Price ${fmtMoney(selectedItem?.lastPrice || 0)}`} variant="outline" />
                {edits[selectedItem.id].dirty ? <AppBadge label="Unsaved" variant="warning" /> : null}
              </View>
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-4">
              <View>
                <Text className="text-xs text-muted-foreground">Category</Text>
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{selectedItem?.category || 'None'}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted-foreground">Budget Item</Text>
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{selectedItem?.assignedPlanItemName || 'Unassigned'}</Text>
              </View>
              <View>
                <Text className="text-xs text-muted-foreground">Last Price</Text>
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{fmtMoney(selectedItem?.lastPrice || 0)}</Text>
              </View>
            </View>
          )}

          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Price History</Text>
            <ScrollView className="max-h-60 rounded-md border border-border bg-muted/20 dark:border-zinc-800 dark:bg-zinc-800/30">
              {priceHistory.length ? (
                priceHistory.map((entry) => (
                  <View key={entry.id} className="flex-row justify-between border-b border-border px-3 py-2 last:border-b-0 dark:border-zinc-800">
                    <Text className="text-sm text-foreground dark:text-zinc-50">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </Text>
                    <Text className="text-sm font-medium text-foreground dark:text-zinc-50">
                      {fmtMoney(entry.price)} {entry.quantity > 1 ? `(x${entry.quantity})` : ''}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="p-4 text-sm text-muted-foreground">No purchase history found.</Text>
              )}
            </ScrollView>
          </View>

          <View className="flex-row justify-end gap-2">
            {selectedItem ? (
              <IconActionButton
                icon="trash-can-outline"
                label="Delete shopping item"
                variant="danger"
                onPress={async () => {
                  await removeCatalogItem(selectedItem);
                  setSelectedItem(null);
                }}
              />
            ) : null}
            <AppButton variant="outline" label="Close" onPress={closeItemDetail} />
            {selectedItem?.id && edits[selectedItem.id] ? (
              <AppButton
                label={edits[selectedItem.id].saving ? 'Saving...' : 'Save'}
                onPress={() => saveCatalogItem(selectedItem)}
                disabled={!edits[selectedItem.id].dirty || edits[selectedItem.id].saving}
              />
            ) : null}
          </View>
        </View>
      </AppModal>
    </ScrollView>
  );
}
