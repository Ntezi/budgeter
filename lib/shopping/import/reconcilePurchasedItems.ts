import type { ShoppingListItem } from '@/lib/repo/shopping';
import { matchShoppingItems } from './matchShoppingItems';
import type { ParsedShoppingItem, PurchaseReconciliationResult, ShoppingItemMatchResult } from './shoppingImportTypes';

function plannedItemTotal(item: ShoppingListItem) {
  return Math.max(0, Number(item.price || 0)) * Math.max(1, Number(item.quantity || 1));
}

function actualParsedTotal(item: ParsedShoppingItem) {
  if (item.totalPrice !== undefined) return Math.max(0, item.totalPrice);
  if (item.unitPrice !== undefined) return Math.max(0, item.unitPrice) * Math.max(1, Number(item.quantity || 1));
  return 0;
}

export function reconcilePurchasedItems(parsedItems: ParsedShoppingItem[], plannedItems: ShoppingListItem[]): PurchaseReconciliationResult {
  const matches = matchShoppingItems(parsedItems, plannedItems);
  const purchasedItemIds = matches
    .map((match) => match.matchedItemId)
    .filter((id): id is string => Boolean(id));
  const purchasedSet = new Set(purchasedItemIds);
  const missingPlannedItemIds = plannedItems
    .filter((item) => item.id && !purchasedSet.has(item.id))
    .map((item) => item.id!);
  const plannedTotal = plannedItems.reduce((sum, item) => sum + plannedItemTotal(item), 0);
  const actualTotal = parsedItems.reduce((sum, item) => sum + actualParsedTotal(item), 0);

  return {
    matches: matches as ShoppingItemMatchResult[],
    purchasedItemIds,
    missingPlannedItemIds,
    plannedTotal,
    actualTotal,
    variance: actualTotal - plannedTotal,
  };
}
