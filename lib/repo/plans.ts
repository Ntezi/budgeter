import {
    addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import {db} from '../firebase';

export type PlanGroup = 'NEED' | 'WANT' | 'SAVINGS_DEBT';
export type PlanItem = { id?: string; group: PlanGroup; name: string; amount: number };

export function planCol(userId: string, periodId: string) {
    return collection(db, 'users', userId, 'periods', periodId, 'planItems');
}

export function watchPlanTotals(
    userId: string,
    periodId: string,
    cb: (totals: { needs: number; wants: number; sd: number }, items: PlanItem[]) => void
) {
    const q = query(planCol(userId, periodId), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
        const items: PlanItem[] = [];
        const totals = {needs: 0, wants: 0, sd: 0};
        snap.forEach((d) => {
            const it = {id: d.id, ...(d.data() as any)} as PlanItem;
            items.push(it);
            if (it.group === 'NEED') totals.needs += it.amount || 0;
            else if (it.group === 'WANT') totals.wants += it.amount || 0;
            else totals.sd += it.amount || 0;
        });
        cb(totals, items);
    });
}

export async function addPlanItem(userId: string, periodId: string, item: Omit<PlanItem, 'id'>) {
    return addDoc(planCol(userId, periodId), {...item, createdAt: serverTimestamp()});
}

export async function updatePlanItem(userId: string, periodId: string, id: string, patch: Partial<PlanItem>) {
    return updateDoc(doc(planCol(userId, periodId), id), patch as any);
}

export async function deletePlanItem(userId: string, periodId: string, id: string) {
    return deleteDoc(doc(planCol(userId, periodId), id));
}
