import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group } from './periods';
import { docMatchesActiveScope, withWorkspaceWrite } from './scope';

export type ShoppingListVisibility = 'PRIVATE' | 'PUBLIC';

export type ShoppingList = {
  id?: string;
  name: string;
  archived?: boolean;
  visibility?: ShoppingListVisibility;
  ownerUid?: string;
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

function publicShoppingListsCol() {
  return collection(db, 'publicShoppingLists');
}

function publicShoppingOwnersCol() {
  return collection(db, 'publicShoppingOwners');
}

function publicShoppingListDocId(ownerUid: string, listId: string) {
  return `${ownerUid}__${listId}`;
}

function compactFields<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) out[key] = value;
  });
  return out as Partial<T>;
}

function normalizeCategory(input?: string) {
  const value = String(input || '').trim();
  return value || '';
}

function normalizeShoppingListVisibility(input?: ShoppingListVisibility | string) {
  const value = String(input || '').trim().toUpperCase();
  if (value === 'PUBLIC') return 'PUBLIC' as const;
  return 'PRIVATE' as const;
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

type ShoppingListScopeOptions = {
  skipScopeFilter?: boolean;
};

function withShoppingListItemWriteScope<T extends Record<string, unknown>>(
  input: T,
  options?: ShoppingListScopeOptions
): T {
  if (options?.skipScopeFilter) return input;
  return withWorkspaceWrite(input) as T;
}

async function assertShoppingListItemNameAvailable(
  uid: string,
  listId: string,
  name: string,
  excludeId?: string,
  options?: ShoppingListScopeOptions
) {
  const normalizedName = normalizeItemName(name);
  if (!normalizedName) throw new Error('Item name is required.');

  const snap = await getDocs(shoppingItemsCol(uid, listId));
  for (const row of snap.docs) {
    if (excludeId && row.id === excludeId) continue;
    const data = row.data() as Omit<ShoppingListItem, 'id'>;
    if (!options?.skipScopeFilter && !docMatchesActiveScope(data as any)) continue;
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

function sortShoppingListsByNameThenId(rows: ShoppingList[]) {
  rows.sort((a, b) => {
    const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
    if (nameCompare !== 0) return nameCompare;
    const ownerCompare = String(a.ownerUid || '').localeCompare(String(b.ownerUid || ''));
    if (ownerCompare !== 0) return ownerCompare;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'toMillis' in (value as any)) {
    const millis = (value as any).toMillis?.();
    return typeof millis === 'number' && Number.isFinite(millis) ? millis : 0;
  }
  return 0;
}

function dedupeShoppingListsByOwnerAndName(rows: ShoppingList[]) {
  const byKey = new Map<string, ShoppingList>();
  rows.forEach((row) => {
    const ownerUid = String(row.ownerUid || '').trim();
    const nameKey = String(row.name || '').trim().toLowerCase();
    const key = `${ownerUid}::${nameKey}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      return;
    }
    const prevMillis = toMillis(prev.updatedAt) || toMillis(prev.createdAt);
    const nextMillis = toMillis(row.updatedAt) || toMillis(row.createdAt);
    if (nextMillis >= prevMillis) byKey.set(key, row);
  });
  return Array.from(byKey.values());
}

async function upsertPublicShoppingList(uid: string, listId: string, name: string) {
  await setDoc(
    doc(publicShoppingListsCol(), publicShoppingListDocId(uid, listId)),
    {
      ownerUid: uid,
      listId,
      name: String(name || '').trim(),
      visibility: 'PUBLIC',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function upsertPublicShoppingOwner(uid: string, sourceListId: string) {
  await setDoc(
    doc(publicShoppingOwnersCol(), uid),
    {
      ownerUid: uid,
      sourceListId: String(sourceListId || '').trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function syncPublicShoppingOwnerMarker(uid: string) {
  const snap = await getDocs(query(shoppingListsCol(uid), where('visibility', '==', 'PUBLIC')));
  if (snap.empty) {
    await deleteDoc(doc(publicShoppingOwnersCol(), uid)).catch(() => undefined);
    return;
  }
  const firstPublicListId = String(snap.docs[0]?.id || '').trim();
  if (!firstPublicListId) return;
  await upsertPublicShoppingOwner(uid, firstPublicListId).catch(() => undefined);
}

async function removePublicShoppingList(uid: string, listId: string) {
  await deleteDoc(doc(publicShoppingListsCol(), publicShoppingListDocId(uid, listId)));
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
    sortShoppingListsByNameThenId(rows);
    cb(rows);
  });
}

export function watchPublicShoppingLists(cb: (rows: ShoppingList[]) => void) {
  const indexedRows = new Map<string, ShoppingList>();
  const publicRows = new Map<string, ShoppingList>();
  const weeklyRows = new Map<string, ShoppingList>();

  function emit() {
    const merged = new Map<string, ShoppingList>();
    indexedRows.forEach((row, key) => merged.set(key, row));
    publicRows.forEach((row, key) => merged.set(key, row));
    weeklyRows.forEach((row, key) => merged.set(key, row));
    const rows = dedupeShoppingListsByOwnerAndName(Array.from(merged.values()));
    rows.forEach((row) => {
      const ownerUid = String(row.ownerUid || '').trim();
      const listId = String(row.id || '').trim();
      if (!ownerUid || !listId) return;
      void upsertPublicShoppingOwner(ownerUid, listId).catch(() => undefined);
    });
    sortShoppingListsByNameThenId(rows);
    cb(rows);
  }

  const unsubIndex = onSnapshot(query(publicShoppingListsCol()), (snap) => {
    indexedRows.clear();
    snap.forEach((d) => {
      const data = d.data() as {
        ownerUid?: string;
        listId?: string;
        name?: string;
        visibility?: string;
        createdAt?: unknown;
        updatedAt?: unknown;
      };
      const ownerUid = String(data.ownerUid || '').trim();
      const listId = String(data.listId || '').trim();
      if (!ownerUid || !listId) return;
      const visibility = normalizeShoppingListVisibility(data.visibility);
      if (visibility !== 'PUBLIC') return;
      const key = `${ownerUid}::${listId}`;
      indexedRows.set(key, {
        id: listId,
        ownerUid,
        name: String(data.name || '').trim(),
        visibility,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    });
    emit();
  });

  function toListRowFromGroupDoc(d: { id: string; ref: { path: string }; data: () => Record<string, unknown> }) {
    const pathParts = d.ref.path.split('/');
    if (pathParts.length < 4 || pathParts[0] !== 'users' || pathParts[2] !== 'shoppingLists') return null;
    const ownerUid = String(pathParts[1] || '').trim();
    if (!ownerUid) return null;
      const data = d.data() as Record<string, unknown>;
      return {
        key: `${ownerUid}::${d.id}`,
        row: {
          id: d.id,
          ownerUid,
          name: String(data.name || '').trim(),
          visibility: normalizeShoppingListVisibility(String(data.visibility || '').trim()),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        } as ShoppingList,
      };
    }

  const unsubPublic = onSnapshot(
    query(collectionGroup(db, 'shoppingLists'), where('visibility', '==', 'PUBLIC')),
    (snap) => {
      publicRows.clear();
      snap.forEach((d) => {
        const parsed = toListRowFromGroupDoc(d);
        if (!parsed) return;
        publicRows.set(parsed.key, parsed.row);
        if (parsed.row.ownerUid && parsed.row.id) {
          void upsertPublicShoppingList(parsed.row.ownerUid, parsed.row.id, parsed.row.name || '').catch(() => undefined);
        }
      });
      emit();
    },
    () => {
      publicRows.clear();
      emit();
    }
  );

  const unsubWeekly = onSnapshot(
    query(collectionGroup(db, 'shoppingLists'), where('name', '==', 'Weekly Groceries')),
    (snap) => {
      weeklyRows.clear();
      snap.forEach((d) => {
        const parsed = toListRowFromGroupDoc(d);
        if (!parsed) return;
        weeklyRows.set(parsed.key, parsed.row);
        if (parsed.row.ownerUid && parsed.row.id) {
          void upsertPublicShoppingList(parsed.row.ownerUid, parsed.row.id, parsed.row.name || '').catch(() => undefined);
        }
      });
      emit();
    },
    () => {
      weeklyRows.clear();
      emit();
    }
  );

  return () => {
    unsubIndex();
    unsubPublic();
    unsubWeekly();
  };
}

export function watchShoppingListItems(
  uid: string,
  listId: string,
  cb: (rows: ShoppingListItem[]) => void,
  options?: ShoppingListScopeOptions
) {
  const q = query(shoppingItemsCol(uid, listId));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingListItem[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ShoppingListItem, 'id'>) };
      if (!options?.skipScopeFilter && !docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    cb(rows);
  });
}

export async function addShoppingList(
  uid: string,
  name: string,
  periodId?: string,
  visibility: ShoppingListVisibility = 'PRIVATE'
) {
  const cleanName = name.trim();
  const cleanVisibility = normalizeShoppingListVisibility(visibility);
  const ref = await addDoc(shoppingListsCol(uid), withWorkspaceWrite({
    name: cleanName,
    periodId: String(periodId || '').trim(),
    ownerUid: uid,
    visibility: cleanVisibility,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  if (cleanVisibility === 'PUBLIC') {
    await upsertPublicShoppingList(uid, ref.id, cleanName).catch(() => undefined);
    await upsertPublicShoppingOwner(uid, ref.id).catch(() => undefined);
  }
  return ref;
}

export async function updateShoppingList(uid: string, id: string, patch: Partial<ShoppingList>) {
  const visibility =
    patch.visibility === undefined ? undefined : normalizeShoppingListVisibility(patch.visibility);
  const listRef = doc(shoppingListsCol(uid), id);
  await updateDoc(listRef, withWorkspaceWrite({
    ...patch,
    ...(visibility !== undefined ? { visibility } : {}),
    updatedAt: serverTimestamp(),
  } as Partial<ShoppingList>));
  const latest = await getDoc(listRef);
  if (!latest.exists()) return;
  const data = latest.data() as Omit<ShoppingList, 'id'>;
  const latestVisibility = normalizeShoppingListVisibility(data.visibility);
  const latestName = String(data.name || '').trim();
  if (latestVisibility === 'PUBLIC') {
    await upsertPublicShoppingList(uid, id, latestName).catch(() => undefined);
    await upsertPublicShoppingOwner(uid, id).catch(() => undefined);
  } else {
    await removePublicShoppingList(uid, id).catch(() => undefined);
    await syncPublicShoppingOwnerMarker(uid).catch(() => undefined);
  }
}

export async function deleteShoppingList(uid: string, id: string) {
  const itemsSnap = await getDocs(shoppingItemsCol(uid, id));
  for (const item of itemsSnap.docs) {
    await deleteDoc(item.ref);
  }
  await deleteDoc(doc(shoppingListsCol(uid), id));
  await removePublicShoppingList(uid, id).catch(() => undefined);
  await syncPublicShoppingOwnerMarker(uid).catch(() => undefined);
}

export async function listShoppingLists(uid: string) {
  const snap = await getDocs(shoppingListsCol(uid));
  const rows: ShoppingList[] = [];
  snap.forEach((d) => {
    const row = { id: d.id, ...(d.data() as Omit<ShoppingList, 'id'>) };
    if (!docMatchesActiveScope(row as any)) return;
    rows.push(row);
  });
  sortShoppingListsByNameThenId(rows);
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
  input: Omit<ShoppingListItem, 'id' | 'createdAt' | 'updatedAt'>,
  options?: ShoppingListScopeOptions
) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('Item name is required.');
  await assertShoppingListItemNameAvailable(uid, listId, name, undefined, options);
  const price = Math.max(0, Number(input.price || 0));
  const tag = normalizeItemTag(input.tag);
  return addDoc(
    shoppingItemsCol(uid, listId),
    withShoppingListItemWriteScope(
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
      }) as any,
      options
    )
  );
}

export async function updateShoppingListItem(
  uid: string,
  listId: string,
  id: string,
  patch: Partial<ShoppingListItem>,
  options?: ShoppingListScopeOptions
) {
  const name =
    patch.name === undefined
      ? undefined
      : String(patch.name || '').trim();
  if (name !== undefined) {
    if (!name) throw new Error('Item name is required.');
    await assertShoppingListItemNameAvailable(uid, listId, name, id, options);
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
    withShoppingListItemWriteScope(
      compactFields({
        ...patch,
        ...(name !== undefined ? { name } : {}),
        ...(quantity !== undefined ? { quantity } : {}),
        ...(price !== undefined ? { price } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(tags ? { tags } : {}),
        ...(tag !== undefined ? { tag } : {}),
        updatedAt: serverTimestamp(),
      }) as any,
      options
    )
  );
}

export async function deleteShoppingListItem(uid: string, listId: string, id: string) {
  return deleteDoc(doc(shoppingItemsCol(uid, listId), id));
}

export function watchShoppingCatalog(
  uid: string,
  cb: (rows: ShoppingCatalogItem[]) => void,
  options?: ShoppingListScopeOptions
) {
  const q = query(shoppingCatalogCol(uid));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingCatalogItem[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ShoppingCatalogItem, 'id'>) };
      if (!options?.skipScopeFilter && !docMatchesActiveScope(row as any)) return;
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
