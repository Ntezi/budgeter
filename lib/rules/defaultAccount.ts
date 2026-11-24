// Default funding accounts with one-line overrides (BUDG-3). Pure rules: no
// Firestore, no money movement. Sources and accounts are referenced by their
// Firestore doc ids under users/{owner} (stable, workspace-scoped, rename-safe);
// display names are never compared.

export type LineSourceType = 'EXPENSE_ITEM' | 'RECURRING' | 'YEAR_ITEM';
export type AccountChoice = 'DEFAULT' | 'EXPLICIT' | 'REPAIR';
export type RepairReason = 'missing' | 'archived' | 'ineligible';

export type AccountLike = { id?: string; archived?: boolean; currencyCode?: string };
export type SourceLike = { id?: string; defaultAccountId?: string };
export type LineLike = {
  id?: string;
  sourceType?: LineSourceType;
  sourceId?: string;
  accountChoice?: AccountChoice;
  plannedAccountId?: string;
  suggestedAccountId?: string;
};

export type Resolution =
  | { kind: 'NONE' }
  | { kind: 'ASSIGNED'; accountId: string; choice: 'DEFAULT' | 'EXPLICIT' }
  | { kind: 'SUGGEST'; accountId: string }
  | { kind: 'REPAIR'; accountId: string; reason: RepairReason };

const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

/** True for ids that are safe to embed in a document id (server-known ids only, SEC-20). */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id);
}

/** Deterministic plan-line id for an expense item in a month (the month is in the path). */
export function linkedLineIdForExpense(expenseItemId: string) {
  if (!isSafeId(expenseItemId)) throw new Error(`linkedLineIdForExpense: invalid id "${expenseItemId}"`);
  return `exp_${expenseItemId}`;
}

/** Plan-line id the recurring seeding already uses (unchanged, recurring.ts). */
export function linkedLineIdForRecurring(templateId: string, periodId: string) {
  if (!isSafeId(templateId) || !isSafeId(periodId)) throw new Error('linkedLineIdForRecurring: invalid id');
  return `recbudget_plan_${templateId}_${periodId}`;
}

/** Why an account cannot be used, or null when it is eligible. No currencyCode = app currency. */
export function accountIneligibility(
  accountId: string | undefined,
  accounts: AccountLike[],
  appCurrency: string
): RepairReason | null {
  if (!accountId) return 'missing';
  const account = accounts.find((row) => row.id === accountId);
  if (!account) return 'missing';
  if (account.archived) return 'archived';
  const code = String(account.currencyCode || '').trim().toUpperCase();
  if (code && code !== String(appCurrency || '').trim().toUpperCase()) return 'ineligible';
  return null;
}

export function isLinkedLine(line: LineLike) {
  return Boolean(line.sourceType && line.sourceId);
}

/**
 * Which account a plan line uses or should be offered.
 * 1. A line that already holds an account (explicit or applied default) keeps it; if that
 *    account became unusable the user is asked to repair (linked lines only), never switched.
 * 2. Otherwise the line's stored suggestion, then the source's current default, is suggested.
 * 3. A saved default that is missing/archived/ineligible asks for repair.
 * 4. Unlinked lines without a preference: NONE (existing optional-account behaviour).
 */
export function resolveLineAccount(input: {
  line: LineLike;
  source?: SourceLike | null;
  accounts: AccountLike[];
  appCurrency: string;
}): Resolution {
  const { line, source, accounts, appCurrency } = input;
  const linked = isLinkedLine(line);
  const held = String(line.plannedAccountId || '').trim();
  if (held) {
    if (!linked) return { kind: 'ASSIGNED', accountId: held, choice: 'EXPLICIT' };
    const reason = accountIneligibility(held, accounts, appCurrency);
    if (reason) return { kind: 'REPAIR', accountId: held, reason };
    return { kind: 'ASSIGNED', accountId: held, choice: line.accountChoice === 'EXPLICIT' ? 'EXPLICIT' : 'DEFAULT' };
  }
  if (!linked) return { kind: 'NONE' };
  const candidate = String(line.suggestedAccountId || source?.defaultAccountId || '').trim();
  if (!candidate) return { kind: 'NONE' };
  const reason = accountIneligibility(candidate, accounts, appCurrency);
  if (reason) return { kind: 'REPAIR', accountId: candidate, reason };
  return { kind: 'SUGGEST', accountId: candidate };
}

/** Suggested account for a brand-new linked line from its source (prefill of the add panel). */
export function suggestionForSource(source: SourceLike | null | undefined, accounts: AccountLike[], appCurrency: string) {
  const id = String(source?.defaultAccountId || '').trim();
  if (!id) return { accountId: '', reason: null as RepairReason | null };
  const reason = accountIneligibility(id, accounts, appCurrency);
  return reason ? { accountId: '', reason } : { accountId: id, reason: null as RepairReason | null };
}

export function repairReasonText(reason: RepairReason) {
  if (reason === 'archived') return 'Saved account is archived';
  if (reason === 'ineligible') return 'Saved account uses another currency';
  return 'Saved account no longer exists';
}
