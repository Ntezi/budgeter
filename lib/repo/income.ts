import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export type IncomeItem = { id?: string; name: string; amount: number };

export function incomeCol(userId: string, periodId: string) {
  return collection(db, 'users', userId, 'periods', periodId, 'incomeItems');
}

export function watchIncomeItems(
  userId: string,
  periodId: string,
  cb: (items: IncomeItem[], total: number) => void
) {
  const q = query(incomeCol(userId, periodId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const items: IncomeItem[] = [];
    let total = 0;
    snap.forEach((d) => {
      const it = { id: d.id, ...(d.data() as any) } as IncomeItem;
      total += it.amount || 0;
      items.push(it);
    });
    cb(items, total);
  });
}

export async function addIncomeItem(userId: string, periodId: string, item: Omit<IncomeItem, 'id'>) {
  return addDoc(incomeCol(userId, periodId), { ...item, createdAt: serverTimestamp() });
}
export async function updateIncomeItem(userId: string, periodId: string, id: string, patch: Partial<IncomeItem>) {
  return updateDoc(doc(incomeCol(userId, periodId), id), patch as any);
}
export async function deleteIncomeItem(userId: string, periodId: string, id: string) {
  return deleteDoc(doc(incomeCol(userId, periodId), id));
}
