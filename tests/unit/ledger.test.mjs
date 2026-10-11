// Money: transactions.ledger and budget.ledger (Ledger / Obsidian Ledger plugin format).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { src } from './load.mjs';

const L = await src('fidgets/money/ledger');
const FILE = '2026-10-06 Woolworths\n    Expenses:Food    $42.10\n    Assets:Everyday\n\n2026-10-07 Pay\n    Assets:Everyday    $100.00\n    Income:Work\n';

test('amounts read in every way Ledger writes them', () => {
  assert.deepEqual(L.parseAmount('$1,240.50'), { amount: 1240.5, currency: '$' });
  assert.deepEqual(L.parseAmount('-$42.10'), { amount: -42.1, currency: '$' });
  assert.deepEqual(L.parseAmount('$-42.10'), { amount: -42.1, currency: '$' });
  assert.equal(L.formatAmount(-42.1), '$-42.10');
});

test('a posting with no amount balances the rest', () => {
  const { transactions } = L.parseLedger(FILE);
  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].payee, 'Woolworths');
  assert.equal(transactions[0].date, '2026-10-06');
  assert.deepEqual(transactions[0].postings.map((p) => [p.account, p.amount]), [['Expenses:Food', 42.1], ['Assets:Everyday', -42.1]]);
  assert.equal(transactions[0].postings[1].implied, true);
});

test('adding an entry appends it after a blank line and leaves the rest exactly as it was', () => {
  const next = L.appendTransaction(FILE, { date: '2026-10-08', payee: 'Bus', postings: [{ account: 'Expenses:Transport', amount: 3.2 }, { account: 'Assets:Everyday' }] });
  assert.ok(next.startsWith(FILE));
  assert.ok(next.endsWith('\n\n2026-10-08 Bus\n    Expenses:Transport    $3.20\n    Assets:Everyday\n'));
  assert.equal(L.parseLedger(next).transactions.length, 3);
});

test('replacing an entry changes only that entry', () => {
  const [, pay] = L.parseLedger(FILE).transactions;
  const next = L.replaceTransaction(FILE, pay, { date: '2026-10-07', payee: 'Pay day', postings: [{ account: 'Assets:Everyday', amount: 120 }, { account: 'Income:Work' }] });
  const txs = L.parseLedger(next).transactions;
  assert.equal(txs[0].raw, L.parseLedger(FILE).transactions[0].raw);
  assert.equal(txs[1].payee, 'Pay day');
  assert.equal(txs[1].postings[0].amount, 120);
});

test('the budget file round-trips: limits, goals', () => {
  const text = '~ Monthly\n    Expenses:Food    $250.00\n    Assets:Budget\n\n; opal-goal: Assets:Savings:Shoes | $220.00 | 2026-11\n';
  const budget = L.parseBudget(text);
  assert.deepEqual(budget.limits, { 'Expenses:Food': 250 });
  assert.deepEqual(budget.goals.map((g) => [g.account, g.target, g.by]), [['Assets:Savings:Shoes', 220, '2026-11']]);
  const again = L.parseBudget(L.formatBudget(budget));
  assert.deepEqual(again.limits, budget.limits);
  assert.deepEqual(again.goals.map((g) => [g.account, g.target, g.by]), budget.goals.map((g) => [g.account, g.target, g.by]));
});
