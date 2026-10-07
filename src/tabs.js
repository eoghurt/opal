// The tabs in the top bar, drawn like Obsidian's: rounded tabs, the active one
// joined to the page below, a × on hover and + for a new tab. Tabs can be
// dragged into a new order; right-click for Pin, Close, Close others…;
// middle-click closes.
//
// Resting on a tab shows a card with its name and where it is — the folders
// on the way are links. A pinned tab is small and shows the emoji (and colour)
// you chose when pinning it.
//
// Only draws — the tabs themselves (what each shows, its back/forward
// history) are kept by the window code (renderer.js).
//
//   const bar = new TabBar(el, { onActivate(id), onClose(id), onNew(), onMenu(event, id),
//                                onMove(id, index), onPath(id, place), onDouble(event, id) })
//   bar.render([{ id, title, icon, pinned, pin: { emoji, color }, path: [{ label, icon, place }] }], activeId)
//   openPinPicker(anchor, { emoji, color }, onDone({ emoji, color }))

import { h, icon } from './ui.js';
import { swatchRow, ITEM_COLORS } from './item-colors.js';

const PEEK_DELAY = 450; // ms resting on a tab before its card shows
const PEEK_LINGER = 180; // ms the card stays after the pointer leaves

export const PIN_EMOJIS = ['📌', '⭐', '🔥', '📚', '📝', '✏️', '🎯', '🧠', '💡', '🗓️', '✅', '📊', '🎓', '🧪', '📐', '🌍', '🗣️', '⚖️', '💬', '🎨', '🎵', '🏃', '❤️', '🍅'];

// The first character someone typed (emoji can be several code points).
function firstGrapheme(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  try {
    const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value);
    return first ? first.segment : '';
  } catch {
    return [...value][0] || '';
  }
}

export class TabBar {
  constructor(el, handlers) {
    this.el = el;
    this.handlers = handlers;
    this.dragging = null;
    this.peek = null; // { card, tabId }
    this.peekTimer = null;
    this.hideTimer = null;
    el.classList.add('tabbar');
    el.setAttribute('role', 'presentation');
  }

  render(tabs, activeId) {
    this.hidePeek(true);
    this.tabs = tabs;
    const list = h('div', { class: 'tab-list', role: 'tablist', 'aria-label': 'Open tabs' });
    tabs.forEach((tab, index) => list.append(this.tabEl(tab, index, tab.id === activeId)));
    const add = h('button', { class: 'tab-new', title: 'New tab (⌘T)', 'aria-label': 'New tab', onclick: () => this.handlers.onNew() }, icon('plus', 16));
    this.el.replaceChildren(list, add, h('div', { class: 'tab-fill' }));
  }

  tabEl(tab, index, isActive) {
    const pin = tab.pinned ? tab.pin || {} : null;
    const color = pin && pin.color ? ITEM_COLORS[pin.color] : null;
    const inner = pin
      ? h('span', { class: 'tab-inner', style: color ? `--pin-color: ${color}` : null },
        pin.emoji ? h('span', { class: 'tab-emoji', 'aria-hidden': 'true' }, pin.emoji) : icon('pin', 14))
      : h('span', { class: 'tab-inner' },
        icon(tab.icon, 14),
        h('span', { class: 'tab-title' }, tab.title),
        h('button', { class: 'tab-close', title: 'Close tab (⌘W)', 'aria-label': `Close ${tab.title}`, onclick: (e) => { e.stopPropagation(); this.handlers.onClose(tab.id); } }, icon('x', 13)));
    const el = h('div', {
      class: `tab${isActive ? ' is-active' : ''}${pin ? ' is-pinned' : ''}${color ? ' has-color' : ''}`,
      role: 'tab',
      tabindex: isActive ? '0' : '-1',
      'aria-selected': String(isActive),
      'aria-label': pin ? `${tab.title} (pinned)` : tab.title,
      draggable: 'true',
      'data-id': tab.id,
    }, inner);
    el.addEventListener('mousedown', (e) => {
      this.hidePeek(true);
      if (e.button === 0 && !e.target.closest('.tab-close')) this.handlers.onActivate(tab.id);
    });
    // Middle-click closes (as in Obsidian and browsers).
    el.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onClose(tab.id);
    });
    // Double-click: Show in Finder / Copy path.
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.tab-close')) return;
      e.preventDefault();
      this.hidePeek(true);
      if (this.handlers.onDouble) this.handlers.onDouble(e, tab.id);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.hidePeek(true);
      this.handlers.onMenu(e, tab.id);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handlers.onActivate(tab.id);
      }
    });
    // The card with the tab's name and where it is.
    el.addEventListener('pointerenter', () => {
      if (this.dragging) return;
      clearTimeout(this.hideTimer);
      if (this.peek && this.peek.tabId === tab.id) return;
      clearTimeout(this.peekTimer);
      // Moving along the strip with a card already open: switch straight away.
      this.peekTimer = setTimeout(() => this.showPeek(el, tab), this.peek ? 0 : PEEK_DELAY);
    });
    el.addEventListener('pointerleave', () => {
      clearTimeout(this.peekTimer);
      this.hidePeek();
    });
    // Dragging into a new order.
    el.addEventListener('dragstart', (e) => {
      this.hidePeek(true);
      this.dragging = tab.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tab.title);
      el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => {
      this.dragging = null;
      this.clearDrop();
      el.classList.remove('is-dragging');
    });
    el.addEventListener('dragover', (e) => {
      if (!this.dragging || this.dragging === tab.id) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const after = e.clientX > box.left + box.width / 2;
      this.clearDrop();
      el.classList.add(after ? 'drop-after' : 'drop-before');
    });
    el.addEventListener('drop', (e) => {
      if (!this.dragging || this.dragging === tab.id) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const after = e.clientX > box.left + box.width / 2;
      const moving = this.dragging;
      this.clearDrop();
      this.handlers.onMove(moving, index + (after ? 1 : 0));
    });
    return el;
  }

  clearDrop() {
    this.el.querySelectorAll('.drop-before, .drop-after').forEach((t) => t.classList.remove('drop-before', 'drop-after'));
  }

  // ---------- The hover card ----------

  showPeek(el, tab) {
    this.hidePeek(true);
    if (!el.isConnected) return;
    const path = tab.path || [];
    const pin = tab.pinned ? tab.pin || {} : null;
    const crumbs = h('nav', { class: 'tab-peek-path', 'aria-label': 'Where this is' });
    path.forEach((step, i) => {
      if (i > 0) crumbs.append(h('span', { class: 'tab-peek-sep', 'aria-hidden': 'true' }, '›'));
      const last = i === path.length - 1;
      const stepEl = last || !step.place
        ? h('span', { class: `tab-peek-step${last ? ' is-here' : ''}` }, icon(step.icon, 12), step.label)
        : h('button', {
          class: 'tab-peek-step',
          title: tab.pinned ? `Open ${step.label} in a new tab` : `Open ${step.label} in this tab`,
          onclick: () => {
            this.hidePeek(true);
            this.handlers.onPath(tab.id, step.place);
          },
        }, icon(step.icon, 12), step.label);
      // Right-click a step: that folder's (or the item's own) menu.
      stepEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.hidePeek(true); // the menu takes its place
        if (this.handlers.onPathMenu) this.handlers.onPathMenu(e, tab.id, last ? null : step.place);
      });
      crumbs.append(stepEl);
    });
    const card = h('div', { class: 'tab-peek', role: 'tooltip' },
      h('div', { class: 'tab-peek-title' },
        pin && pin.emoji ? h('span', { class: 'tab-emoji' }, pin.emoji) : icon(tab.icon, 15),
        h('span', null, tab.title),
        pin ? h('span', { class: 'tab-peek-badge' }, icon('pin', 11), 'Pinned') : null),
      path.length > 1 ? crumbs : null,
      tab.detail ? h('span', { class: 'tab-peek-detail' }, tab.detail) : null);
    card.addEventListener('pointerenter', () => clearTimeout(this.hideTimer));
    card.addEventListener('pointerleave', () => this.hidePeek());
    document.body.append(card);
    const box = el.getBoundingClientRect();
    card.style.top = `${box.bottom + 6}px`;
    card.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - card.offsetWidth - 8))}px`;
    this.peek = { card, tabId: tab.id };
  }

  hidePeek(now = false) {
    clearTimeout(this.hideTimer);
    const drop = () => {
      if (this.peek) this.peek.card.remove();
      this.peek = null;
    };
    if (now) {
      clearTimeout(this.peekTimer);
      drop();
    } else {
      this.hideTimer = setTimeout(drop, PEEK_LINGER);
    }
  }
}

// ---------- Choosing a pinned tab's emoji and colour ----------

let closePicker = null;

export function openPinPicker(anchor, current, onDone) {
  if (closePicker) closePicker();
  const state = { emoji: (current && current.emoji) || '', color: (current && current.color) || null };
  const typed = h('input', { class: 'pin-typed', placeholder: 'or type one', 'aria-label': 'Type any emoji', maxlength: '16', spellcheck: 'false' });
  const preview = h('span', { class: 'tab-emoji pin-preview', 'aria-hidden': 'true' });
  const grid = h('div', { class: 'pin-emojis', role: 'radiogroup', 'aria-label': 'Emoji' });
  const colours = h('div', { class: 'pin-colours' });
  const sync = () => {
    preview.textContent = state.emoji || '📌';
    preview.style.background = state.color ? ITEM_COLORS[state.color] : '';
    grid.querySelectorAll('.pin-emoji').forEach((b) => {
      const on = b.textContent === state.emoji;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    colours.replaceChildren(swatchRow(state.color, (name) => { state.color = name; sync(); }));
  };
  grid.append(...PIN_EMOJIS.map((emoji) => h('button', {
    class: 'pin-emoji',
    role: 'radio',
    onclick: () => { state.emoji = emoji; typed.value = ''; sync(); },
  }, emoji)));
  typed.addEventListener('input', () => {
    const first = firstGrapheme(typed.value);
    if (first) {
      state.emoji = first;
      sync();
    }
  });
  typed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    }
  });
  const pop = h('div', { class: 'pin-picker', role: 'dialog', 'aria-label': 'Pinned tab emoji and colour' },
    h('div', { class: 'pin-picker-head' }, preview, h('span', { class: 'mono-label' }, 'Pinned tab')),
    grid,
    typed,
    h('span', { class: 'mono-label' }, 'Colour'),
    colours,
    h('div', { class: 'pin-actions' },
      h('button', { class: 'cal-pop-btn is-primary', onclick: () => finish(true) }, 'Done'),
      h('button', { class: 'cal-pop-btn', onclick: () => { state.emoji = ''; state.color = null; finish(true); } }, 'No emoji')));
  sync();
  document.body.append(pop);
  const box = anchor.getBoundingClientRect();
  pop.style.top = `${box.bottom + 6}px`;
  pop.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - pop.offsetWidth - 8))}px`;

  function finish(save) {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
    pop.remove();
    closePicker = null;
    if (save) onDone({ emoji: state.emoji || null, color: state.color || null });
  }
  // Clicking away keeps what was chosen so far; Escape too (the tab is pinned either way).
  const outside = (e) => { if (!pop.contains(e.target)) finish(true); };
  const escape = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      finish(true);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  document.addEventListener('keydown', escape, true);
  closePicker = () => finish(false);
  grid.querySelector('.pin-emoji.is-on, .pin-emoji').focus();
}
