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
import { parseLedger, parseBudget, formatBudget, appendTransaction, replaceTransaction, formatAmount, parseAmount } from './ledger.js';
import { MoneyModel, monthOf, shiftMonth, shortName, budgetHints } from './model.js';

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
        this.changeBudget((budget) => {
          if (Number.isFinite(v) && v > 0) budget.limits[b.account] = v;
          else delete budget.limits[b.account];
        });
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
        h('button', { class: 'money-btn', onclick: () => this.moveForm.prefill(b.account) }, 'Move…'));
    });

    // Add a category.
    const newName = h('input', { class: 'money-input', placeholder: 'New category, e.g. Gifts', 'aria-label': 'New category name' });
    const newAmount = h('input', { class: 'money-input money-amount', type: 'number', min: '0', placeholder: '0', 'aria-label': 'Its monthly budget' });
    const addCategory = h('form', { class: 'money-inline' }, newName, h('span', { class: 'money-muted' }, this.currency), newAmount,
      h('button', { class: 'money-btn', type: 'submit' }, 'Add category'));
    addCategory.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = newName.value.trim().replace(/:/g, ' ');
      const v = parseFloat(newAmount.value);
      if (!name) return;
      this.changeBudget((budget) => { budget.limits[`${this.model.p.expenses}:${name}`] = Number.isFinite(v) && v > 0 ? v : 0.01; });
    });

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
        this.quickAdd(),
        days.size ? [...days.entries()].map(([date, txs]) => h('div', { class: 'money-day' },
          h('div', { class: 'money-day-label' }, dayLabel(date)),
          txs.map((tx) => this.entryRow(tx)))) : this.emptyHint('Nothing this month.')));
  }

  // "Boost juice 8.90 food" → a spending entry.
  parseQuick(text) {
    const words = text.trim().split(/\s+/);
    const at = words.findIndex((w) => parseAmount(w.replace(/^\$/, '')) && /\d/.test(w));
    if (at === -1) return null;
    const amount = Math.abs(parseAmount(words[at].replace(/^\$/, '')).amount);
    const payee = words.slice(0, at).join(' ');
    const rest = words.slice(at + 1).join(' ').toLowerCase();
    const cats = this.model.categories();
    const category = rest
      ? cats.find((c) => shortName(c).toLowerCase() === rest) || cats.find((c) => shortName(c).toLowerCase().startsWith(rest)) || `${this.model.p.expenses}:${rest.replace(/^./, (c) => c.toUpperCase())}`
      : cats[0] || `${this.model.p.expenses}:Other`;
    return { date: today(), payee: payee || shortName(category), postings: [{ account: category, amount }, { account: this.model.defaultAccount(), amount: null }] };
  }

  quickAdd() {
    const input = h('input', { class: 'money-input money-quick', placeholder: 'Quick add: what, how much, category — e.g. Boost juice 8.90 food', 'aria-label': 'Quick add' });
    const form = h('form', { class: 'money-inline' }, input, h('button', { class: 'money-add', type: 'submit' }, 'Add'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const entry = this.parseQuick(input.value);
      if (!entry) {
        input.setCustomValidity('Put an amount in, e.g. “Lunch 12.50 food”.');
        input.reportValidity();
        return;
      }
      this.addEntry(entry);
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
    return form;
  }

  // ---------- Adding and editing an entry ----------

  openAdd(anchor, { kind = 'spend', edit = null } = {}) {
    this.closePop();
    const model = this.model;
    const two = edit && edit.postings.length === 2;
    if (edit && !two) {
      alert('This entry has more than two lines, so it can only be changed in transactions.ledger itself (or deleted here).');
      return;
    }
    const state = { kind: edit ? model.kindOf(edit) : kind };
    if (state.kind === 'transfer' || state.kind === 'save') state.kind = 'move';
    const p = model.p;
    const listId = `money-accounts-${Math.random().toString(36).slice(2, 7)}`;
    const payeeList = `${listId}-p`;
    const what = h('input', { class: 'money-input', placeholder: 'What', list: payeeList, 'aria-label': 'What', value: edit ? edit.payee : '' });
    const amount = h('input', { class: 'money-input money-amount', type: 'number', step: '0.01', min: '0', placeholder: '0.00', 'aria-label': 'Amount', value: edit ? String(Math.abs(model.shownAmount(edit))) : '' });
    const date = h('input', { class: 'money-input', type: 'date', 'aria-label': 'Date', value: edit ? edit.date : today() });
    const into = h('input', { class: 'money-input', list: listId, 'aria-label': 'Category' });
    const out = h('input', { class: 'money-input', list: listId, 'aria-label': 'Account', value: model.defaultAccount() });
    const intoLabel = h('span');
    const outLabel = h('span');
    if (edit) {
      // The posting with the amount is "into"; the balancing one is "out".
      const [a, b] = edit.postings;
      const first = state.kind === 'income' ? (model.is(a.account, 'income') ? a : b) : state.kind === 'spend' ? (model.is(a.account, 'expenses') ? a : b) : (a.amount > 0 ? a : b);
      into.value = first.account;
      out.value = (first === a ? b : a).account;
    }
    const kindBtn = (id, label) => h('button', { type: 'button', class: `money-kind${state.kind === id ? ' is-on' : ''}`, 'data-kind': id, onclick: () => { state.kind = id; sync(true); } }, label);
    const kinds = h('div', { class: 'money-kinds', role: 'group', 'aria-label': 'Kind' }, kindBtn('spend', 'Spend'), kindBtn('income', 'Income'), kindBtn('move', 'Move / save'));
    const sync = (reset) => {
      kinds.querySelectorAll('.money-kind').forEach((b) => b.classList.toggle('is-on', b.dataset.kind === state.kind));
      if (state.kind === 'spend') {
        intoLabel.textContent = 'Category';
        outLabel.textContent = 'Paid from';
        if (reset) into.value = model.categories()[0] || `${p.expenses}:Food`;
      } else if (state.kind === 'income') {
        intoLabel.textContent = 'Job';
        outLabel.textContent = 'Paid into';
        if (reset) into.value = model.allAccounts().find((a) => model.is(a, 'income')) || `${p.income}:Work`;
      } else {
        intoLabel.textContent = 'To';
        outLabel.textContent = 'From';
        if (reset) into.value = model.goals()[0]?.account || `${p.assets}:Savings`;
      }
      into.setAttribute('aria-label', intoLabel.textContent);
      out.setAttribute('aria-label', outLabel.textContent);
    };
    if (!edit) sync(true);
    else sync(false);
    const save = () => {
      const v = parseFloat(amount.value);
      if (!(v > 0)) {
        amount.focus();
        return;
      }
      const account = (s) => s.trim().replace(/\s*:\s*/g, ':');
      let postings;
      if (state.kind === 'income') postings = [{ account: account(out.value), amount: v }, { account: account(into.value), amount: null }];
      else postings = [{ account: account(into.value), amount: v }, { account: account(out.value), amount: null }];
      const entry = { date: date.value || today(), payee: what.value.trim() || shortName(account(into.value)), postings };
      if (edit) this.change('transactions', (text) => replaceTransaction(text, edit, entry, this.currency));
      else this.addEntry(entry);
    };
    const pop = h('form', { class: 'money-pop', role: 'dialog', 'aria-label': edit ? 'Edit entry' : 'Add an entry' },
      h('datalist', { id: listId }, model.allAccounts().map((a) => h('option', { value: a }))),
      h('datalist', { id: payeeList }, model.payees().map((a) => h('option', { value: a }))),
      kinds,
      h('label', { class: 'money-field' }, h('span', null, 'What'), what),
      h('div', { class: 'money-inline' },
        h('label', { class: 'money-field' }, h('span', null, 'Amount'), h('span', { class: 'money-inline' }, h('span', { class: 'money-muted' }, this.currency), amount)),
        h('label', { class: 'money-field' }, h('span', null, 'Date'), date)),
      h('label', { class: 'money-field' }, intoLabel, into),
      h('label', { class: 'money-field' }, outLabel, out),
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
    const room = window.innerHeight - box.bottom;
    if (room < height + 16) top = Math.max(8, box.top - host.top - height - 8);
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
    (edit ? amount : what).focus();
  }

  closePop() {
    const { pop, popCleanup } = this;
    this.pop = null;
    this.popCleanup = null;
    if (pop) pop.remove();
    if (popCleanup) popCleanup();
  }
}
