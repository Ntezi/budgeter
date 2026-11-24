// BUDG-5 AC-5: quantity normalization for unit-price comparison. Integers only:
// kg -> g x 1000, l -> ml x 1000, pack(n) -> n pieces (or n x the variant's unit).
// Different dimensions are never comparable.

export type BaseUnit = 'g' | 'ml' | 'pc';
export type Normalized = { baseUnit: BaseUnit; baseQty: number };

const FACTORS: Record<string, Normalized> = {
  g: { baseUnit: 'g', baseQty: 1 },
  kg: { baseUnit: 'g', baseQty: 1000 },
  ml: { baseUnit: 'ml', baseQty: 1 },
  l: { baseUnit: 'ml', baseQty: 1000 },
  pc: { baseUnit: 'pc', baseQty: 1 },
};
const MAX_BASE_QTY = 100_000_000;

function toIntegerBase(quantity: number, factor: number): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const scaled = quantity * factor;
  const rounded = Math.round(scaled);
  // Accept 1.5 kg (1500 g) but not 0.0004 kg (0.4 g): base quantities stay whole.
  if (rounded <= 0 || Math.abs(scaled - rounded) > 1e-6 || rounded > MAX_BASE_QTY) return null;
  return rounded;
}

/**
 * Normalizes `quantity` of `unit`. `pack` needs a pack size: the variant's packSize in the
 * variant's unit (6 x 330 ml, 1 x 5 kg) or plain pieces when the variant has no unit.
 * Returns null when the quantity cannot be normalized (missing unit or pack size, fractional base).
 */
export function normalizeQuantity(
  quantity: number,
  unit: string | undefined,
  variant?: { packSize?: number; unit?: string } | null
): Normalized | null {
  const u = String(unit || '').trim().toLowerCase();
  if (u === 'pack') {
    const packSize = Number(variant?.packSize);
    if (!Number.isFinite(packSize) || packSize <= 0) return null;
    const inner = FACTORS[String(variant?.unit || 'pc').toLowerCase()];
    if (!inner) return null;
    const qty = toIntegerBase(quantity * packSize, inner.baseQty);
    return qty === null ? null : { baseUnit: inner.baseUnit, baseQty: qty };
  }
  const f = FACTORS[u];
  if (!f) return null;
  const qty = toIntegerBase(quantity, f.baseQty);
  return qty === null ? null : { baseUnit: f.baseUnit, baseQty: qty };
}

/** Display unit for a base unit: prices are shown per kg, per l or per piece. */
export function displayUnit(baseUnit: BaseUnit): { label: string; per: number } {
  if (baseUnit === 'g') return { label: 'kg', per: 1000 };
  if (baseUnit === 'ml') return { label: 'l', per: 1000 };
  return { label: 'piece', per: 1 };
}
