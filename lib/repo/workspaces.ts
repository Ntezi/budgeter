import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { WorkspaceMode } from './scope';

export type WorkspaceRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export type WorkspaceGroupDef = {
  id: string;
  name: string;
  order: number;
  archived?: boolean;
};

export type WorkspaceDoc = {
  id?: string;
  ownerId: string;
  name?: string;
  memberIds: string[];
  rolesByUserId: Record<string, WorkspaceRole>;
  mode: WorkspaceMode;
  currency: string;
  groupDefs: WorkspaceGroupDef[];
  periodPolicy: {
    type: 'MONTHLY' | 'DATE_RANGE';
    startDate?: string;
    endDate?: string;
  };
  settings?: {
    settlementEnabled?: boolean;
    nudgesEnabled?: boolean;
    remindersEnabled?: boolean;
  };
  legacyMode?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type UserWorkspacePrefs = {
  activeWorkspaceId: string | null;
  activePeriodId: string | null;
  updatedAt?: unknown;
};

export function workspaceDocRef(workspaceId: string) {
  return doc(db, 'workspaces', workspaceId);
}

export function defaultWorkspaceIdFor(uid: string) {
  return `legacy_${uid}`;
}

export function monthlyGroupDefs(): WorkspaceGroupDef[] {
  return [
    { id: 'NEED', name: 'Need', order: 0 },
    { id: 'WANT', name: 'Want', order: 1 },
    { id: 'SAVINGS_DEBT', name: 'Savings / Debt', order: 2 },
  ];
}

export function weddingGroupDefs(): WorkspaceGroupDef[] {
  return [
    { id: 'VENUE', name: 'Venue', order: 0 },
    { id: 'CATERING', name: 'Catering', order: 1 },
    { id: 'ATTIRE', name: 'Attire', order: 2 },
    { id: 'DECOR', name: 'Decor', order: 3 },
    { id: 'PHOTO_VIDEO', name: 'Photo / Video', order: 4 },
    { id: 'INVITATIONS', name: 'Invitations', order: 5 },
    { id: 'TRANSPORT', name: 'Transport', order: 6 },
    { id: 'MISC', name: 'Misc', order: 7 },
  ];
}

function workspaceTemplateGroups(mode: WorkspaceMode, template?: string) {
  if (mode === 'MONTHLY_3_BUCKET') return monthlyGroupDefs();
  if (mode === 'EVENT' && template === 'WEDDING') return weddingGroupDefs();
  return [];
}

export async function seedDefaultWorkspaceIfMissing(uid: string, email?: string) {
  const workspaceId = defaultWorkspaceIdFor(uid);
  const ref = workspaceDocRef(workspaceId);
  const snap = await getDoc(ref);
  if (snap.exists()) return workspaceId;
  await setDoc(
    ref,
    {
      ownerId: uid,
      name: email ? `Default (${email})` : 'Default Workspace',
      memberIds: [uid],
      rolesByUserId: { [uid]: 'OWNER' },
      mode: 'MONTHLY_3_BUCKET',
      currency: 'GHS',
      groupDefs: monthlyGroupDefs(),
      periodPolicy: { type: 'MONTHLY' },
      settings: {
        settlementEnabled: true,
        nudgesEnabled: true,
      },
      legacyMode: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<WorkspaceDoc, 'id'>
  );
  return workspaceId;
}

export function watchMyWorkspaces(uid: string, cb: (rows: WorkspaceDoc[]) => void): Unsubscribe {
  const q = query(collection(db, 'workspaces'), where('memberIds', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const rows: WorkspaceDoc[] = [];
    snap.forEach((d) => {
      const row = { id: d.id, ...(d.data() as Omit<WorkspaceDoc, 'id'>) };
      rows.push(row);
    });
    rows.sort((a, b) => {
      if (a.legacyMode && !b.legacyMode) return -1;
      if (!a.legacyMode && b.legacyMode) return 1;
      return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
    });
    cb(rows);
  });
}

export async function createWorkspace(
  uid: string,
  input: {
    name: string;
    mode: WorkspaceMode;
    currency: string;
    periodPolicy: {
      type: 'MONTHLY' | 'DATE_RANGE';
      startDate?: string;
      endDate?: string;
    };
    groupDefs?: WorkspaceGroupDef[];
    template?: 'WEDDING';
    settings?: WorkspaceDoc['settings'];
  }
) {
  const id = doc(collection(db, 'workspaces')).id;
  const groups = (input.groupDefs && input.groupDefs.length ? input.groupDefs : workspaceTemplateGroups(input.mode, input.template))
    .map((row, index) => ({
      id: String(row.id || '').trim() || `GROUP_${index + 1}`,
      name: String(row.name || '').trim() || `Group ${index + 1}`,
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : index,
      archived: row.archived === true,
    }));

  await setDoc(
    workspaceDocRef(id),
    {
      ownerId: uid,
      name: input.name.trim() || 'Workspace',
      memberIds: [uid],
      rolesByUserId: { [uid]: 'OWNER' },
      mode: input.mode,
      currency: input.currency.trim() || 'GHS',
      groupDefs: groups,
      periodPolicy: {
        type: input.periodPolicy.type,
        startDate: input.periodPolicy.startDate || '',
        endDate: input.periodPolicy.endDate || '',
      },
      settings: {
        settlementEnabled: input.settings?.settlementEnabled !== false,
        nudgesEnabled: input.settings?.nudgesEnabled !== false,
      },
      legacyMode: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<WorkspaceDoc, 'id'>
  );

  return id;
}

export function userPrefsRef(uid: string) {
  return doc(db, 'users', uid, 'prefs', 'workspace');
}

export function watchUserWorkspacePrefs(uid: string, cb: (prefs: UserWorkspacePrefs) => void): Unsubscribe {
  return onSnapshot(userPrefsRef(uid), (snap) => {
    if (!snap.exists()) {
      cb({ activeWorkspaceId: null, activePeriodId: null });
      return;
    }
    const data = snap.data() as Partial<UserWorkspacePrefs>;
    cb({
      activeWorkspaceId: data.activeWorkspaceId ?? null,
      activePeriodId: data.activePeriodId ?? null,
      updatedAt: data.updatedAt,
    });
  });
}

export async function setUserWorkspacePrefs(uid: string, patch: Partial<UserWorkspacePrefs>) {
  await setDoc(
    userPrefsRef(uid),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
