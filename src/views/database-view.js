// A folder shown as a database: each note in the folder is a row, each
// property a column. Views are a table or cards, and each view can sort,
// filter and group by any property. Editing a cell writes that property into
// the note (Obsidian's property format); the database's own settings live in
// the folder's .opal.md. See main.js "Folder databases".
//
//   new DatabaseView(container, { folderName, settings, io })
//   io: rows() → [{ path, name, props }], setCell(path, key, value, type),
//       save(settings), addRow(name) → path, openFile(path), turnOff()

import { h, askName } from '../ui.js';
import { showMenu, closeMenu } from '../context-menu.js';

export const COLUMN_TYPES = [
  ['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['checkbox', 'Checkbox'], ['select', 'Select'], ['link', 'Link'],
];

const NAME = '__name'; // the note's name (always the first column)

const OPS = {
  text: ['contains', 'is', 'is not', 'is empty', 'is not empty'],
  link: ['contains', 'is', 'is not', 'is empty', 'is not empty'],
  select: ['is', 'is not', 'is empty', 'is not empty'],
  number: ['=', '≠', '>', '<', '≥', '≤', 'is empty', 'is not empty'],
  date: ['is', 'before', 'after', 'is empty', 'is not empty'],
  checkbox: ['is checked', 'is not checked'],
};

// Ready-made databases.
export const PRESETS = {
  blank: { columns: [], views: [{ name: 'Table', type: 'table', sort: null, filters: [], group: null, hidden: [] }] },
  assignments: {
    columns: [
      { key: 'subject', type: 'select', options: ['English', 'Maths', 'History', 'Chemistry', 'Physics'] },
      { key: 'due', type: 'date' },
      { key: 'status', type: 'select', options: ['Not started', 'In progress', 'Submitted', 'Marked'] },
      { key: 'mark', type: 'number' },
    ],
    views: [
      { name: 'All assignments', type: 'table', sort: { key: 'due', dir: 1 }, filters: [], group: null, hidden: [] },
      { name: 'To do', type: 'table', sort: { key: 'due', dir: 1 }, filters: [{ key: 'status', op: 'is not', value: 'Marked' }, { key: 'status', op: 'is not', value: 'Submitted' }], group: 'subject', hidden: [] },
      { name: 'By status', type: 'cards', sort: { key: 'due', dir: 1 }, filters: [], group: 'status', hidden: [] },
    ],
  },
  reading: {
    columns: [
      { key: 'author', type: 'text' },
      { key: 'status', type: 'select', options: ['To read', 'Reading', 'Finished'] },
      { key: 'rating', type: 'select', options: ['★', '★★', '★★★', '★★★★', '★★★★★'] },
    ],
    views: [
      { name: 'All books', type: 'table', sort: { key: 'author', dir: 1 }, filters: [], group: null, hidden: [] },
      { name: 'Shelves', type: 'cards', sort: { key: '__name', dir: 1 }, filters: [], group: 'status', hidden: [] },
    ],
  },
};

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

function display(value, type) {
  if (isEmpty(value)) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (type === 'link') return String(value).replace(/^\[\[|\]\]$/g, '').split('|')[0];
  if (type === 'checkbox') return value === true || value === 'true' ? '✓' : '';
  return String(value);
}

// Guesses a column's type from the values in its notes.
function guessType(values) {
  const present = values.filter((v) => !isEmpty(v));
  if (!present.length) return 'text';
  if (present.every((v) => typeof v === 'boolean')) return 'checkbox';
  if (present.every((v) => typeof v === 'number')) return 'number';
  if (present.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)))) return 'date';
  if (present.every((v) => /^\[\[.*\]\]$/.test(String(v)))) return 'link';
  return 'text';
}

export class DatabaseView {
  constructor(container, { folderName, settings, io }) {
    this.io = io;
    this.folderName = folderName;
    this.settings = JSON.parse(JSON.stringify(settings || PRESETS.blank));
    if (!this.settings.views || !this.settings.views.length) this.settings.views = JSON.parse(JSON.stringify(PRESETS.blank.views));
    this.settings.columns = this.settings.columns || [];
    this.settings.active = Math.min(this.settings.active || 0, this.settings.views.length - 1);
    this.rows = [];
    this.root = h('section', { class: 'db', 'aria-label': `${folderName} database` });
    container.replaceChildren(this.root);
    this.load();
  }

  get view() {
    return this.settings.views[this.settings.active];
  }

  async load() {
    this.rows = await this.io.rows();
    // Properties found in the notes but not yet columns are offered under Columns.
    this.found = new Map();
    for (const row of this.rows) {
      for (const [key, value] of Object.entries(row.props)) {
        if (!this.found.has(key)) this.found.set(key, []);
        this.found.get(key).push(value);
      }
    }
    this.render();
  }

  save() {
    return this.io.save(this.settings);
  }

  column(key) {
    if (key === NAME) return { key: NAME, type: 'text', label: 'Name' };
    return this.settings.columns.find((c) => c.key === key) || { key, type: 'text' };
  }

  value(row, key) {
    return key === NAME ? row.name : row.props[key];
  }

  // ---------- Sort, filter, group ----------

  visibleRows() {
    const view = this.view;
    let rows = this.rows.filter((row) => (view.filters || []).every((f) => this.passes(row, f)));
    if (view.sort && view.sort.key) {
      const { key, dir } = view.sort;
      const type = this.column(key).type;
      rows = rows.slice().sort((a, b) => {
        const x = this.value(a, key);
        const y = this.value(b, key);
        if (isEmpty(x) && isEmpty(y)) return 0;
        if (isEmpty(x)) return 1;
        if (isEmpty(y)) return -1;
        if (type === 'number') return dir * (Number(x) - Number(y));
        if (type === 'checkbox') return dir * ((x === true ? 1 : 0) - (y === true ? 1 : 0));
        if (type === 'select') {
          const options = this.column(key).options || [];
          const ix = options.indexOf(String(x));
          const iy = options.indexOf(String(y));
          if (ix >= 0 && iy >= 0) return dir * (ix - iy);
        }
        return dir * display(x, type).localeCompare(display(y, type), undefined, { numeric: true, sensitivity: 'base' });
      });
    }
    return rows;
  }

  passes(row, filter) {
    const col = this.column(filter.key);
    const raw = this.value(row, filter.key);
    const text = display(raw, col.type).toLowerCase();
    const want = String(filter.value ?? '').toLowerCase();
    switch (filter.op) {
      case 'is empty': return isEmpty(raw);
      case 'is not empty': return !isEmpty(raw);
      case 'is checked': return raw === true;
      case 'is not checked': return raw !== true;
      case 'contains': return text.includes(want);
      case 'is': return text === want;
      case 'is not': return text !== want;
      case '=': return !isEmpty(raw) && Number(raw) === Number(filter.value);
      case '≠': return isEmpty(raw) || Number(raw) !== Number(filter.value);
      case '>': return !isEmpty(raw) && Number(raw) > Number(filter.value);
      case '<': return !isEmpty(raw) && Number(raw) < Number(filter.value);
      case '≥': return !isEmpty(raw) && Number(raw) >= Number(filter.value);
      case '≤': return !isEmpty(raw) && Number(raw) <= Number(filter.value);
      case 'before': return !isEmpty(raw) && String(raw) < String(filter.value);
      case 'after': return !isEmpty(raw) && String(raw) > String(filter.value);
      default: return true;
    }
  }

  groups(rows) {
    const key = this.view.group;
    if (!key) return [{ label: null, rows }];
    const col = this.column(key);
    const map = new Map();
    for (const row of rows) {
      const label = display(this.value(row, key), col.type) || 'No value';
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(row);
    }
    const order = col.type === 'select' ? [...(col.options || []), 'No value'] : null;
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (order) return (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999);
        if (a === 'No value') return 1;
        if (b === 'No value') return -1;
        return a.localeCompare(b, undefined, { numeric: true });
      })
      .map(([label, list]) => ({ label, rows: list }));
  }

  shownColumns() {
    const hidden = new Set(this.view.hidden || []);
    return this.settings.columns.filter((c) => !hidden.has(c.key));
  }

  // ---------- Drawing ----------

  render() {
    closeMenu();
    const view = this.view;
    const rows = this.visibleRows();
    const tabs = h('div', { class: 'db-tabs', role: 'tablist', 'aria-label': 'Views' },
      this.settings.views.map((v, i) => {
        const tab = h('button', {
          class: `db-tab${i === this.settings.active ? ' is-on' : ''}`,
          role: 'tab',
          'aria-selected': String(i === this.settings.active),
          title: 'Right-click to rename or delete',
          onclick: () => { this.settings.active = i; this.save(); this.render(); },
        }, h('span', { class: 'db-tab-icon', 'aria-hidden': 'true' }, v.type === 'cards' ? '▦' : '☰'), v.name);
        tab.addEventListener('contextmenu', (e) => this.viewMenu(e, i));
        return tab;
      }),
      h('button', { class: 'db-tab db-tab-add', title: 'Add a view', onclick: (e) => this.addViewMenu(e) }, '+ View'));
    const count = (view.filters || []).length;
    const bar = h('div', { class: 'db-bar' },
      h('button', { class: `db-tool${view.sort ? ' is-on' : ''}`, onclick: (e) => this.sortMenu(e) }, view.sort ? `Sort: ${this.label(view.sort.key)} ${view.sort.dir > 0 ? '↑' : '↓'}` : 'Sort ▾'),
      h('button', { class: `db-tool${count ? ' is-on' : ''}`, onclick: (e) => this.filterPopover(e.currentTarget) }, count ? `Filter · ${count}` : 'Filter ▾'),
      h('button', { class: `db-tool${view.group ? ' is-on' : ''}`, onclick: (e) => this.groupMenu(e) }, view.group ? `Group: ${this.label(view.group)}` : 'Group ▾'),
      h('button', { class: 'db-tool', onclick: (e) => this.columnsMenu(e) }, 'Columns ▾'),
      h('span', { class: 'db-count' }, `${rows.length} of ${this.rows.length} notes`),
      h('button', { class: 'db-tool is-primary', onclick: () => this.addRow() }, '+ New row'));
    const body = view.type === 'cards' ? this.cards(rows) : this.table(rows);
    this.root.replaceChildren(tabs, bar, body);
  }

  label(key) {
    return key === NAME ? 'Name' : key;
  }

  table(rows) {
    const cols = this.shownColumns();
    const head = h('tr', null,
      h('th', { class: 'db-th db-th-name' }, h('button', { class: 'db-th-btn', onclick: (e) => this.columnMenu(e, NAME) }, 'Name')),
      cols.map((c) => h('th', { class: 'db-th' },
        h('button', { class: 'db-th-btn', onclick: (e) => this.columnMenu(e, c.key) },
          h('span', { class: 'db-type', 'aria-hidden': 'true' }, { text: 'Aa', number: '#', date: '📅', checkbox: '☑', select: '▾', link: '↗' }[c.type] || 'Aa'),
          c.key))),
      h('th', { class: 'db-th db-th-add' }, h('button', { class: 'db-th-btn', title: 'Add a column', onclick: (e) => this.columnsMenu(e) }, '+')));
    const bodyRows = [];
    for (const group of this.groups(rows)) {
      if (group.label !== null) {
        bodyRows.push(h('tr', { class: 'db-group' }, h('td', { colspan: String(cols.length + 2) }, h('strong', null, group.label), h('span', { class: 'db-group-count' }, ` ${group.rows.length}`))));
      }
      for (const row of group.rows) {
        bodyRows.push(h('tr', { class: 'db-row', 'data-path': row.path },
          h('td', { class: 'db-td db-name' }, h('button', { class: 'db-open', title: `Open ${row.name}`, onclick: () => this.io.openFile(row.path) }, row.name)),
          cols.map((c) => h('td', { class: `db-td is-${c.type}` }, this.cellEditor(row, c))),
          h('td', { class: 'db-td' })));
      }
    }
    if (!rows.length) bodyRows.push(h('tr', null, h('td', { class: 'db-empty', colspan: String(cols.length + 2) }, this.rows.length ? 'No notes match the filters.' : 'No notes yet — add a row.')));
    return h('div', { class: 'db-scroll' }, h('table', { class: 'db-table' }, h('thead', null, head), h('tbody', null, bodyRows)));
  }

  cards(rows) {
    const cols = this.shownColumns();
    return h('div', { class: 'db-cards-wrap' },
      this.groups(rows).map((group) => h('section', { class: 'db-card-group' },
        group.label !== null ? h('h3', { class: 'db-card-group-title' }, group.label, h('span', { class: 'db-group-count' }, ` ${group.rows.length}`)) : null,
        h('div', { class: 'db-cards' },
          group.rows.map((row) => h('article', { class: 'db-card', 'data-path': row.path },
            h('button', { class: 'db-card-title', onclick: () => this.io.openFile(row.path) }, row.name),
            cols.filter((c) => c.key !== this.view.group).map((c) => h('div', { class: 'db-card-row' },
              h('span', { class: 'db-card-key' }, c.key),
              h('span', { class: `db-card-value is-${c.type}` }, this.cellEditor(row, c)))))),
          group.rows.length ? null : h('p', { class: 'db-empty' }, 'Nothing here.')))),
      rows.length ? null : h('p', { class: 'db-empty' }, this.rows.length ? 'No notes match the filters.' : 'No notes yet — add a row.'));
  }

  // An in-place editor for one cell; changes are written into the note.
  cellEditor(row, col) {
    const value = row.props[col.key];
    const write = async (next) => {
      row.props[col.key] = next === '' ? null : next;
      try {
        await this.io.setCell(row.path, col.key, next, col.type);
      } catch (err) {
        alert(`Couldn't save that.\n\n${err.message}`);
      }
      if (this.view.sort || this.view.group || (this.view.filters || []).length) this.render();
    };
    const label = `${col.key} of ${row.name}`;
    if (col.type === 'checkbox') {
      return h('input', { type: 'checkbox', class: 'db-check', 'aria-label': label, checked: value === true || null, onchange: (e) => write(e.target.checked) });
    }
    if (col.type === 'select') {
      const options = col.options || [];
      const current = display(value, 'text');
      const select = h('select', { class: 'db-input db-select', 'aria-label': label },
        h('option', { value: '' }, ''),
        [...options, ...(current && !options.includes(current) ? [current] : [])].map((o) => h('option', { value: o, selected: o === current || null }, o)),
        h('option', { value: '__new' }, '+ New option…'));
      select.value = current;
      select.addEventListener('change', async () => {
        if (select.value !== '__new') return write(select.value);
        const added = await askName(`New option for ${col.key}`, 'Option, then Enter');
        if (!added) {
          select.value = current;
          return undefined;
        }
        col.options = [...options, added.trim()];
        await this.save();
        await write(added.trim());
        return this.render();
      });
      return select;
    }
    if (col.type === 'link') {
      const input = h('input', { class: 'db-input', type: 'text', 'aria-label': label, placeholder: 'Note name', value: display(value, 'link') });
      input.addEventListener('change', () => write(input.value.trim()));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      const target = display(value, 'link');
      return h('span', { class: 'db-link' }, input,
        target ? h('button', { class: 'db-link-open', title: `Open ${target}`, 'aria-label': `Open ${target}`, onclick: () => this.io.openLink(target) }, '↗') : null);
    }
    const input = h('input', {
      class: 'db-input',
      type: col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text',
      'aria-label': label,
      value: display(value, col.type),
    });
    input.addEventListener('change', () => write(col.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && col.type !== 'date') input.blur(); });
    return input;
  }

  // ---------- Menus ----------

  menuAt(event, options) {
    showMenu({ clientX: event.clientX || event.currentTarget.getBoundingClientRect().left, clientY: event.clientY || event.currentTarget.getBoundingClientRect().bottom, preventDefault() {}, stopPropagation() {} }, options);
  }

  change(fn) {
    fn();
    this.save();
    this.render();
  }

  sortMenu(event) {
    const view = this.view;
    const keys = [NAME, ...this.settings.columns.map((c) => c.key)];
    this.menuAt(event, {
      title: 'Sort by',
      items: [
        { label: 'No sorting', hint: view.sort ? '' : '✓', onSelect: () => this.change(() => { view.sort = null; }) },
        'separator',
        ...keys.flatMap((k) => [
          { label: `${this.label(k)} ↑`, hint: view.sort && view.sort.key === k && view.sort.dir > 0 ? '✓' : '', onSelect: () => this.change(() => { view.sort = { key: k, dir: 1 }; }) },
          { label: `${this.label(k)} ↓`, hint: view.sort && view.sort.key === k && view.sort.dir < 0 ? '✓' : '', onSelect: () => this.change(() => { view.sort = { key: k, dir: -1 }; }) },
        ]),
      ],
    });
  }

  groupMenu(event) {
    const view = this.view;
    this.menuAt(event, {
      title: 'Group by',
      items: [
        { label: 'No grouping', hint: view.group ? '' : '✓', onSelect: () => this.change(() => { view.group = null; }) },
        'separator',
        ...this.settings.columns.map((c) => ({ label: c.key, hint: view.group === c.key ? '✓' : '', onSelect: () => this.change(() => { view.group = c.key; }) })),
      ],
    });
  }

  columnsMenu(event) {
    const view = this.view;
    const hidden = new Set(view.hidden || []);
    const have = new Set(this.settings.columns.map((c) => c.key));
    const found = [...this.found.keys()].filter((k) => !have.has(k));
    this.menuAt(event, {
      title: 'Columns',
      items: [
        ...this.settings.columns.map((c) => ({
          label: `${hidden.has(c.key) ? '○' : '●'} ${c.key}`,
          hint: hidden.has(c.key) ? 'hidden' : '',
          onSelect: () => this.change(() => {
            view.hidden = hidden.has(c.key) ? (view.hidden || []).filter((k) => k !== c.key) : [...(view.hidden || []), c.key];
          }),
        })),
        found.length ? 'separator' : null,
        ...found.map((k) => ({ label: `+ ${k}`, hint: 'in your notes', onSelect: () => this.change(() => { this.settings.columns.push({ key: k, type: guessType(this.found.get(k)) }); }) })),
        'separator',
        { label: '+ New column…', onSelect: () => this.newColumn() },
      ],
    });
  }

  async newColumn() {
    const name = await askName('New column', 'Property name, then Enter');
    const key = name && name.trim().replace(/:/g, ' ');
    if (!key || key.startsWith('opal-')) return;
    if (this.settings.columns.some((c) => c.key === key)) return;
    this.change(() => { this.settings.columns.push({ key, type: guessType(this.found.get(key) || []) }); });
  }

  columnMenu(event, key) {
    const col = this.column(key);
    const view = this.view;
    const items = [
      { label: 'Sort ↑', onSelect: () => this.change(() => { view.sort = { key, dir: 1 }; }) },
      { label: 'Sort ↓', onSelect: () => this.change(() => { view.sort = { key, dir: -1 }; }) },
    ];
    if (key !== NAME) {
      items.push(
        { label: view.group === key ? 'Stop grouping' : 'Group by this', onSelect: () => this.change(() => { view.group = view.group === key ? null : key; }) },
        'separator',
        ...COLUMN_TYPES.map(([type, name]) => ({ label: `Type: ${name}`, hint: col.type === type ? '✓' : '', onSelect: () => this.change(() => { col.type = type; if (type === 'select' && !col.options) col.options = []; }) })),
        col.type === 'select' ? { label: 'Edit options…', onSelect: () => this.editOptions(col) } : null,
        'separator',
        { label: 'Hide in this view', onSelect: () => this.change(() => { view.hidden = [...(view.hidden || []), key]; }) },
        { label: 'Remove column', danger: true, hint: 'notes keep it', onSelect: () => this.change(() => { this.settings.columns = this.settings.columns.filter((c) => c.key !== key); }) },
      );
    }
    this.menuAt(event, { title: this.label(key), items });
  }

  async editOptions(col) {
    const answer = await askName(`Options for ${col.key}`, 'Comma-separated, then Enter', (col.options || []).join(', '));
    if (answer === null) return;
    this.change(() => { col.options = answer.split(',').map((s) => s.trim()).filter(Boolean); });
  }

  addViewMenu(event) {
    this.menuAt(event, {
      title: 'New view',
      items: [
        { label: 'Table', onSelect: () => this.addView('table') },
        { label: 'Cards', onSelect: () => this.addView('cards') },
      ],
    });
  }

  addView(type) {
    this.change(() => {
      this.settings.views.push({ name: type === 'cards' ? 'Cards' : 'Table', type, sort: null, filters: [], group: null, hidden: [] });
      this.settings.active = this.settings.views.length - 1;
    });
  }

  viewMenu(event, index) {
    event.preventDefault();
    const view = this.settings.views[index];
    this.menuAt(event, {
      title: view.name,
      items: [
        { label: 'Rename…', onSelect: async () => { const n = await askName('Rename view', 'Name, then Enter', view.name); if (n) this.change(() => { view.name = n.trim(); }); } },
        { label: view.type === 'cards' ? 'Show as table' : 'Show as cards', onSelect: () => this.change(() => { view.type = view.type === 'cards' ? 'table' : 'cards'; }) },
        { label: 'Duplicate', onSelect: () => this.change(() => { this.settings.views.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(view)), name: `${view.name} copy` }); this.settings.active = index + 1; }) },
        'separator',
        { label: 'Delete view', danger: true, disabled: this.settings.views.length < 2, onSelect: () => this.change(() => { this.settings.views.splice(index, 1); this.settings.active = 0; }) },
        { label: 'Stop showing as a database', onSelect: () => this.io.turnOff() },
      ],
    });
  }

  filterPopover(anchor) {
    document.querySelectorAll('.db-pop').forEach((p) => p.remove());
    const view = this.view;
    view.filters = view.filters || [];
    const keys = [NAME, ...this.settings.columns.map((c) => c.key)];
    const pop = h('div', { class: 'db-pop', role: 'dialog', 'aria-label': 'Filters' });
    const draw = () => {
      pop.replaceChildren(
        h('span', { class: 'mono-label' }, 'Show notes where'),
        ...view.filters.map((f, i) => {
          const col = this.column(f.key);
          const keySel = h('select', { class: 'db-input', 'aria-label': 'Column' }, keys.map((k) => h('option', { value: k, selected: k === f.key || null }, this.label(k))));
          const ops = OPS[col.type] || OPS.text;
          const opSel = h('select', { class: 'db-input', 'aria-label': 'Condition' }, ops.map((o) => h('option', { value: o, selected: o === f.op || null }, o)));
          const needsValue = !/empty|checked/.test(f.op);
          let valueEl = null;
          if (needsValue) {
            if (col.type === 'select') {
              valueEl = h('select', { class: 'db-input', 'aria-label': 'Value' }, (col.options || []).map((o) => h('option', { value: o, selected: o === f.value || null }, o)));
            } else {
              valueEl = h('input', { class: 'db-input', 'aria-label': 'Value', type: col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text', value: f.value ?? '' });
            }
            valueEl.addEventListener('change', () => { f.value = valueEl.value; this.save(); this.renderKeepPop(draw); });
            if (col.type === 'select' && f.value == null && col.options && col.options.length) f.value = col.options[0];
          }
          keySel.addEventListener('change', () => { f.key = keySel.value; f.op = (OPS[this.column(f.key).type] || OPS.text)[0]; f.value = ''; this.save(); this.renderKeepPop(draw); });
          opSel.addEventListener('change', () => { f.op = opSel.value; this.save(); this.renderKeepPop(draw); });
          return h('div', { class: 'db-filter' }, keySel, opSel, valueEl,
            h('button', { class: 'db-x', 'aria-label': 'Remove filter', onclick: () => { view.filters.splice(i, 1); this.save(); this.renderKeepPop(draw); } }, '×'));
        }),
        h('button', { class: 'db-tool', onclick: () => {
          const key = this.settings.columns[0] ? this.settings.columns[0].key : NAME;
          view.filters.push({ key, op: (OPS[this.column(key).type] || OPS.text)[0], value: '' });
          this.save();
          this.renderKeepPop(draw);
        } }, '+ Add filter'));
    };
    draw();
    document.body.append(pop);
    const box = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 460))}px`;
    pop.style.top = `${box.bottom + 6}px`;
    const away = (e) => {
      if (!pop.contains(e.target) && e.target !== anchor && !e.target.closest('.ask')) {
        pop.remove();
        document.removeEventListener('mousedown', away, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', away, true), 0);
  }

  // Redraws the database under an open filter pop-up without closing it.
  renderKeepPop(draw) {
    const pop = document.querySelector('.db-pop');
    const bar = this.root.querySelector('.db-bar');
    const scroll = this.root.querySelector('.db-scroll, .db-cards-wrap');
    const fresh = this.view.type === 'cards' ? this.cards(this.visibleRows()) : this.table(this.visibleRows());
    if (scroll) scroll.replaceWith(fresh);
    const count = (this.view.filters || []).length;
    const filterBtn = bar && [...bar.querySelectorAll('.db-tool')][1];
    if (filterBtn) {
      filterBtn.textContent = count ? `Filter · ${count}` : 'Filter ▾';
      filterBtn.classList.toggle('is-on', Boolean(count));
    }
    const countEl = bar && bar.querySelector('.db-count');
    if (countEl) countEl.textContent = `${this.visibleRows().length} of ${this.rows.length} notes`;
    if (pop) draw();
  }

  async addRow() {
    const name = await askName(`New row in ${this.folderName}`, 'Note name, then Enter');
    if (!name) return;
    try {
      await this.io.addRow(name.trim());
    } catch (err) {
      alert(`Couldn't add the row.\n\n${err.message}`);
      return;
    }
    await this.load();
  }
}
