// ADR-1 option (c): existing fields keep major-unit numbers; new money fields are
// integers in minor units (scale 2 for the app currency) with a `Minor` suffix.

export const MONEY_SCALE = 2;
const MAX_MINOR = 1_000_000_000_00; // 1 billion major units: a bound, not a business rule

/** Major-unit number to integer minor units (ADR-1: Math.round(major x 100)). */
export function toMinor(major: number): number {
  const value = Number(major);
  if (!Number.isFinite(value)) throw new Error('Amount is not a number.');
  return Math.round(value * 100);
}

/** Integer minor units to a major-unit number with exactly 2 decimals (for existing fields). */
export function fromMinor(minor: number): number {
  assertMinor(minor);
  return Number((minor / 100).toFixed(MONEY_SCALE));
}

export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => {
    assertMinor(v);
    return acc + v;
  }, 0);
}

export function assertMinor(minor: number) {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MINOR) throw new Error('Amount must be an exact amount in cents.');
}

/**
 * Typed text ("12", "12.5", "12.50", "1,234.50") to integer minor units without
 * going through a float. Returns null for anything else (more than 2 decimals, signs, letters).
 */
export function parseMinor(text: string): number | null {
  const raw = String(text ?? '').trim().replace(/,/g, '');
  const m = /^(\d{1,12})(?:\.(\d{0,2}))?$/.exec(raw);
  if (!m) return null;
  const minor = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0') || '0');
  return minor <= MAX_MINOR ? minor : null;
}

/** Minor units as plain text with 2 decimals ("1250" -> "12.50"), for inputs. */
export function minorToText(minor: number): string {
  assertMinor(minor);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
