import {
    doc, getDoc, setDoc, onSnapshot, updateDoc, collection, query, onSnapshot as onSnap,
} from 'firebase/firestore';
import {db} from '../firebase';

export type Group = 'NEED' | 'WANT' | 'SAVINGS_DEBT';
export type PeriodDoc = {
    incomeTotal: number;
    targetPct: { needs: number; wants: number; sd: number };
    manualTargets?: { needs: number; wants: number; sd: number };
};

export const periodIdFromDate = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export async function getOrCreatePeriod(userId: string, periodId: string) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, {
            incomeTotal: 0,
            targetPct: {needs: 0.5, wants: 0.3, sd: 0.2},
        } as PeriodDoc);
    }
    return ref;
}

export function watchPeriod(userId: string, periodId: string, cb: (p: PeriodDoc) => void) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    return onSnapshot(ref, (s) => s.exists() && cb(s.data() as PeriodDoc));
}

export async function setIncome(userId: string, periodId: string, incomeTotal: number) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    await updateDoc(ref, {incomeTotal});
}

export function watchTransactionsTotals(
    userId: string,
    periodId: string,
    cb: (totals: { needs: number; wants: number; sd: number }) => void
) {
    const q = query(collection(db, 'users', userId, 'periods', periodId, 'transactions'));
    return onSnap(q, (snap) => {
        const totals = {needs: 0, wants: 0, sd: 0};
        snap.forEach((d) => {
            const {amount, group} = d.data() as any;
            if (group === 'NEED') totals.needs += amount;
            else if (group === 'WANT') totals.wants += amount;
            else totals.sd += amount;
        });
        cb(totals);
    });
}
