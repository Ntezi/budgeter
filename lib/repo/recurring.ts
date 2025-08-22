// lib/repo/recurring.ts
import {
    addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
    serverTimestamp, updateDoc, getDocs,
} from 'firebase/firestore';
import {db} from '../firebase';
import type {Group} from './periods';
import {putTransactionWithId} from './transactions';
import {putIncomeWithId} from './income';

export type RecurringFlow = 'EXPENSE' | 'INCOME';

export type Recurring = {
    id?: string;
    flow?: RecurringFlow;        // ← NEW (default EXPENSE)
    name: string;
    amount: number;
    group?: Group;               // required when flow = EXPENSE
    dayOfMonth: number;          // 1..31 (clamped)
    active?: boolean;            // undefined = true
    start?: string;              // YYYY-MM inclusive
    end?: string;                // YYYY-MM inclusive
    note?: string;
};

export const recCol = (uid: string) => collection(db, 'users', uid, 'recurring');

export function watchRecurring(uid: string, cb: (rows: Recurring[]) => void) {
    const q = query(recCol(uid), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
        const out: Recurring[] = [];
        snap.forEach((d) => out.push({id: d.id, ...(d.data() as any)}));
        cb(out);
    });
}

export async function addRecurring(uid: string, r: Omit<Recurring, 'id'>) {
    return addDoc(recCol(uid), {...r, createdAt: serverTimestamp()});
}

export async function updateRecurring(uid: string, id: string, patch: Partial<Recurring>) {
    return updateDoc(doc(recCol(uid), id), patch as any);
}

export async function deleteRecurring(uid: string, id: string) {
    return deleteDoc(doc(recCol(uid), id));
}

export async function listRecurring(uid: string) {
    const snap = await getDocs(recCol(uid));
    const out: Recurring[] = [];
    snap.forEach((d) => out.push({id: d.id, ...(d.data() as any)}));
    return out;
}

/** Generate for period YYYY-MM. Returns counts. */
export async function generateForPeriod(
    uid: string,
    pid: string,
    rows: Recurring[]
): Promise<{ expenseWritten: number; incomeWritten: number }> {
    const [year, monthNum] = pid.split('-').map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();

    let expenseWritten = 0, incomeWritten = 0;

    const eligible = rows.filter((r) => {
        const active = r.active !== false;
        if (!active) return false;
        if (!r.amount || r.amount <= 0) return false;
        if (r.start && pid < r.start) return false;
        if (r.end && pid > r.end) return false;
        return true;
    });

    for (const r of eligible) {
        const flow: RecurringFlow = r.flow ?? 'EXPENSE';
        const day = Math.min(Math.max(1, r.dayOfMonth || 1), lastDay);
        const date = `${pid}-${String(day).padStart(2, '0')}`;

        if (flow === 'INCOME') {
            const incId = `recinc_${r.id}_${pid}_${day}`;
            await putIncomeWithId(uid, pid, incId, {name: r.name, amount: r.amount});
            incomeWritten++;
        } else {
            // EXPENSE -> needs/wants/sd transaction
            const grp = (r.group ?? 'NEED') as Group;
            const txId = `rec_${r.id}_${pid}_${day}`;
            await putTransactionWithId(uid, pid, txId, {
                name: r.name,
                amount: r.amount,
                group: grp,
                date,
                note: r.note ?? '',
                fromTemplateId: r.id,
            });
            expenseWritten++;
        }
    }
    return {expenseWritten, incomeWritten};
}

/** Convenience for new periods. */
export async function autoPopulateForNewPeriod(uid: string, pid: string) {
    const rows = await listRecurring(uid);
    return generateForPeriod(uid, pid, rows);
}
