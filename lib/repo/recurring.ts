import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group } from './periods';
import { putTransactionWithId } from './transactions';

export type Recurring = {
  id?: string;
  name: string;
  amount: number;
  group: Group;               // 'NEED' | 'WANT' | 'SAVINGS_DEBT'
  dayOfMonth: number;         // 1..31 (clamped to month end)
  active: boolean;
  start?: string;             // optional YYYY-MM lower bound
  end?: string;               // optional YYYY-MM upper bound
  note?: string;
};

export const recCol = (uid: string) => collection(db, 'users', uid, 'recurring');

export function watchRecurring(uid: string, cb: (rows: Recurring[]) => void) {
  const q = query(recCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const out: Recurring[] = [];
    snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
    cb(out);
  });
}

export async function addRecurring(uid: string, r: Omit<Recurring, 'id'>) {
  return addDoc(recCol(uid), { ...r, createdAt: serverTimestamp() });
}
export async function updateRecurring(uid: string, id: string, patch: Partial<Recurring>) {
  return updateDoc(doc(recCol(uid), id), patch as any);
}
export async function deleteRecurring(uid: string, id: string) {
  return deleteDoc(doc(recCol(uid), id));
}

/** Generate transactions for period YYYY-MM from active templates (idempotent). */
export async function generateForPeriod(uid: string, pid: string, rows: Recurring[]) {
  const [year, month] = pid.split('-').map(Number); // e.g., 2025-09
  const lastDay = new Date(year, month, 0).getDate();

  for (const r of rows.filter((x) => x.active)) {
    if (r.start && pid < r.start) continue;
    if (r.end && pid > r.end) continue;

    const day = Math.min(Math.max(1, r.dayOfMonth || 1), lastDay);
    const date = `${pid}-${String(day).padStart(2, '0')}`; // YYYY-MM-DD
    const deterministicId = `rec_${r.id}_${pid}_${day}`;

    await putTransactionWithId(uid, pid, deterministicId, {
      name: r.name,
      amount: r.amount,
      group: r.group,
      date,
      note: r.note ?? '',
      fromTemplateId: r.id,
    });
  }
}
