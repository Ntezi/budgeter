# Firestore Schema

This document describes collections used by the app and invariants expected by repository modules.

## Root

## `users/{uid}`

- Owner-scoped user space (all app data lives under this node).

### `users/{uid}/periods/{pid}`

- `pid`: `YYYY-MM` (e.g. `2026-02`)
- Fields:
  - `title?: string`
  - `status?: 'DRAFT' | 'DECIDED'`
  - `incomeTotal: number`
  - `targetPct: { needs: number; wants: number; sd: number }`
  - `manualTargets?: { needs: number; wants: number; sd: number }`
  - `createdAt?: Timestamp`
- Invariants:
  - Missing period is created with `DRAFT` + default target pct `0.5/0.3/0.2`.
  - `DECIDED` periods are locked for plan/income/transaction edits.

### `users/{uid}/periods/{pid}/incomeItems/{incomeId}`

- Fields:
  - `name: string`
  - `amount: number`
  - `createdAt?: Timestamp`

### `users/{uid}/periods/{pid}/planItems/{planId}`

- Fields:
  - `name: string`
  - `amount: number`
  - `group: 'NEED' | 'WANT' | 'SAVINGS_DEBT'`
  - `plannedAccountId?: string`
  - `rolloverMode?: 'NONE' | 'CARRY_LEFTOVER' | 'CARRY_OVERSPEND' | 'CARRY_BOTH' | 'CAPPED'`
  - `rolloverCapAmount?: number`
  - `createdAt?: Timestamp`

### `users/{uid}/periods/{pid}/transactions/{txId}`

- Fields:
  - `name?: string`
  - `amount: number`
  - `group: 'NEED' | 'WANT' | 'SAVINGS_DEBT'`
  - `type?: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'ADJUSTMENT' | 'REFUND'` (default `EXPENSE`)
  - `paidFromAccountId?: string`
  - `toAccountId?: string` (`TRANSFER`)
  - `transferGroupId?: string`
  - `planItemId?: string`
  - `originalTransactionId?: string` (`REFUND`)
  - `date?: string` (`YYYY-MM-DD`)
  - `accountId?: string` (legacy alias of `paidFromAccountId`)
  - `categoryId?: string`
  - `note?: string`
  - `fromTemplateId?: string`
  - `createdAt?: Timestamp`
- Invariants:
  - Recurring-generated IDs are deterministic: `rec_{templateId}_{pid}_{day}`.
  - Writes blocked when period is `DECIDED`.

### `users/{uid}/periods/{pid}/allocations/{allocationId}`

- Fields:
  - `accountId: string`
  - `amount: number`
  - `tag: 'NEEDS' | 'WANTS' | 'SAVINGS'`
  - `note?: string`
  - `sourceType?: 'PLAN' | 'INCOME'`
  - `sourceItemId?: string`
  - `sourceItemName?: string`
  - `createdAt?: Timestamp`
  - `updatedAt?: Timestamp`
- Invariants:
  - Editable even when period is `DECIDED`.
  - Default-generated IDs are deterministic: `default_{defaultId}`.
  - Budget item allocations are deterministic:
    - `item_plan_{planItemId}`
    - `item_income_{incomeItemId}`

### `users/{uid}/periods/{pid}/walletAccounts/{accountId}`

- Fields:
  - `accountId: string`
  - `createdAt?: Timestamp`
  - `updatedAt?: Timestamp`
- Invariants:
  - Represents accounts selected for a specific period wallet.
  - Doc id equals `accountId`.

### `users/{uid}/recurring/{templateId}`

- Fields:
  - `flow?: 'EXPENSE' | 'INCOME'` (default `EXPENSE`)
  - `name: string`
  - `amount: number`
  - `group?: 'NEED' | 'WANT' | 'SAVINGS_DEBT'` (expense flow)
  - `dayOfMonth: number`
  - `active?: boolean`
  - `start?: string` (`YYYY-MM`)
  - `end?: string` (`YYYY-MM`)
  - `note?: string`
  - `createdAt?: Timestamp`
- Invariants:
  - Generation is idempotent via deterministic IDs:
    - expense tx: `rec_{templateId}_{pid}_{day}`
    - income item: `recinc_{templateId}_{pid}_{day}`
  - Generation blocked if period is `DECIDED`.

### `users/{uid}/accounts/{accountId}`

- Fields:
  - `name: string`
  - `type?: 'BANK' | 'MOMO' | 'CASH' | 'OTHER'`
  - `currencyCode?: string` (default app currency, currently `GHS`)
  - `openingBalance: number`
  - `archived?: boolean`
  - `createdAt?: Timestamp`
  - `updatedAt?: Timestamp`
- Invariants:
  - Computed balance in UI:
    - `openingBalance + sum(all allocations across periods for accountId)`

### `users/{uid}/allocationDefaults/{defaultId}`

- Fields:
  - `accountId: string`
  - `amount: number` (fixed amount MVP)
  - `tag: 'NEEDS' | 'WANTS' | 'SAVINGS'`
  - `active?: boolean`
  - `createdAt?: Timestamp`
  - `updatedAt?: Timestamp`
- Invariants:
  - Applied into period allocations via deterministic allocation IDs.

### `users/{uid}/settings/reminders`

- Fields:
  - `dailyBalanceReminderEnabled?: boolean`
  - `dailyBalanceReminderEmail?: string`
  - `dailyBalanceReminderHourUtc?: number` (`0-23`)
  - `updatedAt?: Timestamp`

## Security Rules

- Rules file: `firestore.rules`
- Access model: authenticated user can read/write only under their own `users/{uid}` subtree.

## Suggested Indexes

Existing schema currently works with simple `orderBy` queries.

Potential future indexes:

1. `users/{uid}/periods/{pid}/transactions` on `date` (already queried).
2. `users/{uid}/periods/{pid}/allocations` on `createdAt`.
3. `users/{uid}/allocationDefaults` on `createdAt`.
4. `users/{uid}/accounts` on `createdAt`.

## BUDG-5 receipts and price observations (additive, C-10)
New collections only; no existing document changes shape and nothing is migrated.
- `users/{uid}/receipts/{receiptId}`: id is a UUID made when the receipt form opens (retries write the same doc). `status` DRAFT|CONFIRMED, `storeName?` (<= 120), `purchaseDate` YYYY-MM-DD, `currencyCode` (3 letters), `totalMinor` (integer minor units, signed sum of lines; returns subtract), `lines[]` (<= 200: `lineId`, `name` <= 120, `catalogItemId?`, `variant?{packSize,unit,brand}`, `quantity`, `unit` pc|g|kg|ml|l|pack, `lineTotalMinor`, `promo?`, `isReturn?`), `link?{periodId,txId,mode EXISTING|NEW}`, `sourceListId?`, `createdBy`, timestamps. No photo, payer, card, loyalty or address fields (SEC-17).
- `users/{uid}/receiptLinks/{periodId}_{txId}`: `{receiptId, periodId, txId}`; one receipt per expense; written in the same transaction as the CONFIRMED receipt; create-only by client transaction (SEC-14: not a rule guarantee).
- New expense from a receipt: `periods/{periodId}/transactions/rcpt_{receiptId}` in the month of `purchaseDate`, `amount` = `fromMinor(totalMinor)` (existing major-unit field, 2 decimals, ADR-1), plus optional `receiptId`. Linking to an existing expense never modifies it.
- `users/{uid}/priceObservations/{receiptId}_{lineId}`: one per CONFIRMED line with a confirmed `catalogItemId`: `catalogItemId`, `variantKey` (brand, '' if none; pack size is data, not key), `currencyCode`, `observedOn`, `lineTotalMinor`, `baseUnit` g|ml|pc, `baseQty` (integer), `isReturn`, `promo`, `quantity`, `unit`, `packSize`, `storeName?`. Unit prices are never stored; they are compared by cross-multiplication.
- Delete of a receipt removes its receiptLinks doc and its priceObservations in one batch; the expense stays (SEC-18).
- Legacy `shoppingCatalog/{id}/priceHistory` (no currency, no unit) is shown as an estimate and never compared.
