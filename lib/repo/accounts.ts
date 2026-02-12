import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {db} from '../firebase';
import type {WalletType} from '../domain';

export type Account = {
  id?: string;
  name: string;
  type?: WalletType;
  currencyCode?: string;
  openingBalance: number;
  archived?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function accountsCol(uid: string) {
  return collection(db, 'users', uid, 'accounts');
}

export function watchAccounts(
  uid: string,
  cb: (rows: Account[]) => void,
  opts?: {includeArchived?: boolean}
) {
  const q = query(accountsCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const includeArchived = opts?.includeArchived ?? false;
    const rows: Account[] = [];
    snap.forEach((d) => {
      const row = {id: d.id, ...(d.data() as Omit<Account, 'id'>)} as Account;
      if (!includeArchived && row.archived) return;
      rows.push(row);
    });
    cb(rows);
  });
}

export async function addAccount(uid: string, input: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) {
  return addDoc(accountsCol(uid), {
    ...input,
    archived: input.archived ?? false,
    currencyCode: input.currencyCode ?? 'GHS',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateAccount(uid: string, id: string, patch: Partial<Account>) {
  return updateDoc(doc(accountsCol(uid), id), {
    ...patch,
    updatedAt: serverTimestamp(),
  } as Partial<Account>);
}

export async function archiveAccount(uid: string, id: string, archived = true) {
  return updateDoc(doc(accountsCol(uid), id), {
    archived,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAccount(uid: string, id: string) {
  return deleteDoc(doc(accountsCol(uid), id));
}
