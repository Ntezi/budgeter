// Record expense from a shopping list (BUDG-4 AC-7, SEC-20, SEC-22).
// Takes the Firestore instance so emulator tests can call it. One transaction per item:
// period must exist and be DRAFT; tx id is deterministic so a retry never duplicates.
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { isDateISO, postingPeriodId } from '../rules/postingMonth';

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;

export function shoppingTxId(listId: string, itemId: string) {
  if (!SAFE_ID.test(listId) || !SAFE_ID.test(itemId)) throw new Error('Invalid shopping list or item id.');
  return `shop_${listId}_${itemId}`;
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
};

export type ShoppingExpenseResult = { created: boolean; periodId: string; txId: string };

export async function recordShoppingExpense(db: Firestore, ownerUid: string, input: ShoppingExpenseInput): Promise<ShoppingExpenseResult> {
  if (!isDateISO(input.dateISO)) throw new Error('Choose a valid date.');
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) throw new Error('Amount must be more than zero.');
  if (!input.accountId) throw new Error('Choose the account that paid.');
  const periodId = postingPeriodId(input.dateISO);
  const txId = shoppingTxId(input.listId, input.itemId);
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
