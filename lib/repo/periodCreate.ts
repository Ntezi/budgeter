import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { monthTitle } from '../rules/months';
import { scopedPeriodDocId, withWorkspaceWrite } from './scope';
import { createPeriodDocIfAbsent, type PeriodCreateOptions, type PeriodCreateResult } from './periodCreateCore';

export type { PeriodCreateResult };

/** Creates a blank DRAFT period once (transaction); an existing period is returned untouched. */
export async function createPeriodIfAbsent(
  userId: string,
  periodId: string,
  options?: Omit<PeriodCreateOptions, 'workspaceId'>
): Promise<PeriodCreateResult> {
  const { workspaceId } = withWorkspaceWrite({} as Record<string, never>);
  return createPeriodDocIfAbsent(db, userId, scopedPeriodDocId(periodId), periodId, options?.title || monthTitle(periodId), {
    ...options,
    ...(workspaceId ? { workspaceId } : {}),
  });
}

export type PeriodState = { exists: boolean; status: 'DRAFT' | 'DECIDED' | null };

/** Watches whether a period exists without ever creating it (viewing never creates, BUDG-1). */
export function watchPeriodState(userId: string, periodId: string, cb: (state: PeriodState) => void) {
  const ref = doc(db, 'users', userId, 'periods', scopedPeriodDocId(periodId));
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      cb({ exists: false, status: null });
      return;
    }
    cb({ exists: true, status: snap.data()?.status === 'DECIDED' ? 'DECIDED' : 'DRAFT' });
  });
}
