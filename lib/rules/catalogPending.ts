// BUDG-43: catalog items "to approve" and the price-free catalog copy for the chef. Pure: no Firebase.
// Stored shapes are additive (C-10): a catalog doc without `pending` is an approved item, as before.
import { SHOPPING_UNITS, suggestCatalogMatches, type CatalogLike } from './catalogMatch';

export type PendingOrigin = 'shopping-list' | 'chef';

/** Additive fields on users/{owner}/shoppingCatalog/{id} (AC-1, AC-2). */
export type PendingFields = {
  pending?: boolean;
  addedFrom?: PendingOrigin;
  addedBy?: string;
  addedAt?: unknown;
  sourceListId?: string;
  sourceListName?: string;
  sourceShareId?: string;
};

export type PendingInput = {
  addedFrom: PendingOrigin;
  addedBy: string;
  sourceListId?: string;
  sourceListName?: string;
  sourceShareId?: string;
};

/** The pending marker for a new catalog doc; `addedAt` is passed in (serverTimestamp in the app). */
export function pendingFields(input: PendingInput, addedAt: unknown): PendingFields {
  const out: PendingFields = { pending: true, addedFrom: input.addedFrom, addedBy: String(input.addedBy || '').trim(), addedAt };
  const listId = String(input.sourceListId || '').trim();
  const listName = String(input.sourceListName || '').trim().slice(0, 120);
  const shareId = String(input.sourceShareId || '').trim();
  if (listId) out.sourceListId = listId;
  if (listName) out.sourceListName = listName;
  if (shareId) out.sourceShareId = shareId;
  return out;
}

/**
 * AC-2: one catalog id per chef item, the same on every household device, so two devices
 * write the same doc and never two entries. Firestore ids cannot contain "/".
 */
export function chefPendingId(shareId: string, itemId: string) {
  const clean = (s: string) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return `chef_${clean(shareId)}_${clean(itemId)}`;
}

/**
 * The catalog item a typed name is the same product as (AC-1/AC-2 matching): same name or a
 * stored alias / known spelling, same pack. "Similar" matches are suggestions only, never a match.
 */
export function exactCatalogMatch<T extends CatalogLike>(name: string, catalog: T[]): T | null {
  const hit = suggestCatalogMatches({ name }, catalog, { limit: 20 }).find(
    (m) => (m.reason === 'same-name' || m.reason === 'alias') && !m.packDiffers
  );
  return hit ? hit.item : null;
}

/** Origin line on the Catalog page (AC-3). */
export function pendingOriginLabel(row: PendingFields): string {
  const list = row.sourceListName ? row.sourceListName : 'a shopping list';
  return row.addedFrom === 'chef' ? `Added by the chef on ${list}` : `Added from ${list}`;
}

export function isPending(row: PendingFields | null | undefined) {
  return row?.pending === true;
}

// ---- Price-free copy at sharedLists/{shareId}/catalog/{catalogItemId} (AC-4, AC-5) ----

export const CATALOG_COPY_FIELDS = ['name', 'unit', 'category'] as const;
export type CatalogCopy = { name: string; unit: string; category: string };
export type CatalogSource = CatalogLike & { category?: string };

/** Only name, unit and category leave the household subtree; anything else (prices included) is dropped. */
export function toCatalogCopy(row: CatalogSource): CatalogCopy | null {
  const name = String(row.name || '').trim().slice(0, 120);
  if (!name || !row.id) return null;
  const rawUnit = String(row.variant?.unit || '').trim();
  const unit = (SHOPPING_UNITS as readonly string[]).includes(rawUnit) ? rawUnit : '';
  const category = String(row.category || '').trim().slice(0, 60);
  return { name, unit, category };
}

/** Copy ids must be valid Firestore ids; legacy catalog ids are names ("rice 5 kg") and are fine as they are. */
export function copyIdOk(id: string | undefined): id is string {
  return Boolean(id) && !String(id).includes('/') && String(id).length <= 400;
}

export type CopyDiff = { upserts: { id: string; data: CatalogCopy }[]; deletes: string[] };

/** What to write so the copy equals the catalog: no write when nothing changed. */
export function diffCatalogCopy(catalog: CatalogSource[], copy: { id: string; name?: string; unit?: string; category?: string }[]): CopyDiff {
  const want = new Map<string, CatalogCopy>();
  catalog.forEach((row) => {
    const c = toCatalogCopy(row);
    if (c && copyIdOk(row.id)) want.set(row.id as string, c);
  });
  const have = new Map(copy.map((row) => [row.id, row]));
  const upserts: CopyDiff['upserts'] = [];
  want.forEach((data, id) => {
    const cur = have.get(id);
    if (!cur || cur.name !== data.name || (cur.unit ?? '') !== data.unit || (cur.category ?? '') !== data.category) upserts.push({ id, data });
  });
  const deletes = copy.filter((row) => !want.has(row.id)).map((row) => row.id);
  return { upserts, deletes };
}
