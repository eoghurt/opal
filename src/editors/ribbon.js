// The ribbon: one slim, quiet row of editing tools across the top of a note:
// undo, the paragraph style, bold / italic / underline / strike / highlight /
// colour, lists, and an Insert menu (links, table, sticky, date, heatmap,
// divider, code, clear formatting); Find on the right. The note's own ⋯ menu
// goes in `ribbon.tail`.
// Buttons light up for whatever the cursor is in. It only edits the markdown
// text, the same as typing would. While the cursor is in a table, a Table row
// appears with the table's own tools, and the text buttons format the cell.
//
//   const ribbon = new Ribbon({ onAddSticky, onInsertTable(anchor) });
//   ribbon.connect(editorView);  ribbon.refresh();  ribbon.el  ribbon.tail

import { insertHeatmap } from '../widgets/heatmap/heatmap.js';
import { undo, redo, indentMore, indentLess } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { h } from '../ui.js';
import {
  toggleWrap, toggleLinePrefix, clearFormatting, setTextColor, toggleNumbered, setBlockStyle,
  insertDivider, insertWebLink, insertText, activeFormats,
} from './markdown-live.js';

const TEXT_COLORS = [
  ['Ink', null],
  ['Red', '#D93A26'],
  ['Orange', '#E07B00'],
  ['Green', '#1E8A4C'],
  ['Teal', '#0F8A8A'],
  ['Blue', '#1F5FBF'],
  ['Violet', '#6B3FD4'],
  ['Pink', '#C8338A'],
  ['Grey', '#8A8578'],
];

// Text buttons that also work on the text in a table cell.
const CELL_FORMATS = new Set(['bold', 'italic', 'underline', 'strike', 'highlight']);

const STYLES = [
  ['normal', 'Normal text'],
  ['h1', 'Heading 1'],
  ['h2', 'Heading 2'],
  ['h3', 'Heading 3'],
  ['h4', 'Heading 4'],
  ['quote', 'Quote'],
  ['code', 'Code block'],
];

function today() {
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export class Ribbon {
  constructor({ onAddSticky, onInsertTable }) {
    this.view = null;
    this.toggles = new Map(); // format name → button
    this.lastColor = '#D93A26';

    const btn = (id, label, title, run, cls = '') => {
      const b = h('button', {
        type: 'button',
        class: `rb-btn ${cls}`,
        title,
        'aria-label': title,
        // mousedown so the editor keeps its selection.
        onmousedown: (e) => {
          e.preventDefault();
          if (id && this.inTable() && this.table.format && CELL_FORMATS.has(id)) {
            this.table.format(id);
            return;
          }
          if (id === 'color' && this.inTable()) {
            this.table.setColor('color', this.lastColor);
            return;
          }
          if (this.view) run(this.view, e.currentTarget);
        },
      }, label);
      if (id) this.toggles.set(id, b);
      return b;
    };
    const gap = () => h('span', { class: 'rb-gap', 'aria-hidden': 'true' });

    this.style = h('select', { class: 'rb-style', 'aria-label': 'Paragraph style', title: 'Paragraph style' },
      STYLES.map(([value, label]) => h('option', { value }, label)));
    this.style.addEventListener('change', () => {
      if (this.view) setBlockStyle(this.view, this.style.value);
      this.refresh();
    });

    // Text colour: the A applies the last colour; ▾ picks another.
    this.colorBar = h('span', { class: 'rb-color-bar', style: `background: ${this.lastColor}` });
    const colorApply = btn('color', h('span', { class: 'rb-color-a' }, 'A', this.colorBar), 'Text colour', (v) => setTextColor(v, this.lastColor));
    const colorMore = btn(null, '▾', 'Choose text colour', (v, anchor) => this.colorMenu(anchor), 'rb-more');

    // Everything you add rather than format, in one menu.
    const inserts = [
      ['Link to a note', '⌘K', (v) => toggleWrap(v, '[[', ']]')],
      ['Web link', '', (v) => insertWebLink(v)],
      ['Table', '', (v, anchor) => onInsertTable(anchor)],
      ['Sticky note', '', () => onAddSticky()],
      ["Today's date", '', (v) => insertText(v, today())],
      ['Heatmap', '', (v) => insertHeatmap(v)],
      ['Divider line', '', (v) => insertDivider(v)],
      ['Inline code', '', (v) => toggleWrap(v, '`')],
      ['Clear formatting', '', (v) => clearFormatting(v)],
    ];
    const insert = btn(null, h('span', null, 'Insert', h('span', { class: 'rb-caret' }, '▾')), 'Insert a link, table, sticky, date…', (v, anchor) => this.menu(anchor, 'Insert', inserts), 'is-word rb-insert');

    this.tail = h('span', { class: 'rb-tail' });
    this.el = h('div', { class: 'ribbon', role: 'toolbar', 'aria-label': 'Formatting' },
      h('div', { class: 'rb-row' },
        btn(null, '↶', 'Undo (⌘Z)', (v) => { undo(v); v.focus(); }),
        btn(null, '↷', 'Redo (⌘⇧Z)', (v) => { redo(v); v.focus(); }),
        gap(),
        this.style,
        gap(),
        btn('bold', 'B', 'Bold (⌘B)', (v) => toggleWrap(v, '**'), 'is-bold'),
        btn('italic', 'I', 'Italic (⌘I)', (v) => toggleWrap(v, '*'), 'is-italic'),
        btn('underline', 'U', 'Underline (⌘U)', (v) => toggleWrap(v, '<u>', '</u>'), 'is-underline'),
        btn('strike', 'S', 'Strikethrough (⌘⇧X)', (v) => toggleWrap(v, '~~'), 'is-strike'),
        btn('highlight', 'H', 'Highlight', (v) => toggleWrap(v, '=='), 'is-highlight'),
        h('span', { class: 'rb-split' }, colorApply, colorMore),
        gap(),
        btn('bullet', '•', 'Bullet list', (v) => toggleLinePrefix(v, '- ', /^\s*[-*+]\s(?!\[[ xX]\])/)),
        btn('numbered', '1.', 'Numbered list', (v) => toggleNumbered(v), 'is-mono'),
        btn('task', '☐', 'Checklist', (v) => toggleLinePrefix(v, '- [ ] ', /^\s*[-*+]\s\[[ xX]\]\s/)),
        gap(),
        insert,
        h('span', { class: 'rb-fill' }),
        btn(null, 'Find', 'Find & replace (⌘F)', (v) => openSearchPanel(v), 'is-word'),
        this.tail));

    // The Table row: the tools of whichever table the cursor is in.
    this.tableTools = h('div', { class: 'rb-table-tools' });
    this.tableRow = h('div', { class: 'rb-table', role: 'group', 'aria-label': 'Table' },
      h('span', { class: 'rb-table-label' }, 'Table'), this.tableTools);
    this.tableRow.hidden = true;
    this.el.append(this.tableRow);
    this.table = null;
    const onTable = (event) => {
      if (!this.el.isConnected) {
        window.removeEventListener('opal:table', onTable);
        return;
      }
      this.showTable(event.detail);
    };
    window.addEventListener('opal:table', onTable);
  }

  showTable(table) {
    this.table = table;
    this.tableRow.hidden = !table;
    this.tableTools.replaceChildren(...(table ? [table.toolbar] : []));
  }

  // Is the cursor in a cell of the active table?
  inTable() {
    return Boolean(this.table && this.table.cellOf && this.table.cellOf(document.activeElement));
  }

  connect(view) {
    this.view = view;
    this.refresh();
  }

  // Lights up the buttons for what the cursor is in (at most once a frame).
  refresh() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = null;
      if (!this.view) return;
      const active = activeFormats(this.view.state);
      for (const [id, button] of this.toggles) {
        const on = id === 'color' ? !!active.color : !!active[id];
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-pressed', String(on));
      }
      if (this.style.value !== active.style) this.style.value = active.style;
    });
  }

  colorMenu(anchor) {
    this.closeColorMenu();
    const menu = h('div', { class: 'rb-color-menu', role: 'menu', 'aria-label': 'Text colour' },
      TEXT_COLORS.map(([name, hex]) => h('button', {
        type: 'button',
        class: 'rb-color-choice',
        role: 'menuitem',
        title: name,
        'aria-label': name,
        onmousedown: (e) => {
          e.preventDefault();
          if (hex) {
            this.lastColor = hex;
            this.colorBar.style.background = hex;
          }
          if (this.inTable()) this.table.setColor('color', hex);
          else if (this.view) setTextColor(this.view, hex);
          this.closeColorMenu();
          this.refresh();
        },
      }, h('span', { class: 'rb-color-dot', style: `background: ${hex || 'var(--ink)'}` }), name)));
    document.body.append(menu);
    const box = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(box.left - 30, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${box.bottom + 4}px`;
    const away = (e) => {
      if (!menu.contains(e.target)) this.closeColorMenu();
    };
    const esc = (e) => {
      if (e.key === 'Escape') this.closeColorMenu();
    };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    this.closeColorMenu = () => {
      menu.remove();
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      this.closeColorMenu = () => {};
    };
  }

  closeColorMenu() {}

  // A small menu under a button: [label, shortcut, run(view, anchor)].
  menu(anchor, label, items) {
    this.closeColorMenu();
    const menu = h('div', { class: 'rb-color-menu rb-menu', role: 'menu', 'aria-label': label },
      items.map(([name, keys, run]) => h('button', {
        type: 'button',
        class: 'rb-color-choice',
        role: 'menuitem',
        onmousedown: (e) => {
          e.preventDefault();
          this.closeColorMenu();
          if (this.view) run(this.view, anchor);
          this.refresh();
        },
      }, h('span', null, name), keys ? h('span', { class: 'rb-menu-keys' }, keys) : null)));
    document.body.append(menu);
    const box = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(box.left, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${box.bottom + 4}px`;
    const away = (e) => {
      if (!menu.contains(e.target)) this.closeColorMenu();
    };
    const esc = (e) => {
      if (e.key === 'Escape') this.closeColorMenu();
    };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    document.addEventListener('keydown', esc);
    this.closeColorMenu = () => {
      menu.remove();
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      this.closeColorMenu = () => {};
    };
  }
}
