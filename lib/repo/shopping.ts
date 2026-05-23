import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group } from './periods';
import { docMatchesActiveScope, withWorkspaceWrite } from './scope';
import type { CloseShoppingOptions, ShoppingImportBatch, ShoppingItemMatchResult } from '@/lib/shopping/import/shoppingImportTypes';

export type ShoppingList = {
  id?: string;
  name: string;
  status?: 'open' | 'closed' | 'completed';
  plannedTotal?: number;
  actualTotal?: number;
  variance?: number;
  closedAt?: unknown;
  closedBy?: string;
  archived?: boolean;
  workspaceId?: string;
  periodId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ShoppingListItem = {
  id?: string;
  name: string;
  quantity?: number;
  price?: number;
  category?: string;
  ownerUid?: string;
  tags?: string[];
  tag?: string;
  bought?: boolean;
  status?: 'planned' | 'purchased' | 'not_purchased';
  actualPrice?: number;
  actualQuantity?: number;
  isUnplanned?: boolean;
  source?: 'manual' | 'whatsapp_import' | 'purchase_import';
  importBatchId?: string;
  cost?: number;
  completed?: boolean;
  note?: string;
  assignedPeriodId?: string;
  assignedPlanItemId?: string;
  assignedPlanItemName?: string;
  assignedGroup?: Group;
  assignedTxId?: string;
  workspaceId?: string;
  periodId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ShoppingCatalogItem = {
  id?: string;
  name: string;
  category?: string;
  tags?: string[];
  lastPrice?: number;
  assignedPlanItemId?: string;
  assignedPlanItemName?: string;
  assignedGroup?: Group;
  workspaceId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ShoppingCategory = {
  id?: string;
  name: string;
  workspaceId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function shoppingListsCol(uid: string) {
  return collection(db, 'users', uid, 'shoppingLists');
}

export function shoppingItemsCol(uid: string, listId: string) {
  return collection(db, 'users', uid, 'shoppingLists', listId, 'items');
}

export function shoppingCatalogCol(uid: string) {
  return collection(db, 'users', uid, 'shoppingCatalog');
}

export function shoppingCategoriesCol(uid: string) {
  return collection(db, 'users', uid, 'shoppingCategories');
}

export function shoppingImportBatchesCol(uid: string, listId: string) {
  return collection(db, 'users', uid, 'shoppingLists', listId, 'importBatches');
}

function compactFields<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) out[key] = value;
  });
  return out as Partial<T>;
}

function removeUndefinedDeep<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((value) => removeUndefinedDeep(value)).filter((value) => value !== undefined) as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      if (value === undefined) return;
      out[key] = removeUndefinedDeep(value);
    });
    return out as T;
  }
  return input;
}

function normalizeCategory(input?: string) {
  const value = String(input || '').trim();
  return value || '';
}

function normalizeTags(input?: string[]) {
  return Array.isArray(input) ? input.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean) : [];
}

function normalizeItemTag(input?: string) {
  if (input === undefined) return undefined;
  const value = String(input || '').trim();
  if (!value) return '';
  if (value.length < 1 || value.length > 10) {
    throw new Error('Item tag must be 1 to 10 characters.');
  }
  return value;
}

function normalizeItemName(input?: string) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeGroup(input?: Group) {
  const value = String(input || '').trim();
  if (!value) return undefined;
  if (value === 'NEED' || value === 'WANT' || value === 'SAVINGS_DEBT') return value;
  return value as Group;
}

async function assertShoppingListItemNameAvailable(uid: string, listId: string, name: string, excludeId?: string) {
  const normalizedName = normalizeItemName(name);
  if (!normalizedName) throw new Error('Item name is required.');

  const snap = await getDocs(shoppingItemsCol(uid, listId));
  for (const row of snap.docs) {
    if (excludeId && row.id === excludeId) continue;
    const data = row.data() as Omit<ShoppingListItem, 'id'>;
    if (!docMatchesActiveScope(data as any)) continue;
    if (normalizeItemName(data.name) !== normalizedName) continue;
    throw new Error('Item already exists in this shopping list.');
  }
}

function catalogDocId(name: string) {
  return encodeURIComponent(name.trim().toLowerCase()).replace(/%/g, '_').slice(0, 180);
}

function parseCsvRecord(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function watchShoppingLists(uid: string, cb: (rows: ShoppingList[]) => void) {
  const q = query(shoppingListsCol(uid));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingList[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ShoppingList, 'id'>) };
      if (!docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    cb(rows);
  });
}

export function watchShoppingListItems(uid: string, listId: string, cb: (rows: ShoppingListItem[]) => void) {
  const q = query(shoppingItemsCol(uid, listId));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingListItem[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ShoppingListItem, 'id'>) };
      if (!docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    cb(rows);
  });
}

export async function addShoppingList(uid: string, name: string, periodId?: string) {
  return addDoc(shoppingListsCol(uid), withWorkspaceWrite({
    name: name.trim(),
    periodId: String(periodId || '').trim(),
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
}

export async function updateShoppingList(uid: string, id: string, patch: Partial<ShoppingList>) {
  return updateDoc(doc(shoppingListsCol(uid), id), withWorkspaceWrite({
    ...patch,
    updatedAt: serverTimestamp(),
  } as Partial<ShoppingList>));
}

export async function deleteShoppingList(uid: string, id: string) {
  const itemsSnap = await getDocs(shoppingItemsCol(uid, id));
  for (const item of itemsSnap.docs) {
    await deleteDoc(item.ref);
  }
  return deleteDoc(doc(shoppingListsCol(uid), id));
}

export async function listShoppingLists(uid: string) {
  const snap = await getDocs(shoppingListsCol(uid));
  const rows: ShoppingList[] = [];
  snap.forEach((d) => {
    const row = { id: d.id, ...(d.data() as Omit<ShoppingList, 'id'>) };
    if (!docMatchesActiveScope(row as any)) return;
    rows.push(row);
  });
  return rows;
}

export async function listShoppingListItems(uid: string, listId: string) {
  const snap = await getDocs(shoppingItemsCol(uid, listId));
  const rows: ShoppingListItem[] = [];
  snap.forEach((d) => {
    const row = { id: d.id, ...(d.data() as Omit<ShoppingListItem, 'id'>) };
    if (!docMatchesActiveScope(row as any)) return;
    rows.push(row);
  });
  return rows;
}

export async function addShoppingListItem(
  uid: string,
  listId: string,
  input: Omit<ShoppingListItem, 'id' | 'createdAt' | 'updatedAt'>
) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Item name is required.');
  await assertShoppingListItemNameAvailable(uid, listId, name);
  const price = Math.max(0, Number(input.price || 0));
  const tag = normalizeItemTag(input.tag);
  return addDoc(
    shoppingItemsCol(uid, listId),
    withWorkspaceWrite(
      compactFields({
        ...input,
        ownerUid: uid,
        name,
        quantity: Math.max(1, Number(input.quantity || 1)),
        price,
        category: normalizeCategory(input.category),
        tags: normalizeTags(input.tags),
        ...(tag !== undefined ? { tag } : {}),
        bought: input.bought === true,
        completed: input.completed === true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }) as any
    )
  );
}

export async function updateShoppingListItem(uid: string, listId: string, id: string, patch: Partial<ShoppingListItem>) {
  const name =
    patch.name === undefined
      ? undefined
      : String(patch.name || '').trim();
  if (name !== undefined) {
    if (!name) throw new Error('Item name is required.');
    await assertShoppingListItemNameAvailable(uid, listId, name, id);
  }
  const tags = Array.isArray(patch.tags) ? normalizeTags(patch.tags) : patch.tags;
  const tag = patch.tag === undefined ? undefined : normalizeItemTag(patch.tag);
  const quantity =
    patch.quantity === undefined ? undefined : Math.max(1, Number(patch.quantity || 1));
  const price =
    patch.price === undefined ? undefined : Math.max(0, Number(patch.price || 0));
  const category =
    patch.category === undefined ? undefined : normalizeCategory(patch.category);
  return updateDoc(
    doc(shoppingItemsCol(uid, listId), id),
    withWorkspaceWrite(
      compactFields({
        ...patch,
        ...(name !== undefined ? { name } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        ...(price !== undefined ? { price } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(tags ? { tags } : {}),
        ...(tag !== undefined ? { tag } : {}),
        updatedAt: serverTimestamp(),
      }) as any
    )
  );
}

export async function deleteShoppingListItem(uid: string, listId: string, id: string) {
  return deleteDoc(doc(shoppingItemsCol(uid, listId), id));
}

function parsedItemTotal(match: ShoppingItemMatchResult) {
  const parsed = match.parsedItem;
  if (parsed.totalPrice !== undefined) return Math.max(0, Number(parsed.totalPrice || 0));
  if (parsed.unitPrice !== undefined) return Math.max(0, Number(parsed.unitPrice || 0)) * Math.max(1, Number(parsed.quantity || 1));
  return 0;
}

function importItemPatch(match: ShoppingItemMatchResult, mode: ShoppingImportBatch['mode'], importBatchId: string): Partial<ShoppingListItem> {
  const parsed = match.parsedItem;
  const total = parsedItemTotal(match);
  const quantity = Math.max(1, Number(parsed.quantity || match.matchedItem?.quantity || 1));
  const unitPrice = parsed.unitPrice || (total > 0 ? total / quantity : match.matchedItem?.price || 0);
  if (mode === 'purchase') {
    return compactFields({
      name: match.matchedItem?.name || parsed.name,
      actualPrice: total,
      actualQuantity: quantity,
      quantity,
      price: unitPrice,
      cost: total,
      bought: true,
      completed: true,
      status: 'purchased',
      source: match.matchedItem ? match.matchedItem.source : 'purchase_import',
      importBatchId,
    } as Partial<ShoppingListItem>) as Partial<ShoppingListItem>;
  }

  return compactFields({
    name: match.matchedItem?.name || parsed.name,
    quantity,
    price: unitPrice,
    cost: total || match.matchedItem?.cost || 0,
    bought: match.matchedItem?.bought === true,
    completed: match.matchedItem?.completed === true,
    status: match.matchedItem?.status || 'planned',
    source: match.matchedItem ? match.matchedItem.source : 'whatsapp_import',
    importBatchId,
  } as Partial<ShoppingListItem>) as Partial<ShoppingListItem>;
}

export async function applyShoppingImportBatch(
  uid: string,
  listId: string,
  importBatch: Omit<ShoppingImportBatch, 'id' | 'createdAt' | 'appliedAt'>,
  reviewedMatches?: Record<string, string>
) {
  const batchRef = doc(shoppingImportBatchesCol(uid, listId));
  const batch = writeBatch(db);

  batch.set(
    batchRef,
    removeUndefinedDeep(
      withWorkspaceWrite({
        ...importBatch,
        createdAt: serverTimestamp(),
        appliedAt: serverTimestamp(),
      } as any)
    )
  );

  const currentItems = await listShoppingListItems(uid, listId);
  const usedExistingIds = new Set<string>();

  importBatch.matches.forEach((match) => {
    const reviewedId = reviewedMatches?.[match.parsedItem.id];
    const targetId = reviewedId || (match.confidenceLabel === 'auto' ? match.matchedItemId : undefined);
    const target = targetId ? currentItems.find((item) => item.id === targetId) : undefined;
    const effectiveMatch = target
      ? { ...match, matchedItem: target, matchedItemId: target.id, confidenceLabel: 'auto' as const }
      : match;
    const patch = importItemPatch(effectiveMatch, importBatch.mode, batchRef.id);

    if (target?.id && !usedExistingIds.has(target.id)) {
      usedExistingIds.add(target.id);
      batch.update(doc(shoppingItemsCol(uid, listId), target.id), withWorkspaceWrite({ ...patch, updatedAt: serverTimestamp() } as any));
      return;
    }

    const newRef = doc(shoppingItemsCol(uid, listId));
    batch.set(
      newRef,
      withWorkspaceWrite({
        ...patch,
        ownerUid: uid,
        name: match.parsedItem.name,
        quantity: match.parsedItem.quantity || 1,
        price: patch.price || 0,
        category: '',
        tags: [],
        bought: importBatch.mode === 'purchase',
        completed: importBatch.mode === 'purchase',
        status: importBatch.mode === 'purchase' ? 'purchased' : 'planned',
        isUnplanned: importBatch.mode === 'purchase',
        source: importBatch.mode === 'purchase' ? 'purchase_import' : 'whatsapp_import',
        importBatchId: batchRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any)
    );
  });

  await batch.commit();
  return batchRef.id;
}

export async function closeShoppingList(uid: string, listId: string, options: CloseShoppingOptions) {
  const rows = await listShoppingListItems(uid, listId);
  const plannedTotal = rows.reduce((sum, item) => {
    if (item.isUnplanned) return sum;
    return sum + Math.max(0, Number(item.price || 0)) * Math.max(1, Number(item.quantity || 1));
  }, 0);
  const actualTotal = rows.reduce((sum, item) => {
    if (item.status !== 'purchased' && !item.bought) return sum;
    const actual = Number(item.actualPrice ?? item.cost ?? 0);
    return sum + Math.max(0, actual);
  }, 0);
  const purchasedIds = new Set(rows.filter((item) => item.status === 'purchased' || item.bought).map((item) => item.id).filter(Boolean));
  const batch = writeBatch(db);

  rows.forEach((item) => {
    if (!item.id || purchasedIds.has(item.id)) return;
    batch.update(doc(shoppingItemsCol(uid, listId), item.id), withWorkspaceWrite({
      status: 'not_purchased',
      bought: false,
      completed: false,
      updatedAt: serverTimestamp(),
    } as any));
  });

  batch.update(doc(shoppingListsCol(uid), listId), withWorkspaceWrite({
    status: 'closed',
    plannedTotal,
    actualTotal,
    variance: actualTotal - plannedTotal,
    closedAt: serverTimestamp(),
    closedBy: options.closedBy,
    updatedAt: serverTimestamp(),
  } as any));

  await batch.commit();
  return { plannedTotal, actualTotal, variance: actualTotal - plannedTotal };
}

export function watchShoppingCatalog(uid: string, cb: (rows: ShoppingCatalogItem[]) => void) {
  const q = query(shoppingCatalogCol(uid));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingCatalogItem[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ShoppingCatalogItem, 'id'>) };
      if (!docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    cb(rows);
  });
}

export async function upsertShoppingCatalogItem(
  uid: string,
  input: Omit<ShoppingCatalogItem, 'id' | 'createdAt' | 'updatedAt'> & { price?: number; quantity?: number }
) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Shopping item name is required.');
  const id = catalogDocId(name);
  const category = normalizeCategory(input.category);
  const tags = normalizeTags(input.tags);
  const assignedPlanItemId = String(input.assignedPlanItemId || '').trim();
  const assignedPlanItemName = String(input.assignedPlanItemName || '').trim();
  const assignedGroup = normalizeGroup(input.assignedGroup);
  const storedAssignedGroup = assignedPlanItemId ? assignedGroup ?? null : null;
  
  const docRef = doc(shoppingCatalogCol(uid), id);
  await setDoc(
    docRef,
    withWorkspaceWrite(
      compactFields({
        name,
        category,
        tags,
        lastPrice: input.price,
        assignedPlanItemId,
        assignedPlanItemName,
        assignedGroup: storedAssignedGroup as any,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
    ),
    { merge: true }
  );

  if (input.price !== undefined) {
    await addDoc(collection(docRef, 'priceHistory'), {
      price: input.price,
      quantity: input.quantity || 1,
      createdAt: serverTimestamp(),
    });
  }

  return id;
}

export async function updateShoppingCatalogItem(uid: string, id: string, patch: Partial<ShoppingCatalogItem>) {
  const tags = patch.tags ? normalizeTags(patch.tags) : patch.tags;
  const category = patch.category !== undefined ? normalizeCategory(patch.category) : undefined;
  const assignedPlanItemId =
    patch.assignedPlanItemId !== undefined ? String(patch.assignedPlanItemId || '').trim() : undefined;
  const assignedPlanItemName =
    patch.assignedPlanItemName !== undefined ? String(patch.assignedPlanItemName || '').trim() : undefined;
  const assignedGroup = patch.assignedGroup !== undefined ? normalizeGroup(patch.assignedGroup) ?? null : undefined;
  const normalizedAssignedGroup =
    assignedPlanItemId !== undefined && !assignedPlanItemId ? null : assignedGroup;
  return updateDoc(
    doc(shoppingCatalogCol(uid), id),
    withWorkspaceWrite(
      compactFields({
        ...patch,
        ...(tags ? { tags } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(assignedPlanItemId !== undefined ? { assignedPlanItemId } : {}),
        ...(assignedPlanItemName !== undefined ? { assignedPlanItemName } : {}),
        ...(normalizedAssignedGroup !== undefined ? { assignedGroup: normalizedAssignedGroup as any } : {}),
        updatedAt: serverTimestamp(),
      }) as any
    )
  );
}

export async function deleteShoppingCatalogItem(uid: string, id: string) {
  return deleteDoc(doc(shoppingCatalogCol(uid), id));
}

export function watchShoppingCategories(uid: string, cb: (rows: ShoppingCategory[]) => void) {
  const q = query(shoppingCategoriesCol(uid));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingCategory[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ShoppingCategory, 'id'>) };
      if (!docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    cb(rows);
  });
}

export async function addShoppingCategory(uid: string, name: string) {
  const clean = normalizeCategory(name);
  if (!clean) throw new Error('Category name is required.');
  const id = catalogDocId(clean);
  await setDoc(
    doc(shoppingCategoriesCol(uid), id),
    withWorkspaceWrite({
      name: clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
  return id;
}

export async function deleteShoppingCategory(uid: string, id: string) {
  return deleteDoc(doc(shoppingCategoriesCol(uid), id));
}

export const shoppingCatalogCsvHeader = 'name,category,tags,budgetItemName';
const shoppingCatalogCsvLegacyHeader = 'name,category,tags';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildShoppingCatalogCsv(rows: ShoppingCatalogItem[]) {
  const lines = [shoppingCatalogCsvHeader];
  rows.forEach((row) => {
    lines.push(
      [
        row.name || '',
        row.category || '',
        (row.tags || []).join('|'),
        row.assignedPlanItemName || '',
      ].map(csvCell).join(',')
    );
  });
  return `${lines.join('\n')}\n`;
}

export function parseShoppingCatalogCsv(csvText: string): Omit<ShoppingCatalogItem, 'id' | 'createdAt' | 'updatedAt'>[] {
  const rawLines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rawLines.length) return [];
  const [headerRaw, ...lines] = rawLines;
  const header = headerRaw.replace(/^\uFEFF/, '');
  const headerNormalized = header.toLowerCase();
  const isLegacy = headerNormalized === shoppingCatalogCsvLegacyHeader.toLowerCase();
  if (headerNormalized !== shoppingCatalogCsvHeader.toLowerCase() && !isLegacy) {
    throw new Error(
      `Invalid CSV header. Expected:\n${shoppingCatalogCsvHeader}\n(legacy supported: ${shoppingCatalogCsvLegacyHeader})`
    );
  }

  return lines.map((line, idx) => {
    const [nameRaw, categoryRaw, tagsRaw, budgetItemNameRaw] = parseCsvRecord(line);
    const name = String(nameRaw || '').trim();
    if (!name) throw new Error(`Line ${idx + 2}: name is required`);
    const tags = String(tagsRaw || '')
      .split('|')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const assignedPlanItemName = String(budgetItemNameRaw || '').trim();
    return {
      name,
      category: normalizeCategory(categoryRaw),
      tags,
      assignedPlanItemName,
    };
  });
}

export async function importShoppingCatalogCsv(uid: string, csvText: string) {
  const rows = parseShoppingCatalogCsv(csvText);
  for (const row of rows) {
    await upsertShoppingCatalogItem(uid, row);
    if (row.category) await addShoppingCategory(uid, row.category);
  }
  return rows.length;
}

export type PriceHistoryEntry = {
  id: string;
  price: number;
  quantity: number;
  createdAt: number; // millis
};

export function watchPriceHistory(uid: string, itemId: string, cb: (rows: PriceHistoryEntry[]) => void) {
  const q = query(collection(db, 'users', uid, 'shoppingCatalog', itemId, 'priceHistory'));
  return onSnapshot(q, (snap) => {
    const rows: PriceHistoryEntry[] = [];
    snap.forEach((d) => {
      const data = d.data();
      rows.push({
        id: d.id,
        price: data.price ?? 0,
        quantity: data.quantity ?? 1,
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
      });
    });
    rows.sort((a, b) => a.createdAt - b.createdAt);
    cb(rows);
  });
}

export async function backfillShoppingCatalogFromLists(uid: string) {
  const lists = await listShoppingLists(uid);
  let count = 0;
  for (const list of lists) {
    if (!list.id) continue;
    const rows = await listShoppingListItems(uid, list.id);
    for (const row of rows) {
      if (!row.name?.trim()) continue;
      await upsertShoppingCatalogItem(uid, {
        name: row.name,
        category: row.category || '',
        tags: row.tags || [],
        assignedPlanItemId: row.assignedPlanItemId || '',
        assignedPlanItemName: row.assignedPlanItemName || '',
        assignedGroup: row.assignedGroup,
      });
      if (row.category?.trim()) await addShoppingCategory(uid, row.category);
      count += 1;
    }
  }
  return count;
}
