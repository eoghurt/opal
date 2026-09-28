// Sidebar: the vault's folder tree — the second way to get around.
// Clicking a folder's name opens its home page; the arrow just expands it.

import { h, icon } from './ui.js';
import { slotFor } from './palettes.js';
import { noteName, pad2 } from './format.js';

export class Sidebar {
  constructor(container, { onOpenFile, onOpenFolder, onSwitchVault }) {
    this.container = container;
    this.onOpenFile = onOpenFile;
    this.onOpenFolder = onOpenFolder;
    this.onSwitchVault = onSwitchVault;
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
      h('button', {
        class: `side-vault-name${this.active.kind === 'folder' && this.active.path === '' ? ' is-current' : ''}`,
        title: this.vault ? this.vault.path : '',
        onclick: () => this.vault && this.onOpenFolder(''),
      }, this.vault ? this.vault.name : 'No vault'),
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
    for (const node of nodes) {
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
    return h('div', { class: `side-row side-folder${current ? ' is-current' : ''}`, style: `padding-left: ${4 + depth * 14}px` },
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
      h('span', { class: 'swatch', style: `background: var(--c${slotFor(node.path)})` }),
      node.name),
    );
  }

  fileRow(node, depth) {
    const active = this.active.kind === 'file' && this.active.path === node.path;
    return h('button', {
      class: `side-row side-file${active ? ' is-active' : ''}`,
      style: `padding-left: ${26 + depth * 14}px`,
      title: node.path,
      onclick: () => this.onOpenFile(node.path),
    }, noteName(node.path));
  }
}
