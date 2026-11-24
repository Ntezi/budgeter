// BUDG-40 F-7: the pure part of Move money's writes (no Firebase import, so unit tests can load it).
import { localDateISO } from '../../lib/rules/postingMonth';

type Source = { accountId: string; accountName: string };

/** BUDG-40 F-7: the local day (not the UTC day) shown before Save and written on every transfer. */
export function transferDate(now: Date = new Date()) {
  return localDateISO(now);
}

/** The transfer documents' inputs; the date is passed in so the repo's UTC default is never used. */
export function transferRequests(input: { formKey: string; source: Source; rows: { accountId: string; parsedAmount: number }[]; now?: Date }) {
  const date = transferDate(input.now);
  return input.rows.map((row, index) => ({
    id: `${input.formKey}${String(index).padStart(2, '0')}`,
    input: {
      fromAccountId: input.source.accountId,
      toAccountId: row.accountId,
      amount: row.parsedAmount,
      note: `Account transfer from ${input.source.accountName}`,
      date,
    },
  }));
}
