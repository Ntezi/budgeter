// lib/repo/recurring.ts
import {
    addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
    serverTimestamp, updateDoc, getDocs, deleteField,
} from 'firebase/firestore';
import {db} from '../firebase';
import {assertPeriodEditable, type Group} from './periods';
import {putTransactionWithId} from './transactions';
import {putIncomeWithId} from './income';
import {putPlanWithId} from './plans';

export type RecurringFlow = 'EXPENSE' | 'INCOME';

export type Recurring = {
    id?: string;
    flow?: RecurringFlow;        // ← NEW (default EXPENSE)
    name: string;
    amount: number;
    tags?: string[];
    group?: Group;               // required when flow = EXPENSE
    dayOfMonth: number;          // 1..31 (clamped)
    active?: boolean;            // undefined = true
    start?: string;              // YYYY-MM inclusive
    end?: string;                // YYYY-MM inclusive
    note?: string;
};

export const recCol = (uid: string) => collection(db, 'users', uid, 'recurring');

function mapGroup(input?: string): Group | undefined {
    const upper = (input ?? '').trim().toUpperCase();
    if (!upper) return undefined;
    if (upper === 'NEED' || upper === 'NEEDS') return 'NEED';
    if (upper === 'WANT' || upper === 'WANTS') return 'WANT';
    if (upper === 'SAVINGS' || upper === 'SAVINGS_DEBT' || upper === 'S&D') return 'SAVINGS_DEBT';
    return undefined;
}

function toBoolean(value: string | undefined, fallback = true) {
    if (!value) return fallback;
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(v)) return true;
    if (['0', 'false', 'no', 'n'].includes(v)) return false;
    return fallback;
}

function normalizePeriod(value?: string): string | undefined {
    if (!value) return undefined;
    const v = value.trim();
    if (!v) return undefined;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
        throw new Error(`Invalid period "${value}". Expected YYYY-MM.`);
    }
    return v;
}

function mapFlow(input?: string): {flow: RecurringFlow; impliedGroup?: Group} {
    const upper = (input ?? '').trim().toUpperCase();
    if (!upper || upper === 'EXPENSE') return {flow: 'EXPENSE'};
    if (upper === 'INCOME') return {flow: 'INCOME'};
    if (upper === 'NEED' || upper === 'NEEDS') return {flow: 'EXPENSE', impliedGroup: 'NEED'};
    if (upper === 'WANT' || upper === 'WANTS') return {flow: 'EXPENSE', impliedGroup: 'WANT'};
    if (upper === 'SAVE' || upper === 'SAVING' || upper === 'SAVINGS' || upper === 'SD') {
        return {flow: 'EXPENSE', impliedGroup: 'SAVINGS_DEBT'};
    }
    throw new Error(`invalid flow "${input}"`);
}

function parseCsvRecord(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

function normalizeRecurring(input: Omit<Recurring, 'id'>): Omit<Recurring, 'id'> {
    const flow: RecurringFlow = input.flow ?? 'EXPENSE';
    const out: Omit<Recurring, 'id'> = {
        flow,
        name: input.name.trim(),
        amount: Number(input.amount) || 0,
        tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
        dayOfMonth: Math.min(31, Math.max(1, Number(input.dayOfMonth) || 1)),
        active: input.active !== false,
    };
    if (flow === 'EXPENSE') out.group = input.group ?? 'NEED';
    if (input.start) out.start = normalizePeriod(input.start);
    if (input.end) out.end = normalizePeriod(input.end);
    if (input.note && input.note.trim()) out.note = input.note.trim();
    return out;
}

function toFirestoreWrite(input: Omit<Recurring, 'id'>) {
    const row = normalizeRecurring(input);
    const out: Record<string, unknown> = {
        flow: row.flow,
        name: row.name,
        amount: row.amount,
        dayOfMonth: row.dayOfMonth,
        active: row.active,
    };
    if (row.group) out.group = row.group;
    if (row.tags?.length) out.tags = row.tags;
    if (row.start) out.start = row.start;
    if (row.end) out.end = row.end;
    if (row.note) out.note = row.note;
    return out;
}

function toFirestorePatch(patch: Partial<Recurring>) {
    const out: Record<string, any> = {};
    if ('flow' in patch) out.flow = patch.flow ?? 'EXPENSE';
    if ('name' in patch && patch.name !== undefined) out.name = String(patch.name).trim();
    if ('amount' in patch && patch.amount !== undefined) out.amount = Number(patch.amount) || 0;
    if ('dayOfMonth' in patch && patch.dayOfMonth !== undefined) {
        out.dayOfMonth = Math.min(31, Math.max(1, Number(patch.dayOfMonth) || 1));
    }
    if ('tags' in patch) {
        const next = Array.isArray(patch.tags) ? patch.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [];
        out.tags = next;
    }
    if ('active' in patch) out.active = patch.active !== false;
    if ('group' in patch) out.group = patch.group ?? deleteField();
    if ('start' in patch) out.start = patch.start ? normalizePeriod(patch.start) : deleteField();
    if ('end' in patch) out.end = patch.end ? normalizePeriod(patch.end) : deleteField();
    if ('note' in patch) out.note = patch.note && patch.note.trim() ? patch.note.trim() : deleteField();
    return out;
}

export function watchRecurring(uid: string, cb: (rows: Recurring[]) => void) {
    const q = query(recCol(uid), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
        const out: Recurring[] = [];
        snap.forEach((d) => out.push({id: d.id, ...(d.data() as any)}));
        cb(out);
    });
}

export async function addRecurring(uid: string, r: Omit<Recurring, 'id'>) {
    return addDoc(recCol(uid), {...toFirestoreWrite(r), createdAt: serverTimestamp()});
}

export async function updateRecurring(uid: string, id: string, patch: Partial<Recurring>) {
    return updateDoc(doc(recCol(uid), id), toFirestorePatch(patch));
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

export const recurringCsvHeader =
    'flow,name,amount,group,dayOfMonth,active,start,end,note';

export function parseRecurringCsv(csvText: string): Omit<Recurring, 'id'>[] {
    const rawLines = csvText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (!rawLines.length) return [];
    const [headerRaw, ...lines] = rawLines;
    const header = headerRaw.replace(/^\uFEFF/, '');
    if (header.toLowerCase() !== recurringCsvHeader.toLowerCase()) {
        throw new Error(`Invalid CSV header. Expected:\n${recurringCsvHeader}`);
    }
    return lines.map((line, idx) => {
        const [
            flowRaw,
            nameRaw,
            amountRaw,
            groupRaw,
            dayRaw,
            activeRaw,
            startRaw,
            endRaw,
            noteRaw,
        ] = parseCsvRecord(line);
        const {flow, impliedGroup} = mapFlow(flowRaw);
        const amount = Number(amountRaw);
        if (!nameRaw?.trim()) throw new Error(`Line ${idx + 2}: name is required`);
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`Line ${idx + 2}: amount must be >= 0`);
        }
        const explicitGroup = mapGroup(groupRaw);
        const row: Omit<Recurring, 'id'> = {
            flow,
            name: nameRaw.trim(),
            amount,
            dayOfMonth: Math.min(31, Math.max(1, Number(dayRaw) || 1)),
            active: toBoolean(activeRaw, true),
        };
        if (flow === 'EXPENSE') row.group = explicitGroup ?? impliedGroup ?? 'NEED';
        const start = normalizePeriod(startRaw);
        if (start) row.start = start;
        const end = normalizePeriod(endRaw);
        if (end) row.end = end;
        const noteParts: string[] = [];
        if (groupRaw && !explicitGroup) noteParts.push(`bucketType=${groupRaw.trim()}`);
        if (noteRaw && noteRaw.trim()) noteParts.push(noteRaw.trim());
        if (noteParts.length) row.note = noteParts.join(' | ');
        return row;
    }).filter((row) => row.active !== false || row.amount > 0);
}

export async function importRecurringCsv(uid: string, csvText: string) {
    const rows = parseRecurringCsv(csvText);
    for (const row of rows) {
        await addRecurring(uid, row);
    }
    return rows.length;
}

/** Seed budget editor sections (plan + income) from recurring templates for a period. */
export async function seedBudgetFromRecurring(
    uid: string,
    pid: string,
    rows: Recurring[]
): Promise<{ planWritten: number; incomeWritten: number }> {
    await assertPeriodEditable(uid, pid);
    let planWritten = 0;
    let incomeWritten = 0;
    const eligible = rows.filter((r) => {
        const active = r.active !== false;
        if (!active) return false;
        if (!r.amount || r.amount <= 0) return false;
        if (r.start && pid < r.start) return false;
        if (r.end && pid > r.end) return false;
        return true;
    });
    let nextPriority = 1;
    for (const r of eligible) {
        if (!r.id) continue;
        const flow: RecurringFlow = r.flow ?? 'EXPENSE';
        if (flow === 'INCOME') {
            const incomeId = `recbudget_income_${r.id}_${pid}`;
            await putIncomeWithId(uid, pid, incomeId, {
                name: r.name,
                amount: r.amount,
            });
            incomeWritten++;
        } else {
            const planId = `recbudget_plan_${r.id}_${pid}`;
            await putPlanWithId(uid, pid, planId, {
                name: r.name,
                amount: r.amount,
                group: (r.group ?? 'NEED') as Group,
                priority: nextPriority,
            });
            planWritten++;
            nextPriority++;
        }
    }
    return {planWritten, incomeWritten};
}

/** Generate for period YYYY-MM. Returns counts. */
export async function generateForPeriod(
    uid: string,
    pid: string,
    rows: Recurring[]
): Promise<{ expenseWritten: number; incomeWritten: number }> {
    await assertPeriodEditable(uid, pid);
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

/** Seed budget editor sections (plan + income) for a new period. */
export async function seedBudgetForNewPeriod(uid: string, pid: string) {
    const rows = await listRecurring(uid);
    return seedBudgetFromRecurring(uid, pid, rows);
}
