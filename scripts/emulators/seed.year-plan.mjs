// BUDG-2 seed additions (lane-owned file, called from seed.mjs with one line).
// Year items for the seeded owner, relative to the seeded months. Synthetic data only.
// Money in integer minor units (ADR-1). No period is created here beyond the seeded ones.
const pad = (n) => String(n).padStart(2, '0');
const monthId = (y, m) => { const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };

export function seedYearPlan({ batch, u, ts, prevId, curId }) {
  const [y, m] = curId.split('-').map(Number);
  const next = monthId(y, m); // m is 1-based, so this is the month after curId
  const plus4 = monthId(y, m + 3);
  const plus5 = monthId(y, m + 4);
  const items = [
    // Due next month, budgeted in the current DRAFT month (the "June renewal budgeted in May" case).
    ['yr-insurance', { title: 'Car insurance renewal', kind: 'EXPENSE', dueDate: `${next}-15`, budgetInPeriodId: curId, estimateMinor: 36000, group: 'NEED', fundingAccountId: 'acc-savings' }],
    // Category link: suggestion comes from the category default (BUDG-3, exp-water → acc-household).
    ['yr-water-service', { title: 'Water meter service', kind: 'EXPENSE', dueDate: `${curId}-24`, budgetInPeriodId: curId, estimateMinor: 4500, group: 'NEED', sourceExpenseItemId: 'exp-water' }],
    ['yr-gift', { title: 'Birthday gift', kind: 'EXPENSE', dueDate: `${curId}-28`, budgetInPeriodId: curId, estimateMinor: 5000, group: 'WANT' }],
    // Date only: shown in the outline and Upcoming, never offered to a draft.
    ['yr-permit', { title: 'Residence card renewal appointment', kind: 'EVENT', dueDate: `${next}-03`, budgetInPeriodId: next }],
    ['yr-holiday', { title: 'Family holiday', kind: 'EXPENSE', dueDate: `${plus5}-10`, budgetInPeriodId: plus4, estimateMinor: 120000, group: 'SAVINGS_DEBT' }],
    // Already included in the locked previous month: must stay unchanged.
    ['yr-school', { title: 'School fees', kind: 'EXPENSE', dueDate: `${prevId}-05`, budgetInPeriodId: prevId, estimateMinor: 20000, group: 'NEED', linkedPeriodIds: [prevId] }],
  ];
  for (const [id, data] of items) {
    batch.set(u.collection('yearItems').doc(id), {
      currencyCode: 'GHS', status: 'ACTIVE', revision: 1, linkedPeriodIds: [], ...data, createdAt: ts, updatedAt: ts,
    });
  }
  const prev = u.collection('periods').doc(prevId);
  batch.set(prev.collection('planItems').doc('year_yr-school'), {
    group: 'NEED', name: 'School fees', amount: 200, tags: [], sourceType: 'YEAR_ITEM', sourceId: 'yr-school', sourceRevision: 1, periodId: prevId,
  });
  batch.set(prev.collection('yearDecisions').doc('yr-school'), { decision: 'INCLUDED', at: ts, periodId: prevId });
  batch.set(u.collection('yearOutline').doc(curId.slice(0, 4)), { notes: 'Renew documents early. Save for the family holiday.', updatedAt: ts });
}
