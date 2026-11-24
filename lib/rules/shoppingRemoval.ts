// BUDG-42: pure rules for removing shopping items fast (select mode, row trash, remove all). No Firebase import.

/** A Firestore batch holds at most 500 writes; 400 leaves room (same limit as sharedListsOps SHARE_CHUNK). */
export const REMOVE_CHUNK = 400;

export function chunk<T>(rows: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
  return out;
}

/** One item to remove: its private doc and/or its mirror in sharedLists/{shareId}/items (same id). */
export type RemoveTarget = { id: string; private: boolean; shared: boolean };

/** Every delete the removal makes, in order: private doc first, then its mirror. */
export function removalWrites(targets: RemoveTarget[]): { id: string; where: 'private' | 'shared' }[] {
  const out: { id: string; where: 'private' | 'shared' }[] = [];
  for (const t of targets) {
    if (!t.id) continue;
    if (t.private) out.push({ id: t.id, where: 'private' });
    if (t.shared) out.push({ id: t.id, where: 'shared' });
  }
  return out;
}

// ---- selection ----
export function toggleSelected(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** Select all removable ids; if all are already selected, clear. */
export function toggleSelectAll(selected: readonly string[], removable: readonly string[]): string[] {
  const all = removable.length > 0 && removable.every((id) => selected.includes(id));
  return all ? [] : [...removable];
}

/** Drop ids that are gone or no longer removable (a live update removed them). */
export function pruneSelected(selected: readonly string[], removable: readonly string[]): string[] {
  const keep = new Set(removable);
  const next = selected.filter((id) => keep.has(id));
  return next.length === selected.length ? (selected as string[]) : next;
}

// ---- copy ----
const plural = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

export function removeConfirmTitle(n: number, listName: string): string {
  return `Remove ${plural(n)} from ${listName || 'this list'}?`;
}
export const REMOVE_CONFIRM_BODY = 'Expenses already recorded stay.';

// ---- chef ----
/** Rules: a chef may delete only items the chef created. */
export function chefCanRemove(item: { createdBy?: string }, myUid: string): boolean {
  return Boolean(myUid) && item.createdBy === myUid;
}
export const CHEF_REMOVE_REASON = 'Added by the household';
