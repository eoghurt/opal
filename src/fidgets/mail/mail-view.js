// Mail (design A): a rail of mailboxes (People, Updates, Saved), a switch
// between accounts, the message list on the left and the open email on the
// right, with Save to vault. Right-click or double-click a message for its menu.
//
// Reading only for now (0.12); writing and replying come in 0.13 — Reply opens
// the thread in Gmail until then.
//
//   new MailView(container, { box, account, io })
//   io: the window.opal.mail functions, plus openNote(path), openWeb(url),
//       onChange({ box, account })

import { h, icon, askName } from '../../ui.js';
import { menuOn } from '../../context-menu.js';
import { sanitizeHtml } from '../../viewers/sanitize.js';
import { toMarkdown, textToMarkdown } from './markdown.js';

const RAIL = [['people', 'People', 'user'], ['updates', 'Updates', 'megaphone'], ['saved', 'Saved', 'bookmark']];
const FILTERS = [['all', 'All'], ['unread', 'Unread'], ['attachments', 'Attachments']];
const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function when(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = (now - d) / 86400000;
  if (days < 6) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function longWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const person = (a) => (a ? a.name || a.address : '');
const fullPerson = (a) => (a ? (a.name && a.address ? `${a.name} <${a.address}>` : a.address || a.name) : '');

export class MailView {
  constructor(container, { box, account, io }) {
    this.container = container;
    this.io = io;
    this.box = RAIL.some(([id]) => id === box) ? box : 'people';
    this.account = account || 'all';
    this.filter = 'all';
    this.query = '';
    this.messages = [];
    this.saved = [];
    this.openId = null;
    this.open = null; // the parsed message on show
    this.syncing = false;
    this.problem = '';
    this.root = h('div', { class: 'deb mail' });
    container.replaceChildren(this.root);
    this.root.append(h('p', { class: 'deb-muted' }, 'Opening your mail…'));
    this.load();
  }

  destroy() {
    this.gone = true;
  }

  async load() {
    try {
      this.status = await this.io.status();
      [this.messages, this.saved] = await Promise.all([this.io.list(), this.io.saved()]);
    } catch (err) {
      this.root.replaceChildren(h('p', { class: 'deb-empty' }, `Couldn't open Mail: ${err.message}`));
      return;
    }
    if (!this.status.accounts.some((a) => a.id === this.account)) this.account = 'all';
    this.render();
    if (this.status.accounts.length) this.sync();
  }

  async sync() {
    if (this.syncing) return;
    this.syncing = true;
    this.render();
    try {
      const result = await this.io.sync();
      this.messages = result.messages;
      this.problem = result.problems.join(' ');
      this.status = await this.io.status();
    } catch (err) {
      this.problem = err.message;
    }
    this.syncing = false;
    if (!this.gone) this.render();
  }

  go(change) {
    Object.assign(this, change);
    if (this.io.onChange) this.io.onChange({ box: this.box, account: this.account });
    this.render();
  }

  // ---------- What's shown ----------

  accountColor(id) {
    const i = this.status.accounts.findIndex((a) => a.id === id);
    return `var(--c${(Math.max(0, i) % 5) + 1})`;
  }

  inAccount() {
    return this.messages.filter((m) => this.account === 'all' || m.account === this.account);
  }

  visible() {
    const q = this.query.trim().toLowerCase();
    return this.inAccount().filter((m) => m.box === this.box)
      .filter((m) => this.filter === 'all' || (this.filter === 'unread' ? m.unread : m.attachments))
      .filter((m) => !q || `${m.subject} ${person(m.from)} ${m.from.address} ${m.snippet || ''}`.toLowerCase().includes(q));
  }

  savedPath(messageId) {
    const hit = messageId && this.saved.find((s) => s.messageId === messageId);
    return hit ? hit.path : null;
  }

  render() {
    if (this.gone) return;
    const unread = (box) => this.inAccount().filter((m) => m.box === box && m.unread).length;
    const rail = h('nav', { class: 'deb-rail', 'aria-label': 'Mailboxes' },
      RAIL.map(([id, label, ic]) => {
        const n = id === 'saved' ? 0 : unread(id);
        return h('button', {
          type: 'button',
          class: `deb-rail-btn${this.box === id ? ' is-on' : ''}`,
          'aria-current': this.box === id ? 'page' : null,
          onclick: () => this.go({ box: id }),
        }, icon(ic, 20), h('span', null, label), n ? h('span', { class: 'mail-rail-count' }, String(n)) : null);
      }));
    let main;
    if (!this.status.accounts.length) main = this.signInPage();
    else if (this.box === 'saved') main = this.savedPage();
    else main = this.boxPage();
    this.root.replaceChildren(rail, h('main', { class: 'deb-main mail-main' }, main));
  }

  head(kicker, title, actions) {
    return h('div', { class: 'deb-head' },
      h('div', { class: 'deb-title' }, h('span', { class: 'deb-kicker' }, kicker), h('h1', { class: 'deb-h1 sch-h1' }, title)),
      actions ? h('div', { class: 'deb-actions' }, actions) : null);
  }

  accountSwitch() {
    const accounts = this.status.accounts;
    const pick = (id, label, color) => {
      const b = h('button', { type: 'button', class: this.account === id ? 'is-on' : '', onclick: () => this.go({ account: id }) },
        color ? h('span', { class: 'mail-dot', style: `background: ${color}`, 'aria-hidden': 'true' }) : null, label);
      if (id !== 'all') menuOn(b, () => this.accountMenu(accounts.find((a) => a.id === id)));
      return b;
    };
    return h('div', { class: 'sch-seg mail-accounts', role: 'group', 'aria-label': 'Account' },
      accounts.length > 1 ? pick('all', 'All') : null,
      accounts.map((a) => pick(a.id, a.label, this.accountColor(a.id))),
      h('button', { type: 'button', 'aria-label': 'Add an account', title: 'Add an account', onclick: () => this.addAccount() }, '+'));
  }

  accountMenu(a) {
    return {
      title: a.email,
      items: [
        { label: 'Rename…', onSelect: async () => {
          const name = await askName(`Call ${a.email}`, 'e.g. School', a.label);
          if (name) { this.status.accounts = await this.io.renameAccount(a.id, name); this.render(); }
        } },
        a.needsSignIn ? { label: 'Sign in again', onSelect: () => this.addAccount() } : null,
        'separator',
        { label: 'Sign out of this account', danger: true, onSelect: async () => {
          this.status.accounts = await this.io.removeAccount(a.id);
          this.messages = this.messages.filter((m) => m.account !== a.id);
          if (this.account === a.id) this.account = 'all';
          this.render();
        } },
      ],
    };
  }

  async addAccount() {
    this.problem = 'Finish signing in in your browser…';
    this.render();
    try {
      this.status.accounts = await this.io.addAccount();
      this.problem = '';
      this.render();
      this.sync();
    } catch (err) {
      this.problem = err.message;
      this.render();
    }
  }

  boxPage() {
    const accountName = this.account === 'all' ? (this.status.accounts.length > 1 ? 'ALL ACCOUNTS' : this.status.accounts[0].email.toUpperCase())
      : (this.status.accounts.find((a) => a.id === this.account) || {}).label.toUpperCase();
    const unread = this.inAccount().filter((m) => m.box === this.box && m.unread).length;
    const title = unread ? `${unread} unread.` : 'All read.';
    const head = this.head(`${this.box === 'people' ? 'PEOPLE' : 'UPDATES'} · ${accountName}`, title, [
      this.accountSwitch(),
      h('button', { type: 'button', class: 'deb-btn', disabled: this.syncing || null, onclick: () => this.sync() }, this.syncing ? 'Checking…' : 'Refresh'),
    ]);
    const list = this.visible();
    const search = h('input', {
      class: 'mail-search', type: 'search', placeholder: 'Search', 'aria-label': 'Search mail', value: this.query,
      oninput: (e) => { this.query = e.target.value; this.drawRows(); },
    });
    this.rowsEl = h('div', { class: 'mail-rows' });
    const listCard = h('section', { class: 'deb-card mail-list', 'aria-label': this.box === 'people' ? 'People' : 'Updates' },
      h('div', { class: 'mail-tools' },
        h('div', { class: 'sch-seg', role: 'group', 'aria-label': 'Show' }, FILTERS.map(([id, label]) => h('button', {
          type: 'button', class: this.filter === id ? 'is-on' : '', onclick: () => this.go({ filter: id }),
        }, label))),
        search),
      this.rowsEl);
    this.drawRows(list);
    const open = this.open && list.some((m) => m.id === this.openId) ? this.reader() : this.emptyReader(list.length);
    return [
      head,
      this.problem ? h('p', { class: 'mail-problem' }, this.problem) : null,
      h('div', { class: 'mail-body' }, listCard, open),
    ];
  }

  drawRows(list = this.visible()) {
    if (!this.rowsEl) return;
    if (!list.length) {
      this.rowsEl.replaceChildren(h('p', { class: 'deb-empty mail-none' }, this.syncing && !this.messages.length ? 'Fetching your inbox…' : this.query ? 'Nothing matches.' : 'Nothing here.'));
      return;
    }
    this.rowsEl.replaceChildren(...list.map((m) => {
      const row = h('button', {
        type: 'button',
        class: `mail-row${m.unread ? ' is-unread' : ''}${m.id === this.openId ? ' is-on' : ''}`,
        'data-id': m.id,
        onclick: () => this.openMessage(m.id),
      },
      h('span', { class: 'mail-unread', 'aria-label': m.unread ? 'Unread' : null }),
      h('span', { class: 'mail-from' }, person(m.from) || '(no sender)'),
      h('span', { class: 'mail-when' },
        m.attachments ? h('span', { class: 'mail-clip', 'aria-label': 'Has attachments' }, icon('paperclip', 13)) : null,
        this.status.accounts.length > 1 ? h('span', { class: 'mail-dot is-small', style: `background: ${this.accountColor(m.account)}`, 'aria-hidden': 'true' }) : null,
        when(m.date)),
      h('span', { class: 'mail-subject' }, m.subject),
      m.snippet ? h('span', { class: 'mail-snippet' }, m.snippet) : null);
      menuOn(row, () => this.messageMenu(m));
      return row;
    }));
  }

  messageMenu(m) {
    const saved = this.savedPath(m.messageId);
    return {
      title: person(m.from),
      items: [
        { label: 'Open', onSelect: () => this.openMessage(m.id) },
        { label: 'Reply in Gmail', hint: 'replying in Opal: 0.13', onSelect: () => this.io.openInGmail(m.id) },
        m.unread
          ? { label: 'Mark as read', onSelect: () => this.setRead(m, true) }
          : { label: 'Mark as unread', onSelect: () => this.setRead(m, false) },
        saved
          ? { label: 'Open the saved note', onSelect: () => this.io.openNote(saved) }
          : { label: 'Save to vault', onSelect: () => this.saveMessage(m.id) },
        m.box === 'people'
          ? { label: 'Move to Updates', hint: 'everything from this sender', onSelect: () => this.setBox(m, 'updates') }
          : { label: 'Move to People', hint: 'everything from this sender', onSelect: () => this.setBox(m, 'people') },
        'separator',
        { label: 'Archive', onSelect: () => this.moveOut(m, 'archive') },
        { label: 'Delete', hint: 'to Gmail’s Bin', danger: true, onSelect: () => this.moveOut(m, 'trash') },
      ],
    };
  }

  // ---------- Acting on messages ----------

  async run(job) {
    try {
      await job();
      this.problem = '';
    } catch (err) {
      this.problem = err.message;
    }
    this.render();
  }

  setRead(m, read) {
    return this.run(async () => {
      await this.io.setRead([m.id], read);
      m.unread = !read;
    });
  }

  setBox(m, box) {
    return this.run(async () => {
      await this.io.setBox(m.id, box);
      this.messages = await this.io.list();
    });
  }

  moveOut(m, where) {
    return this.run(async () => {
      await (where === 'trash' ? this.io.trash(m.id) : this.io.archive(m.id));
      this.messages = this.messages.filter((x) => x.id !== m.id);
      if (this.openId === m.id) {
        this.openId = null;
        this.open = null;
      }
    });
  }

  async openMessage(id) {
    this.openId = id;
    this.open = { loading: true };
    this.render();
    try {
      const message = await this.io.open(id);
      if (this.openId !== id) return;
      this.open = message;
      const m = this.messages.find((x) => x.id === id);
      if (m && m.unread) {
        m.unread = false;
        this.io.setRead([id], true).catch(() => {});
      }
      if (m && !m.snippet && message.text) m.snippet = message.text.replace(/\s+/g, ' ').trim().slice(0, 140);
    } catch (err) {
      if (this.openId !== id) return;
      this.open = { error: err.message };
    }
    this.render();
  }

  // The body as page elements: the sanitised HTML, or the plain text.
  bodyOf(message) {
    if (message.html) return sanitizeHtml(message.html);
    const fragment = document.createDocumentFragment();
    for (const para of String(message.text || '').split(/\n{2,}/)) {
      if (!para.trim()) continue;
      const p = document.createElement('p');
      p.textContent = para;
      fragment.append(p);
    }
    return fragment;
  }

  async saveMessage(id) {
    return this.run(async () => {
      const message = this.open && this.openId === id && !this.open.loading ? this.open : await this.io.open(id);
      let markdown;
      if (message.html) {
        const pictures = new Map(message.attachments.filter((a) => a.inline && a.dataUrl).map((a) => [a.dataUrl, a.index]));
        markdown = toMarkdown(sanitizeHtml(message.html), pictures);
      } else {
        markdown = textToMarkdown(message.text);
      }
      await this.io.save(id, markdown);
      this.saved = await this.io.saved();
    });
  }

  emptyReader(count) {
    return h('article', { class: 'deb-card mail-reader is-empty' },
      h('p', { class: 'deb-empty' }, count ? 'Pick a message to read it.' : ''));
  }

  reader() {
    const m = this.open;
    if (m.loading) return h('article', { class: 'deb-card mail-reader' }, h('p', { class: 'deb-muted' }, 'Opening…'));
    if (m.error) return h('article', { class: 'deb-card mail-reader' }, h('p', { class: 'deb-empty' }, `Couldn't open that message: ${m.error}`));
    const saved = this.savedPath(m.messageId);
    const action = saved
      ? h('div', { class: 'mail-saved' },
        h('span', { class: 'mail-saved-tick' }, icon('check', 14), 'Saved'),
        h('button', { type: 'button', class: 'deb-btn', onclick: () => this.io.openNote(saved) }, 'Open note'))
      : h('button', { type: 'button', class: 'deb-btn is-primary', onclick: () => this.saveMessage(this.openId) }, 'Save to vault');
    const account = this.status.accounts.find((a) => a.id === m.account);
    const line = (label, value) => (value ? h('div', { class: 'mail-meta-row' }, h('span', { class: 'mail-meta-label' }, label), h('span', null, value)) : null);
    const body = h('div', { class: 'mail-text' }, this.bodyOf(m));
    // Links inside the email open in the browser (the sanitiser keeps only the address).
    body.addEventListener('click', (event) => {
      const link = event.target.closest('a.doc-link');
      if (link && link.title) {
        event.preventDefault();
        this.io.openWeb(link.title);
      }
    });
    const files = m.attachments.filter((a) => !a.inline);
    return h('article', { class: 'deb-card mail-reader' },
      h('div', { class: 'mail-reader-head' }, h('h2', { class: 'mail-reader-title' }, m.subject), action),
      h('div', { class: 'mail-meta' },
        line('From', fullPerson(m.from)),
        line('To', [m.to.map(fullPerson).join(', '), account && this.status.accounts.length > 1 ? `· ${account.label}` : ''].filter(Boolean).join(' ')),
        line('Cc', m.cc.map(fullPerson).join(', ')),
        line('Date', m.date ? longWhen(m.date) : '')),
      m.remoteImages ? h('p', { class: 'mail-blocked' }, icon('photoOff', 15), `${m.remoteImages} picture${m.remoteImages === 1 ? '' : 's'} from the web ${m.remoteImages === 1 ? 'is' : 'are'} blocked.`) : null,
      body,
      files.length ? h('div', { class: 'mail-files' }, files.map((f) => h('span', { class: 'mail-file', title: saved ? 'Saved beside the note' : 'Saved beside the note when you save' },
        icon('paperclip', 14), f.filename || 'Attachment', h('small', null, size(f.size))))) : null);
  }

  // ---------- Saved and sign-in pages ----------

  savedPage() {
    return [
      this.head('SAVED · IN MAIL/', this.saved.length ? `${this.saved.length} saved.` : 'Nothing saved yet.', null),
      h('section', { class: 'deb-card mail-list mail-saved-list', 'aria-label': 'Saved emails' },
        this.saved.length ? this.saved.map((s) => h('button', { type: 'button', class: 'mail-row', onclick: () => this.io.openNote(s.path) },
          h('span'),
          h('span', { class: 'mail-from' }, s.from.replace(/\s*<[^>]*>$/, '') || '(no sender)'),
          h('span', { class: 'mail-when' }, s.date ? when(s.date) : ''),
          h('span', { class: 'mail-subject' }, s.name.replace(/^\d{4}-\d{2}-\d{2} /, ''))))
          : h('p', { class: 'deb-empty mail-none' }, 'Press Save to vault on an email and it shows up here, as a note in Mail/.')),
    ];
  }

  signInPage() {
    const configured = this.status.configured;
    const step = (n, text, small) => h('div', { class: 'mail-step' }, h('span', { class: 'mail-step-n' }, String(n)), h('div', null, text, h('small', null, small)));
    return [
      this.head('MAIL · NOT CONNECTED', 'Bring in your mail.', null),
      h('p', { class: 'mail-lead' }, 'Opal reads your Gmail inbox. Your mail stays on Google; nothing reaches your notes until you press Save on an email.'),
      h('div', { class: 'deb-actions' },
        h('button', { type: 'button', class: 'deb-btn is-primary', disabled: configured ? null : true, onclick: () => this.addAccount() }, 'Sign in with Google')),
      this.problem ? h('p', { class: 'mail-problem' }, this.problem) : null,
      h('section', { class: 'deb-card mail-steps' },
        h('div', { class: 'deb-card-head' }, h('h2', null, 'What happens')),
        step(1, 'Your browser opens Google’s sign-in page.', 'You type your password there, never in Opal.'),
        step(2, 'Google asks you to let Opal use your mail.', 'Opal only reads it for now; writing comes in a later version.'),
        step(3, 'You’re sent back here and the inbox appears.', 'The sign-in is kept encrypted on this Mac, never in your vault.')),
      configured ? null : h('section', { class: 'deb-card mail-setup' },
        h('div', { class: 'deb-card-head' }, h('h2', null, 'Setup needed first')),
        h('p', null, 'Opal needs a Google sign-in client, made once in Google Cloud Console and saved as mail-client.json:'),
        h('ol', { class: 'mail-setup-steps' },
          h('li', null, 'At console.cloud.google.com, make a project and turn on the Gmail API.'),
          h('li', null, 'Google Auth Platform › Branding: app name Opal, your address. Audience: External, then add yourself as a test user.'),
          h('li', null, 'Clients › Create client › Desktop app. Download its JSON file.'),
          h('li', null, 'Rename it mail-client.json and put it in Opal’s settings folder (button below), then come back here.')),
        h('div', { class: 'deb-actions' },
          h('button', { type: 'button', class: 'deb-btn', onclick: () => this.io.revealSetup() }, 'Show the settings folder'),
          h('button', { type: 'button', class: 'deb-btn', onclick: () => this.load() }, 'I’ve added it'))),
    ];
  }
}
