// "New note / folder" pop-up, like the calendar's quick create: a name, Note or
// Folder, which folder it goes in, and its colour — all before it's made.
//   openCreateItem(at, { kind, folder, folders, onCreate })
// `at` is a mouse event, an element to sit beside, or null (top of the window).
// folders: [{ path, label, depth }]; onCreate({ kind, name, folder, color, description }).
// Enter after the name offers a description line (optional); Enter again makes it.

import { h } from './ui.js';
import { swatchRow } from './item-colors.js';

let closeOpen = null;

export function closeCreateItem() {
  if (closeOpen) closeOpen();
}

export function openCreateItem(at, { kind = 'note', folder = '', folders, onCreate }) {
  closeCreateItem();
  const state = { kind, folder, color: null };

  const title = h('input', { class: 'cal-new-title', 'aria-label': 'Name', spellcheck: 'false' });
  const describe = h('input', { class: 'create-desc', 'aria-label': 'Description (optional)', placeholder: 'Add a description… (optional)', spellcheck: 'true' });
  describe.hidden = true;
  const kindBtn = (value, label) => h('button', {
    type: 'button',
    class: 'cal-new-kind',
    'data-kind': value,
    onclick: () => { state.kind = value; sync(); title.focus(); },
  }, label);
  const kinds = h('div', { class: 'cal-new-kinds', role: 'group', 'aria-label': 'Kind' }, kindBtn('note', 'Note'), kindBtn('folder', 'Folder'));
  const where = h('select', { class: 'cal-pop-select create-where', 'aria-label': 'In folder' },
    folders.map((f) => h('option', { value: f.path, selected: f.path === folder || null }, `${'  '.repeat(f.depth)}${f.label}`)));
  where.addEventListener('change', () => { state.folder = where.value; });
  const colours = h('div', { class: 'create-colours' });
  const drawColours = () => colours.replaceChildren(swatchRow(state.color, (name) => { state.color = name; drawColours(); }));

  const sync = () => {
    kinds.querySelectorAll('.cal-new-kind').forEach((b) => {
      const on = b.dataset.kind === state.kind;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    title.placeholder = state.kind === 'folder' ? 'Folder name' : 'Note name';
    pop.setAttribute('aria-label', state.kind === 'folder' ? 'New folder' : 'New note');
    save.textContent = state.kind === 'folder' ? 'Create folder' : 'Create note';
  };

  const submit = () => {
    const name = title.value.trim();
    if (!name) {
      title.classList.add('is-empty');
      title.focus();
      return;
    }
    close();
    onCreate({ kind: state.kind, name, folder: state.folder, color: state.color, description: describe.value.trim() });
  };
  title.addEventListener('input', () => title.classList.remove('is-empty'));
  title.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!title.value.trim()) {
      submit(); // shows it needs a name
    } else if (describe.hidden) {
      describe.hidden = false;
      describe.focus();
    } else {
      submit();
    }
  });
  describe.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  const save = h('button', { class: 'cal-pop-btn is-primary', onclick: submit }, 'Create');
  const pop = h('div', { class: 'cal-pop cal-new create-pop', role: 'dialog' },
    title,
    describe,
    kinds,
    h('div', { class: 'cal-new-when' }, h('span', { class: 'mono-label' }, 'In'), where),
    h('div', { class: 'cal-picker' }, h('span', { class: 'mono-label' }, 'Colour'), colours),
    h('div', { class: 'cal-pop-actions' }, save, h('button', { class: 'cal-pop-btn', onclick: () => close() }, 'Cancel')));
  drawColours();
  sync();
  document.body.append(pop);

  // Beside the pointer or the element, kept inside the window.
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  let x;
  let y;
  if (at && 'clientX' in at && (at.clientX || at.clientY)) {
    x = at.clientX + 6;
    y = at.clientY + 6;
  } else if (at && at.getBoundingClientRect) {
    const box = at.getBoundingClientRect();
    x = box.left;
    y = box.bottom + 6;
  } else {
    x = (window.innerWidth - width) / 2;
    y = 70;
  }
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - height - 8))}px`;

  const outside = (e) => {
    if (!pop.contains(e.target)) close();
  };
  const escape = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  function close() {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
    pop.remove();
    closeOpen = null;
  }
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  document.addEventListener('keydown', escape, true);
  closeOpen = close;
  title.focus();
}
