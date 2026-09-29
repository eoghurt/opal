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
import { Ribbon } from '../editors/ribbon.js';
import { editableLine } from './folder-home.js';
import { getDescription } from '../../shared/frontmatter.js';

export class NoteView {
  constructor(container, { filePath, vaultName, onOpenFile, onOpenFolder, onOpenLink, onNewNoteHere, onPalettes, onGoToLine, onAddSticky, onSetColor, onInsertTable, onRename, onDescribe }) {
    this.filePath = filePath;
    this.folderPath = parentOf(filePath);
    this.vaultName = vaultName;
    this.handlers = { onOpenFile, onOpenFolder, onOpenLink, onNewNoteHere, onPalettes, onGoToLine, onAddSticky, onSetColor, onInsertTable, onRename, onDescribe };
    this.tree = [];
    this.text = '';

    this.left = h('aside', { class: 'note-left', 'aria-label': 'Note details' });
    this.right = h('aside', { class: 'note-right', 'aria-label': 'In this folder' });
    this.chips = h('div', { class: 'note-chips' });
    this.editorHost = h('div', { class: 'note-editor' });
    this.title = this.makeTitle();
    // The line under the title: hidden until there's a description, or until
    // you press Enter on the title. Enter there goes on into the note.
    this.description = editableLine({
      className: 'note-desc',
      label: 'Note description',
      value: '',
      onSave: (text) => this.handlers.onDescribe(text),
      onDone: () => this.focusEditor(),
    });
    // The Word-style editing bar across the top (connected once the editor exists).
    this.ribbon = new Ribbon({
      onAddSticky: () => this.handlers.onAddSticky(),
      onInsertTable: (anchor) => this.tablePicker(anchor),
    });
    const center = h('div', { class: 'note-center' }, this.ribbon.el, this.chips, this.title, this.description.el, this.editorHost);
    this.center = center; // stickies sit on top of this

    container.replaceChildren(h('div', { class: 'note-view' }, this.left, center, this.right));
    this.leftBody = makePanel(this.left, { id: 'note-left', side: 'left', label: 'Details', width: 250 });
    this.rightBody = makePanel(this.right, { id: 'note-right', side: 'right', label: 'Folder', width: 250 });
  }

  // The note's name as a big title above the text. Editing it renames the
  // note's file (Enter or clicking away saves; Escape puts it back).
  makeTitle() {
    const name = noteName(this.filePath);
    const title = h('textarea', {
      class: 'display note-title',
      rows: '1',
      spellcheck: 'false',
      'aria-label': 'Note title (edit to rename)',
    });
    title.value = name;
    const fit = () => {
      title.style.height = 'auto';
      title.style.height = `${title.scrollHeight}px`;
    };
    requestAnimationFrame(fit);
    title.addEventListener('input', () => {
      // A file name can't hold line breaks or slashes.
      const clean = title.value.replace(/[\r\n]+/g, ' ').replace(/[/\\:]/g, '-');
      if (clean !== title.value) title.value = clean;
      fit();
    });
    let done = false;
    let describe = false; // Enter was pressed: open the description after
    const save = () => {
      const then = describe;
      describe = false;
      if (done) return;
      const next = title.value.trim();
      if (!next || next === name) {
        title.value = name;
        fit();
        if (then) this.description.open();
        return;
      }
      done = true;
      this.handlers.onRename(next, { describe: then }).catch((err) => {
        done = false;
        title.value = name;
        fit();
        alert(`Couldn't rename the note.\n\n${err.message}`);
      });
    };
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        describe = true;
        title.blur();
      } else if (event.key === 'Escape') {
        title.value = name;
        fit();
        title.blur();
      }
    });
    title.addEventListener('blur', save);
    return title;
  }

  focusEditor() {
    const editor = this.editorHost.querySelector('.cm-content');
    if (editor) editor.focus();
  }

  // Opens the description line for typing (after a rename with Enter).
  openDescription() {
    this.description.open();
  }

  // Hooks the ribbon up to the note's editor (a CodeMirror view).
  connectEditor(view) {
    if (view) this.ribbon.connect(view);
    else this.ribbon.el.hidden = true;
  }

  setTree(tree) {
    this.tree = tree;
    this.renderLeft();
    this.renderRight();
    this.renderChips();
  }

  setText(text) {
    this.description.set(getDescription(text));
    this.text = stripStickies(text);
    this.renderLeft();
    this.renderRight();
  }

  // Word-style size picker: hover to choose rows × columns, click to insert.
  tablePicker(anchor) {
    if (this.picker) {
      this.closePicker();
      return;
    }
    const MAX_R = 8;
    const MAX_C = 10;
    const label = h('span', { class: 'mono-label table-picker-label' }, 'Insert table');
    const cells = [];
    const grid = h('div', { class: 'table-picker-grid', role: 'grid', 'aria-label': 'Table size' });
    let rows = 3;
    let cols = 3;
    const show = (r, c) => {
      rows = r;
      cols = c;
      label.textContent = `${r} × ${c} table`;
      for (const cell of cells) cell.el.classList.toggle('is-on', cell.r <= r && cell.c <= c);
    };
    for (let r = 1; r <= MAX_R; r++) {
      for (let c = 1; c <= MAX_C; c++) {
        const el = h('button', {
          type: 'button',
          class: 'table-picker-cell',
          'aria-label': `${r} by ${c}`,
          onmouseenter: () => show(r, c),
          onfocus: () => show(r, c),
          onmousedown: (e) => e.preventDefault(),
          onclick: () => {
            this.closePicker();
            this.handlers.onInsertTable(r, c);
          },
        });
        cells.push({ el, r, c });
        grid.append(el);
      }
    }
    const picker = h('div', { class: 'table-picker', role: 'dialog', 'aria-label': 'Insert table' }, label, grid,
      h('span', { class: 'hand table-picker-hint' }, 'tip: ⌘⌥T adds a 3 × 3'));
    document.body.append(picker);
    const box = anchor.getBoundingClientRect();
    picker.style.left = `${box.left}px`;
    picker.style.top = `${box.bottom + 6}px`;
    show(3, 3);
    this.picker = picker;
    const away = (e) => {
      if (!picker.contains(e.target) && e.target !== anchor) this.closePicker();
    };
    const esc = (e) => {
      if (e.key === 'Escape') this.closePicker();
    };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    this.pickerCleanup = () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }

  closePicker() {
    if (this.picker) this.picker.remove();
    if (this.pickerCleanup) this.pickerCleanup();
    this.picker = null;
    this.pickerCleanup = null;
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
    );
  }

  renderLeft() {
    const node = findFile(this.tree, this.filePath);
    const words = (stripFrontmatter(this.text).replace(/<[^>]*>/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
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
      h('button', { class: 'dashed-button mono-label', onclick: (e) => this.handlers.onNewNoteHere(e.currentTarget) }, `+ New note in ${name}`),
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
