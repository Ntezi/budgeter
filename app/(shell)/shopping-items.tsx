import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { IconActionButton } from '@/components/ui/IconActionButton';
import { useWorkspaceUid } from '@/providers/WorkspaceProvider';
import {
  addShoppingCategory,
  backfillShoppingCatalogFromLists,
  deleteShoppingCategory,
  deleteShoppingCatalogItem,
  type ShoppingCatalogItem,
  type ShoppingCategory,
  importShoppingCatalogCsv,
  shoppingCatalogCsvHeader,
  upsertShoppingCatalogItem,
  watchShoppingCatalog,
  watchShoppingCategories,
} from '@/lib/repo/shopping';
import { periodIdFromDate, type PeriodDoc, watchPeriods } from '@/lib/repo/periods';
import { type PlanItem, watchPlanTotals } from '@/lib/repo/plans';
import { fmtMoney } from '@/lib/format';
import { planGroupLabel } from '@/lib/groups';
import { parseTagsInput, tagsLabel, tagsToInput } from '@/lib/tags';

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
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sortMode, setSortMode] = useState<'NAME' | 'CATEGORY'>('NAME');

  const [edits, setEdits] = useState<Record<string, CatalogEdit>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [screenError, setScreenError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

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

  const categoryOptions = useMemo(
    () => [{ label: 'All categories', value: 'ALL' }, ...categoryNames.map((name) => ({ label: name, value: name }))],
    [categoryNames]
  );

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
        return name.includes(q) || category.includes(q);
      });
    }
    if (categoryFilter !== 'ALL') {
      out = out.filter((row) => (row.category || '') === categoryFilter);
    }
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
  }, [rows, search, categoryFilter, sortMode]);

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
        return;
      }
    }
    setEditingId(id);
    setScreenError('');
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

  const periodOptions = periods.map((row) => ({
    label: row.title || row.id,
    value: row.id,
  }));

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
          <Text className="text-xs text-muted-foreground">name,category,tags</Text>
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
        <View className="flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <View className="w-full md:w-72">
            <AppInput value={search} onChangeText={setSearch} placeholder="Search by name or category" className="h-9" />
          </View>
          <View className="w-full md:w-64">
            <DropdownField value={categoryFilter} options={categoryOptions} onChange={setCategoryFilter} placeholder="Filter by category" menuStrategy="inline" />
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

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View className={isCompact ? 'min-w-[1120px] flex-1' : 'min-w-[1220px] flex-1'}>
            <View className="flex-row border-b border-border pb-2 dark:border-zinc-800">
              <Text className="w-[220px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</Text>
              <Text className="w-[180px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</Text>
              <Text className="w-[240px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</Text>
              <Text className="w-[420px] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Budget Item</Text>
              <Text className="w-[160px] text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</Text>
            </View>

            {displayRows.map((row) => {
              const edit = row.id ? edits[row.id] : null;
              if (!row.id || !edit) return null;
              const isEditing = editingId === row.id;
              return (
                <View
                  key={row.id}
                  className={`flex-row items-center border-b py-2 dark:border-zinc-800 ${
                    edit.dirty
                      ? 'border-primary/40 bg-primary/5 dark:bg-zinc-800/70'
                      : 'border-border hover:bg-muted/35 dark:hover:bg-zinc-800/55'
                  }`}
                >
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
                  <View className="w-[240px] pr-2">
                    {isEditing ? (
                      <AppInput value={edit.tagsInput} onChangeText={(value) => setEditField(row.id!, { tagsInput: value })} className="h-9" placeholder="tags" />
                    ) : null}
                    <Text className="mt-1 text-xs text-muted-foreground">{tagsLabel(isEditing ? parseTagsInput(edit.tagsInput) : row.tags)}</Text>
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
                </View>
              );
            })}

            {!displayRows.length ? (
              <View className="py-4">
                <Text className="text-sm text-muted-foreground">No shopping items found for this filter.</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
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
    </ScrollView>
  );
}
