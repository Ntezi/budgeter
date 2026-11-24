// BUDG-6 H-2: money writes from the everyday Add expense and Move money forms, made idempotent and lock-safe.
// The form makes its ids once (client-generated, same format as addDoc's), and the write runs in one
// transaction that re-reads the month (not DECIDED) and that no id exists yet. Stored documents are exactly
// what addDoc/setDoc wrote before (C-10): only the moment the id is chosen and the transaction are new.
// Takes the Firestore instance so emulator tests call the app's own function. No Firebase app import.
import { collection, doc, runTransaction, type DocumentReference, type Firestore } from 'firebase/firestore';

export type ExtraWrite = { ref: DocumentReference; data: Record<string, unknown>; merge?: boolean };

/** A Firestore auto id (20 characters) made on the client without a network call. */
export function newClientIdIn(db: Firestore): string {
  return doc(collection(db, '_ids')).id;
}

/**
 * Writes every transaction in `txWrites` (ids chosen by the form) plus `extra` documents, or nothing:
 * returns false when any of the ids already exists (a retry, a second tab), throws when the month is
 * DECIDED. A month without a period document behaves as before (assertPeriodEditable allowed it).
 */
export async function writeOnceInMonthIn(
  db: Firestore,
  userId: string,
  periodDocId: string,
  txWrites: { id: string; data: Record<string, unknown> }[],
  extra: ExtraWrite[] = [],
  isActive: (row: Record<string, unknown>) => boolean = () => true
): Promise<boolean> {
  if (!txWrites.length) throw new Error('Nothing to save.');
  if (txWrites.some((w) => !/^[A-Za-z0-9_-]{1,64}$/.test(w.id))) throw new Error('Invalid transaction id.');
  const periodRef = doc(db, 'users', userId, 'periods', periodDocId);
  const refs = txWrites.map((w) => doc(db, 'users', userId, 'periods', periodDocId, 'transactions', w.id));
  return runTransaction(db, async (t) => {
    const ps = await t.get(periodRef);
    const existing = [];
    for (const ref of refs) existing.push(await t.get(ref));
    const row = (ps.data() || {}) as Record<string, unknown>;
    if (ps.exists() && isActive(row) && row.status === 'DECIDED') {
      throw new Error('This budget is DECIDED and locked for plan/income/transaction edits.');
    }
    if (existing.some((s) => s.exists())) return false;
    refs.forEach((ref, i) => t.set(ref, txWrites[i].data));
    extra.forEach((w) => (w.merge ? t.set(w.ref, w.data, { merge: true }) : t.set(w.ref, w.data)));
    return true;
  });
}
