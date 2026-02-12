# API Contract (Repo Layer)

This contract covers repository modules under `lib/repo/*`.

Conventions:

- Watchers return unsubscribe functions from Firestore `onSnapshot`.
- Write methods throw on Firestore errors.
- Period mutability policy:
  - `transactions`, `incomeItems`, `planItems`, recurring generation: blocked when period is `DECIDED`.
  - `allocations`: always editable.

## `lib/repo/periods.ts`

- `periodIdFromDate(d?: Date): string`
- `nextMonthMeta(d?: Date): { id: string; title: string }`
- `periodTitleFromId(periodId: string): string`
- `getOrCreatePeriod(userId: string, periodId: string): Promise<DocumentReference>`
- `createPeriod(userId: string, periodId: string, title: string): Promise<DocumentReference>`
- `watchPeriods(userId: string, cb: (rows: (PeriodDoc & {id: string})[]) => void): Unsubscribe`
- `watchPeriod(userId: string, periodId: string, cb: (p: PeriodDoc) => void): Unsubscribe`
- `setPeriodTitle(userId: string, periodId: string, title: string): Promise<void>`
- `setPeriodStatus(userId: string, periodId: string, status: PeriodStatus): Promise<void>`
- `setIncome(userId: string, periodId: string, incomeTotal: number): Promise<void>`
- `setTargetPct(userId: string, periodId: string, targetPct: ...): Promise<void>`
- `watchTransactionsTotals(userId: string, periodId: string, cb: (totals) => void): Unsubscribe`
- `assertPeriodEditable(userId: string, periodId: string): Promise<void>`
  - Throws if `status === 'DECIDED'`.
- `deletePeriod(userId: string, periodId: string): Promise<void>`
  - Deletes known subcollections (`transactions`, `incomeItems`, `planItems`, `allocations`, `walletAccounts`) before period doc.

## `lib/repo/transactions.ts`

- `watchTransactions(userId, pid, cb): Unsubscribe`
- `addTransaction(userId, pid, tx): Promise<DocumentReference>`
  - Side effect: adds `createdAt`; defaults `date` to today.
  - Throws if period is `DECIDED`.
- `setTransaction(userId, pid, id, patch): Promise<void>`
  - Throws if period is `DECIDED`.
- `delTransaction(userId, pid, id): Promise<void>`
  - Throws if period is `DECIDED`.
- `putTransactionWithId(userId, pid, id, tx): Promise<void>`
  - Idempotent deterministic upsert (`setDoc(..., {merge:true})`).

## `lib/repo/income.ts`

- `watchIncomeItems(userId, periodId, cb(items,total)): Unsubscribe`
- `addIncomeItem(userId, periodId, item): Promise<DocumentReference>`
- `updateIncomeItem(userId, periodId, id, patch): Promise<void>`
- `deleteIncomeItem(userId, periodId, id): Promise<void>`
- `putIncomeWithId(userId, periodId, id, item): Promise<void>`
  - Deterministic upsert for recurring income generation.
- Write operations throw if period is `DECIDED`.

## `lib/repo/plans.ts`

- `watchPlanTotals(userId, periodId, cb(totals,items)): Unsubscribe`
- `addPlanItem(userId, periodId, item): Promise<DocumentReference>`
- `updatePlanItem(userId, periodId, id, patch): Promise<void>`
- `deletePlanItem(userId, periodId, id): Promise<void>`
- Write operations throw if period is `DECIDED`.

## `lib/repo/recurring.ts`

- `watchRecurring(uid, cb): Unsubscribe`
- `addRecurring(uid, row): Promise<DocumentReference>`
- `updateRecurring(uid, id, patch): Promise<void>`
- `deleteRecurring(uid, id): Promise<void>`
- `listRecurring(uid): Promise<Recurring[]>`
- `generateForPeriod(uid, pid, rows): Promise<{expenseWritten:number; incomeWritten:number}>`
  - Throws if period is `DECIDED`.
  - Idempotency via deterministic IDs:
    - expense tx IDs: `rec_{templateId}_{pid}_{day}`
    - income IDs: `recinc_{templateId}_{pid}_{day}`
- `autoPopulateForNewPeriod(uid, pid): Promise<{expenseWritten:number; incomeWritten:number}>`
  - Convenience wrapper around `listRecurring + generateForPeriod`.
- `seedBudgetFromRecurring(uid, pid, rows): Promise<{planWritten:number; incomeWritten:number}>`
  - Idempotent deterministic upserts into budget editor sections:
    - plan IDs: `recbudget_plan_{templateId}_{pid}`
    - income IDs: `recbudget_income_{templateId}_{pid}`
- `seedBudgetForNewPeriod(uid, pid): Promise<{planWritten:number; incomeWritten:number}>`
  - Convenience wrapper around `listRecurring + seedBudgetFromRecurring`.

## `lib/repo/accounts.ts`

- `watchAccounts(uid, cb, opts?): Unsubscribe`
  - `opts.includeArchived?: boolean`
- `addAccount(uid, input): Promise<DocumentReference>`
- `updateAccount(uid, id, patch): Promise<void>`
- `archiveAccount(uid, id, archived?): Promise<void>`
- `deleteAccount(uid, id): Promise<void>`

## `lib/repo/allocations.ts`

- Types:
  - `Allocation`
  - `AllocationDefault`
  - `AllocationSourceType`
  - `AllocationTotals`
  - `PeriodWalletAccount`
- Helpers:
  - `emptyAllocationTotals()`
  - `toAllocationTotals(rows)`
  - `allocationDocIdForSource(sourceType, sourceItemId)`
- Period allocations:
  - `watchAllocations(uid, pid, cb(rows, totals)): Unsubscribe`
  - `addAllocation(uid, pid, input): Promise<DocumentReference>`
  - `updateAllocation(uid, pid, id, patch): Promise<void>`
  - `deleteAllocation(uid, pid, id): Promise<void>`
  - `upsertAllocationForBudgetItem(uid, pid, input): Promise<void>`
    - deterministic id: `item_{sourceType.toLowerCase()}_{sourceItemId}`
    - used for item-level account mapping in budget screen.
- Period wallet accounts:
  - `watchPeriodWalletAccounts(uid, pid, cb(accountIds)): Unsubscribe`
  - `addPeriodWalletAccount(uid, pid, accountId): Promise<void>`
  - `removePeriodWalletAccount(uid, pid, accountId): Promise<void>`
- Defaults:
  - `watchAllocationDefaults(uid, cb): Unsubscribe`
  - `addAllocationDefault(uid, input): Promise<DocumentReference>`
  - `updateAllocationDefault(uid, id, patch): Promise<void>`
  - `deleteAllocationDefault(uid, id): Promise<void>`
  - `listAllocationDefaults(uid): Promise<AllocationDefault[]>`
  - `applyAllocationDefaultsForPeriod(uid, pid, rows?): Promise<number>`
    - Idempotent upsert IDs: `default_{defaultId}`
- Aggregation:
  - `listAllAllocations(uid): Promise<(Allocation & {periodId:string})[]>`

## `lib/repo/settings.ts`

- `watchReminderSettings(uid, cb): Unsubscribe`
- `setReminderSettings(uid, settings): Promise<void>`
- `setDailyBalanceReminder(uid, enabled, email?): Promise<void>`
  - Note: this uses `updateDoc`; ensure document exists or prefer `setReminderSettings`.

## Error Cases

Common throw cases:

1. Permission denied from Firestore rules.
2. Missing docs (`updateDoc` on non-existent document).
3. Mutability violation (`assertPeriodEditable` on `DECIDED`).
4. Network/offline transient errors from Firestore SDK.
