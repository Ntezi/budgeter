import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {db} from '../firebase';
import type {WalletTag} from '../domain';
import {
  docMatchesActiveScope,
  logicalPeriodIdFromDocId,
  scopedPeriodDocId,
  withWorkspaceWrite,
} from './scope';

export type AllocationSourceType = 'PLAN' | 'INCOME';

export type Allocation = {
  id?: string;
  accountId: string;
  amount: number;
  tag: WalletTag;
  note?: string;
  sourceType?: AllocationSourceType;
  sourceItemId?: string;
  sourceItemName?: string;
  workspaceId?: string;
  periodId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type AllocationDefault = {
  id?: string;
  accountId: string;
  amount: number;
  tag: WalletTag;
  active?: boolean;
  workspaceId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type AllocationTotals = {
  needs: number;
  wants: number;
  savings: number;
  total: number;
};

export type PeriodWalletAccount = {
  id?: string;
  accountId: string;
  workspaceId?: string;
  periodId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function compactFields(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function emptyAllocationTotals(): AllocationTotals {
  return {needs: 0, wants: 0, savings: 0, total: 0};
}

export function toAllocationTotals(rows: Allocation[]): AllocationTotals {
  const totals = emptyAllocationTotals();
  for (const row of rows) {
    const amount = row.amount || 0;
    if (row.tag === 'NEEDS') totals.needs += amount;
    else if (row.tag === 'WANTS') totals.wants += amount;
    else totals.savings += amount;
  }
  totals.total = totals.needs + totals.wants + totals.savings;
  return totals;
}

export function allocationsCol(uid: string, pid: string) {
  return collection(db, 'users', uid, 'periods', scopedPeriodDocId(pid), 'allocations');
}

export function periodWalletAccountsCol(uid: string, pid: string) {
  return collection(db, 'users', uid, 'periods', scopedPeriodDocId(pid), 'walletAccounts');
}

export function allocationDefaultsCol(uid: string) {
  return collection(db, 'users', uid, 'allocationDefaults');
}

export function watchAllocations(
  uid: string,
  pid: string,
  cb: (rows: Allocation[], totals: AllocationTotals) => void
) {
  const q = query(allocationsCol(uid, pid));
  return onSnapshot(q, (snap) => {
    const rows: Allocation[] = [];
    snap.forEach((d) => {
      const row = {id: d.id, ...(d.data() as Omit<Allocation, 'id'>)};
      if (!docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    cb(rows, toAllocationTotals(rows));
  });
}

export async function addAllocation(uid: string, pid: string, input: Omit<Allocation, 'id' | 'createdAt' | 'updatedAt'>) {
  return addDoc(allocationsCol(uid, pid), compactFields(withWorkspaceWrite({
    ...input,
    periodId: pid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })));
}

export async function updateAllocation(uid: string, pid: string, id: string, patch: Partial<Allocation>) {
  return updateDoc(doc(allocationsCol(uid, pid), id), compactFields(withWorkspaceWrite({
    ...patch,
    periodId: pid,
    updatedAt: serverTimestamp(),
  })) as Partial<Allocation>);
}

export async function deleteAllocation(uid: string, pid: string, id: string) {
  return deleteDoc(doc(allocationsCol(uid, pid), id));
}

export function watchPeriodWalletAccounts(uid: string, pid: string, cb: (accountIds: string[]) => void) {
  const q = query(periodWalletAccountsCol(uid, pid));
  return onSnapshot(q, (snap) => {
    const ids: string[] = [];
    snap.forEach((d) => {
      const row = {id: d.id, ...(d.data() as Omit<PeriodWalletAccount, 'id'>)};
      if (!docMatchesActiveScope(row as any)) return;
      ids.push(row.accountId || d.id);
    });
    ids.sort((a, b) => a.localeCompare(b));
    cb(ids);
  });
}

export async function addPeriodWalletAccount(uid: string, pid: string, accountId: string) {
  return setDoc(
    doc(periodWalletAccountsCol(uid, pid), accountId),
    withWorkspaceWrite({
      accountId,
      periodId: pid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    {merge: true}
  );
}

export async function removePeriodWalletAccount(uid: string, pid: string, accountId: string) {
  return deleteDoc(doc(periodWalletAccountsCol(uid, pid), accountId));
}

export function allocationDocIdForSource(sourceType: AllocationSourceType, sourceItemId: string) {
  return `item_${sourceType.toLowerCase()}_${sourceItemId}`;
}

export async function upsertAllocationForBudgetItem(
  uid: string,
  pid: string,
  input: {
    sourceType: AllocationSourceType;
    sourceItemId: string;
    sourceItemName: string;
    accountId: string;
    amount: number;
    tag: WalletTag;
    note?: string;
  }
) {
  const id = allocationDocIdForSource(input.sourceType, input.sourceItemId);
  return setDoc(
    doc(allocationsCol(uid, pid), id),
    compactFields(withWorkspaceWrite({
      ...input,
      periodId: pid,
      note: input.note ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })),
    {merge: true}
  );
}

export function watchAllocationDefaults(uid: string, cb: (rows: AllocationDefault[]) => void) {
  const q = query(allocationDefaultsCol(uid));
  return onSnapshot(q, (snap) => {
    const rows: AllocationDefault[] = [];
    snap.forEach((d) => {
      const row = {id: d.id, ...(d.data() as Omit<AllocationDefault, 'id'>)};
      if (!docMatchesActiveScope(row as any)) return;
      rows.push(row);
    });
    rows.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    cb(rows);
  });
}

export async function addAllocationDefault(
  uid: string,
  input: Omit<AllocationDefault, 'id' | 'createdAt' | 'updatedAt'>
) {
  return addDoc(allocationDefaultsCol(uid), withWorkspaceWrite({
    ...input,
    active: input.active ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
}

export async function updateAllocationDefault(uid: string, id: string, patch: Partial<AllocationDefault>) {
  return updateDoc(doc(allocationDefaultsCol(uid), id), withWorkspaceWrite({
    ...patch,
    updatedAt: serverTimestamp(),
  } as Partial<AllocationDefault>));
}

export async function deleteAllocationDefault(uid: string, id: string) {
  return deleteDoc(doc(allocationDefaultsCol(uid), id));
}

export async function applyAllocationDefaultsForPeriod(uid: string, pid: string, rows?: AllocationDefault[]) {
  const defaults = rows ?? await listAllocationDefaults(uid);
  const active = defaults.filter((row) => row.active !== false && row.amount > 0 && row.accountId);
  for (const row of active) {
    if (!row.id) continue;
    const id = `default_${row.id}`;
    await setDoc(
      doc(allocationsCol(uid, pid), id),
      withWorkspaceWrite({
        accountId: row.accountId,
        amount: row.amount,
        tag: row.tag,
        periodId: pid,
        note: 'Auto-applied from defaults',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      {merge: true}
    );
    await setDoc(
      doc(periodWalletAccountsCol(uid, pid), row.accountId),
      withWorkspaceWrite({
        accountId: row.accountId,
        periodId: pid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      {merge: true}
    );
  }
  return active.length;
}

export async function listAllocationDefaults(uid: string) {
  const snap = await getDocs(allocationDefaultsCol(uid));
  const rows: AllocationDefault[] = [];
  snap.forEach((d) => {
    const row = {id: d.id, ...(d.data() as Omit<AllocationDefault, 'id'>)};
    if (!docMatchesActiveScope(row as any)) return;
    rows.push(row);
  });
  return rows;
}

export async function listAllAllocations(uid: string) {
  const periodsSnap = await getDocs(collection(db, 'users', uid, 'periods'));
  const rows: (Allocation & {periodId: string})[] = [];
  for (const period of periodsSnap.docs) {
    if (!docMatchesActiveScope(period.data() as any)) continue;
    const logicalPeriodId = logicalPeriodIdFromDocId(period.id, period.data() as any);
    const allocationsSnap = await getDocs(collection(db, 'users', uid, 'periods', period.id, 'allocations'));
    allocationsSnap.forEach((d) => {
      const rowData = d.data() as Omit<Allocation, 'id'>;
      if (!docMatchesActiveScope(rowData as any)) return;
      rows.push({
        id: d.id,
        ...rowData,
        periodId: logicalPeriodId,
      });
    });
  }
  rows.sort((a, b) => a.periodId.localeCompare(b.periodId));
  return rows;
}
