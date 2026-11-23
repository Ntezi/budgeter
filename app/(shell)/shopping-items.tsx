import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { useSheetEffects } from '@/components/shopping/useSheetEffects';
import { cn } from '@/lib/cn';
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
import { db } from '@/lib/firebase';
import { fromMinor } from '@/lib/money';
import { displayUnitPriceMinor, lastComparable, priceChipText, type PriceObservation } from '@/lib/rules/priceCompare';
import { deleteReceiptIn, listPriceObservationsIn } from '@/lib/repo/receiptsOps';
import { APP_CURRENCY } from '@/components/shopping/ReceiptModal';
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
  const router = useRouter();

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
  const [receiptPrices, setReceiptPrices] = useState<PriceObservation[]>([]);
  const [receiptPricesTick, setReceiptPricesTick] = useState(0);
  // BUDG-8 S12 view state only.
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [csvPreview, setCsvPreview] = useState<string[] | null>(null);
  const [allObservations, setAllObservations] = useState<PriceObservation[]>([]);
  useSheetEffects(manageOpen, () => setManageOpen(false));
  useSheetEffects(addOpen, () => setAddOpen(false));
  useSheetEffects(Boolean(selectedItem), () => closeItemDetail());

  // Row chips: the same read the receipt sheet makes (all observations of this household).
  useEffect(() => {
    if (!uid) return;
    let live = true;
    listPriceObservationsIn(db, uid)
      .then((all) => live && setAllObservations(all))
      .catch(() => live && setAllObservations([]));
    return () => {
      live = false;
    };
  }, [uid, receiptPricesTick]);

  // BUDG-5: comparable unit prices from confirmed receipts (newest first).
  useEffect(() => {
    if (!uid || !selectedItem?.id) {
      setReceiptPrices([]);
      return;
    }
    let live = true;
    listPriceObservationsIn(db, uid, selectedItem.id)
      .then((rows) => live && setReceiptPrices(rows.sort((a, b) => (b.observedOn + b.id).localeCompare(a.observedOn + a.id))))
      .catch(() => live && setReceiptPrices([]));
    return () => {
      live = false;
    };
  }, [uid, selectedItem?.id, receiptPricesTick]);

  useEffect(() => {
    if (!uid) return;
    const unCatalog = watchShoppingCatalog(uid, (next) => {
      setRows(next);
      setLoaded(true);
    });
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

  // ---- BUDG-8 S12 layout: search + category chips, rows with the last-price chip, Manage sheet ----
  const shownRows = categoryFilter === 'ALL' ? displayRows : displayRows.filter((row) => normalize(row.category || '') === normalize(categoryFilter));
  const mappedCount = rows.filter((row) => String(row.assignedPlanItemId || '').trim().length > 0).length;
  const categoryChoice = [{ label: 'No category', value: '' }, ...categoryNames.map((name) => ({ label: name, value: name }))];
  const lineChoice = [{ label: 'No line', value: '' }, ...planOptions.map((option) => ({ label: option.label, value: option.value }))];
  const fmtObs = (o: PriceObservation) => (m: number) => fmtMoney(fromMinor(m), o.currencyCode);

  function chipFor(row: ShoppingCatalogItem): { text: string; muted: boolean } {
    const mine = allObservations.filter((o) => o.catalogItemId === row.id).sort((a, b) => (b.observedOn + b.id).localeCompare(a.observedOn + a.id));
    if (mine.length) {
      const last = mine[0];
      const cmp = priceChipText(last, lastComparable(last, mine), fmtObs(last));
      if (cmp.startsWith('Last')) return { text: cmp, muted: false };
      const unit = displayUnitPriceMinor(last);
      const base = unit ? `Last ${fmtObs(last)(unit.minor)} / ${unit.unitLabel} · ${last.observedOn}` : `Last receipt ${last.observedOn}`;
      return { text: `${base} · ${cmp}`, muted: false };
    }
    if ((row.lastPrice || 0) > 0) return { text: `List estimate ${fmtMoney(row.lastPrice || 0)} · not compared`, muted: true };
    return { text: 'No comparable price', muted: true };
  }

  function previewCsv() {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const body = lines[0] && normalize(lines[0]) === normalize(shoppingCatalogCsvHeader) ? lines.slice(1) : lines;
    setCsvPreview(body.map((l) => l.split(',')[0]?.trim() || '').filter(Boolean));
  }

  const detail = selectedItem?.id ? edits[selectedItem.id] : undefined;

  return (
    <View className="min-h-0 flex-1 bg-background dark:bg-zinc-950">
      <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-8" keyboardShouldPersistTaps="handled">
        <PageHeader title="Catalog" subtitle={`${rows.length} item${rows.length === 1 ? '' : 's'} you buy · ${mappedCount} linked to a budget line`} />
        <View className="flex-row flex-wrap gap-2">
          <AppButton label="+ Add item" size="touch" onPress={() => setAddOpen(true)} />
          <AppButton label="Manage" variant="outline" size="touch" testID="catalog-manage" onPress={() => setManageOpen(true)} />
        </View>
        {screenError ? <ErrorState message={screenError} onRetry={() => setScreenError('')} /> : null}

        <View className="gap-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppInput value={search} onChangeText={setSearch} placeholder="Search items" accessibilityLabel="Search catalog" className="h-11 min-w-48 flex-1 text-base" />
            <AppSegmented
              value={sortMode}
              touch
              onChange={(value) => setSortMode(value as 'NAME' | 'CATEGORY')}
              options={[
                { label: 'A–Z', value: 'NAME' },
                { label: 'By category', value: 'CATEGORY' },
              ]}
            />
          </View>
          {categoryNames.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {['ALL', ...categoryNames].map((name) => {
                const on = categoryFilter === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    aria-pressed={on}
                    onPress={() => setCategoryFilter(name)}
                    className={cn('h-11 justify-center rounded-full border px-4', on ? 'border-primary bg-primary dark:border-zinc-100 dark:bg-zinc-50' : 'border-border bg-card dark:border-zinc-800 dark:bg-zinc-900')}
                  >
                    <Text className={cn('text-sm font-medium', on ? 'text-white dark:text-zinc-900' : 'text-foreground dark:text-zinc-50')}>{name === 'ALL' ? 'All' : name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        {selectMode ? (
          <View className="flex-row flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-1 dark:border-zinc-800 dark:bg-zinc-900">
            <Text className="min-w-0 flex-1 text-sm text-foreground dark:text-zinc-50">{`${selectedCount} selected`}</Text>
            <AppButton label={allVisibleSelected ? 'Clear visible' : 'Select visible'} variant="ghost" size="touch" onPress={() => setVisibleSelection(!allVisibleSelected)} />
            <AppButton label="Done" variant="outline" size="touch" onPress={() => setManageOpen(true)} />
          </View>
        ) : null}

        {!loaded ? <LoadingState testID="catalog-loading" /> : null}
        {loaded && !rows.length ? (
          <EmptyState icon="tag-outline" message="Items you add to a list are saved here for next time." actionLabel="Add item" onAction={() => setAddOpen(true)} testID="catalog-empty" />
        ) : null}
        {loaded && rows.length && !shownRows.length ? <EmptyState icon="magnify" message="No items match this search." /> : null}
        {shownRows.length ? (
          <View testID="catalog-rows" className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
            {shownRows.map((row, i) => {
              if (!row.id) return null;
              const chip = chipFor(row);
              const picked = Boolean(selectedIds[row.id]);
              return (
                <View key={row.id} className={cn('min-h-14 flex-row items-center', i > 0 && 'border-t border-border dark:border-zinc-800')}>
                  {selectMode ? (
                    <Pressable accessibilityRole="checkbox" aria-checked={picked} accessibilityLabel={`Select ${row.name}`} onPress={() => toggleSelected(row.id)} className="h-11 w-11 items-center justify-center">
                      <MaterialCommunityIcons name={picked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={picked ? '#22C55E' : '#717182'} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => (selectMode ? toggleSelected(row.id) : openItemDetail(row))}
                    className={cn('min-h-14 min-w-0 flex-1 flex-row items-center gap-3 py-2 pr-4 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60', selectMode ? 'pl-1' : 'pl-4')}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-base font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{row.name}</Text>
                      <Text className="text-sm text-muted-foreground dark:text-zinc-400" numberOfLines={1}>
                        {[row.category || 'No category', row.assignedPlanItemName || 'No line'].join(' · ')}
                      </Text>
                      <Text testID="catalog-price-chip" className={cn('text-sm', chip.muted ? 'text-muted-foreground dark:text-zinc-400' : 'font-medium text-foreground dark:text-zinc-50')} numberOfLines={2}>
                        {chip.text}
                      </Text>
                    </View>
                    {!selectMode ? <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" /> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <AppSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add catalog item"
        footer={
          <>
            <AppButton
              label="Add item"
              size="touch-lg"
              className="w-full"
              textClassName="text-base"
              disabled={!draft.name.trim()}
              onPress={() => void addCatalogItem().then(() => setAddOpen(false))}
            />
            <AppButton label="Cancel" variant="ghost" size="touch" onPress={() => setAddOpen(false)} />
          </>
        }
      >
        <View className="gap-4">
          <FormField label="Name">
            <AppInput autoFocus value={draft.name} onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))} placeholder="Rice 5 kg" accessibilityLabel="Catalog item name" className="h-11 text-base" />
          </FormField>
          <FormField label="Category">
            <DropdownField value={draft.category} options={categoryChoice} onChange={(value) => setDraft((prev) => ({ ...prev, category: value }))} menuStrategy="inline" triggerClassName="min-h-11" />
          </FormField>
          <FormField label="Budget line">
            <DropdownField value={draft.assignedPlanItemId} options={lineChoice} onChange={(value) => setDraft((prev) => ({ ...prev, assignedPlanItemId: value }))} placeholder="Choose a line" menuStrategy="inline" triggerClassName="min-h-11" />
          </FormField>
          <FormField label="Tags">
            <AppInput value={draft.tagsInput} onChangeText={(value) => setDraft((prev) => ({ ...prev, tagsInput: value }))} placeholder="staples, pantry" accessibilityLabel="Tags" className="h-11 text-base" />
          </FormField>
        </View>
      </AppSheet>

      <AppSheet
        open={Boolean(selectedItem)}
        onClose={closeItemDetail}
        title={selectedItem?.name || 'Item'}
        testID="catalog-item-sheet"
        footer={
          selectedItem?.id && detail ? (
            <>
              <AppButton
                label={detail.saving ? 'Saving…' : 'Save'}
                size="touch-lg"
                className="w-full"
                textClassName="text-base"
                disabled={!detail.dirty || detail.saving}
                onPress={() => void saveCatalogItem(selectedItem)}
              />
              <View className="flex-row items-center justify-between">
                <AppButton label="Close" variant="ghost" size="touch" onPress={closeItemDetail} />
                <AppButton
                  label="Delete item"
                  variant="ghost"
                  size="touch"
                  textClassName="text-destructive dark:text-red-300"
                  onPress={() => {
                    void removeCatalogItem(selectedItem).then(() => setSelectedItem(null));
                  }}
                />
              </View>
            </>
          ) : null
        }
      >
        {selectedItem?.id && detail ? (
          <View className="gap-6">
            <View className="gap-2" testID="receipt-prices">
              <Text className="text-base font-semibold text-foreground dark:text-zinc-50">Prices from receipts</Text>
              {receiptPrices.length ? (
                <Text className="text-base font-medium text-foreground dark:text-zinc-50">
                  {priceChipText(receiptPrices[0], lastComparable(receiptPrices[0], receiptPrices), fmtObs(receiptPrices[0]))}
                </Text>
              ) : (
                <Text className="text-sm text-muted-foreground dark:text-zinc-400">No receipt prices yet. Add a receipt from a finished list.</Text>
              )}
              {receiptPrices.length ? (
                <View className="overflow-hidden rounded-xl border border-border dark:border-zinc-800">
                  {receiptPrices.map((o, i) => {
                    const unit = displayUnitPriceMinor(o);
                    return (
                      <View key={o.id} className={cn('min-h-14 flex-row items-center gap-2 py-1 pl-3', i > 0 && 'border-t border-border dark:border-zinc-800')}>
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm text-foreground dark:text-zinc-50">
                            {`${o.observedOn}${o.storeName ? ` · ${o.storeName}` : ''} · ${o.quantity} ${o.unit}${o.packSize ? ` (pack ${o.packSize})` : ''}`}
                          </Text>
                          <Text className="text-sm text-muted-foreground dark:text-zinc-400" style={{ fontVariant: ['tabular-nums'] }}>
                            {`${fmtMoney(fromMinor(o.lineTotalMinor), o.currencyCode)}${unit ? ` · ${fmtMoney(fromMinor(unit.minor), o.currencyCode)} / ${unit.unitLabel}` : ' · Missing quantity or price'}${o.isReturn ? ' · Return' : ''}${o.promo ? ' · Promo' : ''}${o.currencyCode !== APP_CURRENCY ? ' · Other currency' : ''}`}
                          </Text>
                        </View>
                        <IconActionButton
                          icon="trash-can-outline"
                          label="Delete receipt"
                          variant="danger"
                          className="h-11 w-11"
                          onPress={() => {
                            void deleteReceiptIn(db, uid || '', o.receiptId).then(() => setReceiptPricesTick((t) => t + 1));
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View className="gap-4">
              <FormField label="Name">
                <AppInput value={detail.name} onChangeText={(value) => setEditField(selectedItem.id!, { name: value })} accessibilityLabel="Catalog item name" className="h-11 text-base" />
              </FormField>
              <FormField label="Category">
                <DropdownField value={detail.category} options={categoryChoice} onChange={(value) => setEditField(selectedItem.id!, { category: value })} menuStrategy="inline" triggerClassName="min-h-11" />
              </FormField>
              <FormField label="Budget line">
                <DropdownField value={detail.assignedPlanItemId} options={lineChoice} onChange={(value) => setEditField(selectedItem.id!, { assignedPlanItemId: value })} placeholder="Choose a line" menuStrategy="inline" triggerClassName="min-h-11" />
              </FormField>
              <FormField label="Tags">
                <AppInput value={detail.tagsInput} onChangeText={(value) => setEditField(selectedItem.id!, { tagsInput: value })} placeholder="staples, pantry" accessibilityLabel="Tags" className="h-11 text-base" />
              </FormField>
              {detail.dirty ? <Text className="text-sm text-amber-700 dark:text-amber-300">Unsaved changes</Text> : null}
            </View>

            <View className="gap-2">
              <Text className="text-base font-semibold text-foreground dark:text-zinc-50">From shopping lists</Text>
              <Text className="text-sm text-muted-foreground dark:text-zinc-400">Estimates from shopping lists (no currency or unit): not compared.</Text>
              {priceHistory.length ? (
                <View className="overflow-hidden rounded-xl border border-border dark:border-zinc-800">
                  {priceHistory.map((entry, i) => (
                    <View key={entry.id} className={cn('flex-row justify-between gap-2 px-3 py-2', i > 0 && 'border-t border-border dark:border-zinc-800')}>
                      <Text className="text-sm text-foreground dark:text-zinc-50">{new Date(entry.createdAt).toLocaleDateString()}</Text>
                      <Text className="shrink-0 text-sm font-medium text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
                        {`${fmtMoney(entry.price)}${entry.quantity > 1 ? ` (x${entry.quantity})` : ''}`}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-muted-foreground dark:text-zinc-400">No purchase history found.</Text>
              )}
            </View>
          </View>
        ) : null}
      </AppSheet>

      <AppSheet open={manageOpen} onClose={() => setManageOpen(false)} title="Manage catalog" testID="catalog-manage-sheet">
        <View className="gap-8">
          <View className="gap-3">
            <Text role="heading" aria-level={3} className="text-base font-semibold text-foreground dark:text-zinc-50">Change many items</Text>
            <AppSegmented
              value={bulkScope}
              touch
              onChange={(value) => {
                setBulkScope(value as BulkScope);
                setBulkSourceValue('');
              }}
              options={[
                { label: 'Picked', value: 'SELECTED' },
                { label: 'Category', value: 'CATEGORY' },
                { label: 'Line', value: 'BUDGET' },
              ]}
            />
            {bulkScope === 'SELECTED' ? (
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="min-w-0 flex-1 text-sm text-foreground dark:text-zinc-50">{`${selectedCount} picked`}</Text>
                <AppButton
                  label={selectMode ? 'Stop picking' : 'Pick items'}
                  variant="outline"
                  size="touch"
                  onPress={() => {
                    const next = !selectMode;
                    setSelectMode(next);
                    if (next) setManageOpen(false);
                  }}
                />
                <AppButton label="Clear" variant="ghost" size="touch" disabled={selectedCount === 0} onPress={() => setSelectedIds({})} />
              </View>
            ) : (
              <FormField label={bulkScope === 'CATEGORY' ? 'Items now in category' : 'Items now on line'}>
                <DropdownField value={bulkSourceValue} options={bulkSourceOptions} onChange={setBulkSourceValue} menuStrategy="inline" triggerClassName="min-h-11" />
              </FormField>
            )}
            <FormField label="Set category">
              <DropdownField value={bulkCategoryValue} options={bulkTargetCategoryOptions} onChange={setBulkCategoryValue} menuStrategy="inline" triggerClassName="min-h-11" />
            </FormField>
            <FormField label="Set budget line">
              <DropdownField value={bulkPlanItemId} options={bulkTargetPlanOptions} onChange={setBulkPlanItemId} menuStrategy="inline" triggerClassName="min-h-11" />
            </FormField>
            <AppButton
              label={bulkUpdating ? 'Updating…' : `Update ${bulkMatchedRows.length} item${bulkMatchedRows.length === 1 ? '' : 's'}`}
              size="touch"
              onPress={applyBulkUpdate}
              disabled={bulkUpdating || bulkMatchedRows.length === 0 || (bulkCategoryValue === BULK_KEEP && bulkPlanItemId === BULK_KEEP)}
            />
          </View>

          <View className="gap-3">
            <Text role="heading" aria-level={3} className="text-base font-semibold text-foreground dark:text-zinc-50">Budget lines from</Text>
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">Lines offered above come from this month&apos;s plan.</Text>
            <DropdownField value={selectedPid} options={periodOptions} onChange={setSelectedPid} placeholder="Choose month" menuStrategy="inline" triggerClassName="min-h-11" />
          </View>

          <View className="gap-3">
            <Text role="heading" aria-level={3} className="text-base font-semibold text-foreground dark:text-zinc-50">Categories</Text>
            <View className="flex-row items-center gap-2">
              <AppInput value={categoryDraft} onChangeText={setCategoryDraft} placeholder="Vegetables" accessibilityLabel="New category" className="h-11 min-w-0 flex-1 text-base" />
              <AppButton label="Add" variant="outline" size="touch" onPress={addCategory} />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {categoryNames.map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete category ${name}`}
                  onPress={() => void removeCategory(name)}
                  className="h-11 flex-row items-center gap-1 rounded-full border border-border bg-card px-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <Text className="text-sm text-foreground dark:text-zinc-50">{name}</Text>
                  <MaterialCommunityIcons name="close" size={16} color="#717182" />
                </Pressable>
              ))}
              {!categoryNames.length ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">No categories yet.</Text> : null}
            </View>
          </View>

          <View className="gap-3">
            <Text role="heading" aria-level={3} className="text-base font-semibold text-foreground dark:text-zinc-50">Import from CSV</Text>
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">{`Columns: ${shoppingCatalogCsvHeader}. Quantity and price are not imported.`}</Text>
            <AppInput
              value={csvText}
              onChangeText={(value) => {
                setCsvText(value);
                setCsvPreview(null);
              }}
              multiline
              numberOfLines={6}
              accessibilityLabel="CSV text"
              className="h-36 items-start py-2 text-base"
              autoCapitalize="none"
            />
            {csvPreview ? (
              <View testID="csv-preview" className="gap-1 rounded-xl border border-border bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{`${csvPreview.length} row${csvPreview.length === 1 ? '' : 's'} will be imported`}</Text>
                <Text className="text-sm text-muted-foreground dark:text-zinc-400" numberOfLines={3}>{csvPreview.slice(0, 8).join(', ')}{csvPreview.length > 8 ? ', …' : ''}</Text>
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              <AppButton label="Preview" variant="outline" size="touch" onPress={previewCsv} />
              <AppButton
                label={importing ? 'Importing…' : `Import ${csvPreview?.length ?? 0} row${csvPreview?.length === 1 ? '' : 's'}`}
                size="touch"
                disabled={importing || !csvPreview?.length}
                onPress={() => void importCsv().then(() => setCsvPreview(null))}
              />
            </View>
            <AppButton
              label="Import from a file"
              variant="ghost"
              size="touch"
              className="self-start px-0"
              testID="catalog-import-settings-link"
              onPress={() => {
                setManageOpen(false);
                router.push('/settings?page=import&kind=catalog');
              }}
            />
          </View>

          <View className="gap-3">
            <Text role="heading" aria-level={3} className="text-base font-semibold text-foreground dark:text-zinc-50">More</Text>
            <View className="flex-row flex-wrap gap-2">
              <AppButton label={exporting ? 'Exporting…' : 'Export CSV'} variant="outline" size="touch" onPress={exportCsv} disabled={exporting || displayRows.length === 0} />
              <AppButton label={syncing ? 'Syncing…' : 'Add items from my lists'} variant="outline" size="touch" onPress={syncFromExistingLists} disabled={syncing} />
            </View>
          </View>
        </View>
      </AppSheet>
    </View>
  );
}
