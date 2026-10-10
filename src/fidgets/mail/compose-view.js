// Writing an email (design A: it takes the reader's place). To, Cc, Bcc,
// Subject, the body in Opal's markdown editor, the quoted original folded
// underneath, attachments from the vault or Finder, and Send.
//
// Everything typed is kept as a draft in Opal's settings folder (mail:draft-update)
// as you go, so closing Opal or a failed send loses nothing. The email only
// goes when the Send button is clicked — there is no shortcut and no other way.
// More than 10 people: the button first shows everyone it will go to, and a
// second click sends.
//
//   new ComposeView(container, { draft, account, accounts, io, onClose, onSent })
//   (accounts: the signed-in ones, for the From picker)
//   io: the window.opal.mail functions, plus vaultFiles() → [{ path, name }]

import { h, icon } from '../../ui.js';
import { MarkdownEditor } from '../../editors/markdown-editor.js';
import { toggleWrap, toggleLinePrefix, insertWebLink } from '../../editors/markdown-live.js';

const MODES = { new: 'NEW EMAIL', reply: 'REPLY', all: 'REPLY ALL', forward: 'FORWARD' };
const SAVE_DELAY_MS = 400;

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// "A <a@b>, c@d" → ['A <a@b>', 'c@d'] (commas inside quotes stay put).
function splitList(text) {
  return String(text || '').split(/[,;\n]+(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((s) => s.trim()).filter(Boolean);
}

const looksLikeAddress = (s) => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(s) || /<[^\s<>@]+@[^\s<>@]+>\s*$/.test(s);

export class ComposeView {
  constructor(container, { draft, account, accounts, io, onClose, onSent }) {
    this.container = container;
    this.draft = draft;
    this.account = account;
    this.accounts = accounts || (account ? [account] : []);
    this.io = io;
    this.onClose = onClose;
    this.onSent = onSent;
    this.sending = false;
    this.check = null; // { count, recipients } while asking about more than 10
    this.showQuote = false;
    this.showCc = !!(draft.cc || draft.bcc);
    this.saveTimer = null;
    this.saving = Promise.resolve();
    this.render();
  }

  destroy() {
    clearTimeout(this.saveTimer);
    if (this.editor) {
      this.draft.body = this.editor.getText();
      this.editor.destroy();
      this.editor = null;
    }
    if (this.picker) this.picker.remove();
  }

  // ---------- Keeping the draft ----------

  fields() {
    for (const key of ['to', 'cc', 'bcc']) if (this.chips[key]) this.draft[key] = this.chips[key].value();
    this.draft.subject = this.subjectEl ? this.subjectEl.value : this.draft.subject;
    if (this.editor) this.draft.body = this.editor.getText();
    return { id: this.draft.id, account: this.draft.account, to: this.draft.to, cc: this.draft.cc, bcc: this.draft.bcc, subject: this.draft.subject, body: this.draft.body, quote: this.draft.quote };
  }

  changed() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DELAY_MS);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    const fields = this.fields();
    this.saving = this.saving.then(() => this.io.updateDraft(fields)).catch(() => {});
    return this.saving;
  }

  // ---------- Drawing ----------

  render() {
    if (this.editor) {
      this.draft.body = this.editor.getText();
      this.editor.destroy();
      this.editor = null;
    }
    this.chips = {};
    const d = this.draft;
    const head = h('div', { class: 'compose-head' },
      h('span', { class: 'deb-kicker' }, MODES[d.mode] || 'EMAIL'),
      h('button', { type: 'button', class: 'compose-close', 'aria-label': 'Close (kept until you send or discard it)', title: 'Close — kept until you send or discard it', onclick: () => this.close() }, icon('x', 15)));
    const problem = d.error ? h('div', { class: 'compose-error', role: 'alert' }, h('b', null, 'Not sent. '), d.error, ' Everything you wrote is still here, and kept on this Mac.') : null;

    // From: which account it goes out of (a reply starts on the one it came to).
    const from = h('label', { class: 'compose-field' }, h('span', { class: 'compose-label' }, 'From'),
      this.accounts.length > 1
        ? h('select', {
          class: 'compose-from', 'aria-label': 'Send from',
          onchange: (e) => {
            this.draft.account = e.target.value;
            this.account = this.accounts.find((a) => a.id === e.target.value) || this.account;
            this.changed();
          },
        }, this.accounts.map((a) => h('option', { value: a.id, selected: a.id === d.account || null }, `${a.label} · ${a.email}`)))
        : h('span', { class: 'compose-from-one' }, this.account ? `${this.account.label} · ${this.account.email}` : ''));
    const to = this.chipField('to', 'To');
    const ccToggle = this.showCc ? null : h('button', { type: 'button', class: 'compose-link', onclick: () => { this.fields(); this.showCc = true; this.render(); } }, 'Cc / Bcc');
    to.append(ccToggle || '');
    const cc = this.showCc ? this.chipField('cc', 'Cc') : null;
    const bcc = this.showCc ? this.chipField('bcc', 'Bcc') : null;
    this.subjectEl = h('input', { class: 'compose-subject', 'aria-label': 'Subject', placeholder: 'Subject', value: d.subject, oninput: () => this.changed() });
    const subject = h('label', { class: 'compose-field' }, h('span', { class: 'compose-label' }, 'Subject'), this.subjectEl);

    const bodyEl = h('div', { class: 'compose-body' });
    const tool = (label, ic, run) => h('button', { type: 'button', class: 'compose-tool', 'aria-label': label, title: label, onmousedown: (e) => e.preventDefault(), onclick: () => this.editor && run(this.editor.view) }, ic);
    const tools = h('div', { class: 'compose-tools', role: 'toolbar', 'aria-label': 'Formatting' },
      tool('Bold', h('b', null, 'B'), (v) => toggleWrap(v, '**')),
      tool('Italic', h('i', null, 'I'), (v) => toggleWrap(v, '*')),
      tool('Link', icon('link', 16), (v) => insertWebLink(v)),
      tool('Bullet list', icon('listBullet', 16), (v) => toggleLinePrefix(v, '- ', /^\s*[-*+]\s(?!\[[ xX]\])/)),
      h('span', { class: 'compose-tools-sep' }),
      h('button', { type: 'button', class: 'compose-tool', 'aria-label': 'Attach', title: 'Attach from the vault', onclick: (e) => this.pickFromVault(e.currentTarget) }, icon('paperclip', 16)),
      h('span', { style: 'flex: 1' }),
      h('span', { class: 'compose-hint' }, 'Markdown'));

    const quote = d.quote ? h('div', { class: `compose-quote${d.quote.forward ? ' is-forward' : ''}` },
      d.quote.forward || this.showQuote
        ? h('div', { class: 'compose-quote-text' }, h('div', { class: 'compose-quote-head' }, d.quote.header), d.quote.text)
        : null,
      d.quote.forward ? null : h('button', { type: 'button', class: 'compose-fold', onclick: () => { this.fields(); this.showQuote = !this.showQuote; this.render(); } },
        this.showQuote ? 'Hide the original' : `··· ${d.quote.header.replace(/ wrote:$/, '').replace(/^On /, '')}`)) : null;

    const files = h('div', { class: 'compose-files' },
      d.attachments.map((a, i) => h('span', { class: 'mail-file compose-file' },
        icon('paperclip', 14), a.name, h('small', null, `${size(a.size)} · ${a.kind === 'original' ? 'from the email' : a.kind === 'vault' ? 'from the vault' : 'from Finder'}`),
        h('button', { type: 'button', 'aria-label': `Take off ${a.name}`, onclick: () => this.removeAttachment(i) }, '×'))),
      h('button', { type: 'button', class: 'compose-add', onclick: (e) => this.pickFromVault(e.currentTarget) }, '+ From the vault'),
      h('button', { type: 'button', class: 'compose-add', onclick: () => this.pickFromFinder() }, '+ From Finder'));

    const foot = this.check ? this.checkCard() : h('div', { class: 'compose-foot' },
      h('button', { type: 'button', class: 'deb-btn is-primary compose-send', disabled: this.sending || null, onclick: () => this.send(false) }, this.sending ? 'Sending…' : d.error ? 'Try again' : 'Send'),
      h('span', { class: 'compose-hint' }, 'Kept on this Mac until it’s sent'),
      h('span', { style: 'flex: 1' }),
      h('button', { type: 'button', class: 'compose-link is-quiet', onclick: () => this.discard() }, 'Discard'));

    this.container.replaceChildren(head, problem || '', from, to, cc || '', bcc || '', subject, tools, bodyEl, quote || '', files, foot);
    this.editor = new MarkdownEditor({
      parent: bodyEl,
      content: d.body || '',
      save: async () => this.saveNow(),
      onStatus: () => {},
      onOpenLink: () => {},
      findLink: async () => null,
    });
    // Each keystroke is a change; the editor's own save runs too.
    const markEdited = this.editor.markEdited.bind(this.editor);
    this.editor.markEdited = () => {
      markEdited();
      this.changed();
    };
    if (d.mode === 'new' && !d.to) this.chips.to.focus();
  }

  // A To / Cc / Bcc field: each address a removable bubble; type and press
  // Enter or comma to add one.
  chipField(key, label) {
    const list = splitList(this.draft[key]);
    const input = h('input', { class: 'compose-chip-input', 'aria-label': label, placeholder: list.length ? '' : 'Name or email' });
    const box = h('div', { class: 'compose-chips' });
    const draw = () => box.replaceChildren(...list.map((addr, i) => h('span', { class: `compose-chip${looksLikeAddress(addr) ? '' : ' is-bad'}`, title: addr },
      addr.replace(/\s*<[^>]+>$/, '') || addr,
      h('button', { type: 'button', 'aria-label': `Remove ${addr}`, onclick: () => { list.splice(i, 1); draw(); this.changed(); } }, '×'))), input);
    const commit = () => {
      const parts = splitList(input.value);
      if (!parts.length) return;
      list.push(...parts);
      input.value = '';
      draw();
      this.changed();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
        if (!input.value.trim()) return;
        e.preventDefault();
        commit();
      } else if (e.key === 'Backspace' && !input.value && list.length) {
        list.pop();
        draw();
        this.changed();
      }
    });
    input.addEventListener('blur', commit);
    input.addEventListener('paste', () => setTimeout(commit, 0));
    draw();
    this.chips[key] = { value: () => [...list, ...splitList(input.value)].join(', '), focus: () => input.focus() };
    return h('div', { class: 'compose-field', onclick: (e) => { if (e.target === e.currentTarget || e.target === box) input.focus(); } },
      h('span', { class: 'compose-label' }, label), box);
  }

  checkCard() {
    const { count, recipients } = this.check;
    const row = (label, list) => (list.length ? h('div', { class: 'compose-check-row' }, h('span', { class: 'compose-label' }, label),
      h('div', { class: 'compose-chips' }, list.map((a) => h('span', { class: 'compose-chip', title: a }, a)))) : null);
    return h('div', { class: 'compose-check', role: 'alertdialog', 'aria-label': `Send to ${count} people?` },
      h('h3', null, `Send to ${count} people?`),
      h('p', null, 'Check who it’s going to before it goes.'),
      row('To', recipients.to), row('Cc', recipients.cc), row('Bcc', recipients.bcc),
      h('div', { class: 'deb-actions' },
        h('button', { type: 'button', class: 'deb-btn is-primary', disabled: this.sending || null, onclick: () => this.send(true) }, this.sending ? 'Sending…' : `Send to all ${count}`),
        h('button', { type: 'button', class: 'deb-btn', onclick: () => { this.fields(); this.check = null; this.render(); } }, 'Go back')));
  }

  // ---------- Attachments ----------

  async removeAttachment(index) {
    this.fields();
    await this.saveNow();
    const keep = this.draft.attachments.map((_, i) => i).filter((i) => i !== index);
    this.draft = await this.io.updateDraft({ ...this.fields(), keep });
    this.render();
  }

  async pickFromFinder() {
    this.fields();
    await this.saveNow();
    try {
      this.draft = await this.io.attachFromFinder(this.draft.id);
    } catch (err) {
      this.draft.error = err.message;
    }
    this.render();
  }

  pickFromVault(anchor) {
    if (this.picker) this.picker.remove();
    const files = this.io.vaultFiles();
    const list = h('div', { class: 'compose-pick-list', role: 'listbox' });
    const search = h('input', { class: 'mail-search', type: 'search', placeholder: 'Find a file in the vault', 'aria-label': 'Find a file in the vault' });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const hits = files.filter((f) => !q || f.path.toLowerCase().includes(q)).slice(0, 40);
      list.replaceChildren(...(hits.length ? hits.map((f) => h('button', { type: 'button', class: 'compose-pick', role: 'option', onclick: () => this.attachVault(f.path) },
        h('span', null, f.name), h('small', null, f.path))) : [h('p', { class: 'deb-empty mail-none' }, 'No file by that name.')]));
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePicker();
      if (e.key === 'Enter') {
        const first = list.querySelector('.compose-pick');
        if (first) first.click();
      }
    });
    this.picker = h('div', { class: 'compose-picker ctx-menu' }, search, list);
    document.body.append(this.picker);
    const r = anchor.getBoundingClientRect();
    this.picker.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 380))}px`;
    this.picker.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 360))}px`;
    draw();
    search.focus();
    this.onAway = (e) => { if (this.picker && !this.picker.contains(e.target)) this.closePicker(); };
    setTimeout(() => document.addEventListener('pointerdown', this.onAway, true), 0);
  }

  closePicker() {
    if (this.picker) this.picker.remove();
    this.picker = null;
    document.removeEventListener('pointerdown', this.onAway, true);
  }

  async attachVault(relPath) {
    this.closePicker();
    this.fields();
    await this.saveNow();
    try {
      this.draft = await this.io.attachFromVault(this.draft.id, relPath);
    } catch (err) {
      this.draft.error = err.message;
    }
    this.render();
  }

  // ---------- Send, close, discard ----------

  // The only way an email leaves Opal: the Send button's click (or, with more
  // than 10 people, the "Send to all" button after seeing who they are).
  async send(seen) {
    if (this.sending) return;
    const fields = this.fields();
    this.sending = true;
    this.render();
    await this.saving;
    try {
      const result = await this.io.send(fields, { seen });
      this.sending = false;
      if (result && result.needsCheck) {
        this.check = { count: result.count, recipients: result.recipients };
        this.render();
        return;
      }
      this.destroy();
      this.onSent(result, this.draft);
    } catch (err) {
      this.sending = false;
      this.check = null;
      this.draft.error = err.message;
      this.render();
    }
  }

  async close() {
    await this.saveNow();
    this.destroy();
    this.onClose();
  }

  async discard() {
    clearTimeout(this.saveTimer);
    await this.saving;
    await this.io.discardDraft(this.draft.id);
    this.destroy();
    this.onClose();
  }
}
