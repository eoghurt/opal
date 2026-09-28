// Logbook: an overview of a week, month or year — headline numbers, an
// activity heatmap, where you worked, and your busiest days. Click a day to
// see exactly what happened; everything in that list opens.

import { h } from '../ui.js';
import { makePanel } from '../panel.js';
import { noteName } from '../format.js';
import { clock, dayKey, keyToDate, startOfWeek, addDays } from '../calendar/events.js';
import { periodRange, shiftPeriod, daysIn, summarise, dayScore, loadEvents } from '../logbook/activity.js';

const LEVELS = 4; // heatmap steps above "nothing"

function fmtChange(now, before, unit) {
  if (!before && !now) return 'same as last ' + unit;
  if (!before) return `▲ new this ${unit}`;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return `same as last ${unit}`;
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last ${unit}`;
}

export class LogbookView {
  // getFiles() → every file node; readFile(path) → text.
  constructor(container, { kind, date, getFiles, readFile, openFile, openCalendarDay, onChange }) {
    this.container = container;
    this.kind = kind || 'month';
    this.date = date || new Date();
    this.io = { getFiles, readFile, openFile, openCalendarDay, onChange: onChange || (() => {}) };
    this.selected = null;
    this.root = h('div', { class: 'logbook' });
    this.tooltip = h('div', { class: 'lb-tip', role: 'tooltip', hidden: true });
    container.replaceChildren(this.root);
    this.load();
  }

  destroy() {
    this.tooltip.remove();
  }

  go(kind, date) {
    this.kind = kind;
    this.date = date;
    this.selected = null;
    this.io.onChange({ kind, date });
    this.load();
  }

  async reload() {
    return this.load();
  }

  async load() {
    const files = this.io.getFiles();
    const range = periodRange(this.kind, this.date);
    const before = periodRange(this.kind, shiftPeriod(this.kind, this.date, -1));
    const [events, eventsBefore] = await Promise.all([
      loadEvents(files, range, this.io.readFile),
      loadEvents(files, before, this.io.readFile),
    ]);
    this.range = range;
    this.thresholds = null;
    this.data = summarise(files, events, range);
    this.previous = summarise(files, eventsBefore, before);
    if (!this.selected) {
      const today = dayKey(new Date());
      const keys = daysIn(range);
      this.selected = keys.includes(today) ? today : keys.reduce((best, k) => (dayScore(this.data.perDay[k]) > dayScore(this.data.perDay[best]) ? k : best), keys[0]);
    }
    this.render();
  }

  // ---------- Drawing ----------

  periodTitle() {
    const d = this.range.start;
    if (this.kind === 'year') return String(d.getFullYear());
    if (this.kind === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const last = addDays(this.range.end, -1);
    return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  render() {
    this.hideTip();
    const unit = this.kind;
    const t = this.data.totals;
    const p = this.previous.totals;

    const head = h('section', { class: 'home-head' },
      h('div', { class: 'home-title' },
        h('span', { class: 'mono-label' }, `Logbook · ${unit}`),
        h('h1', { class: 'display home-h1' }, 'Logbook.'),
        h('p', { class: 'home-desc' }, this.periodTitle())),
      h('div', { class: 'cal-controls' },
        h('div', { class: 'cal-segment', role: 'group', 'aria-label': 'Period' },
          ['week', 'month', 'year'].map((k) => h('button', {
            class: `cal-seg${this.kind === k ? ' is-on' : ''}`,
            'aria-pressed': String(this.kind === k),
            onclick: () => this.go(k, this.date),
          }, k[0].toUpperCase() + k.slice(1)))),
        h('div', { class: 'cal-nav' },
          h('button', { class: 'cal-navbtn', 'aria-label': `Previous ${unit}`, onclick: () => this.go(this.kind, shiftPeriod(this.kind, this.date, -1)) }, '‹'),
          h('button', { class: 'cal-navbtn cal-today', onclick: () => this.go(this.kind, new Date()) }, `This ${unit}`),
          h('button', { class: 'cal-navbtn', 'aria-label': `Next ${unit}`, onclick: () => this.go(this.kind, shiftPeriod(this.kind, this.date, 1)) }, '›'))),
    );

    const tile = (label, now, before, hint) => h('div', { class: 'lb-tile' },
      h('span', { class: 'mono-label' }, label),
      h('span', { class: 'display lb-number' }, String(now)),
      h('span', { class: 'lb-change' }, fmtChange(now, before, unit)),
      hint ? h('span', { class: 'serif-i lb-hint' }, hint) : null);

    const tiles = h('section', { class: 'lb-tiles', 'aria-label': 'Totals' },
      tile('Notes created', t.created, p.created),
      tile('Notes edited', t.edited, p.edited, 'last change in this period'),
      tile('Calendar events', t.events, p.events),
      tile('Files added', t.added, p.added, 'PDFs, pictures, Office…'));

    const main = h('div', { class: 'lb-main' },
      h('section', { class: 'lb-panel', 'aria-label': 'Activity' },
        h('div', { class: 'lb-panel-head' }, h('h2', { class: 'display lb-h2' }, 'Activity'), this.legend()),
        this.kind === 'year' ? this.yearHeatmap() : this.calendarHeatmap()),
      h('div', { class: 'lb-row' },
        h('section', { class: 'lb-panel', 'aria-label': 'Where you worked' },
          h('div', { class: 'lb-panel-head' }, h('h2', { class: 'display lb-h2' }, 'Where you worked')),
          this.folderBars()),
        h('section', { class: 'lb-panel', 'aria-label': 'Busiest days' },
          h('div', { class: 'lb-panel-head' }, h('h2', { class: 'display lb-h2' }, this.kind === 'year' ? 'Busiest months' : 'Busiest days')),
          this.timeBars())),
      h('p', { class: 'serif-i lb-footnote' }, 'Edits count the last time each file changed — your Mac doesn’t keep a record of every edit.'));

    const detail = this.dayDetail();
    const body = h('div', { class: 'lb-body' }, main, detail);
    this.root.replaceChildren(head, tiles, body);
    makePanel(detail, { id: 'lb-detail', side: 'right', label: 'Day', width: 300, min: 220, max: 460 });
    this.root.append(this.tooltip);
  }

  legend() {
    return h('span', { class: 'lb-legend', 'aria-hidden': 'true' },
      h('span', { class: 'mono-label' }, 'Less'),
      Array.from({ length: LEVELS + 1 }, (_, i) => h('span', { class: `lb-cell lvl-${i}` })),
      h('span', { class: 'mono-label' }, 'More'));
  }

  // Shade by rank among the period's active days (quartiles), so one very
  // busy day doesn't wash every other day out to the palest shade.
  level(score) {
    if (!score) return 0;
    if (!this.thresholds) {
      const scores = Object.values(this.data.perDay).map(dayScore).filter(Boolean).sort((a, b) => a - b);
      const at = (q) => scores[Math.min(scores.length - 1, Math.floor(q * scores.length))];
      this.thresholds = scores.length ? [at(0.25), at(0.5), at(0.75)] : [];
    }
    return 1 + this.thresholds.filter((t) => score > t).length;
  }

  cell(key, extraClass = '', label = null) {
    const day = this.data.perDay[key];
    const score = dayScore(day);
    const summary = this.summaryText(key);
    const future = key > dayKey(new Date());
    const el = h('button', {
      class: `lb-cell lvl-${this.level(score)}${key === this.selected ? ' is-selected' : ''}${future ? ' is-future' : ''}${extraClass}`,
      'aria-label': summary,
      onclick: () => { this.selected = key; this.render(); },
    }, label);
    el.addEventListener('pointerenter', () => this.showTip(el, summary));
    el.addEventListener('focus', () => this.showTip(el, summary));
    el.addEventListener('pointerleave', () => this.hideTip());
    el.addEventListener('blur', () => this.hideTip());
    return el;
  }

  summaryText(key) {
    const day = this.data.perDay[key];
    const date = keyToDate(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    if (!dayScore(day)) return `${date} · nothing`;
    const parts = [];
    if (day.created.length) parts.push(`${day.created.length} new note${day.created.length > 1 ? 's' : ''}`);
    if (day.edited.length) parts.push(`${day.edited.length} edited`);
    if (day.events.length) parts.push(`${day.events.length} event${day.events.length > 1 ? 's' : ''}`);
    if (day.added.length) parts.push(`${day.added.length} file${day.added.length > 1 ? 's' : ''} added`);
    return `${date} · ${parts.join(', ')}`;
  }

  // Year: weeks as columns (like GitHub), months across the top.
  yearHeatmap() {
    const first = startOfWeek(this.range.start);
    const columns = [];
    const months = [];
    for (let week = first, i = 0; week < this.range.end; week = addDays(week, 7), i++) {
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(week, d);
        const key = dayKey(date);
        const inYear = date >= this.range.start && date < this.range.end;
        cells.push(inYear ? this.cell(key) : h('span', { class: 'lb-cell is-blank', 'aria-hidden': 'true' }));
        if (inYear && date.getDate() === 1) months.push({ col: i, label: date.toLocaleDateString(undefined, { month: 'short' }) });
      }
      columns.push(h('div', { class: 'lb-week' }, cells));
    }
    return h('div', { class: 'lb-year' },
      h('div', { class: 'lb-months', 'aria-hidden': 'true', style: `grid-template-columns: repeat(${columns.length}, minmax(0, 1fr))` },
        months.map((m) => h('span', { class: 'mono-label', style: `grid-column: ${m.col + 1}` }, m.label))),
      h('div', { class: 'lb-year-grid' },
        h('div', { class: 'lb-weekdays', 'aria-hidden': 'true' }, ['Mo', '', 'We', '', 'Fr', '', 'Su'].map((d) => h('span', { class: 'mono-label' }, d))),
        h('div', { class: 'lb-weeks', style: `grid-template-columns: repeat(${columns.length}, minmax(0, 1fr))` }, columns)));
  }

  // Week and month: a calendar layout with day numbers.
  calendarHeatmap() {
    const first = startOfWeek(this.range.start);
    const cells = [];
    for (let date = first; date < this.range.end || date.getDay() !== 1; date = addDays(date, 1)) {
      const key = dayKey(date);
      const inPeriod = date >= this.range.start && date < this.range.end;
      cells.push(inPeriod
        ? this.cell(key, ' is-big', h('span', { class: 'lb-daynum' }, String(date.getDate())))
        : h('span', { class: 'lb-cell is-big is-blank', 'aria-hidden': 'true' }));
      if (cells.length > 42) break;
    }
    return h('div', { class: 'lb-cal' },
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('span', { class: 'mono-label lb-cal-wd' }, d)),
      cells);
  }

  // Horizontal bars: activity per top-level folder.
  folderBars() {
    const rows = Object.entries(this.data.folders).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return h('p', { class: 'hand side-hint' }, 'quiet period — nothing new here');
    const shown = rows.slice(0, 6);
    const rest = rows.slice(6).reduce((sum, [, n]) => sum + n, 0);
    if (rest) shown.push(['Other', rest]);
    const max = Math.max(...shown.map(([, n]) => n));
    return h('div', { class: 'lb-bars' },
      shown.map(([name, n]) => {
        const bar = h('span', { class: 'lb-bar-fill', style: `width: ${(n / max) * 100}%` });
        const row = h('div', { class: 'lb-bar-row', tabindex: '0', 'aria-label': `${name}: ${n}` },
          h('span', { class: 'lb-bar-label' }, name),
          h('span', { class: 'lb-bar-track' }, bar),
          h('span', { class: 'lb-bar-value' }, String(n)));
        row.addEventListener('pointerenter', () => this.showTip(row, `${name} · ${n} note${n === 1 ? '' : 's'} created or edited`));
        row.addEventListener('pointerleave', () => this.hideTip());
        return row;
      }));
  }

  // Vertical bars over time: each day (week/month) or each month (year).
  timeBars() {
    let points;
    if (this.kind === 'year') {
      points = Array.from({ length: 12 }, (_, m) => {
        const keys = daysIn({ start: new Date(this.range.start.getFullYear(), m, 1), end: new Date(this.range.start.getFullYear(), m + 1, 1) });
        return {
          label: new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'narrow' }),
          full: new Date(this.range.start.getFullYear(), m, 1).toLocaleDateString(undefined, { month: 'long' }),
          value: keys.reduce((sum, k) => sum + dayScore(this.data.perDay[k]), 0),
        };
      });
    } else {
      points = daysIn(this.range).map((key) => ({
        key,
        label: this.kind === 'week' ? keyToDate(key).toLocaleDateString(undefined, { weekday: 'narrow' }) : String(keyToDate(key).getDate()),
        full: this.summaryText(key),
        value: dayScore(this.data.perDay[key]),
      }));
    }
    const max = Math.max(1, ...points.map((pt) => pt.value));
    const peak = points.reduce((best, pt) => (pt.value > best.value ? pt : best), points[0]);
    return h('div', { class: 'lb-cols', style: `grid-template-columns: repeat(${points.length}, minmax(0, 1fr))` },
      points.map((pt) => {
        const col = h('button', {
          class: `lb-col${pt.key && pt.key === this.selected ? ' is-selected' : ''}`,
          'aria-label': this.kind === 'year' ? `${pt.full}: ${pt.value}` : pt.full,
          onclick: () => { if (pt.key) { this.selected = pt.key; this.render(); } },
        },
        h('span', { class: 'lb-col-area' },
          pt === peak && pt.value ? h('span', { class: 'lb-col-peak' }, String(pt.value)) : null,
          h('span', { class: 'lb-col-fill', style: `height: ${(pt.value / max) * 100}%` })),
        h('span', { class: 'lb-col-label' }, pt.label));
        const tip = this.kind === 'year' ? `${pt.full} · ${pt.value}` : pt.full;
        col.addEventListener('pointerenter', () => this.showTip(col, tip));
        col.addEventListener('pointerleave', () => this.hideTip());
        return col;
      }));
  }

  // The selected day, in full.
  dayDetail() {
    const key = this.selected;
    const day = this.data.perDay[key] || { created: [], edited: [], added: [], events: [] };
    const date = keyToDate(key);
    const item = (mark, label, onclick, meta) => h('button', { class: 'lb-item', onclick },
      h('span', { class: 'lb-item-mark', 'aria-hidden': 'true' }, mark),
      h('span', { class: 'lb-item-label' }, label),
      meta ? h('span', { class: 'lb-item-meta' }, meta) : null);
    const group = (title, entries) => (entries.length ? h('div', { class: 'lb-group' }, h('span', { class: 'mono-label' }, title), entries) : null);

    return h('aside', { class: 'lb-detail', 'aria-label': 'Selected day' },
      h('span', { class: 'mono-label' }, 'Day'),
      h('span', { class: 'display lb-detail-title' }, date.toLocaleDateString(undefined, { weekday: 'long' })),
      h('span', { class: 'serif-i' }, date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })),
      dayScore(day)
        ? h('div', { class: 'lb-groups' },
          group('Events', day.events.slice().sort((a, b) => a.start - b.start).map((e) => item(e.allDay ? '◆' : clock(e.start), e.title, () => this.io.openCalendarDay(key)))),
          group('New notes', day.created.map((f) => item('+', noteName(f.path), () => this.io.openFile(f.path), f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : null))),
          group('Edited', day.edited.map((f) => item('✎', noteName(f.path), () => this.io.openFile(f.path), f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : null))),
          group('Files added', day.added.map((f) => item('↓', f.path.split('/').pop(), () => this.io.openFile(f.path)))))
        : h('p', { class: 'hand side-hint' }, 'a quiet day'),
      h('button', { class: 'serif-link', onclick: () => this.io.openCalendarDay(key) }, 'Open in the calendar →'));
  }

  // ---------- Tooltip ----------

  showTip(anchor, text) {
    const box = anchor.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    this.tooltip.textContent = text;
    this.tooltip.hidden = false;
    const width = this.tooltip.offsetWidth;
    this.tooltip.style.left = `${Math.min(Math.max(8, box.left - host.left + box.width / 2 - width / 2), host.width - width - 8)}px`;
    this.tooltip.style.top = `${box.top - host.top - 34}px`;
  }

  hideTip() {
    this.tooltip.hidden = true;
  }
}
