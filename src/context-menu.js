// The right-click (and double-click) menu used across Opal.
//   showMenu(event, { title, items: [{ label, onSelect, danger, disabled, hint }, 'separator'], extra })
// `extra` is an element shown under the items (e.g. a row of colour swatches).
// Arrow keys move, Enter picks, Escape closes.

import { h } from './ui.js';

let open = null;

export function closeMenu() {
  if (open) open();
}

export function showMenu(event, { title, items, extra }) {
  event.preventDefault();
  event.stopPropagation();
  closeMenu();

  const buttons = [];
  const menu = h('div', { class: 'ctx-menu', role: 'menu', 'aria-label': title || 'Options' },
    title ? h('span', { class: 'mono-label ctx-title' }, title) : null,
    items.filter(Boolean).map((item) => {
      if (item === 'separator') return h('hr', { class: 'ctx-sep' });
      const button = h('button', {
        type: 'button',
        class: `ctx-item${item.danger ? ' is-danger' : ''}`,
        role: 'menuitem',
        disabled: item.disabled || null,
        onclick: () => {
          close();
          item.onSelect();
        },
      }, h('span', null, item.label), item.hint ? h('span', { class: 'ctx-hint' }, item.hint) : null);
      if (!item.disabled) buttons.push(button);
      return button;
    }),
    extra ? h('div', { class: 'ctx-extra' }, extra) : null);
  document.body.append(menu);

  // Next to the pointer, kept inside the window.
  const x = event.clientX ?? 0;
  const y = event.clientY ?? 0;
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - box.width - 6))}px`;
  menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - box.height - 6))}px`;

  const onKey = (e) => {
    const at = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? at + 1 : at - 1;
      buttons[(next + buttons.length) % buttons.length]?.focus();
    }
  };
  const onAway = (e) => {
    if (!menu.contains(e.target)) close();
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onAway, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    menu.remove();
    open = null;
  };
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => document.addEventListener('pointerdown', onAway, true), 0);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  open = close;
  if (buttons[0]) buttons[0].focus({ preventScroll: true });
}

// Right-click and double-click on `el` both open the menu that `build` returns.
export function menuOn(el, build) {
  el.addEventListener('contextmenu', (event) => showMenu(event, build()));
  el.addEventListener('dblclick', (event) => showMenu(event, build()));
}
