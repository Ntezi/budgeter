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

/** Validates a chef account id typed by the household (SEC-12: UID entry, no codes). */
export function validateChefUid(chefUid: string, ownerUid: string, actorUid: string, memberUids: string[]) {
  const id = String(chefUid || '').trim();
  if (!id) return 'Enter the chef\'s account ID (Settings > Your Collaborator ID on their device).';
  if (id.includes('/') || id.length > 128) return 'That account ID is not valid.';
  if (id === ownerUid || id === actorUid) return 'Share with a separate account, not your own.';
  if (memberUids.includes(id)) return 'That account is a household member and already sees everything.';
  return '';
}
