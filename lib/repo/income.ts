import {
    addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import {db} from '../firebase';
import {assertPeriodEditable} from './periods';

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
            const it = {id: d.id, ...(d.data() as any)} as IncomeItem;
            total += it.amount || 0;
            items.push(it);
        });
        cb(items, total);
    });
}

export async function addIncomeItem(userId: string, periodId: string, item: Omit<IncomeItem, 'id'>) {
    await assertPeriodEditable(userId, periodId);
    return addDoc(incomeCol(userId, periodId), {...item, createdAt: serverTimestamp()});
}

export async function updateIncomeItem(userId: string, periodId: string, id: string, patch: Partial<IncomeItem>) {
    await assertPeriodEditable(userId, periodId);
    return updateDoc(doc(incomeCol(userId, periodId), id), patch as any);
}

export async function deleteIncomeItem(userId: string, periodId: string, id: string) {
    await assertPeriodEditable(userId, periodId);
    return deleteDoc(doc(incomeCol(userId, periodId), id));
}

export async function putIncomeWithId(
    userId: string,
    periodId: string,
    id: string,
    item: Omit<IncomeItem, 'id'>
) {
    return setDoc(doc(incomeCol(userId, periodId), id), {
        ...item,
        createdAt: serverTimestamp(),
    }, {merge: true});
}
