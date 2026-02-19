import {
  addDoc, setDoc, doc, collection, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { assertPeriodEditable, type Group } from './periods';

export type Tx = {
  id?: string;
  name?: string;
  amount: number;
  group: Group;
  date?: string;          // YYYY-MM-DD
  categoryId?: string;
  note?: string;
  fromTemplateId?: string;
  shoppingListId?: string;
  shoppingListName?: string;
  shoppingItemId?: string;
  shoppingItemName?: string;
};

export const txCol = (userId: string, pid: string) =>
  collection(db, 'users', userId, 'periods', pid, 'transactions');

function compactFields<T extends Record<string, any>>(input: T): Partial<T> {
  const out: Record<string, any> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) out[key] = value;
  });
  return out as Partial<T>;
}

export function watchTransactions(
  userId: string,
  pid: string,
  cb: (items: Tx[]) => void
) {
  const q = query(txCol(userId, pid), orderBy('date', 'asc'));
  return onSnapshot(q, (snap) => {
    const items: Tx[] = [];
    snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
    cb(items);
  });
}

export async function addTransaction(userId: string, pid: string, tx: Omit<Tx, 'id'>) {
  await assertPeriodEditable(userId, pid);
  return addDoc(txCol(userId, pid), compactFields({
    ...tx,
    date: tx.date ?? new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  }) as any);
}

export async function setTransaction(
  userId: string, pid: string, id: string, patch: Partial<Tx>
) {
  await assertPeriodEditable(userId, pid);
  return updateDoc(doc(txCol(userId, pid), id), compactFields(patch) as any);
}

export async function delTransaction(userId: string, pid: string, id: string) {
  await assertPeriodEditable(userId, pid);
  return deleteDoc(doc(txCol(userId, pid), id));
}

/** Deterministic writer used by the generator (idempotent). */
export async function putTransactionWithId(
  userId: string,
  pid: string,
  id: string,
  tx: Omit<Tx, 'id'>
) {
  await assertPeriodEditable(userId, pid);
  return setDoc(doc(txCol(userId, pid), id), compactFields({
    ...tx,
    createdAt: serverTimestamp(),
  }) as any, { merge: true });
}
