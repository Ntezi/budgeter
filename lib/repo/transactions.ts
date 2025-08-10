import {addDoc, collection, serverTimestamp} from 'firebase/firestore';
import {db} from '../firebase';
import type {Group} from './periods';

export async function addTransaction(
    userId: string,
    periodId: string,
    tx: { amount: number; group: Group; categoryId?: string; note?: string; date?: string; fixed?: boolean }
) {
    return addDoc(collection(db, 'users', userId, 'periods', periodId, 'transactions'), {
        ...tx,
        date: tx.date ?? new Date().toISOString(),
        createdAt: serverTimestamp(),
    });
}
