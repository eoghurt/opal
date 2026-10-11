// The window's frame. A slim rail down the left: the opal (home), Search,
// the fidgets (Calendar, Tasks, Money…), and Settings at the bottom. The page
// sits on a sheet to the right of the sidebar; the sheet's top row has back /
// forward, where you are (the breadcrumb), the open note's word count, the
// save status and, top right, the timer with its countdown. The tabs are in the sidebar (see sidebar.js).

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
  constructor(rail, topbar, { onHome, onSettings, onBack, onForward, onCalendar, onLogbook, onTasks, onSearch, onReview, onBookmarks, onMoney, onDebate, fidgets, railPlace, onToggleSidebar, sidebarClosed }) {
    this.rail = rail;
    this.topbar = topbar;
    this.footer = h('div', { class: 'sheet-status' });
    this.fidgets = fidgets || (() => []); // [{ id, name, icon, open }]
    this.railPlace = railPlace || (() => null); // the fidget id of the page you're on
    this.onToggleSidebar = onToggleSidebar;
    this.sidebarClosed = sidebarClosed || (() => false);
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
      if (i > 0) crumbs.append(h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '/'));
      crumbs.append(last || !crumb.onClick
        ? h('span', { class: last ? 'crumb-current' : null, 'aria-current': last ? 'page' : null }, crumb.label)
        : h('button', { class: 'crumb', onclick: crumb.onClick }, crumb.label));
    });

    // A rail button: an icon (its name in the tooltip, and read out).
    const here = this.railPlace();
    const link = (section, iconName, label, onclick, extra = {}) => h('button', {
      class: `rail-btn${here === section ? ' is-on' : ''}${extra.class ? ` ${extra.class}` : ''}`,
      'data-section': section,
      onclick,
      title: extra.title || label,
      'aria-label': extra.ariaLabel || label,
      'aria-current': here === section ? 'page' : null,
    }, icon(iconName, 20), extra.badge || null);

    const fidgets = this.fidgets().map((f) => link(f.id, f.icon, f.name, f.open, {
      badge: f.id === 'flashcards' && this.cardsDue ? h('span', { class: 'rail-badge' }, String(this.cardsDue)) : null,
    }));
    this.rail.replaceChildren(...[
      h('button', { class: 'rail-mark wordmark', onclick: this.onHome, title: 'Vault home (⌘⇧H)', 'aria-label': 'Vault home' }, opalMark()),
      link('search', 'search', 'Search', () => this.onSearch(), { class: 'bar-search', title: 'Search (⌘O names · ⌘⇧F text)' }),
      fidgets.length ? h('span', { class: 'rail-rule', 'aria-hidden': 'true' }) : null,
      ...fidgets,
      h('span', { class: 'rail-fill' }),
      link('settings', 'settings', 'Settings', () => this.onSettings(), { class: 'bar-settings', title: 'Settings (⌘,)' }),
    ].filter(Boolean));

    const closed = this.sidebarClosed();
    this.topbar.replaceChildren(...[
      this.onToggleSidebar ? h('button', {
        class: `bar-arrow bar-sidebar${closed ? ' is-closed' : ''}`,
        'aria-label': closed ? 'Show the sidebar' : 'Hide the sidebar',
        'aria-pressed': String(!closed),
        title: `${closed ? 'Show' : 'Hide'} the sidebar (⌘\\)`,
        onclick: () => this.onToggleSidebar(),
      }, icon('sidebar', 17)) : null,
      h('div', { class: 'bar-history' },
        h('button', { class: 'bar-arrow', 'aria-label': 'Back', title: 'Back (⌘[)', disabled: !this.canBack || null, onclick: () => this.onBack() }, icon('chevron', 15)),
        h('button', { class: 'bar-arrow is-forward', 'aria-label': 'Forward', title: 'Forward (⌘])', disabled: !this.canForward || null, onclick: () => this.onForward() }, icon('chevron', 15))),
      crumbs,
      h('span', { class: 'grow' }),
      this.footer,
      this.timerSlot,
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
      count || '',
      h('span', { class: `save-status${failed ? ' is-failed' : ''}`, role: 'status' },
        h('span', { class: 'save-dot' }),
        STATUS_TEXT[this.status] || this.status),
    );
  }
}
