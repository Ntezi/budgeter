// BUDG-8 S8: the writes of accounts.tsx saveTransfers(), moved unchanged (same calls, same order, same
// fields) so the Accounts screen and the Add sheet share them. Validation messages live in the caller.
import { currentManualWrite } from '@/lib/repo/accountPeriodOverrides';
import { addTransfersOnce } from '@/lib/repo/transactions';

type Vm = { accountId: string; accountName: string; cash: { current: number } };

export async function moveMoney(input: {
  uid: string;
  periodId: string;
  source: Vm;
  rows: { accountId: string; parsedAmount: number }[];
  destinationById: (id: string) => Vm | null | undefined;
  updatedBy: string;
  /** H-2: made once per open form; transfer ids are formKey + row index, so a retry or second tab writes once. */
  formKey: string;
}) {
  const { uid, periodId: selectedPid, source: transferSourceVm, rows: selectedRows, updatedBy } = input;
  const total = selectedRows.reduce((sum, row) => sum + row.parsedAmount, 0);
  // Same documents and the same balance overrides (from the figures the screen showed) as before; now in one
  // transaction that checks the month is not DECIDED and that this form's transfers do not exist yet.
  const transfers = selectedRows.map((row, index) => ({
    id: `${input.formKey}${String(index).padStart(2, '0')}`,
    input: {
      fromAccountId: transferSourceVm.accountId,
      toAccountId: row.accountId,
      amount: row.parsedAmount,
      note: `Account transfer from ${transferSourceVm.accountName}`,
    },
  }));
  const overrides = [
    currentManualWrite(uid, { accountId: transferSourceVm.accountId, periodId: selectedPid, currentManual: transferSourceVm.cash.current - total, updatedBy }),
    ...selectedRows.flatMap((row) => {
      const destinationVm = input.destinationById(row.accountId);
      if (!destinationVm) return [];
      return [currentManualWrite(uid, { accountId: row.accountId, periodId: selectedPid, currentManual: destinationVm.cash.current + row.parsedAmount, updatedBy })];
    }),
  ];
  return addTransfersOnce(uid, selectedPid, transfers, overrides);
}

/** The date addTransferTransaction writes when none is passed (UTC day), shown before Save. */
export function transferDate() {
  return new Date().toISOString().slice(0, 10);
}
