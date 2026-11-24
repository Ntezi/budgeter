// Pure helpers for chef sharing (BUDG-4, ADR-3, SEC-10). No Firebase import.
export type ShareStatus = 'ACTIVE' | 'REVOKED';
export type SharedItemStatus = 'TO_BUY' | 'GOT_IT';

export type SharedList = {
  id?: string;
  ownerUid: string;
  listId: string;
  listName: string;
  chefUid: string;
  chefLabel: string;
  status: ShareStatus;
  createdBy: string;
  createdAt?: unknown;
  revokedAt?: unknown;
};

export type SharedItem = {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
  note?: string;
  status: SharedItemStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/** The only item fields that ever leave users/{owner}/** (mirrors firestore.rules itemEditableKeys). */
export const SHARED_ITEM_FIELDS = ['name', 'quantity', 'unit', 'category', 'note', 'status'] as const;

/** Chef-visible fields of a private shopping item; drops price, actuals, plan and tx links. */
export function toSharedItemFields(item: {
  name?: string; quantity?: number; unit?: string; category?: string; note?: string; bought?: boolean; status?: string;
}): Omit<SharedItem, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'> {
  const out: Record<string, unknown> = {
    name: String(item.name || '').trim().slice(0, 120),
    status: item.bought || item.status === 'purchased' || item.status === 'GOT_IT' ? 'GOT_IT' : 'TO_BUY',
  };
  if (item.quantity !== undefined) out.quantity = Math.min(9999, Math.max(0, Number(item.quantity) || 0));
  if (item.unit) out.unit = item.unit;
  if (item.category) out.category = String(item.category).slice(0, 60);
  if (item.note) out.note = String(item.note).slice(0, 500);
  return out as any;
}

/** Chef-visible part of a household patch to a private item (status from `bought`); empty when nothing is shared. */
export function toSharedPatch(patch: {
  name?: string; quantity?: number; unit?: string; category?: string; note?: string; bought?: boolean;
}): Partial<Pick<SharedItem, 'name' | 'quantity' | 'unit' | 'category' | 'note' | 'status'>> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = String(patch.name || '').trim().slice(0, 120);
  if (patch.quantity !== undefined) out.quantity = Math.min(9999, Math.max(0, Number(patch.quantity) || 0));
  if (patch.unit !== undefined) out.unit = patch.unit || '';
  if (patch.category !== undefined) out.category = String(patch.category || '').slice(0, 60);
  if (patch.note !== undefined) out.note = String(patch.note || '').slice(0, 500);
  if (patch.bought !== undefined) out.status = patch.bought ? 'GOT_IT' : 'TO_BUY';
  return out as any;
}

/** Validates a chef account id typed by the household (SEC-12: UID entry, no codes). */
export function validateChefUid(chefUid: string, ownerUid: string, actorUid: string, memberUids: string[]) {
  const id = String(chefUid || '').trim();
  if (!id) return 'Enter the chef\'s account ID (Settings > Your Collaborator ID on their device).';
  if (id.includes('/') || id.length > 128) return 'That account ID is not valid.';
  if (id === ownerUid || id === actorUid) return 'Share with a separate account, not your own.';
  if (memberUids.includes(id)) return 'That account is a household member and already sees everything.';
  return '';
}

/** BUDG-6 H-1 (c): the list name a chef is shown comes from another account, so show it as one plain,
 *  short line: control and bidi-override characters removed, whitespace collapsed, at most 60 characters. */
export const SHARED_LIST_NAME_MAX = 60;
export function displayListName(name: unknown): string {
  const clean = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(clean);
  return chars.length > SHARED_LIST_NAME_MAX ? `${chars.slice(0, SHARED_LIST_NAME_MAX - 1).join('').trimEnd()}…` : clean;
}
