import assert from 'node:assert/strict';
import { parseShoppingText } from '../../lib/shopping/import/parseShoppingText';
import { reconcilePurchasedItems } from '../../lib/shopping/import/reconcilePurchasedItems';
import type { ShoppingListItem } from '../../lib/repo/shopping';

export function runReconcileTests() {
  const planned: ShoppingListItem[] = [
    { id: 'rice', name: 'Rice', quantity: 1, price: 3000 },
    { id: 'tomatoes', name: 'Tomatoes', quantity: 1, price: 5000 },
    { id: 'sugar', name: 'Sugar', quantity: 1, price: 2500 },
  ];
  const parsed = parseShoppingText(['umuceri 3200', 'inyanya 4500', 'bread x2 @ 1000 = 2000'].join('\n'));
  const result = reconcilePurchasedItems(parsed, planned);

  assert.equal(result.purchasedItemIds.includes('rice'), true);
  assert.equal(result.purchasedItemIds.includes('tomatoes'), true);
  assert.equal(result.missingPlannedItemIds.includes('sugar'), true);
  assert.equal(result.plannedTotal, 10500);
  assert.equal(result.actualTotal, 9700);
  assert.equal(result.variance, -800);
}
