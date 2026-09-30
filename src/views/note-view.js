// Note view: the open note in the middle, its details on the left (folder,
// dates, word count, outline) and its folder on the right (other notes,
// links from this note). The editor itself comes from the editor registry.

import { h, icon } from '../ui.js';
import { makePanel } from '../panel.js';
import { colorOf, swatchRow } from '../item-colors.js';
import { stripFrontmatter } from '../../shared/frontmatter.js';
import { noteName, parentOf, shortDate, clockTime, relativeDay, pad2 } from '../format.js';
import { findFile, findFolder, countNotes } from '../tree.js';
import { stripStickies } from '../../shared/stickies.js';
import { Ribbon } from '../editors/ribbon.js';
import { editableLine } from './folder-home.js';
import { getDescription, getProp } from '../../shared/frontmatter.js';
import { countWords } from '../../shared/words.js';

export class NoteView {
  constructor(container, { filePath, vaultName, onOpenFile, onOpenFolder, onOpenLink, onNewNoteHere, onPalettes, onGoToLine, onAddSticky, onSetColor, onInsertTable, onRename, onDescribe, onOpenAt, onLinkMention, onHistory, onWordTarget, onTemplate, onBookmark }) {
    this.filePath = filePath;
    this.folderPath = parentOf(filePath);
    this.vaultName = vaultName;
    this.handlers = { onOpenFile, onOpenFolder, onOpenLink, onNewNoteHere, onPalettes, onGoToLine, onAddSticky, onSetColor, onInsertTable, onRename, onDescribe, onOpenAt, onLinkMention, onHistory, onWordTarget, onTemplate, onBookmark };
    this.backlinks = null; // { linked, unlinked } once loaded
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
    // Measure again once the theme's font has loaded (a different font is a
    // different height) and whenever the note gets wider or narrower.
    document.fonts.ready.then(fit);
    const refit = () => {
      if (!title.isConnected) {
        document.fonts.removeEventListener('loadingdone', refit);
        window.removeEventListener('opal:theme', refit);
        return;
      }
      requestAnimationFrame(fit);
    };
    document.fonts.addEventListener('loadingdone', refit);
    window.addEventListener('opal:theme', refit);
    let lastWidth = 0;
    new ResizeObserver(() => {
      if (title.clientWidth !== lastWidth) {
        lastWidth = title.clientWidth;
        fit();
      }
    }).observe(title);
    this.fitTitle = fit;
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
      this.handlers.onBookmark ? h('button', {
        class: `chip chip-add chip-bookmark${this.bookmarked ? ' is-on' : ''}`,
        title: this.bookmarked ? 'Remove the bookmark' : 'Bookmark this note',
        'aria-pressed': String(Boolean(this.bookmarked)),
        onclick: () => this.handlers.onBookmark(),
      }, icon('bookmark', 12), this.bookmarked ? 'Bookmarked' : 'Bookmark') : null,
      this.handlers.onTemplate ? h('button', { class: 'chip chip-add chip-template', title: 'Apply a template or a flow sheet to this note', onclick: (e) => this.handlers.onTemplate(e.currentTarget) }, 'Template') : null,
      h('button', { class: 'chip chip-add chip-history', title: 'Earlier versions of this note', onclick: () => this.handlers.onHistory() }, 'History'),
    );
  }

  setBookmarked(on) {
    if (this.bookmarked === on) return;
    this.bookmarked = on;
    this.renderChips();
  }

  // A number box for the note's word-target property (empty = none).
  targetField(target) {
    const input = h('input', {
      class: 'target-input',
      type: 'number',
      min: '0',
      step: '50',
      placeholder: 'none',
      'aria-label': 'Word target',
      value: target ? String(target) : '',
    });
    const commit = () => {
      const n = parseInt(input.value, 10);
      const next = Number.isFinite(n) && n > 0 ? n : null;
      if (next !== target) this.handlers.onWordTarget(next);
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener('blur', () => setTimeout(() => this.renderLeft(), 0));
    return input;
  }

  renderLeft() {
    const node = findFile(this.tree, this.filePath);
    // Typing a word target: don't redraw under the cursor.
    if (this.left.contains(document.activeElement) && document.activeElement.classList.contains('target-input')) return;
    const words = countWords(this.text);
    const target = parseInt(String(getProp(this.text, 'word-target') || ''), 10) || null;
    const links = linksIn(this.text);
    const row = (term, ...value) => [h('dt', null, term), h('dd', null, ...value)];

    const details = h('dl', { class: 'meta-list' },
      row('Folder', h('span', { class: 'swatch', style: `background: ${colorOf(this.folderPath ? this.folderNode() : null)}` }), this.folderPath || 'Vault root'),
      row('File', `${noteName(this.filePath)}.md`),
      row('Created', node && node.created ? shortDate(node.created) : '—'),
      row('Edited', node && node.modified ? `${relativeDay(node.modified)} ${clockTime(node.modified)}` : '—'),
      row('Words', words.toLocaleString()),
      row('Target', this.targetField(target)),
      row('Links', `${links.length} out`),
    );
    const progress = target ? progressBar(words, target) : null;

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

    this.leftBody.replaceChildren(details, progress || '', outline, colour);
  }

  // Notes linking here, and notes that mention this one's name without a link.
  setBacklinks(backlinks) {
    this.backlinks = backlinks;
    this.renderRight();
  }

  backlinkBlock() {
    const data = this.backlinks;
    const where = (p) => {
      const folder = parentOf(p);
      return folder ? folder.split('/').pop() : this.vaultName;
    };
    const linked = data ? data.linked : [];
    const unlinked = data ? data.unlinked : [];
    const item = (hit, extra) => h('div', { class: 'backlink' },
      h('button', { class: 'backlink-open', title: `${hit.path}, line ${hit.line}`, onclick: () => this.handlers.onOpenAt(hit.path, hit.line) },
        h('span', { class: 'backlink-name' }, noteName(hit.path), h('span', { class: 'backlink-where' }, where(hit.path))),
        h('span', { class: 'backlink-line' }, ...(extra ? extra.snippet : [hit.text]))),
      extra ? extra.button : null);
    const mentionSnippet = (hit) => {
      const start = hit.column - (hit.trim || 0);
      return [hit.text.slice(0, start), h('mark', { class: 'backlink-mark' }, hit.text.slice(start, start + hit.length)), hit.text.slice(start + hit.length)];
    };
    return h('div', { class: 'side-block side-backlinks' },
      h('span', { class: 'side-label-inline mono-label' }, h('span', null, 'Linked from'), h('span', null, data ? pad2(linked.length) : '…')),
      data && !linked.length ? h('span', { class: 'hand side-hint' }, 'no notes link here yet') : null,
      linked.map((hit) => item(hit)),
      h('span', { class: 'side-label-inline mono-label' }, h('span', null, 'Unlinked mentions'), h('span', null, data ? pad2(unlinked.length) : '…')),
      data && !unlinked.length ? h('span', { class: 'hand side-hint' }, 'no loose mentions') : null,
      unlinked.map((hit) => item(hit, {
        snippet: mentionSnippet(hit),
        button: h('button', { class: 'backlink-link', title: 'Turn this mention into a [[link]]', onclick: () => this.handlers.onLinkMention(hit) }, 'Link'),
      })));
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
      this.backlinkBlock(),
      h('div', { class: 'grow' }),
      linkBlock,
    );
  }
}

// A bar showing words against a target (shared with folder homes).
export function progressBar(words, target) {
  const share = Math.min(1, words / target);
  return h('div', { class: 'word-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(target), 'aria-valuenow': String(words), title: `${words.toLocaleString()} of ${target.toLocaleString()} words` },
    h('span', { class: 'word-progress-track' }, h('span', { class: `word-progress-fill${share >= 1 ? ' is-done' : ''}`, style: `width: ${Math.round(share * 100)}%` })),
    h('span', { class: 'word-progress-label' }, share >= 1 ? `${target.toLocaleString()} words — target met` : `${words.toLocaleString()} / ${target.toLocaleString()} words · ${Math.round(share * 100)}%`));
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
