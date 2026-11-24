// App-side wrappers for the year plan (BUDG-2, see yearPlanCore.ts).
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { planGroupToTag } from '../groups';
import { yearLineId, type DecisionLike, type LinkedLine, type YearItem, type YearItemInput } from '../rules/yearPlan';
import { APP_CURRENCY } from './planLines';
import { activeWorkspaceId, docMatchesActiveScope, scopedPeriodDocId } from './scope';
import {
  applyYearItemEdit,
  createYearItem,
  includeYearItem,
  previewYearItemEdit,
  removeYearLine,
  saveYearOutline,
  skipYearItem,
  unskipYearItem,
  type IncludeInput,
  type YearCtx,
} from './yearPlanCore';

export { YearPlanError } from './yearPlanCore';

function ctx(userId: string): YearCtx {
  return { firestore: db, userId, appCurrency: APP_CURRENCY, workspaceId: activeWorkspaceId(), periodDocIdFor: scopedPeriodDocId };
}

export type YearItemRow = YearItem & { id: string };

export function watchYearItems(userId: string, cb: (rows: YearItemRow[]) => void) {
  return onSnapshot(collection(db, 'users', userId, 'yearItems'), (snap) => {
    const rows: YearItemRow[] = [];
    snap.forEach((d) => {
      const data = d.data() as YearItem;
      if (docMatchesActiveScope(data as any)) rows.push({ ...data, id: d.id });
    });
    rows.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    cb(rows);
  });
}

export function watchYearOutline(userId: string, year: number, cb: (notes: string) => void) {
  return onSnapshot(doc(db, 'users', userId, 'yearOutline', String(year)), (snap) => cb(String(snap.data()?.notes ?? '')));
}

export function watchYearDecisions(userId: string, periodId: string, cb: (rows: DecisionLike[]) => void) {
  return onSnapshot(collection(db, 'users', userId, 'periods', scopedPeriodDocId(periodId), 'yearDecisions'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DecisionLike) })))
  );
}

/** Linked lines of the given items (one doc listener per item and month; for year totals). */
export function watchYearLines(userId: string, items: YearItemRow[], cb: (rows: LinkedLine[]) => void) {
  const found: Record<string, LinkedLine> = {};
  const unsubs: (() => void)[] = [];
  const emit = () => cb(Object.values(found));
  for (const item of items) {
    for (const pid of item.linkedPeriodIds ?? []) {
      const key = `${pid}/${item.id}`;
      const ref = doc(db, 'users', userId, 'periods', scopedPeriodDocId(pid), 'planItems', yearLineId(item.id));
      unsubs.push(
        onSnapshot(ref, (snap) => {
          if (snap.exists()) found[key] = { id: snap.id, ...(snap.data() as any), periodId: pid };
          else delete found[key];
          emit();
        }, () => undefined)
      );
    }
  }
  if (!unsubs.length) emit();
  return () => unsubs.forEach((u) => u());
}

export const addYearItem = (userId: string, input: YearItemInput) => createYearItem(ctx(userId), input);
export const previewYearEdit = (userId: string, itemId: string, input: YearItemInput) => previewYearItemEdit(ctx(userId), itemId, input);
export const saveYearEdit = (userId: string, itemId: string, input: YearItemInput, opts: { expectedRevision: number; applyToDrafts: boolean }) =>
  applyYearItemEdit(ctx(userId), itemId, input, opts);
export const includeYearItemInMonth = (userId: string, periodId: string, input: Omit<IncludeInput, 'tag'> & { group: string }) =>
  includeYearItem(ctx(userId), periodId, { ...input, tag: planGroupToTag(input.group) });
export const skipYearItemInMonth = (userId: string, periodId: string, itemId: string) => skipYearItem(ctx(userId), periodId, itemId);
export const unskipYearItemInMonth = (userId: string, periodId: string, itemId: string) => unskipYearItem(ctx(userId), periodId, itemId);
export const removeYearItemFromMonth = (userId: string, periodId: string, itemId: string) => removeYearLine(ctx(userId), periodId, itemId);
export const saveOutline = (userId: string, year: number, notes: string) => saveYearOutline(ctx(userId), year, notes);
