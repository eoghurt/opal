// The table you edit inside a note. Type straight into cells (Tab moves on,
// Tab in the last cell adds a row); drag across cells or Shift-click to
// select several; drag the edges between columns or under rows to resize.
// The toolbar above the table does the rest: rows, columns, merge/split,
// fill and text colour, alignment, margins, borders and the header row.
// Every change is written back into the note as HTML (see table-model.js).

import { h } from '../ui.js';
import { EVENT_COLORS, isDark } from '../calendar/events.js';
import {
  parseTable, serializeTable, tableStyle, cellStyle, cellAt, cellsIn, expandRect,
  insertRow, insertCol, deleteRows, deleteCols, merge, split, cleanCellHtml, MIN_COL, MIN_ROW,
} from './table-model.js';

const COMMIT_DELAY = 400;

function mix(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(255 - (255 - v) * amount));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// Soft shades first (good behind text), then the 20 full colours.
const SOFT = ['tomato', 'tangerine', 'banana', 'sage', 'mint', 'sky', 'blueberry', 'lavender', 'rose', 'graphite'];
const FILL_COLORS = [...SOFT.map((n) => [`soft ${n}`, mix(EVENT_COLORS[n], 0.28)]), ...Object.entries(EVENT_COLORS)];
const TEXT_COLORS = [['ink', '#16140F'], ...Object.entries(EVENT_COLORS).filter(([n]) => !['banana', 'lemon', 'mint', 'sky', 'flamingo', 'rose'].includes(n)), ['white', '#FFFFFF']];

const MARGINS = [[4, 'Tight margins'], [8, 'Normal margins'], [14, 'Roomy margins'], [20, 'Wide margins']];
const BORDER_NAMES = [['all', 'All borders'], ['outer', 'Outside only'], ['rows', 'Rows only'], ['none', 'No borders']];

export class TableEditor {
  // onCommit(html) saves the table into the note; onCommit('') removes it.
  // onHistory(-1 | 1) undoes / redoes through the note's own history.
  constructor(source, { onCommit, onHistory }) {
    this.onCommit = onCommit;
    this.onHistory = onHistory || (() => {});
    this.anchor = null; // { r, c } where a cell selection started
    this.focusSlot = null;
    this.timer = null;
    this.root = h('div', { class: 'otable', contenteditable: 'false' });
    this.toolbar = h('div', { class: 'otable-bar', role: 'toolbar', 'aria-label': 'Table tools' });
    this.scroll = h('div', { class: 'otable-scroll' });
    this.handles = h('div', { class: 'otable-handles' });
    this.root.append(this.toolbar, this.scroll);
    this.listen();
    this.load(source);
  }

  destroy() {
    this.flush();
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  load(source) {
    this.model = parseTable(source);
    this.serialized = source;
    this.anchor = null;
    this.focusSlot = null;
    this.render();
  }

  // ---------- Saving ----------

  scheduleCommit() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.commit(), COMMIT_DELAY);
  }

  flush() {
    if (this.timer) this.commit();
  }

  commit() {
    clearTimeout(this.timer);
    this.timer = null;
    const next = serializeTable(this.model);
    if (next === this.serialized) return;
    this.serialized = next;
    this.onCommit(next);
  }

  // ---------- Drawing ----------

  render() {
    const t = this.model;
    const table = h('table', { class: 'otable-t', style: tableStyle(t) });
    if (t.colW.some((w) => w != null)) {
      table.append(h('colgroup', null, t.colW.map((w) => h('col', { style: w != null ? `width:${w}px` : null }))));
    }
    this.cellEls = new Map();
    for (let r = 0; r < t.rows; r++) {
      const tr = h('tr', { style: t.rowH[r] ? `height:${t.rowH[r]}px` : null });
      for (const cell of t.cells.filter((x) => x.r === r).sort((a, b) => a.c - b.c)) {
        const el = h(t.header && r === 0 ? 'th' : 'td', {
          contenteditable: 'true',
          spellcheck: 'true',
          'data-id': String(cell.id),
          colspan: cell.cs > 1 ? String(cell.cs) : null,
          rowspan: cell.rs > 1 ? String(cell.rs) : null,
          style: cellStyle(t, cell, { forScreen: true }),
        });
        el.innerHTML = cell.html; // already cleaned: plain formatting tags only
        this.cellEls.set(cell.id, el);
        tr.append(el);
      }
      table.append(tr);
    }
    this.tableEl = table;
    this.root.classList.toggle('is-borderless', t.border === 'none');
    this.scroll.replaceChildren(table, this.handles);
    this.renderToolbar();
    this.paintSelection();
    requestAnimationFrame(() => this.placeHandles());
    if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.placeHandles());
      this.resizeObserver.observe(this.scroll);
    }
  }

  cellOf(el) {
    const td = el && el.closest && el.closest('td, th');
    if (!td || !this.root.contains(td)) return null;
    return this.model.cells.find((x) => String(x.id) === td.dataset.id) || null;
  }

  // ---------- Selecting ----------

  rect() {
    if (!this.anchor) return null;
    const a = cellAt(this.model, this.anchor.r, this.anchor.c);
    const f = cellAt(this.model, (this.focusSlot || this.anchor).r, (this.focusSlot || this.anchor).c);
    if (!a || !f) return null;
    return expandRect(this.model, {
      r1: Math.min(a.r, f.r), c1: Math.min(a.c, f.c),
      r2: Math.max(a.r + a.rs - 1, f.r + f.rs - 1), c2: Math.max(a.c + a.cs - 1, f.c + f.cs - 1),
    });
  }

  selectedCells() {
    const rect = this.rect();
    return rect ? cellsIn(this.model, rect) : [];
  }

  isMulti() {
    return this.selectedCells().length > 1;
  }

  paintSelection() {
    const chosen = new Set(this.isMulti() ? this.selectedCells().map((x) => x.id) : []);
    for (const [id, el] of this.cellEls) el.classList.toggle('is-sel', chosen.has(id));
    this.root.classList.toggle('is-multi', chosen.size > 0);
    const merged = this.selectedCells().some((x) => x.rs > 1 || x.cs > 1);
    const button = this.toolbar.querySelector('.otable-merge');
    if (button) {
      const splitting = chosen.size < 2 && merged;
      button.textContent = splitting ? 'Split' : 'Merge';
      button.title = splitting ? 'Split the merged cell' : 'Merge selected cells';
      button.setAttribute('aria-label', button.title);
      button.disabled = chosen.size < 2 && !merged;
    }
  }

  focusCell(r, c, atEnd = true) {
    const cell = cellAt(this.model, r, c);
    const el = cell && this.cellEls.get(cell.id);
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!atEnd);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ---------- Events ----------

  listen() {
    const root = this.root;
    root.addEventListener('input', (event) => {
      const cell = this.cellOf(event.target);
      if (!cell) return;
      cell.html = cleanCellHtml(this.cellEls.get(cell.id));
      this.scheduleCommit();
      requestAnimationFrame(() => this.placeHandles());
    });

    root.addEventListener('focusin', (event) => {
      const cell = this.cellOf(event.target);
      if (cell && !this.dragSelecting && !(this.isMulti() && this.selectedCells().includes(cell))) {
        this.anchor = { r: cell.r, c: cell.c };
        this.focusSlot = null;
        this.paintSelection();
      }
      root.classList.add('is-active');
    });
    root.addEventListener('focusout', (event) => {
      if (root.contains(event.relatedTarget)) return;
      this.flush();
      setTimeout(() => {
        if (!root.contains(document.activeElement) && !this.popover) root.classList.remove('is-active');
      }, 0);
    });

    // Drag across cells (or Shift-click) to select several.
    root.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const cell = this.cellOf(event.target);
      if (!cell) return;
      if (event.shiftKey && this.anchor) {
        event.preventDefault();
        this.focusSlot = { r: cell.r, c: cell.c };
        this.paintSelection();
        return;
      }
      this.anchor = { r: cell.r, c: cell.c };
      this.focusSlot = null;
      this.dragSelecting = true;
      this.paintSelection();
      const move = (e) => {
        const under = this.cellOf(document.elementFromPoint(e.clientX, e.clientY));
        if (!under) return;
        const same = under.r === this.anchor.r && under.c === this.anchor.c;
        if (same && !this.focusSlot) return;
        this.focusSlot = { r: under.r, c: under.c };
        if (!same) window.getSelection().removeAllRanges();
        this.paintSelection();
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        this.dragSelecting = false;
        if (this.isMulti()) this.cellEls.get(cellAt(this.model, this.anchor.r, this.anchor.c).id)?.focus({ preventScroll: true });
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    root.addEventListener('keydown', (event) => {
      const cell = this.cellOf(event.target);
      if (!cell) return;
      // Undo / redo (⌘Z or Ctrl+Z; ⌘Y, Ctrl+Y or ⌘⇧Z) go through the note's
      // history, so they undo table changes like any other typing.
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === 'z' || key === 'y')) {
        event.preventDefault();
        event.stopPropagation();
        const at = { r: cell.r, c: cell.c };
        this.flush();
        this.onHistory(key === 'y' || event.shiftKey ? 1 : -1);
        // The table has redrawn from the note: back into the same cell.
        requestAnimationFrame(() => {
          const r = Math.min(at.r, this.model.rows - 1);
          const c = Math.min(at.c, this.model.cols - 1);
          if (this.root.isConnected && r >= 0 && c >= 0) {
            this.anchor = { r, c };
            this.focusSlot = null;
            this.paintSelection();
            this.focusCell(r, c);
          }
        });
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        this.flush();
        const order = this.model.cells.slice().sort((a, b) => a.r - b.r || a.c - b.c);
        const i = order.indexOf(cell);
        if (!event.shiftKey && i === order.length - 1) {
          this.change(() => insertRow(this.model, this.model.rows), this.model.rows, 0);
          return;
        }
        const next = order[Math.max(0, Math.min(order.length - 1, i + (event.shiftKey ? -1 : 1)))];
        this.anchor = { r: next.r, c: next.c };
        this.focusSlot = null;
        this.paintSelection();
        this.focusCell(next.r, next.c);
      } else if (event.key === 'Enter' && !event.shiftKey && !event.metaKey) {
        // A new line inside the cell (not a new paragraph block).
        event.preventDefault();
        document.execCommand('insertLineBreak');
      } else if ((event.key === 'Backspace' || event.key === 'Delete') && this.isMulti()) {
        // Clears every selected cell, like a spreadsheet.
        event.preventDefault();
        this.change(() => { for (const x of this.selectedCells()) x.html = ''; });
      } else if (event.key === 'Escape') {
        this.anchor = null;
        this.paintSelection();
        event.target.blur();
      }
    });

    // Pasting keeps just the text, so nothing odd comes along with it.
    root.addEventListener('paste', (event) => {
      if (!this.cellOf(event.target)) return;
      event.preventDefault();
      const text = event.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text.replace(/\r?\n/g, ' '));
    });
  }

  // Runs a change, saves it, redraws and puts the cursor back.
  change(fn, focusR, focusC) {
    const rect = this.rect();
    this.closePopover();
    fn();
    this.commit();
    this.render();
    const r = focusR ?? (rect ? rect.r1 : 0);
    const c = focusC ?? (rect ? rect.c1 : 0);
    const r2 = Math.min(r, this.model.rows - 1);
    const c2 = Math.min(c, this.model.cols - 1);
    if (this.isMulti()) {
      this.paintSelection();
      const first = cellAt(this.model, r2, c2);
      if (first) this.cellEls.get(first.id)?.focus({ preventScroll: true });
    } else {
      this.anchor = { r: r2, c: c2 };
      this.focusSlot = null;
      this.paintSelection();
      this.focusCell(r2, c2);
    }
  }

  // ---------- Toolbar ----------

  renderToolbar() {
    const t = this.model;
    // Buttons keep the cell's cursor where it is (mousedown doesn't steal focus).
    const btn = (label, title, onClick, extra = {}) => h('button', {
      type: 'button',
      class: `otable-btn${extra.cls ? ` ${extra.cls}` : ''}`,
      title,
      'aria-label': title,
      'data-needs': extra.needs || null,
      onmousedown: (e) => e.preventDefault(),
      onclick: (e) => {
        if (!this.rect() && !extra.anyTime) return;
        onClick(e);
      },
    }, label);
    const group = (label, ...items) => h('div', { class: 'otable-group' }, label ? h('span', { class: 'otable-label' }, label) : null, ...items);
    const select = (title, options, value, onChange) => {
      const el = h('select', { class: 'otable-select', title, 'aria-label': title },
        options.map(([v, text]) => h('option', { value: String(v) }, text)));
      el.value = String(value);
      el.addEventListener('change', () => onChange(el.value));
      return el;
    };
    const setAll = (patch) => () => this.change(() => { for (const x of this.selectedCells()) Object.assign(x, patch); });

    this.toolbar.replaceChildren(
      group(null,
        btn('+▲', 'Insert row above', () => this.change(() => insertRow(t, this.rect().r1), this.rect().r1, this.rect().c1)),
        btn('+▼', 'Insert row below', () => { const r = this.rect(); this.change(() => insertRow(t, r.r2 + 1), r.r2 + 1, r.c1); }),
        btn('−row', 'Delete row', () => { const r = this.rect(); if (!deleteRows(t, r.r1, r.r2)) return this.deleteTable(); return this.change(() => {}, Math.min(r.r1, t.rows - 1), r.c1); })),
      group(null,
        btn('+◀', 'Insert column left', () => this.change(() => insertCol(t, this.rect().c1), this.rect().r1, this.rect().c1)),
        btn('+▶', 'Insert column right', () => { const r = this.rect(); this.change(() => insertCol(t, r.c2 + 1), r.r1, r.c2 + 1); }),
        btn('−col', 'Delete column', () => { const r = this.rect(); if (!deleteCols(t, r.c1, r.c2)) return this.deleteTable(); return this.change(() => {}, r.r1, Math.min(r.c1, t.cols - 1)); })),
      group(null,
        // One button: "Merge" with several cells selected, "Split" on a merged cell.
        btn('Merge', 'Merge selected cells', () => {
          const r = this.rect();
          if (this.isMulti()) {
            this.anchor = { r: r.r1, c: r.c1 };
            this.focusSlot = null;
            this.change(() => merge(t, r), r.r1, r.c1);
          } else {
            this.change(() => split(t, r));
          }
        }, { needs: 'merge-split', cls: 'otable-merge' })),
      group(null,
        btn(h('span', { class: 'otable-fill-icon' }, 'Fill'), 'Cell colour', (e) => this.colorPopover(e.currentTarget, 'bg')),
        btn(h('span', { class: 'otable-text-icon' }, 'A'), 'Text colour', (e) => this.colorPopover(e.currentTarget, 'color'))),
      group(null,
        btn('Align ▾', 'Cell alignment', (e) => this.menuPopover(e.currentTarget, 'Cell alignment', () => {
          const first = this.selectedCells()[0] || {};
          const grid = h('div', { class: 'otable-align-grid', role: 'group', 'aria-label': 'Cell alignment' });
          for (const [valign, vName] of [[null, 'top'], ['middle', 'middle'], ['bottom', 'bottom']]) {
            for (const [align, aName] of [[null, 'left'], ['center', 'centre'], ['right', 'right']]) {
              const on = (first.valign || null) === valign && (first.align || null) === align;
              grid.append(h('button', {
                type: 'button',
                class: `otable-align${on ? ' is-on' : ''}`,
                title: `${vName} ${aName}`,
                'aria-label': `Align ${vName} ${aName}`,
                'aria-pressed': String(on),
                onmousedown: (ev) => ev.preventDefault(),
                onclick: () => { this.closePopover(); setAll({ align, valign })(); },
              }, h('span', { class: `otable-align-dot is-${aName} is-${vName}` })));
            }
          }
          return [h('span', { class: 'otable-label' }, 'Align in cell'), grid];
        }))),
      group(null,
        btn('Borders ▾', 'Borders & margins', (e) => this.menuPopover(e.currentTarget, 'Borders & margins', () => [
          h('label', { class: 'otable-menu-row' }, h('span', null, 'Borders'),
            select('Borders', BORDER_NAMES, t.border, (v) => this.change(() => { t.border = v; }))),
          h('label', { class: 'otable-menu-row' }, h('span', null, 'Thickness'),
            select('Border thickness', [[1, '1 pt'], [2, '2 pt'], [3, '3 pt']], t.bw, (v) => this.change(() => { t.bw = Number(v); }))),
          h('label', { class: 'otable-menu-row' }, h('span', null, 'Margins'),
            select('Cell margins', MARGINS, MARGINS.some(([v]) => v === t.pad) ? t.pad : 8, (v) => this.change(() => { t.pad = Number(v); }))),
        ]), { anyTime: true }),
        btn('Table ▾', 'Table options', (e) => this.menuPopover(e.currentTarget, 'Table', () => [
          h('label', { class: 'otable-check', title: 'Make the first row a header' },
            h('input', { type: 'checkbox', checked: t.header, onchange: (ev) => { this.closePopover(); this.change(() => { t.header = ev.target.checked; }); } }),
            'Header row'),
          btn('Even columns', 'Make columns the same width', () => { this.closePopover(); this.change(() => { const w = this.measureCols(); const each = Math.round(w.reduce((a, b) => a + b, 0) / w.length); t.colW = w.map(() => each); }); }, { anyTime: true, cls: 'is-wide' }),
          btn('Fit to page', 'Fit the table to the page width', () => { this.closePopover(); this.change(() => this.fitWidth()); }, { anyTime: true, cls: 'is-wide' }),
          btn('Delete table', 'Delete the whole table', () => { this.closePopover(); this.deleteTable(); }, { anyTime: true, cls: 'is-wide is-danger' }),
        ]), { anyTime: true })),
    );
  }

  colorPopover(anchor, key) {
    this.closePopover();
    const colors = key === 'bg' ? FILL_COLORS : TEXT_COLORS;
    const current = this.selectedCells()[0]?.[key] || null;
    const pick = (value) => {
      this.closePopover();
      this.change(() => {
        for (const x of this.selectedCells()) {
          x[key] = value;
          // Dark fills get light text automatically, unless a text colour was chosen.
          if (key === 'bg' && !x.color && value && isDark(value)) x.color = '#FFFFFF';
          if (key === 'bg' && x.color === '#FFFFFF' && (!value || !isDark(value))) x.color = null;
        }
      });
    };
    const pop = h('div', { class: 'otable-pop', role: 'dialog', 'aria-label': key === 'bg' ? 'Cell colour' : 'Text colour' },
      h('button', {
        type: 'button',
        class: `otable-swatch is-none${!current ? ' is-on' : ''}`,
        title: key === 'bg' ? 'No fill' : 'Automatic',
        'aria-label': key === 'bg' ? 'No fill' : 'Automatic',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => pick(null),
      }),
      colors.map(([name, hex]) => h('button', {
        type: 'button',
        class: `otable-swatch${current === hex ? ' is-on' : ''}`,
        title: name,
        'aria-label': name,
        style: `background:${hex}`,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => pick(hex),
      })));
    this.showPopover(pop, anchor);
  }

  // A small menu under a toolbar button (Borders ▾, Table ▾).
  menuPopover(anchor, label, build) {
    if (this.popover && this.popover.dataset.for === label) {
      this.closePopover();
      return;
    }
    this.closePopover();
    const pop = h('div', { class: 'otable-pop otable-menu', role: 'dialog', 'aria-label': label, 'data-for': label }, build());
    this.showPopover(pop, anchor);
  }

  showPopover(pop, anchor) {
    this.root.append(pop);
    const box = anchor.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    pop.style.left = `${Math.max(0, box.left - host.left)}px`;
    pop.style.top = `${box.bottom - host.top + 4}px`;
    this.popover = pop;
    const away = (e) => {
      if (!pop.contains(e.target) && !anchor.contains(e.target)) this.closePopover();
    };
    setTimeout(() => document.addEventListener('mousedown', away), 0);
    this.popoverCleanup = () => document.removeEventListener('mousedown', away);
  }

  closePopover() {
    if (this.popover) this.popover.remove();
    if (this.popoverCleanup) this.popoverCleanup();
    this.popover = null;
    this.popoverCleanup = null;
  }

  deleteTable() {
    if (!window.confirm('Delete this whole table?')) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.serialized = '';
    this.onCommit('');
  }

  // ---------- Widths & heights ----------

  // Current width of every column, in pixels (from what's on screen).
  measureCols() {
    const t = this.model;
    if (t.colW.every((w) => w != null)) return t.colW.slice();
    const tableBox = this.tableEl.getBoundingClientRect();
    const edges = [tableBox.left];
    for (let b = 1; b <= t.cols; b++) {
      const cell = t.cells.find((x) => x.c + x.cs === b);
      const el = cell && this.cellEls.get(cell.id);
      edges[b] = el ? el.getBoundingClientRect().right : null;
    }
    edges[t.cols] = edges[t.cols] ?? tableBox.right;
    // Fill any unknown edges evenly between known ones.
    for (let b = 1; b < t.cols; b++) {
      if (edges[b] != null) continue;
      let next = b + 1;
      while (edges[next] == null) next++;
      edges[b] = edges[b - 1] + (edges[next] - edges[b - 1]) / (next - b + 1);
    }
    return Array.from({ length: t.cols }, (_, i) => Math.max(MIN_COL, Math.round(edges[i + 1] - edges[i])));
  }

  fitWidth() {
    const t = this.model;
    const available = Math.max(t.cols * MIN_COL, this.root.clientWidth - 2);
    const widths = this.measureCols();
    const total = widths.reduce((a, b) => a + b, 0);
    t.colW = widths.map((w) => Math.max(MIN_COL, Math.floor((w / total) * available)));
  }

  applyWidths() {
    const t = this.model;
    this.tableEl.style.cssText = tableStyle(t);
    let group = this.tableEl.querySelector('colgroup');
    if (!group) {
      group = h('colgroup');
      this.tableEl.prepend(group);
    }
    group.replaceChildren(...t.colW.map((w) => h('col', { style: w != null ? `width:${w}px` : null })));
  }

  placeHandles() {
    if (!this.tableEl || !this.tableEl.isConnected) return;
    const t = this.model;
    const base = this.scroll.getBoundingClientRect();
    const tableBox = this.tableEl.getBoundingClientRect();
    const x0 = this.scroll.scrollLeft - base.left;
    const y0 = this.scroll.scrollTop - base.top;
    const handles = [];
    for (let b = 1; b <= t.cols; b++) {
      const cell = t.cells.find((x) => x.c + x.cs === b);
      const el = cell && this.cellEls.get(cell.id);
      if (!el) continue;
      const x = el.getBoundingClientRect().right + x0;
      const handle = h('div', {
        class: 'otable-colh',
        title: 'Drag to change the column width',
        style: `left:${x - 4}px; top:${tableBox.top + y0}px; height:${tableBox.height}px`,
      });
      handle.addEventListener('mousedown', (e) => this.dragCol(e, b));
      handles.push(handle);
    }
    for (let b = 1; b <= t.rows; b++) {
      const cell = t.cells.find((x) => x.r + x.rs === b);
      const el = cell && this.cellEls.get(cell.id);
      if (!el) continue;
      const y = el.getBoundingClientRect().bottom + y0;
      const handle = h('div', {
        class: 'otable-rowh',
        title: 'Drag to change the row height',
        style: `top:${y - 4}px; left:${tableBox.left + x0}px; width:${tableBox.width}px`,
      });
      handle.addEventListener('mousedown', (e) => this.dragRow(e, b - 1));
      handles.push(handle);
    }
    this.handles.replaceChildren(...handles);
  }

  // Dragging the edge after column `b - 1`: that column and the next one
  // share the space (the last edge changes the table's width).
  dragCol(down, b) {
    down.preventDefault();
    const t = this.model;
    const start = this.measureCols();
    const left = b - 1;
    const right = b < t.cols ? b : null;
    this.root.classList.add('is-resizing');
    const move = (e) => {
      const dx = e.clientX - down.clientX;
      const next = start.slice();
      if (right == null) {
        next[left] = Math.max(MIN_COL, start[left] + dx);
      } else {
        const pair = start[left] + start[right];
        next[left] = Math.max(MIN_COL, Math.min(pair - MIN_COL, start[left] + dx));
        next[right] = pair - next[left];
      }
      t.colW = next;
      this.applyWidths();
      this.placeHandles();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.root.classList.remove('is-resizing');
      this.commit();
      this.placeHandles();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  dragRow(down, r) {
    down.preventDefault();
    const t = this.model;
    const tr = this.tableEl.rows[r];
    const start = tr.getBoundingClientRect().height;
    this.root.classList.add('is-resizing');
    const move = (e) => {
      t.rowH[r] = Math.max(MIN_ROW, Math.round(start + e.clientY - down.clientY));
      tr.style.height = `${t.rowH[r]}px`;
      this.placeHandles();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.root.classList.remove('is-resizing');
      this.commit();
      this.placeHandles();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
}
