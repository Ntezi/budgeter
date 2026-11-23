// BUDG-5 receipt writes. Take the Firestore instance so emulator tests run the same code.
// AC-2 / SEC-20: fixed ids (receipt UUID from the form, rcpt_{receiptId}, {periodId}_{txId})
// inside runTransaction, so a retry or double submit is a no-op. AC-3: drafts never post.
// A posted transaction is never modified; a receipt delete never touches a transaction (SEC-18).
import {
  collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where, writeBatch, type Firestore, type Transaction,
} from 'firebase/firestore';
import { fromMinor } from '../money';
import {
  buildObservations, cleanReceipt, expenseMinorOf, observationId, receiptLinkId, receiptPeriodId, receiptTxId,
  type Receipt, type ReceiptLink,
} from './receiptsCore';
import type { PriceObservation } from '../rules/priceCompare';

const receiptRef = (db: Firestore, owner: string, id: string) => doc(db, 'users', owner, 'receipts', id);
const linkRef = (db: Firestore, owner: string, id: string) => doc(db, 'users', owner, 'receiptLinks', id);
const obsRef = (db: Firestore, owner: string, id: string) => doc(db, 'users', owner, 'priceObservations', id);

function receiptDoc(r: Receipt, existingCreatedAt: unknown) {
  const out: Record<string, unknown> = { ...r, updatedAt: serverTimestamp(), createdAt: existingCreatedAt ?? serverTimestamp() };
  delete out.id;
  return out;
}

/** Saves the review step as a DRAFT. Never touches a CONFIRMED receipt; never writes money. */
export async function saveReceiptDraft(db: Firestore, owner: string, input: Receipt) {
  const r = cleanReceipt({ ...input, status: 'DRAFT' });
  return runTransaction(db, async (t) => {
    const snap = await t.get(receiptRef(db, owner, r.id));
    if (snap.exists() && snap.data()?.status === 'CONFIRMED') return false;
    t.set(receiptRef(db, owner, r.id), receiptDoc(r, snap.exists() ? snap.data()?.createdAt : undefined));
    return true;
  });
}

export type ConfirmResult = { created: boolean; link: ReceiptLink };

function writeConfirmed(t: Transaction, db: Firestore, owner: string, r: Receipt, link: ReceiptLink, createdAt: unknown) {
  const confirmed: Receipt = { ...r, status: 'CONFIRMED', link };
  t.set(receiptRef(db, owner, r.id), receiptDoc(confirmed, createdAt));
  t.set(linkRef(db, owner, receiptLinkId(link.periodId, link.txId)), {
    receiptId: r.id, periodId: link.periodId, txId: link.txId, createdAt: serverTimestamp(),
  });
  for (const o of buildObservations(confirmed)) {
    const { id, ...data } = o;
    t.set(obsRef(db, owner, id), { ...data, createdAt: serverTimestamp() });
  }
}

/** Links a receipt to an existing posted expense. The expense itself is not modified. */
export async function confirmReceiptToExisting(
  db: Firestore, owner: string, input: Receipt, target: { periodId: string; txId: string }
): Promise<ConfirmResult> {
  const r = cleanReceipt(input);
  const link: ReceiptLink = { periodId: target.periodId, txId: target.txId, mode: 'EXISTING' };
  const lid = receiptLinkId(link.periodId, link.txId);
  const created = await runTransaction(db, async (t) => {
    const [rs, ls, ts] = [
      await t.get(receiptRef(db, owner, r.id)),
      await t.get(linkRef(db, owner, lid)),
      await t.get(doc(db, 'users', owner, 'periods', link.periodId, 'transactions', link.txId)),
    ];
    if (rs.exists() && rs.data()?.status === 'CONFIRMED') {
      const l = rs.data()?.link;
      if (l?.periodId === link.periodId && l?.txId === link.txId) return false;
      throw new Error('This receipt is already linked to another expense.');
    }
    if (ls.exists()) {
      if (ls.data()?.receiptId === r.id) return false;
      throw new Error('That expense already has a receipt.');
    }
    if (!ts.exists()) throw new Error('That expense no longer exists.');
    writeConfirmed(t, db, owner, r, link, rs.exists() ? rs.data()?.createdAt : undefined);
    return true;
  });
  return { created, link };
}

/**
 * Records ONE new expense for the receipt (explicit Save showing date, account, amount)
 * in the posting month of the purchase date, and links it. Period must exist and be DRAFT.
 */
export async function confirmReceiptAsNewExpense(
  db: Firestore,
  owner: string,
  input: Receipt,
  expense: { accountId: string; planItemId?: string; planItemName?: string; group?: string }
): Promise<ConfirmResult> {
  const r = cleanReceipt(input);
  if (!expense.accountId) throw new Error('Choose the account that paid.');
  const amount = fromMinor(expenseMinorOf(r));
  const periodId = receiptPeriodId(r);
  const txId = receiptTxId(r.id);
  const link: ReceiptLink = { periodId, txId, mode: 'NEW' };
  const periodRef = doc(db, 'users', owner, 'periods', periodId);
  const txRef = doc(db, 'users', owner, 'periods', periodId, 'transactions', txId);
  const created = await runTransaction(db, async (t) => {
    const ps = await t.get(periodRef);
    const ts = await t.get(txRef);
    const rs = await t.get(receiptRef(db, owner, r.id));
    if (ts.exists()) return false; // same transaction wrote receipt + link: retry is a no-op
    if (rs.exists() && rs.data()?.status === 'CONFIRMED') throw new Error('This receipt is already linked to an expense.');
    if (!ps.exists()) throw new Error(`No budget for ${periodId}. Create that month first.`);
    if (ps.data()?.status === 'DECIDED') throw new Error(`${periodId} is locked. Nothing was recorded.`);
    const name = r.storeName ? `Receipt: ${r.storeName}` : 'Receipt';
    t.set(txRef, {
      type: 'EXPENSE',
      name: expense.planItemName || name,
      amount,
      group: expense.group || 'NEED',
      date: r.purchaseDate,
      note: `${name} · ${r.lines.length} item${r.lines.length === 1 ? '' : 's'}`,
      planItemId: expense.planItemId || '',
      categoryId: expense.planItemId || '',
      accountId: expense.accountId,
      paidFromAccountId: expense.accountId,
      receiptId: r.id,
      periodId,
      createdAt: serverTimestamp(),
    });
    writeConfirmed(t, db, owner, r, link, rs.exists() ? rs.data()?.createdAt : undefined);
    return true;
  });
  return { created, link };
}

/** SEC-18: one batch removes the receipt, its link and its price observations. No transaction is touched. */
export async function deleteReceiptIn(db: Firestore, owner: string, receiptId: string) {
  const rs = await getDocs(query(collection(db, 'users', owner, 'priceObservations'), where('receiptId', '==', receiptId)));
  const snap = await getDoc(receiptRef(db, owner, receiptId));
  const batch = writeBatch(db);
  const ids = new Set(rs.docs.map((d) => d.id));
  if (snap.exists()) {
    const data = snap.data() as Receipt;
    for (const l of data.lines || []) ids.add(observationId(receiptId, l.lineId));
    if (data.link) batch.delete(linkRef(db, owner, receiptLinkId(data.link.periodId, data.link.txId)));
  }
  ids.forEach((id) => batch.delete(obsRef(db, owner, id)));
  batch.delete(receiptRef(db, owner, receiptId));
  await batch.commit();
}

export async function listPriceObservationsIn(db: Firestore, owner: string, catalogItemId?: string): Promise<PriceObservation[]> {
  const col = collection(db, 'users', owner, 'priceObservations');
  const snap = await getDocs(catalogItemId ? query(col, where('catalogItemId', '==', catalogItemId)) : col);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PriceObservation, 'id'>) }));
}

export async function listReceiptsIn(db: Firestore, owner: string): Promise<Receipt[]> {
  const snap = await getDocs(collection(db, 'users', owner, 'receipts'));
  return snap.docs
    .map((d) => ({ ...(d.data() as Receipt), id: d.id }))
    .sort((a, b) => String(b.purchaseDate).localeCompare(String(a.purchaseDate)));
}
