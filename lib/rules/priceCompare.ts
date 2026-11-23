// BUDG-5 AC-5, AC-6: last comparable unit price. Pure. Two observations are comparable only
// for the same confirmed catalog item, the same variant (brand) and the same currency, both
// not returns, both normalized to the same base unit. Change is decided by cross-multiplication
// on integers (a.total x b.qty vs b.total x a.qty), so no rounding enters the up/down decision.
import { displayUnit, type BaseUnit } from './units';

export type PriceObservation = {
  id: string;
  receiptId: string;
  catalogItemId: string;
  variantKey: string;
  currencyCode: string;
  observedOn: string; // YYYY-MM-DD
  lineTotalMinor: number;
  baseUnit?: BaseUnit | null;
  baseQty?: number | null;
  isReturn?: boolean;
  promo?: boolean;
  storeName?: string;
  packSize?: number | null;
  unit?: string;
  quantity?: number;
};

export type PriceLabel = 'No earlier price' | 'Other currency' | 'Different unit' | 'Return' | 'Missing quantity or price' | 'Not in catalog';

export type Comparison =
  | {
      kind: 'compared';
      previous: PriceObservation;
      direction: 'up' | 'down' | 'same';
      /** Percent change in tenths of a percent, rounded for display only (e.g. 42 = 4.2%). */
      changeTenthsPct: number;
      promo: boolean;
      previousPromo: boolean;
    }
  | { kind: 'label'; label: PriceLabel };

export function isUsable(o: PriceObservation): boolean {
  return Boolean(o.baseUnit) && Number.isSafeInteger(o.baseQty) && (o.baseQty as number) > 0 &&
    Number.isSafeInteger(o.lineTotalMinor) && o.lineTotalMinor > 0;
}

function earlier(a: PriceObservation, b: PriceObservation) {
  // b is before a: by date, then by id so the order is total and stable.
  return b.observedOn < a.observedOn || (b.observedOn === a.observedOn && b.id < a.id);
}

/** Sign of (a per unit) - (b per unit), exact. */
export function compareUnitPrice(a: PriceObservation, b: PriceObservation): -1 | 0 | 1 {
  const left = BigInt(a.lineTotalMinor) * BigInt(b.baseQty as number);
  const right = BigInt(b.lineTotalMinor) * BigInt(a.baseQty as number);
  return left === right ? 0 : left > right ? 1 : -1;
}

export function lastComparable(obs: PriceObservation, history: PriceObservation[]): Comparison {
  if (!obs.catalogItemId) return { kind: 'label', label: 'Not in catalog' };
  if (obs.isReturn) return { kind: 'label', label: 'Return' };
  if (!isUsable(obs)) return { kind: 'label', label: 'Missing quantity or price' };
  const sameProduct = history.filter(
    (h) => h.id !== obs.id && h.catalogItemId === obs.catalogItemId && h.variantKey === obs.variantKey && earlier(obs, h)
  );
  const comparable = sameProduct.filter(
    (h) => !h.isReturn && isUsable(h) && h.currencyCode === obs.currencyCode && h.baseUnit === obs.baseUnit
  );
  if (!comparable.length) {
    const usable = sameProduct.filter((h) => !h.isReturn && isUsable(h));
    if (usable.some((h) => h.currencyCode !== obs.currencyCode)) return { kind: 'label', label: 'Other currency' };
    if (usable.some((h) => h.baseUnit !== obs.baseUnit)) return { kind: 'label', label: 'Different unit' };
    return { kind: 'label', label: 'No earlier price' };
  }
  const previous = comparable.reduce((best, h) => (earlier(best, h) ? best : h));
  const sign = compareUnitPrice(obs, previous);
  // Display-only percentage: (a.total*b.qty - b.total*a.qty) / (b.total*a.qty), in tenths.
  const num = BigInt(obs.lineTotalMinor) * BigInt(previous.baseQty as number) - BigInt(previous.lineTotalMinor) * BigInt(obs.baseQty as number);
  const den = BigInt(previous.lineTotalMinor) * BigInt(obs.baseQty as number);
  const tenths = Math.round(Number((num * 10000n) / den) / 10);
  return {
    kind: 'compared',
    previous,
    direction: sign === 0 ? 'same' : sign > 0 ? 'up' : 'down',
    changeTenthsPct: Math.abs(tenths),
    promo: Boolean(obs.promo),
    previousPromo: Boolean(previous.promo),
  };
}

/** Unit price in minor units per kg / l / piece, rounded for display only. */
export function displayUnitPriceMinor(o: PriceObservation): { minor: number; unitLabel: string } | null {
  if (!isUsable(o)) return null;
  const d = displayUnit(o.baseUnit as BaseUnit);
  return { minor: Math.round((o.lineTotalMinor * d.per) / (o.baseQty as number)), unitLabel: d.label };
}

/** Short chip text, e.g. "Last 12.50 / kg · 2026-11-03 · up 4.2%". `fmt` formats minor units. */
export function priceChipText(obs: PriceObservation, cmp: Comparison, fmt: (minor: number) => string): string {
  if (cmp.kind === 'label') return cmp.label;
  const prev = displayUnitPriceMinor(cmp.previous);
  if (!prev) return 'Missing quantity or price';
  const change = cmp.direction === 'same' ? 'same price' : `${cmp.direction} ${(cmp.changeTenthsPct / 10).toFixed(1)}%`;
  const promo = cmp.promo || cmp.previousPromo ? ' · Promo' : '';
  const store = cmp.previous.storeName ? ` · ${cmp.previous.storeName}` : '';
  return `Last ${fmt(prev.minor)} / ${prev.unitLabel} · ${cmp.previous.observedOn}${store} · ${change}${promo}`;
}

/** Variant key from a brand (pack size is kept as data, not part of the key, so 500 g and 1 kg compare). */
export function variantKeyOf(variant?: { brand?: string } | null): string {
  return String(variant?.brand || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
}
