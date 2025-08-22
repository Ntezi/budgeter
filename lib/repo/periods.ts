import {
    doc, getDoc, setDoc, onSnapshot, updateDoc, collection,
    onSnapshot as onSnap, serverTimestamp, query,
} from 'firebase/firestore';

import {db} from '../firebase';
import {addMonths, format} from 'date-fns';

export type Group = 'NEED' | 'WANT' | 'SAVINGS_DEBT';
export type PeriodStatus = 'DRAFT' | 'DECIDED';
export type PeriodDoc = {
    title?: string;
    status?: PeriodStatus; // DRAFT by default
    incomeTotal: number;
    targetPct: { needs: number; wants: number; sd: number };
    manualTargets?: { needs: number; wants: number; sd: number };
    createdAt?: any;
};

export const periodIdFromDate = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const nextMonthMeta = (d = new Date()) => {
    const next = addMonths(d, 1);
    return {
        id: periodIdFromDate(next),
        title: format(next, 'MMMM yyyy'),
    };
};

export async function getOrCreatePeriod(userId: string, periodId: string) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    const snap = await getDoc(ref);
    const defaultTitle = format(addMonths(new Date(), 1), 'MMMM yyyy');
    if (!snap.exists()) {
        await setDoc(ref, {
            title: defaultTitle,
            status: 'DRAFT',
            incomeTotal: 0,
            targetPct: {needs: 0.5, wants: 0.3, sd: 0.2},
            createdAt: serverTimestamp(),
        } as PeriodDoc);
    } else if (!snap.data().title) {
        await updateDoc(ref, {title: defaultTitle});
    } else {
        const data = snap.data();
        const patch: any = {};
        if (!data.title) patch.title = defaultTitle;
        if (!data.createdAt) patch.createdAt = serverTimestamp();
        if (Object.keys(patch).length) await updateDoc(ref, patch);
    }
    return ref;
}

export async function createPeriod(userId: string, periodId: string, title: string) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, {
            title,
            status: 'DRAFT',
            incomeTotal: 0,
            targetPct: {needs: 0.5, wants: 0.3, sd: 0.2},
            createdAt: serverTimestamp(),
        } as PeriodDoc);
    }
    return ref;
}

export function watchPeriods(userId: string, cb: (rows: (PeriodDoc & { id: string })[]) => void) {
    const col = collection(db, 'users', userId, 'periods');
    return onSnap(col, (snap) => {
        const out: (PeriodDoc & { id: string })[] = [];
        snap.forEach((d) => out.push({id: d.id, ...(d.data() as PeriodDoc)}));
        // Sort by createdAt desc if present, else by id desc
        out.sort((a, b) => {
            const at = (a as any).createdAt?.toMillis?.() ?? 0;
            const bt = (b as any).createdAt?.toMillis?.() ?? 0;
            if (at !== bt) return bt - at;
            return b.id.localeCompare(a.id);
        });
        cb(out);
    });
}

export function watchPeriod(userId: string, periodId: string, cb: (p: PeriodDoc) => void) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    return onSnapshot(ref, (s) => s.exists() && cb(s.data() as PeriodDoc));
}

export async function setPeriodTitle(userId: string, periodId: string, title: string) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    await updateDoc(ref, {title});
}

export async function setPeriodStatus(userId: string, periodId: string, status: PeriodStatus) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    await updateDoc(ref, {status});
}

export async function setIncome(userId: string, periodId: string, incomeTotal: number) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    await updateDoc(ref, {incomeTotal});
}

export async function setTargetPct(
    userId: string,
    periodId: string,
    targetPct: { needs: number; wants: number; sd: number }
) {
    const ref = doc(db, 'users', userId, 'periods', periodId);
    await updateDoc(ref, {targetPct});
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
            if (group === 'NEED') totals.needs += amount || 0;
            else if (group === 'WANT') totals.wants += amount || 0;
            else totals.sd += amount || 0;
        });
        cb(totals);
    });
}