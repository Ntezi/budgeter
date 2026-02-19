import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group } from './periods';

export type ExpenseItem = {
  id?: string;
  name: string;
  amount: number;
  group: Group;
  tags?: string[];
  note?: string;
  active?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function expensesCol(uid: string) {
  return collection(db, 'users', uid, 'expenses');
}

export function watchExpenses(uid: string, cb: (rows: ExpenseItem[]) => void) {
  const q = query(expensesCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const rows: ExpenseItem[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ExpenseItem, 'id'>) };
      rows.push(row);
    });
    cb(rows);
  });
}

export async function addExpense(uid: string, item: Omit<ExpenseItem, 'id' | 'createdAt' | 'updatedAt'>) {
  return addDoc(expensesCol(uid), {
    ...item,
    active: item.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateExpense(uid: string, id: string, patch: Partial<ExpenseItem>) {
  return updateDoc(doc(expensesCol(uid), id), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as Partial<ExpenseItem>);
}

export async function deleteExpense(uid: string, id: string) {
  return deleteDoc(doc(expensesCol(uid), id));
}
