// BUDG-40 F-7 (AC-3 part): Move money dates a transfer with the local day, not the UTC day.
// The zone is pinned for this file's process (node --test runs each file in its own process).
process.env.TZ = 'Africa/Kigali'; // +02:00, no daylight saving

import test from 'node:test';
import assert from 'node:assert/strict';

import { transferDate, transferRequests } from '../../components/accounts/transferRequests';

// 00:30 local on 1 December 2026 in +02:00 = 22:30 UTC on 30 November.
const AT_0030_ON_THE_1ST = new Date('2026-11-30T22:30:00Z');

test('BUDG-40 F-7: the zone is +02:00 for this test', () => {
  assert.equal(AT_0030_ON_THE_1ST.getTimezoneOffset(), -120);
  assert.equal(AT_0030_ON_THE_1ST.toISOString().slice(0, 10), '2026-11-30'); // the old UTC answer
});

test('BUDG-40 F-7: at 00:30 local on the 1st the transfer date shown is the 1st', () => {
  assert.equal(transferDate(AT_0030_ON_THE_1ST), '2026-12-01');
});

test('BUDG-40 F-7: every transfer Move money writes carries that same local day', () => {
  const reqs = transferRequests({
    formKey: 'k',
    source: { accountId: 'acc-household', accountName: 'Household account' },
    rows: [{ accountId: 'acc-cash', parsedAmount: 30 }, { accountId: 'acc-savings', parsedAmount: 20 }],
    now: AT_0030_ON_THE_1ST,
  });
  assert.deepEqual(reqs.map((r) => [r.id, r.input.date]), [['k00', '2026-12-01'], ['k01', '2026-12-01']]);
  assert.equal(reqs[0].input.note, 'Account transfer from Household account');
});
