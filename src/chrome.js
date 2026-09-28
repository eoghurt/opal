// The window's frame: the top bar (logo, breadcrumb, date, palette) and the
// bottom bar (recent notes and save status).

import { h } from './ui.js';
import { noteName, todayStamp } from './format.js';

const STATUS_TEXT = {
  Saved: 'All saved',
  Edited: 'Editing',
  'Saving…': 'Saving…',
  'Save failed': 'Save failed — retrying',
  Reloaded: 'Updated from disk',
};

export class Chrome {
  constructor(topbar, footer, { onHome, onPalettes, onOpenFile, onCalendar, onLogbook, onTasks, onSearch, onInbox }) {
    this.topbar = topbar;
    this.footer = footer;
    this.onHome = onHome;
    this.onPalettes = onPalettes;
    this.onOpenFile = onOpenFile;
    this.onCalendar = onCalendar;
    this.onLogbook = onLogbook;
    this.onTasks = onTasks;
    this.onSearch = onSearch;
    this.onInbox = onInbox;
    this.inboxCount = 0;
    this.crumbs = [];
    this.palette = null;
    this.recent = [];
    this.status = 'Saved';
    this.render();
  }

  // crumbs: [{ label, onClick }] — the last one is where you are.
  setCrumbs(crumbs) {
    this.crumbs = crumbs;
    this.renderTop();
  }

  // The number on the Inbox button (things waiting).
  setInboxCount(count) {
    if (count === this.inboxCount) return;
    this.inboxCount = count;
    this.renderTop();
  }

  setPalette(palette) {
    this.palette = palette;
    this.renderTop();
  }

  setRecent(files) {
    this.recent = files;
    this.renderFooter();
  }

  setStatus(status) {
    this.status = status;
    this.renderFooter();
  }

  render() {
    this.renderTop();
    this.renderFooter();
  }

  renderTop() {
    const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' });
    this.crumbs.forEach((crumb, i) => {
      const last = i === this.crumbs.length - 1;
      if (i > 0) crumbs.append(h('span', { 'aria-hidden': 'true' }, '/'));
      crumbs.append(last || !crumb.onClick
        ? h('span', { class: last ? 'crumb-current' : null, 'aria-current': last ? 'page' : null }, crumb.label)
        : h('button', { class: 'crumb', onclick: crumb.onClick }, crumb.label));
    });

    const paletteCell = this.palette
      ? h('button', { class: 'bar-cell palette-chip', onclick: this.onPalettes, title: 'Change palette' },
        h('span', { class: 'chip-bars' }, this.palette.colors.map((c) => h('span', { style: `background: ${c}` }))),
        this.palette.name)
      : null;

    this.topbar.replaceChildren(...[
      h('button', { class: 'bar-cell wordmark', onclick: this.onHome, title: 'Vault home' },
        h('span', { class: 'wordmark-square' }),
        h('span', { class: 'wordmark-text' }, 'opal')),
      crumbs,
      h('button', { class: 'bar-cell bar-link bar-search', onclick: () => this.onSearch(), title: 'Search (⌘O names · ⌘⇧F text)' }, 'Search'),
      !this.onInbox ? null : h('button', {
        class: 'bar-cell bar-link bar-inbox',
        onclick: () => this.onInbox(),
        title: 'Inbox (⌘⇧I)',
        'aria-label': this.inboxCount ? `Inbox, ${this.inboxCount} waiting` : 'Inbox',
      }, 'Inbox', this.inboxCount ? h('span', { class: 'bar-badge', 'aria-hidden': 'true' }, this.inboxCount > 99 ? '99+' : String(this.inboxCount)) : null),
      h('button', { class: 'bar-cell bar-link', onclick: () => this.onCalendar() }, 'Calendar'),
      h('button', { class: 'bar-cell bar-link', onclick: () => this.onTasks() }, 'Tasks'),
      h('button', { class: 'bar-cell bar-link', onclick: () => this.onLogbook() }, 'Logbook'),
      h('button', { class: 'bar-cell bar-date', onclick: () => this.onCalendar(new Date()), title: 'Today in the calendar' }, todayStamp()),
      paletteCell,
    ].filter(Boolean));
  }

  renderFooter() {
    const list = h('div', { class: 'recent-list' });
    this.recent.forEach((file, i) => {
      if (i > 0) list.append(h('span', { 'aria-hidden': 'true' }, '/'));
      list.append(h('button', { class: 'recent-item', title: file.path, onclick: () => this.onOpenFile(file.path) }, noteName(file.path)));
    });
    const failed = this.status === 'Save failed';
    this.footer.replaceChildren(
      h('span', { class: 'recent-label' }, 'Recent'),
      list,
      h('span', { class: `save-status${failed ? ' is-failed' : ''}`, role: 'status' },
        h('span', { class: 'save-dot' }),
        STATUS_TEXT[this.status] || this.status),
    );
  }
}
