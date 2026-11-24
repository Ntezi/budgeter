// Record expense from a shopping list (BUDG-4 AC-7, SEC-20, SEC-22).
// Takes the Firestore instance so emulator tests can call it. One transaction per item:
// period must exist and be DRAFT; tx id is deterministic so a retry never duplicates.
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { isDateISO, postingPeriodId } from '../rules/postingMonth';
import { fromMinor, MINOR_PER_MAJOR, toMinor } from '../money';

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;

export function shoppingTxId(listId: string, itemId: string) {
  if (!SAFE_ID.test(listId) || !SAFE_ID.test(itemId)) throw new Error('Invalid shopping list or item id.');
  return `shop_${listId}_${itemId}`;
}

/**
 * R-3 (ADR-1): the stored amount is exact to the cent. More than two decimals (12.345, 1.005) is refused,
 * never rounded; float noise from arithmetic (0.1 + 0.2) is not a third decimal.
 */
export function exactShoppingAmount(amount: number): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new Error('Amount is not a number.');
  const minor = toMinor(value);
  if (Math.abs(value * MINOR_PER_MAJOR - minor) > 1e-6) throw new Error('Amount can have at most two decimals.');
  if (!(minor > 0)) throw new Error('Amount must be more than zero.');
  return fromMinor(minor);
}

/**
 * H-3 (BUDG-6): ids of chef-added items are chosen by the chef, so they never name a transaction.
 * A household item keeps its deterministic id (the household's private item id); a chef-added item, or any
 * id outside [A-Za-z0-9_-], gets a household-generated key, made once per open Record expense form and
 * reused on a retry (so a retry still posts once).
 */
export function newRecordKey(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  return (uuid || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, '');
}
export function recordKeyFor(listId: string, item: { id: string; fromChef?: boolean }, keys: Record<string, string>, newKey: () => string = newRecordKey): string | undefined {
  if (!item.fromChef && SAFE_ID.test(listId) && SAFE_ID.test(item.id)) return undefined;
  if (!keys[item.id]) keys[item.id] = newKey();
  return keys[item.id];
}
export function shoppingTxIdFor(listId: string, itemId: string, householdKey?: string) {
  if (householdKey === undefined) return shoppingTxId(listId, itemId);
  if (!SAFE_ID.test(householdKey)) throw new Error('Invalid record key.');
  return `shop_k_${householdKey}`;
}

export type ShoppingExpenseInput = {
  listId: string;
  listName: string;
  itemId: string;
  itemName: string;
  amount: number;
  dateISO: string;
  accountId: string;
  planItemId: string;
  planItemName: string;
  group?: string;
  /** H-3: household-generated key for chef-added items (recordKeyFor). */
  householdKey?: string;
};

export type ShoppingExpenseResult = { created: boolean; periodId: string; txId: string };

export async function recordShoppingExpense(db: Firestore, ownerUid: string, input: ShoppingExpenseInput): Promise<ShoppingExpenseResult> {
  if (!isDateISO(input.dateISO)) throw new Error('Choose a valid date.');
  const amount = exactShoppingAmount(input.amount);
  if (!input.accountId) throw new Error('Choose the account that paid.');
  const periodId = postingPeriodId(input.dateISO);
  const txId = shoppingTxIdFor(input.listId, input.itemId, input.householdKey);
  const periodRef = doc(db, 'users', ownerUid, 'periods', periodId);
  const txRef = doc(db, 'users', ownerUid, 'periods', periodId, 'transactions', txId);
  const created = await runTransaction(db, async (t) => {
    const period = await t.get(periodRef);
    if (!period.exists()) throw new Error(`No budget for ${periodId}. Create that month first.`);
    if (period.data()?.status === 'DECIDED') throw new Error(`${periodId} is locked. Nothing was recorded.`);
    const existing = await t.get(txRef);
    if (existing.exists()) return false;
    t.set(txRef, {
      type: 'EXPENSE',
      name: input.planItemName || input.itemName,
      amount,
      group: input.group || 'NEED',
      date: input.dateISO,
      note: `Shopping: ${input.listName} · Item: ${input.itemName}`,
      planItemId: input.planItemId,
      categoryId: input.planItemId,
      accountId: input.accountId,
      paidFromAccountId: input.accountId,
      shoppingListId: input.listId,
      shoppingListName: input.listName,
      shoppingItemId: input.itemId,
      shoppingItemName: input.itemName,
      periodId,
      createdAt: serverTimestamp(),
    });
    return true;
  });
  return { created, periodId, txId };
}
