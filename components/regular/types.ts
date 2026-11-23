// BUDG-8 S13 Regular costs: one view model for Categories (/expenses) and Repeats (/recurring).
// The routes map their own repo rows into it and back; nothing here reads or writes Firestore.
import { parseMoney } from '@/lib/format';
import { parseTagsInput, tagsToInput } from '@/lib/tags';

export type RegularKind = 'categories' | 'repeats';
export type RegularGroup = 'NEED' | 'WANT' | 'SAVINGS_DEBT' | 'INCOME';

export type RegularItem = {
  id: string;
  name: string;
  amount: number;
  group: RegularGroup;
  active: boolean;
  tags: string[];
  defaultAccountId?: string;
};

export type RegularDraft = { name: string; amount: string; group: RegularGroup; active: boolean; tagsInput: string };

export const GROUP_LABEL: Record<RegularGroup, string> = { NEED: 'Needs', WANT: 'Wants', SAVINGS_DEBT: 'Savings', INCOME: 'Income' };
export const GROUP_DOT: Record<RegularGroup, string> = { NEED: 'bg-needs', WANT: 'bg-wants', SAVINGS_DEBT: 'bg-savings', INCOME: 'bg-emerald-500' };

export function groupsFor(kind: RegularKind): RegularGroup[] {
  return kind === 'repeats' ? ['NEED', 'WANT', 'SAVINGS_DEBT', 'INCOME'] : ['NEED', 'WANT', 'SAVINGS_DEBT'];
}

export function nounFor(kind: RegularKind) {
  return kind === 'repeats' ? 'repeat' : 'category';
}

export function draftFromItem(item: RegularItem): RegularDraft {
  return { name: item.name, amount: String(Number(item.amount || 0) || ''), group: item.group, active: item.active, tagsInput: tagsToInput(item.tags) };
}

export function emptyDraft(prefill?: Partial<RegularDraft>): RegularDraft {
  return { name: '', amount: '', group: 'NEED', active: true, tagsInput: '', ...prefill };
}

/** Values the routes write: the same fields and the same parsing as before the redesign. */
export function draftValues(draft: RegularDraft) {
  return { name: draft.name.trim(), amount: Math.max(0, parseMoney(draft.amount)), tags: parseTagsInput(draft.tagsInput) };
}

/** "Internet 30" -> name "Internet", amount "30"; a bare name keeps the amount empty. */
export function parseQuickAdd(text: string): { name: string; amount: string } {
  const t = text.trim();
  const m = t.match(/^(.*?)\s+(\d[\d,]*(?:\.\d+)?)$/);
  if (m && m[1].trim()) return { name: m[1].trim(), amount: m[2].replace(/,/g, '') };
  if (/^\d[\d,]*(?:\.\d+)?$/.test(t)) return { name: '', amount: t.replace(/,/g, '') };
  return { name: t, amount: '' };
}

export function matchesSearch(item: RegularItem, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return item.name.toLowerCase().includes(s) || item.tags.some((tag) => String(tag).toLowerCase().includes(s));
}
