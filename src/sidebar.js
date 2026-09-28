// Sidebar: the vault's folder tree — the second way to get around.
// Clicking a folder's name opens its home page; the arrow just expands it.
// Drag a page or folder onto a folder to move it in, or between rows to put
// it in your own order.

import { h, icon } from './ui.js';
import { colorOf } from './item-colors.js';
import { noteName, pad2 } from './format.js';

export class Sidebar {
  constructor(container, { onOpenFile, onOpenFolder, onSwitchVault, onColorMenu, onRearrange }) {
    this.container = container;
    this.onOpenFile = onOpenFile;
    this.onOpenFolder = onOpenFolder;
    this.onSwitchVault = onSwitchVault;
    this.onColorMenu = onColorMenu;
    this.onRearrange = onRearrange;
    this.vault = null;
    this.tree = [];
    this.active = { kind: null, path: null };
    this.expanded = new Set(); // folder paths that are open
  }

  setVault(vault) {
    this.vault = vault;
    this.expanded.clear();
    this.active = { kind: null, path: null };
    this.tree = [];
    this.render();
  }

  setTree(tree) {
    this.tree = tree;
    this.render();
  }

  // kind: 'file' | 'folder' | null
  setActive(kind, path) {
    this.active = { kind, path };
    if (path) {
      const parts = path.split('/');
      const upTo = kind === 'folder' ? parts.length : parts.length - 1;
      for (let i = 1; i <= upTo; i++) this.expanded.add(parts.slice(0, i).join('/'));
    }
    this.render();
  }

  render() {
    const oldTree = this.container.querySelector('.side-tree');
    const scrollTop = oldTree ? oldTree.scrollTop : 0;

    const vaultRow = h('div', { class: 'side-vault' },
      this.dropTarget(h('button', {
        class: `side-vault-name${this.active.kind === 'folder' && this.active.path === '' ? ' is-current' : ''}`,
        title: this.vault ? this.vault.path : '',
        onclick: () => this.vault && this.onOpenFolder(''),
      }, this.vault ? this.vault.name : 'No vault'), { type: 'folder', path: '', name: this.vault ? this.vault.name : '' }, true),
      h('button', { class: 'side-switch mono-label', onclick: this.onSwitchVault }, this.vault ? 'Switch' : 'Choose…'),
    );

    const folderCount = this.tree.filter((n) => n.type === 'folder').length;
    const label = h('div', { class: 'side-label mono-label' }, h('span', null, 'Folders'), h('span', null, pad2(folderCount)));

    const list = h('nav', { class: 'side-tree', 'aria-label': 'Vault' });
    if (this.vault && !this.tree.length) {
      list.append(h('div', { class: 'side-empty hand' }, 'empty vault — make a note!'));
    }
    list.append(...this.rows(this.tree, 0));

    this.container.replaceChildren(vaultRow, label, list);
    list.scrollTop = scrollTop;
  }

  rows(nodes, depth) {
    const out = [];
    for (const node of nodes.filter((n) => !n.quiet)) {
      if (node.type === 'folder') {
        out.push(this.folderRow(node, depth));
        if (this.expanded.has(node.path)) out.push(...this.rows(node.children, depth + 1));
      } else {
        out.push(this.fileRow(node, depth));
      }
    }
    return out;
  }

  folderRow(node, depth) {
    const open = this.expanded.has(node.path);
    const current = this.active.kind === 'folder' && this.active.path === node.path;
    return this.draggable(h('div', {
      class: `side-row side-folder${current ? ' is-current' : ''}`,
      style: `padding-left: ${4 + depth * 14}px`,
      oncontextmenu: (event) => this.onColorMenu(event, node, 'folder'),
      ondblclick: (event) => this.onColorMenu(event, node, 'folder'),
    },
      h('button', {
        class: `side-caret${open ? ' is-open' : ''}`,
        'aria-label': `${open ? 'Collapse' : 'Expand'} ${node.name}`,
        'aria-expanded': String(open),
        onclick: () => {
          if (open) this.expanded.delete(node.path);
          else this.expanded.add(node.path);
          this.render();
        },
      }, icon('chevron', 11)),
      h('button', {
        class: 'side-name',
        title: node.path,
        onclick: () => {
          this.expanded.add(node.path);
          this.onOpenFolder(node.path);
        },
      },
      h('span', { class: 'swatch', style: `background: ${colorOf(node)}` }),
      node.name),
    ), node);
  }

  fileRow(node, depth) {
    const active = this.active.kind === 'file' && this.active.path === node.path;
    return this.draggable(h('button', {
      class: `side-row side-file${active ? ' is-active' : ''}`,
      style: `padding-left: ${26 + depth * 14}px`,
      title: node.path,
      onclick: () => this.onOpenFile(node.path),
      oncontextmenu: (event) => this.onColorMenu(event, node, 'file'),
      ondblclick: (event) => this.onColorMenu(event, node, 'file'),
    }, h('span', { class: 'swatch swatch-dot', style: `background: ${colorOf(node)}` }), noteName(node.path)), node);
  }

  // ---------- Dragging to move and reorder ----------

  draggable(row, node) {
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      this.dragging = node;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.path);
      row.classList.add('is-dragged');
    });
    row.addEventListener('dragend', () => {
      this.dragging = null;
      row.classList.remove('is-dragged');
      this.clearDrop();
    });
    return this.dropTarget(row, node, false);
  }

  clearDrop() {
    clearTimeout(this.openTimer);
    this.container.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
  }

  // Where would a drop on `node` land? 'before' / 'after' (reorder), 'into' (a folder).
  zoneFor(event, row, node, onlyInto) {
    const item = this.dragging;
    if (!item || item.path === node.path) return null;
    // A folder can't go inside itself.
    if (item.type === 'folder' && (node.path === item.path || node.path.startsWith(`${item.path}/`))) return null;
    if (onlyInto) return 'into';
    const box = row.getBoundingClientRect();
    const y = (event.clientY - box.top) / box.height;
    if (node.type === 'folder') return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into';
    return y < 0.5 ? 'before' : 'after';
  }

  dropTarget(row, node, onlyInto) {
    row.addEventListener('dragover', (event) => {
      const zone = this.zoneFor(event, row, node, onlyInto);
      if (!zone) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (row.classList.contains(`drop-${zone}`)) return;
      this.clearDrop();
      row.classList.add(`drop-${zone}`);
      // Hovering over a closed folder opens it, so you can drop deeper.
      if (zone === 'into' && node.path && !this.expanded.has(node.path)) {
        this.openTimer = setTimeout(() => {
          this.expanded.add(node.path);
          this.render();
        }, 700);
      }
    });
    row.addEventListener('dragleave', (event) => {
      if (!row.contains(event.relatedTarget)) row.classList.remove('drop-before', 'drop-after', 'drop-into');
    });
    row.addEventListener('drop', (event) => {
      const zone = this.zoneFor(event, row, node, onlyInto);
      const item = this.dragging;
      this.clearDrop();
      if (!zone || !item) return;
      event.preventDefault();
      this.dragging = null;
      this.onRearrange(item, node, zone);
    });
    return row;
  }
}
