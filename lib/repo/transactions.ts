import {
  addDoc, setDoc, doc, collection, getDocs, onSnapshot, query,
  serverTimestamp, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { assertPeriodEditable, type Group } from './periods';
import {
  docMatchesActiveScope,
  logicalPeriodIdFromDocId,
  scopedPeriodDocId,
  withWorkspaceWrite,
} from './scope';

export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'ADJUSTMENT' | 'REFUND';

export type Tx = {
  id?: string;
  name?: string;
  amount: number;
  group: Group;
  type?: TransactionType;
  date?: string;          // YYYY-MM-DD
  // Legacy alias kept for backward compatibility.
  accountId?: string;
  // Account that actually paid / received for this transaction.
  paidFromAccountId?: string;
  // For transfer transactions.
  toAccountId?: string;
  transferGroupId?: string;
  // Legacy alias kept for backward compatibility.
  categoryId?: string;
  // Plan/budget row linked to this transaction.
  planItemId?: string;
  originalTransactionId?: string;
  note?: string;
  fromTemplateId?: string;
  shoppingListId?: string;
  shoppingListName?: string;
  shoppingItemId?: string;
  shoppingItemName?: string;
  workspaceId?: string;
  periodId?: string;
};

export type TxWithPeriod = Tx & {
  periodId: string;
};

export const txCol = (userId: string, pid: string) =>
  collection(db, 'users', userId, 'periods', scopedPeriodDocId(pid), 'transactions');

function compactFields<T extends Record<string, any>>(input: T): Partial<T> {
  const out: Record<string, any> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined) out[key] = value;
  });
  return out as Partial<T>;
}

function normalizeTxFields<T extends Partial<Tx>>(input: T, opts?: { defaultType?: boolean }): T {
  const out: Partial<Tx> = { ...input };
  if (opts?.defaultType && !out.type) out.type = 'EXPENSE';

  // Keep legacy + new fields mirrored while migration is in progress.
  if (out.paidFromAccountId === undefined && out.accountId !== undefined) {
    out.paidFromAccountId = out.accountId;
  }
  if (out.accountId === undefined && out.paidFromAccountId !== undefined) {
    out.accountId = out.paidFromAccountId;
  }
  if (out.planItemId === undefined && out.categoryId !== undefined) {
    out.planItemId = out.categoryId;
  }
  if (out.categoryId === undefined && out.planItemId !== undefined) {
    out.categoryId = out.planItemId;
  }

  return out as T;
}

function transferGroupId() {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function watchTransactions(
  userId: string,
  pid: string,
  cb: (items: Tx[]) => void
) {
  const q = query(txCol(userId, pid));
  return onSnapshot(q, (snap) => {
    const items: Tx[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as any) } as Tx;
      if (!docMatchesActiveScope(row as any)) return;
      items.push(row);
    });
    items.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    cb(items);
  });
}

export async function addTransaction(userId: string, pid: string, tx: Omit<Tx, 'id'>) {
  await assertPeriodEditable(userId, pid);
  const normalized = normalizeTxFields(tx, { defaultType: true });
  return addDoc(txCol(userId, pid), compactFields(withWorkspaceWrite({
    ...normalized,
    periodId: pid,
    date: tx.date ?? new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  })) as any);
}

export async function setTransaction(
  userId: string, pid: string, id: string, patch: Partial<Tx>
) {
  await assertPeriodEditable(userId, pid);
  const normalized = normalizeTxFields(patch, { defaultType: false });
  return updateDoc(
    doc(txCol(userId, pid), id),
    compactFields(withWorkspaceWrite({ ...normalized, periodId: pid } as any)) as any
  );
}

export async function delTransaction(userId: string, pid: string, id: string) {
  await assertPeriodEditable(userId, pid);
  return deleteDoc(doc(txCol(userId, pid), id));
}

/** Deterministic writer used by the generator (idempotent). */
export async function putTransactionWithId(
  userId: string,
  pid: string,
  id: string,
  tx: Omit<Tx, 'id'>
) {
  await assertPeriodEditable(userId, pid);
  const normalized = normalizeTxFields(tx, { defaultType: true });
  return setDoc(doc(txCol(userId, pid), id), compactFields(withWorkspaceWrite({
    ...normalized,
    periodId: pid,
    createdAt: serverTimestamp(),
  })) as any, { merge: true });
}

export async function addTransferTransaction(
  userId: string,
  pid: string,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date?: string;
    note?: string;
    group?: Group;
  }
) {
  await assertPeriodEditable(userId, pid);
  const fromAccountId = String(input.fromAccountId || '').trim();
  const toAccountId = String(input.toAccountId || '').trim();
  const amount = Math.max(0, Number(input.amount || 0));
  if (!fromAccountId || !toAccountId) throw new Error('Both source and destination accounts are required.');
  if (fromAccountId === toAccountId) throw new Error('Transfer must move between two different accounts.');
  if (amount <= 0) throw new Error('Transfer amount must be greater than 0.');

  const tx = normalizeTxFields(
    {
      name: 'Transfer',
      type: 'TRANSFER',
      group: input.group ?? 'SAVINGS_DEBT',
      amount,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      paidFromAccountId: fromAccountId,
      toAccountId,
      transferGroupId: transferGroupId(),
      note: input.note || '',
    },
    { defaultType: false }
  );

  return addDoc(
    txCol(userId, pid),
    compactFields(withWorkspaceWrite({
      ...tx,
      periodId: pid,
      createdAt: serverTimestamp(),
    })) as any
  );
}

export async function listAllTransactions(userId: string): Promise<TxWithPeriod[]> {
  const periodsSnap = await getDocs(collection(db, 'users', userId, 'periods'));
  const rows: TxWithPeriod[] = [];

  for (const period of periodsSnap.docs) {
    const txSnap = await getDocs(collection(db, 'users', userId, 'periods', period.id, 'transactions'));
    const logicalPeriodId = logicalPeriodIdFromDocId(period.id, period.data() as any);
    txSnap.forEach((d) => {
      const rowData = d.data() as Omit<Tx, 'id'>;
      if (!docMatchesActiveScope(rowData as any)) return;
      rows.push({
        id: d.id,
        ...rowData,
        periodId: logicalPeriodId,
      });
    });
  }

  rows.sort((a, b) => {
    const periodDiff = a.periodId.localeCompare(b.periodId);
    if (periodDiff !== 0) return periodDiff;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });

  return rows;
}
