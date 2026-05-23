import type { ShoppingListItem } from '@/lib/repo/shopping';
import { normalizeShoppingItemName } from './normalizeShoppingItemName';
import type { ParsedShoppingItem, ShoppingItemMatchResult } from './shoppingImportTypes';

export const AUTO_MATCH_THRESHOLD = 0.9;
export const REVIEW_MATCH_THRESHOLD = 0.7;

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function tokenScore(a: string, b: string) {
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  return intersection / Math.max(aTokens.size, bTokens.size);
}

function containmentScore(a: string, b: string) {
  const aTokens = a.split(' ').filter(Boolean);
  const bTokens = b.split(' ').filter(Boolean);
  if (!aTokens.length || !bTokens.length) return 0;
  const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens;
  const longer = new Set(aTokens.length <= bTokens.length ? bTokens : aTokens);
  const contained = shorter.filter((token) => longer.has(token)).length;
  if (contained !== shorter.length) return 0;
  return shorter.length === longer.size ? 1 : 0.86;
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.88;
  const distance = levenshtein(a, b);
  const editScore = 1 - distance / Math.max(a.length, b.length);
  return Math.max(editScore, tokenScore(a, b), containmentScore(a, b));
}

function labelForConfidence(confidence: number) {
  if (confidence >= AUTO_MATCH_THRESHOLD) return 'auto' as const;
  if (confidence >= REVIEW_MATCH_THRESHOLD) return 'review' as const;
  return 'none' as const;
}

function lowerName(input?: string) {
  return String(input || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function exactCandidateNames(parsedItem: ParsedShoppingItem) {
  if (parsedItem.rawText.includes(',')) {
    return [lowerName(parsedItem.rawText.split(',')[0])].filter(Boolean);
  }
  return [lowerName(parsedItem.name)].filter(Boolean);
}

export function matchShoppingItemExactName(parsedItem: ParsedShoppingItem, existingItems: ShoppingListItem[]): ShoppingItemMatchResult {
  const parsedNames = exactCandidateNames(parsedItem);
  const matchedItem = existingItems.find((item) => parsedNames.includes(lowerName(item.name)));

  if (!matchedItem) {
    return {
      parsedItem,
      confidence: 0,
      confidenceLabel: 'none',
      reason: 'No exact lowercase name match',
    };
  }

  return {
    parsedItem,
    matchedItem,
    matchedItemId: matchedItem.id,
    confidence: 1,
    confidenceLabel: 'auto',
    reason: 'Exact lowercase name match',
  };
}

export function matchShoppingItemsExactName(parsedItems: ParsedShoppingItem[], existingItems: ShoppingListItem[]) {
  return parsedItems.map((item) => matchShoppingItemExactName(item, existingItems));
}

export function matchShoppingItem(parsedItem: ParsedShoppingItem, existingItems: ShoppingListItem[]): ShoppingItemMatchResult {
  let best: ShoppingItemMatchResult | undefined;

  existingItems.forEach((item) => {
    const itemName = normalizeShoppingItemName(item.name);
    const confidence = similarity(parsedItem.normalizedName, itemName);
    const reason = confidence === 1 ? 'Exact or alias match' : confidence >= REVIEW_MATCH_THRESHOLD ? 'Fuzzy name match' : 'No reliable match';
    if (!best || confidence > best.confidence) {
      best = {
        parsedItem,
        matchedItem: item,
        matchedItemId: item.id,
        confidence,
        confidenceLabel: labelForConfidence(confidence),
        reason,
      };
    }
  });

  const bestConfidence = best ? best.confidence : 0;
  if (!best || bestConfidence < REVIEW_MATCH_THRESHOLD) {
    return {
      parsedItem,
      confidence: bestConfidence,
      confidenceLabel: 'none',
      reason: 'No reliable match',
    };
  }

  return best;
}

export function matchShoppingItems(parsedItems: ParsedShoppingItem[], existingItems: ShoppingListItem[]) {
  return parsedItems.map((item) => matchShoppingItem(item, existingItems));
}
