// BUDG-8 S13: Regular costs view model. Quick add only pre-fills; drafts write the same fields as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import { draftFromItem, draftValues, emptyDraft, matchesSearch, parseQuickAdd } from '../../components/regular/types';

test('quick add splits a trailing amount from the name', () => {
  assert.deepEqual(parseQuickAdd('Internet 30'), { name: 'Internet', amount: '30' });
  assert.deepEqual(parseQuickAdd('  School fees 1,250.50 '), { name: 'School fees', amount: '1250.50' });
  assert.deepEqual(parseQuickAdd('Groceries'), { name: 'Groceries', amount: '' });
  assert.deepEqual(parseQuickAdd('45'), { name: '', amount: '45' });
  assert.deepEqual(parseQuickAdd('Route 66 bus'), { name: 'Route 66 bus', amount: '' });
});

test('draft round trip keeps name, amount, group, active and tags', () => {
  const item = { id: 'x', name: 'Water bill', amount: 45, group: 'NEED' as const, active: false, tags: ['utilities'] };
  const d = draftFromItem(item);
  assert.equal(d.amount, '45');
  assert.equal(d.active, false);
  assert.deepEqual(draftValues(d), { name: 'Water bill', amount: 45, tags: ['utilities'] });
});

test('draft values parse money the old way and never go below zero', () => {
  assert.equal(draftValues(emptyDraft({ name: ' Rent ', amount: '1,000.00' })).amount, 1000);
  assert.equal(draftValues(emptyDraft({ amount: '-5' })).amount, 0);
  assert.equal(draftValues(emptyDraft({ name: ' Rent ' })).name, 'Rent');
});

test('search matches name or tag, case-insensitive', () => {
  const item = { id: 'x', name: 'Water bill', amount: 45, group: 'NEED' as const, active: true, tags: ['utilities'] };
  assert.equal(matchesSearch(item, 'WATER'), true);
  assert.equal(matchesSearch(item, 'util'), true);
  assert.equal(matchesSearch(item, 'rent'), false);
  assert.equal(matchesSearch(item, '  '), true);
});
