// BUDG-5 AC-5 / AC-6 with synthetic fixtures: normalization, comparability, returns, currency.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { fromMinor, parseMinor, sumMinor, toMinor, minorToText } from '../../lib/money';
import { normalizeQuantity } from '../../lib/rules/units';
import { lastComparable, priceChipText, compareUnitPrice, type PriceObservation } from '../../lib/rules/priceCompare';
import { buildObservations, cleanReceipt, receiptTotalMinor, receiptTxId, receiptLinkId, expenseMinorOf, type Receipt } from '../../lib/repo/receiptsCore';

const fmt = (m: number) => minorToText(m);
let n = 0;
function obs(p: Partial<PriceObservation> & { qty: number; unit: string; total: number; on: string; variant?: any }): PriceObservation {
  const norm = normalizeQuantity(p.qty, p.unit, p.variant);
  n += 1;
  return {
    id: p.id || `r${n}_l1`, receiptId: `r${n}`, catalogItemId: p.catalogItemId ?? 'rice', variantKey: p.variantKey ?? '',
    currencyCode: p.currencyCode ?? 'GHS', observedOn: p.on, lineTotalMinor: p.total,
    baseUnit: norm?.baseUnit ?? null, baseQty: norm?.baseQty ?? null, isReturn: p.isReturn, promo: p.promo, storeName: p.storeName,
  };
}

describe('money (ADR-1)', () => {
  test('parseMinor is exact and rejects more than 2 decimals', () => {
    assert.equal(parseMinor('12.5'), 1250);
    assert.equal(parseMinor('0.1'), 10);
    assert.equal(parseMinor('1,234.05'), 123405);
    assert.equal(parseMinor('12.345'), null);
    assert.equal(parseMinor('-3'), null);
    assert.equal(parseMinor('abc'), null);
  });
  test('toMinor / fromMinor / sumMinor', () => {
    assert.equal(toMinor(0.1 + 0.2), 30);
    assert.equal(fromMinor(1999), 19.99);
    assert.equal(sumMinor([10, 20, 1]), 31);
    assert.throws(() => fromMinor(1.5));
  });
});

describe('units (AC-5)', () => {
  test('g<->kg, ml<->l, pieces and packs normalize to integers', () => {
    assert.deepEqual(normalizeQuantity(500, 'g'), { baseUnit: 'g', baseQty: 500 });
    assert.deepEqual(normalizeQuantity(1, 'kg'), { baseUnit: 'g', baseQty: 1000 });
    assert.deepEqual(normalizeQuantity(1.5, 'kg'), { baseUnit: 'g', baseQty: 1500 });
    assert.deepEqual(normalizeQuantity(750, 'ml'), { baseUnit: 'ml', baseQty: 750 });
    assert.deepEqual(normalizeQuantity(2, 'l'), { baseUnit: 'ml', baseQty: 2000 });
    assert.deepEqual(normalizeQuantity(6, 'pc'), { baseUnit: 'pc', baseQty: 6 });
    assert.deepEqual(normalizeQuantity(1, 'pack', { packSize: 6 }), { baseUnit: 'pc', baseQty: 6 });
    assert.deepEqual(normalizeQuantity(2, 'pack', { packSize: 6, unit: 'l' }), { baseUnit: 'ml', baseQty: 12000 });
  });
  test('missing unit, pack without size and fractional base are not normalized', () => {
    assert.equal(normalizeQuantity(1, ''), null);
    assert.equal(normalizeQuantity(1, 'pack'), null);
    assert.equal(normalizeQuantity(0.0004, 'kg'), null);
    assert.equal(normalizeQuantity(0, 'g'), null);
  });
});

describe('lastComparable (AC-5)', () => {
  test('500 g vs 1 kg of the same product and currency: per-kg compare, up', () => {
    const before = obs({ qty: 1, unit: 'kg', total: 1200, on: '2026-11-03', storeName: 'Corner shop' });
    const now = obs({ qty: 500, unit: 'g', total: 650, on: '2026-11-20' });
    const c = lastComparable(now, [before, now]);
    assert.equal(c.kind, 'compared');
    if (c.kind !== 'compared') return;
    assert.equal(c.direction, 'up');
    assert.equal(c.changeTenthsPct, 83); // 13.00/kg vs 12.00/kg = +8.3%
    assert.equal(priceChipText(now, c, fmt), 'Last 12.00 / kg · 2026-11-03 · Corner shop · up 8.3%');
  });
  test('6-pack vs pieces compare per piece; promo is kept and shown', () => {
    const pieces = obs({ qty: 2, unit: 'pc', total: 300, on: '2026-11-01' });
    const pack = obs({ qty: 1, unit: 'pack', variant: { packSize: 6 }, total: 780, on: '2026-11-10', promo: true });
    const c = lastComparable(pack, [pieces]);
    assert.equal(c.kind, 'compared');
    if (c.kind !== 'compared') return;
    assert.equal(c.direction, 'down'); // 1.30 vs 1.50 per piece
    assert.equal(c.promo, true);
    assert.match(priceChipText(pack, c, fmt), /^Last 1\.50 \/ piece · 2026-11-01 · down 13\.3% · Promo$/);
  });
  test('the latest earlier comparable observation is used, never a later one', () => {
    const a = obs({ qty: 1, unit: 'kg', total: 1000, on: '2026-10-01' });
    const b = obs({ qty: 1, unit: 'kg', total: 1100, on: '2026-10-15' });
    const later = obs({ qty: 1, unit: 'kg', total: 100, on: '2026-12-01' });
    const now = obs({ qty: 1, unit: 'kg', total: 1100, on: '2026-11-01' });
    const c = lastComparable(now, [a, later, b]);
    assert.ok(c.kind === 'compared' && c.previous === b && c.direction === 'same');
  });
  test('exact cross-multiplication: 1/3 prices with no rounding drift', () => {
    const a = obs({ qty: 3, unit: 'pc', total: 100, on: '2026-10-01' });
    const b = obs({ qty: 6, unit: 'pc', total: 200, on: '2026-10-02' });
    assert.equal(compareUnitPrice(b, a), 0);
  });
});

describe('never a false decrease (AC-6)', () => {
  const base = () => obs({ qty: 1, unit: 'kg', total: 2000, on: '2026-11-01' });
  test('a return is labelled Return and is never a previous price', () => {
    const ret = obs({ qty: 1, unit: 'kg', total: 500, on: '2026-11-05', isReturn: true });
    assert.deepEqual(lastComparable(ret, [base()]), { kind: 'label', label: 'Return' });
    const now = obs({ qty: 1, unit: 'kg', total: 1000, on: '2026-11-10' });
    assert.deepEqual(lastComparable(now, [ret]), { kind: 'label', label: 'No earlier price' });
  });
  test('another currency is labelled, not compared', () => {
    const usd = obs({ qty: 1, unit: 'kg', total: 300, on: '2026-11-10', currencyCode: 'USD' });
    assert.deepEqual(lastComparable(usd, [base()]), { kind: 'label', label: 'Other currency' });
  });
  test('a different product or brand is never compared', () => {
    const other = obs({ qty: 1, unit: 'kg', total: 100, on: '2026-11-10', catalogItemId: 'beans' });
    assert.deepEqual(lastComparable(other, [base()]), { kind: 'label', label: 'No earlier price' });
    const brand = obs({ qty: 1, unit: 'kg', total: 100, on: '2026-11-10', variantKey: 'acme' });
    assert.deepEqual(lastComparable(brand, [base()]), { kind: 'label', label: 'No earlier price' });
  });
  test('a different dimension and missing data are labelled', () => {
    const litres = obs({ qty: 1, unit: 'l', total: 100, on: '2026-11-10' });
    assert.deepEqual(lastComparable(litres, [base()]), { kind: 'label', label: 'Different unit' });
    const noUnit = obs({ qty: 1, unit: '', total: 100, on: '2026-11-10' });
    assert.deepEqual(lastComparable(noUnit, [base()]), { kind: 'label', label: 'Missing quantity or price' });
    const noCatalog = obs({ qty: 1, unit: 'kg', total: 100, on: '2026-11-10', catalogItemId: '' });
    assert.deepEqual(lastComparable(noCatalog, [base()]), { kind: 'label', label: 'Not in catalog' });
  });
});

describe('receipt model (SEC-17, SEC-20, ADR-1)', () => {
  const draft = (): Receipt => ({
    id: 'r-123', status: 'DRAFT', purchaseDate: '2026-11-20', currencyCode: 'GHS', totalMinor: 0, createdBy: 'u1', storeName: ' Shop ',
    lines: [
      { lineId: 'l1', name: 'Rice', quantity: 1, unit: 'kg', lineTotalMinor: 1250, catalogItemId: 'rice' },
      { lineId: 'l2', name: 'Juice', quantity: 2, unit: 'l', lineTotalMinor: 600 },
      { lineId: 'l3', name: 'Rice', quantity: 1, unit: 'kg', lineTotalMinor: 1250, catalogItemId: 'rice', isReturn: true },
    ],
  });
  test('total is the signed sum of lines; unknown fields are dropped', () => {
    const r = cleanReceipt({ ...draft(), photoUrl: 'x', cardDigits: '1234' } as any);
    assert.equal(r.totalMinor, 600);
    assert.equal(receiptTotalMinor(r.lines), 600);
    assert.equal(r.storeName, 'Shop');
    assert.equal('photoUrl' in r, false);
    assert.equal('cardDigits' in r, false);
  });
  test('limits and invalid input are rejected', () => {
    assert.throws(() => cleanReceipt({ ...draft(), storeName: 'x'.repeat(121) }));
    assert.throws(() => cleanReceipt({ ...draft(), purchaseDate: '2026-02-30' }));
    assert.throws(() => cleanReceipt({ ...draft(), currencyCode: 'ghs' }));
    assert.throws(() => cleanReceipt({ ...draft(), lines: [] }));
    assert.throws(() => cleanReceipt({ ...draft(), lines: [{ ...draft().lines[0], lineTotalMinor: 12.5 }] }));
    assert.throws(() => cleanReceipt({ ...draft(), id: 'a/b' }));
    assert.throws(() => receiptTxId('x/y'));
    assert.equal(receiptTxId('r-123'), 'rcpt_r-123');
    assert.equal(receiptLinkId('2026-11', 'tx-1'), '2026-11_tx-1');
  });
  test('observations only for catalog lines, with deterministic ids; return kept as return', () => {
    const o = buildObservations(cleanReceipt(draft()));
    assert.deepEqual(o.map((x) => x.id), ['r-123_l1', 'r-123_l3']);
    assert.equal(o[0].baseQty, 1000);
    assert.equal(o[1].isReturn, true);
    assert.equal(o[0].storeName, 'Shop');
  });
  test('a return-only receipt cannot record a new expense', () => {
    const r = cleanReceipt({ ...draft(), lines: [draft().lines[2]] });
    assert.throws(() => expenseMinorOf(r), /no amount/);
  });
});
