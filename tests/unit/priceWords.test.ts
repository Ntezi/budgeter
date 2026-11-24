import test from 'node:test';
import assert from 'node:assert/strict';
import { plainPriceWords, priceLine } from '../../lib/shopping/priceWords';
import { fmtMoney } from '../../lib/format';

test('BUDG-8 D-9: no "No earlier price" or bare "Return" in the catalog price line', () => {
  assert.equal(plainPriceWords('No earlier price'), '');
  assert.equal(plainPriceWords('Return'), 'Last one was a return');
  assert.equal(plainPriceWords('Last GHS 12.00 / kg · 2026-10-05 · up 4.5%'), 'Last GHS 12.00 / kg · 2026-10-05 · price went up 4.5%');
  assert.equal(plainPriceWords('Last GHS 12.00 / kg · 2026-10-05 · down 2.0%'), 'Last GHS 12.00 / kg · 2026-10-05 · price went down 2.0%');
  assert.equal(priceLine('Last GHS 12.00 / kg · 2026-10-05', plainPriceWords('No earlier price')), 'Last GHS 12.00 / kg · 2026-10-05');
});

test('BUDG-8 C-6: one money format, currency code first, for every currency', () => {
  assert.match(fmtMoney(1.5, 'USD'), /^USD\s1\.50$/);
  assert.match(fmtMoney(1165, 'GHS'), /^GHS\s1,165\.00$/);
  assert.match(fmtMoney(-1230, 'GHS'), /^-GHS\s1,230\.00$/);
});
