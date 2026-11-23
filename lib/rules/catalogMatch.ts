// Catalog reuse and duplicate suggestions (BUDG-4 AC-2, AC-3). Pure: no Firebase.
// Suggests only; never merges. The user decides with Use existing / Keep separate.
import { normalizeShoppingItemName } from '../shopping/import/normalizeShoppingItemName';

export const SHOPPING_UNITS = ['pc', 'g', 'kg', 'ml', 'l', 'pack'] as const;
export type ShoppingUnit = (typeof SHOPPING_UNITS)[number];

export type CatalogLike = {
  id?: string;
  name: string;
  aliases?: string[];
  variant?: { packSize?: number; unit?: string } | null;
};

export type MatchReason = 'same-name' | 'alias' | 'similar';
export type CatalogMatch<T extends CatalogLike = CatalogLike> = {
  item: T;
  reason: MatchReason;
  /** Pack size or unit differs (e.g. 500 g vs 1 kg): a distinct product, never the same. */
  packDiffers: boolean;
  score: number;
};

export type Pack = { size: number; unit: 'g' | 'ml' | 'pc' | 'pack' };

const PACK_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|gr|grams?|ml|l|lt|litres?|liters?|pcs?|pieces?|packs?)\b/i;

/** Pack size from a name or an explicit variant, in base units (g, ml, pc, pack). */
export function parsePack(name: string, variant?: CatalogLike['variant']): Pack | null {
  if (variant?.packSize && variant.unit) return toBase(variant.packSize, variant.unit);
  const m = PACK_RE.exec(String(name || ''));
  if (!m) return null;
  return toBase(Number(m[1].replace(',', '.')), m[2]);
}

function toBase(size: number, rawUnit: string): Pack | null {
  if (!Number.isFinite(size) || size <= 0) return null;
  const u = rawUnit.toLowerCase();
  if (u === 'kg') return { size: Math.round(size * 1000), unit: 'g' };
  if (u === 'g' || u.startsWith('gr')) return { size, unit: 'g' };
  if (u === 'l' || u === 'lt' || u.startsWith('lit')) return { size: Math.round(size * 1000), unit: 'ml' };
  if (u === 'ml') return { size, unit: 'ml' };
  if (u.startsWith('pack')) return { size, unit: 'pack' };
  return { size, unit: 'pc' };
}

/** Normalized product name without the pack size ("Rice 5 kg" -> "rice"). */
export function baseProductName(name: string) {
  return normalizeShoppingItemName(String(name || '').replace(new RegExp(PACK_RE.source, 'gi'), ' '));
}

function stripPack(raw: string) {
  return raw.replace(new RegExp(PACK_RE.source, 'gi'), ' ').replace(/\s+/g, ' ').trim();
}

function tokens(name: string) {
  return new Set(baseProductName(name).split(' ').filter(Boolean));
}

function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((t) => { if (b.has(t)) common += 1; });
  return common / (a.size + b.size - common);
}

function samePack(a: Pack | null, b: Pack | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.unit === b.unit && a.size === b.size;
}

/**
 * Likely duplicates of `input` in `catalog`, best first.
 * same-name: identical normalized product name · alias: matches a stored alias or a
 * known spelling (tomato/inyanya -> tomatoes) · similar: token overlap >= threshold.
 */
export function suggestCatalogMatches<T extends CatalogLike>(
  input: { name: string; packSize?: number; unit?: string },
  catalog: T[],
  opts: { threshold?: number; limit?: number } = {}
): CatalogMatch<T>[] {
  const threshold = opts.threshold ?? 0.5;
  const limit = opts.limit ?? 5;
  const raw = String(input.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw) return [];
  const inBase = baseProductName(input.name);
  const inTokens = tokens(input.name);
  const inPack = parsePack(input.name, input.packSize && input.unit ? { packSize: input.packSize, unit: input.unit } : null);
  const out: CatalogMatch<T>[] = [];
  for (const item of catalog) {
    const itemRaw = String(item.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const itemBase = baseProductName(item.name);
    const aliases = (item.aliases || []).map((a) => baseProductName(a));
    const packDiffers = !samePack(inPack, parsePack(item.name, item.variant));
    let reason: MatchReason | null = null;
    let score = 0;
    if (inBase && itemBase === inBase && stripPack(itemRaw) === stripPack(raw)) {
      reason = 'same-name';
      score = 1;
    } else if (inBase && (itemBase === inBase || aliases.includes(inBase))) {
      reason = 'alias';
      score = 0.95;
    } else {
      const o = overlap(inTokens, tokens(item.name));
      if (o >= threshold) {
        reason = 'similar';
        score = o;
      }
    }
    if (reason) out.push({ item, reason, packDiffers, score: packDiffers ? score - 0.01 : score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Typeahead: catalog rows whose name or alias contains the query (normalized). */
export function searchCatalog<T extends CatalogLike>(query: string, catalog: T[], limit = 10): T[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const qn = normalizeShoppingItemName(q);
  return catalog
    .filter((row) => {
      const name = String(row.name || '').toLowerCase();
      if (name.includes(q)) return true;
      if (qn && normalizeShoppingItemName(name).includes(qn)) return true;
      return (row.aliases || []).some((a) => a.toLowerCase().includes(q));
    })
    .slice(0, limit);
}

export type AddChoice =
  | { kind: 'pick'; catalogItemId: string }
  | { kind: 'use-existing'; catalogItemId: string }
  | { kind: 'keep-separate'; saveToCatalog: boolean }
  | { kind: 'new'; saveToCatalog: boolean };

export type AddPlan =
  | { catalog: 'reuse'; catalogItemId: string; addAlias: boolean }
  | { catalog: 'create' }
  | { catalog: 'none' };

/**
 * What the add-item flow writes to the catalog. Never merges on its own:
 * with candidates present the user must have chosen use-existing or keep-separate.
 */
export function planCatalogWrite(choice: AddChoice, candidateCount: number): AddPlan {
  if (choice.kind === 'pick') return { catalog: 'reuse', catalogItemId: choice.catalogItemId, addAlias: false };
  if (choice.kind === 'use-existing') return { catalog: 'reuse', catalogItemId: choice.catalogItemId, addAlias: true };
  if (choice.kind === 'new' && candidateCount > 0) {
    throw new Error('Possible duplicates found: choose Use existing or Keep separate.');
  }
  return choice.saveToCatalog ? { catalog: 'create' } : { catalog: 'none' };
}
