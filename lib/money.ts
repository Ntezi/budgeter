// ADR-1 money convention (one module for BUDG-2 and BUDG-5): existing fields keep
// major-unit numbers written with fromMinor (2 decimals); new money fields are
// integers in minor units with a `Minor` suffix. Scale 2 for the app currency.
export const MONEY_SCALE = 2;
export const MINOR_PER_MAJOR = 100;
const MAX_MINOR = 100_000_000_000; // 1 000 000 000.00 major units: a bound, not a business rule

/** Throws unless `minor` is a safe integer within the bound (negative allowed: receipt returns). */
export function assertMinor(minor: number) {
  if (!Number.isSafeInteger(minor) || Math.abs(minor) > MAX_MINOR) throw new Error('Amount must be an exact amount in cents.');
}

/** True for a non-negative integer minor amount within the bound (plan estimates). */
export function isMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_MINOR;
}

/** Major-unit number (as stored today, e.g. 12.5) to integer minor units (1250). */
export function toMinor(major: number): number {
  const value = Number(major);
  if (!Number.isFinite(value)) throw new Error('Amount is not a number.');
  // toFixed removes binary noise (1.005 * 100 = 100.4999…) before rounding.
  return Math.round(Number((value * MINOR_PER_MAJOR).toFixed(6)));
}

/** Integer minor units to a major-unit number with at most 2 decimals (for existing fields). */
export function fromMinor(minor: number): number {
  assertMinor(minor);
  return Number((minor / MINOR_PER_MAJOR).toFixed(MONEY_SCALE));
}

export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => {
    assertMinor(v);
    return acc + v;
  }, 0);
}

const AMOUNT_RE = /^(\d{1,12})(?:\.(\d{0,2}))?$/;

/**
 * Typed text ("12", "12.5", "1,234.50", "1 250") to integer minor units without going
 * through a float. Null for anything else (more than 2 decimals, signs, letters, too large).
 */
export function parseMinor(text: string): number | null {
  const m = AMOUNT_RE.exec(String(text ?? '').trim().replace(/[\s,]/g, ''));
  if (!m) return null;
  const minor = Number(m[1]) * MINOR_PER_MAJOR + Number((m[2] || '').padEnd(2, '0'));
  return minor <= MAX_MINOR ? minor : null;
}

/** Form variant of parseMinor: empty text is "no amount"; anything invalid carries a message. */
export function parseMinorInput(text: string): { minor: number | null; error?: string } {
  const cleaned = String(text ?? '').replace(/[\s,]/g, '');
  if (!cleaned) return { minor: null };
  const minor = parseMinor(cleaned);
  if (minor != null) return { minor };
  return AMOUNT_RE.test(cleaned)
    ? { minor: null, error: 'Amount is too large.' }
    : { minor: null, error: 'Enter an amount like 120 or 120.50.' };
}

/** Minor units as plain text with 2 decimals ("1250" -> "12.50"), for inputs. */
export function minorToText(minor: number): string {
  assertMinor(minor);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / MINOR_PER_MAJOR)}.${String(abs % MINOR_PER_MAJOR).padStart(2, '0')}`;
}

/** minorToText for an optional amount: '' when absent. */
export function minorToInput(minor: number | null | undefined): string {
  return minor == null || !Number.isInteger(minor) ? '' : minorToText(minor);
}
