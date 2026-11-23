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
import { SHOPPING_UNITS, planCatalogWrite, searchCatalog, suggestCatalogMatches, type AddChoice } from '@/lib/rules/catalogMatch';
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

const UNIT_OPTIONS = [{ label: 'No unit', value: '' }, ...SHOPPING_UNITS.map((u) => ({ label: u, value: u }))];
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
  const isWide = width >= 768;
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
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
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

  useEffect(() => {
    if (!uid) return;
    return watchShoppingLists(uid, (rows) => {
      const periodScoped = rows.filter((row) => {
        const pid = String(row.periodId || '').trim();
        if (!pid) return true;
        return pid === targetPid;
      });
      setLists(periodScoped);
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

  useEffect(() => {
    setMobileActionsOpen(false);
  }, [selectedListId]);

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
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not record the expense.');
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

  const renderLists = () => (
    <AppCard className="flex-1 border-border bg-card dark:border-zinc-800 dark:bg-zinc-900 md:max-w-xs">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-foreground dark:text-zinc-50">Lists</Text>
        <IconActionButton icon="plus" label="New List" onPress={() => setCreateListOpen(true)} />
      </View>
      <ScrollView>
        {orderedLists.map((list) => {
          const count = listItemCounts[list.id || ''];
          const canDelete = count === 0;
          return (
            <View
              key={list.id}
              className={cn(
                'mb-2 flex-row items-center rounded-lg border',
                selectedListId === list.id
                  ? 'border-primary/30 bg-primary/10 dark:border-primary/40 dark:bg-primary/20'
                  : 'border-transparent bg-muted/30 dark:bg-zinc-800/40'
              )}
            >
              <Pressable
                onPress={() => {
                  setChefShareId('');
                  setSelectedListId(list.id || '');
                }}
                className="min-w-0 flex-1 p-3"
              >
                <Text className="font-medium text-foreground dark:text-zinc-100" numberOfLines={1}>{list.name}</Text>
                <Text className="text-xs text-muted-foreground dark:text-zinc-400">
                  {count === undefined ? 'Loading items...' : `${count} item${count === 1 ? '' : 's'}`}
                </Text>
              </Pressable>
              {canDelete ? (
                <View className="pr-2">
                  <IconActionButton icon="trash-can-outline" label="Delete empty list" variant="danger" onPress={() => void removeList(list)} />
                </View>
              ) : null}
            </View>
          );
        })}
        {sharedWithMe.length ? (
          <View className="mt-1 gap-2">
            <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Shared with you</Text>
            {sharedWithMe.map((share) => (
              <Pressable
                key={share.id}
                onPress={() => {
                  setSelectedListId('');
                  setChefShareId(share.id || '');
                }}
                className={cn(
                  'rounded-lg border p-3',
                  chefShareId === share.id
                    ? 'border-primary/30 bg-primary/10 dark:border-primary/40 dark:bg-primary/20'
                    : 'border-transparent bg-muted/30 dark:bg-zinc-800/40'
                )}
              >
                <Text className="font-medium text-foreground dark:text-zinc-100" numberOfLines={1}>{share.listName}</Text>
                <Text className="text-xs text-muted-foreground dark:text-zinc-400">Shared list</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
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
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
            <Pressable onPress={() => setSelectedListId('')} className="flex-row items-center gap-1">
              <MaterialCommunityIcons name="chevron-left" size={20} color="#717182" />
              <Text className="font-medium text-primary dark:text-blue-400">Lists</Text>
            </Pressable>
            {!completing ? (
              <AppButton
                label={mobileActionsOpen ? 'Hide Actions' : 'Show Actions'}
                onPress={() => setMobileActionsOpen((prev) => !prev)}
                variant="outline"
                size="sm"
              />
            ) : null}
            </View>
            {!completing && mobileActionsOpen ? (
              <View className="w-full flex-row flex-wrap justify-end gap-2">
                <AppButton label="Catalog" onPress={() => setImportOpen(true)} variant="outline" size="sm" className="w-[100px]" />
                <AppButton label="WhatsApp" onPress={() => openSmartImport('planned')} variant="outline" size="sm" className="w-[100px]" />
                <AppButton label="Reconcile" onPress={() => openSmartImport('purchase')} variant="outline" size="sm" className="w-[100px]" disabled={isShoppingListEmpty} />
                <AppButton label="Complete" onPress={startCompletion} variant="outline" size="sm" className="w-[100px]" disabled={isShoppingListEmpty} />
              </View>
            ) : null}
          </View>
        ) : null}

        <AppCard className="flex-1 border-border bg-card dark:border-zinc-800 dark:bg-zinc-900">
          <View className="mb-3 gap-3">
            <View className="min-w-0">
              <Text className="text-xl font-bold text-foreground dark:text-zinc-50">{selectedList.name}</Text>
              {!completing ? (
                <View>
                  <Text className="text-xs font-medium text-muted-foreground">
                    List total: {fmtMoney(estimatedTotal)}
                  </Text>
                  <Text className="text-xs font-medium text-muted-foreground">
                    Selected total: {fmtMoney(selectedTotal)} ({selectedItems.length} item{selectedItems.length === 1 ? '' : 's'})
                  </Text>
                  <View className="mt-1 flex-row flex-wrap items-center gap-2">
                    <AppButton
                      label="Add receipt"
                      variant="outline"
                      size="sm"
                      disabled={isShoppingListEmpty}
                      onPress={() => {
                        setReceiptNotice('');
                        setReceiptOpen(true);
                      }}
                    />
                    {selectedList.shareId ? (
                      <>
                        <Text className="text-xs font-medium text-muted-foreground">Shared with {selectedList.sharedWithLabel || 'chef'}</Text>
                        <AppButton label="Revoke" variant="outline" size="sm" onPress={() => void revokeSelectedShare()} />
                      </>
                    ) : (
                      <AppButton
                        label="Share with chef"
                        variant="outline"
                        size="sm"
                        onPress={() => {
                          setShareError('');
                          setShareOpen(true);
                        }}
                      />
                    )}
                  </View>
                  {receiptNotice ? <Text className="text-xs font-medium text-muted-foreground">{receiptNotice}</Text> : null}
                  {selectedMissingUnitPriceCount > 0 ? (
                    <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {selectedMissingUnitPriceCount} selected item{selectedMissingUnitPriceCount === 1 ? '' : 's'} missing unit price
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
            {isWide && !completing ? (
              <View className="flex-row flex-wrap gap-2">
                <AppButton label="Import Catalog" onPress={() => setImportOpen(true)} variant="outline" size="sm" className="min-w-[118px]" />
                <AppButton label="Import from WhatsApp" onPress={() => openSmartImport('planned')} variant="outline" size="sm" className="min-w-[170px]" />
                <AppButton label="Reconcile Purchases" onPress={() => openSmartImport('purchase')} variant="outline" size="sm" className="min-w-[168px]" disabled={isShoppingListEmpty} />
                <AppButton label="Complete" onPress={startCompletion} variant="outline" size="sm" className="min-w-[94px]" disabled={isShoppingListEmpty} />
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
                        <Switch value={Boolean(item.bought)} onValueChange={() => toggleBought(item)} accessibilityLabel={`${item.bought ? 'Got it' : 'To buy'}: ${item.name}`} />
                        <Pressable className="flex-1 py-1" onPress={() => openTagEdit(item)}>
                          <View className="flex-row flex-wrap items-center gap-1">
                            <Text
                              className={cn(
                                'text-foreground dark:text-zinc-100',
                                item.bought && 'text-muted-foreground line-through dark:text-zinc-500'
                              )}
                            >
                              {item.name} {item.quantity && (item.quantity > 1 || item.unit) ? `(x${item.quantity}${item.unit ? ` ${item.unit}` : ''})` : ''}
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
                        <IconActionButton icon="pencil-outline" label="Edit item" onPress={() => openEditItem(item)} />
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
                Fill quantity, total amount, and budget item for each {completionScopeLabel}, then review the date and account and record the expense.
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
                  const input = itemInputs[item.id];
                  const qtyMissing = !parseQuantity(input?.quantity || '0');
                  const priceMissing = Math.max(0, parseMoney(input?.price || '0')) <= 0;
                  const planItemId = String(input?.planItemId || '').trim();
                  const budgetMissing = !planItemId || !planById.has(planItemId);
                  const budgetNotFunded = !budgetMissing && !hasFundedAmount(fundedByPlanId, planItemId);
                  const rowHasIssue = qtyMissing || priceMissing || budgetMissing || budgetNotFunded;
                  return (
                    <View
                      key={item.id}
                      className={cn(
                        'gap-2 border-b border-border p-3 dark:border-zinc-800',
                        rowHasIssue && 'border-l-4 border-l-amber-400 bg-amber-50/70 dark:border-l-amber-500 dark:bg-amber-950/20',
                        budgetNotFunded && 'border-l-red-500 bg-red-50/70 dark:border-l-red-400 dark:bg-red-950/20'
                      )}
                    >
                      <View className="flex-row flex-wrap items-center gap-1.5">
                        <Text className="text-foreground dark:text-zinc-100" numberOfLines={1}>
                          {item.name}
                        </Text>
                        {itemTag ? <Text className="text-xs text-muted-foreground dark:text-zinc-400">[{itemTag}]</Text> : null}
                        {qtyMissing ? (
                          <Text className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/50 dark:text-amber-100">
                            Qty
                          </Text>
                        ) : null}
                        {priceMissing ? (
                          <Text className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/50 dark:text-amber-100">
                            Total
                          </Text>
                        ) : null}
                        {budgetMissing ? (
                          <Text className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/50 dark:text-amber-100">
                            Budget
                          </Text>
                        ) : null}
                        {budgetNotFunded ? (
                          <Text className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800 dark:bg-red-900/50 dark:text-red-100">
                            Not funded
                          </Text>
                        ) : null}
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
                          className={cn(
                            'h-9 text-center',
                            isWide ? 'w-20' : 'w-full',
                            qtyMissing && 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/20'
                          )}
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
                          className={cn(
                            'h-9 text-right',
                            isWide ? 'w-28' : 'w-full',
                            priceMissing && 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/20'
                          )}
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
                            triggerClassName={cn(
                              budgetMissing && 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/20',
                              budgetNotFunded && 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-950/20'
                            )}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View className="mb-3 gap-2 rounded-md border border-border p-3 dark:border-zinc-800">
                <Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Review expense</Text>
                <View className={cn('gap-2', isWide ? 'flex-row items-center' : '')}>
                  <AppInput
                    value={expenseDate}
                    onChangeText={setExpenseDate}
                    placeholder="YYYY-MM-DD"
                    accessibilityLabel="Expense date"
                    className={cn('h-9', isWide ? 'w-28' : 'w-full')}
                  />
                  <View className="flex-1">
                    <DropdownField
                      value={expenseAccountId}
                      options={[{ label: 'Select account', value: '' }, ...accounts.map((row) => ({ label: row.name, value: row.id || '' }))]}
                      onChange={setExpenseAccountId}
                      placeholder="Account"
                      menuStrategy="inline"
                    />
                  </View>
                </View>
                <Text className="text-xs font-medium text-muted-foreground">
                  {expenseReview.ready
                    ? `Posts to ${expenseReview.periodLabel} · ${expenseReview.accountName} · ${fmtMoney(expenseTotal)}`
                    : expenseReview.problem}
                </Text>
              </View>

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
                  label={finalizingCompletion ? 'Recording...' : 'Record expense'}
                  onPress={() => {
                    void handleRecordExpense();
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
        {(!selectedListId && !chefShareId) || isWide ? renderLists() : null}
        {chefShareId ? (
          <SharedListView shareId={chefShareId} myUid={myUid} onBack={() => setChefShareId('')} />
        ) : selectedListId || isWide ? (
          renderItems()
        ) : null}
      </View>

      <AppModal open={addOpen} onClose={() => setAddOpen(false)} title="Add Item">
        <View className="gap-3">
          <AppInput
            value={addDraft.name}
            onChangeText={(value) => setAddDraft((prev) => ({ ...prev, name: value, choice: '' }))}
            placeholder="Item name"
            accessibilityLabel="Item name"
          />
          <View className="flex-row gap-2">
            <AppInput
              value={addDraft.quantity}
              onChangeText={(value) => setAddDraft((prev) => ({ ...prev, quantity: value }))}
              placeholder="Qty"
              keyboardType="numeric"
              accessibilityLabel="Quantity"
              className="w-20 text-center"
            />
            <View className="flex-1">
              <DropdownField value={addDraft.unit} options={UNIT_OPTIONS} onChange={(value) => setAddDraft((prev) => ({ ...prev, unit: value }))} placeholder="Unit" menuStrategy="inline" />
            </View>
          </View>
          <DropdownField value={addDraft.category} options={addCategoryOptions} onChange={(value) => setAddDraft((prev) => ({ ...prev, category: value }))} placeholder="Category" menuStrategy="inline" />
          <AppInput
            value={addDraft.note}
            onChangeText={(value) => setAddDraft((prev) => ({ ...prev, note: value }))}
            placeholder="Note (optional)"
            accessibilityLabel="Note"
          />
          {addCandidates.length ? (
            <View className="gap-2 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-950/20">
              <Text className="text-xs font-semibold text-amber-700 dark:text-amber-200">Already in your catalog?</Text>
              {addCandidates.map((match) => {
                const chosen = addDraft.choice === `use:${match.item.id}`;
                return (
                  <View key={match.item.id} className="flex-row flex-wrap items-center justify-between gap-2">
                    <Text className="min-w-0 flex-1 text-xs text-amber-700 dark:text-amber-200">
                      {match.item.name}
                      {match.packDiffers ? ' · different pack' : match.reason === 'alias' ? ' · other spelling' : ''}
                    </Text>
                    <AppButton
                      label={chosen ? 'Using this' : 'Use existing'}
                      size="sm"
                      variant={chosen ? 'primary' : 'outline'}
                      textClassName={chosen ? 'text-white' : undefined}
                      onPress={() => setAddDraft((prev) => ({ ...prev, choice: `use:${match.item.id}` }))}
                    />
                  </View>
                );
              })}
              <AppButton
                label={addDraft.choice === 'keep' ? 'Keeping separate' : 'Keep separate'}
                size="sm"
                variant={addDraft.choice === 'keep' ? 'primary' : 'outline'}
                textClassName={addDraft.choice === 'keep' ? 'text-white' : undefined}
                onPress={() => setAddDraft((prev) => ({ ...prev, choice: 'keep' }))}
              />
            </View>
          ) : null}
          {!addDraft.choice.startsWith('use:') ? (
            <View className="flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 text-sm text-foreground dark:text-zinc-100">Save to catalog for next time</Text>
              <Switch
                value={addDraft.saveToCatalog}
                onValueChange={(value) => setAddDraft((prev) => ({ ...prev, saveToCatalog: value }))}
                accessibilityLabel="Save to catalog"
              />
            </View>
          ) : null}
          {!addDraft.saveToCatalog && !addDraft.choice.startsWith('use:') ? (
            <Text className="text-xs text-muted-foreground">List only: the catalog stays unchanged.</Text>
          ) : null}
          {addError ? <Text className="text-xs text-destructive">{addError}</Text> : null}
          <View className="flex-row gap-2">
            <AppButton label="Cancel" variant="outline" className="flex-1" onPress={() => setAddOpen(false)} />
            <AppButton
              label="Add to list"
              className="flex-1"
              textClassName="text-white"
              disabled={addCandidates.length > 0 && !addDraft.choice}
              onPress={() => void submitAddItem()}
            />
          </View>
        </View>
      </AppModal>

      <AppModal open={shareOpen} onClose={() => !sharing && setShareOpen(false)} title="Share List with Chef">
        <View className="gap-3">
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">
            The chef signs in with their own account and can add, edit and check off items on this list only. Prices, budgets, accounts, receipts and other lists stay private.
          </Text>
          <AppInput
            value={shareDraft.chefUid}
            onChangeText={(value) => setShareDraft((prev) => ({ ...prev, chefUid: value }))}
            placeholder="Chef's Collaborator ID (from their Settings)"
            autoCapitalize="none"
            accessibilityLabel="Chef account ID"
          />
          <AppInput
            value={shareDraft.label}
            onChangeText={(value) => setShareDraft((prev) => ({ ...prev, label: value }))}
            placeholder="Name to show (e.g. Chef)"
            accessibilityLabel="Chef name"
          />
          {shareError ? <Text className="text-xs text-destructive">{shareError}</Text> : null}
          <View className="flex-row gap-2">
            <AppButton label="Cancel" variant="outline" className="flex-1" onPress={() => setShareOpen(false)} disabled={sharing} />
            <AppButton label={sharing ? 'Sharing...' : 'Share'} className="flex-1" textClassName="text-white" onPress={() => void submitShare()} disabled={sharing} />
          </View>
        </View>
      </AppModal>

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

      <AppModal open={Boolean(deleteListDraft)} onClose={() => !deletingList && setDeleteListDraft(null)} title="Delete Shopping List">
        <View className="gap-4">
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">
            Delete empty list "{deleteListDraft?.name || ''}"?
          </Text>
          <View className="flex-row gap-2">
            <AppButton label="Cancel" onPress={() => setDeleteListDraft(null)} variant="outline" className="flex-1" disabled={deletingList} />
            <AppButton
              label={deletingList ? 'Deleting...' : 'Delete'}
              onPress={confirmDeleteList}
              variant="destructive"
              className="flex-1"
              disabled={deletingList}
            />
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
            <Text className="text-xs text-muted-foreground">Unit</Text>
            <DropdownField value={editDraft.unit} options={UNIT_OPTIONS} onChange={(value) => setEditDraft((prev) => ({ ...prev, unit: value }))} placeholder="Unit" menuStrategy="inline" />
          </View>
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">Category</Text>
            <DropdownField value={editDraft.category} options={addCategoryOptions} onChange={(value) => setEditDraft((prev) => ({ ...prev, category: value }))} placeholder="Category" menuStrategy="inline" />
          </View>
          <View className="gap-1">
            <Text className="text-xs text-muted-foreground">Note</Text>
            <AppInput
              value={editDraft.note}
              onChangeText={(value) => setEditDraft((prev) => ({ ...prev, note: value }))}
              placeholder="Note (optional)"
              accessibilityLabel="Edit note"
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
            placeholder="1 to 20 characters"
            maxLength={20}
          />
          <Text className="text-xs text-muted-foreground">{normalizeItemTag(tagDraft.tag).length}/20</Text>
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
