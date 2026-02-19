import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group } from './periods';

export type ShoppingList = {
  id?: string;
  name: string;
  archived?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ShoppingListItem = {
  id?: string;
  name: string;
  ownerUid?: string;
  tags?: string[];
  bought?: boolean;
  cost?: number;
  completed?: boolean;
  note?: string;
  assignedPeriodId?: string;
  assignedPlanItemId?: string;
  assignedPlanItemName?: string;
  assignedGroup?: Group;
  assignedTxId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function shoppingListsCol(uid: string) {
  return collection(db, 'users', uid, 'shoppingLists');
}

export function shoppingItemsCol(uid: string, listId: string) {
  return collection(db, 'users', uid, 'shoppingLists', listId, 'items');
}

function compactFields<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) out[key] = value;
  });
  return out as Partial<T>;
}

export function watchShoppingLists(uid: string, cb: (rows: ShoppingList[]) => void) {
  const q = query(shoppingListsCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingList[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<ShoppingList, 'id'>) }));
    cb(rows);
  });
}

export function watchShoppingListItems(uid: string, listId: string, cb: (rows: ShoppingListItem[]) => void) {
  const q = query(shoppingItemsCol(uid, listId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const rows: ShoppingListItem[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as Omit<ShoppingListItem, 'id'>) }));
    cb(rows);
  });
}

export async function addShoppingList(uid: string, name: string) {
  return addDoc(shoppingListsCol(uid), {
    name: name.trim(),
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateShoppingList(uid: string, id: string, patch: Partial<ShoppingList>) {
  return updateDoc(doc(shoppingListsCol(uid), id), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as Partial<ShoppingList>);
}

export async function deleteShoppingList(uid: string, id: string) {
  const itemsSnap = await getDocs(shoppingItemsCol(uid, id));
  for (const item of itemsSnap.docs) {
    await deleteDoc(item.ref);
  }
  return deleteDoc(doc(shoppingListsCol(uid), id));
}

export async function addShoppingListItem(
  uid: string,
  listId: string,
  input: Omit<ShoppingListItem, 'id' | 'createdAt' | 'updatedAt'>
) {
  return addDoc(shoppingItemsCol(uid, listId), compactFields({
    ...input,
    ownerUid: uid,
    name: input.name.trim(),
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean) : [],
    bought: input.bought === true,
    completed: input.completed === true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }) as any);
}

export async function updateShoppingListItem(uid: string, listId: string, id: string, patch: Partial<ShoppingListItem>) {
  const tags = Array.isArray(patch.tags) ? patch.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean) : patch.tags;
  return updateDoc(doc(shoppingItemsCol(uid, listId), id), compactFields({
    ...patch,
    ...(tags ? { tags } : {}),
    updatedAt: serverTimestamp(),
  }) as any);
}

export async function deleteShoppingListItem(uid: string, listId: string, id: string) {
  return deleteDoc(doc(shoppingItemsCol(uid, listId), id));
}
