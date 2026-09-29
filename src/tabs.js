// The tab strip above the page, drawn like Obsidian's: rounded tabs, the
// active one joined to the page below, a × on hover (a pin on pinned tabs)
// and + for a new tab. Tabs can be dragged into a new order; right-click
// for Pin, Close, Close others…; middle-click closes.
//
// Only draws — the tabs themselves (what each shows, its back/forward
// history) are kept by the window code (renderer.js).
//
//   const bar = new TabBar(el, { onActivate(id), onClose(id), onNew(), onMenu(event, id), onMove(id, index), onTogglePin(id) })
//   bar.render([{ id, title, icon, pinned }], activeId)

import { h, icon } from './ui.js';

export class TabBar {
  constructor(el, handlers) {
    this.el = el;
    this.handlers = handlers;
    this.dragging = null;
    el.classList.add('tabbar');
    el.setAttribute('role', 'presentation');
  }

  render(tabs, activeId) {
    const list = h('div', { class: 'tab-list', role: 'tablist', 'aria-label': 'Open tabs' });
    tabs.forEach((tab, index) => list.append(this.tabEl(tab, index, tab.id === activeId)));
    const add = h('button', { class: 'tab-new', title: 'New tab (⌘T)', 'aria-label': 'New tab', onclick: () => this.handlers.onNew() }, icon('plus', 16));
    this.el.replaceChildren(list, add, h('div', { class: 'tab-fill' }));
    // Keep the active tab in view when there are many.
    const active = list.querySelector('.tab.is-active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  tabEl(tab, index, isActive) {
    const end = tab.pinned
      ? h('button', { class: 'tab-pin', title: 'Pinned — click to unpin', 'aria-label': 'Unpin tab', onclick: (e) => { e.stopPropagation(); this.handlers.onTogglePin(tab.id); } }, icon('pin', 13))
      : h('button', { class: 'tab-close', title: 'Close tab (⌘W)', 'aria-label': `Close ${tab.title}`, onclick: (e) => { e.stopPropagation(); this.handlers.onClose(tab.id); } }, icon('x', 13));
    const el = h('div', {
      class: `tab${isActive ? ' is-active' : ''}${tab.pinned ? ' is-pinned' : ''}`,
      role: 'tab',
      tabindex: isActive ? '0' : '-1',
      'aria-selected': String(isActive),
      title: tab.tooltip || tab.title,
      draggable: 'true',
      'data-id': tab.id,
    },
    h('span', { class: 'tab-inner' },
      icon(tab.icon, 14),
      h('span', { class: 'tab-title' }, tab.title),
      end));
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.target.closest('.tab-close, .tab-pin')) this.handlers.onActivate(tab.id);
    });
    // Middle-click closes (as in Obsidian and browsers).
    el.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onClose(tab.id);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handlers.onMenu(e, tab.id);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handlers.onActivate(tab.id);
      }
    });
    // Dragging into a new order.
    el.addEventListener('dragstart', (e) => {
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
}
