// Year plan that feeds monthly drafts (BUDG-2). Pure rules: no Firestore, no money
// movement. A year item never creates a month or a transaction; it is only offered
// to an existing DRAFT month whose id equals its Budget-in month.
import { fromMinor, isMinor, toMinor } from '../money';
import { isSafeId } from './defaultAccount';

export type YearItemKind = 'EVENT' | 'EXPENSE';
export type YearItemStatus = 'ACTIVE' | 'DONE' | 'CANCELLED';
export type YearGroup = 'NEED' | 'WANT' | 'SAVINGS_DEBT';

export type YearItem = {
  id?: string;
  title: string;
  kind?: YearItemKind;
  /** Due date, date only: 'YYYY-MM-DD'. */
  dueDate: string;
  /** Month whose budget carries it ('YYYY-MM'); absent = the due month. */
  budgetInPeriodId?: string;
  /** Estimate in integer minor units (ADR-1); absent = date-only item. */
  estimateMinor?: number;
  currencyCode?: string;
  group?: YearGroup;
  /** Category link: expense item doc id (BUDG-3). */
  sourceExpenseItemId?: string;
  fundingAccountId?: string;
  status?: YearItemStatus;
  note?: string;
  revision?: number;
  linkedPeriodIds?: string[];
};

export type YearItemInput = Pick<
  YearItem,
  'title' | 'kind' | 'dueDate' | 'budgetInPeriodId' | 'estimateMinor' | 'group' | 'sourceExpenseItemId' | 'fundingAccountId' | 'status' | 'note'
>;

export type LineLike = { id?: string; amount?: number; name?: string; group?: string; sourceType?: string; sourceId?: string; sourceRevision?: number };
export type DecisionLike = { id?: string; decision?: 'SKIPPED' | 'INCLUDED' };
export type PeriodLike = { status?: string } | null | undefined;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const GROUPS: YearGroup[] = ['NEED', 'WANT', 'SAVINGS_DEBT'];
const STATUSES: YearItemStatus[] = ['ACTIVE', 'DONE', 'CANCELLED'];

export function isDateOnly(value: string) {
  const m = DATE.exec(String(value || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
export function isMonthId(value: string) {
  const m = MONTH.exec(String(value || ''));
  return Boolean(m && Number(m[2]) >= 1 && Number(m[2]) <= 12);
}

/** Deterministic plan-line id of a year item in a month (the month is in the path, SEC-20). */
export function yearLineId(itemId: string) {
  if (!isSafeId(itemId)) throw new Error(`yearLineId: invalid id "${itemId}"`);
  return `year_${itemId}`;
}

export const statusOf = (item: Pick<YearItem, 'status'>): YearItemStatus => item.status ?? 'ACTIVE';
export const hasEstimate = (item: Pick<YearItem, 'estimateMinor'>) => isMinor(item.estimateMinor) && item.estimateMinor! > 0;
/** Budget-in month; defaults to the due month (old/minimal docs stay valid). */
export function budgetInOf(item: Pick<YearItem, 'budgetInPeriodId' | 'dueDate'>) {
  return isMonthId(item.budgetInPeriodId || '') ? item.budgetInPeriodId! : String(item.dueDate || '').slice(0, 7);
}

/** Validation at the boundary; returns a list of human-readable problems (empty = valid). */
export function validateYearItem(input: YearItemInput): string[] {
  const errors: string[] = [];
  const title = String(input.title ?? '').trim();
  if (!title) errors.push('Title is required.');
  if (title.length > 80) errors.push('Title is limited to 80 characters.');
  if (!isDateOnly(input.dueDate)) errors.push('Due date must be a real date (YYYY-MM-DD).');
  if (input.budgetInPeriodId !== undefined && !isMonthId(input.budgetInPeriodId)) errors.push('Budget-in month must be YYYY-MM.');
  if (input.estimateMinor !== undefined && !(isMinor(input.estimateMinor) && input.estimateMinor > 0)) {
    errors.push('Estimate must be a positive amount or left empty (date only).');
  }
  if (input.group !== undefined && !GROUPS.includes(input.group)) errors.push('Unknown group.');
  if (input.status !== undefined && !STATUSES.includes(input.status)) errors.push('Unknown status.');
  if (input.kind !== undefined && input.kind !== 'EVENT' && input.kind !== 'EXPENSE') errors.push('Unknown kind.');
  for (const id of [input.sourceExpenseItemId, input.fundingAccountId]) {
    if (id !== undefined && id !== '' && !isSafeId(id)) errors.push('Invalid reference.');
  }
  if ((input.note ?? '').length > 500) errors.push('Note is limited to 500 characters.');
  return errors;
}

/**
 * Items offered under "From your year plan" in month pid. Only when the month exists and is
 * DRAFT; items ACTIVE, with an estimate, budgeted in pid, not yet linked and not skipped.
 */
export function offersForDraft(pid: string, period: PeriodLike, items: YearItem[], lines: LineLike[], decisions: DecisionLike[]) {
  if (!period || (period.status ?? 'DRAFT') !== 'DRAFT') return [];
  const lineIds = new Set(lines.map((l) => l.id));
  const skipped = new Set(decisions.filter((d) => d.decision === 'SKIPPED').map((d) => d.id));
  return items.filter(
    (item) =>
      item.id &&
      isSafeId(item.id) &&
      statusOf(item) === 'ACTIVE' &&
      hasEstimate(item) &&
      budgetInOf(item) === pid &&
      !lineIds.has(yearLineId(item.id)) &&
      !skipped.has(item.id)
  );
}

export type LinkedLine = LineLike & { periodId: string };

/**
 * Year total without double counting: each item counts once, as the sum of its linked
 * monthly lines when it has any, else as its estimate. Monthly totals are untouched.
 */
export function yearTotals(items: YearItem[], linkedLines: LinkedLine[]) {
  const rows = items
    .filter((item) => item.id && statusOf(item) !== 'CANCELLED')
    .map((item) => {
      const lines = linkedLines.filter((l) => l.sourceType === 'YEAR_ITEM' && l.sourceId === item.id);
      if (lines.length) return { itemId: item.id!, minor: lines.reduce((s, l) => s + toMinor(Number(l.amount || 0)), 0), basis: 'LINES' as const };
      if (hasEstimate(item)) return { itemId: item.id!, minor: item.estimateMinor!, basis: 'ESTIMATE' as const };
      return { itemId: item.id!, minor: 0, basis: 'DATE_ONLY' as const };
    });
  const sum = (basis?: string) => rows.filter((r) => !basis || r.basis === basis).reduce((s, r) => s + r.minor, 0);
  return { totalMinor: sum(), inBudgetsMinor: sum('LINES'), estimatesMinor: sum('ESTIMATE'), rows };
}

export type PreviewAction = 'update' | 'locked-unchanged' | 'move-offer';
export type PreviewRow = { pid: string; lineId: string; from: number; to: number; action: PreviewAction; reason?: string };

/**
 * What saving an edited item would do to months that already include it. Nothing is written here.
 * update: DRAFT line follows the new values · locked-unchanged: DECIDED month, never touched ·
 * move-offer: the item no longer belongs in that month (new Budget-in month, no estimate,
 * not active); the line stays until the user removes it.
 */
export function editPreview(
  newItem: YearItem,
  linkedLines: LinkedLine[],
  periodStatus: Record<string, string | undefined>
): PreviewRow[] {
  const out: PreviewRow[] = [];
  for (const line of linkedLines) {
    if (!line.id) continue;
    const from = Number(line.amount || 0);
    const to = hasEstimate(newItem) ? fromMinor(newItem.estimateMinor!) : from;
    if ((periodStatus[line.periodId] ?? 'DRAFT') === 'DECIDED') {
      out.push({ pid: line.periodId, lineId: line.id, from, to: from, action: 'locked-unchanged' });
      continue;
    }
    let reason = '';
    if (statusOf(newItem) !== 'ACTIVE') reason = 'no longer active';
    else if (!hasEstimate(newItem)) reason = 'now date only';
    else if (budgetInOf(newItem) !== line.periodId) reason = `now budgeted in ${budgetInOf(newItem)}`;
    if (reason) {
      out.push({ pid: line.periodId, lineId: line.id, from, to: from, action: 'move-offer', reason });
      continue;
    }
    const changed = from !== to || line.name !== newItem.title.trim() || (newItem.group && line.group !== newItem.group);
    if (changed) out.push({ pid: line.periodId, lineId: line.id, from, to, action: 'update' });
  }
  return out.sort((a, b) => a.pid.localeCompare(b.pid));
}

/** Items due from today (inclusive) within `days`, soonest first. Cancelled and done items are left out. */
export function upcoming<T extends YearItem>(items: T[], todayIso: string, days = 60): T[] {
  const start = Date.parse(`${todayIso}T00:00:00Z`);
  const end = start + days * 86_400_000;
  return items
    .filter((item) => statusOf(item) === 'ACTIVE' && isDateOnly(item.dueDate))
    .filter((item) => {
      const t = Date.parse(`${item.dueDate}T00:00:00Z`);
      return t >= start && t <= end;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
}

/** Items of a calendar year grouped by due month ('YYYY-MM' → items), months in order. */
export function itemsByDueMonth<T extends YearItem>(items: T[], year: number) {
  const map: Record<string, T[]> = {};
  for (let m = 1; m <= 12; m += 1) map[`${year}-${String(m).padStart(2, '0')}`] = [];
  for (const item of items) {
    const key = String(item.dueDate || '').slice(0, 7);
    if (map[key]) map[key].push(item);
  }
  Object.values(map).forEach((rows) => rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
  return map;
}

/** Budget-in choices for a due date: six months before it up to the month after. */
export function budgetInChoices(dueDate: string) {
  if (!isDateOnly(dueDate)) return [];
  const y = Number(dueDate.slice(0, 4));
  const m = Number(dueDate.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let k = -6; k <= 1; k += 1) {
    const d = new Date(Date.UTC(y, m + k, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
