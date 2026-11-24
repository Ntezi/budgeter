// BUDG-6 H-3: chef-chosen item ids never name a transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordKeyFor, shoppingTxIdFor, newRecordKey } from '../../lib/repo/shoppingExpense';

test('H-3 a household item keeps its deterministic id (retry posts once)', () => {
  const keys: Record<string, string> = {};
  assert.equal(recordKeyFor('list-weekly', { id: 'milk' }, keys), undefined);
  assert.equal(shoppingTxIdFor('list-weekly', 'milk'), 'shop_list-weekly_milk');
});

test('H-3 a chef-added item gets a household key, the same one on a retry of the same form', () => {
  const keys: Record<string, string> = {};
  let n = 0;
  const gen = () => `k${++n}`;
  const a = recordKeyFor('list-weekly', { id: 'milk', fromChef: true }, keys, gen);
  const b = recordKeyFor('list-weekly', { id: 'milk', fromChef: true }, keys, gen);
  assert.equal(a, 'k1');
  assert.equal(b, 'k1');
  assert.equal(shoppingTxIdFor('list-weekly', 'milk', a), 'shop_k_k1');
  // A chef re-creating an id the household already recorded gets a new key in a new form: never a silent no-op.
  assert.notEqual(shoppingTxIdFor('list-weekly', 'milk', recordKeyFor('list-weekly', { id: 'milk', fromChef: true }, {}, gen)), 'shop_list-weekly_milk');
});

test('H-3 ids outside [A-Za-z0-9_-] never throw mid-loop: they get a key (challenger path 2 turned into a pass)', () => {
  const keys: Record<string, string> = {};
  const key = recordKeyFor('list-weekly', { id: 'odd id.x', fromChef: true }, keys);
  assert.ok(key && /^[A-Za-z0-9_-]+$/.test(key));
  assert.match(shoppingTxIdFor('list-weekly', 'odd id.x', key), /^shop_k_[A-Za-z0-9_-]+$/);
  assert.ok(recordKeyFor('list weekly', { id: 'milk' }, {})); // unsafe list id: key too
  assert.throws(() => shoppingTxIdFor('l', 'i', 'bad key'), /Invalid record key/);
  assert.match(newRecordKey(), /^[A-Za-z0-9_-]{10,}$/);
});
