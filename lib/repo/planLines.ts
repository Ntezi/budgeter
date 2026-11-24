// App-side wrappers for BUDG-3 linked plan lines (see planLinesCore.ts).
import { db } from '../firebase';
import { planGroupToTag } from '../groups';
import { activeWorkspaceId, scopedPeriodDocId } from './scope';
import {
  addLinkedExpenseLine,
  applySuggestedAccounts,
  setLinkedLineAccount,
  setSourceDefaultAccount,
  type AddLinkedLineInput,
  type Ctx,
  type LineAccountScope,
  type SourceCollection,
} from './planLinesCore';

export { PlanLineError } from './planLinesCore';

export const APP_CURRENCY = process.env.EXPO_PUBLIC_APP_CURRENCY || 'GHS';

function ctx(userId: string, periodId: string): Ctx {
  return {
    firestore: db,
    userId,
    periodDocId: scopedPeriodDocId(periodId),
    periodId,
    appCurrency: APP_CURRENCY,
    workspaceId: activeWorkspaceId(),
  };
}

export function addLinkedPlanLine(userId: string, periodId: string, input: Omit<AddLinkedLineInput, 'tag'>) {
  return addLinkedExpenseLine(ctx(userId, periodId), { ...input, tag: planGroupToTag(input.group) });
}

export function setLineAccount(
  userId: string,
  periodId: string,
  input: { lineId: string; accountId: string; scope: LineAccountScope; group: string }
) {
  return setLinkedLineAccount(ctx(userId, periodId), { ...input, tag: planGroupToTag(input.group) });
}

export function applySuggestedLineAccounts(userId: string, periodId: string, lineIds: string[]) {
  return applySuggestedAccounts(ctx(userId, periodId), { lineIds, tagFor: (group) => planGroupToTag(group) });
}

export function setDefaultAccount(userId: string, collectionName: SourceCollection, sourceId: string, accountId: string) {
  return setSourceDefaultAccount(db, userId, collectionName, sourceId, accountId, APP_CURRENCY);
}
