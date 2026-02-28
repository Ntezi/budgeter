import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  updateDoc,
  collection,
  getDocs,
  writeBatch,
  deleteDoc,
  onSnapshot as onSnap,
  serverTimestamp,
  query,
  limit,
} from 'firebase/firestore';

import { db } from '../firebase';
import { addMonths, format } from 'date-fns';
import { transactionSignedBudgetAmount } from '../accounting';
import {
  docMatchesActiveScope,
  logicalPeriodIdFromDocId,
  scopedPeriodDocId,
  withWorkspaceWrite,
  type WorkspaceMode,
} from './scope';

export type Group = 'NEED' | 'WANT' | 'SAVINGS_DEBT' | string;
export type PeriodStatus = 'DRAFT' | 'DECIDED';

export type PeriodDoc = {
  title?: string;
  status?: PeriodStatus;
  incomeTotal: number;
  targetPct: { needs: number; wants: number; sd: number };
  manualTargets?: { needs: number; wants: number; sd: number };
  workspaceId?: string;
  periodId?: string;
  type?: 'MONTHLY' | 'EVENT' | 'CUSTOM';
  startDate?: string;
  endDate?: string;
  mode?: WorkspaceMode;
  createdAt?: any;
};

function periodRef(userId: string, periodId: string) {
  return doc(db, 'users', userId, 'periods', scopedPeriodDocId(periodId));
}

export const periodIdFromDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const nextMonthMeta = (d = new Date()) => {
  const next = addMonths(d, 1);
  return {
    id: periodIdFromDate(next),
    title: format(next, 'MMMM yyyy'),
  };
};

export function nextMonthIdFromPeriodId(periodId: string) {
  const [yearRaw, monthRaw] = String(periodId || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return '';
  const dt = new Date(year, month - 1, 1);
  dt.setMonth(dt.getMonth() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function periodTitleFromId(periodId: string) {
  const [yearRaw, monthRaw] = periodId.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month || month < 1 || month > 12) return periodId;
  return format(new Date(year, month - 1, 1), 'MMMM yyyy');
}

export async function getOrCreatePeriod(userId: string, periodId: string) {
  const ref = periodRef(userId, periodId);
  const snap = await getDoc(ref);
  const defaultTitle = periodTitleFromId(periodId);
  if (!snap.exists()) {
    await setDoc(
      ref,
      withWorkspaceWrite({
        title: defaultTitle,
        periodId,
        status: 'DRAFT',
        incomeTotal: 0,
        targetPct: { needs: 0.5, wants: 0.3, sd: 0.2 },
        createdAt: serverTimestamp(),
      } as PeriodDoc)
    );
  } else if (!snap.data().title) {
    await updateDoc(ref, { title: defaultTitle });
  } else {
    const data = snap.data();
    const patch: any = {};
    if (!data.title) patch.title = defaultTitle;
    if (!data.createdAt) patch.createdAt = serverTimestamp();
    if (!data.periodId) patch.periodId = periodId;
    if (Object.keys(patch).length) await updateDoc(ref, withWorkspaceWrite(patch));
  }
  return ref;
}

export async function createPeriod(userId: string, periodId: string, title: string, options?: Partial<PeriodDoc>) {
  const ref = periodRef(userId, periodId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      withWorkspaceWrite({
        title: title || periodTitleFromId(periodId),
        periodId,
        status: 'DRAFT',
        incomeTotal: 0,
        targetPct: { needs: 0.5, wants: 0.3, sd: 0.2 },
        type: options?.type,
        startDate: options?.startDate,
        endDate: options?.endDate,
        mode: options?.mode,
        createdAt: serverTimestamp(),
      } as PeriodDoc)
    );
  }
  return ref;
}

export function watchPeriods(userId: string, cb: (rows: (PeriodDoc & { id: string })[]) => void) {
  const col = collection(db, 'users', userId, 'periods');
  return onSnap(col, (snap) => {
    const out: (PeriodDoc & { id: string })[] = [];
    snap.forEach((d) => {
      const row = d.data() as PeriodDoc;
      if (!docMatchesActiveScope(row)) return;
      out.push({
        id: logicalPeriodIdFromDocId(d.id, row as any),
        ...row,
      });
    });
    out.sort((a, b) => {
      const at = (a as any).createdAt?.toMillis?.() ?? 0;
      const bt = (b as any).createdAt?.toMillis?.() ?? 0;
      if (at !== bt) return bt - at;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
    cb(out);
  });
}

export function watchPeriod(userId: string, periodId: string, cb: (p: PeriodDoc) => void) {
  const ref = periodRef(userId, periodId);
  return onSnapshot(ref, (s) => {
    if (!s.exists()) return;
    const row = s.data() as PeriodDoc;
    if (!docMatchesActiveScope(row)) return;
    cb(row);
  });
}

export async function setPeriodTitle(userId: string, periodId: string, title: string) {
  const ref = periodRef(userId, periodId);
  await updateDoc(ref, withWorkspaceWrite({ title }));
}

export async function setPeriodStatus(userId: string, periodId: string, status: PeriodStatus) {
  const ref = periodRef(userId, periodId);
  await updateDoc(ref, withWorkspaceWrite({ status }));
}

export async function setIncome(userId: string, periodId: string, incomeTotal: number) {
  const ref = periodRef(userId, periodId);
  await updateDoc(ref, withWorkspaceWrite({ incomeTotal }));
}

export async function setTargetPct(
  userId: string,
  periodId: string,
  targetPct: { needs: number; wants: number; sd: number }
) {
  const ref = periodRef(userId, periodId);
  await updateDoc(ref, withWorkspaceWrite({ targetPct }));
}

export async function assertPeriodEditable(userId: string, periodId: string) {
  const ref = periodRef(userId, periodId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const row = snap.data() as PeriodDoc;
  if (!docMatchesActiveScope(row)) return;
  if (row.status === 'DECIDED') {
    throw new Error('This budget is DECIDED and locked for plan/income/transaction edits.');
  }
}

export function watchTransactionsTotals(
  userId: string,
  periodId: string,
  cb: (totals: { needs: number; wants: number; sd: number }) => void
) {
  const q = query(collection(db, 'users', userId, 'periods', scopedPeriodDocId(periodId), 'transactions'));
  return onSnap(q, (snap) => {
    const totals = { needs: 0, wants: 0, sd: 0 };
    snap.forEach((d) => {
      const tx = d.data() as any;
      if (!docMatchesActiveScope(tx)) return;
      const amount = transactionSignedBudgetAmount(tx);
      if (!amount) return;
      const { group } = tx;
      if (group === 'NEED') totals.needs += amount;
      else if (group === 'WANT') totals.wants += amount;
      else totals.sd += amount;
    });
    cb(totals);
  });
}

export async function deletePeriod(userId: string, periodId: string) {
  const ref = periodRef(userId, periodId);
  const subs = ['transactions', 'incomeItems', 'planItems', 'allocations', 'walletAccounts'];
  const scopedId = scopedPeriodDocId(periodId);
  for (const name of subs) {
    const colRef = collection(db, 'users', userId, 'periods', scopedId, name);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snap = await getDocs(query(colRef, limit(400)));
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(ref);
}
