// The window's frame. The top bar is one row: the logo (as wide as the
// sidebar below it), back / forward, the tabs, then the sections as icons, the
// timer (which widens while it runs) and Settings. The bottom bar has the word
// count and save status. Where you are (the breadcrumb) is kept for screen
// readers only — the tab says it.

import { h, icon } from './ui.js';

const STATUS_TEXT = {
  Saved: 'All saved',
  Edited: 'Editing',
  'Saving…': 'Saving…',
  'Save failed': 'Save failed — retrying',
  Reloaded: 'Updated from disk',
};

// The app icon (a milky opal on blue), small, in place of the old square.
function opalMark() {
  const wrap = h('span', { class: 'wordmark-mark', 'aria-hidden': 'true' });
  wrap.innerHTML = `<svg viewBox="0 0 1024 1024" width="18" height="18">
    <defs>
      <radialGradient id="opal-mark-milk" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.7" stop-color="#EDE8F7"/><stop offset="1" stop-color="#C9D8E8"/></radialGradient>
      <linearGradient id="opal-mark-fire" x1="0" y1="1" x2="1" y2="0"><stop offset="0.35" stop-color="#3DA5D9" stop-opacity="0"/><stop offset="0.55" stop-color="#3DA5D9" stop-opacity="0.28"/><stop offset="0.7" stop-color="#C3A6FF" stop-opacity="0.3"/><stop offset="0.85" stop-color="#FFD23F" stop-opacity="0.25"/><stop offset="1" stop-color="#FFD23F" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="228" fill="#3B2CF5"/>
    <ellipse cx="512" cy="520" rx="330" ry="258" fill="url(#opal-mark-milk)"/>
    <ellipse cx="512" cy="520" rx="330" ry="258" fill="url(#opal-mark-fire)"/>
    <path d="M320 430 C365 350 445 312 535 305" stroke="#FFFFFF" stroke-width="40" stroke-linecap="round" fill="none"/>
  </svg>`;
  return wrap;
}

export class Chrome {
  constructor(topbar, footer, { onHome, onSettings, onBack, onForward, onCalendar, onLogbook, onTasks, onSearch, onInbox, onReview, onBookmarks, onMoney, onDebate }) {
    this.topbar = topbar;
    this.footer = footer;
    this.onHome = onHome;
    this.onSettings = onSettings;
    this.onBookmarks = onBookmarks;
    this.onBack = onBack;
    this.onForward = onForward;
    this.canBack = false;
    this.canForward = false;
    this.onCalendar = onCalendar;
    this.onLogbook = onLogbook;
    this.onReview = onReview;
    this.onMoney = onMoney;
    this.onDebate = onDebate;
    this.cardsDue = 0;
    this.timerSlot = null; // the prep timer's own element (see timer.js)
    this.tabSlot = null; // the tab strip (see tabs.js)
    this.onTasks = onTasks;
    this.onSearch = onSearch;
    this.onInbox = onInbox;
    this.inboxCount = 0;
    this.crumbs = [];
    this.status = 'Saved';
    this.words = null; // { words, selected, target } for the open note
    this.render();
  }

  // crumbs: [{ label, onClick }] — the last one is where you are.
  setCrumbs(crumbs) {
    this.crumbs = crumbs;
    this.renderTop();
  }

  // Flashcards due (the badge on Review).
  setCardsDue(count) {
    if (count === this.cardsDue) return;
    this.cardsDue = count;
    this.renderTop();
  }

  // The number on the Inbox button (things waiting).
  setInboxCount(count) {
    if (count === this.inboxCount) return;
    this.inboxCount = count;
    this.renderTop();
  }

  // Whether Back / Forward have somewhere to go.
  setHistory(canBack, canForward) {
    if (canBack === this.canBack && canForward === this.canForward) return;
    this.canBack = canBack;
    this.canForward = canForward;
    this.renderTop();
  }

  // The open note's word count (and selection), or null off a note.
  setWords(words) {
    const same = JSON.stringify(words) === JSON.stringify(this.words);
    this.words = words;
    if (!same) this.renderFooter();
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

    // A section: an icon button (its name is in the tooltip, and read out).
    const link = (section, iconName, label, onclick, extra = {}) => h('button', {
      class: `bar-icon bar-link${extra.class ? ` ${extra.class}` : ''}`,
      'data-section': section,
      onclick,
      title: extra.title || label,
      'aria-label': extra.ariaLabel || label,
    }, icon(iconName, 17), h('span', { class: 'bar-label sr-only' }, label), extra.badge || null);

    crumbs.classList.add('sr-only');
    this.topbar.replaceChildren(...[
      h('button', { class: 'bar-cell wordmark', onclick: this.onHome, title: 'Vault home (⌘⇧H)' },
        opalMark(),
        h('span', { class: 'wordmark-text' }, 'opal')),
      h('div', { class: 'bar-history' },
        h('button', { class: 'bar-arrow', 'aria-label': 'Back', title: 'Back (⌘[)', disabled: !this.canBack || null, onclick: () => this.onBack() }, '‹'),
        h('button', { class: 'bar-arrow', 'aria-label': 'Forward', title: 'Forward (⌘])', disabled: !this.canForward || null, onclick: () => this.onForward() }, '›')),
      crumbs,
      this.tabSlot,
      h('div', { class: 'bar-tools' }, ...[
        link('search', 'search', 'Search', () => this.onSearch(), { class: 'bar-search', title: 'Search (⌘O names · ⌘⇧F text)' }),
        // Bookmarks, Calendar, Tasks, Review, Money, Debate and the timer used
        // to sit here; they're on the home page tiles, the menus and shortcuts.
        link('settings', 'settings', 'Settings', () => this.onSettings(), { class: 'bar-settings', title: 'Settings (⌘,)' }),
      ].filter(Boolean)),
    ].filter(Boolean));
  }

  renderFooter() {
    const failed = this.status === 'Save failed';
    const w = this.words;
    const count = w ? h('span', { class: 'word-count', role: 'status', title: w.target ? `Target: ${w.target.toLocaleString()} words` : 'Words in this note' },
      w.target ? h('span', { class: 'word-count-bar', 'aria-hidden': 'true' }, h('span', { style: `width: ${Math.min(100, Math.round((w.words / w.target) * 100))}%` })) : null,
      `${w.words.toLocaleString()} word${w.words === 1 ? '' : 's'}${w.target ? ` / ${w.target.toLocaleString()}` : ''}`,
      w.selected ? h('span', { class: 'word-count-sel' }, ` · ${w.selected.toLocaleString()} selected`) : null) : null;
    this.footer.replaceChildren(
      h('span', { class: 'grow' }),
      count || '',
      h('span', { class: `save-status${failed ? ' is-failed' : ''}`, role: 'status' },
        h('span', { class: 'save-dot' }),
        STATUS_TEXT[this.status] || this.status),
    );
  }
}
