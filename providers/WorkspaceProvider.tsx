import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthUser } from './AuthProvider';
import { watchMyWorkspaceMemberships, type WorkspaceMember } from '@/lib/repo/collaboration';

export type WorkspaceOption = {
  ownerUid: string;
  ownerEmail?: string;
  label: string;
  shared: boolean;
};

type WorkspaceContextValue = {
  ready: boolean;
  workspaceUid: string | null;
  activePeriodId: string;
  setActivePeriodId: (pid: string) => Promise<void>;
  workspaceOptions: WorkspaceOption[];
  setWorkspaceUid: (ownerUid: string) => Promise<void>;
  sharedMemberships: WorkspaceMember[];
};

const WorkspaceCtx = createContext<WorkspaceContextValue | undefined>(undefined);

function storageKeyFor(uid: string) {
  return `budgeter:workspace:${uid}`;
}

function periodStorageKeyFor(uid: string) {
  return `budgeter:activePeriod:${uid}`;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const user = useAuthUser();

  const [ready, setReady] = useState(false);
  const [workspaceUid, setWorkspaceUidState] = useState<string | null>(null);
  const [activePeriodId, setActivePeriodIdState] = useState<string>('');
  const [sharedMemberships, setSharedMemberships] = useState<WorkspaceMember[]>([]);
  const [storageInitialized, setStorageInitialized] = useState(false);
  const [manualWorkspaceSelectionThisSession, setManualWorkspaceSelectionThisSession] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setWorkspaceUidState(null);
      setActivePeriodIdState('');
      setSharedMemberships([]);
      setStorageInitialized(false);
      setManualWorkspaceSelectionThisSession(false);
      setReady(true);
      return;
    }

    let mounted = true;
    setReady(false);
    setStorageInitialized(false);
    setManualWorkspaceSelectionThisSession(false);

    Promise.all([
      AsyncStorage.getItem(storageKeyFor(user.uid)),
      AsyncStorage.getItem(periodStorageKeyFor(user.uid)),
    ])
      .then(([storedUid, storedPid]) => {
        if (!mounted) return;
        setWorkspaceUidState(storedUid?.trim() || user.uid);
        setActivePeriodIdState(storedPid?.trim() || '');
      })
      .finally(() => {
        if (mounted) {
          setStorageInitialized(true);
          setReady(true);
        }
      });

    const unsubs = watchMyWorkspaceMemberships(user.uid, setSharedMemberships);
    return () => {
      mounted = false;
      unsubs();
    };
  }, [user?.uid]);

  const workspaceOptions = useMemo<WorkspaceOption[]>(() => {
    if (!user?.uid) return [];

    const ownLabel = user.email ? `My Workspace (${user.email})` : 'My Workspace';
    const map = new Map<string, WorkspaceOption>();
    map.set(user.uid, {
      ownerUid: user.uid,
      ownerEmail: user.email ?? '',
      label: ownLabel,
      shared: false,
    });

    sharedMemberships.forEach((membership) => {
      if (!membership.ownerUid || membership.ownerUid === user.uid) return;
      const label = membership.ownerName || membership.ownerEmail || `Shared (${membership.ownerUid.slice(0, 8)})`;
      map.set(membership.ownerUid, {
        ownerUid: membership.ownerUid,
        ownerEmail: membership.ownerEmail,
        label,
        shared: true,
      });
    });

    return [...map.values()];
  }, [sharedMemberships, user?.email, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!storageInitialized || manualWorkspaceSelectionThisSession) return;
    // Default invited users to the first shared workspace when they log in.
    const firstSharedOwnerUid = sharedMemberships.find((membership) => membership.ownerUid && membership.ownerUid !== user.uid)?.ownerUid;
    if (firstSharedOwnerUid && workspaceUid !== firstSharedOwnerUid) {
      setWorkspaceUidState(firstSharedOwnerUid);
      AsyncStorage.setItem(storageKeyFor(user.uid), firstSharedOwnerUid).catch(() => undefined);
    }
  }, [manualWorkspaceSelectionThisSession, sharedMemberships, storageInitialized, user?.uid, workspaceUid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!workspaceOptions.length) {
      setWorkspaceUidState(user.uid);
      return;
    }
    const exists = workspaceOptions.some((option) => option.ownerUid === workspaceUid);
    if (!exists) {
      setWorkspaceUidState(user.uid);
      AsyncStorage.setItem(storageKeyFor(user.uid), user.uid).catch(() => undefined);
    }
  }, [workspaceOptions, workspaceUid, user?.uid]);

  const setWorkspaceUid = useCallback(async (ownerUid: string) => {
    if (!user?.uid) return;
    const next = ownerUid || user.uid;
    setManualWorkspaceSelectionThisSession(true);
    setWorkspaceUidState(next);
    await AsyncStorage.setItem(storageKeyFor(user.uid), next);
  }, [user?.uid]);

  const setActivePeriodId = useCallback(async (pid: string) => {
    if (!user?.uid) return;
    setActivePeriodIdState(pid);
    await AsyncStorage.setItem(periodStorageKeyFor(user.uid), pid);
  }, [user?.uid]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      workspaceUid,
      activePeriodId,
      setActivePeriodId,
      workspaceOptions,
      setWorkspaceUid,
      sharedMemberships,
    }),
    [ready, workspaceUid, activePeriodId, setActivePeriodId, workspaceOptions, sharedMemberships, setWorkspaceUid]
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
