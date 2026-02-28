import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group } from './periods';
import { docMatchesActiveScope, withWorkspaceWrite } from './scope';

export type ExpenseItem = {
  id?: string;
  name: string;
  amount: number;
  group: Group;
  tags?: string[];
  note?: string;
  active?: boolean;
  workspaceId?: string;
  modeScope?: 'MONTHLY_3_BUCKET' | 'EVENT' | 'CUSTOM' | 'ALL';
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function expensesCol(uid: string) {
  return collection(db, 'users', uid, 'expenses');
}

export function watchExpenses(uid: string, cb: (rows: ExpenseItem[]) => void) {
  const q = query(expensesCol(uid));
  return onSnapshot(q, (snap) => {
    const rows: ExpenseItem[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<ExpenseItem, 'id'>) };
      if (!docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    cb(rows);
  });
}

export async function addExpense(uid: string, item: Omit<ExpenseItem, 'id' | 'createdAt' | 'updatedAt'>) {
  return addDoc(expensesCol(uid), withWorkspaceWrite({
    ...item,
    active: item.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
}

export async function updateExpense(uid: string, id: string, patch: Partial<ExpenseItem>) {
  return updateDoc(doc(expensesCol(uid), id), withWorkspaceWrite({
    ...patch,
    updatedAt: serverTimestamp(),
  } as Partial<ExpenseItem>));
}

export async function deleteExpense(uid: string, id: string) {
  return deleteDoc(doc(expensesCol(uid), id));
}
