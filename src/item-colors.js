// The ten colours a folder or page can have (see shared/frontmatter.js),
// plus the small right-click menu for picking one.

import { ITEM_COLORS, DEFAULT_COLOR } from '../shared/frontmatter.js';
import { h } from './ui.js';

export { ITEM_COLORS, DEFAULT_COLOR };

// The colour to draw a tree node (folder or file) with.
export function colorOf(node) {
  return ITEM_COLORS[(node && node.color) || DEFAULT_COLOR] || ITEM_COLORS[DEFAULT_COLOR];
}

// A row of the ten swatches. onPick(name) — the default counts as "no colour".
export function swatchRow(current, onPick) {
  const chosen = current || DEFAULT_COLOR;
  return h('div', { class: 'item-swatches', role: 'radiogroup', 'aria-label': 'Colour' },
    Object.entries(ITEM_COLORS).map(([name, hex]) => h('button', {
      class: `item-swatch${name === chosen ? ' is-on' : ''}`,
      role: 'radio',
      'aria-checked': String(name === chosen),
      'aria-label': name === DEFAULT_COLOR ? `${name} (default)` : name,
      title: name === DEFAULT_COLOR ? `${name} (default)` : name,
      style: `background: ${hex}`,
      onclick: () => onPick(name === DEFAULT_COLOR ? null : name),
    })));
}

let openMenu = null;

export function closeColorMenu() {
  if (openMenu) openMenu();
  openMenu = null;
}

// Right-click menu with the swatches, at the mouse.
export function showColorMenu(event, { title, current, onPick }) {
  event.preventDefault();
  closeColorMenu();
  const menu = h('div', { class: 'ctx-menu', role: 'menu', 'aria-label': `Colour for ${title}` },
    h('span', { class: 'mono-label ctx-title' }, `Colour · ${title}`),
    swatchRow(current, (name) => {
      closeColorMenu();
      onPick(name);
    }));
  document.body.append(menu);
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - width - 8)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - height - 8)}px`;
  menu.querySelector('.item-swatch.is-on, .item-swatch').focus();

  const outside = (e) => { if (!menu.contains(e.target)) closeColorMenu(); };
  const key = (e) => { if (e.key === 'Escape') closeColorMenu(); };
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  document.addEventListener('keydown', key);
  window.addEventListener('blur', closeColorMenu);
  openMenu = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', key);
    window.removeEventListener('blur', closeColorMenu);
  };
}
