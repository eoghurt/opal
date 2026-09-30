// Bookmarks: notes, files and folders (and web links) you want close at
// hand, in sections. Stored in the vault's .obsidian/bookmarks.json in the
// format of Obsidian's Bookmarks plugin (see main.js), so they're shared with
// Obsidian. Shown from the bookmark icon in the top bar and as a home widget.
//
//   isBookmarked(data, target) / toggleBookmark(data, target)   target: { type, path }
//   new BookmarkList(el, { io })   io: data(), save(), open(item, event), exists(item)
//   openBookmarksPanel(anchor, { io, current, onToggleCurrent })

import { h, icon, askName } from './ui.js';
import { showMenu } from './context-menu.js';

const SHOWN = new Set(['file', 'folder', 'group', 'url', 'search']);

// ---------- The data ----------

function sameTarget(item, target) {
  return item && target && item.type === target.type && item.path === target.path && !item.subpath;
}

function walk(items, visit, parent = null) {
  for (const item of items) {
    if (visit(item, items, parent) === false) return false;
    if (item && item.type === 'group' && Array.isArray(item.items) && walk(item.items, visit, item) === false) return false;
  }
  return true;
}

export function isBookmarked(data, target) {
  let found = false;
  walk(data.items, (item) => {
    if (sameTarget(item, target)) found = true;
    return !found;
  });
  return found;
}

// Adds the target at the top level, or removes every bookmark of it.
export function toggleBookmark(data, target) {
  if (isBookmarked(data, target)) {
    const drop = (items) => {
      for (let i = items.length - 1; i >= 0; i--) {
        if (sameTarget(items[i], target)) items.splice(i, 1);
        else if (items[i] && items[i].type === 'group' && Array.isArray(items[i].items)) drop(items[i].items);
      }
    };
    drop(data.items);
    return false;
  }
  data.items.push({ type: target.type, ctime: Date.now(), path: target.path });
  return true;
}

// The list an item is in (and its position).
function locate(data, item) {
  let where = null;
  walk(data.items, (it, list, parent) => {
    if (it === item) {
      where = { list, index: list.indexOf(it), parent };
      return false;
    }
    return true;
  });
  return where;
}

function contains(group, item) {
  return group === item || (group.type === 'group' && Array.isArray(group.items) && group.items.some((i) => contains(i, item)));
}

function baseName(p) {
  return String(p || '').split('/').pop().replace(/\.md$/i, '');
}

export function bookmarkLabel(item) {
  if (item.title) return item.title;
  if (item.type === 'file' || item.type === 'folder') return baseName(item.path) + (item.subpath ? item.subpath.replace(/^#\^?/, ' › ') : '');
  if (item.type === 'url') return item.url;
  if (item.type === 'search') return `Search: ${item.query || ''}`;
  if (item.type === 'group') return 'Section';
  return item.type || 'Bookmark';
}

function bookmarkIcon(item) {
  if (item.type === 'folder') return 'folder';
  if (item.type === 'url') return 'link';
  if (item.type === 'search') return 'search';
  if (item.type === 'group') return 'bookmarks';
  return 'note';
}

// ---------- The list (panel and widget) ----------

export class BookmarkList {
  constructor(el, { io }) {
    this.el = el;
    this.io = io;
    this.collapsed = new Set();
    this.dragging = null;
    this.render();
  }

  get data() {
    return this.io.data();
  }

  async change(fn) {
    fn(this.data);
    this.render();
    await this.io.save();
  }

  render() {
    const items = this.data.items;
    this.el.replaceChildren(items.length
      ? this.listEl(items, 0)
      : h('p', { class: 'bm-empty' }, 'Nothing bookmarked yet. Use “Bookmark this page”, or right-click a note or folder.'));
  }

  listEl(items, depth) {
    const list = h('div', { class: 'bm-list', role: depth ? 'group' : 'tree' });
    for (const item of items) {
      if (!item || !item.type) continue;
      list.append(item.type === 'group' ? this.groupEl(item, depth) : this.rowEl(item, depth));
    }
    return list;
  }

  groupEl(group, depth) {
    const key = group.ctime || group.title;
    const open = !this.collapsed.has(key);
    const head = h('button', {
      class: 'bm-row bm-group-head',
      style: `--depth: ${depth}`,
      'aria-expanded': String(open),
      onclick: () => {
        if (open) this.collapsed.add(key);
        else this.collapsed.delete(key);
        this.render();
      },
    },
    h('span', { class: `bm-caret${open ? ' is-open' : ''}` }, icon('chevron', 12)),
    icon('bookmarks', 14),
    h('span', { class: 'bm-label' }, group.title || 'Section'),
    h('span', { class: 'bm-count' }, String((group.items || []).length)));
    head.addEventListener('contextmenu', (e) => this.groupMenu(e, group));
    this.dragTarget(head, group, true);
    this.draggable(head, group);
    return h('div', { class: 'bm-group' }, head, open ? this.listEl(group.items || [], depth + 1) : null);
  }

  rowEl(item, depth) {
    const known = SHOWN.has(item.type);
    const missing = known && this.io.exists && !this.io.exists(item);
    const row = h('button', {
      class: `bm-row${missing ? ' is-missing' : ''}${known ? '' : ' is-foreign'}`,
      style: `--depth: ${depth}`,
      title: missing ? `Can't find ${item.path} any more` : known ? (item.path || item.url || '') : 'Only shown in Obsidian',
      onclick: (e) => { if (known) this.io.open(item, e); },
    }, icon(bookmarkIcon(item), 14), h('span', { class: 'bm-label' }, bookmarkLabel(item)));
    row.addEventListener('contextmenu', (e) => this.itemMenu(e, item));
    this.dragTarget(row, item, false);
    this.draggable(row, item);
    return row;
  }

  // ---------- Menus ----------

  groups() {
    const out = [];
    walk(this.data.items, (item) => { if (item.type === 'group') out.push(item); });
    return out;
  }

  itemMenu(event, item) {
    event.preventDefault();
    const sections = this.groups().filter((g) => !contains(item, g));
    const here = locate(this.data, item);
    showMenu(event, {
      title: bookmarkLabel(item),
      items: [
        { label: 'Open', onSelect: () => this.io.open(item, {}) },
        { label: 'Open in new tab', hint: '⌘-click', onSelect: () => this.io.open(item, { metaKey: true }) },
        'separator',
        { label: 'Rename…', hint: 'only the bookmark', onSelect: () => this.rename(item) },
        ...sections.map((g) => ({ label: `Move to ${g.title || 'Section'}`, disabled: here && here.parent === g, onSelect: () => this.moveInto(item, g) })),
        here && here.parent ? { label: 'Move out of the section', onSelect: () => this.moveInto(item, null) } : null,
        'separator',
        { label: 'Remove bookmark', danger: true, onSelect: () => this.change((data) => { const at = locate(data, item); if (at) at.list.splice(at.index, 1); }) },
      ].filter(Boolean),
    });
  }

  groupMenu(event, group) {
    event.preventDefault();
    showMenu(event, {
      title: group.title || 'Section',
      items: [
        { label: 'Rename section…', onSelect: () => this.rename(group) },
        { label: 'New section inside…', onSelect: () => this.newSection(group) },
        'separator',
        {
          label: 'Delete section',
          hint: 'keeps its bookmarks',
          danger: true,
          onSelect: () => this.change((data) => {
            const at = locate(data, group);
            if (at) at.list.splice(at.index, 1, ...(group.items || []));
          }),
        },
      ],
    });
  }

  async rename(item) {
    const next = await askName(item.type === 'group' ? 'Rename section' : 'Rename bookmark', 'Name, then Enter (empty = its own name)', item.title || '');
    if (next === null) return;
    await this.change(() => {
      if (next) item.title = next;
      else if (item.type !== 'group') delete item.title;
    });
  }

  async newSection(inside = null) {
    const title = await askName('New bookmark section', 'Section name, then Enter');
    if (!title) return;
    await this.change((data) => {
      const list = inside ? (inside.items = inside.items || []) : data.items;
      list.push({ type: 'group', ctime: Date.now(), title, items: [] });
    });
  }

  moveInto(item, group, index = null) {
    return this.change((data) => {
      const from = locate(data, item);
      if (!from) return;
      from.list.splice(from.index, 1);
      const list = group ? (group.items = group.items || []) : data.items;
      list.splice(index === null ? list.length : Math.min(index, list.length), 0, item);
    });
  }

  // ---------- Dragging ----------

  draggable(el, item) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      this.dragging = item;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', bookmarkLabel(item));
      el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => {
      this.dragging = null;
      el.classList.remove('is-dragging');
      this.el.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-into'));
    });
  }

  // Dropping on a row puts the dragged bookmark before / after it; on a
  // section's middle, into the section.
  dragTarget(el, target, isGroup) {
    const zone = (e) => {
      const box = el.getBoundingClientRect();
      const y = (e.clientY - box.top) / box.height;
      if (isGroup && y > 0.25 && y < 0.75) return 'into';
      return y < 0.5 ? 'before' : 'after';
    };
    el.addEventListener('dragover', (e) => {
      const item = this.dragging;
      if (!item || item === target || (item.type === 'group' && contains(item, target))) return;
      e.preventDefault();
      const z = zone(e);
      el.classList.toggle('drop-before', z === 'before');
      el.classList.toggle('drop-after', z === 'after');
      el.classList.toggle('drop-into', z === 'into');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
    el.addEventListener('drop', (e) => {
      const item = this.dragging;
      if (!item || item === target || (item.type === 'group' && contains(item, target))) return;
      e.preventDefault();
      const z = zone(e);
      if (z === 'into') {
        this.moveInto(item, target);
        return;
      }
      this.change((data) => {
        const from = locate(data, item);
        if (!from) return;
        from.list.splice(from.index, 1);
        const to = locate(data, target);
        if (!to) {
          from.list.splice(from.index, 0, item);
          return;
        }
        to.list.splice(to.index + (z === 'after' ? 1 : 0), 0, item);
      });
    });
  }
}

// ---------- The pop-over from the top bar ----------

let closePanel = null;

export function openBookmarksPanel(anchor, { io, current, onToggleCurrent }) {
  if (closePanel) {
    closePanel();
    return;
  }
  const body = h('div', { class: 'bm-body' });
  const list = new BookmarkList(body, { io: { ...io, open: (item, e) => { close(); io.open(item, e); } } });
  const marked = current ? isBookmarked(io.data(), current.target) : false;
  const panel = h('div', { class: 'bm-panel', role: 'dialog', 'aria-label': 'Bookmarks' },
    h('div', { class: 'bm-head' },
      h('span', { class: 'mono-label' }, 'Bookmarks'),
      h('span', { class: 'grow' }),
      h('button', { class: 'bm-btn', title: 'Group bookmarks into a section', onclick: () => list.newSection() }, icon('plus', 13), 'Section')),
    current ? h('button', {
      class: `bm-this${marked ? ' is-on' : ''}`,
      onclick: async () => {
        await onToggleCurrent();
        close();
      },
    }, icon('bookmark', 15), marked ? `Remove “${current.title}”` : `Bookmark “${current.title}”`) : null,
    body);
  document.body.append(panel);
  const box = anchor.getBoundingClientRect();
  panel.style.top = `${box.bottom + 6}px`;
  panel.style.left = `${Math.max(8, Math.min(box.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
  const outside = (e) => {
    if (panel.contains(e.target) || anchor.contains(e.target) || e.target.closest('.ctx-menu, .ask')) return;
    close();
  };
  const escape = (e) => {
    if (e.key === 'Escape' && !document.querySelector('.ctx-menu, .ask')) close();
  };
  function close() {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
    panel.remove();
    closePanel = null;
  }
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  document.addEventListener('keydown', escape, true);
  closePanel = close;
}
