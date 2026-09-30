// The round + button in the bottom right of the page. Click it and it opens
// upwards into what you can add here: a note, a folder, a sticky note (on
// pages that have stickies). Escape or clicking elsewhere closes it.
//
//   const add = new AddButton(host, { items: () => [{ id, label, icon, hint, run(anchor) }] })
//   add.refresh()  — after the page changes (the choices depend on it)

import { h, icon } from './ui.js';

export class AddButton {
  constructor(host, { items }) {
    this.items = items;
    this.open = false;
    this.menu = h('div', { class: 'fab-menu', role: 'menu', 'aria-label': 'Add' });
    this.main = h('button', {
      class: 'fab-main',
      title: 'Add a note, folder or sticky',
      'aria-label': 'Add',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      onclick: () => this.toggle(),
    }, icon('plus', 24));
    this.el = h('div', { class: 'fab' }, this.menu, this.main);
    host.append(this.el);
    this.onOutside = (e) => { if (!this.el.contains(e.target)) this.toggle(false); };
    this.onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.toggle(false);
        this.main.focus();
      }
    };
    this.refresh();
  }

  refresh() {
    const items = this.items();
    this.el.hidden = !items.length;
    this.menu.replaceChildren(...items.map((item) => h('button', {
      class: 'fab-item',
      role: 'menuitem',
      'data-action': item.id,
      onclick: () => {
        this.toggle(false);
        item.run(this.main);
      },
    }, h('span', { class: 'fab-item-label' }, item.label, item.hint ? h('span', { class: 'fab-item-hint' }, item.hint) : null), h('span', { class: 'fab-item-icon' }, icon(item.icon, 18)))));
  }

  toggle(open = !this.open) {
    if (open === this.open) return;
    this.open = open;
    this.el.classList.toggle('is-open', open);
    this.main.setAttribute('aria-expanded', String(open));
    if (open) {
      this.refresh();
      setTimeout(() => document.addEventListener('pointerdown', this.onOutside, true), 0);
      document.addEventListener('keydown', this.onKey, true);
      this.menu.querySelector('.fab-item')?.focus();
    } else {
      document.removeEventListener('pointerdown', this.onOutside, true);
      document.removeEventListener('keydown', this.onKey, true);
    }
  }
}
