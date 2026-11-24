// Transactional "create once" for periods (BUDG-1 AC-3). Firestore instance is
// injected so emulator tests can run it outside the app bundle.
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';

export type PeriodCreateOptions = {
  title?: string;
  type?: 'MONTHLY' | 'EVENT' | 'CUSTOM';
  startDate?: string;
  endDate?: string;
  mode?: string;
  workspaceId?: string;
};

export type PeriodCreateResult = { created: boolean; status: 'DRAFT' | 'DECIDED' };

/** Builds the blank DRAFT document; optional fields are only set when defined (setDoc rejects undefined). */
export function blankPeriodDoc(periodId: string, title: string, options?: PeriodCreateOptions) {
  const data: Record<string, unknown> = {
    title,
    periodId,
    status: 'DRAFT',
    incomeTotal: 0,
    targetPct: { needs: 0.5, wants: 0.3, sd: 0.2 },
  };
  if (options?.type !== undefined) data.type = options.type;
  if (options?.startDate !== undefined) data.startDate = options.startDate;
  if (options?.endDate !== undefined) data.endDate = options.endDate;
  if (options?.mode !== undefined) data.mode = options.mode;
  if (options?.workspaceId !== undefined) data.workspaceId = options.workspaceId;
  return data;
}

export async function createPeriodDocIfAbsent(
  firestore: Firestore,
  userId: string,
  periodDocId: string,
  periodId: string,
  title: string,
  options?: PeriodCreateOptions
): Promise<PeriodCreateResult> {
  if (!userId) throw new Error('createPeriodIfAbsent: missing workspace');
  if (!/^[A-Za-z0-9_-]+$/.test(periodId)) throw new Error(`createPeriodIfAbsent: invalid period id "${periodId}"`);
  const ref = doc(firestore, 'users', userId, 'periods', periodDocId);
  return runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      const status = snap.data()?.status === 'DECIDED' ? 'DECIDED' : 'DRAFT';
      return { created: false, status } as PeriodCreateResult;
    }
    tx.set(ref, { ...blankPeriodDoc(periodId, title, options), createdAt: serverTimestamp() });
    return { created: true, status: 'DRAFT' } as PeriodCreateResult;
  });
}
