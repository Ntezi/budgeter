import { where } from 'firebase/firestore';

export type WorkspaceMode = 'MONTHLY_3_BUCKET' | 'EVENT' | 'CUSTOM';

export type RepoScope = {
  workspaceId: string | null;
  legacyMode: boolean;
};

let activeScope: RepoScope = {
  workspaceId: null,
  legacyMode: true,
};

function sanitizeWorkspaceId(workspaceId: string) {
  return workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function setActiveRepoScope(scope: RepoScope) {
  void scope;
  activeScope = {
    workspaceId: null,
    legacyMode: true,
  };
}

export function getActiveScope(): RepoScope {
  return activeScope;
}

export function isLegacyScope() {
  return activeScope.legacyMode || !activeScope.workspaceId;
}

export function activeWorkspaceId() {
  return isLegacyScope() ? null : activeScope.workspaceId;
}

export function withWorkspaceWrite<T extends Record<string, any>>(input: T): T & { workspaceId?: string } {
  const workspaceId = activeWorkspaceId();
  if (!workspaceId) return input as T & { workspaceId?: string };
  return {
    ...input,
    workspaceId,
  };
}

export function docMatchesActiveScope(data: Record<string, any> | undefined | null) {
  if (isLegacyScope()) return true;
  const workspaceId = activeWorkspaceId();
  return String(data?.workspaceId || '').trim() === String(workspaceId || '').trim();
}

export function applyWorkspaceWhere<T>(constraints: T[]) {
  const workspaceId = activeWorkspaceId();
  if (!workspaceId) return constraints;
  return [...constraints, where('workspaceId', '==', workspaceId)] as T[];
}

export function scopedPeriodDocId(periodId: string) {
  if (isLegacyScope()) return periodId;
  const workspaceId = activeWorkspaceId();
  if (!workspaceId) return periodId;
  return `ws_${sanitizeWorkspaceId(workspaceId)}__${periodId}`;
}

export function logicalPeriodIdFromDocId(docId: string, row?: Record<string, any>) {
  const explicit = String(row?.periodId || '').trim();
  if (explicit) return explicit;
  if (isLegacyScope()) return docId;
  const workspaceId = activeWorkspaceId();
  if (!workspaceId) return docId;
  const prefix = `ws_${sanitizeWorkspaceId(workspaceId)}__`;
  if (!docId.startsWith(prefix)) return docId;
  const unwrapped = docId.slice(prefix.length).trim();
  return unwrapped || docId;
}
