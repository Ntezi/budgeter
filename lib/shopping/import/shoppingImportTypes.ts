import type { ShoppingListItem } from '@/lib/repo/shopping';

export type ShoppingImportSource = 'whatsapp_paste' | 'purchase_import';

export type ShoppingImportMode = 'planned' | 'purchase';

export type MatchConfidence = 'auto' | 'review' | 'none';

export type ParsedShoppingItem = {
  id: string;
  rawText: string;
  lineNumber: number;
  name: string;
  normalizedName: string;
  quantity?: number;
  quantityText?: string;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
};

export type ShoppingItemMatchResult = {
  parsedItem: ParsedShoppingItem;
  matchedItem?: ShoppingListItem;
  matchedItemId?: string;
  confidence: number;
  confidenceLabel: MatchConfidence;
  reason: string;
};

export type ShoppingImportBatch = {
  id?: string;
  listId: string;
  mode: ShoppingImportMode;
  source: ShoppingImportSource;
  rawText: string;
  parsedItems: ParsedShoppingItem[];
  matches: ShoppingItemMatchResult[];
  createdBy: string;
  createdAt?: unknown;
  appliedAt?: unknown;
  summary: {
    parsedCount: number;
    autoMatchCount: number;
    reviewCount: number;
    newItemCount: number;
  };
};

export type PurchaseReconciliationResult = {
  matches: ShoppingItemMatchResult[];
  purchasedItemIds: string[];
  missingPlannedItemIds: string[];
  plannedTotal: number;
  actualTotal: number;
  variance: number;
};

export type CloseShoppingOptions = {
  closedBy: string;
  createExpenseTransaction?: boolean;
  transactionPlanItemId?: string;
  paidFromAccountId?: string;
};
