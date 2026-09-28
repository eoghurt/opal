// File view: a PDF, picture, video or Office file on screen. Details and
// actions on the left (plus the other things in its folder), the viewer
// taking up the rest.

import { h } from '../ui.js';
import { makePanel } from '../panel.js';
import { slotFor } from '../palettes.js';
import { noteName, parentOf, shortDate, clockTime, relativeDay, pad2 } from '../format.js';
import { findFile, findFolder } from '../tree.js';
import { kindOf, kindLabel, formatSize } from '../file-types.js';

export class FileView {
  constructor(container, { filePath, vaultName, onOpenFile, onOpenFolder }) {
    this.filePath = filePath;
    this.folderPath = parentOf(filePath);
    this.vaultName = vaultName;
    this.kind = kindOf(filePath);
    this.handlers = { onOpenFile, onOpenFolder };
    this.tree = [];

    this.left = h('aside', { class: 'note-left file-left', 'aria-label': 'File details' });
    this.chips = h('div', { class: 'note-chips' });
    this.viewerHost = h('div', { class: 'file-viewer' });
    container.replaceChildren(h('div', { class: 'note-view is-file' },
      this.left,
      h('div', { class: 'note-center file-center' }, this.chips, this.viewerHost)));
    this.leftBody = makePanel(this.left, { id: 'file-left', side: 'left', label: 'Details', width: 280 });
  }

  setTree(tree) {
    this.tree = tree;
    this.render();
  }

  setText() {}

  folderName() {
    return this.folderPath ? this.folderPath.split('/').pop() : this.vaultName;
  }

  render() {
    const node = findFile(this.tree, this.filePath);
    const slot = slotFor(this.folderPath || this.vaultName);
    const fileName = this.filePath.split('/').pop();

    this.chips.replaceChildren(
      h('span', { class: 'chip', style: 'background: var(--c3)' }, kindLabel(this.kind)),
      h('button', { class: 'chip', style: `background: var(--c${slot})`, onclick: () => this.handlers.onOpenFolder(this.folderPath) }, this.folderName()),
      h('span', { class: 'chip chip-plain' }, fileName),
      h('span', { class: 'chip chip-plain chip-quiet' }, 'View only'),
    );

    const row = (term, ...value) => [h('dt', null, term), h('dd', null, ...value)];
    const details = h('dl', { class: 'meta-list' },
      row('Folder', h('span', { class: 'swatch', style: `background: var(--c${slot})` }), this.folderPath || 'Vault root'),
      row('File', fileName),
      row('Kind', kindLabel(this.kind)),
      row('Size', formatSize(node && node.size)),
      row('Created', node && node.created ? shortDate(node.created) : '—'),
      row('Edited', node && node.modified ? `${relativeDay(node.modified)} ${clockTime(node.modified)}` : '—'),
    );

    const actions = h('div', { class: 'file-actions' },
      h('button', { class: 'home-action is-primary', onclick: () => this.run(() => window.opal.openExternal(this.filePath)) }, 'Open in its own app'),
      h('button', { class: 'home-action', onclick: () => this.run(() => window.opal.revealInFinder(this.filePath)) }, 'Show in Finder'));

    const folder = findFolder(this.tree, this.folderPath, this.vaultName);
    const siblings = folder ? folder.children.filter((n) => n.type === 'file') : [];
    const list = h('div', { class: 'sibling-list' },
      siblings.map((file, i) => {
        const active = file.path === this.filePath;
        return h('button', {
          class: `sibling${active ? ' is-active' : ''}`,
          'aria-current': active ? 'page' : null,
          onclick: () => this.handlers.onOpenFile(file.path),
        }, h('span', { class: 'outline-num' }, pad2(i + 1)), noteName(file.path));
      }));

    this.leftBody.replaceChildren(
      details,
      actions,
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
