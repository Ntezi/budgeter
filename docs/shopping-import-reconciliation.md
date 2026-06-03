# Smart Shopping Import and Reconciliation

Budgeter supports two shopping-list automation flows:

- **Import from WhatsApp**: paste planned shopping text and preview how it will update the active list.
- **Reconcile Purchases**: paste bought items with actual prices, apply matches, and then close the shopping list.

## Parsing

`lib/shopping/import/parseShoppingText.ts` parses one item per line. It supports bare names, quantity suffixes, total prices, and unit-price formulas:

- `Rice`
- `Rice 5kg`
- `Tomatoes 5000`
- `Cooking oil 3L 12000`
- `Bread x2`
- `Bread x2 @ 1000 = 2000`

The parser returns `ParsedShoppingItem` rows with original line text, line number, normalized item name, quantity/unit when available, unit price, and total price.

## Name Normalization and Aliases

`normalizeShoppingItemName.ts` lowercases names, strips accents and punctuation, collapses whitespace, and maps multilingual aliases to a canonical item name.

Current aliases include:

- `inyanya`, `tomate`, `tomatoes` -> `tomatoes`
- `umuceri`, `rice` -> `rice`
- `isukari`, `sucre`, `sugar` -> `sugar`
- `amata`, `lait`, `milk` -> `milk`

## Matching

`matchShoppingItems.ts` compares parsed rows with existing shopping-list items using:

- exact normalized match
- alias match through canonical names
- token overlap
- Levenshtein similarity for fuzzy matching

Confidence thresholds:

- `>= 0.90`: auto-match and update the existing item
- `0.70 - 0.89`: review required in the UI
- `< 0.70`: add as a new item

## Reconciliation and Closing

`reconcilePurchasedItems.ts` matches purchased rows against planned rows and calculates:

- planned total
- actual total
- variance
- purchased planned item IDs
- planned items missing from the purchase import

Applying a purchase import updates matched items with `actualPrice`, `actualQuantity`, `status = "purchased"`, and bought/completed flags. Unmatched purchased items are added with `isUnplanned = true` and `source = "purchase_import"`. Purchase imports also update the shopping catalog item's `lastPrice` and append a `priceHistory` record, so future lists use the latest reconciled unit price as their estimate while older prices remain available for reporting.

Closing a shopping list sets missing planned items to `status = "not_purchased"` and writes final totals to the list:

- `plannedTotal`
- `actualTotal`
- `variance`
- `status = "closed"`
- `closedAt`
- `closedBy`

## Audit History

Applied imports are stored under:

`users/{uid}/shoppingLists/{listId}/importBatches/{batchId}`

Each batch stores raw text, parsed rows, match decisions, source, mode, and summary counts.
