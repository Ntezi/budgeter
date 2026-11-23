// BUDG-3 seed additions (lane-owned file, called from seed.mjs with one line).
// Default accounts on reusable categories/templates, linked lines in the
// DECIDED previous month and the DRAFT current month. Synthetic data only.
export function seedDefaultAccounts({ batch, u, ts, prevId, curId }) {
  batch.set(u.collection('expenses').doc('exp-water'), { defaultAccountId: 'acc-household', defaultAccountUpdatedAt: ts }, { merge: true });
  // Default points at the archived account: the app must ask for a repair (AC-4).
  batch.set(u.collection('expenses').doc('exp-phone'), { defaultAccountId: 'acc-old', defaultAccountUpdatedAt: ts }, { merge: true });
  batch.set(u.collection('recurring').doc('rec-internet'), { defaultAccountId: 'acc-household', defaultAccountUpdatedAt: ts }, { merge: true });

  // Locked previous month: a linked line that applied the default (must never change).
  const prev = u.collection('periods').doc(prevId);
  batch.set(prev.collection('planItems').doc('exp_exp-water'), {
    group: 'NEED', name: 'Water bill', amount: 30, plannedAccountId: 'acc-household', accountChoice: 'DEFAULT',
    sourceType: 'EXPENSE_ITEM', sourceId: 'exp-water', suggestedAccountId: 'acc-household', periodId: prevId,
  });
  batch.set(prev.collection('allocations').doc('item_plan_exp_exp-water'), {
    sourceType: 'PLAN', sourceItemId: 'exp_exp-water', sourceItemName: 'Water bill', accountId: 'acc-household',
    amount: 30, tag: 'NEEDS', note: '', periodId: prevId, createdAt: ts, updatedAt: ts,
  });

  // Draft current month: a template line as "Add from templates" writes it (suggestion, no allocation)
  // and a linked line whose source default is archived (repair).
  const cur = u.collection('periods').doc(curId);
  batch.set(cur.collection('planItems').doc(`recbudget_plan_rec-internet_${curId}`), {
    group: 'NEED', name: 'Internet', amount: 45, priority: 6, sourceType: 'RECURRING', sourceId: 'rec-internet',
    suggestedAccountId: 'acc-household', periodId: curId,
  });
  batch.set(cur.collection('planItems').doc('exp_exp-phone'), {
    group: 'NEED', name: 'Phone plan', amount: 25, priority: 7, sourceType: 'EXPENSE_ITEM', sourceId: 'exp-phone', periodId: curId,
  });
}
