// Note view: the open note in the middle, its details on the left (folder,
// dates, word count, outline) and its folder on the right (other notes,
// links from this note). The editor itself comes from the editor registry.

import { h } from '../ui.js';
import { makePanel } from '../panel.js';
import { colorOf, swatchRow } from '../item-colors.js';
import { stripFrontmatter } from '../../shared/frontmatter.js';
import { noteName, parentOf, shortDate, clockTime, relativeDay, pad2 } from '../format.js';
import { findFile, findFolder, countNotes } from '../tree.js';
import { stripStickies } from '../../shared/stickies.js';

export class NoteView {
  constructor(container, { filePath, vaultName, onOpenFile, onOpenFolder, onOpenLink, onNewNoteHere, onPalettes, onGoToLine, onAddSticky, onSetColor }) {
    this.filePath = filePath;
    this.folderPath = parentOf(filePath);
    this.vaultName = vaultName;
    this.handlers = { onOpenFile, onOpenFolder, onOpenLink, onNewNoteHere, onPalettes, onGoToLine, onAddSticky, onSetColor };
    this.tree = [];
    this.text = '';

    this.left = h('aside', { class: 'note-left', 'aria-label': 'Note details' });
    this.right = h('aside', { class: 'note-right', 'aria-label': 'In this folder' });
    this.chips = h('div', { class: 'note-chips' });
    this.editorHost = h('div', { class: 'note-editor' });
    const center = h('div', { class: 'note-center' }, this.chips, this.editorHost);
    this.center = center; // stickies sit on top of this

    container.replaceChildren(h('div', { class: 'note-view' }, this.left, center, this.right));
    this.leftBody = makePanel(this.left, { id: 'note-left', side: 'left', label: 'Details', width: 250 });
    this.rightBody = makePanel(this.right, { id: 'note-right', side: 'right', label: 'Folder', width: 250 });
  }

  setTree(tree) {
    this.tree = tree;
    this.renderLeft();
    this.renderRight();
    this.renderChips();
  }

  setText(text) {
    this.text = stripStickies(text);
    this.renderLeft();
    this.renderRight();
  }

  folderName() {
    return this.folderPath ? this.folderPath.split('/').pop() : this.vaultName;
  }

  folderNode() {
    return findFolder(this.tree, this.folderPath, this.vaultName);
  }

  renderChips() {
    const note = findFile(this.tree, this.filePath);
    this.chips.replaceChildren(
      h('span', { class: 'chip', style: `background: ${colorOf(note)}` }, 'Note'),
      h('button', { class: 'chip', style: `background: ${colorOf(this.folderPath ? this.folderNode() : null)}`, onclick: () => this.handlers.onOpenFolder(this.folderPath) }, this.folderName()),
      h('span', { class: 'chip chip-plain' }, `${noteName(this.filePath)}.md`),
      h('button', { class: 'chip chip-add', onclick: () => this.handlers.onAddSticky() }, '+ Sticky'),
    );
  }

  renderLeft() {
    const node = findFile(this.tree, this.filePath);
    const words = (stripFrontmatter(this.text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    const links = linksIn(this.text);
    const row = (term, ...value) => [h('dt', null, term), h('dd', null, ...value)];

    const details = h('dl', { class: 'meta-list' },
      row('Folder', h('span', { class: 'swatch', style: `background: ${colorOf(this.folderPath ? this.folderNode() : null)}` }), this.folderPath || 'Vault root'),
      row('File', `${noteName(this.filePath)}.md`),
      row('Created', node && node.created ? shortDate(node.created) : '—'),
      row('Edited', node && node.modified ? `${relativeDay(node.modified)} ${clockTime(node.modified)}` : '—'),
      row('Words', String(words)),
      row('Links', `${links.length} out`),
    );

    const headings = outlineOf(this.text);
    const outline = h('div', { class: 'side-block' },
      h('span', { class: 'mono-label' }, 'Outline'),
      headings.length
        ? headings.map((hd, i) => h('button', {
          class: 'outline-item',
          style: `padding-left: ${(hd.level - 1) * 10}px`,
          onclick: () => this.handlers.onGoToLine(hd.line),
        }, h('span', { class: 'outline-num' }, pad2(i + 1)), hd.text))
        : h('span', { class: 'hand side-hint' }, 'add # headings to get an outline'));

    const colour = h('div', { class: 'side-block' },
      h('span', { class: 'mono-label' }, 'Colour'),
      swatchRow(node && node.color, (name) => this.handlers.onSetColor(this.filePath, 'file', name)),
      h('button', { class: 'serif-link', onclick: this.handlers.onPalettes }, 'Change palette →'));

    this.leftBody.replaceChildren(details, outline, colour);
  }

  renderRight() {
    const folder = findFolder(this.tree, this.folderPath, this.vaultName);
    const siblings = folder ? folder.children.filter((n) => n.type === 'file' && (!n.quiet || n.path === this.filePath)) : [];
    const name = this.folderName();

    const home = h('button', { class: 'folder-card', style: `background: ${colorOf(this.folderPath ? folder : null)}`, onclick: () => this.handlers.onOpenFolder(this.folderPath) },
      h('span', { class: 'mono-label' }, 'Folder home'),
      h('span', { class: 'display folder-card-name' }, name),
      h('span', { class: 'serif-i' }, folder ? `${countNotes(folder)} notes` : ''));

    const list = h('div', { class: 'sibling-list' },
      siblings.map((file, i) => {
        const active = file.path === this.filePath;
        return h('button', {
          class: `sibling${active ? ' is-active' : ''}`,
          'aria-current': active ? 'page' : null,
          onclick: () => this.handlers.onOpenFile(file.path),
        }, h('span', { class: 'swatch', style: `background: ${colorOf(file)}` }), noteName(file.path));
      }));

    const links = linksIn(this.text);
    const linkBlock = h('div', { class: 'side-block side-links' },
      h('span', { class: 'mono-label' }, 'Links from here'),
      links.length
        ? h('div', { class: 'link-chips' }, links.map((target) => h('button', { class: 'link-chip', onclick: () => this.handlers.onOpenLink(target) }, target)))
        : h('span', { class: 'hand side-hint' }, 'type [[a name]] to link'));

    this.rightBody.replaceChildren(
      home,
      h('div', { class: 'side-label mono-label' }, h('span', null, `Also in ${name}`), h('span', null, pad2(siblings.length))),
      list,
      h('button', { class: 'dashed-button mono-label', onclick: this.handlers.onNewNoteHere }, `+ New note in ${name}`),
      h('div', { class: 'grow' }),
      linkBlock,
    );
  }
}

// Unique [[link]] targets in the order they appear.
function linksIn(text) {
  const seen = new Set();
  for (const match of text.matchAll(/\[\[([^[\]\n]+?)\]\]/g)) {
    const target = match[1].split('|')[0].split('#')[0].trim();
    if (target) seen.add(target);
    if (seen.size >= 24) break;
  }
  return [...seen];
}

// Markdown headings (outside code blocks): [{ level, text, line }]
function outlineOf(text) {
  const out = [];
  let inCode = false;
  text.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) return;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match && out.length < 30) out.push({ level: match[1].length, text: match[2], line: i + 1 });
  });
  return out;
}
