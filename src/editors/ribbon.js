// The ribbon: a Word-style editing bar across the top of a note. Grouped
// buttons for history, styles, text, paragraphs, inserting things and find.
// Buttons light up for whatever the cursor is in. It only edits the markdown
// text, the same as typing would. While the cursor is in a table, a Table row
// appears with the table's own tools, and the text buttons format the cell.
//
//   const ribbon = new Ribbon({ onAddSticky, onInsertTable(anchor) });
//   ribbon.connect(editorView);  ribbon.refresh();  ribbon.el

import { insertHeatmap } from '../heatmap.js';
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
    const group = (name, ...items) => h('div', { class: 'rb-group', role: 'group', 'aria-label': name },
      h('div', { class: 'rb-items' }, items),
      h('span', { class: 'rb-caption' }, name));

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

    this.el = h('div', { class: 'ribbon', role: 'toolbar', 'aria-label': 'Formatting' },
      group('Undo',
        btn(null, '↶', 'Undo (⌘Z)', (v) => { undo(v); v.focus(); }),
        btn(null, '↷', 'Redo (⌘⇧Z)', (v) => { redo(v); v.focus(); })),
      group('Style', this.style),
      group('Text',
        btn('bold', 'B', 'Bold (⌘B)', (v) => toggleWrap(v, '**'), 'is-bold'),
        btn('italic', 'I', 'Italic (⌘I)', (v) => toggleWrap(v, '*'), 'is-italic'),
        btn('underline', 'U', 'Underline (⌘U)', (v) => toggleWrap(v, '<u>', '</u>'), 'is-underline'),
        btn('strike', 'S', 'Strikethrough (⌘⇧X)', (v) => toggleWrap(v, '~~'), 'is-strike'),
        btn('highlight', 'Hi', 'Highlight', (v) => toggleWrap(v, '=='), 'is-highlight'),
        h('span', { class: 'rb-split' }, colorApply, colorMore),
        btn('code', '</>', 'Inline code', (v) => toggleWrap(v, '`'), 'is-mono'),
        btn(null, '⌫', 'Clear formatting', (v) => clearFormatting(v))),
      group('Paragraph',
        btn('bullet', '•', 'Bullet list', (v) => toggleLinePrefix(v, '- ', /^\s*[-*+]\s(?!\[[ xX]\])/)),
        btn('numbered', '1.', 'Numbered list', (v) => toggleNumbered(v), 'is-mono'),
        btn('task', '☐', 'Checklist', (v) => toggleLinePrefix(v, '- [ ] ', /^\s*[-*+]\s\[[ xX]\]\s/)),
        btn(null, '⇤', 'Outdent (⇧Tab)', (v) => { indentLess(v); v.focus(); }),
        btn(null, '⇥', 'Indent (Tab)', (v) => { indentMore(v); v.focus(); }),
        btn(null, '―', 'Divider line', (v) => insertDivider(v))),
      group('Insert',
        btn(null, '[[ ]]', 'Link to a note (⌘K)', (v) => toggleWrap(v, '[[', ']]'), 'is-mono'),
        btn(null, 'Web', 'Web link', (v) => insertWebLink(v), 'is-word'),
        btn(null, 'Table', 'Table', (v, anchor) => onInsertTable(anchor), 'is-word'),
        btn(null, 'Sticky', 'Sticky note', () => onAddSticky(), 'is-word'),
        btn(null, 'Date', "Today's date", (v) => insertText(v, today()), 'is-word'),
        btn(null, 'Heatmap', 'A heatmap from your notes (Tracker format)', (v) => insertHeatmap(v), 'is-word')),
      group('Find',
        btn(null, 'Find', 'Find & replace (⌘F)', (v) => openSearchPanel(v), 'is-word')));

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
}
