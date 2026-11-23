import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/AppButton';
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
  applyShoppingImportBatch,
  addShoppingList,
  addShoppingListItem,
  closeShoppingList,
  deleteShoppingList,
  deleteShoppingListItem,
  listShoppingListItems,
  type ShoppingList,
  type ShoppingListItem,
  updateShoppingListItem,
  updateShoppingCatalogItem,
  upsertShoppingCatalogItem,
  addShoppingCatalogAlias,
  createShoppingCatalogItem,
  setShoppingListItemFields,
  watchShoppingCatalog,
  watchShoppingListItems,
  watchShoppingLists,
} from '@/lib/repo/shopping';
import { matchShoppingItems, matchShoppingItemsExactName } from '@/lib/shopping/import/matchShoppingItems';
import { canonicalShoppingItemName, normalizeShoppingItemName } from '@/lib/shopping/import/normalizeShoppingItemName';
import { parseShoppingText } from '@/lib/shopping/import/parseShoppingText';
import { reconcilePurchasedItems } from '@/lib/shopping/import/reconcilePurchasedItems';
import type { PurchaseReconciliationResult, ShoppingImportBatch, ShoppingItemMatchResult, ShoppingImportMode } from '@/lib/shopping/import/shoppingImportTypes';
import { useAuthUser } from '@/providers/AuthProvider';
import { db } from '@/lib/firebase';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import { watchOwnedWorkspaceMembers } from '@/lib/repo/collaboration';
import { localDateISO, postingPeriodId } from '@/lib/rules/postingMonth';
import { monthTitle } from '@/lib/rules/months';
import { planCatalogWrite, searchCatalog, suggestCatalogMatches, type AddChoice } from '@/lib/rules/catalogMatch';
import { recordShoppingExpense } from '@/lib/repo/shoppingExpense';
import {
  deleteSharedItem,
  revokeShare,
  shareListWithChef,
  validateChefUid,
  watchSharedItems,
  watchSharedWithMe,
  type SharedItem,
  type SharedList,
} from '@/lib/repo/sharedLists';
import { SharedListView } from '@/components/SharedListView';
import { ReceiptModal, lineDraftsFromItems } from '@/components/shopping/ReceiptModal';
import { useWorkspace, useWorkspaceUid } from '@/providers/WorkspaceProvider';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState } from '@/components/patterns/States';
import { AddItemBar } from '@/components/shopping/AddItemBar';
import { ItemRow, ItemSection, qtyLabel } from '@/components/shopping/ItemRow';
import { ItemSheet } from '@/components/shopping/ItemSheet';
import { ListsList } from '@/components/shopping/ListsList';
import { GotItFooter, RecordExpenseSheet, type RecordRow } from '@/components/shopping/RecordExpenseSheet';
import { ShareSheet, StopSharingDialog } from '@/components/shopping/ShareSheet';
import { useSheetEffects } from '@/components/shopping/useSheetEffects';

type PlanOption = {
  id: string;
  name: string;
  label: string;
  group: PlanItem['group'];
  plannedAccountId?: string;
};

type CompletionInput = {
  quantity: string;
  price: string;
  planItemId: string;
};

const EMPTY_ADD_DRAFT = { name: '', quantity: '1', unit: '', category: '', note: '', saveToCatalog: true, choice: '' };

function normalize(input: string) {
  return input.trim().toLowerCase();
}

const SHOPPING_CATEGORY_ORDER = [
  'produce',
  'meat',
  'seafood',
  'dairy',
  'pantry',
  'drink',
  'drinks',
  'beverage',
  'beverages',
  'bakery',
  'frozen',
  'household',
  'personal care',
  'other',
];

function shoppingCategoryRank(category?: string) {
  const normalized = normalize(category || '');
  if (!normalized) return SHOPPING_CATEGORY_ORDER.length + 1;
  const exact = SHOPPING_CATEGORY_ORDER.indexOf(normalized);
  if (exact >= 0) return exact;
  const partial = SHOPPING_CATEGORY_ORDER.findIndex((known) => normalized.includes(known) || known.includes(normalized));
  return partial >= 0 ? partial : SHOPPING_CATEGORY_ORDER.length;
}

/** Private-twin fields for a chef-added item (no undefined values for Firestore). */
function compactItem(item: ShoppingListItem): Partial<ShoppingListItem> {
  const out: Record<string, unknown> = {};
  (['name', 'quantity', 'unit', 'category', 'note', 'bought', 'assignedPlanItemId', 'assignedPlanItemName', 'assignedGroup'] as const).forEach((key) => {
    if (item[key] !== undefined) out[key] = item[key];
  });
  return out as Partial<ShoppingListItem>;
}

function parseQuantity(input: string) {
  const value = parseInt(input, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeItemTag(input: string) {
  return input.trim();
}

function isValidItemTag(tag: string) {
  return tag.length >= 1 && tag.length <= 20;
}

export default function ShoppingScreen() {
  const { activePeriodId } = useWorkspace();
  const uid = useWorkspaceUid();
  const { width } = useWindowDimensions();
  // BUDG-8 07: lists and the open list side by side from 900 px (Guess in the spec, decided here).
  const isWide = width >= 900;
  const router = useRouter();
  const targetPid = activePeriodId || periodIdFromDate();

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listItemCounts, setListItemCounts] = useState<Record<string, number>>({});
  const [selectedListId, setSelectedListId] = useState('');
  const [privateItems, setItems] = useState<ShoppingListItem[]>([]);
  const [catalogRows, setCatalogRows] = useState<ShoppingCatalogItem[]>([]);

  const [createListOpen, setCreateListOpen] = useState(false);
  const [listDraftName, setListDraftName] = useState('');
  const [listError, setListError] = useState('');
  const [deleteListDraft, setDeleteListDraft] = useState<ShoppingList | null>(null);
  const [deletingList, setDeletingList] = useState(false);

  const [itemDraftName, setItemDraftName] = useState('');
  const [itemError, setItemError] = useState('');

  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editItemError, setEditItemError] = useState('');
  const [editDraft, setEditDraft] = useState({
    id: '',
    name: '',
    quantity: '1',
    planItemId: '',
    unit: '',
    category: '',
    note: '',
  });
  const [, setTagEditOpen] = useState(false);
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
  const [smartImportOpen, setSmartImportOpen] = useState(false);
  const [smartImportMode, setSmartImportMode] = useState<ShoppingImportMode>('planned');
  const [smartImportText, setSmartImportText] = useState('');
  const [smartImportMatches, setSmartImportMatches] = useState<ShoppingItemMatchResult[]>([]);
  const [smartImportReview, setSmartImportReview] = useState<Record<string, string>>({});
  const [smartImportError, setSmartImportError] = useState('');
  const [applyingSmartImport, setApplyingSmartImport] = useState(false);
  const [purchaseReconciliation, setPurchaseReconciliation] = useState<PurchaseReconciliationResult | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closingList, setClosingList] = useState(false);
  // BUDG-4: chef sharing, add-item flow, explicit expense review.
  const authUser = useAuthUser();
  const myUid = authUser?.uid || '';
  const [sharedItems, setSharedItems] = useState<SharedItem[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedList[]>([]);
  const [chefShareId, setChefShareId] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDraft, setShareDraft] = useState({ chefUid: '', label: 'Chef' });
  const [shareError, setShareError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState('');
  const [expenseDate, setExpenseDate] = useState(localDateISO());
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState(EMPTY_ADD_DRAFT);
  const [addError, setAddError] = useState('');
  // BUDG-8 S10 view state only.
  const [listsLoaded, setListsLoaded] = useState(false);
  const [gotFolded, setGotFolded] = useState(false);
  const [stopShareOpen, setStopShareOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [recordError, setRecordError] = useState('');
  const moreSheet = useSheet();
  useSheetEffects(addOpen, () => setAddOpen(false));
  useSheetEffects(editItemOpen, () => setEditItemOpen(false));
  useSheetEffects(completing, () => setCompleting(false));
  useSheetEffects(shareOpen, () => setShareOpen(false));
  useSheetEffects(receiptOpen, () => setReceiptOpen(false));
  useSheetEffects(createListOpen, () => setCreateListOpen(false));
  useSheetEffects(importOpen, () => setImportOpen(false));

  useEffect(() => {
    if (!uid) return;
    return watchShoppingLists(uid, (rows) => {
      const periodScoped = rows.filter((row) => {
        const pid = String(row.periodId || '').trim();
        if (!pid) return true;
        return pid === targetPid;
      });
      setLists(periodScoped);
      setListsLoaded(true);
      if (selectedListId && !periodScoped.some((row) => row.id === selectedListId)) {
        setSelectedListId(periodScoped[0]?.id || '');
        return;
      }
      if (!selectedListId && periodScoped.length > 0 && isWide) {
        setSelectedListId(periodScoped[0].id || '');
      }
    });
  }, [uid, selectedListId, isWide, targetPid]);

  useEffect(() => {
    if (!uid || !lists.length) {
      setListItemCounts({});
      return;
    }

    let cancelled = false;
    Promise.all(
      lists
        .filter((list): list is ShoppingList & { id: string } => Boolean(list.id))
        .map(async (list) => {
          const rows = await listShoppingListItems(uid, list.id);
          return [list.id, rows.length] as const;
        })
    )
      .then((entries) => {
        if (cancelled) return;
        setListItemCounts(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setListItemCounts({});
      });

    return () => {
      cancelled = true;
    };
  }, [uid, lists]);

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
  const shareId = selectedList?.shareId || '';

  useEffect(() => {
    if (!shareId) {
      setSharedItems([]);
      return;
    }
    return watchSharedItems(shareId, setSharedItems, () => setSharedItems([]));
  }, [shareId]);

  // Household view of a shared list: private twins (price, plan, links) merged with
  // the chef-visible fields in sharedLists/{shareId}/items; chef-added items have no twin yet.
  const items = useMemo<ShoppingListItem[]>(() => {
    if (!shareId) return privateItems;
    const byId = new Map(sharedItems.map((row) => [row.id, row]));
    const merged = privateItems.map((item) => {
      const shared = item.id ? byId.get(item.id) : undefined;
      if (!shared) return item;
      return {
        ...item,
        name: shared.name,
        quantity: shared.quantity ?? item.quantity,
        unit: shared.unit ?? item.unit,
        category: shared.category ?? item.category,
        note: shared.note ?? item.note,
        bought: shared.status === 'GOT_IT',
      };
    });
    const known = new Set(privateItems.map((item) => item.id));
    sharedItems.forEach((shared) => {
      if (!shared.id || known.has(shared.id)) return;
      merged.push({
        id: shared.id,
        name: shared.name,
        quantity: shared.quantity,
        unit: shared.unit,
        category: shared.category,
        note: shared.note,
        bought: shared.status === 'GOT_IT',
        fromChef: true,
      });
    });
    return merged;
  }, [privateItems, sharedItems, shareId]);

  useEffect(() => {
    if (!myUid) return;
    return watchSharedWithMe(myUid, setSharedWithMe);
  }, [myUid]);

  useEffect(() => {
    if (!uid || uid !== myUid) {
      setMemberUids([]);
      return;
    }
    return watchOwnedWorkspaceMembers(uid, (rows) => setMemberUids(rows.map((row) => row.memberUid)));
  }, [uid, myUid]);

  useEffect(() => {
    if (!uid) return;
    return watchAccounts(uid, setAccounts);
  }, [uid]);

  const addCategoryOptions = useMemo(() => {
    const names = Array.from(new Set(catalogRows.map((row) => String(row.category || '').trim()).filter(Boolean))).sort();
    return [{ label: 'No category', value: '' }, ...names.map((name) => ({ label: name, value: name }))];
  }, [catalogRows]);

  const orderedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      const ac = listItemCounts[a.id || ''] ?? 0;
      const bc = listItemCounts[b.id || ''] ?? 0;
      if (ac > 0 !== bc > 0) return ac > 0 ? -1 : 1;
      return normalize(a.name || '').localeCompare(normalize(b.name || ''));
    });
  }, [listItemCounts, lists]);

  const planOptions = useMemo<PlanOption[]>(
    () =>
      planItems
        .filter((row): row is PlanItem & { id: string } => Boolean(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          group: row.group,
          label: `${row.name} · ${fmtMoney(row.amount || 0)} · ${planGroupLabel(row.group)}`,
          plannedAccountId: String((row as any).plannedAccountId || '').trim(),
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
    return searchCatalog(itemDraftName, catalogRows, 10);
  }, [catalogRows, itemDraftName]);

  const catalogByItemName = useMemo(() => {
    const rows = new Map<string, ShoppingCatalogItem>();
    catalogRows.forEach((row) => {
      const key = normalizeShoppingItemName(row.name);
      if (key && !rows.has(key)) rows.set(key, row);
    });
    return rows;
  }, [catalogRows]);

  const itemsWithCatalogEstimates = useMemo(() => {
    return items.map((item) => {
      if ((item.price || 0) > 0) return item;
      const catalog = catalogByItemName.get(normalizeShoppingItemName(item.name));
      if (!catalog?.lastPrice || catalog.lastPrice <= 0) return item;
      return {
        ...item,
        price: catalog.lastPrice,
        category: item.category || catalog.category || '',
        tags: item.tags?.length ? item.tags : catalog.tags || [],
        assignedPlanItemId: item.assignedPlanItemId || catalog.assignedPlanItemId || '',
        assignedPlanItemName: item.assignedPlanItemName || catalog.assignedPlanItemName || '',
        assignedGroup: item.assignedGroup || catalog.assignedGroup,
      };
    });
  }, [catalogByItemName, items]);

  useEffect(() => {
    if (!uid || !selectedListId || !catalogRows.length || !items.length) return;

    let cancelled = false;
    const missingEstimateItems = items.filter((item) => {
      if (!item.id || (item.price || 0) > 0) return false;
      const catalog = catalogByItemName.get(normalizeShoppingItemName(item.name));
      return Boolean(catalog?.lastPrice && catalog.lastPrice > 0);
    });

    if (!missingEstimateItems.length) return;

    (async () => {
      for (const item of missingEstimateItems) {
        if (cancelled || !item.id || (item.price || 0) > 0) continue;
        const catalog = catalogByItemName.get(normalizeShoppingItemName(item.name));
        if (!catalog?.lastPrice || catalog.lastPrice <= 0) continue;
        await updateShoppingListItem(uid, selectedListId, item.id, {
          price: catalog.lastPrice,
          category: item.category || catalog.category || '',
          tags: item.tags?.length ? item.tags : catalog.tags || [],
          assignedPlanItemId: item.assignedPlanItemId || catalog.assignedPlanItemId || '',
          assignedPlanItemName: item.assignedPlanItemName || catalog.assignedPlanItemName || '',
          assignedGroup: item.assignedGroup || catalog.assignedGroup,
        });
      }
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [catalogByItemName, catalogRows.length, items, selectedListId, uid]);

  const displayItems = useMemo(() => {
    return [...itemsWithCatalogEstimates].sort((a, b) => {
      if (a.bought !== b.bought) return a.bought ? 1 : -1;
      const categoryDiff = shoppingCategoryRank(a.category) - shoppingCategoryRank(b.category);
      if (categoryDiff !== 0) return categoryDiff;
      const categoryNameDiff = normalize(a.category || '').localeCompare(normalize(b.category || ''));
      if (categoryNameDiff !== 0) return categoryNameDiff;
      return normalize(a.name || '').localeCompare(normalize(b.name || ''));
    });
  }, [itemsWithCatalogEstimates]);

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

    const ref = await addShoppingList(uid, name, targetPid);
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
    try {
      await addShoppingListItem(uid, selectedListId, {
        name,
        quantity: 1,
        price: catalog.lastPrice || 0,
        category: catalog.category || '',
        tags: catalog.tags || [],
        catalogItemId: catalog.id || '',
        assignedPlanItemId: plan?.id || '',
        assignedPlanItemName: plan?.name || '',
        assignedGroup: plan?.group,
        bought: false,
        completed: false,
      }, mirror);
      setItemError('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setItemError(message || 'Could not add item.');
    }
  }

  function addItem() {
    const name = itemDraftName.trim();
    if (!name) {
      setItemError('Item name is required.');
      return;
    }
    setAddDraft({ ...EMPTY_ADD_DRAFT, name });
    setAddError('');
    setAddOpen(true);
  }

  // AC-3: likely duplicates are suggested only; nothing is merged without Use existing.
  const addCandidates = useMemo(
    () => (addOpen ? suggestCatalogMatches({ name: addDraft.name, unit: addDraft.unit }, catalogRows) : []),
    [addOpen, addDraft.name, addDraft.unit, catalogRows]
  );

  async function submitAddItem() {
    if (!uid || !selectedListId) return;
    const name = addDraft.name.trim();
    if (!name) {
      setAddError('Item name is required.');
      return;
    }
    const quantity = Number(addDraft.quantity || '1');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999) {
      setAddError('Quantity must be between 1 and 9999.');
      return;
    }
    const choice: AddChoice = addDraft.choice.startsWith('use:')
      ? { kind: 'use-existing', catalogItemId: addDraft.choice.slice(4) }
      : addDraft.choice === 'keep'
        ? { kind: 'keep-separate', saveToCatalog: addDraft.saveToCatalog }
        : { kind: 'new', saveToCatalog: addDraft.saveToCatalog };
    try {
      const write = planCatalogWrite(choice, addCandidates.length);
      let catalog: ShoppingCatalogItem | undefined;
      let catalogItemId = '';
      let itemName = name;
      if (write.catalog === 'reuse') {
        catalog = catalogRows.find((row) => row.id === write.catalogItemId);
        catalogItemId = write.catalogItemId;
        itemName = catalog?.name || name;
        if (write.addAlias && catalog && normalize(catalog.name) !== normalize(name)) {
          await addShoppingCatalogAlias(uid, catalogItemId, name);
        }
      } else if (write.catalog === 'create') {
        catalogItemId = await createShoppingCatalogItem(uid, { name, category: addDraft.category, unit: addDraft.unit || undefined });
      }
      const plan = resolvePlanForItemName(itemName, catalog);
      const fields = {
        name: itemName,
        quantity,
        unit: addDraft.unit || undefined,
        category: addDraft.category.trim() || catalog?.category || '',
        note: addDraft.note.trim() || undefined,
      };
      await addShoppingListItem(uid, selectedListId, {
        ...fields,
        price: catalog?.lastPrice || 0,
        tags: catalog?.tags || [],
        catalogItemId,
        assignedPlanItemId: plan?.id || '',
        assignedPlanItemName: plan?.name || '',
        assignedGroup: plan?.group,
        bought: false,
        completed: false,
      }, mirror);
      setAddOpen(false);
      setItemDraftName('');
      setItemError('');
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Could not add item.');
    }
  }

  async function submitShare() {
    if (!uid || !myUid || !selectedList?.id || sharing) return;
    const problem = validateChefUid(shareDraft.chefUid, uid, myUid, memberUids);
    if (problem) {
      setShareError(problem);
      return;
    }
    setSharing(true);
    try {
      await shareListWithChef(uid, myUid, { id: selectedList.id, name: selectedList.name }, shareDraft.chefUid.trim(), shareDraft.label);
      setShareOpen(false);
      setShareDraft({ chefUid: '', label: 'Chef' });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      setShareError(code === 'permission-denied' ? 'Sharing is unavailable for this account or list.' : e instanceof Error ? e.message : 'Could not share the list.');
    } finally {
      setSharing(false);
    }
  }

  async function revokeSelectedShare() {
    if (!uid || !selectedList?.id || !selectedList.shareId) return;
    try {
      await revokeShare(uid, selectedList.id, selectedList.shareId);
    } catch (e: unknown) {
      Alert.alert('Revoke failed', e instanceof Error ? e.message : 'Could not revoke access.');
    }
  }

  const mirror = shareId && myUid ? { shareId, actorUid: myUid } : undefined;

  async function toggleBought(item: ShoppingListItem) {
    if (!uid || !selectedListId || !item.id) return;
    // Check-off writes only bought/status: never a transaction (AC-7, SEC-22).
    const bought = !item.bought;
    if (item.fromChef) {
      await setShoppingListItemFields(uid, selectedListId, item.id, compactItem({ ...item, bought }), mirror);
    } else {
      await updateShoppingListItem(uid, selectedListId, item.id, { bought }, mirror);
    }
  }

  async function removeItem(item: ShoppingListItem) {
    if (!uid || !selectedListId || !item.id) return;
    if (!item.fromChef) await deleteShoppingListItem(uid, selectedListId, item.id, mirror);
    else if (shareId) await deleteSharedItem(shareId, item.id);
  }

  async function removeList(list: ShoppingList) {
    if (!uid || !list.id) return;
    const count = listItemCounts[list.id];
    if (count !== 0) return;

    setDeleteListDraft(list);
  }

  async function confirmDeleteList() {
    if (!uid || !deleteListDraft?.id || deletingList) return;
    setDeletingList(true);
    try {
      await deleteShoppingList(uid, deleteListDraft.id);
      if (selectedListId === deleteListDraft.id) setSelectedListId('');
      setDeleteListDraft(null);
    } catch (e: unknown) {
      Alert.alert('Delete failed', e instanceof Error ? e.message : 'Could not delete shopping list.');
    } finally {
      setDeletingList(false);
    }
  }

  function openEditItem(item: ShoppingListItem) {
    const assigned = String(item.assignedPlanItemId || '').trim();
    setEditDraft({
      id: item.id || '',
      name: item.name || '',
      quantity: String(item.quantity || 1),
      planItemId: assigned,
      unit: item.unit || '',
      category: item.category || '',
      note: item.note || '',
    });
    setEditItemError('');
    setTagDraft({ id: item.id || '', name: item.name || '', tag: String(item.tag || '') });
    setTagEditError('');
    setEditItemOpen(true);
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
    try {
      const patch = {
        name,
        quantity,
        unit: editDraft.unit,
        category: editDraft.category.trim(),
        note: editDraft.note.trim().slice(0, 500),
        assignedPlanItemId: selectedPlan?.id || '',
        assignedPlanItemName: selectedPlan?.name || '',
        assignedGroup: selectedPlan?.group,
      };
      const target = items.find((row) => row.id === editDraft.id);
      if (target?.fromChef) {
        await setShoppingListItemFields(uid, selectedListId, editDraft.id, compactItem({ ...target, ...patch }), mirror);
      } else {
        await updateShoppingListItem(uid, selectedListId, editDraft.id, patch, mirror);
      }
      // The tag now lives in the item sheet; same write as the old tag dialog (saveItemTag).
      const nextTag = normalizeItemTag(tagDraft.tag);
      if (!target?.fromChef && tagDraft.id === editDraft.id && nextTag !== normalizeItemTag(String(target?.tag || ''))) {
        if (!isValidItemTag(nextTag)) {
          setTagEditError('Tag must be between 1 and 20 characters.');
          return;
        }
        await saveItemTag();
      }

      setEditItemOpen(false);
      setEditItemError('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setEditItemError(message || 'Could not update item.');
    }
  }

  async function saveItemTag() {
    if (!uid || !selectedListId || !tagDraft.id) return;
    const nextTag = normalizeItemTag(tagDraft.tag);
    if (!isValidItemTag(nextTag)) {
      setTagEditError('Tag must be between 1 and 20 characters.');
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
    const firstPlan = Object.values(nextInputs).map((row) => planById.get(row.planItemId)).find((plan) => plan?.plannedAccountId);
    setExpenseAccountId(firstPlan?.plannedAccountId || '');
    setExpenseDate(localDateISO());
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

  const expenseTotal = useMemo(
    () => completionTargetItems.reduce((sum, item) => sum + Math.max(0, parseMoney(itemInputs[item.id || '']?.price || '0')), 0),
    [completionTargetItems, itemInputs]
  );

  const expenseReview = useMemo(() => {
    let periodLabel = '';
    try {
      periodLabel = monthTitle(postingPeriodId(expenseDate.trim()));
    } catch {
      return { ready: false, problem: 'Enter the date as YYYY-MM-DD.', periodLabel: '', accountName: '' };
    }
    const account = accounts.find((row) => row.id === expenseAccountId);
    if (!account) return { ready: false, problem: 'Choose the account that paid.', periodLabel, accountName: '' };
    return { ready: true, problem: '', periodLabel, accountName: account.name };
  }, [accounts, expenseAccountId, expenseDate]);

  // AC-7 / SEC-20 / SEC-22: one explicit Save after reviewing date, amount and account.
  // Replaces the old per-item addTransaction loop; ids are shop_{listId}_{itemId}, so a retry never duplicates.
  async function handleRecordExpense() {
    if (savingCompletion || finalizingCompletion) return;
    if (!uid || !selectedListId || !selectedList) return;
    if (!completionValidation.ready) {
      Alert.alert(
        'Complete required fields',
        `Fill quantity, total amount, and funded budget item for every ${completionScopeLabel} first.`
      );
      return;
    }
    if (!expenseReview.ready) {
      Alert.alert('Review the expense', expenseReview.problem);
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

        await recordShoppingExpense(db, uid, {
          listId: selectedListId,
          listName: selectedList.name,
          itemId: item.id,
          itemName: item.name,
          amount: totalAmount,
          dateISO: expenseDate.trim(),
          accountId: expenseAccountId,
          planItemId: plan.id,
          planItemName: plan.name,
          group: plan.group,
        });

        if (item.catalogItemId) {
          await updateShoppingCatalogItem(uid, item.catalogItemId, { lastPrice: unitPrice });
        } else if (item.catalogItemId === undefined) {
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
        }

        if (!item.fromChef) await deleteShoppingListItem(uid, selectedListId, item.id, mirror);
        else if (shareId) await deleteSharedItem(shareId, item.id);
      }

      setCompleting(false);
      setItemInputs({});
      if (!isWide) setSelectedListId('');
    } catch (e: unknown) {
      setRecordError(e instanceof Error ? e.message : 'Could not record the expense.');
    } finally {
      setFinalizingCompletion(false);
    }
  }

  async function importSelected() {
    if (!uid || !selectedListId) return;
    const picks = catalogRows.filter((row) => importSelection[row.id || '']);
    let addedCount = 0;
    let duplicateCount = 0;

    try {
      for (const row of picks) {
        const name = String(row.name || '').trim();
        if (!name) continue;
        const plan = resolvePlanForItemName(name, row);
        try {
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
          addedCount += 1;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          if (message === 'Item already exists in this shopping list.') {
            duplicateCount += 1;
            continue;
          }
          throw e;
        }
      }

      setImportOpen(false);
      setImportSearch('');
      setImportCategoryFilter('ALL');
      setImportSelection({});
      setItemError('');

      if (duplicateCount > 0) {
        Alert.alert(
          'Import complete',
          `Added ${addedCount} item${addedCount === 1 ? '' : 's'}. Skipped ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}.`
        );
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Import failed', message || 'Could not import selected items.');
    }
  }

  function openSmartImport(mode: ShoppingImportMode) {
    setSmartImportMode(mode);
    setSmartImportText('');
    setSmartImportMatches([]);
    setSmartImportReview({});
    setSmartImportError('');
    setPurchaseReconciliation(null);
    setSmartImportOpen(true);
  }

  function buildImportSummary(matches: ShoppingItemMatchResult[]) {
    return {
      parsedCount: matches.length,
      autoMatchCount: matches.filter((row) => row.confidenceLabel === 'auto').length,
      reviewCount: matches.filter((row) => row.confidenceLabel === 'review').length,
      newItemCount: matches.filter((row) => row.confidenceLabel === 'none').length,
    };
  }

  function previewSmartImport() {
    const parsed = parseShoppingText(smartImportText);
    if (!parsed.length) {
      setSmartImportError('Paste at least one shopping item.');
      return;
    }
    const matches = smartImportMode === 'planned'
      ? matchShoppingItemsExactName(parsed, items)
      : matchShoppingItems(parsed, items);
    setSmartImportMatches(matches);
    setSmartImportReview({});
    setPurchaseReconciliation(smartImportMode === 'purchase' ? reconcilePurchasedItems(parsed, items) : null);
    setSmartImportError('');
  }

  function refreshSmartImportRows(nextRows: ShoppingItemMatchResult[]) {
    setSmartImportMatches(nextRows);
    setPurchaseReconciliation(
      smartImportMode === 'purchase' ? reconcilePurchasedItems(nextRows.map((row) => row.parsedItem), items) : null
    );
  }

  function updateSmartImportParsedItem(parsedItemId: string, patch: { name?: string; quantity?: string }) {
    const nextParsed = smartImportMatches.map((match) => {
      if (match.parsedItem.id !== parsedItemId) return match.parsedItem;
      const name = patch.name === undefined ? match.parsedItem.name : canonicalShoppingItemName(patch.name);
      const quantityRaw = patch.quantity === undefined ? match.parsedItem.quantityText || '' : patch.quantity;
      const quantity = Number(String(quantityRaw).replace(/[^\d.]/g, ''));
      const unit = String(quantityRaw).replace(/[\d.\s]/g, '').toLowerCase() || undefined;
      return {
        ...match.parsedItem,
        name,
        normalizedName: normalizeShoppingItemName(name),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
        quantityText: quantityRaw,
        unit,
      };
    });
    refreshSmartImportRows(
      smartImportMode === 'planned'
        ? matchShoppingItemsExactName(nextParsed, items)
        : matchShoppingItems(nextParsed, items)
    );
  }

  function removeSmartImportParsedItem(parsedItemId: string) {
    const nextRows = smartImportMatches.filter((match) => match.parsedItem.id !== parsedItemId);
    refreshSmartImportRows(nextRows);
    setSmartImportReview((prev) => {
      const next = { ...prev };
      delete next[parsedItemId];
      return next;
    });
  }

  async function applySmartImport() {
    if (!uid || !selectedListId || !smartImportMatches.length) return;
    setApplyingSmartImport(true);
    try {
      const batch: Omit<ShoppingImportBatch, 'id' | 'createdAt' | 'appliedAt'> = {
        listId: selectedListId,
        mode: smartImportMode,
        source: smartImportMode === 'purchase' ? 'purchase_import' : 'whatsapp_paste',
        rawText: smartImportText,
        parsedItems: smartImportMatches.map((row) => row.parsedItem),
        matches: smartImportMatches,
        createdBy: uid,
        summary: buildImportSummary(smartImportMatches),
      };
      await applyShoppingImportBatch(uid, selectedListId, batch, smartImportReview);
      setSmartImportOpen(false);
      setSmartImportText('');
      setSmartImportMatches([]);
      setPurchaseReconciliation(null);
      if (smartImportMode === 'purchase') setCloseConfirmOpen(true);
    } catch (e: unknown) {
      setSmartImportError(e instanceof Error ? e.message : 'Could not apply import.');
    } finally {
      setApplyingSmartImport(false);
    }
  }

  async function closeSelectedShoppingList() {
    if (!uid || !selectedListId) return;
    setClosingList(true);
    try {
      const result = await closeShoppingList(uid, selectedListId, { closedBy: uid });
      setCloseConfirmOpen(false);
      Alert.alert(
        'Shopping closed',
        `Planned: ${fmtMoney(result.plannedTotal)}\nActual: ${fmtMoney(result.actualTotal)}\nVariance: ${fmtMoney(result.variance)}`
      );
    } catch (e: unknown) {
      Alert.alert('Close failed', e instanceof Error ? e.message : 'Could not close shopping list.');
    } finally {
      setClosingList(false);
    }
  }

  // ---- BUDG-8 S10 layout: lists, one list, item sheet, record expense (logic above unchanged) ----
  const isChefOnly = sharedWithMe.length > 0 && lists.length === 0;
  const toBuyItems = displayItems.filter((item) => !item.bought);
  const toBuyEstimate = toBuyItems.reduce((acc, item) => acc + ((item.price || 0) > 0 ? (item.price || 0) * (item.quantity || 1) : 0), 0);
  const showLists = isWide || (!selectedListId && !chefShareId);
  const showList = Boolean(selectedListId || chefShareId) || isWide;

  function rowFor(item: ShoppingListItem) {
    const unitPrice = item.price || 0;
    const qty = item.quantity || 1;
    const amountValue = item.bought && (item.cost || 0) > 0 ? item.cost || 0 : unitPrice * qty;
    const subParts = [item.note, item.category, normalizeItemTag(String(item.tag || ''))].filter(Boolean) as string[];
    const noPrice = unitPrice <= 0 && !(item.cost || 0);
    return (
      <ItemRow
        key={item.id}
        testID="shopping-item"
        name={item.name}
        qty={qtyLabel(item.quantity, item.unit)}
        sub={noPrice ? ['No price yet', ...subParts].join(' · ') : subParts.join(' · ') || undefined}
        subTone={noPrice ? 'warn' : 'muted'}
        amount={amountValue > 0 ? `${item.bought ? '' : '~'}${fmtMoney(amountValue)}` : undefined}
        got={Boolean(item.bought)}
        onToggle={() => void toggleBought(item)}
        onPress={() => openEditItem(item)}
      />
    );
  }

  const recordRows: RecordRow[] = completionTargetItems
    .filter((item): item is ShoppingListItem & { id: string } => Boolean(item.id))
    .map((item) => {
      const input = itemInputs[item.id];
      const lineId = String(input?.planItemId || '').trim();
      const problem = !parseQuantity(input?.quantity || '0')
        ? 'a quantity'
        : Math.max(0, parseMoney(input?.price || '0')) <= 0
          ? 'the amount paid'
          : !lineId || !planById.has(lineId)
            ? 'a budget line'
            : !hasFundedAmount(fundedByPlanId, lineId)
              ? 'a line with money in it'
              : '';
      return { id: item.id, name: item.name, quantity: input?.quantity || '', amount: input?.price || '', lineId, problem };
    });
  const recordSummary = !completionValidation.ready
    ? 'Fill the amount and a funded line for every item.'
    : expenseReview.ready
      ? `Posts to ${expenseReview.periodLabel} · ${expenseReview.accountName} · ${fmtMoney(expenseTotal)} · ${expenseDate.trim()}`
      : expenseReview.problem;

  const renderListHeader = () => {
    if (!selectedList) return null;
    const sub = isShoppingListEmpty
      ? 'No items yet'
      : `${toBuyItems.length} to buy${toBuyEstimate > 0 ? ` · est. ${fmtMoney(toBuyEstimate)}` : ''}`;
    return (
      <View className="gap-3">
        {!isWide ? (
          <AppButton label="‹ Lists" variant="ghost" size="touch" className="self-start px-1" accessibilityLabel="Back to lists" onPress={() => setSelectedListId('')} />
        ) : null}
        <View className="flex-row items-start gap-2">
          <View className="min-w-0 flex-1">
            <Text role="heading" aria-level={2} className="text-xl font-bold text-foreground dark:text-zinc-50" numberOfLines={2}>
              {selectedList.name}
            </Text>
            <Text className="text-sm text-muted-foreground dark:text-zinc-400">{sub}</Text>
          </View>
          <AppButton
            accessibilityLabel="List options"
            variant="outline"
            size="touch"
            className="w-11 px-0"
            onPress={(e) => moreSheet.show(e)}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={22} color="#717182" />
          </AppButton>
        </View>
        {selectedList.shareId ? (
          <View className="flex-row flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-1 dark:border-zinc-800 dark:bg-zinc-900">
            <MaterialCommunityIcons name="account-multiple-outline" size={18} color="#717182" />
            <Text className="min-w-0 flex-1 text-sm text-foreground dark:text-zinc-50">{`Shared with ${selectedList.sharedWithLabel || 'chef'}`}</Text>
            <AppButton label="Stop sharing" variant="ghost" size="touch" onPress={() => setStopShareOpen(true)} />
          </View>
        ) : (
          <AppButton
            label="Share with chef"
            variant="outline"
            size="touch"
            className="self-start"
            onPress={() => {
              setShareError('');
              setShareOpen(true);
            }}
          />
        )}
        {receiptNotice ? <Text accessibilityLiveRegion="polite" className="text-sm text-foreground dark:text-zinc-50">{receiptNotice}</Text> : null}
      </View>
    );
  };

  const renderItems = () => {
    if (chefShareId) return <SharedListView shareId={chefShareId} myUid={myUid} onBack={() => setChefShareId('')} showBack={!isWide} />;
    if (!selectedList) {
      return isWide ? <EmptyState icon="format-list-checks" message={lists.length ? 'Pick a list on the left.' : 'Make a list for your next shop.'} /> : null;
    }
    const gotCount = selectedItems.length;
    return (
      <View className="min-h-0 flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-6 pb-6" keyboardShouldPersistTaps="handled">
          {renderListHeader()}
          <AddItemBar
            value={itemDraftName}
            onChangeText={(v) => {
              setItemDraftName(v);
              if (itemError) setItemError('');
            }}
            onSubmit={() => addItem()}
            suggestions={suggestedRows.filter((row) => row.id).map((row) => ({
              id: row.id as string,
              name: row.name,
              sub: [row.category, (row.lastPrice || 0) > 0 ? `last ${fmtMoney(row.lastPrice || 0)} each` : 'No comparable price'].filter(Boolean).join(' · '),
            }))}
            onPick={(id) => {
              const row = catalogRows.find((c) => c.id === id);
              if (row) void addItemFromCatalog(row);
              setItemDraftName('');
            }}
            offerNew={!catalogRows.some((row) => normalize(row.name || '') === normalize(itemDraftName))}
            error={itemError}
          />
          {isShoppingListEmpty ? <EmptyState icon="playlist-plus" message="Add the first item above." testID="list-empty" /> : null}
          {!isShoppingListEmpty && toBuyItems.length === 0 ? (
            <View testID="all-got" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <Text className="text-base font-medium text-foreground dark:text-zinc-50">{`All ${displayItems.length} item${displayItems.length === 1 ? '' : 's'} got.`}</Text>
            </View>
          ) : null}
          {toBuyItems.length ? (
            <ItemSection title="To buy" count={toBuyItems.length} testID="to-buy">
              {toBuyItems.map(rowFor)}
            </ItemSection>
          ) : null}
          {gotCount ? (
            <ItemSection title="Got it" count={gotCount} folded={gotFolded} onFold={() => setGotFolded((v) => !v)} testID="got-it">
              {selectedItems.map(rowFor)}
            </ItemSection>
          ) : null}
        </ScrollView>
        {gotCount ? (
          <GotItFooter
            count={gotCount}
            total={selectedTotal > 0 ? fmtMoney(selectedTotal) : ''}
            onRecord={() => {
              setRecordError('');
              startCompletion();
            }}
            onReceipt={() => {
              setReceiptNotice('');
              setReceiptOpen(true);
            }}
          />
        ) : null}
      </View>
    );
  };

  const selectedImportCount = Object.values(importSelection).filter(Boolean).length;
  const editTarget = items.find((row) => row.id === editDraft.id);
  const moreActions: { label: string; run: () => void; disabled?: boolean; danger?: boolean }[] = selectedList
    ? [
        { label: 'Add receipt', run: () => { setReceiptNotice(''); setReceiptOpen(true); }, disabled: isShoppingListEmpty },
        { label: 'Add from catalog', run: () => setImportOpen(true) },
        { label: 'Paste from WhatsApp', run: () => openSmartImport('planned') },
        { label: 'Reconcile purchases', run: () => openSmartImport('purchase'), disabled: isShoppingListEmpty },
        ...(listItemCounts[selectedList.id || ''] === 0 ? [{ label: 'Delete list', run: () => void removeList(selectedList), danger: true }] : []),
      ]
    : [];

  return (
    <View className="min-h-0 flex-1 bg-background dark:bg-zinc-950">
      <PageHeader title="Shopping" />
      <View className={cn('min-h-0 flex-1', isWide ? 'flex-row gap-6 pt-4' : 'flex-col')}>
        {showLists ? (
          <ScrollView className={cn(isWide ? 'w-64 flex-none' : 'flex-1')} contentContainerClassName="pb-6">
            <ListsList
              loading={!listsLoaded}
              lists={orderedLists.filter((l) => l.id).map((l) => ({ id: l.id as string, name: l.name, count: listItemCounts[l.id as string], sharedWith: l.shareId ? l.sharedWithLabel || 'chef' : undefined }))}
              shared={sharedWithMe.filter((s) => s.id).map((s) => ({ id: s.id as string, name: s.listName }))}
              selectedId={chefShareId || selectedListId}
              onOpen={(id) => {
                setChefShareId('');
                setSelectedListId(id);
              }}
              onOpenShared={(id) => {
                setSelectedListId('');
                setChefShareId(id);
              }}
              onNew={isChefOnly ? undefined : () => setCreateListOpen(true)}
              onCatalog={isChefOnly ? undefined : () => router.push('/shopping-items')}
            />
          </ScrollView>
        ) : null}
        {showList ? <View className={cn('min-h-0 flex-1', isWide && 'max-w-2xl')}>{renderItems()}</View> : null}
      </View>

      <ItemSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add item"
        draft={addDraft}
        onChange={(patch) => setAddDraft((prev) => ({ ...prev, ...patch, ...(patch.name !== undefined || patch.unit !== undefined ? { choice: '' } : {}) }))}
        categoryOptions={addCategoryOptions}
        candidates={addCandidates.map((m) => ({
          id: m.item.id as string,
          name: m.item.name,
          hint: m.packDiffers ? 'Different pack' : m.reason === 'alias' ? 'Other spelling' : undefined,
        }))}
        choice={addDraft.choice}
        onChoice={(choice) => setAddDraft((prev) => ({ ...prev, choice }))}
        saveToCatalog={addDraft.saveToCatalog}
        onSaveToCatalog={(value) => setAddDraft((prev) => ({ ...prev, saveToCatalog: value }))}
        error={addError}
        saveLabel="Add to list"
        saveDisabled={addCandidates.length > 0 && !addDraft.choice}
        onSave={() => void submitAddItem()}
      />

      <ItemSheet
        open={editItemOpen}
        onClose={() => setEditItemOpen(false)}
        title="Edit item"
        draft={editDraft}
        onChange={(patch) => setEditDraft((prev) => ({ ...prev, ...patch }))}
        categoryOptions={addCategoryOptions}
        lineOptions={[{ label: 'No line yet', value: '' }, ...planOptions.map((row) => ({ label: row.label, value: row.id }))]}
        lineId={editDraft.planItemId}
        onLine={(planItemId) => setEditDraft((prev) => ({ ...prev, planItemId }))}
        tag={editTarget?.fromChef ? undefined : tagDraft.tag}
        onTag={editTarget?.fromChef ? undefined : (tag) => setTagDraft((prev) => ({ ...prev, tag }))}
        error={editItemError || tagEditError}
        saveLabel="Save"
        onSave={() => void saveEditedItem()}
        onDelete={() => {
          if (editTarget) void removeItem(editTarget);
          setEditItemOpen(false);
        }}
      />

      <RecordExpenseSheet
        open={completing}
        onClose={() => setCompleting(false)}
        rows={recordRows}
        onRow={(id, patch) =>
          setItemInputs((prev) => ({
            ...prev,
            [id]: {
              ...prev[id],
              ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
              ...(patch.amount !== undefined ? { price: patch.amount } : {}),
              ...(patch.lineId !== undefined ? { planItemId: patch.lineId } : {}),
            },
          }))
        }
        lineOptions={fundedPlanOptions.map((row) => ({ label: row.label, value: row.id }))}
        accounts={accounts.filter((a) => a.id).map((a) => ({ label: a.name, value: a.id as string }))}
        accountId={expenseAccountId}
        onAccount={setExpenseAccountId}
        date={expenseDate}
        onDate={setExpenseDate}
        summary={recordSummary}
        ready={completionValidation.ready && expenseReview.ready}
        busy={savingCompletion || finalizingCompletion}
        busyLabel={finalizingCompletion ? 'Recording…' : 'Saving…'}
        error={recordError}
        onSave={() => void handleRecordExpense()}
        onSaveForLater={() => void handleSaveAndBack()}
      />

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        chefUid={shareDraft.chefUid}
        label={shareDraft.label}
        onChange={(patch) => setShareDraft((prev) => ({ ...prev, ...patch }))}
        error={shareError}
        busy={sharing}
        onShare={() => void submitShare()}
      />
      <StopSharingDialog
        open={stopShareOpen}
        label={selectedList?.sharedWithLabel || 'The chef'}
        busy={revoking}
        onClose={() => setStopShareOpen(false)}
        onConfirm={() => {
          setRevoking(true);
          void revokeSelectedShare().finally(() => {
            setRevoking(false);
            setStopShareOpen(false);
          });
        }}
      />

      <AppSheet
        open={moreSheet.open}
        onClose={() => moreSheet.hide()}
        title={selectedList?.name || 'List options'}
        testID="list-options"
      >
        <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          {moreActions.map((action, i) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              disabled={action.disabled}
              onPress={() => moreSheet.hide(action.run)}
              className={cn('min-h-14 justify-center px-4 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60', i > 0 && 'border-t border-border dark:border-zinc-800', action.disabled && 'opacity-50')}
            >
              <Text className={cn('text-base font-medium', action.danger ? 'text-destructive dark:text-red-300' : 'text-foreground dark:text-zinc-50')}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </AppSheet>

      <AppSheet
        open={createListOpen}
        onClose={() => setCreateListOpen(false)}
        title="New list"
        footer={
          <>
            {listError ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{listError}</Text> : null}
            <AppButton label="Create list" size="touch-lg" className="w-full dark:bg-zinc-50" textClassName="text-base dark:text-zinc-900" onPress={() => void createList()} />
            <AppButton label="Cancel" variant="ghost" size="touch" onPress={() => setCreateListOpen(false)} />
          </>
        }
      >
        <FormField label="Name">
          <AppInput autoFocus value={listDraftName} onChangeText={setListDraftName} placeholder="Weekly groceries" accessibilityLabel="List name" className="h-11 text-base" onSubmitEditing={() => void createList()} />
        </FormField>
      </AppSheet>

      <AppModal open={Boolean(deleteListDraft)} onClose={() => !deletingList && setDeleteListDraft(null)} title="Delete this list?">
        <View className="gap-4">
          <Text className="text-base text-foreground dark:text-zinc-50">
            {`"${deleteListDraft?.name || ''}" has no items. Deleting it cannot be undone.`}
          </Text>
          <View className="flex-row gap-2">
            <AppButton label="Keep list" onPress={() => setDeleteListDraft(null)} variant="outline" size="touch" className="flex-1" disabled={deletingList} />
            <AppButton label={deletingList ? 'Deleting…' : 'Delete list'} onPress={confirmDeleteList} variant="destructive" size="touch" className="flex-1" disabled={deletingList} />
          </View>
        </View>
      </AppModal>

      <ReceiptModal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        onSaved={setReceiptNotice}
        ownerUid={uid || ''}
        actorUid={myUid}
        accounts={accounts}
        catalog={catalogRows}
        prefill={receiptOpen ? lineDraftsFromItems(items.some((it) => it.bought) ? items.filter((it) => it.bought) : items, catalogRows) : []}
        sourceListId={selectedListId || undefined}
      />

      <AppSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Add from catalog"
        footer={
          <>
            <AppButton label={`Add selected (${selectedImportCount})`} size="touch-lg" className="w-full dark:bg-zinc-50" textClassName="text-base dark:text-zinc-900" onPress={importSelected} disabled={selectedImportCount === 0} />
            <AppButton label="Cancel" variant="ghost" size="touch" onPress={() => setImportOpen(false)} />
          </>
        }
      >
        <View className="gap-3">
          <AppInput value={importSearch} onChangeText={setImportSearch} placeholder="Search by item name or category" accessibilityLabel="Search catalog" className="h-11 text-base" />
          <DropdownField value={importCategoryFilter} options={categoryOptions} onChange={setImportCategoryFilter} placeholder="Filter category" menuStrategy="inline" triggerClassName="min-h-11" />
          <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
            {importCandidates.map((row, i) => (
              <Pressable
                key={row.id}
                accessibilityRole="checkbox"
                aria-checked={Boolean(importSelection[row.id!])}
                onPress={() => setImportSelection((prev) => ({ ...prev, [row.id!]: !prev[row.id!] }))}
                className={cn('min-h-14 flex-row items-center gap-3 px-4 py-2', i > 0 && 'border-t border-border dark:border-zinc-800')}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-base text-foreground dark:text-zinc-50" numberOfLines={1}>{row.name}</Text>
                  <Text className="text-sm text-muted-foreground dark:text-zinc-400" numberOfLines={1}>
                    {(row.category || 'No category') + (row.assignedPlanItemName ? ` · ${row.assignedPlanItemName}` : '')}
                  </Text>
                </View>
                <MaterialCommunityIcons name={importSelection[row.id!] ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={importSelection[row.id!] ? '#22C55E' : '#717182'} />
              </Pressable>
            ))}
            {!importCandidates.length ? <Text className="p-4 text-center text-sm text-muted-foreground dark:text-zinc-400">No items found for this filter.</Text> : null}
          </View>
        </View>
      </AppSheet>

      <AppModal
        open={smartImportOpen}
        onClose={() => setSmartImportOpen(false)}
        title={smartImportMode === 'purchase' ? 'Reconcile Purchases' : 'Import from WhatsApp'}
        contentClassName="max-w-3xl"
      >
        <View className="gap-3">
          <AppInput
            value={smartImportText}
            onChangeText={(value) => {
              setSmartImportText(value);
              setSmartImportMatches([]);
              setPurchaseReconciliation(null);
              if (smartImportError) setSmartImportError('');
            }}
            placeholder={
              smartImportMode === 'purchase'
                ? 'Paste bought items with actual prices, one per line'
                : 'Paste WhatsApp shopping text, one item per line'
            }
            multiline
            textAlignVertical="top"
            className="h-40"
            style={{ height: 160 }}
          />
          {smartImportError ? <Text className="text-xs text-destructive">{smartImportError}</Text> : null}

          {smartImportMatches.length ? (
            <View className="gap-2">
              <View className="flex-row flex-wrap gap-2">
                <Text className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Auto: {smartImportMatches.filter((row) => row.confidenceLabel === 'auto').length}
                </Text>
                <Text className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Review: {smartImportMatches.filter((row) => row.confidenceLabel === 'review').length}
                </Text>
                <Text className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  New: {smartImportMatches.filter((row) => row.confidenceLabel === 'none').length}
                </Text>
              </View>

              {purchaseReconciliation ? (
                <View className="rounded-md border border-border p-3 dark:border-zinc-800">
                  <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Purchase totals</Text>
                  <Text className="text-xs text-muted-foreground">
                    Planned {fmtMoney(purchaseReconciliation.plannedTotal)} · Actual {fmtMoney(purchaseReconciliation.actualTotal)} · Variance {fmtMoney(purchaseReconciliation.variance)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Missing planned items when closed: {purchaseReconciliation.missingPlannedItemIds.length}
                  </Text>
                </View>
              ) : null}

              <ScrollView className="max-h-80 rounded-md border border-border dark:border-zinc-800">
                {smartImportMatches.map((match) => {
                  const parsed = match.parsedItem;
                  const chosenId = smartImportReview[parsed.id] || (match.confidenceLabel === 'auto' ? match.matchedItemId : '');
                  const total = parsed.totalPrice ?? (parsed.unitPrice && parsed.quantity ? parsed.unitPrice * parsed.quantity : undefined);
                  return (
                    <View key={parsed.id} className="gap-2 border-b border-border p-3 dark:border-zinc-800">
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <AppInput
                            value={parsed.name}
                            onChangeText={(value) => updateSmartImportParsedItem(parsed.id, { name: value })}
                            className="h-9"
                            placeholder="Item name"
                          />
                          <Text className="text-xs text-muted-foreground">
                            Line {parsed.lineNumber}
                            {parsed.quantity ? ` · Qty ${parsed.quantity}${parsed.unit ? ` ${parsed.unit}` : ''}` : ''}
                            {total !== undefined ? ` · ${fmtMoney(total)}` : ''}
                          </Text>
                        </View>
                        <View className="items-end gap-2">
                          <Text className="text-xs font-semibold text-muted-foreground">
                            {Math.round(match.confidence * 100)}% {match.confidenceLabel}
                          </Text>
                          <IconActionButton
                            icon="trash-can-outline"
                            label="Remove import row"
                            variant="danger"
                            onPress={() => removeSmartImportParsedItem(parsed.id)}
                          />
                        </View>
                      </View>
                      <View className={cn('gap-2', isWide ? 'flex-row items-center' : '')}>
                        <AppInput
                          value={parsed.quantityText || (parsed.quantity ? String(parsed.quantity) : '')}
                          onChangeText={(value) => updateSmartImportParsedItem(parsed.id, { quantity: value })}
                          className={cn('h-9', isWide ? 'w-28' : 'w-full')}
                          placeholder="Qty"
                        />
                        <View className="flex-1">
                          <DropdownField
                            value={chosenId || ''}
                            options={[
                              { label: 'Add as new item', value: '' },
                              ...displayItems.map((item) => ({ label: item.name || 'Unnamed item', value: item.id || '' })).filter((row) => row.value),
                            ]}
                            onChange={(value) => setSmartImportReview((prev) => ({ ...prev, [parsed.id]: value }))}
                            placeholder="Match existing item"
                            menuStrategy="inline"
                          />
                        </View>
                      </View>
                      {match.matchedItem ? (
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-xs text-muted-foreground">Match: {match.matchedItem.name}</Text>
                          {match.confidenceLabel === 'review' ? (
                            <>
                              <AppButton
                                label={chosenId === match.matchedItemId ? 'Using Match' : 'Use Match'}
                                size="sm"
                                variant={chosenId === match.matchedItemId ? 'secondary' : 'outline'}
                                onPress={() => setSmartImportReview((prev) => ({ ...prev, [parsed.id]: match.matchedItemId || '' }))}
                              />
                              <AppButton
                                label={!chosenId ? 'Adding New' : 'Add New'}
                                size="sm"
                                variant={!chosenId ? 'secondary' : 'outline'}
                                onPress={() => setSmartImportReview((prev) => ({ ...prev, [parsed.id]: '' }))}
                              />
                            </>
                          ) : null}
                        </View>
                      ) : (
                        <Text className="text-xs text-muted-foreground">Will be added as a new item.</Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View className="flex-row flex-wrap justify-end gap-2">
            <AppButton label="Cancel" onPress={() => setSmartImportOpen(false)} variant="outline" />
            <AppButton label="Preview" onPress={previewSmartImport} variant="outline" />
            <AppButton
              label={applyingSmartImport ? 'Applying...' : smartImportMode === 'purchase' ? 'Apply Purchase Import' : 'Apply Import'}
              onPress={() => void applySmartImport()}
              textClassName="text-white"
              disabled={!smartImportMatches.length || applyingSmartImport}
            />
          </View>
        </View>
      </AppModal>

      <AppModal open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} title="Close Shopping List">
        <View className="gap-3">
          <Text className="text-sm text-muted-foreground">
            Close this shopping list now? Planned items missing from the purchase import will stay on the list as not purchased.
          </Text>
          <View className="flex-row justify-end gap-2">
            <AppButton label="Later" onPress={() => setCloseConfirmOpen(false)} variant="outline" />
            <AppButton
              label={closingList ? 'Closing...' : 'Close Shopping'}
              onPress={() => void closeSelectedShoppingList()}
              textClassName="text-white"
              disabled={closingList}
            />
          </View>
        </View>
      </AppModal>
    </View>
  );
}
