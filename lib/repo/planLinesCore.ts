// Linked plan lines and default funding accounts (BUDG-3). Firestore instance is
// injected so emulator tests can run the same code outside the app bundle.
// Every write runs in one runTransaction that reads the period (DRAFT required),
// so a concurrent lock aborts it (SEC-20). Nothing here creates a transaction
// (expense/transfer) or touches another month (SEC-21).
import { deleteField, doc, runTransaction, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';
import {
  accountIneligibility,
  isSafeId,
  linkedLineIdForExpense,
  type LineSourceType,
} from '../rules/defaultAccount';

export type WalletTagLike = string;
export type SourceCollection = 'expenses' | 'recurring';

export class PlanLineError extends Error {
  constructor(
    public code: 'LOCKED' | 'NO_PERIOD' | 'NO_LINE' | 'NOT_LINKED' | 'NO_SOURCE' | 'ACCOUNT_UNUSABLE' | 'INVALID',
    message: string
  ) {
    super(message);
    this.name = 'PlanLineError';
  }
}

export type Ctx = {
  firestore: Firestore;
  userId: string;
  periodDocId: string;
  periodId: string;
  appCurrency: string;
  workspaceId?: string | null;
};

export function sourceCollectionFor(type: LineSourceType | undefined): SourceCollection | null {
  if (type === 'EXPENSE_ITEM') return 'expenses';
  if (type === 'RECURRING') return 'recurring';
  return null;
}

function ws(ctx: Ctx) {
  return ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {};
}

export function periodRef(ctx: Ctx) {
  return doc(ctx.firestore, 'users', ctx.userId, 'periods', ctx.periodDocId);
}
export function lineRef(ctx: Ctx, lineId: string) {
  return doc(ctx.firestore, 'users', ctx.userId, 'periods', ctx.periodDocId, 'planItems', lineId);
}
export function allocationRef(ctx: Ctx, lineId: string) {
  return doc(ctx.firestore, 'users', ctx.userId, 'periods', ctx.periodDocId, 'allocations', `item_plan_${lineId}`);
}

export async function requireDraft(tx: Transaction, ctx: Ctx) {
  const snap = await tx.get(periodRef(ctx));
  if (!snap.exists()) throw new PlanLineError('NO_PERIOD', 'This month has no budget yet.');
  if (snap.data()?.status === 'DECIDED') {
    throw new PlanLineError('LOCKED', 'This budget is DECIDED and locked for plan edits.');
  }
}

export async function requireUsableAccount(tx: Transaction, ctx: Ctx, accountId: string) {
  if (!isSafeId(accountId)) throw new PlanLineError('INVALID', 'Invalid account id.');
  const snap = await tx.get(doc(ctx.firestore, 'users', ctx.userId, 'accounts', accountId));
  const reason = accountIneligibility(accountId, snap.exists() ? [{ id: accountId, ...(snap.data() as any) }] : [], ctx.appCurrency);
  if (reason) throw new PlanLineError('ACCOUNT_UNUSABLE', `Account cannot be used (${reason}). Choose another account.`);
}

/** Same allocation doc the existing assignAccount writes (item_plan_{lineId}); amount = line amount. */
export async function writeLineAllocation(
  tx: Transaction,
  ctx: Ctx,
  lineId: string,
  line: { name: string; amount: number; tag: WalletTagLike },
  accountId: string,
  existingNote?: string
) {
  tx.set(
    allocationRef(ctx, lineId),
    {
      sourceType: 'PLAN',
      sourceItemId: lineId,
      sourceItemName: line.name,
      accountId,
      amount: line.amount,
      tag: line.tag,
      note: existingNote ?? '',
      periodId: ctx.periodId,
      ...ws(ctx),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export type AddLinkedLineInput = {
  expenseItemId: string;
  name: string;
  amount: number;
  group: string;
  tags?: string[];
  priority?: number;
  tag: WalletTagLike;
  /** Account chosen in the add panel ('' = none). */
  accountId: string;
  /** Account that was suggested from the source's default ('' = none). */
  suggestedAccountId: string;
};

/**
 * Adds the line for an expense item to this month, once (id exp_{expenseItemId}).
 * Pressing Add is the explicit act: with an account it also writes the item_plan_* allocation,
 * exactly as choosing an account on a line does today.
 */
export async function addLinkedExpenseLine(ctx: Ctx, input: AddLinkedLineInput) {
  const lineId = linkedLineIdForExpense(input.expenseItemId);
  if (!(input.amount > 0)) throw new PlanLineError('INVALID', 'Plan amount must be greater than 0.');
  return runTransaction(ctx.firestore, async (tx) => {
    await requireDraft(tx, ctx);
    const existing = await tx.get(lineRef(ctx, lineId));
    if (existing.exists()) return { created: false, lineId };
    if (input.accountId) await requireUsableAccount(tx, ctx, input.accountId);
    const choice = !input.accountId ? undefined : input.accountId === input.suggestedAccountId ? 'DEFAULT' : 'EXPLICIT';
    tx.set(lineRef(ctx, lineId), {
      name: input.name,
      amount: input.amount,
      group: input.group,
      tags: input.tags ?? [],
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      sourceType: 'EXPENSE_ITEM',
      sourceId: input.expenseItemId,
      ...(input.accountId ? { plannedAccountId: input.accountId, accountChoice: choice } : {}),
      ...(input.suggestedAccountId ? { suggestedAccountId: input.suggestedAccountId } : {}),
      periodId: ctx.periodId,
      ...ws(ctx),
      createdAt: serverTimestamp(),
    });
    if (input.accountId) {
      await writeLineAllocation(tx, ctx, lineId, { name: input.name, amount: input.amount, tag: input.tag }, input.accountId);
    }
    return { created: true, lineId };
  });
}

export type LineAccountScope = 'LINE' | 'FUTURE';

/**
 * Sets the account of one linked line in this month.
 * LINE: only this line (accountChoice EXPLICIT); the source default is untouched.
 * FUTURE: same line change, plus the source's defaultAccountId for months added later.
 * Never touches other months, transactions or a DECIDED month.
 */
export async function setLinkedLineAccount(
  ctx: Ctx,
  input: { lineId: string; accountId: string; scope: LineAccountScope; tag: WalletTagLike }
) {
  if (!isSafeId(input.lineId)) throw new PlanLineError('INVALID', 'Invalid line id.');
  return runTransaction(ctx.firestore, async (tx) => {
    await requireDraft(tx, ctx);
    const lineSnap = await tx.get(lineRef(ctx, input.lineId));
    if (!lineSnap.exists()) throw new PlanLineError('NO_LINE', 'Plan line not found.');
    const line = lineSnap.data() as any;
    const collectionName = sourceCollectionFor(line.sourceType);
    if (!collectionName || !isSafeId(line.sourceId)) throw new PlanLineError('NOT_LINKED', 'This line has no stable link.');
    const srcRef = doc(ctx.firestore, 'users', ctx.userId, collectionName, line.sourceId);
    if (input.scope === 'FUTURE') {
      const src = await tx.get(srcRef);
      if (!src.exists()) throw new PlanLineError('NO_SOURCE', 'The category or template behind this line no longer exists.');
    }
    const allocSnap = await tx.get(allocationRef(ctx, input.lineId));
    if (input.accountId) await requireUsableAccount(tx, ctx, input.accountId);

    if (!input.accountId) {
      if (allocSnap.exists()) tx.delete(allocationRef(ctx, input.lineId));
      tx.update(lineRef(ctx, input.lineId), { plannedAccountId: '', accountChoice: 'EXPLICIT', repairReason: deleteField() });
    } else {
      await writeLineAllocation(
        tx,
        ctx,
        input.lineId,
        { name: String(line.name || ''), amount: Number(line.amount || 0), tag: input.tag },
        input.accountId,
        allocSnap.exists() ? String(allocSnap.data()?.note ?? '') : undefined
      );
      tx.update(lineRef(ctx, input.lineId), {
        plannedAccountId: input.accountId,
        accountChoice: input.scope === 'FUTURE' ? 'DEFAULT' : 'EXPLICIT',
        repairReason: deleteField(),
      });
    }
    if (input.scope === 'FUTURE') {
      tx.update(srcRef, { defaultAccountId: input.accountId, defaultAccountUpdatedAt: serverTimestamp() });
    }
    return { lineId: input.lineId, scope: input.scope };
  });
}

/** Applies the stored suggestion of linked lines (bulk "Review" confirm). Lines already holding an account are skipped. */
export async function applySuggestedAccounts(ctx: Ctx, input: { lineIds: string[]; tagFor: (group: string) => WalletTagLike }) {
  const applied: string[] = [];
  const skipped: { lineId: string; reason: string }[] = [];
  for (const lineId of input.lineIds) {
    if (!isSafeId(lineId)) {
      skipped.push({ lineId, reason: 'invalid' });
      continue;
    }
    const result = await runTransaction(ctx.firestore, async (tx) => {
      await requireDraft(tx, ctx);
      const snap = await tx.get(lineRef(ctx, lineId));
      if (!snap.exists()) return 'missing line';
      const line = snap.data() as any;
      if (line.plannedAccountId) return 'already assigned';
      const accountId = String(line.suggestedAccountId || '');
      if (!accountId) return 'no suggestion';
      try {
        await requireUsableAccount(tx, ctx, accountId);
      } catch {
        return 'account unusable';
      }
      await writeLineAllocation(tx, ctx, lineId, { name: String(line.name || ''), amount: Number(line.amount || 0), tag: input.tagFor(line.group) }, accountId);
      tx.update(lineRef(ctx, lineId), { plannedAccountId: accountId, accountChoice: 'DEFAULT' });
      return null;
    });
    if (result) skipped.push({ lineId, reason: result });
    else applied.push(lineId);
  }
  return { applied, skipped };
}

/** Sets or clears the future default of a category/template (Expenses and Recurring screens). Writes the source doc only. */
export async function setSourceDefaultAccount(
  firestore: Firestore,
  userId: string,
  collectionName: SourceCollection,
  sourceId: string,
  accountId: string,
  appCurrency: string
) {
  if (!isSafeId(sourceId)) throw new PlanLineError('INVALID', 'Invalid source id.');
  const srcRef = doc(firestore, 'users', userId, collectionName, sourceId);
  return runTransaction(firestore, async (tx) => {
    const src = await tx.get(srcRef);
    if (!src.exists()) throw new PlanLineError('NO_SOURCE', 'Category or template not found.');
    if (accountId) {
      const acc = await tx.get(doc(firestore, 'users', userId, 'accounts', accountId));
      const reason = accountIneligibility(accountId, acc.exists() ? [{ id: accountId, ...(acc.data() as any) }] : [], appCurrency);
      if (reason) throw new PlanLineError('ACCOUNT_UNUSABLE', `Account cannot be used (${reason}).`);
      tx.update(srcRef, { defaultAccountId: accountId, defaultAccountUpdatedAt: serverTimestamp() });
    } else {
      tx.update(srcRef, { defaultAccountId: deleteField(), defaultAccountUpdatedAt: serverTimestamp() });
    }
  });
}
