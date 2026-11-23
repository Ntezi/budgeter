// Year plan data (BUDG-2). Firestore instance is injected so emulator tests run the same
// code as the app. Rules:
// - Year items live in users/{owner}/yearItems and never create a period or a transaction.
// - Including an item writes plan line year_{itemId} and decision yearDecisions/{itemId} in
//   one runTransaction that reads the period (DRAFT required) and the line (absent) first,
//   so retry, double tap, concurrent calls or reopening give one line (SEC-20).
// - Edits reach included lines only through applyYearItemEdit, after a preview; DECIDED
//   months are read and never written (SEC-14: a client-transaction guarantee, not a rule).
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { fromMinor, isMinor } from '../money';
import { isSafeId } from '../rules/defaultAccount';
import {
  budgetInOf,
  editPreview,
  hasEstimate,
  statusOf,
  validateYearItem,
  yearLineId,
  type LinkedLine,
  type PreviewRow,
  type YearItem,
  type YearItemInput,
} from '../rules/yearPlan';
import {
  PlanLineError,
  allocationRef,
  lineRef,
  requireDraft,
  requireUsableAccount,
  writeLineAllocation,
  type Ctx,
} from './planLinesCore';

export type YearCtx = {
  firestore: Firestore;
  userId: string;
  appCurrency: string;
  workspaceId?: string | null;
  /** Period doc id for a logical month (scopedPeriodDocId in the app; identity in tests). */
  periodDocIdFor?: (periodId: string) => string;
};

export class YearPlanError extends Error {
  constructor(public code: 'INVALID' | 'NO_ITEM' | 'STALE' | 'NOT_OFFERED', message: string) {
    super(message);
    this.name = 'YearPlanError';
  }
}

const ws = (c: { workspaceId?: string | null }) => (c.workspaceId ? { workspaceId: c.workspaceId } : {});
export const itemsCol = (c: YearCtx) => collection(c.firestore, 'users', c.userId, 'yearItems');
const itemRef = (c: YearCtx, itemId: string) => doc(c.firestore, 'users', c.userId, 'yearItems', itemId);
export function monthCtx(c: YearCtx, periodId: string): Ctx {
  return {
    firestore: c.firestore,
    userId: c.userId,
    periodId,
    periodDocId: c.periodDocIdFor ? c.periodDocIdFor(periodId) : periodId,
    appCurrency: c.appCurrency,
    workspaceId: c.workspaceId,
  };
}
const decisionRef = (m: Ctx, itemId: string) => doc(m.firestore, 'users', m.userId, 'periods', m.periodDocId, 'yearDecisions', itemId);

/** Normalised fields for a write: optional fields cleared with deleteField on update. */
function itemFields(input: YearItemInput, forUpdate: boolean) {
  const opt = (v: unknown) => (v === undefined || v === '' ? (forUpdate ? deleteField() : undefined) : v);
  const out: Record<string, unknown> = {
    title: input.title.trim(),
    kind: input.kind ?? (input.estimateMinor ? 'EXPENSE' : 'EVENT'),
    dueDate: input.dueDate,
    budgetInPeriodId: input.budgetInPeriodId || input.dueDate.slice(0, 7),
    estimateMinor: opt(input.estimateMinor),
    group: opt(input.group),
    sourceExpenseItemId: opt(input.sourceExpenseItemId),
    fundingAccountId: opt(input.fundingAccountId),
    status: input.status ?? 'ACTIVE',
    note: opt(input.note?.trim()),
  };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function assertValid(input: YearItemInput) {
  const errors = validateYearItem(input);
  if (errors.length) throw new YearPlanError('INVALID', errors.join(' '));
}

/** Creates a dated item (random stable id). Writes users/{owner}/yearItems only. */
export async function createYearItem(c: YearCtx, input: YearItemInput) {
  assertValid(input);
  const ref = doc(itemsCol(c));
  await runTransaction(c.firestore, async (tx) => {
    tx.set(ref, {
      ...itemFields(input, false),
      currencyCode: c.appCurrency,
      revision: 1,
      linkedPeriodIds: [],
      ...ws(c),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return ref.id;
}

/** Lines of months that already include the item (read only). */
export async function linkedLinesOf(c: YearCtx, item: YearItem & { id: string }) {
  const out: (LinkedLine & { periodStatus?: string })[] = [];
  for (const pid of item.linkedPeriodIds ?? []) {
    if (!isSafeId(pid)) continue;
    const m = monthCtx(c, pid);
    const [p, l] = await Promise.all([
      getDoc(doc(c.firestore, 'users', c.userId, 'periods', m.periodDocId)),
      getDoc(lineRef(m, yearLineId(item.id))),
    ]);
    if (l.exists()) out.push({ id: l.id, ...(l.data() as any), periodId: pid, periodStatus: p.exists() ? p.data()?.status ?? 'DRAFT' : undefined });
  }
  return out;
}

/** Preview of an edit (AC-6). Nothing is written. */
export async function previewYearItemEdit(c: YearCtx, itemId: string, input: YearItemInput): Promise<PreviewRow[]> {
  assertValid(input);
  const snap = await getDoc(itemRef(c, itemId));
  if (!snap.exists()) throw new YearPlanError('NO_ITEM', 'Year item not found.');
  const item = { id: itemId, ...(snap.data() as YearItem) };
  const lines = await linkedLinesOf(c, item);
  const status: Record<string, string | undefined> = {};
  lines.forEach((l) => (status[l.periodId] = l.periodStatus));
  return editPreview({ ...item, ...input, title: input.title }, lines, status);
}

/**
 * Saves an edited item; with applyToDrafts it also updates the linked lines of DRAFT months
 * that still belong to the item (same month, estimate present, line not edited since:
 * sourceRevision matches). All in one transaction, re-checking each month's status, so a
 * month locked meanwhile is left unchanged. Never creates a month or a transaction.
 */
export async function applyYearItemEdit(
  c: YearCtx,
  itemId: string,
  input: YearItemInput,
  opts: { expectedRevision: number; applyToDrafts: boolean }
) {
  assertValid(input);
  if (!isSafeId(itemId)) throw new YearPlanError('INVALID', 'Invalid item id.');
  return runTransaction(c.firestore, async (tx) => {
    const ref = itemRef(c, itemId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new YearPlanError('NO_ITEM', 'Year item not found.');
    const item = snap.data() as YearItem;
    const revision = Number(item.revision ?? 0);
    if (revision !== opts.expectedRevision) throw new YearPlanError('STALE', 'This item changed meanwhile. Reopen it and try again.');
    const next: YearItem = { ...item, ...input };
    const updates: { m: Ctx; lineId: string; hasAlloc: boolean }[] = [];
    const locked: string[] = [];
    if (opts.applyToDrafts && statusOf(next) === 'ACTIVE' && hasEstimate(next)) {
      for (const pid of item.linkedPeriodIds ?? []) {
        if (!isSafeId(pid) || budgetInOf(next) !== pid) continue;
        const m = monthCtx(c, pid);
        const p = await tx.get(doc(c.firestore, 'users', c.userId, 'periods', m.periodDocId));
        if (!p.exists()) continue;
        if (p.data()?.status === 'DECIDED') {
          locked.push(pid);
          continue;
        }
        const lineId = yearLineId(itemId);
        const line = await tx.get(lineRef(m, lineId));
        if (!line.exists() || Number(line.data()?.sourceRevision ?? 0) !== revision) continue;
        const alloc = await tx.get(allocationRef(m, lineId));
        updates.push({ m, lineId, hasAlloc: alloc.exists() });
      }
    }
    tx.update(ref, { ...itemFields(input, true), revision: revision + 1, updatedAt: serverTimestamp() });
    for (const u of updates) {
      const amount = fromMinor(next.estimateMinor!);
      tx.update(lineRef(u.m, u.lineId), {
        name: next.title.trim(),
        amount,
        ...(next.group ? { group: next.group } : {}),
        sourceRevision: revision + 1,
        updatedAt: serverTimestamp(),
      });
      if (u.hasAlloc) tx.update(allocationRef(u.m, u.lineId), { amount, sourceItemName: next.title.trim(), updatedAt: serverTimestamp() });
    }
    return { revision: revision + 1, updated: updates.map((u) => u.m.periodId), locked };
  });
}

export type IncludeInput = {
  itemId: string;
  /** Account chosen ('' = none). */
  accountId: string;
  /** Account suggested from the item or its category default ('' = none). */
  suggestedAccountId: string;
  /** Review/edit values; absent = the item's own values. */
  amountMinor?: number;
  name?: string;
  group?: string;
  priority?: number;
  tag: string;
};

/**
 * Adds a year item to month ctx.periodId as plan line year_{itemId}, once. Requires the month
 * to exist and be DRAFT and the item to be ACTIVE, with an estimate, budgeted in this month.
 * Pressing Add is the explicit act: with an account it writes the item_plan_* allocation like
 * every other plan line. Never writes a transaction.
 */
export async function includeYearItem(c: YearCtx, periodId: string, input: IncludeInput) {
  const m = monthCtx(c, periodId);
  const lineId = yearLineId(input.itemId);
  if (input.amountMinor !== undefined && !(isMinor(input.amountMinor) && input.amountMinor > 0)) {
    throw new PlanLineError('INVALID', 'Plan amount must be greater than 0.');
  }
  return runTransaction(c.firestore, async (tx) => {
    await requireDraft(tx, m);
    const existing = await tx.get(lineRef(m, lineId));
    if (existing.exists()) return { created: false, lineId };
    const itemSnap = await tx.get(itemRef(c, input.itemId));
    if (!itemSnap.exists()) throw new YearPlanError('NO_ITEM', 'Year item not found.');
    const item = itemSnap.data() as YearItem;
    if (statusOf(item) !== 'ACTIVE' || !hasEstimate(item) || budgetInOf(item) !== periodId) {
      throw new YearPlanError('NOT_OFFERED', 'This item is not planned for this month.');
    }
    if (input.accountId) await requireUsableAccount(tx, m, input.accountId);
    const amount = fromMinor(input.amountMinor ?? item.estimateMinor!);
    const name = String(input.name ?? item.title).trim().slice(0, 80) || item.title;
    const group = input.group || item.group || 'NEED';
    const choice = !input.accountId ? undefined : input.accountId === input.suggestedAccountId ? 'DEFAULT' : 'EXPLICIT';
    tx.set(lineRef(m, lineId), {
      name,
      amount,
      group,
      tags: [],
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      sourceType: 'YEAR_ITEM',
      sourceId: input.itemId,
      sourceRevision: Number(item.revision ?? 0),
      ...(input.accountId ? { plannedAccountId: input.accountId, accountChoice: choice } : {}),
      ...(input.suggestedAccountId ? { suggestedAccountId: input.suggestedAccountId } : {}),
      periodId,
      ...ws(c),
      createdAt: serverTimestamp(),
    });
    if (input.accountId) await writeLineAllocation(tx, m, lineId, { name, amount, tag: input.tag }, input.accountId);
    tx.set(decisionRef(m, input.itemId), { decision: 'INCLUDED', at: serverTimestamp(), periodId, ...ws(c) });
    tx.update(itemRef(c, input.itemId), { linkedPeriodIds: arrayUnion(periodId), updatedAt: serverTimestamp() });
    return { created: true, lineId };
  });
}

/** Skip: the item is no longer offered in this month (decision doc, deterministic id). */
export async function skipYearItem(c: YearCtx, periodId: string, itemId: string) {
  const m = monthCtx(c, periodId);
  const lineId = yearLineId(itemId);
  return runTransaction(c.firestore, async (tx) => {
    await requireDraft(tx, m);
    const line = await tx.get(lineRef(m, lineId));
    if (line.exists()) return { skipped: false, reason: 'already included' };
    const dec = await tx.get(decisionRef(m, itemId));
    if (dec.exists() && dec.data()?.decision === 'SKIPPED') return { skipped: true };
    tx.set(decisionRef(m, itemId), { decision: 'SKIPPED', at: serverTimestamp(), periodId, ...ws(c) });
    return { skipped: true };
  });
}

/** Undo a skip in a DRAFT month (the item is offered again). */
export async function unskipYearItem(c: YearCtx, periodId: string, itemId: string) {
  const m = monthCtx(c, periodId);
  if (!isSafeId(itemId)) throw new YearPlanError('INVALID', 'Invalid item id.');
  return runTransaction(c.firestore, async (tx) => {
    await requireDraft(tx, m);
    const dec = await tx.get(decisionRef(m, itemId));
    if (dec.exists() && dec.data()?.decision === 'SKIPPED') tx.delete(decisionRef(m, itemId));
  });
}

/** "Remove from <Month>": deletes the year line (and its allocation) of a DRAFT month, on request only. */
export async function removeYearLine(c: YearCtx, periodId: string, itemId: string) {
  const m = monthCtx(c, periodId);
  const lineId = yearLineId(itemId);
  return runTransaction(c.firestore, async (tx) => {
    await requireDraft(tx, m);
    const line = await tx.get(lineRef(m, lineId));
    const alloc = await tx.get(allocationRef(m, lineId));
    const item = await tx.get(itemRef(c, itemId));
    if (line.exists()) tx.delete(lineRef(m, lineId));
    if (alloc.exists()) tx.delete(allocationRef(m, lineId));
    tx.delete(decisionRef(m, itemId));
    if (item.exists()) tx.update(itemRef(c, itemId), { linkedPeriodIds: arrayRemove(periodId), updatedAt: serverTimestamp() });
    return { removed: line.exists() };
  });
}

/** Annual outline text for a calendar year (users/{owner}/yearOutline/{YYYY}). */
export async function saveYearOutline(c: YearCtx, year: number, notes: string) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new YearPlanError('INVALID', 'Invalid year.');
  const text = String(notes ?? '').slice(0, 2000);
  await runTransaction(c.firestore, async (tx) => {
    tx.set(doc(c.firestore, 'users', c.userId, 'yearOutline', String(year)), { notes: text, ...ws(c), updatedAt: serverTimestamp() }, { merge: true });
  });
}
