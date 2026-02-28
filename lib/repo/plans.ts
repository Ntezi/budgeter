import {
    addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import {db} from '../firebase';
import {assertPeriodEditable} from './periods';
import { docMatchesActiveScope, scopedPeriodDocId, withWorkspaceWrite } from './scope';

export type PlanGroup = 'NEED' | 'WANT' | 'SAVINGS_DEBT' | string;
export type RolloverMode = 'NONE' | 'CARRY_LEFTOVER' | 'CARRY_OVERSPEND' | 'CARRY_BOTH' | 'CAPPED';
export type PlanItem = {
    id?: string;
    group: PlanGroup;
    name: string;
    amount: number;
    plannedAccountId?: string;
    priority?: number;
    rolloverMode?: RolloverMode;
    rolloverCapAmount?: number;
    tags?: string[];
    reconcilePinned?: boolean;
    workspaceId?: string;
    periodId?: string;
};

export function planCol(userId: string, periodId: string) {
    return collection(db, 'users', userId, 'periods', scopedPeriodDocId(periodId), 'planItems');
}

export function watchPlanTotals(
    userId: string,
    periodId: string,
    cb: (totals: { needs: number; wants: number; sd: number }, items: PlanItem[]) => void
) {
    const q = query(planCol(userId, periodId));
    return onSnapshot(q, (snap) => {
        const items: PlanItem[] = [];
        const totals = {needs: 0, wants: 0, sd: 0};
        snap.forEach((d) => {
            const it = {id: d.id, ...(d.data() as any)} as PlanItem;
            if (!docMatchesActiveScope(it as any)) return;
            items.push(it);
            if (it.group === 'NEED') totals.needs += it.amount || 0;
            else if (it.group === 'WANT') totals.wants += it.amount || 0;
            else totals.sd += it.amount || 0;
        });
        items.sort((a, b) => {
            const pa = Number(a.priority ?? Number.MAX_SAFE_INTEGER);
            const pb = Number(b.priority ?? Number.MAX_SAFE_INTEGER);
            if (pa !== pb) return pa - pb;
            return (a.name ?? '').localeCompare(b.name ?? '');
        });
        cb(totals, items);
    });
}

export async function addPlanItem(userId: string, periodId: string, item: Omit<PlanItem, 'id'>) {
    await assertPeriodEditable(userId, periodId);
    return addDoc(planCol(userId, periodId), withWorkspaceWrite({ ...item, periodId, createdAt: serverTimestamp() }));
}

export async function updatePlanItem(userId: string, periodId: string, id: string, patch: Partial<PlanItem>) {
    await assertPeriodEditable(userId, periodId);
    return updateDoc(doc(planCol(userId, periodId), id), withWorkspaceWrite({ ...patch, periodId } as any) as any);
}

export async function deletePlanItem(userId: string, periodId: string, id: string) {
    await assertPeriodEditable(userId, periodId);
    return deleteDoc(doc(planCol(userId, periodId), id));
}

export async function putPlanWithId(
    userId: string,
    periodId: string,
    id: string,
    item: Omit<PlanItem, 'id'>
) {
    await assertPeriodEditable(userId, periodId);
    return setDoc(doc(planCol(userId, periodId), id), withWorkspaceWrite({
        ...item,
        periodId,
        createdAt: serverTimestamp(),
    }), {merge: true});
}
