import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthUser } from './AuthProvider';
import { monthlyGroupDefs, type WorkspaceDoc, type WorkspaceGroupDef } from '@/lib/repo/workspaces';
import { setActiveRepoScope, type WorkspaceMode } from '@/lib/repo/scope';
import { watchMyWorkspaceMemberships, type WorkspaceMember } from '@/lib/repo/collaboration';

export type WorkspaceOption = {
  workspaceId: string;
  ownerUid: string;
  ownerEmail?: string;
  label: string;
  shared: boolean;
  mode: WorkspaceMode;
  legacyMode: boolean;
};

type WorkspaceContextValue = {
  ready: boolean;
  workspaceUid: string | null;
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceDoc | null;
  workspaceMode: WorkspaceMode;
  groupDefs: WorkspaceGroupDef[];
  legacyMode: boolean;
  activePeriodId: string;
  setActivePeriodId: (pid: string) => Promise<void>;
  workspaceOptions: WorkspaceOption[];
  setWorkspaceUid: (ownerUid: string) => Promise<void>;
  setActiveWorkspaceId: (workspaceId: string) => Promise<void>;
  createWorkspace: (input: {
    name: string;
    mode: WorkspaceMode;
    currency: string;
    periodPolicy: { type: 'MONTHLY' | 'DATE_RANGE'; startDate?: string; endDate?: string };
    groupDefs?: WorkspaceGroupDef[];
    template?: 'WEDDING';
  }) => Promise<string>;
  sharedMemberships: WorkspaceMember[];
};

const WorkspaceCtx = createContext<WorkspaceContextValue | undefined>(undefined);

function workspaceStorageKeyFor(uid: string) {
  return `budgeter:workspace:${uid}`;
}

function periodStorageKeyFor(uid: string) {
  return `budgeter:activePeriod:${uid}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const user = useAuthUser();

  const [ready, setReady] = useState(false);
  const [workspaceUid, setWorkspaceUidState] = useState<string | null>(null);
  const [activePeriodId, setActivePeriodIdState] = useState('');
  const [sharedMemberships, setSharedMemberships] = useState<WorkspaceMember[]>([]);
  const [workspaceSelectedInSession, setWorkspaceSelectedInSession] = useState(false);

  useEffect(() => {
    setActiveRepoScope({ workspaceId: null, legacyMode: true });

    if (!user?.uid) {
      setWorkspaceUidState(null);
      setActivePeriodIdState('');
      setSharedMemberships([]);
      setWorkspaceSelectedInSession(false);
      setReady(true);
      return;
    }

    let mounted = true;
    setReady(false);
    setWorkspaceSelectedInSession(false);

    Promise.all([
      AsyncStorage.getItem(workspaceStorageKeyFor(user.uid)),
      AsyncStorage.getItem(periodStorageKeyFor(user.uid)),
    ])
      .then(([storedWorkspaceUid, storedPeriodId]) => {
        if (!mounted) return;
        setWorkspaceUidState(storedWorkspaceUid || user.uid);
        setActivePeriodIdState(String(storedPeriodId || '').trim());
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    const unsubscribe = watchMyWorkspaceMemberships(user.uid, setSharedMemberships);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user?.uid]);

  const workspaceOptions = useMemo<WorkspaceOption[]>(() => {
    if (!user?.uid) return [];

    const map = new Map<string, WorkspaceOption>();
    map.set(user.uid, {
      workspaceId: user.uid,
      ownerUid: user.uid,
      ownerEmail: user.email ?? '',
      label: user.email ? `My Workspace (${user.email})` : 'My Workspace',
      shared: false,
      mode: 'MONTHLY_3_BUCKET',
      legacyMode: true,
    });

    sharedMemberships.forEach((membership) => {
      if (!membership.ownerUid || membership.ownerUid === user.uid) return;
      map.set(membership.ownerUid, {
        workspaceId: membership.ownerUid,
        ownerUid: membership.ownerUid,
        ownerEmail: membership.ownerEmail,
        label: membership.ownerName || membership.ownerEmail || `Shared (${membership.ownerUid.slice(0, 8)})`,
        shared: true,
        mode: 'MONTHLY_3_BUCKET',
        legacyMode: true,
      });
    });

    return [...map.values()];
  }, [sharedMemberships, user?.email, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !ready) return;
    const exists = workspaceOptions.some((option) => option.ownerUid === workspaceUid);
    const sharedDefault = workspaceOptions.find((option) => option.shared)?.ownerUid || '';
    if (!workspaceSelectedInSession && sharedDefault && workspaceUid !== sharedDefault) {
      setWorkspaceUidState(sharedDefault);
      AsyncStorage.setItem(workspaceStorageKeyFor(user.uid), sharedDefault).catch(() => undefined);
      return;
    }
    if (!workspaceUid || !exists) {
      const next = sharedDefault || user.uid;
      setWorkspaceUidState(next);
      AsyncStorage.setItem(workspaceStorageKeyFor(user.uid), next).catch(() => undefined);
    }
  }, [ready, user?.uid, workspaceOptions, workspaceSelectedInSession, workspaceUid]);

  const setWorkspaceUid = useCallback(
    async (ownerUid: string) => {
      if (!user?.uid) return;
      const next = ownerUid || user.uid;
      setActiveRepoScope({ workspaceId: null, legacyMode: true });
      setWorkspaceSelectedInSession(true);
      setWorkspaceUidState(next);
      await AsyncStorage.setItem(workspaceStorageKeyFor(user.uid), next);
    },
    [user?.uid]
  );

  const setActivePeriodId = useCallback(
    async (pid: string) => {
      if (!user?.uid) return;
      const next = String(pid || '').trim();
      setActivePeriodIdState(next);
      await AsyncStorage.setItem(periodStorageKeyFor(user.uid), next);
    },
    [user?.uid]
  );

  const setActiveWorkspaceId = useCallback(
    async (workspaceId: string) => {
      await setWorkspaceUid(workspaceId);
    },
    [setWorkspaceUid]
  );

  const activeWorkspaceId = workspaceUid;
  const groupDefs = useMemo(() => monthlyGroupDefs(), []);
  const activeWorkspace = useMemo<WorkspaceDoc | null>(() => {
    if (!workspaceUid) return null;
    return {
      id: workspaceUid,
      ownerId: workspaceUid,
      name: workspaceOptions.find((option) => option.ownerUid === workspaceUid)?.label || 'My Workspace',
      memberIds: [workspaceUid],
      rolesByUserId: { [workspaceUid]: 'OWNER' },
      mode: 'MONTHLY_3_BUCKET',
      currency: 'GHS',
      groupDefs,
      periodPolicy: { type: 'MONTHLY' },
      legacyMode: true,
    };
  }, [groupDefs, workspaceOptions, workspaceUid]);

  async function createWorkspace(): Promise<string> {
    throw new Error('Workspace modes are temporarily disabled.');
  }

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      workspaceUid,
      activeWorkspaceId,
      activeWorkspace,
      workspaceMode: 'MONTHLY_3_BUCKET',
      groupDefs,
      legacyMode: true,
      activePeriodId,
      setActivePeriodId,
      workspaceOptions,
      setWorkspaceUid,
      setActiveWorkspaceId,
      createWorkspace,
      sharedMemberships,
    }),
    [
      ready,
      workspaceUid,
      activeWorkspaceId,
      activeWorkspace,
      groupDefs,
      activePeriodId,
      setActivePeriodId,
      workspaceOptions,
      setWorkspaceUid,
      setActiveWorkspaceId,
      sharedMemberships,
    ]
  );

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error('useWorkspace must be used within <WorkspaceProvider>');
  return ctx;
}

export function useWorkspaceUid() {
  return useWorkspace().workspaceUid;
}
