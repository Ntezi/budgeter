import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { docMatchesActiveScope, withWorkspaceWrite } from './scope';

export type AccountPeriodOverride = {
  id?: string;
  accountId: string;
  periodId: string;
  currentManual: number;
  workspaceId?: string;
  updatedAt?: unknown;
  updatedBy?: string;
};

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function overrideDocId(accountId: string, periodId: string) {
  return `${encodeURIComponent(accountId)}__${encodeURIComponent(periodId)}`;
}

function accountPeriodOverridesCol(uid: string) {
  return collection(db, 'users', uid, 'accountPeriodOverrides');
}

function overrideDocRef(uid: string, accountId: string, periodId: string) {
  return doc(accountPeriodOverridesCol(uid), overrideDocId(accountId, periodId));
}

export function watchAccountPeriodOverridesForPeriod(
  uid: string,
  periodId: string,
  cb: (rowsByAccountId: Record<string, number>) => void
) {
  const targetPeriodId = normalizeId(periodId);
  const q = query(accountPeriodOverridesCol(uid));
  return onSnapshot(q, (snap) => {
    const out: Record<string, number> = {};
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<AccountPeriodOverride, 'id'>) };
      if (!docMatchesActiveScope(row as any)) return;
      const rowPeriodId = normalizeId(row.periodId);
      const accountId = normalizeId(row.accountId);
      if (!accountId || rowPeriodId !== targetPeriodId) return;
      out[accountId] = toNumber(row.currentManual);
    });
    cb(out);
  });
}

export async function setAccountPeriodCurrentManual(
  uid: string,
  input: {
    accountId: string;
    periodId: string;
    currentManual: number;
    updatedBy?: string;
  }
) {
  const accountId = normalizeId(input.accountId);
  const periodId = normalizeId(input.periodId);
  if (!accountId) throw new Error('Account is required.');
  if (!periodId) throw new Error('Period is required.');
  const currentManual = toNumber(input.currentManual);

  return setDoc(
    overrideDocRef(uid, accountId, periodId),
    withWorkspaceWrite({
      accountId,
      periodId,
      currentManual,
      updatedBy: normalizeId(input.updatedBy || uid),
      updatedAt: serverTimestamp(),
    }),
    { merge: true }
  );
}

export async function clearAccountPeriodCurrentManual(uid: string, accountId: string, periodId: string) {
  const safeAccountId = normalizeId(accountId);
  const safePeriodId = normalizeId(periodId);
  if (!safeAccountId || !safePeriodId) return;
  return deleteDoc(overrideDocRef(uid, safeAccountId, safePeriodId));
}
