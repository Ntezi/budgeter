import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

export type WorkspaceMemberStatus = 'ACTIVE' | 'REMOVED';

export type WorkspaceMember = {
  id?: string;
  ownerUid: string;
  ownerEmail?: string;
  ownerName?: string;
  memberUid: string;
  memberEmail?: string;
  memberName?: string;
  status?: WorkspaceMemberStatus;
  role?: 'MEMBER';
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function workspaceMembersCol() {
  return collection(db, 'workspaceMembers');
}

export function workspaceMemberDocId(ownerUid: string, memberUid: string) {
  return `${ownerUid}_${memberUid}`;
}

export function watchOwnedWorkspaceMembers(ownerUid: string, cb: (rows: WorkspaceMember[]) => void) {
  const q = query(workspaceMembersCol(), where('ownerUid', '==', ownerUid));
  return onSnapshot(q, (snap) => {
    const rows: WorkspaceMember[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<WorkspaceMember, 'id'>) };
      if (row.status === 'REMOVED') return;
      rows.push(row);
    });
    rows.sort((a, b) => {
      const aName = (a.memberEmail || a.memberUid || '').toLowerCase();
      const bName = (b.memberEmail || b.memberUid || '').toLowerCase();
      return aName.localeCompare(bName);
    });
    cb(rows);
  });
}

export function watchMyWorkspaceMemberships(memberUid: string, cb: (rows: WorkspaceMember[]) => void) {
  const q = query(workspaceMembersCol(), where('memberUid', '==', memberUid));
  return onSnapshot(q, (snap) => {
    const rows: WorkspaceMember[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<WorkspaceMember, 'id'>) };
      if (row.status === 'REMOVED') return;
      rows.push(row);
    });
    rows.sort((a, b) => {
      const aName = (a.ownerEmail || a.ownerUid || '').toLowerCase();
      const bName = (b.ownerEmail || b.ownerUid || '').toLowerCase();
      return aName.localeCompare(bName);
    });
    cb(rows);
  });
}

export async function inviteWorkspaceMember(
  ownerUid: string,
  input: {
    ownerEmail?: string;
    ownerName?: string;
    memberUid: string;
    memberEmail?: string;
    memberName?: string;
  }
) {
  const memberUid = input.memberUid.trim();
  if (!memberUid) throw new Error('Member UID is required.');
  if (memberUid.includes('/')) throw new Error('Member UID is invalid.');
  if (memberUid === ownerUid) return;

  const id = workspaceMemberDocId(ownerUid, memberUid);
  return setDoc(
    doc(workspaceMembersCol(), id),
    {
      ownerUid,
      ownerEmail: (input.ownerEmail || '').toLowerCase(),
      ownerName: input.ownerName || '',
      memberUid,
      memberEmail: (input.memberEmail || '').toLowerCase(),
      memberName: input.memberName || '',
      role: 'MEMBER',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<WorkspaceMember, 'id'>,
    { merge: true }
  );
}

export async function removeWorkspaceMember(ownerUid: string, memberUid: string) {
  const id = workspaceMemberDocId(ownerUid, memberUid);
  return deleteDoc(doc(workspaceMembersCol(), id));
}
