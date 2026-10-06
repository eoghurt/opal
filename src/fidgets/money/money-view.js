// Money: a month at a glance (design A) — net worth, spending against the
// budget, saving goals, income and recent entries — with pages for the
// budget (move money between categories, carry leftovers over), saving,
// income and the full history.
//
// Everything is read from and written to the Ledger plugin's files (see
// ledger.js): transactions.ledger for entries, budget.ledger for the budget.
//
//   new MoneyView(container, { month, tab, io })
//   io: read() → { transactions, budget, settings }, writeTransactions(text),
//       writeBudget(text), onChange({ month, tab })

import { h, askChoice } from '../../ui.js';
import { slotFor } from '../../palettes.js';
import { parseLedger, parseBudget, formatBudget, appendTransaction, replaceTransaction, formatAmount } from './ledger.js';
import { MoneyModel, monthOf, shiftMonth, shortName, budgetHints } from './model.js';

// Suggested categories, jobs and accounts: one click to use, no typing.
const SUGGESTED = {
  spend: ['Food', 'Groceries', 'Transport', 'Going out', 'Shopping', 'Subscriptions', 'Bills', 'Phone', 'Health', 'School', 'Sport', 'Gifts', 'Fun', 'Travel'],
  income: ['Work', 'Tutoring', 'Coaching', 'Allowance', 'Gifts', 'Selling things'],
  accounts: ['Everyday', 'Cash', 'Savings'],
};

const TABS = [['overview', 'Overview'], ['budget', 'Budget'], ['saving', 'Saving'], ['income', 'Income'], ['history', 'History']];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayLabel(date) {
  const d = new Date(`${date}T12:00`);
  const diff = Math.round((new Date(`${today()}T12:00`) - d) / 86400000);
  const name = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return diff === 0 ? `Today · ${name}` : diff === 1 ? `Yesterday · ${name}` : name;
}

export class MoneyView {
  constructor(container, { month, tab, io }) {
    this.container = container;
    this.io = io;
    this.monthKey = month || monthOf(today());
    this.tab = TABS.some(([id]) => id === tab) ? tab : 'overview';
    this.writing = Promise.resolve();
    this.root = h('div', { class: 'money' });
    container.replaceChildren(this.root);
    this.root.append(h('p', { class: 'money-loading' }, 'Counting…'));
    this.load();
  }

  destroy() {
    this.closePop();
  }

  async load() {
    let data;
    try {
      data = await this.io.read();
    } catch (err) {
      this.root.replaceChildren(h('p', { class: 'money-error' }, `Couldn't read the money files. ${err.message}`));
      return;
    }
    this.settings = data.settings;
    this.currency = data.settings.currencySymbol || '$';
    const parsed = parseLedger(data.transactions || '');
    this.budgetData = parseBudget(data.budget || '');
    this.model = new MoneyModel({ transactions: parsed.transactions, budget: this.budgetData, prefixes: data.settings.prefixes });
    this.render();
  }

  reload() {
    if (this.pop) return null; // finish what's being typed first
    return this.load();
  }

  money(n, { sign = false } = {}) {
    const abs = Math.abs(n);
    const text = `${this.currency}${abs.toLocaleString(undefined, { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
    if (n < 0) return `−${text}`;
    return sign && n > 0 ? `+${text}` : text;
  }

  colorOf(name) {
    return `var(--c${slotFor(name)})`;
  }

  go(patch) {
    Object.assign(this, patch);
    this.io.onChange({ month: this.monthKey, tab: this.tab });
    this.render();
  }

  // ---------- Writing ----------

  // Changes one file: fn(fresh text) → new text. Then everything is re-read.
  change(which, fn) {
    this.closePop();
    this.writing = this.writing.then(async () => {
      const data = await this.io.read();
      const next = fn(which === 'budget' ? data.budget || '' : data.transactions || '');
      if (which === 'budget') await this.io.writeBudget(next);
      else await this.io.writeTransactions(next);
    }).catch((err) => alert(`Couldn't save that.\n\n${err.message}`)).then(() => this.load());
    return this.writing;
  }

  addEntry(entry) {
    return this.change('transactions', (text) => appendTransaction(text, entry, this.currency));
  }

  changeBudget(fn) {
    return this.change('budget', (text) => {
      const budget = parseBudget(text);
      fn(budget);
      return formatBudget(budget, this.currency);
    });
  }

  // ---------- Drawing ----------

  render() {
    if (!this.model) return;
    this.closePop();
    const m = this.model.month(this.monthKey);
    const head = h('header', { class: 'money-head' },
      h('div', { class: 'money-title' },
        h('div', { class: 'money-month' },
          h('button', { class: 'money-arrow', 'aria-label': 'Previous month', onclick: () => this.go({ monthKey: shiftMonth(this.monthKey, -1) }) }, '‹'),
          h('span', null, monthLabel(this.monthKey)),
          h('button', { class: 'money-arrow', 'aria-label': 'Next month', onclick: () => this.go({ monthKey: shiftMonth(this.monthKey, 1) }) }, '›'),
          this.monthKey !== monthOf(today()) ? h('button', { class: 'money-link', onclick: () => this.go({ monthKey: monthOf(today()) }) }, 'This month') : null),
        h('h1', { class: 'display money-h1' }, 'Money.')),
      h('div', { class: 'money-actions' },
        h('nav', { class: 'money-tabs', 'aria-label': 'Money pages' },
          TABS.map(([id, label]) => h('button', {
            class: `money-tab${this.tab === id ? ' is-on' : ''}`,
            'aria-current': this.tab === id ? 'page' : null,
            onclick: () => this.go({ tab: id }),
          }, label))),
        h('button', { class: 'money-add', onclick: (e) => this.openAdd(e.currentTarget) }, '+ Add')));
    const body = {
      overview: () => this.overview(m),
      budget: () => this.budgetPage(m),
      saving: () => this.savingPage(m),
      income: () => this.incomePage(m),
      history: () => this.historyPage(m),
    }[this.tab]();
    this.root.replaceChildren(head, body);
  }

  card(title, extra, ...children) {
    return h('section', { class: 'money-card', 'aria-label': title },
      h('div', { class: 'money-card-head' }, h('h2', null, title), extra || null),
      ...children);
  }

  bar(fraction, color, over) {
    return h('div', { class: 'money-track' },
      h('div', { class: `money-fill${over ? ' is-over' : ''}`, style: `width: ${Math.max(0, Math.min(100, fraction * 100))}%; background: ${color}` }));
  }

  dot(color) {
    return h('span', { class: 'money-dot', style: `background: ${color}`, 'aria-hidden': 'true' });
  }

  emptyHint(text) {
    return h('p', { class: 'money-empty' }, text);
  }

  overview(m) {
    const tiles = h('div', { class: 'money-tiles' },
      h('div', { class: 'money-tile' },
        h('span', { class: 'money-tile-label' }, 'Net worth'),
        h('span', { class: 'money-tile-big' }, this.money(m.netWorth)),
        h('span', { class: `money-tile-sub${m.netChange > 0 ? ' is-up' : m.netChange < 0 ? ' is-down' : ''}` }, m.netChange ? `${this.money(m.netChange, { sign: true })} this month` : 'no change this month')),
      h('div', { class: 'money-tile' },
        h('span', { class: 'money-tile-label' }, 'Spent'),
        h('span', { class: 'money-tile-big' }, this.money(m.totalSpent), m.totalAvailable ? h('small', null, ` of ${this.money(m.totalAvailable)}`) : null),
        m.totalAvailable ? this.bar(m.spentInBudget / m.totalAvailable, 'var(--ink)', m.spentInBudget > m.totalAvailable) : h('span', { class: 'money-tile-sub' }, 'no budget set')),
      h('div', { class: 'money-tile' },
        h('span', { class: 'money-tile-label' }, 'Saved'),
        h('span', { class: 'money-tile-big' }, this.money(m.saved)),
        h('span', { class: 'money-tile-sub' }, this.budgetData.goals.length ? `goals: ${this.budgetData.goals.length}` : 'into savings')),
      h('div', { class: 'money-tile' },
        h('span', { class: 'money-tile-label' }, 'Income'),
        h('span', { class: 'money-tile-big' }, this.money(m.incomeTotal)),
        h('span', { class: 'money-tile-sub' }, m.income.length ? m.income.map((r) => r.name).join(', ') : 'none yet')));

    const left = m.budget.filter((b) => b.available > 0).reduce((s, b) => s + Math.max(0, b.left), 0);
    const budgetCard = this.card('Budget',
      h('span', { class: 'money-muted' }, m.totalAvailable ? `${this.money(left)} left` : ''),
      m.budget.length ? m.budget.map((b) => this.budgetBar(b)) : this.emptyHint('No budget yet. Set monthly amounts on the Budget page.'),
      ...this.tightNotes(m));
    const recent = this.card('Recent',
      m.entries.length > 6 ? h('button', { class: 'money-link', onclick: () => this.go({ tab: 'history' }) }, `All ${m.entries.length}`) : null,
      m.entries.length ? m.entries.slice(0, 6).map((tx) => this.entryRow(tx, { short: true })) : this.emptyHint('Nothing this month yet. + Add your first entry.'));
    const goals = this.model.goals();
    const goalsCard = this.card('Saving goals', null,
      goals.length ? goals.map((g) => this.goalRow(g)) : this.emptyHint('No goals yet. Make one on the Saving page.'));
    const incomeCard = this.card('Income', null,
      m.income.length
        ? m.income.map((r) => h('div', { class: 'money-line' }, h('span', null, r.name, h('span', { class: 'money-muted' }, ` · ${r.count} ${r.count === 1 ? 'entry' : 'entries'}`)), h('span', { class: 'money-num' }, this.money(r.total))))
        : this.emptyHint('No income this month.'));
    const accounts = this.model.accounts();
    const accountsCard = accounts.length ? this.card('Accounts', null,
      accounts.map((a) => h('div', { class: 'money-line' }, h('span', null, a.name), h('span', { class: 'money-num' }, this.money(a.balance)))),
      h('div', { class: 'money-line is-total' }, h('span', null, 'Net worth'), h('span', { class: 'money-num' }, this.money(this.model.netWorth())))) : null;
    return h('div', { class: 'money-body' },
      tiles,
      h('div', { class: 'money-cols' },
        h('div', { class: 'money-col-main' }, budgetCard, recent),
        h('div', { class: 'money-col-side' }, goalsCard, incomeCard, accountsCard)));
  }

  budgetBar(b) {
    const over = b.left < 0;
    return h('div', { class: 'money-budget-row' },
      h('span', { class: 'money-cat' }, this.dot(this.colorOf(b.name)), b.name),
      b.available > 0 ? this.bar(b.spent / b.available, this.colorOf(b.name), over) : h('span', { class: 'money-muted' }, 'no budget'),
      h('span', { class: 'money-num' }, this.money(b.spent), b.available > 0 ? h('span', { class: 'money-muted' }, ` / ${this.money(b.available)}`) : null));
  }

  tightNotes(m) {
    return m.budget.filter((b) => b.available > 0 && (b.left < 0 || b.left / b.available < 0.1)).map((b) => h('p', { class: 'money-warn' },
      b.left < 0 ? `${b.name}: ${this.money(-b.left)} over` : `${b.name}: ${this.money(b.left)} left for the month`));
  }

  entryRow(tx, { short = false } = {}) {
    const kind = this.model.kindOf(tx);
    const amount = this.model.shownAmount(tx);
    const label = this.model.labelOf(tx);
    const shown = kind === 'income' ? this.money(amount, { sign: true }) : kind === 'spend' ? this.money(-amount) : this.money(amount);
    const row = h('div', { class: `money-entry is-${kind}`, role: 'button', tabindex: '0', title: 'Edit' },
      short ? h('span', { class: 'money-muted money-entry-date' }, tx.date === today() ? 'Today' : new Date(`${tx.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })) : null,
      h('span', { class: 'money-entry-what' }, tx.payee || 'Untitled'),
      h('span', { class: 'money-cat' }, this.dot(kind === 'income' ? 'var(--success, #2DB38A)' : this.colorOf(label)), label),
      h('span', { class: 'money-num money-entry-amount' }, shown),
      short ? null : h('button', { class: 'money-x', 'aria-label': `Delete ${tx.payee}`, title: 'Delete', onclick: (e) => { e.stopPropagation(); this.deleteEntry(tx); } }, '×'));
    const edit = () => this.openAdd(row, { edit: tx });
    row.addEventListener('click', edit);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') edit(); });
    return row;
  }

  async deleteEntry(tx) {
    const ok = await askChoice(`Delete “${tx.payee}” (${tx.date})?`, [{ label: 'Delete', value: 'yes' }]);
    if (ok) this.change('transactions', (text) => replaceTransaction(text, tx, null, this.currency));
  }

  goalRow(g) {
    const done = g.target > 0 && g.have >= g.target;
    return h('div', { class: 'money-goal' },
      h('div', { class: 'money-line' }, h('span', { class: 'money-goal-name' }, g.name), h('span', { class: 'money-muted' }, done ? 'reached' : g.by ? `by ${monthLabel(g.by)}` : 'no date')),
      this.bar(g.target ? g.have / g.target : 0, this.colorOf(g.name)),
      h('span', { class: 'money-num' }, this.money(g.have), h('span', { class: 'money-muted' }, ` of ${this.money(g.target)}`)));
  }

  // A row of choices as buttons: `options` [{ value, label, color, suggested }].
  // "+ New" (when `onNew` is given) asks for a name in place and adds it.
  // → { el, value(), set(value) }
  chips(options, selected, { label, onNew, onPick } = {}) {
    let value = selected;
    const el = h('div', { class: 'money-chips', role: 'radiogroup', 'aria-label': label });
    const draw = () => {
      el.replaceChildren(...options.map((o) => h('button', {
        type: 'button',
        class: `money-chip${o.value === value ? ' is-on' : ''}${o.suggested ? ' is-suggested' : ''}`,
        role: 'radio',
        'aria-checked': String(o.value === value),
        title: o.suggested ? 'Suggested — click to use' : null,
        onclick: () => { value = o.value; draw(); if (onPick) onPick(value); },
      }, o.color ? this.dot(o.color) : null, o.label)),
      onNew ? this.newChip(label, (name) => {
        const option = onNew(name);
        if (!option) return;
        if (!options.some((o) => o.value === option.value)) options.push(option);
        value = option.value;
        draw();
        if (onPick) onPick(value);
      }) : '');
    };
    draw();
    return { el, value: () => value, set: (v) => { value = v; draw(); } };
  }

  // "+ New": turns into a small name box; Enter adds, Escape cancels.
  newChip(label, onName) {
    const button = h('button', { type: 'button', class: 'money-chip is-new' }, '+ New');
    button.addEventListener('click', () => {
      const input = h('input', { class: 'money-chip-input', placeholder: 'Name', 'aria-label': `New ${String(label || '').toLowerCase()}` });
      let finished = false;
      const done = (keep) => {
        if (finished) return;
        finished = true;
        const name = input.value.trim().replace(/[:;]/g, ' ').replace(/\s+/g, ' ');
        if (keep && name) onName(name.replace(/^./, (c) => c.toUpperCase()));
        else input.replaceWith(button);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
        if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      });
      input.addEventListener('blur', () => done(true));
      button.replaceWith(input);
      input.focus();
    });
    return button;
  }

  // Choices for each kind of entry: yours first, then suggestions not used yet.
  optionsFor(kind) {
    const model = this.model;
    const p = model.p;
    const all = model.allAccounts();
    const mine = (test) => [...new Set(all.filter(test).map((a) => a.split(':').slice(0, kind === 'move' ? 3 : 2).join(':')))];
    const make = (account, suggested) => ({ value: account, label: shortName(account).split(':').pop(), color: kind === 'income' ? null : this.colorOf(shortName(account)), suggested });
    const withSuggestions = (accounts, prefix, names) => [
      ...accounts.map((a) => make(a, false)),
      ...names.map((n) => `${prefix}:${n}`).filter((a) => !accounts.includes(a)).map((a) => make(a, true)),
    ];
    if (kind === 'spend') return withSuggestions(model.categories(), p.expenses, SUGGESTED.spend);
    if (kind === 'income') return withSuggestions(mine((a) => model.is(a, 'income')), p.income, SUGGESTED.income);
    if (kind === 'move') {
      const goals = model.goals().map((g) => g.account);
      const accounts = mine((a) => model.is(a, 'assets') && a !== `${p.assets}:Budget`);
      return withSuggestions([...new Set([...goals, ...accounts])], p.assets, ['Savings']);
    }
    // Accounts money is paid from / into.
    const accounts = [...new Set(all.filter((a) => (model.is(a, 'assets') && !a.includes(':Savings') && a !== `${p.assets}:Budget`) || model.is(a, 'liabilities')).map((a) => a.split(':').slice(0, 2).join(':')))];
    if (!accounts.includes(model.defaultAccount())) accounts.unshift(model.defaultAccount());
    return withSuggestions(accounts, p.assets, SUGGESTED.accounts.filter((n) => n !== 'Savings'));
  }

  // ---------- Budget ----------

  budgetPage(m) {
    const now = new Date();
    const thisMonth = this.monthKey === monthOf(today());
    const days = new Date(Number(this.monthKey.slice(0, 4)), Number(this.monthKey.slice(5)), 0).getDate();
    const hints = thisMonth ? budgetHints(m.budget, now.getDate(), days) : { tight: [], spare: [] };
    const rows = m.budget.map((b) => {
      const amount = h('input', { class: 'money-input money-amount', type: 'number', min: '0', step: '1', value: String(this.budgetData.limits[b.account] || ''), placeholder: '0', 'aria-label': `${b.name} monthly budget` });
      amount.addEventListener('change', () => {
        const v = parseFloat(amount.value);
        this.changeBudget((budget) => { budget.limits[b.account] = Number.isFinite(v) && v > 0 ? v : 0; });
      });
      const roll = h('button', {
        class: `set-toggle${b.rollover ? ' is-on' : ''}`,
        role: 'switch',
        'aria-checked': String(b.rollover),
        'aria-label': `Carry ${b.name}'s leftovers into next month`,
        title: 'Carry leftovers into next month',
        onclick: () => this.changeBudget((budget) => {
          if (budget.rollover[b.account]) delete budget.rollover[b.account];
          else budget.rollover[b.account] = this.monthKey;
        }),
      }, h('span', { class: 'set-toggle-knob' }));
      return h('div', { class: 'money-brow' },
        h('span', { class: 'money-cat' }, this.dot(this.colorOf(b.name)), b.name),
        h('label', { class: 'money-brow-amount' }, h('span', { class: 'money-muted' }, `${this.currency}`), amount, h('span', { class: 'money-muted' }, '/ month')),
        h('div', { class: 'money-brow-bar' },
          b.available > 0 ? this.bar(b.spent / b.available, this.colorOf(b.name), b.left < 0) : null,
          h('span', { class: 'money-muted' },
            `${this.money(b.spent)} spent`,
            b.available > 0 ? ` · ${b.left < 0 ? `${this.money(-b.left)} over` : `${this.money(b.left)} left`}` : '',
            b.planned !== (this.budgetData.limits[b.account] || 0) ? ` · ${this.money(b.planned - (this.budgetData.limits[b.account] || 0), { sign: true })} moved` : '',
            b.carried ? ` · ${this.money(b.carried, { sign: true })} carried` : '')),
        h('span', { class: 'money-brow-roll' }, roll, h('span', { class: 'money-muted' }, 'carry over')),
        h('button', { class: 'money-btn', onclick: () => this.moveForm.prefill(b.account) }, 'Move…'),
        this.budgetData.limits[b.account] != null ? h('button', {
          class: 'money-x',
          'aria-label': `Take ${b.name} out of the budget`,
          title: 'Take out of the budget (its spending stays)',
          onclick: () => this.changeBudget((budget) => { delete budget.limits[b.account]; }),
        }, '×') : h('span'));
    });

    // Add a category: a suggestion, or + New. Its amount is set in its row.
    const addAccount = (account) => this.changeBudget((budget) => { if (budget.limits[account] == null) budget.limits[account] = 0; });
    const unbudgeted = this.optionsFor('spend').filter((o) => this.budgetData.limits[o.value] == null);
    const addCategory = h('div', { class: 'money-add-cats' },
      h('span', { class: 'money-muted' }, 'Add a category'),
      this.chips(unbudgeted.map((o) => ({ ...o, suggested: true })), null, {
        label: 'Category',
        onPick: (account) => addAccount(account),
        onNew: (name) => { addAccount(`${this.model.p.expenses}:${name}`); return null; },
      }).el);

    this.moveForm = this.moveMoney(m);
    const hintCard = hints.tight.length || hints.spare.length ? this.card('Suggestions', null,
      ...hints.tight.map((t) => h('p', { class: 'money-warn' }, `${t.name} is ${t.left < 0 ? `${this.money(-t.left)} over` : `down to ${this.money(t.left)}`}.`)),
      ...hints.spare.slice(0, 3).map((s) => h('p', { class: 'money-hint' }, `${s.name} has ${this.money(s.left)} to spare so far.`,
        hints.tight[0] ? h('button', { class: 'money-link', onclick: () => this.moveForm.prefill(s.account, hints.tight[0].account, Math.min(s.left, Math.max(10, Math.ceil(-hints.tight[0].left / 5) * 5 || 10))) }, ` Move some to ${hints.tight[0].name}`) : null))) : null;
    return h('div', { class: 'money-body' },
      h('div', { class: 'money-cols' },
        h('div', { class: 'money-col-main' },
          this.card(`Budget · ${monthLabel(this.monthKey)}`, h('span', { class: 'money-muted' }, `${this.money(m.totalAvailable)} a month`),
            rows.length ? rows : this.emptyHint('Add your spending categories and how much each gets a month.'),
            addCategory)),
        h('div', { class: 'money-col-side' },
          this.moveForm.el,
          hintCard,
          this.card('How it’s saved', null, h('p', { class: 'money-muted money-small' },
            'Monthly amounts and moves are in budget.ledger, in Ledger’s budget format. A move only changes this month; carrying over adds what’s left to next month.')))));
  }

  // "Move money": from one category to another, for this month only.
  moveMoney(m) {
    const options = (selected) => m.budget.map((b) => h('option', { value: b.account, selected: b.account === selected ? true : null }, `${b.name} (${this.money(b.left)} left)`));
    const amount = h('input', { class: 'money-input money-amount', type: 'number', min: '1', step: '1', placeholder: '0', 'aria-label': 'Amount to move' });
    const from = h('select', { class: 'money-input', 'aria-label': 'Move from' }, options(null));
    const to = h('select', { class: 'money-input', 'aria-label': 'Move to' }, options(m.budget[1] && m.budget[1].account));
    const form = h('form', { class: 'money-move' },
      h('label', { class: 'money-field' }, h('span', null, 'Amount'), h('span', { class: 'money-inline' }, h('span', { class: 'money-muted' }, this.currency), amount)),
      h('label', { class: 'money-field' }, h('span', null, 'From'), from),
      h('label', { class: 'money-field' }, h('span', null, 'To'), to),
      h('button', { class: 'money-add', type: 'submit' }, 'Move'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseFloat(amount.value);
      if (!(v > 0) || from.value === to.value) return;
      const next = `${shiftMonth(this.monthKey, 1)}-01`;
      this.changeBudget((budget) => {
        budget.moves.push({
          from: `${this.monthKey}-01`,
          to: next,
          note: `moved ${formatAmount(v, this.currency)} from ${shortName(from.value)} to ${shortName(to.value)}`,
          postings: [{ account: to.value, amount: v }, { account: from.value, amount: -v }],
        });
      });
    });
    const el = this.card('Move money', h('span', { class: 'money-muted' }, 'this month only'),
      m.budget.length > 1 ? form : this.emptyHint('Needs two categories.'));
    return {
      el,
      prefill: (fromAccount, toAccount, value) => {
        if (fromAccount) from.value = fromAccount;
        if (toAccount) to.value = toAccount;
        if (value) amount.value = String(value);
        amount.focus();
      },
    };
  }

  // ---------- Saving ----------

  savingPage() {
    const goals = this.model.goals();
    const cards = goals.map((g) => {
      const amount = h('input', { class: 'money-input money-amount', type: 'number', min: '1', placeholder: '0', 'aria-label': `Amount to put into ${g.name}` });
      const form = h('form', { class: 'money-inline' }, h('span', { class: 'money-muted' }, this.currency), amount,
        h('button', { class: 'money-btn', type: 'submit' }, 'Put in'),
        h('button', { class: 'money-btn', type: 'button', onclick: () => {
          const v = parseFloat(amount.value);
          if (v > 0) this.addEntry({ date: today(), payee: `Out of savings · ${g.name}`, postings: [{ account: this.model.defaultAccount(), amount: v }, { account: g.account, amount: null }] });
        } }, 'Take out'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = parseFloat(amount.value);
        if (v > 0) this.addEntry({ date: today(), payee: `To savings · ${g.name}`, postings: [{ account: g.account, amount: v }, { account: this.model.defaultAccount(), amount: null }] });
      });
      const remove = h('button', { class: 'money-x', 'aria-label': `Stop tracking ${g.name}`, title: 'Remove the goal (its money stays in savings)', onclick: async () => {
        const ok = await askChoice(`Remove the goal “${g.name}”? Its money and entries stay.`, [{ label: 'Remove goal', value: 'yes' }]);
        if (ok) this.changeBudget((budget) => { budget.goals = budget.goals.filter((x) => x.account !== g.account); });
      } }, '×');
      return h('section', { class: 'money-card money-goal-card' },
        h('div', { class: 'money-card-head' }, h('h2', null, g.name), remove),
        this.goalRow(g),
        g.by && g.have < g.target ? h('p', { class: 'money-muted money-small' }, this.perMonth(g)) : null,
        form);
    });
    const name = h('input', { class: 'money-input', placeholder: 'What for, e.g. Climbing shoes', 'aria-label': 'Goal name' });
    const target = h('input', { class: 'money-input money-amount', type: 'number', min: '1', placeholder: '0', 'aria-label': 'Target amount' });
    const by = h('input', { class: 'money-input', type: 'month', 'aria-label': 'By (optional)' });
    const form = h('form', { class: 'money-inline money-wrap' }, name, h('span', { class: 'money-muted' }, this.currency), target, h('span', { class: 'money-muted' }, 'by'), by,
      h('button', { class: 'money-add', type: 'submit' }, 'New goal'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = name.value.trim().replace(/:/g, ' ');
      const t = parseFloat(target.value);
      if (!n || !(t > 0)) return;
      this.changeBudget((budget) => { budget.goals.push({ account: `${this.model.p.assets}:Savings:${n}`, target: t, by: by.value || null }); });
    });
    return h('div', { class: 'money-body' },
      h('div', { class: 'money-goal-grid' }, cards.length ? cards : this.emptyHint('No goals yet.')),
      this.card('New goal', h('span', { class: 'money-muted' }, 'a savings account of its own'), form));
  }

  perMonth(g) {
    const [y, mo] = g.by.split('-').map(Number);
    const now = new Date();
    const months = Math.max(1, (y - now.getFullYear()) * 12 + mo - (now.getMonth() + 1) + 1);
    return `${this.money(Math.ceil((g.target - g.have) / months))} a month gets there (${months} month${months === 1 ? '' : 's'} left).`;
  }

  // ---------- Income and history ----------

  incomePage(m) {
    const entries = m.entries.filter((tx) => this.model.kindOf(tx) === 'income');
    return h('div', { class: 'money-body' },
      h('div', { class: 'money-tiles' },
        h('div', { class: 'money-tile' }, h('span', { class: 'money-tile-label' }, 'This month'), h('span', { class: 'money-tile-big' }, this.money(m.incomeTotal))),
        ...m.income.map((r) => h('div', { class: 'money-tile' }, h('span', { class: 'money-tile-label' }, r.name), h('span', { class: 'money-tile-big' }, this.money(r.total)), h('span', { class: 'money-tile-sub' }, `${r.count} ${r.count === 1 ? 'entry' : 'entries'}`)))),
      this.card('Income entries', h('button', { class: 'money-btn', onclick: (e) => this.openAdd(e.currentTarget, { kind: 'income' }) }, '+ Income'),
        entries.length ? entries.map((tx) => this.entryRow(tx)) : this.emptyHint('No income this month.')));
  }

  historyPage(m) {
    const days = new Map();
    for (const tx of m.entries) {
      if (!days.has(tx.date)) days.set(tx.date, []);
      days.get(tx.date).push(tx);
    }
    return h('div', { class: 'money-body' },
      this.card(`Everything in ${monthLabel(this.monthKey)}`, h('span', { class: 'money-muted' }, `${m.entries.length} entries`),
        days.size ? [...days.entries()].map(([date, txs]) => h('div', { class: 'money-day' },
          h('div', { class: 'money-day-label' }, dayLabel(date)),
          txs.map((tx) => this.entryRow(tx)))) : this.emptyHint('Nothing this month.')));
  }

  // ---------- Adding and editing an entry ----------

  // Add (or edit) an entry: type the title and the amount; everything else
  // is picked from buttons.
  openAdd(anchor, { kind = 'spend', edit = null } = {}) {
    this.closePop();
    const model = this.model;
    if (edit && edit.postings.length !== 2) {
      alert('This entry has more than two lines, so it can only be changed in transactions.ledger itself (or deleted here).');
      return;
    }
    const state = { kind: edit ? model.kindOf(edit) : kind };
    if (state.kind === 'transfer' || state.kind === 'save') state.kind = 'move';
    // An entry being edited: the posting with the amount is "into", the
    // balancing one is "out".
    let into = null;
    let out = model.defaultAccount();
    if (edit) {
      const [a, b] = edit.postings;
      const first = state.kind === 'income' ? (model.is(a.account, 'income') ? a : b) : state.kind === 'spend' ? (model.is(a.account, 'expenses') ? a : b) : (a.amount > 0 ? a : b);
      into = state.kind === 'move' ? first.account : model.categoryOf(first.account) === first.account ? first.account : first.account;
      out = (first === a ? b : a).account;
    }
    const title = h('input', { class: 'money-input money-title-in', placeholder: 'Title', 'aria-label': 'Title', value: edit ? edit.payee : '' });
    const amount = h('input', { class: 'money-input money-amount money-amount-big', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: '0.00', 'aria-label': `Amount in ${this.currency}`, value: edit ? String(Math.abs(model.shownAmount(edit))) : '' });

    // Date: Today / Yesterday / a day picked from the calendar.
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    let date = edit ? edit.date : today();
    const picker = h('input', { type: 'date', class: 'money-date-picker', 'aria-label': 'Pick a day', value: date });
    const dateOptions = () => {
      const opts = [{ value: day(0), label: 'Today' }, { value: day(-1), label: 'Yesterday' }];
      if (!opts.some((o) => o.value === date)) opts.push({ value: date, label: new Date(`${date}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) });
      return opts;
    };
    const dateWrap = h('div', { class: 'money-date' });
    const drawDate = () => {
      const chips = this.chips(dateOptions(), date, { label: 'Date', onPick: (v) => { date = v; } });
      const pick = h('button', { type: 'button', class: 'money-chip', onclick: () => (picker.showPicker ? picker.showPicker() : picker.click()) }, 'Pick a day…');
      dateWrap.replaceChildren(chips.el, pick, picker);
    };
    picker.addEventListener('change', () => { if (picker.value) { date = picker.value; drawDate(); } });
    drawDate();

    const intoWrap = h('div', { class: 'money-field' });
    const outWrap = h('div', { class: 'money-field' });
    let intoChips = null;
    let outChips = null;
    const named = (kindOf, name) => {
      const p = model.p;
      if (kindOf === 'spend') return { value: `${p.expenses}:${name}`, label: name, color: this.colorOf(name) };
      if (kindOf === 'income') return { value: `${p.income}:${name}`, label: name };
      if (kindOf === 'move') return { value: `${p.assets}:Savings:${name}`, label: name, color: this.colorOf(name) };
      return { value: `${p.assets}:${name}`, label: name };
    };
    const drawPickers = (keep) => {
      const intoTitle = { spend: 'Category', income: 'Job', move: 'To' }[state.kind];
      const outTitle = { spend: 'Paid from', income: 'Paid into', move: 'From' }[state.kind];
      const intoOptions = this.optionsFor(state.kind);
      if (keep && into && !intoOptions.some((o) => o.value === into)) intoOptions.unshift({ value: into, label: shortName(into).split(':').pop(), color: this.colorOf(shortName(into)) });
      const first = keep && into ? into : (intoOptions.find((o) => !o.suggested) || intoOptions[0] || {}).value;
      intoChips = this.chips(intoOptions, first, { label: intoTitle, onNew: (n) => named(state.kind, n) });
      const outOptions = this.optionsFor('account');
      if (out && !outOptions.some((o) => o.value === out)) outOptions.unshift({ value: out, label: shortName(out) });
      outChips = this.chips(outOptions, out, { label: outTitle, onNew: (n) => named('account', n), onPick: (v) => { out = v; } });
      intoWrap.replaceChildren(h('span', null, intoTitle), intoChips.el);
      outWrap.replaceChildren(h('span', null, outTitle), outChips.el);
    };
    const kindBtn = (id, label) => h('button', { type: 'button', class: `money-kind${state.kind === id ? ' is-on' : ''}`, 'data-kind': id, onclick: () => {
      state.kind = id;
      kinds.querySelectorAll('.money-kind').forEach((b) => b.classList.toggle('is-on', b.dataset.kind === id));
      drawPickers(false);
    } }, label);
    const kinds = h('div', { class: 'money-kinds', role: 'group', 'aria-label': 'Kind' }, kindBtn('spend', 'Spend'), kindBtn('income', 'Income'), kindBtn('move', 'Save / move'));
    drawPickers(Boolean(edit));

    const save = () => {
      const v = parseFloat(amount.value);
      if (!(v > 0)) {
        amount.focus();
        return;
      }
      const target = intoChips.value();
      const from = outChips.value();
      if (!target || !from) return;
      const postings = state.kind === 'income'
        ? [{ account: from, amount: v }, { account: target, amount: null }]
        : [{ account: target, amount: v }, { account: from, amount: null }];
      const entry = { date, payee: title.value.trim() || shortName(target).split(':').pop(), postings };
      if (edit) this.change('transactions', (text) => replaceTransaction(text, edit, entry, this.currency));
      else this.addEntry(entry);
    };
    const pop = h('form', { class: 'money-pop', role: 'dialog', 'aria-label': edit ? 'Edit entry' : 'Add an entry' },
      kinds,
      h('div', { class: 'money-pop-main' },
        title,
        h('label', { class: 'money-amount-wrap' }, h('span', { class: 'money-muted' }, this.currency), amount)),
      intoWrap,
      outWrap,
      h('div', { class: 'money-field' }, h('span', null, 'When'), dateWrap),
      h('div', { class: 'money-inline' },
        h('button', { class: 'money-add', type: 'submit' }, edit ? 'Save' : 'Add'),
        h('button', { class: 'money-btn', type: 'button', onclick: () => this.closePop() }, 'Cancel'),
        edit ? h('button', { class: 'money-btn is-danger', type: 'button', onclick: () => this.deleteEntry(edit) }, 'Delete') : null));
    pop.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });
    this.root.append(pop);
    const box = anchor.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    let left = box.right - host.left - width;
    left = Math.max(8, Math.min(left, host.width - width - 8));
    let top = box.bottom - host.top + 8;
    if (window.innerHeight - box.bottom < height + 16) top = Math.max(8, box.top - host.top - height - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    this.pop = pop;
    const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) this.closePop(); };
    const escape = (e) => { if (e.key === 'Escape') this.closePop(); };
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    document.addEventListener('keydown', escape);
    this.popCleanup = () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
    (edit ? amount : title).focus();
  }

  closePop() {
    const { pop, popCleanup } = this;
    this.pop = null;
    this.popCleanup = null;
    if (pop) pop.remove();
    if (popCleanup) popCleanup();
  }
}
