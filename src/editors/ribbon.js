// The ribbon: a soft rounded panel of editing tools across the top of a note,
// line icons in groups — the paragraph style | bold, italic, strikethrough,
// underline, highlight, colour, link | bullet, numbered and check lists |
// quote, inline code, code block | undo, redo — then + (insert a web link,
// table, sticky, date, heatmap, divider, clear formatting) and Find. The
// note's own ⋯ menu goes in `ribbon.tail`.
// Buttons light up for whatever the cursor is in. It only edits the markdown
// text, the same as typing would. While the cursor is in a table, a Table row
// appears with the table's own tools, and the text buttons format the cell.
//
//   const ribbon = new Ribbon({ onAddSticky, onInsertTable(anchor) });
//   ribbon.connect(editorView);  ribbon.refresh();  ribbon.el  ribbon.tail

import { insertHeatmap } from '../widgets/heatmap/heatmap.js';
import { undo, redo, indentMore, indentLess } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { h, icon } from '../ui.js';
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
    const colorMore = btn(null, icon('chevronDown', 14), 'Choose text colour', (v, anchor) => this.colorMenu(anchor), 'rb-more');

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
    const insert = btn(null, icon('plus', 20), 'Insert a web link, table, sticky, date…', (v, anchor) => this.menu(anchor, 'Insert', inserts.filter(([name]) => name !== 'Link to a note' && name !== 'Inline code')), 'rb-insert');
    const sep = () => h('span', { class: 'rb-sep', 'aria-hidden': 'true' });
    const ic = (name) => icon(name, 20);
    // Quote and code block switch the line's style (and back again).
    const blockToggle = (style) => (v) => setBlockStyle(v, activeFormats(v.state).style === style ? 'normal' : style);
    this.blockButtons = [];
    const block = (style, iconName, title) => {
      const b = btn(null, ic(iconName), title, blockToggle(style));
      b.dataset.block = style;
      this.blockButtons.push(b);
      return b;
    };

    this.tail = h('span', { class: 'rb-tail' });
    this.el = h('div', { class: 'ribbon', role: 'toolbar', 'aria-label': 'Formatting' },
      h('div', { class: 'rb-row' },
        h('span', { class: 'rb-style-wrap' }, this.style),
        sep(),
        btn('bold', ic('bold'), 'Bold (⌘B)', (v) => toggleWrap(v, '**')),
        btn('italic', ic('italic'), 'Italic (⌘I)', (v) => toggleWrap(v, '*')),
        btn('strike', ic('strike'), 'Strikethrough (⌘⇧X)', (v) => toggleWrap(v, '~~')),
        btn('underline', ic('underline'), 'Underline (⌘U)', (v) => toggleWrap(v, '<u>', '</u>')),
        btn('highlight', ic('highlighter'), 'Highlight', (v) => toggleWrap(v, '==')),
        h('span', { class: 'rb-split' }, colorApply, colorMore),
        btn(null, ic('link'), 'Link to a note (⌘K)', (v) => toggleWrap(v, '[[', ']]')),
        sep(),
        btn('bullet', ic('listBullet'), 'Bullet list', (v) => toggleLinePrefix(v, '- ', /^\s*[-*+]\s(?!\[[ xX]\])/)),
        btn('numbered', ic('listNumber'), 'Numbered list', (v) => toggleNumbered(v)),
        btn('task', ic('listCheck'), 'Checklist', (v) => toggleLinePrefix(v, '- [ ] ', /^\s*[-*+]\s\[[ xX]\]\s/)),
        sep(),
        block('quote', 'quote', 'Quote'),
        btn('code', ic('code'), 'Inline code', (v) => toggleWrap(v, '`')),
        block('code', 'codeBlock', 'Code block'),
        sep(),
        btn(null, ic('undo'), 'Undo (⌘Z)', (v) => { undo(v); v.focus(); }),
        btn(null, ic('redo'), 'Redo (⌘⇧Z)', (v) => { redo(v); v.focus(); }),
        h('span', { class: 'rb-fill' }),
        insert,
        btn(null, icon('search', 19), 'Find & replace (⌘F)', (v) => openSearchPanel(v)),
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
      for (const b of this.blockButtons || []) {
        const on = active.style === b.dataset.block;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      }
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
