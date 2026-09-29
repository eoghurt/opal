// Flow sheets for debating: a note with `opal-type: flow` shows as columns,
// one per speaker. Each column is stored as a heading followed by its lines,
// so the note still reads normally in Obsidian:
//
//   ---
//   opal-type: flow
//   flow-format: australs
//   ---
//   ## 1st Affirmative
//   - Model: ban it
//   ## 1st Negative
//   - …
//
// `flow-format` is australs, world-schools, bp or custom (then `flow-columns`
// lists the columns). Tab moves to the next column. Autosaves like any note.
// A flow sheet is a template you apply to a note (toFlowText): whatever the
// note already had stays, shown as Notes above the columns. "Normal note"
// (fromFlowText) takes the flow properties off again.

import { h, askName } from '../ui.js';
import { readProperties, writeProperty } from '../../shared/properties.js';
import { stickyBlockRange, parseStickies, writeStickies } from '../../shared/stickies.js';

export const FLOW_FORMATS = {
  australs: {
    name: 'Australs 3v3',
    columns: ['1st Affirmative', '1st Negative', '2nd Affirmative', '2nd Negative', '3rd Affirmative', '3rd Negative', 'Negative Reply', 'Affirmative Reply'],
  },
  'world-schools': {
    name: 'World Schools',
    columns: ['1st Proposition', '1st Opposition', '2nd Proposition', '2nd Opposition', '3rd Proposition', '3rd Opposition', 'Opposition Reply', 'Proposition Reply'],
  },
  bp: {
    name: 'British Parliamentary',
    columns: ['Prime Minister', 'Leader of the Opposition', 'Deputy Prime Minister', 'Deputy Leader of the Opposition', 'Member of the Government', 'Member of the Opposition', 'Government Whip', 'Opposition Whip'],
  },
  custom: { name: 'Custom', columns: [] },
};

const SAVE_DELAY_MS = 500;

export function isFlowNote(text) {
  return String(readProperties(text)['opal-type'] || '').toLowerCase() === 'flow';
}

// "Australs 3v3", "australs", "BP", … → a format key.
export function formatKey(value) {
  const v = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (v.startsWith('austral')) return 'australs';
  if (v.startsWith('world') || v === 'ws' || v === 'wsdc') return 'world-schools';
  if (v === 'bp' || v.startsWith('british')) return 'bp';
  if (v === 'custom') return 'custom';
  return 'australs';
}

// The columns a flow note should have.
export function flowColumns(text) {
  const props = readProperties(text);
  const key = formatKey(props['flow-format']);
  if (key === 'custom') {
    const list = props['flow-columns'];
    const cols = Array.isArray(list) ? list : String(list || '').split(',');
    const clean = cols.map((c) => String(c).trim()).filter(Boolean);
    return clean.length ? clean : ['Speaker 1', 'Speaker 2'];
  }
  return FLOW_FORMATS[key].columns;
}

const BLOCK = /^(?:﻿)?---\r?\n[\s\S]*?\r?\n?---[ \t]*(?:\r?\n|$)/;

// Splits a flow note into { head (properties), before (text above the first
// column), sections: { name → lines }, extra (other headings), stickies }.
export function parseFlow(text) {
  let rest = String(text || '');
  const headMatch = BLOCK.exec(rest);
  const head = headMatch ? headMatch[0] : '';
  rest = rest.slice(head.length);
  const range = stickyBlockRange(rest);
  const stickiesText = range ? rest.slice(range.from, range.to) : '';
  if (range) rest = rest.slice(0, range.from) + rest.slice(range.to);
  const columns = flowColumns(text);
  const byName = new Map(columns.map((c) => [c.toLowerCase(), c]));
  const sections = Object.fromEntries(columns.map((c) => [c, []]));
  const before = [];
  const extra = [];
  let current = null;
  for (const line of rest.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const name = byName.get(m[1].toLowerCase());
      current = name || null;
      if (!name) extra.push(line);
      continue;
    }
    if (current) {
      if (line.trim()) sections[current].push(line.replace(/^\s*[-*+]\s?/, ''));
    } else if (extra.length) {
      extra.push(line);
    } else {
      before.push(line);
    }
  }
  return { head, before: before.join('\n').trim(), sections, extra: extra.join('\n').trim(), stickiesText, columns };
}

export function serializeFlow(flow) {
  const parts = [];
  if (flow.before) parts.push(flow.before, '');
  for (const column of flow.columns) {
    parts.push(`## ${column}`);
    for (const line of flow.sections[column] || []) if (line.trim()) parts.push(`- ${line.trim()}`);
    parts.push('');
  }
  if (flow.extra) parts.push(flow.extra, '');
  let body = parts.join('\n').replace(/\n+$/, '\n');
  if (flow.stickiesText) body = `${body}\n${flow.stickiesText.trim()}\n`;
  return flow.head + body;
}

// A new flow sheet's text.
export function newFlowText(formatKeyName, customColumns = []) {
  let text = writeProperty('', 'opal-type', 'flow', 'text');
  text = writeProperty(text, 'flow-format', formatKeyName, 'text');
  if (formatKeyName === 'custom') text = writeProperty(text, 'flow-columns', customColumns, 'text');
  return serializeFlow(parseFlow(text));
}

// Any note → a flow sheet in that format. Nothing written is lost: text
// before the first speaker heading becomes the sheet's Notes, other headings
// are kept after the columns.
export function toFlowText(text, key, customColumns = ['Speaker 1', 'Speaker 2']) {
  let out = writeProperty(text, 'opal-type', 'flow', 'text');
  out = writeProperty(out, 'flow-format', key, 'text');
  if (key === 'custom' && !readProperties(out)['flow-columns']) out = writeProperty(out, 'flow-columns', customColumns, 'text');
  const flow = parseFlow(out);
  // Empty headings left over from another format's speakers go.
  const speakers = new Set(Object.values(FLOW_FORMATS).flatMap((f) => f.columns.map((c) => c.toLowerCase())));
  const kept = [];
  const lines = flow.extra.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (m && speakers.has(m[1].toLowerCase())) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || /^#{1,2}\s/.test(lines[j])) {
        i = j - 1;
        continue;
      }
    }
    kept.push(lines[i]);
  }
  flow.extra = kept.join('\n').trim();
  return serializeFlow(flow);
}

// A flow sheet → an ordinary note (its headings and points stay as they are).
export function fromFlowText(text) {
  let out = writeProperty(text, 'opal-type', null);
  out = writeProperty(out, 'flow-format', null);
  return writeProperty(out, 'flow-columns', null);
}

export class FlowEditor {
  static editsText = true;

  // Same shape as MarkdownEditor (see editor-registry.js). onExport(data)
  // exports the sheet to Word.
  constructor({ parent, content, save, onStatus, onChange, onExport, onLeaveFlow }) {
    this.save = save;
    this.onLeaveFlow = onLeaveFlow || null;
    this.onStatus = onStatus;
    this.onChange = onChange || (() => {});
    this.onExport = onExport || (() => {});
    this.dirty = false;
    this.saving = false;
    this.saveCount = 0;
    this.queue = Promise.resolve();
    this.text = content;
    this.root = h('div', { class: 'flow' });
    parent.replaceChildren(this.root);
    this.render();
    setTimeout(() => this.root.querySelector('.flow-text')?.focus(), 0);
  }

  get isDirty() {
    return this.dirty;
  }

  getText() {
    return this.text;
  }

  render() {
    const flow = parseFlow(this.text);
    this.flow = flow;
    const key = formatKey(readProperties(this.text)['flow-format']);
    const format = h('select', { class: 'flow-format', 'aria-label': 'Flow format' },
      Object.entries(FLOW_FORMATS).map(([k, f]) => h('option', { value: k, selected: k === key || null }, f.name)));
    format.addEventListener('change', () => this.setFormat(format.value));
    const bar = h('div', { class: 'flow-bar' },
      h('span', { class: 'mono-label' }, 'Flow sheet'),
      format,
      key === 'custom' ? h('button', { class: 'flow-btn', onclick: () => this.editColumns() }, 'Columns…') : null,
      h('span', { class: 'flow-hint' }, 'Tab moves to the next speaker · one point per line'),
      this.onLeaveFlow ? h('button', { class: 'flow-btn', title: 'Show this as an ordinary note (the points stay as headings and bullets)', onclick: () => this.onLeaveFlow() }, 'Normal note') : null,
      h('button', { class: 'flow-btn is-primary', onclick: () => this.onExport(this.exportData()) }, 'Export to Word…'));
    // Notes above the columns: the motion, which side, anything the note had before.
    const notes = h('textarea', { class: 'flow-notes', 'aria-label': 'Notes', spellcheck: 'true', placeholder: 'Motion, side, notes…', rows: String(Math.min(8, Math.max(1, flow.before.split('\n').length))) });
    notes.value = flow.before;
    notes.addEventListener('input', () => {
      flow.before = notes.value;
      notes.rows = Math.min(8, Math.max(1, notes.value.split('\n').length));
      this.text = serializeFlow(flow);
      this.markEdited();
    });
    const grid = h('div', { class: 'flow-grid', style: `grid-template-columns: repeat(${flow.columns.length}, minmax(190px, 1fr))` },
      flow.columns.map((column, i) => {
        const area = h('textarea', {
          class: 'flow-text',
          'aria-label': column,
          spellcheck: 'true',
          'data-column': column,
          placeholder: i === 0 ? 'Type a point, Enter for the next…' : '',
        });
        area.value = flow.sections[column].join('\n');
        area.addEventListener('input', () => {
          flow.sections[column] = area.value.split('\n');
          this.text = serializeFlow(flow);
          this.markEdited();
        });
        area.addEventListener('keydown', (e) => {
          if (e.key !== 'Tab') return;
          e.preventDefault();
          const all = [...this.root.querySelectorAll('.flow-text')];
          const next = all[(all.indexOf(area) + (e.shiftKey ? -1 : 1) + all.length) % all.length];
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        });
        return h('section', { class: `flow-col${i % 2 ? ' is-second' : ''}` },
          h('h3', { class: 'flow-speaker' }, column),
          area);
      }));
    this.root.replaceChildren(bar, notes, grid);
  }

  exportData() {
    const flow = parseFlow(this.text);
    return {
      format: FLOW_FORMATS[formatKey(readProperties(this.text)['flow-format'])].name,
      columns: flow.columns,
      lines: flow.columns.map((c) => flow.sections[c].filter((l) => l.trim())),
    };
  }

  // Lines move by position into the new columns (none are lost).
  moveInto(text) {
    const old = parseFlow(this.text);
    const oldLines = old.columns.map((c) => old.sections[c]);
    const flow = parseFlow(text);
    flow.columns.forEach((c, i) => { flow.sections[c] = oldLines[i] || []; });
    for (let i = flow.columns.length; i < oldLines.length; i++) flow.sections[flow.columns[flow.columns.length - 1]].push(...oldLines[i]);
    this.text = serializeFlow(flow);
    this.markEdited();
    this.render();
  }

  setFormat(key) {
    let text = writeProperty(this.text, 'flow-format', key, 'text');
    if (key === 'custom' && !readProperties(text)['flow-columns']) text = writeProperty(text, 'flow-columns', parseFlow(this.text).columns, 'text');
    this.moveInto(text);
  }

  async editColumns() {
    const answer = await askName('Columns (speakers)', 'Names separated by commas, then Enter', this.flow.columns.join(', '));
    if (!answer) return;
    const names = answer.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length) this.moveInto(writeProperty(this.text, 'flow-columns', names, 'text'));
  }

  // ---------- Saving (same rules as the markdown editor) ----------

  markEdited() {
    this.dirty = true;
    this.onStatus('Edited');
    this.onChange();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush().catch(() => {}), SAVE_DELAY_MS);
  }

  flush() {
    clearTimeout(this.timer);
    const run = this.queue.then(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      this.saving = true;
      this.onStatus('Saving…');
      try {
        await this.save(this.text);
        this.saveCount++;
        if (!this.dirty) this.onStatus('Saved');
      } catch (err) {
        this.dirty = true;
        this.onStatus('Save failed');
        throw err;
      } finally {
        this.saving = false;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  get saveToken() {
    return this.saveCount;
  }

  reloadFromDisk(diskText, token) {
    if (this.dirty || this.saving || token !== this.saveCount) return false;
    return this.replaceText(diskText, { fromDisk: true });
  }

  replaceText(next, { fromDisk = false } = {}) {
    if (next === this.text) return false;
    const focused = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.column : null;
    this.text = next;
    this.render();
    if (focused) this.root.querySelector(`.flow-text[data-column="${CSS.escape(focused)}"]`)?.focus();
    if (!fromDisk) this.markEdited();
    else this.onChange();
    return true;
  }

  getStickies() {
    return parseStickies(this.text);
  }

  setStickies(list) {
    this.replaceText(writeStickies(this.text, list));
  }

  destroy() {
    clearTimeout(this.timer);
    this.root.remove();
  }
}
