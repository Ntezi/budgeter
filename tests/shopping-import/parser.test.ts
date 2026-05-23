import assert from 'node:assert/strict';
import { parseShoppingText } from '../../lib/shopping/import/parseShoppingText';

export function runParserTests() {
  const rows = parseShoppingText(
    [
      'Rice',
      'Rice 5kg',
      'Tomatoes 5000',
      'Cooking oil 3L 12000',
      'Bread x2',
      'Bread x2 @ 1000 = 2000',
    ].join('\n')
  );

  assert.equal(rows.length, 6);
  assert.equal(rows[0].name, 'Rice');
  assert.equal(rows[1].quantity, 5);
  assert.equal(rows[1].unit, 'kg');
  assert.equal(rows[2].totalPrice, 5000);
  assert.equal(rows[3].name, 'Cooking oil');
  assert.equal(rows[3].quantity, 3);
  assert.equal(rows[3].unit, 'l');
  assert.equal(rows[3].totalPrice, 12000);
  assert.equal(rows[4].quantity, 2);
  assert.equal(rows[5].unitPrice, 1000);
  assert.equal(rows[5].totalPrice, 2000);

  const commaRows = parseShoppingText(['Chicken wings,3kg,', 'Chicken breast,2 packs,', 'Fresh Pink salmon,1,'].join('\n'));
  assert.equal(commaRows.length, 3);
  assert.equal(commaRows[0].name, 'Chicken wings');
  assert.equal(commaRows[0].quantity, 3);
  assert.equal(commaRows[0].unit, 'kg');
  assert.equal(commaRows[1].name, 'Chicken breast');
  assert.equal(commaRows[1].quantity, 2);
  assert.equal(commaRows[1].unit, 'packs');
  assert.equal(commaRows[2].name, 'Fresh Pink salmon');
  assert.equal(commaRows[2].quantity, 1);

  const pinkRows = parseShoppingText('Pink salmon,1,');
  assert.equal(pinkRows[0].name, 'Pink salmon');
}
