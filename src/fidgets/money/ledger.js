// Money in plain text, in the format of Ledger (ledger-cli) and the Obsidian
// Ledger plugin, so the same files work in all three.
//
// transactions.ledger (the plugin's default file) — every bit of spending,
// income and moving money between accounts:
//
//   2026-10-06 Woolworths
//       Expenses:Food    $42.10
//       Assets:Everyday
//
// One posting may leave its amount off: it takes whatever balances the rest.
// Entries are separated by a blank line (the plugin needs one).
//
// budget.ledger — the monthly budget, as Ledger's periodic transactions
// (`ledger --budget` reads them). The plugin stops at a "~" line, which is why
// budgets live in their own file:
//
//   ~ Monthly
//       Expenses:Food    $250.00
//       Assets:Budget
//
//   ~ Monthly from 2026-10-01 to 2026-11-01
//       ; moved $30.00 from Subscriptions to Going out
//       Expenses:Going out    $30.00
//       Expenses:Subscriptions    $-30.00
//
// Opal's own extras sit in the budget file as Ledger comments:
//   ; opal-goal: Assets:Savings:Climbing shoes | $220.00 | 2026-11
//   ; opal-rollover: Expenses:Food | 2026-10

const DATE = /^(\d{4})[-/](\d{2})[-/](\d{2})/;

// "$1,240.50", "$-42.10", "-$42.10", "42.10" → { amount, currency } or null.
export function parseAmount(text) {
  const m = /^(-)?\s*([^\d\s.,-]*)\s*(-)?\s*([\d,]*\.?\d+)\s*([A-Za-z]{3})?$/.exec(String(text || '').trim());
  if (!m) return null;
  const value = parseFloat(m[4].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return { amount: m[1] || m[3] ? -value : value, currency: m[2] || m[5] || '' };
}

// The plugin's way of writing an amount: "$42.10", "$-30.00".
export function formatAmount(amount, currency = '$') {
  return `${currency}${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

// A posting line: account, then (after two or more spaces or a tab) an
// amount, an optional "= balance" check, and a comment.
function parsePosting(line) {
  const body = line.replace(/^\s+/, '');
  if (body.startsWith(';') || body.startsWith('#')) return { comment: body.slice(1).trim() };
  const [main, ...comment] = body.split(/\s*;\s*/);
  const m = /^(?:([*!])\s+)?(.+?)(?:(?:\s{2,}|\t)\s*(.*))?$/.exec(main.trimEnd());
  if (!m) return null;
  const amountText = (m[3] || '').split(/\s*=/)[0].trim();
  const amount = amountText ? parseAmount(amountText) : null;
  return {
    account: m[2].trim(),
    amount: amount ? amount.amount : null,
    currency: amount ? amount.currency : '',
    reconciled: m[1] || '',
    comment: comment.join('; ') || '',
  };
}

// Fills in the one posting with no amount (it balances the others).
function balance(postings) {
  const open = postings.filter((p) => p.account && p.amount === null);
  if (open.length === 1) {
    const total = postings.reduce((sum, p) => sum + (p.amount || 0), 0);
    open[0].amount = -Math.round(total * 100) / 100;
    open[0].implied = true;
    open[0].currency = postings.find((p) => p.currency)?.currency || '';
  }
  return postings;
}

// A ledger file → { transactions, periodic, comments }. Every transaction
// remembers its lines (firstLine…lastLine) so it can be edited in place.
export function parseLedger(text) {
  const lines = String(text || '').split(/\r?\n/);
  const transactions = [];
  const periodic = [];
  const comments = [];
  let current = null;
  const close = (end) => {
    if (!current) return;
    current.lastLine = end;
    current.postings = balance(current.postings.filter((p) => p && p.account));
    current.raw = lines.slice(current.firstLine, end + 1).join('\n');
    (current.period ? periodic : transactions).push(current);
    current = null;
  };
  lines.forEach((line, i) => {
    if (current && /^[ \t]+\S/.test(line)) {
      const posting = parsePosting(line);
      if (posting && posting.account) current.postings.push(posting);
      else if (posting && posting.comment) current.notes.push(posting.comment);
      return;
    }
    close(i - 1);
    const date = DATE.exec(line);
    if (date) {
      const rest = line.slice(date[0].length).replace(/^=\S+/, '');
      const m = /^\s+(?:([*!])\s+)?(?:\((\S+)\)\s+)?(.*?)(?:\s+;\s*(.*))?$/.exec(rest) || [];
      current = {
        firstLine: i,
        date: `${date[1]}-${date[2]}-${date[3]}`,
        state: m[1] || '',
        payee: (m[3] || '').trim(),
        comment: m[4] || '',
        postings: [],
        notes: [],
      };
    } else if (/^~\s*/.test(line)) {
      const [head, ...comment] = line.replace(/^~\s*/, '').split(/\s+;\s*/);
      current = { firstLine: i, period: parsePeriod(head), comment: comment.join('; '), postings: [], notes: [] };
    } else if (/^\s*[;#%|*]/.test(line)) {
      comments.push({ line: i, text: line.replace(/^\s*[;#%|*]\s?/, '') });
    }
  });
  close(lines.length - 1);
  return { transactions, periodic, comments };
}

// "Monthly", "Monthly from 2026-10-01 to 2026-11-01" → { every, from, to }
// (from inclusive, to exclusive, as in Ledger).
export function parsePeriod(text) {
  const t = String(text).trim();
  const every = (/^(daily|weekly|monthly|quarterly|yearly|annually)/i.exec(t) || [])[1] || 'monthly';
  const date = (word) => {
    const m = new RegExp(`\\b${word}\\s+(\\d{4})[-/](\\d{2})(?:[-/](\\d{2}))?`, 'i').exec(t);
    return m ? `${m[1]}-${m[2]}-${m[3] || '01'}` : null;
  };
  return { every: every.toLowerCase(), from: date('(?:from|since)'), to: date('(?:to|until)'), text: t };
}

// A transaction as the plugin writes it: the date and payee, then each
// posting indented, the last one with no amount (it balances the rest).
export function formatTransaction({ date, payee, postings }, currency = '$') {
  const lines = postings.map((p, i) => {
    const comment = p.comment ? `    ; ${p.comment}` : '';
    const last = i === postings.length - 1 && postings.length > 1 && p.amount == null;
    return last || p.amount == null
      ? `    ${p.account}${comment}`
      : `    ${p.account}    ${formatAmount(p.amount, p.currency || currency)}${comment}`;
  });
  return [`${date} ${String(payee || 'Untitled').replace(/\s*;.*$/, '').trim() || 'Untitled'}`, ...lines].join('\n');
}

// Adds a transaction at the end of the file, after a blank line.
export function appendTransaction(text, entry, currency) {
  const body = String(text || '').replace(/\s*$/, '');
  return `${body ? `${body}\n\n` : ''}${formatTransaction(entry, currency)}\n`;
}

// Swaps a transaction's lines for another one (or removes it: next = null).
// Found again by its text if the file changed around it.
export function replaceTransaction(text, tx, next, currency) {
  const lines = String(text || '').split(/\r?\n/);
  let first = tx.firstLine;
  if (lines.slice(first, tx.lastLine + 1).join('\n') !== tx.raw) {
    const at = lines.join('\n').indexOf(tx.raw);
    if (at === -1) throw new Error('That entry was changed somewhere else. The page has been refreshed — try again.');
    first = lines.join('\n').slice(0, at).split('\n').length - 1;
  }
  const count = tx.raw.split('\n').length;
  let remove = count;
  if (!next && lines[first + count] === '' && (first === 0 || lines[first - 1] === '')) remove++;
  lines.splice(first, remove, ...(next ? formatTransaction(next, currency).split('\n') : []));
  return lines.join('\n');
}

// ---------- The budget file ----------

// → { limits: { account: amount }, moves: [{ month, from, to, amount, tx }],
//     goals: [{ account, target, by }], rollover: { account: sinceMonth } }
export function parseBudget(text) {
  const { periodic, comments } = parseLedger(text);
  const base = {};
  const moves = [];
  for (const block of periodic) {
    if (block.period.every !== 'monthly') continue;
    const amounts = block.postings.filter((p) => p.account.split(':')[0] !== 'Assets' || block.period.from);
    if (!block.period.from && !block.period.to) {
      for (const p of amounts) if (!p.implied) base[p.account] = (base[p.account] || 0) + p.amount;
    } else {
      moves.push({ from: block.period.from, to: block.period.to, postings: block.postings.filter((p) => !p.implied), note: block.notes.join(' '), tx: block });
    }
  }
  const goals = [];
  const rollover = {};
  for (const c of comments) {
    const goal = /^opal-goal:\s*(.+?)\s*\|\s*([^|]+?)\s*(?:\|\s*(\d{4}-\d{2}))?\s*$/.exec(c.text);
    if (goal) goals.push({ account: goal[1], target: (parseAmount(goal[2]) || { amount: 0 }).amount, by: goal[3] || null, line: c.line });
    const roll = /^opal-rollover:\s*(.+?)\s*\|\s*(\d{4}-\d{2})\s*$/.exec(c.text);
    if (roll) rollover[roll[1]] = roll[2];
  }
  return { limits: base, moves, goals, rollover };
}

// The whole budget file, written out again from its parts.
export function formatBudget({ limits, moves, goals, rollover }, currency = '$') {
  const out = [
    '; Monthly budget, in Ledger’s budget format (ledger --budget reads it).',
    '; Opal’s Money page keeps this file; spending is in transactions.ledger.',
    '',
  ];
  const accounts = Object.keys(limits).filter((a) => limits[a] != null);
  if (accounts.length) {
    out.push('~ Monthly');
    for (const a of accounts) out.push(`    ${a}    ${formatAmount(limits[a], currency)}`);
    out.push('    Assets:Budget', '');
  }
  for (const move of moves) {
    out.push(`~ Monthly from ${move.from}${move.to ? ` to ${move.to}` : ''}`);
    if (move.note) out.push(`    ; ${move.note}`);
    for (const p of move.postings) out.push(`    ${p.account}    ${formatAmount(p.amount, p.currency || currency)}`);
    out.push('');
  }
  for (const g of goals) out.push(`; opal-goal: ${g.account} | ${formatAmount(g.target, currency)}${g.by ? ` | ${g.by}` : ''}`);
  for (const [account, since] of Object.entries(rollover)) out.push(`; opal-rollover: ${account} | ${since}`);
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}
