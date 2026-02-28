import {
    addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import {db} from '../firebase';
import {assertPeriodEditable} from './periods';
import { docMatchesActiveScope, scopedPeriodDocId, withWorkspaceWrite } from './scope';

export type IncomeItem = {
    id?: string;
    name: string;
    amount: number;
    active?: boolean;
    workspaceId?: string;
    periodId?: string;
};

export function incomeCol(userId: string, periodId: string) {
    return collection(db, 'users', userId, 'periods', scopedPeriodDocId(periodId), 'incomeItems');
}

export function watchIncomeItems(
    userId: string,
    periodId: string,
    cb: (items: IncomeItem[], activeTotal: number, grossTotal: number) => void
) {
    const q = query(incomeCol(userId, periodId));
    return onSnapshot(q, (snap) => {
        const items: IncomeItem[] = [];
        let activeTotal = 0;
        let grossTotal = 0;
        snap.forEach((d) => {
            const it = {id: d.id, ...(d.data() as any)} as IncomeItem;
            if (!docMatchesActiveScope(it as any)) return;
            const amount = it.amount || 0;
            grossTotal += amount;
            if (it.active !== false) activeTotal += amount;
            items.push(it);
        });
        items.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
        cb(items, activeTotal, grossTotal);
    });
}

export async function addIncomeItem(userId: string, periodId: string, item: Omit<IncomeItem, 'id'>) {
    await assertPeriodEditable(userId, periodId);
    return addDoc(incomeCol(userId, periodId), withWorkspaceWrite({
        ...item,
        periodId,
        active: item.active !== false,
        createdAt: serverTimestamp(),
    }));
}

export async function updateIncomeItem(userId: string, periodId: string, id: string, patch: Partial<IncomeItem>) {
    await assertPeriodEditable(userId, periodId);
    return updateDoc(doc(incomeCol(userId, periodId), id), withWorkspaceWrite({ ...patch, periodId } as any) as any);
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
    return setDoc(doc(incomeCol(userId, periodId), id), withWorkspaceWrite({
        ...item,
        periodId,
        active: item.active !== false,
        createdAt: serverTimestamp(),
    }), {merge: true});
}
