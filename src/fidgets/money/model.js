// The numbers on the Money page, worked out from the two ledger files
// (see ledger.js). Nothing here is stored: it's all counted from the entries.
//
//   const m = new MoneyModel({ transactions, budget, prefixes })
//   m.month('2026-10') → everything the page shows for October

export const DEFAULT_PREFIXES = { assets: 'Assets', expenses: 'Expenses', income: 'Income', liabilities: 'Liabilities' };

export function monthOf(date) {
  return String(date).slice(0, 7);
}

export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// The last part of an account's name: "Expenses:Going out" → "Going out".
export function shortName(account) {
  return String(account).split(':').slice(1).join(':') || account;
}

const round = (n) => Math.round(n * 100) / 100;

export class MoneyModel {
  constructor({ transactions = [], budget = { limits: {}, moves: [], goals: [], rollover: {} }, prefixes = DEFAULT_PREFIXES }) {
    this.txs = transactions.slice().sort((a, b) => a.date.localeCompare(b.date) || a.firstLine - b.firstLine);
    this.budget = budget;
    this.p = { ...DEFAULT_PREFIXES, ...prefixes };
  }

  is(account, kind) {
    const prefix = this.p[kind];
    return account === prefix || account.startsWith(`${prefix}:`);
  }

  // A spending category is the first level under Expenses (sub-accounts roll up).
  categoryOf(account) {
    return account.split(':').slice(0, 2).join(':');
  }

  // Every category: those with a budget, then any others spent on.
  categories() {
    const seen = new Set(Object.keys(this.budget.limits).filter((a) => this.is(a, 'expenses')));
    for (const tx of this.txs) for (const p of tx.postings) if (this.is(p.account, 'expenses')) seen.add(this.categoryOf(p.account));
    return [...seen];
  }

  spent(category, month) {
    let total = 0;
    for (const tx of this.txs) {
      if (monthOf(tx.date) !== month) continue;
      for (const p of tx.postings) if (p.account === category || p.account.startsWith(`${category}:`)) total += p.amount;
    }
    return round(total);
  }

  // The budget for a category in a month: its monthly amount plus any money
  // moved in or out for that month.
  planned(category, month) {
    let total = this.budget.limits[category] || 0;
    const first = `${month}-01`;
    for (const move of this.budget.moves) {
      if (move.from && move.from > first) continue;
      if (move.to && move.to <= first) continue;
      for (const p of move.postings) if (p.account === category) total += p.amount;
    }
    return round(total);
  }

  // Leftovers carried forward from earlier months (when rollover is on).
  carried(category, month) {
    const since = this.budget.rollover[category];
    if (!since || since >= month) return 0;
    let carry = 0;
    for (let m = since; m < month; m = shiftMonth(m, 1)) carry += this.planned(category, m) - this.spent(category, m);
    return round(carry);
  }

  // Money in and out of asset (and debt) accounts: balance on a day.
  balance(account, upTo = '9999-12-31') {
    let total = 0;
    for (const tx of this.txs) {
      if (tx.date > upTo) break;
      for (const p of tx.postings) if (p.account === account || p.account.startsWith(`${account}:`)) total += p.amount;
    }
    return round(total);
  }

  netWorth(upTo) {
    let total = 0;
    for (const tx of this.txs) {
      if (upTo && tx.date > upTo) break;
      for (const p of tx.postings) if (this.is(p.account, 'assets') || this.is(p.account, 'liabilities')) total += p.amount;
    }
    return round(total);
  }

  // Accounts holding money (the first two levels: Assets:Everyday, Assets:Savings).
  accounts() {
    const seen = new Map();
    for (const tx of this.txs) {
      for (const p of tx.postings) {
        if (!this.is(p.account, 'assets') && !this.is(p.account, 'liabilities')) continue;
        const top = p.account.split(':').slice(0, 2).join(':');
        seen.set(top, (seen.get(top) || 0) + 1);
      }
    }
    return [...seen.keys()].map((account) => ({ account, name: shortName(account), balance: this.balance(account) }));
  }

  // Where spending comes from by default: the most-used asset account
  // outside savings, or Assets:Everyday.
  defaultAccount() {
    const counts = new Map();
    for (const tx of this.txs) {
      for (const p of tx.postings) {
        if (this.is(p.account, 'assets') && !p.account.includes(':Savings')) counts.set(p.account, (counts.get(p.account) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || `${this.p.assets}:Everyday`;
  }

  // Everything known by name, for suggestions.
  allAccounts() {
    const set = new Set([...Object.keys(this.budget.limits), ...this.budget.goals.map((g) => g.account)]);
    for (const tx of this.txs) for (const p of tx.postings) set.add(p.account);
    set.delete(`${this.p.assets}:Budget`);
    return [...set].sort();
  }

  payees() {
    return [...new Set(this.txs.map((t) => t.payee).filter(Boolean))];
  }

  // Each saving goal with what's in it now.
  goals() {
    return this.budget.goals.map((g) => ({ ...g, name: g.account.split(':').pop(), have: this.balance(g.account) }));
  }

  // What kind of entry a transaction is, for colours and lists.
  kindOf(tx) {
    const accounts = tx.postings.map((p) => p.account);
    if (accounts.some((a) => this.is(a, 'income'))) return 'income';
    if (accounts.some((a) => this.is(a, 'expenses'))) return 'spend';
    if (accounts.some((a) => a.includes(':Savings'))) return 'save';
    return 'transfer';
  }

  // The amount to show for an entry: + for money in, − for money out.
  shownAmount(tx) {
    const kind = this.kindOf(tx);
    const sum = (test) => round(tx.postings.filter((p) => test(p.account)).reduce((s, p) => s + p.amount, 0));
    if (kind === 'income') return -sum((a) => this.is(a, 'income'));
    if (kind === 'spend') return -sum((a) => this.is(a, 'expenses'));
    return sum((a) => a.includes(':Savings')) || Math.abs(tx.postings[0]?.amount || 0);
  }

  // The label (category or job) shown beside an entry.
  labelOf(tx) {
    const kind = this.kindOf(tx);
    const find = (test) => tx.postings.find((p) => test(p.account));
    if (kind === 'income') return shortName(this.categoryOf(find((a) => this.is(a, 'income')).account));
    if (kind === 'spend') return shortName(this.categoryOf(find((a) => this.is(a, 'expenses')).account));
    if (kind === 'save') return `Saving · ${find((a) => a.includes(':Savings')).account.split(':').pop()}`;
    return 'Transfer';
  }

  // Everything the page shows for one month.
  month(month) {
    const end = `${month}-31`;
    const before = `${shiftMonth(month, -1)}-31`;
    const budget = this.categories().map((account) => {
      const planned = this.planned(account, month);
      const carried = this.carried(account, month);
      const spent = this.spent(account, month);
      const available = round(planned + carried);
      return { account, name: shortName(account), planned, carried, available, spent, left: round(available - spent), rollover: Boolean(this.budget.rollover[account]) };
    });
    const entries = this.txs.filter((t) => monthOf(t.date) === month);
    const income = new Map();
    let saved = 0;
    for (const tx of entries) {
      for (const p of tx.postings) {
        if (this.is(p.account, 'income')) {
          const job = this.categoryOf(p.account);
          const row = income.get(job) || { account: job, name: shortName(job), total: 0, count: 0 };
          row.total = round(row.total - p.amount);
          row.count++;
          income.set(job, row);
        }
        if (p.account.includes(':Savings')) saved += p.amount;
      }
    }
    const withBudget = budget.filter((b) => b.available > 0);
    return {
      month,
      budget,
      totalAvailable: round(withBudget.reduce((s, b) => s + b.available, 0)),
      totalSpent: round(budget.reduce((s, b) => s + Math.max(0, b.spent), 0)),
      spentInBudget: round(withBudget.reduce((s, b) => s + b.spent, 0)),
      income: [...income.values()].sort((a, b) => b.total - a.total),
      incomeTotal: round([...income.values()].reduce((s, r) => s + r.total, 0)),
      saved: round(saved),
      netWorth: this.netWorth(end),
      netChange: round(this.netWorth(end) - this.netWorth(before)),
      entries: entries.slice().reverse(),
    };
  }
}

// Suggestions for moving budget: categories over (or nearly over) their
// budget, and ones with money to spare, late enough in the month to tell.
export function budgetHints(rows, dayOfMonth, daysInMonth) {
  const through = dayOfMonth / daysInMonth;
  const tight = rows.filter((r) => r.available > 0 && (r.left < 0 || r.left / r.available < 0.1));
  const spare = rows.filter((r) => r.available > 0 && r.left > 0 && r.spent / r.available < through * 0.6 && through > 0.4)
    .sort((a, b) => b.left - a.left);
  return { tight, spare };
}
