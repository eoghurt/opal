// Heatmaps from notes: a ```tracker block (Obsidian's Tracker plugin format —
// see shared/tracker.js) shows as a year of squares, one per day, darker for
// bigger values. The block's settings show again when the cursor goes into it.
// Also used by the home page's Heatmap widget.
//
//   renderHeatmap(data, { openFile }) → element     data: from window.opal.trackerData
//   trackerBlocks({ load(source), openFile(path) }) → CodeMirror extension
//   insertHeatmap(view)  — puts a starter block below the cursor

import { EditorView, WidgetType, Decoration } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import { h, icon } from './ui.js';

const LEVELS = 4;
const DAY_MS = 86400000;

function pad(n) {
  return String(n).padStart(2, '0');
}

function key(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Only simple colour names and hex codes are used as colours.
function safeColor(value) {
  return value && /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i.test(value) ? value : null;
}

function fmt(n) {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Days in a row with a value, ending at `end` (or the day before, if `end` is empty).
function streaks(days) {
  const keys = Object.keys(days).filter((k) => days[k]).sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    const d = new Date(`${k}T12:00`);
    run = prev && Math.round((d - prev) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  let d = new Date();
  if (!days[key(d)]) d = addDays(d, -1);
  while (days[key(d)]) {
    current++;
    d = addDays(d, -1);
  }
  return { longest, current };
}

// data: { settings, days, notes }. Shows the 53 weeks up to this week; ‹ › move by a year.
export function renderHeatmap(data, { openFile, offset = 0, onOffset } = {}) {
  const { settings, days, notes } = data;
  const color = safeColor(settings.color) || 'var(--heat)';
  const end = addDays(mondayOf(new Date()), 6 - offset * 364);
  const start = addDays(mondayOf(end), -52 * 7);
  const values = Object.entries(days).filter(([k, v]) => v && k >= key(start) && k <= key(end)).map(([, v]) => v).sort((a, b) => a - b);
  const at = (q) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
  const thresholds = values.length ? [at(0.25), at(0.5), at(0.75)] : [];
  const level = (v) => (v ? 1 + thresholds.filter((t) => v > t).length : 0);
  const today = key(new Date());
  const unit = settings.unit ? ` ${settings.unit}` : '';

  const weeks = [];
  const months = [];
  for (let w = 0; w < 53; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const k = key(date);
      const v = days[k] || 0;
      const label = `${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${v ? `${fmt(v)}${unit}` : 'nothing'}${notes[k] ? ` — ${notes[k].map((p) => p.split('/').pop().replace(/\.md$/i, '')).join(', ')}` : ''}`;
      const cell = h(notes[k] ? 'button' : 'span', {
        class: `heat-cell lvl-${level(v)}${k > today ? ' is-future' : ''}${k === today ? ' is-today' : ''}`,
        title: label,
        'aria-label': label,
        onclick: notes[k] && openFile ? () => openFile(notes[k][0]) : null,
      });
      col.push(cell);
      if (date.getDate() === 1 || (w === 0 && d === 0)) months.push({ col: w, label: date.toLocaleDateString(undefined, { month: 'short' }) });
    }
    weeks.push(h('div', { class: 'heat-week' }, col));
  }
  const inRange = Object.entries(days).filter(([k]) => k >= key(start) && k <= key(end));
  const total = inRange.reduce((n, [, v]) => n + v, 0);
  const { longest, current } = streaks(days);
  const nav = onOffset ? h('span', { class: 'heat-nav' },
    h('button', { class: 'heat-navbtn', 'aria-label': 'A year earlier', onclick: () => onOffset(offset + 1) }, '‹'),
    h('span', { class: 'heat-range' }, `${start.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`),
    h('button', { class: 'heat-navbtn', 'aria-label': 'A year later', disabled: offset <= 0 || null, onclick: () => onOffset(offset - 1) }, '›')) : null;
  return h('div', { class: 'heatmap', style: `--heat-color: ${color}` },
    h('div', { class: 'heat-head' },
      h('span', { class: 'heat-title' }, settings.title),
      nav),
    h('div', { class: 'heat-grid' },
      h('div', { class: 'heat-months', 'aria-hidden': 'true' }, months.filter((m, i) => i === 0 || m.col - months[i - 1].col > 2).map((m) => h('span', { style: `grid-column: ${m.col + 1}` }, m.label))),
      h('div', { class: 'heat-body' },
        h('div', { class: 'heat-weekdays', 'aria-hidden': 'true' }, ['Mo', '', 'We', '', 'Fr', '', ''].map((d) => h('span', null, d))),
        h('div', { class: 'heat-weeks' }, weeks))),
    h('div', { class: 'heat-foot' },
      h('span', null, h('b', null, String(inRange.length)), inRange.length === 1 ? ' day' : ' days'),
      total !== inRange.length ? h('span', null, h('b', null, fmt(total)), `${unit} in all`) : null,
      h('span', null, 'longest streak ', h('b', null, String(longest))),
      h('span', null, 'current ', h('b', null, String(current))),
      h('span', { class: 'heat-legend', 'aria-hidden': 'true' }, 'less', Array.from({ length: LEVELS + 1 }, (_, i) => h('span', { class: `heat-cell lvl-${i}` })), 'more')));
}

// ---------- In the note editor ----------

class TrackerWidget extends WidgetType {
  constructor(source, from, io) {
    super();
    this.source = source;
    this.from = from;
    this.io = io;
  }

  eq(other) {
    return other.source === this.source;
  }

  toDOM(view) {
    const box = h('div', { class: 'heat-block' });
    let offset = 0;
    let data = null;
    const edit = h('button', {
      class: 'heat-edit',
      title: 'Edit the heatmap’s settings',
      onclick: () => {
        const pos = view.posAtDOM(box);
        const line = view.state.doc.lineAt(pos);
        view.dispatch({ selection: { anchor: Math.min(view.state.doc.length, line.to + 1) } });
        view.focus();
      },
    }, icon('pen', 13), 'Edit');
    const draw = () => {
      if (!data) return;
      box.replaceChildren(renderHeatmap(data, { openFile: this.io.openFile, offset, onOffset: (n) => { offset = n; draw(); } }), edit);
    };
    box.append(h('p', { class: 'heat-note' }, 'Counting…'));
    this.io.load(this.source).then((result) => {
      data = result;
      draw();
    }).catch((err) => {
      box.replaceChildren(h('p', { class: 'heat-note is-problem' }, `Can't draw this heatmap: ${err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`), edit);
    });
    return box;
  }

  ignoreEvent() {
    return true;
  }
}

const OPEN = /^```tracker\s*$/;

function trackerDecorations(state, io) {
  const doc = state.doc;
  const sel = state.selection.main;
  const ranges = [];
  for (let i = 1; i <= doc.lines; i++) {
    if (!OPEN.test(doc.line(i).text)) continue;
    let j = i + 1;
    while (j <= doc.lines && !/^```\s*$/.test(doc.line(j).text)) j++;
    if (j > doc.lines) break;
    const from = doc.line(i).from;
    const to = doc.line(j).to;
    // While the cursor is in the block, its settings show instead.
    if (!(sel.from <= to && sel.to >= from)) {
      const source = doc.sliceString(doc.line(i).to + 1, doc.line(j).from);
      ranges.push(Decoration.replace({ widget: new TrackerWidget(source, from, io), block: true }).range(from, to));
    }
    i = j;
  }
  return ranges.length ? Decoration.set(ranges) : Decoration.none;
}

export function trackerBlocks(io) {
  return StateField.define({
    create: (state) => trackerDecorations(state, io),
    update: (decos, tr) => (tr.docChanged || tr.selection ? trackerDecorations(tr.state, io) : decos),
    provide: (field) => EditorView.decorations.from(field),
  });
}

const STARTER = [
  '```tracker',
  'searchType: tag',
  'searchTarget: exercise',
  'folder: Calendar',
  'datasetName: Exercise',
  'month:',
  '    color: green',
  '```',
].join('\n');

// A starter heatmap on its own lines below the cursor: #exercise in the daily notes.
export function insertHeatmap(view) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const empty = !line.text.trim();
  const at = empty ? line.from : line.to;
  const insert = `${empty ? '' : '\n\n'}${STARTER}\n`;
  // The cursor goes onto the searchTarget line, so the settings show for editing.
  const cursor = at + (empty ? 0 : 2) + STARTER.indexOf('exercise');
  view.dispatch({ changes: { from: at, to: empty ? line.to : at, insert }, selection: { anchor: cursor, head: cursor + 'exercise'.length }, userEvent: 'input.heatmap' });
  view.focus();
}
