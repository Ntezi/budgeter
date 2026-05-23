import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthUser } from './AuthProvider';
import {
  createWorkspace as createWorkspaceDoc,
  defaultWorkspaceIdFor,
  monthlyGroupDefs,
  seedDefaultWorkspaceIfMissing,
  setUserWorkspacePrefs,
  type WorkspaceDoc,
  type WorkspaceGroupDef,
  watchMyWorkspaces,
  watchUserWorkspacePrefs,
} from '@/lib/repo/workspaces';
import { setActiveRepoScope, type WorkspaceMode } from '@/lib/repo/scope';

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
  // Backward-compatible alias used by existing screens/repos as data owner uid.
  workspaceUid: string | null;
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceDoc | null;
  workspaceMode: WorkspaceMode;
  groupDefs: WorkspaceGroupDef[];
  legacyMode: boolean;
  activePeriodId: string;
  setActivePeriodId: (pid: string) => Promise<void>;
  workspaceOptions: WorkspaceOption[];
  // Backward-compatible setter (accepts ownerUid or workspaceId).
  setWorkspaceUid: (value: string) => Promise<void>;
  setActiveWorkspaceId: (workspaceId: string) => Promise<void>;
  createWorkspace: (input: {
    name: string;
    mode: WorkspaceMode;
    currency: string;
    periodPolicy: { type: 'MONTHLY' | 'DATE_RANGE'; startDate?: string; endDate?: string };
    groupDefs?: WorkspaceGroupDef[];
    template?: 'WEDDING';
  }) => Promise<string>;
  sharedMemberships: any[];
};

const WorkspaceCtx = createContext<WorkspaceContextValue | undefined>(undefined);

function periodStorageKeyFor(uid: string) {
  return `budgeter:activePeriod:${uid}`;
}

function fallbackLegacyWorkspace(uid: string, email?: string | null): WorkspaceDoc {
  return {
    id: defaultWorkspaceIdFor(uid),
    ownerId: uid,
    name: email ? `Default (${email})` : 'Default Workspace',
    memberIds: [uid],
    rolesByUserId: { [uid]: 'OWNER' },
    mode: 'MONTHLY_3_BUCKET',
    currency: 'GHS',
    groupDefs: monthlyGroupDefs(),
    periodPolicy: { type: 'MONTHLY' },
    legacyMode: true,
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const user = useAuthUser();

  const [ready, setReady] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceDoc[]>([]);
  const [activeWorkspaceIdState, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [activePeriodId, setActivePeriodIdState] = useState<string>('');
  const [storageReady, setStorageReady] = useState(false);
  const [workspaceSelectedInSession, setWorkspaceSelectedInSession] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setWorkspaces([]);
      setActiveWorkspaceIdState(null);
      setActivePeriodIdState('');
      setWorkspaceSelectedInSession(false);
      setReady(true);
      setStorageReady(false);
      setActiveRepoScope({ workspaceId: null, legacyMode: true });
      return;
    }

    let mounted = true;
    setReady(false);
    setStorageReady(false);
    setWorkspaceSelectedInSession(false);

    AsyncStorage.getItem(periodStorageKeyFor(user.uid))
      .then((storedPid) => {
        if (!mounted) return;
        setActivePeriodIdState(String(storedPid || '').trim());
      })
      .finally(() => {
        if (mounted) setStorageReady(true);
      });

    seedDefaultWorkspaceIfMissing(user.uid, user.email || '').catch(() => undefined);

    const unsubWorkspaces = watchMyWorkspaces(
      user.uid,
      (rows) => {
        if (!mounted) return;
        setWorkspaces(rows);
      },
      (error) => {
        console.error('Failed to load workspaces', error);
        if (!mounted) return;
        setWorkspaces([]);
      }
    );

    const unsubPrefs = watchUserWorkspacePrefs(
      user.uid,
      (prefs) => {
        if (!mounted) return;
        if (prefs.activeWorkspaceId !== undefined) {
          setActiveWorkspaceIdState(prefs.activeWorkspaceId || null);
        }
        if (prefs.activePeriodId !== undefined && prefs.activePeriodId !== null) {
          setActivePeriodIdState(String(prefs.activePeriodId || '').trim());
        }
      },
      (error) => {
        console.error('Failed to load workspace preferences', error);
      }
    );

    return () => {
      mounted = false;
      unsubWorkspaces();
      unsubPrefs();
    };
  }, [user?.uid, user?.email]);

  const defaultWorkspaceId = useMemo(
    () => (user?.uid ? defaultWorkspaceIdFor(user.uid) : null),
    [user?.uid]
  );

  const effectiveWorkspaces = useMemo(() => {
    if (!user?.uid) return workspaces;
    const fallback = fallbackLegacyWorkspace(user.uid, user.email || '');
    if (workspaces.some((row) => row.id === fallback.id)) return workspaces;
    return [fallback, ...workspaces];
  }, [user?.email, user?.uid, workspaces]);

  const activeWorkspaceId = useMemo(() => {
    if (!user?.uid) return null;
    const preferred = String(activeWorkspaceIdState || '').trim();
    if (workspaceSelectedInSession && preferred && effectiveWorkspaces.some((row) => row.id === preferred)) return preferred;
    if (defaultWorkspaceId && effectiveWorkspaces.some((row) => row.id === defaultWorkspaceId)) return defaultWorkspaceId;
    if (preferred && effectiveWorkspaces.some((row) => row.id === preferred)) return preferred;
    return effectiveWorkspaces[0]?.id || defaultWorkspaceId || null;
  }, [activeWorkspaceIdState, defaultWorkspaceId, effectiveWorkspaces, user?.uid, workspaceSelectedInSession]);

  const activeWorkspace = useMemo(() => {
    if (!activeWorkspaceId) return null;
    return effectiveWorkspaces.find((row) => row.id === activeWorkspaceId) || null;
  }, [activeWorkspaceId, effectiveWorkspaces]);

  const legacyMode = useMemo(() => {
    if (!activeWorkspace) return true;
    return activeWorkspace.legacyMode === true;
  }, [activeWorkspace]);

  const workspaceUid = useMemo(() => {
    if (!user?.uid) return null;
    return activeWorkspace?.ownerId || user.uid;
  }, [activeWorkspace?.ownerId, user?.uid]);

  const workspaceMode = useMemo<WorkspaceMode>(() => {
    if (activeWorkspace?.mode) return activeWorkspace.mode;
    return 'MONTHLY_3_BUCKET';
  }, [activeWorkspace?.mode]);

  const groupDefs = useMemo<WorkspaceGroupDef[]>(() => {
    if (Array.isArray(activeWorkspace?.groupDefs) && activeWorkspace.groupDefs.length) {
      return [...activeWorkspace.groupDefs].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    }
    return monthlyGroupDefs();
  }, [activeWorkspace?.groupDefs]);

  const workspaceOptions = useMemo<WorkspaceOption[]>(() => {
    return effectiveWorkspaces.map((workspace) => {
      const ownerUid = workspace.ownerId;
      const label = workspace.name || (workspace.legacyMode ? 'Default Workspace' : `Workspace ${String(workspace.id || '').slice(0, 8)}`);
      return {
        workspaceId: workspace.id || '',
        ownerUid,
        ownerEmail: '',
        label,
        shared: Boolean(user?.uid && ownerUid && ownerUid !== user.uid),
        mode: workspace.mode || 'MONTHLY_3_BUCKET',
        legacyMode: workspace.legacyMode === true,
      };
    });
  }, [effectiveWorkspaces, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !activeWorkspaceId || !storageReady) return;
    setUserWorkspacePrefs(user.uid, {
      activeWorkspaceId,
      activePeriodId: activePeriodId || null,
    }).catch(() => undefined);
  }, [activePeriodId, activeWorkspaceId, storageReady, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !activeWorkspaceId || !storageReady) return;
    setReady(true);
  }, [activeWorkspaceId, storageReady, user?.uid]);

  useEffect(() => {
    setActiveRepoScope({
      workspaceId: legacyMode ? null : activeWorkspaceId,
      legacyMode,
    });
  }, [activeWorkspaceId, legacyMode]);

  async function setActiveWorkspaceId(workspaceId: string) {
    if (!user?.uid) return;
    const next = String(workspaceId || '').trim();
    if (!next) return;
    const option = workspaceOptions.find((row) => row.workspaceId === next);
    setActiveRepoScope({
      workspaceId: option?.legacyMode ? null : next,
      legacyMode: option?.legacyMode === true,
    });
    setWorkspaceSelectedInSession(true);
    setActiveWorkspaceIdState(next);
    await setUserWorkspacePrefs(user.uid, { activeWorkspaceId: next });
  }

  // Compatibility helper used by existing settings screen (accepts ownerUid or workspaceId).
  async function setWorkspaceUid(value: string) {
    if (!user?.uid) return;
    const needle = String(value || '').trim();
    if (!needle) return;

    const byWorkspaceId = workspaceOptions.find((row) => row.workspaceId === needle);
    if (byWorkspaceId?.workspaceId) {
      await setActiveWorkspaceId(byWorkspaceId.workspaceId);
      return;
    }

    const byOwner = workspaceOptions.find((row) => row.ownerUid === needle);
    if (byOwner?.workspaceId) {
      await setActiveWorkspaceId(byOwner.workspaceId);
      return;
    }
  }

  async function setActivePeriodId(pid: string) {
    if (!user?.uid) return;
    const next = String(pid || '').trim();
    setActivePeriodIdState(next);
    await AsyncStorage.setItem(periodStorageKeyFor(user.uid), next);
    await setUserWorkspacePrefs(user.uid, { activePeriodId: next || null });
  }

  async function createWorkspace(input: {
    name: string;
    mode: WorkspaceMode;
    currency: string;
    periodPolicy: { type: 'MONTHLY' | 'DATE_RANGE'; startDate?: string; endDate?: string };
    groupDefs?: WorkspaceGroupDef[];
    template?: 'WEDDING';
  }) {
    if (!user?.uid) throw new Error('Not authenticated.');
    const workspaceId = await createWorkspaceDoc(user.uid, input);
    setActiveRepoScope({
      workspaceId,
      legacyMode: false,
    });
    await setActiveWorkspaceId(workspaceId);
    return workspaceId;
  }

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      workspaceUid,
      activeWorkspaceId,
      activeWorkspace,
      workspaceMode,
      groupDefs,
      legacyMode,
      activePeriodId,
      setActivePeriodId,
      workspaceOptions,
      setWorkspaceUid,
      setActiveWorkspaceId,
      createWorkspace,
      sharedMemberships: [],
    }),
    [
      ready,
      workspaceUid,
      activeWorkspaceId,
      activeWorkspace,
      workspaceMode,
      groupDefs,
      legacyMode,
      activePeriodId,
      workspaceOptions,
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
