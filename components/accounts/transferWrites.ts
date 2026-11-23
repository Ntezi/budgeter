// BUDG-8 S8: the writes of accounts.tsx saveTransfers(), moved unchanged (same calls, same order, same
// fields) so the Accounts screen and the Add sheet share them. Validation messages live in the caller.
import { setAccountPeriodCurrentManual } from '@/lib/repo/accountPeriodOverrides';
import { addTransferTransaction } from '@/lib/repo/transactions';

type Vm = { accountId: string; accountName: string; cash: { current: number } };

export async function moveMoney(input: {
  uid: string;
  periodId: string;
  source: Vm;
  rows: { accountId: string; parsedAmount: number }[];
  destinationById: (id: string) => Vm | null | undefined;
  updatedBy: string;
}) {
  const { uid, periodId: selectedPid, source: transferSourceVm, rows: selectedRows, updatedBy } = input;
  const total = selectedRows.reduce((sum, row) => sum + row.parsedAmount, 0);
  await Promise.all(
    selectedRows.map((row) =>
      addTransferTransaction(uid, selectedPid, {
        fromAccountId: transferSourceVm.accountId,
        toAccountId: row.accountId,
        amount: row.parsedAmount,
        note: `Account transfer from ${transferSourceVm.accountName}`,
      })
    )
  );
  await setAccountPeriodCurrentManual(uid, {
    accountId: transferSourceVm.accountId,
    periodId: selectedPid,
    currentManual: transferSourceVm.cash.current - total,
    updatedBy,
  });
  await Promise.all(
    selectedRows.map((row) => {
      const destinationVm = input.destinationById(row.accountId);
      if (!destinationVm) return Promise.resolve();
      return setAccountPeriodCurrentManual(uid, {
        accountId: row.accountId,
        periodId: selectedPid,
        currentManual: destinationVm.cash.current + row.parsedAmount,
        updatedBy,
      });
    })
  );
}

/** The date addTransferTransaction writes when none is passed (UTC day), shown before Save. */
export function transferDate() {
  return new Date().toISOString().slice(0, 10);
}
