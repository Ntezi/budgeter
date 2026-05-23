import assert from 'node:assert/strict';
import { matchShoppingItems, matchShoppingItemsExactName } from '../../lib/shopping/import/matchShoppingItems';
import { parseShoppingText } from '../../lib/shopping/import/parseShoppingText';
import type { ShoppingListItem } from '../../lib/repo/shopping';

export function runMatcherTests() {
  const existing: ShoppingListItem[] = [
    { id: 'rice', name: 'Rice', quantity: 1 },
    { id: 'tomatoes', name: 'Tomatoes', quantity: 1 },
    { id: 'milk', name: 'Milk', quantity: 1 },
  ];
  const parsed = parseShoppingText(['umuceri 5kg', 'tomate 5000', 'lait 2000', 'bread x2'].join('\n'));
  const matches = matchShoppingItems(parsed, existing);

  assert.equal(matches[0].matchedItemId, 'rice');
  assert.equal(matches[0].confidenceLabel, 'auto');
  assert.equal(matches[1].matchedItemId, 'tomatoes');
  assert.equal(matches[1].confidenceLabel, 'auto');
  assert.equal(matches[2].matchedItemId, 'milk');
  assert.equal(matches[2].confidenceLabel, 'auto');
  assert.equal(matches[3].confidenceLabel, 'none');

  const catalogLike: ShoppingListItem[] = [
    { id: 'salmon', name: 'Salmon', quantity: 1 },
    { id: 'flour', name: 'Flour', quantity: 1 },
    { id: 'bell-pepper', name: 'Bell Pepper', quantity: 1 },
  ];
  const commaParsed = parseShoppingText(['Fresh Pink salmon,1,', 'All purpose flour,1,', 'Green bell peppers,1,'].join('\n'));
  const commaMatches = matchShoppingItems(commaParsed, catalogLike);

  assert.equal(commaMatches[0].matchedItemId, 'salmon');
  assert.equal(commaMatches[0].confidenceLabel, 'auto');
  assert.equal(commaMatches[1].matchedItemId, 'flour');
  assert.equal(commaMatches[1].confidenceLabel, 'review');
  assert.equal(commaMatches[2].matchedItemId, 'bell-pepper');
  assert.equal(commaMatches[2].confidenceLabel, 'auto');

  const exactParsed = parseShoppingText(['chicken wings,3kg,', 'fresh pink salmon,1,'].join('\n'));
  const exactMatches = matchShoppingItemsExactName(exactParsed, [
    { id: 'wings', name: 'Chicken Wings', quantity: 1 },
    { id: 'salmon', name: 'Salmon', quantity: 1 },
  ]);

  assert.equal(exactMatches[0].matchedItemId, 'wings');
  assert.equal(exactMatches[0].confidenceLabel, 'auto');
  assert.equal(exactMatches[1].confidenceLabel, 'none');
}
