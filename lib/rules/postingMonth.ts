// Posting month rules (BUDG-1 AC-5): an expense posts to the month of its own
// date, never to the month the user is viewing.

const DATE_ISO = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Local calendar date as YYYY-MM-DD (not UTC, unlike toISOString). */
export function localDateISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDateISO(value: string): boolean {
  const match = DATE_ISO.exec(String(value || '').trim());
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

/** The period (YYYY-MM) an expense dated `dateISO` posts to. */
export function postingPeriodId(dateISO: string): string {
  const value = String(dateISO || '').trim();
  if (!isDateISO(value)) throw new Error(`Invalid expense date "${dateISO}"`);
  return value.slice(0, 7);
}
