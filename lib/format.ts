const DEFAULT_CURRENCY = process.env.EXPO_PUBLIC_APP_CURRENCY || 'GHS';

export function fmtMoney(value: number, currency = DEFAULT_CURRENCY, locale?: string) {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function fmtNumber(value: number, locale?: string) {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(locale).format(amount);
  } catch {
    return String(amount);
  }
}

// Parse strings like "8,000" / "8000.50" -> number
export const parseMoney = (s: string) => Number(String(s).replace(/[^0-9.\-]/g, '')) || 0;

// Clamp and normalize percent input given in 0-100 form
export const parsePct100 = (s: string) => {
  const v = Number(String(s).replace(/[^0-9.\-]/g, '')) || 0;
  return Math.max(0, Math.min(100, v)) / 100;
};
