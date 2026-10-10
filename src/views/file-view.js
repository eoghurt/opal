// File view: a PDF, picture, video or Office file on screen, the same way
// as a note: one slim bar across the top (what it is, Open in its own app,
// and a ⋯ menu with Details and Show in Finder), the viewer taking up the
// rest. Details is a card over the page: folder, size, dates, colour and the
// other things in the folder.

import { h, icon } from '../ui.js';
import { colorOf, swatchRow } from '../item-colors.js';
import { noteName, parentOf, shortDate, clockTime, relativeDay, pad2 } from '../format.js';
import { findFile, findFolder } from '../tree.js';
import { kindOf, kindLabel, formatSize } from '../file-types.js';

export class FileView {
  constructor(container, { filePath, vaultName, onOpenFile, onOpenFolder, onSetColor }) {
    this.filePath = filePath;
    this.folderPath = parentOf(filePath);
    this.vaultName = vaultName;
    this.kind = kindOf(filePath);
    this.handlers = { onOpenFile, onOpenFolder, onSetColor };
    this.tree = [];

    this.info = h('span', { class: 'file-bar-info' });
    this.bar = h('div', { class: 'file-bar', role: 'toolbar', 'aria-label': 'File' },
      this.info,
      h('span', { class: 'rb-fill' }),
      h('button', { class: 'file-bar-open', onclick: () => this.run(() => window.opal.openExternal(this.filePath)) }, 'Open in its own app'),
      h('button', { class: 'rb-btn rb-more-menu', title: 'Details, Show in Finder', 'aria-label': 'More', 'aria-haspopup': 'menu', onclick: (e) => this.moreMenu(e.currentTarget) }, icon('more', 16)));
    this.leftBody = h('div', { class: 'note-details-main' });
    this.details = h('aside', { class: 'note-details', 'aria-label': 'File details', hidden: true },
      h('div', { class: 'note-details-head' },
        h('b', null, 'Details'),
        h('button', { class: 'note-details-close', 'aria-label': 'Close details', title: 'Close (Esc)', onclick: () => this.showDetails(false) }, icon('x', 14))),
      this.leftBody);
    this.chips = h('div', { class: 'note-chips' }); // (not shown)
    this.viewerHost = h('div', { class: 'file-viewer' });
    container.replaceChildren(h('div', { class: 'note-view is-file is-single' },
      h('div', { class: 'note-center file-center' }, this.bar, this.details, this.viewerHost)));
  }

  setTree(tree) {
    this.tree = tree;
    this.render();
  }

  setText() {}

  folderName() {
    return this.folderPath ? this.folderPath.split('/').pop() : this.vaultName;
  }

  showDetails(on = this.details.hidden) {
    this.details.hidden = !on;
    if (on) {
      const esc = (e) => {
        if (e.key === 'Escape' && !this.details.hidden) this.showDetails(false);
        if (this.details.hidden) document.removeEventListener('keydown', esc);
      };
      document.addEventListener('keydown', esc);
    }
  }

  moreMenu(anchor) {
    const items = [
      ['Details', () => this.showDetails()],
      ['Show in Finder', () => this.run(() => window.opal.revealInFinder(this.filePath))],
    ];
    document.querySelector('.note-more-menu')?.remove();
    const menu = h('div', { class: 'rb-color-menu rb-menu note-more-menu', role: 'menu', 'aria-label': 'File' },
      items.map(([label, run]) => h('button', { type: 'button', class: 'rb-color-choice', role: 'menuitem', onclick: () => { close(); run(); } }, label)));
    document.body.append(menu);
    const box = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, box.right - menu.offsetWidth)}px`;
    menu.style.top = `${box.bottom + 4}px`;
    const away = (e) => { if (!menu.contains(e.target) && e.target !== anchor) close(); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    function close() {
      menu.remove();
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    }
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
  }

  render() {
    const node = findFile(this.tree, this.filePath);
    const folderColor = colorOf(this.folderPath ? findFolder(this.tree, this.folderPath, this.vaultName) : null);
    const fileName = this.filePath.split('/').pop();

    this.info.replaceChildren(
      h('span', { class: 'swatch', style: `background: ${colorOf(node)}` }),
      h('b', null, kindLabel(this.kind)),
      h('span', null, ` · ${formatSize(node && node.size)} · view only`));

    const row = (term, ...value) => [h('dt', null, term), h('dd', null, ...value)];
    const details = h('dl', { class: 'meta-list' },
      row('Folder', h('span', { class: 'swatch', style: `background: ${folderColor}` }), this.folderPath || 'Vault root'),
      row('File', fileName),
      row('Kind', kindLabel(this.kind)),
      row('Size', formatSize(node && node.size)),
      row('Created', node && node.created ? shortDate(node.created) : '—'),
      row('Edited', node && node.modified ? `${relativeDay(node.modified)} ${clockTime(node.modified)}` : '—'),
    );

    const folder = findFolder(this.tree, this.folderPath, this.vaultName);
    const siblings = folder ? folder.children.filter((n) => n.type === 'file' && (!n.quiet || n.path === this.filePath)) : [];
    const list = h('div', { class: 'sibling-list' },
      siblings.map((file) => {
        const active = file.path === this.filePath;
        return h('button', {
          class: `sibling${active ? ' is-active' : ''}`,
          'aria-current': active ? 'page' : null,
          onclick: () => this.handlers.onOpenFile(file.path),
        }, h('span', { class: 'swatch', style: `background: ${colorOf(file)}` }), noteName(file.path));
      }));

    const colour = h('div', { class: 'side-block' },
      h('span', { class: 'mono-label' }, 'Colour'),
      swatchRow(node && node.color, (name) => this.handlers.onSetColor(this.filePath, 'file', name)));

    this.leftBody.replaceChildren(
      details,
      colour,
      h('div', { class: 'side-label mono-label' }, h('span', null, `Also in ${this.folderName()}`), h('span', null, pad2(siblings.length))),
      list,
    );
  }

  async run(action) {
    try {
      await action();
    } catch (err) {
      alert(`That didn't work.\n\n${err.message}`);
    }
  }
}
