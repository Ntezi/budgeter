// ADR-1 money convention: compute in integer minor units, store new money fields as
// integers with a `Minor` suffix, write existing major-unit fields with fromMinor
// (always 2 decimals). Scale 2 for the single app currency.
export const MINOR_PER_MAJOR = 100;
const MAX_MINOR = 100_000_000_000; // 1 000 000 000.00, far above any household amount

export function isMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_MINOR;
}

/** Major-unit number (as stored today, e.g. 12.5) to integer minor units (1250). */
export function toMinor(major: number): number {
  if (!Number.isFinite(major)) throw new Error('toMinor: not a finite number');
  // toFixed removes binary noise (1.005 * 100 = 100.4999…) before rounding.
  return Math.round(Number((major * MINOR_PER_MAJOR).toFixed(6)));
}

/** Integer minor units to a major-unit number with at most 2 decimals. */
export function fromMinor(minor: number): number {
  if (!Number.isInteger(minor)) throw new Error('fromMinor: minor units must be an integer');
  return minor / MINOR_PER_MAJOR;
}

export function sumMinor(values: number[]): number {
  return values.reduce((sum, v) => {
    if (!Number.isInteger(v)) throw new Error('sumMinor: minor units must be integers');
    return sum + v;
  }, 0);
}

/**
 * Parses a typed amount ("1,250.5", "120") to minor units.
 * Empty text → { minor: null } (no amount). More than 2 decimals or junk → error.
 */
export function parseMinorInput(text: string): { minor: number | null; error?: string } {
  const cleaned = String(text ?? '').replace(/[\s,]/g, '');
  if (!cleaned) return { minor: null };
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return { minor: null, error: 'Enter an amount like 120 or 120.50.' };
  const [whole, frac = ''] = cleaned.split('.');
  const minor = Number(whole) * MINOR_PER_MAJOR + Number((frac + '00').slice(0, 2));
  if (!isMinor(minor)) return { minor: null, error: 'Amount is too large.' };
  return { minor };
}

/** Minor units to the text shown in an input ("120.50"). */
export function minorToInput(minor: number | null | undefined): string {
  if (minor == null || !Number.isInteger(minor)) return '';
  return (minor / MINOR_PER_MAJOR).toFixed(2);
}
