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

## Default funding accounts (BUDG-3)

Draft, branch `atelier/BUDG-3-default-accounts`. No migration: old lines and sources simply lack the fields.

- `users/{owner}/expenses/{id}` and `users/{owner}/recurring/{id}` gain `defaultAccountId?: string` (an `accounts/{id}` doc id) and `defaultAccountUpdatedAt?: timestamp`. Links are Firestore doc ids under the workspace owner, never display names, so renaming a category or account keeps the link.
- `periods/{pid}/planItems/{id}` gains `sourceType?: 'EXPENSE_ITEM' | 'RECURRING' | 'YEAR_ITEM'`, `sourceId?`, `accountChoice?: 'DEFAULT' | 'EXPLICIT' | 'REPAIR'`, `repairReason?`, `suggestedAccountId?`.
- Deterministic ids: a line added from an expense item is `exp_{expenseItemId}` (one per month; the month is in the path); template lines keep `recbudget_plan_{templateId}_{pid}`. Ids are built from server ids only (`[A-Za-z0-9_-]`).
- Eligible account: exists, not archived, `currencyCode` absent or equal to the app currency. Otherwise the UI asks the user to choose (repair); it never switches silently.
- Money: applying an account to a line (Add with the pre-filled account, a change on a line, or Review → Apply all) writes the same `allocations/item_plan_{lineId}` the existing account selector writes; this earmarks the line amount in the account's computed balance, as before. Changing a source's default writes the source doc only. Template seeding writes `suggestedAccountId` and no allocation. No code path here creates a transaction or touches another month.
- Locks: every line write runs in `runTransaction` that reads the period and requires `DRAFT`, so a concurrent `DECIDED` aborts it. **This is a client-transaction guarantee, not a rule guarantee (SEC-14):** `firestore.rules` grants every workspace member read/write on `users/{owner}/**`, and Firestore ORs matching allows, so no narrower `match` can restrict these fields while that wildcard exists. Residual risk R-1, for Marius.
