// BUDG-5 receipts: pure model, validation and derived docs (no Firebase import, unit-testable).
// SEC-17: only these fields; line names and storeName <= 120 chars; no photo, payer, card or address.
// ADR-1: money in integer minor units (lineTotalMinor, totalMinor). C-10: new collections only.
import { assertMinor } from '../money';
import { isDateISO, postingPeriodId } from '../rules/postingMonth';
import { normalizeQuantity } from '../rules/units';
import { variantKeyOf, type PriceObservation } from '../rules/priceCompare';

export const MAX_RECEIPT_LINES = 200;
export const RECEIPT_UNITS = ['pc', 'g', 'kg', 'ml', 'l', 'pack'] as const;
const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const CURRENCY = /^[A-Z]{3}$/;

export type ReceiptLine = {
  lineId: string;
  name: string;
  catalogItemId?: string;
  variant?: { packSize?: number; unit?: string; brand?: string };
  quantity: number;
  unit: string;
  lineTotalMinor: number;
  promo?: boolean;
  isReturn?: boolean;
};

export type ReceiptLink = { periodId: string; txId: string; mode: 'EXISTING' | 'NEW' };

export type Receipt = {
  id: string;
  status: 'DRAFT' | 'CONFIRMED';
  storeName?: string;
  purchaseDate: string;
  currencyCode: string;
  totalMinor: number;
  lines: ReceiptLine[];
  link?: ReceiptLink;
  sourceListId?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function assertSafeId(id: string, what: string) {
  if (!SAFE_ID.test(String(id || ''))) throw new Error(`Invalid ${what}.`);
}

/** New expense id for a receipt (SEC-20: built from a server-safe id only). */
export function receiptTxId(receiptId: string) {
  assertSafeId(receiptId, 'receipt id');
  return `rcpt_${receiptId}`;
}

export function receiptLinkId(periodId: string, txId: string) {
  assertSafeId(periodId, 'month');
  assertSafeId(txId, 'expense id');
  return `${periodId}_${txId}`;
}

export function observationId(receiptId: string, lineId: string) {
  return `${receiptId}_${lineId}`;
}

/** Signed receipt total: returns subtract. */
export function receiptTotalMinor(lines: Pick<ReceiptLine, 'lineTotalMinor' | 'isReturn'>[]) {
  return lines.reduce((acc, l) => {
    assertMinor(l.lineTotalMinor);
    return acc + (l.isReturn ? -l.lineTotalMinor : l.lineTotalMinor);
  }, 0);
}

/** Validates a receipt before any write; returns the cleaned receipt (fields outside SEC-17 dropped). */
export function cleanReceipt(input: Receipt): Receipt {
  assertSafeId(input.id, 'receipt id');
  if (!isDateISO(input.purchaseDate)) throw new Error('Choose a valid purchase date.');
  if (!CURRENCY.test(String(input.currencyCode || ''))) throw new Error('Currency must be a 3-letter code.');
  const storeName = String(input.storeName || '').trim();
  if (storeName.length > 120) throw new Error('Store name is too long (120 characters at most).');
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error('Add at least one item.');
  if (input.lines.length > MAX_RECEIPT_LINES) throw new Error(`A receipt holds ${MAX_RECEIPT_LINES} items at most.`);
  const seen = new Set<string>();
  const lines: ReceiptLine[] = input.lines.map((l, i) => {
    assertSafeId(l.lineId, 'line id');
    if (seen.has(l.lineId)) throw new Error('Duplicate line.');
    seen.add(l.lineId);
    const name = String(l.name || '').trim();
    if (!name || name.length > 120) throw new Error(`Item ${i + 1}: name is required (120 characters at most).`);
    const quantity = Number(l.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999) throw new Error(`${name}: quantity must be between 0 and 9999.`);
    const unit = String(l.unit || '');
    if (!(RECEIPT_UNITS as readonly string[]).includes(unit)) throw new Error(`${name}: choose a unit.`);
    if (!Number.isSafeInteger(l.lineTotalMinor) || l.lineTotalMinor <= 0) throw new Error(`${name}: enter the price paid.`);
    assertMinor(l.lineTotalMinor);
    const out: ReceiptLine = { lineId: l.lineId, name, quantity, unit, lineTotalMinor: l.lineTotalMinor };
    if (l.catalogItemId) {
      if (String(l.catalogItemId).length > 200 || String(l.catalogItemId).includes('/')) throw new Error(`${name}: invalid catalog item.`);
      out.catalogItemId = l.catalogItemId;
    }
    if (l.variant && (l.variant.packSize || l.variant.unit || l.variant.brand)) {
      const v: ReceiptLine['variant'] = {};
      if (l.variant.packSize && Number(l.variant.packSize) > 0) v.packSize = Number(l.variant.packSize);
      if (l.variant.unit && (RECEIPT_UNITS as readonly string[]).includes(l.variant.unit)) v.unit = l.variant.unit;
      if (l.variant.brand) v.brand = String(l.variant.brand).trim().slice(0, 60);
      out.variant = v;
    }
    if (l.promo) out.promo = true;
    if (l.isReturn) out.isReturn = true;
    return out;
  });
  const totalMinor = receiptTotalMinor(lines);
  const out: Receipt = {
    id: input.id,
    status: input.status === 'CONFIRMED' ? 'CONFIRMED' : 'DRAFT',
    purchaseDate: input.purchaseDate,
    currencyCode: input.currencyCode,
    totalMinor,
    lines,
    createdBy: input.createdBy,
  };
  if (storeName) out.storeName = storeName;
  if (input.sourceListId) {
    assertSafeId(input.sourceListId, 'list id');
    out.sourceListId = input.sourceListId;
  }
  return out;
}

/** Posting month of a receipt's new expense (BUDG-1 rule: the month of its own date). */
export function receiptPeriodId(r: Pick<Receipt, 'purchaseDate'>) {
  return postingPeriodId(r.purchaseDate);
}

/** Price observations for a CONFIRMED receipt: one per line with a confirmed catalog item. */
export function buildObservations(r: Receipt): PriceObservation[] {
  return r.lines
    .filter((l) => l.catalogItemId)
    .map((l) => {
      const n = normalizeQuantity(l.quantity, l.unit, l.variant);
      const o: PriceObservation = {
        id: observationId(r.id, l.lineId),
        receiptId: r.id,
        catalogItemId: l.catalogItemId as string,
        variantKey: variantKeyOf(l.variant),
        currencyCode: r.currencyCode,
        observedOn: r.purchaseDate,
        lineTotalMinor: l.lineTotalMinor,
        baseUnit: n?.baseUnit ?? null,
        baseQty: n?.baseQty ?? null,
        isReturn: Boolean(l.isReturn),
        promo: Boolean(l.promo),
        quantity: l.quantity,
        unit: l.unit,
        packSize: l.variant?.packSize ?? null,
      };
      if (r.storeName) o.storeName = r.storeName;
      return o;
    });
}

/** Expense amount for a receipt's new expense: must be positive (a return-only receipt records nothing). */
export function expenseMinorOf(r: Receipt) {
  if (r.totalMinor <= 0) throw new Error('This receipt has no amount to record. Link it to an existing expense instead.');
  return r.totalMinor;
}
