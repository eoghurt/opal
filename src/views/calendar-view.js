// Calendar: Day, Week and Month views over the daily notes in Calendar/.
// Click empty space to add an event, drag to move, drag the bottom edge to
// change its length, click an event for colour / repeat / links / delete.
// Events are read from and written to the day notes, and repeating ones to
// Calendar/Repeating.md (see calendar/events.js).

import { h, askName, askChoice } from '../ui.js';
import { makePanel } from '../panel.js';
import { slotFor } from '../palettes.js';
import {
  SNAP, dayKey, keyToDate, addDays, startOfWeek, clock,
  parseEvents, formatEvent, replaceEvent, insertEvent, layoutColumns, EVENT_COLORS,
  parseSeries, formatSeries, occurrences, appendSeries, stackLanes,
} from '../calendar/events.js';
import { describeRule, shiftKey } from '../calendar/repeat.js';
import { repeatPicker } from '../repeat-picker.js';
import { showMenu } from '../context-menu.js';

// Reminder choices (minutes before the start; all-day events start at 9:00).
const REMIND_TIMED = [[null, 'No reminder'], [0, 'At the start'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']];
const REMIND_ALL_DAY = [[null, 'No reminder'], [0, 'On the day, 9:00'], [1440, 'Day before, 9:00']];
const TASK_LENGTH = 30; // minutes a timed task takes up in the grid

const HOUR = 39; // pixels per hour
const MINUTE = HOUR / 60;
const MONTH_ITEMS = 4; // events shown in a month cell before "+N more"

function longDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function weekday(date, style = 'long') {
  return date.toLocaleDateString(undefined, { weekday: style });
}

function snap(minutes) {
  return Math.round(minutes / SNAP) * SNAP;
}

export class CalendarView {
  // readDay(key) → text or null. writeDay(key, text) → promise.
  // noteDays() → Set of day keys that have a note. openDayNote(key), openLink(target).
  // readRepeats() → text of Calendar/Repeating.md ('' if none). writeRepeats(text).
  // updateTask(task, patch) changes a task's date/time (dragging it in the grid).
  constructor(container, { date, mode, readDay, writeDay, readRepeats, writeRepeats, noteDays, openDayNote, openLink, onChange, loadTasks, toggleTask, updateTask, addTask, deleteTask, openTasks }) {
    this.container = container;
    this.date = date || new Date();
    this.mode = mode || 'day';
    this.io = {
      readDay, writeDay, noteDays, openDayNote, openLink, toggleTask, updateTask, addTask, deleteTask, openTasks,
      readRepeats: readRepeats || (async () => ''),
      writeRepeats,
      onChange: onChange || (() => {}),
      loadTasks: loadTasks || (async () => []),
    };
    this.series = [];
    this.tasks = [];
    this.days = {};
    this.writing = Promise.resolve();
    this.scrolled = false;
    this.clockTimer = setInterval(() => this.placeNowLine(), 60 * 1000);
    this.root = h('div', { class: 'cal' });
    container.replaceChildren(this.root);
    // Two-finger swipe left/right (or Shift+scroll) steps to the next or
    // previous day, week or month — one step per swipe.
    let swipe = 0;
    let resting = null;
    this.root.addEventListener('wheel', (event) => {
      const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      if (Math.abs(dx) <= Math.abs(event.shiftKey ? 0 : event.deltaY)) return;
      if (event.target.closest('.cal-pop, .ctx-menu')) return;
      event.preventDefault();
      clearTimeout(resting);
      resting = setTimeout(() => { swipe = 0; this.swiped = false; }, 180);
      if (this.swiped) return; // wait for this swipe to finish
      swipe += dx;
      if (Math.abs(swipe) > 80) {
        this.swiped = true;
        this.step(swipe > 0 ? 1 : -1);
      }
    }, { passive: false });
    this.render();
    this.load();
  }

  destroy() {
    clearInterval(this.clockTimer);
    this.closePopover();
  }

  visibleKeys() {
    if (this.mode === 'day') return [dayKey(this.date)];
    if (this.mode === 'month') {
      const first = new Date(this.date.getFullYear(), this.date.getMonth(), 1);
      const start = startOfWeek(first);
      const inMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const weeks = Math.ceil((Math.round((first - start) / 86400000) + inMonth) / 7);
      return Array.from({ length: weeks * 7 }, (_, i) => dayKey(addDays(start, i)));
    }
    const monday = startOfWeek(this.date);
    return Array.from({ length: 7 }, (_, i) => dayKey(addDays(monday, i)));
  }

  async load() {
    const keys = this.visibleKeys();
    const [loaded, repeats] = await Promise.all([
      Promise.all(keys.map(async (key) => [key, await this.io.readDay(key)])),
      this.io.readRepeats(),
    ]);
    this.series = parseSeries(repeats || '');
    for (const [key, text] of loaded) {
      const events = [...parseEvents(text || '', key), ...occurrences(this.series, key)];
      this.days[key] = { text: text || '', exists: text !== null, events };
    }
    // Multi-day events that began before the first day on screen (up to two
    // months back) still show on the days they run over.
    const earliest = shiftKey(keys[0], -62);
    const before = [...this.io.noteDays()].filter((k) => k < keys[0] && k >= earliest);
    const earlier = await Promise.all(before.map(async (key) => parseEvents((await this.io.readDay(key)) || '', key)));
    this.carried = earlier.flat().filter((e) => e.endDay && e.endDay >= keys[0]);
    this.tasks = await this.io.loadTasks();
    this.render();
  }

  reload() {
    if (this.dragging) return; // finish the drag first
    return this.load();
  }

  // Next (1) or previous (-1) day, week or month.
  step(direction) {
    const d = this.date;
    if (this.mode === 'month') this.go(new Date(d.getFullYear(), d.getMonth() + direction, 1));
    else this.go(addDays(d, direction * (this.mode === 'day' ? 1 : 7)));
  }

  go(date, mode = this.mode) {
    this.date = date;
    this.mode = mode;
    this.scrolled = false;
    this.io.onChange({ date: this.date, mode: this.mode });
    this.render();
    this.load();
  }

  // ---------- Items over several days ----------

  // Every loaded multi-day event (starting on screen or earlier).
  multiDayEvents() {
    const own = Object.values(this.days).flatMap((d) => d.events.filter((e) => e.endDay));
    return [...(this.carried || []), ...own];
  }

  // A task's first and last day (a 🛫 start date makes it span).
  taskSpan(task) {
    const last = task.due;
    const first = task.startDate && task.startDate < last ? task.startDate : last;
    return { first, last, multi: first < last };
  }

  // Things for the all-day row / month cells: all-day and multi-day events,
  // and tasks without a time or over several days. → [{ kind, item, first, last }]
  allDayItems(keys) {
    const firstKey = keys[0];
    const lastKey = keys[keys.length - 1];
    const out = [];
    const seen = new Set();
    for (const e of this.multiDayEvents()) {
      const id = `${e.day}|${e.raw}`;
      if (seen.has(id) || e.day > lastKey || e.endDay < firstKey) continue;
      seen.add(id);
      out.push({ kind: 'event', item: e, first: e.day, last: e.endDay });
    }
    for (const key of keys) {
      for (const e of (this.days[key]?.events || []).filter((ev) => ev.allDay && !ev.endDay)) {
        out.push({ kind: 'event', item: e, first: key, last: key });
      }
    }
    for (const t of this.tasks) {
      const span = this.taskSpan(t);
      if (span.last < firstKey || span.first > lastKey) continue;
      if (!span.multi && t.time) continue; // timed one-day tasks sit in the grid
      out.push({ kind: 'task', item: t, first: span.first, last: span.last });
    }
    return out;
  }

  // ---------- Drawing ----------

  render() {
    this.closePopover();
    const scroll = this.scrollEl ? this.scrollEl.scrollTop : null;
    const keys = this.visibleKeys();
    const first = keyToDate(keys[0]);
    const last = keyToDate(keys[keys.length - 1]);

    const month = this.mode === 'month';
    const monthName = (d, style = 'long') => d.toLocaleDateString(undefined, { month: style });
    // Titles: a handwritten "this week" / "today" over "28 Sep – 4 Oct 2026".
    const today = new Date();
    const dayDiff = Math.round((keyToDate(dayKey(this.date)) - keyToDate(dayKey(today))) / 86400000);
    const weekDiff = Math.round((startOfWeek(this.date) - startOfWeek(today)) / (7 * 86400000));
    const monthDiff = (this.date.getFullYear() - today.getFullYear()) * 12 + this.date.getMonth() - today.getMonth();
    const near = (diff, unit) => ({ '-1': `last ${unit}`, 0: `this ${unit}`, 1: `next ${unit}` }[diff]);
    let main;
    let hand;
    if (this.mode === 'day') {
      main = `${this.date.getDate()} ${monthName(this.date)}`;
      hand = { '-1': 'yesterday', 0: 'today', 1: 'tomorrow' }[dayDiff] || weekday(this.date).toLowerCase();
    } else if (month) {
      main = monthName(this.date);
      hand = near(monthDiff, 'month') || '';
    } else {
      main = `${first.getDate()} ${monthName(first, 'short')} – ${last.getDate()} ${monthName(last, 'short')}`;
      hand = near(weekDiff, 'week') || `week of ${first.getDate()} ${monthName(first, 'short')}`;
    }
    const year = (this.mode === 'week' ? last : this.date).getFullYear();
    const shift = (steps) => (month
      ? new Date(this.date.getFullYear(), this.date.getMonth() + steps, 1)
      : addDays(this.date, steps * (this.mode === 'day' ? 1 : 7)));
    const modes = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
    const addKey = month ? (keys.includes(dayKey(new Date())) ? dayKey(new Date()) : dayKey(new Date(this.date.getFullYear(), this.date.getMonth(), 1))) : keys[0];

    const head = h('header', { class: 'cal-top' },
      h('div', { class: 'cal-title' },
        hand ? h('span', { class: 'hand cal-hand' }, hand) : null,
        h('h1', { class: 'display cal-h1' }, main, h('span', { class: 'cal-h1-year' }, ` ${year}`))),
      h('div', { class: 'cal-segment', role: 'group', 'aria-label': 'View' },
        modes.map(([key, label]) => h('button', {
          class: `cal-seg${this.mode === key ? ' is-on' : ''}`,
          'aria-pressed': String(this.mode === key),
          onclick: () => this.go(this.date, key),
        }, label))),
      h('div', { class: 'cal-nav' },
        h('button', { class: 'cal-navbtn', 'aria-label': 'Previous', onclick: () => this.go(shift(-1)) }, '‹'),
        h('button', { class: 'cal-navbtn cal-today', onclick: () => this.go(new Date()) }, 'Today'),
        h('button', { class: 'cal-navbtn', 'aria-label': 'Next', onclick: () => this.go(shift(1)) }, '›'),
        h('button', { class: 'cal-add', onclick: (e) => this.createAt(addKey, this.defaultStart(addKey), e.currentTarget) }, '+ Event')),
    );

    const rail = this.renderRail(keys);
    const body = h('div', { class: 'cal-body' }, rail, month ? this.renderMonth(keys) : this.renderGrid(keys));
    this.root.replaceChildren(head, body);
    makePanel(rail, { id: 'cal-rail', side: 'left', label: 'Month', width: 260, min: 220, max: 420 });

    if (month) return;
    this.fitEvents();
    if (scroll !== null && this.scrolled) this.scrollEl.scrollTop = scroll;
    else this.scrollToMorning(keys);
  }

  renderRail(keys) {
    const month = new Date(this.date.getFullYear(), this.date.getMonth(), 1);
    const gridStart = startOfWeek(month);
    const noteDays = this.io.noteDays();
    const today = dayKey(new Date());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = addDays(gridStart, i);
      const key = dayKey(day);
      const classes = ['cal-mini-day'];
      if (day.getMonth() !== month.getMonth()) classes.push('is-outside');
      if (key === today) classes.push('is-today');
      if (this.mode !== 'month' && keys.includes(key)) classes.push('is-shown');
      if (key === dayKey(this.date) && this.mode === 'day') classes.push('is-selected');
      cells.push(h('button', {
        class: classes.join(' '),
        'aria-label': longDate(day),
        onclick: () => this.go(day),
      }, String(day.getDate()), noteDays.has(key) ? h('span', { class: 'cal-mini-dot', 'aria-hidden': 'true' }) : null));
    }

    const agendaKey = keys[0];
    const agenda = this.mode === 'day' && this.days[agendaKey]
      ? this.days[agendaKey].events.slice().sort((a, b) => a.start - b.start)
      : [];

    return h('aside', { class: 'cal-rail' },
      h('div', { class: 'cal-mini' },
        h('div', { class: 'cal-mini-head' },
          h('button', { class: 'cal-navbtn', 'aria-label': 'Previous month', onclick: () => this.go(new Date(month.getFullYear(), month.getMonth() - 1, 1)) }, '‹'),
          h('span', { class: 'display cal-mini-title' }, month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
          h('button', { class: 'cal-navbtn', 'aria-label': 'Next month', onclick: () => this.go(new Date(month.getFullYear(), month.getMonth() + 1, 1)) }, '›')),
        h('div', { class: 'cal-mini-grid' },
          ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('span', { class: 'cal-mini-wd', 'aria-hidden': 'true' }, d)),
          cells)),
      this.mode === 'day'
        ? h('div', { class: 'side-block cal-agenda' },
          h('span', { class: 'mono-label' }, 'Today’s list'),
          agenda.length
            ? agenda.map((e) => h('button', { class: 'cal-agenda-item', onclick: () => this.showPopover(e) },
              h('span', { class: 'cal-agenda-dot', style: `background: ${this.fillOf(e)}${e.secondary ? `; border-left: 4px solid ${EVENT_COLORS[e.secondary]}` : ''}` }),
              h('span', { class: 'cal-agenda-time' }, e.allDay ? 'all day' : clock(e.start)),
              h('span', null, e.title)))
            : h('span', { class: 'hand side-hint' }, 'nothing planned — click the grid to add'),
          h('button', { class: 'serif-link', onclick: () => this.io.openDayNote(agendaKey) }, 'Open this day’s note →'))
        : h('div', { class: 'side-block' },
          h('span', { class: 'hand side-hint' }, 'drag events between days')),
      this.series.length ? h('div', { class: 'side-block cal-repeats' },
        h('span', { class: 'mono-label' }, `Repeating · ${this.series.length}`),
        this.series.map((s) => h('button', { class: 'cal-agenda-item', onclick: () => this.go(keyToDate(this.nextOccurrence(s)), this.mode === 'month' ? 'day' : this.mode) },
          h('span', { class: 'cal-agenda-dot', style: `background: ${this.fillOf(s)}` }),
          h('span', null, h('b', null, s.title), h('br'), h('span', { class: 'cal-repeat-rule' }, `${describeRule(s.rule, s.from)}${s.until ? ` · until ${keyToDate(s.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`))))) : null,
    );
  }

  renderGrid(keys) {
    const today = dayKey(new Date());
    const columnsHead = h('div', { class: 'cal-colhead' },
      h('span', { class: 'cal-gutter' }),
      keys.map((key) => {
        const date = keyToDate(key);
        return h('button', {
          class: `cal-colday${key === today ? ' is-today' : ''}`,
          onclick: () => (this.mode === 'week' ? this.go(date, 'day') : this.io.openDayNote(key)),
          title: this.mode === 'week' ? 'Show this day' : 'Open this day’s note',
        },
        h('span', { class: 'mono-label' }, weekday(date, 'short')),
        h('span', { class: 'display cal-colnum' }, String(date.getDate())));
      }));

    const allDayRow = this.renderAllDayRow(keys);

    const hours = h('div', { class: 'cal-hours', 'aria-hidden': 'true' },
      Array.from({ length: 24 }, (_, hr) => h('span', { class: 'cal-hour', style: `top: ${hr * HOUR}px` }, hr ? `${String(hr).padStart(2, '0')}:00` : '')));

    const columns = keys.map((key) => this.renderDayColumn(key, key === today));
    this.monthEl = null;
    this.inner = h('div', { class: 'cal-inner', style: `height: ${24 * HOUR}px` }, hours, ...columns);
    this.scrollEl = h('div', { class: 'cal-scroll' }, this.inner);
    this.scrollEl.addEventListener('scroll', () => { this.scrolled = true; this.closePopover(); }, { passive: true });
    this.placeNowLine();
    return h('div', { class: 'cal-main' }, columnsHead, allDayRow, this.scrollEl);
  }

  // The all-day row: all-day and multi-day items as bars across the days they
  // cover, stacked so nothing overlaps. Click empty space for a new all-day item.
  renderAllDayRow(keys) {
    const items = this.allDayItems(keys).map((entry) => ({
      ...entry,
      from: Math.max(0, keys.indexOf(entry.first) === -1 ? (entry.first < keys[0] ? 0 : keys.length - 1) : keys.indexOf(entry.first)),
      to: keys.indexOf(entry.last) === -1 ? (entry.last > keys[keys.length - 1] ? keys.length - 1 : 0) : keys.indexOf(entry.last),
    }));
    const lanes = stackLanes(items);
    const rows = lanes + 1; // one free row to click in
    const row = h('div', {
      class: 'cal-allday',
      style: `grid-template-columns: 58px repeat(${keys.length}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, 22px)`,
    }, h('span', { class: 'cal-gutter mono-label', style: `grid-row: 1 / span ${rows}` }, 'All day'));
    keys.forEach((key, i) => {
      const cell = h('div', { class: 'cal-allday-cell', 'data-key': key, style: `grid-column: ${i + 2}; grid-row: 1 / span ${rows}` });
      cell.addEventListener('click', (event) => {
        if (event.target === cell) this.createAllDay(key, cell);
      });
      row.append(cell);
    });
    for (const entry of items) {
      const el = this.spanChip(entry, keys);
      el.style.gridColumn = `${entry.from + 2} / ${entry.to + 3}`;
      el.style.gridRow = String(entry.lane + 1);
      row.append(el);
    }
    return row;
  }

  // One bar in the all-day row (or a month cell): an event or a task.
  spanChip(entry, keys) {
    const { kind, item, first, last } = entry;
    const multi = first < last;
    const el = kind === 'task'
      ? this.taskChip(item)
      : this.chipEl(item, h('span', null, `${item.repeating ? '↻ ' : ''}${!item.allDay ? `${clock(item.start)} ` : ''}${item.title}`));
    if (multi) {
      el.classList.add('is-multi');
      if (first < keys[0]) el.classList.add('is-cont-left');
      if (last > keys[keys.length - 1]) el.classList.add('is-cont-right');
    }
    return el;
  }

  renderDayColumn(key, isToday) {
    const column = h('div', { class: `cal-day${isToday ? ' is-today' : ''}`, 'data-key': key });
    // Press and drag down empty space to draw a new event (a click makes an hour).
    column.addEventListener('pointerdown', (down) => {
      if (down.button !== 0 || down.target !== column) return;
      down.preventDefault();
      column.setPointerCapture(down.pointerId);
      const box = column.getBoundingClientRect();
      const at = (y) => Math.max(0, Math.min(24 * 60, Math.floor((y - box.top) / MINUTE / SNAP) * SNAP));
      const from = Math.min(at(down.clientY), 24 * 60 - SNAP);
      let to = from + SNAP;
      let dragged = false;
      const draft = h('div', { class: 'cal-event cal-draft', 'aria-hidden': 'true' },
        h('span', { class: 'cal-event-title' }, '(new event)'),
        h('span', { class: 'cal-event-time' }, ''));
      const draw = () => {
        const [a, b] = to > from ? [from, to] : [to, from + SNAP];
        draft.style.top = `${a * MINUTE}px`;
        draft.style.height = `${Math.max(14, (b - a) * MINUTE - 2)}px`;
        draft.querySelector('.cal-event-time').textContent = `${clock(a)}–${clock(b)}`;
        draft.dataset.start = a;
        draft.dataset.end = b;
      };
      const move = (e) => {
        const y = at(e.clientY + MINUTE * SNAP / 2);
        if (!dragged && Math.abs(e.clientY - down.clientY) < 4) return;
        if (!dragged) {
          dragged = true;
          this.closePopover();
          column.append(draft);
        }
        to = y <= from ? Math.max(0, y - SNAP) : y;
        draw();
      };
      const up = () => {
        column.removeEventListener('pointermove', move);
        column.removeEventListener('pointerup', up);
        column.removeEventListener('pointercancel', up);
        if (!dragged) {
          to = Math.min(24 * 60, from + 60);
          column.append(draft);
          draw();
        }
        this.openCreate({ key, allDay: false, start: Number(draft.dataset.start), end: Number(draft.dataset.end) }, draft);
      };
      column.addEventListener('pointermove', move);
      column.addEventListener('pointerup', up);
      column.addEventListener('pointercancel', up);
    });
    const timedTasks = this.tasks.filter((t) => t.due === key && t.time && !this.taskSpan(t).multi).map((t) => {
      const [hh, mm] = t.time.split(':').map(Number);
      const start = Math.min(hh * 60 + mm, 24 * 60 - SNAP);
      // A task with an end time spans it, like an event; otherwise half an hour.
      let end = start + TASK_LENGTH;
      if (t.endTime) {
        const [eh, em] = t.endTime.split(':').map(Number);
        if (eh * 60 + em > start) end = eh * 60 + em;
      }
      return { isTask: true, task: t, day: key, start, end: Math.min(end, 24 * 60), title: t.title };
    });
    const items = layoutColumns([...(this.days[key]?.events || []).filter((e) => !e.endDay).map((e) => ({ ...e })), ...timedTasks]);
    for (const item of items) column.append(item.isTask ? this.taskBlockEl(item) : this.eventEl(item));
    return column;
  }

  // The tick box on a task (ticks it off in its list).
  tickBox(task) {
    return h('button', {
      type: 'button',
      class: `cal-task-box${task.done ? ' is-done' : ''}`,
      role: 'checkbox',
      'aria-checked': String(task.done),
      'aria-label': task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`,
      onpointerdown: (e) => e.stopPropagation(),
      onclick: (e) => {
        e.stopPropagation();
        this.change(() => this.io.toggleTask(task));
      },
    }, task.done ? '✓' : '');
  }

  taskPaint(task) {
    return this.paint({ primary: task.primary, secondary: task.secondary, color: null, title: task.title });
  }

  // A task in the all-day row or a month cell: like an event chip, with a tick box.
  taskChip(task) {
    const chip = h('div', { class: `cal-chip cal-task${task.done ? ' is-done' : ''}`, style: this.taskPaint(task) },
      this.tickBox(task),
      h('span', { class: 'cal-task-name', title: task.title }, `${task.time && this.mode === 'month' ? `${task.time} ` : ''}${task.title}`));
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.setAttribute('aria-label', `Task: ${task.title}`);
    chip.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === chip) {
        e.preventDefault();
        this.showTaskPopover(task, chip);
      }
    });
    this.dragToDay(chip, (days) => this.change(() => this.io.updateTask(task, {
      due: shiftKey(task.due, days),
      startDate: task.startDate ? shiftKey(task.startDate, days) : null,
    })), () => this.showTaskPopover(task, chip));
    this.menuOn(chip, () => this.taskMenu(task, chip));
    return chip;
  }

  // A timed task in the day grid: exactly like an event (any length, drag to
  // move, drag the bottom edge to resize), plus a tick box.
  taskBlockEl(item) {
    const { task } = item;
    const width = 100 / item.cols;
    const height = Math.max(18, (item.end - item.start) * MINUTE - 2);
    const short = height < 30;
    const lines = Math.max(1, Math.floor((height - 8) / 13));
    const time = task.endTime ? `${clock(item.start)}–${clock(item.end)}` : clock(item.start);
    const el = h('div', {
      class: `cal-event cal-task-block${short ? ' is-short' : ''}${task.done ? ' is-done' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `Task: ${task.title}, ${time}${task.done ? ', done' : ''}`,
      style: `top: ${item.start * MINUTE}px; height: ${height}px; left: calc(${item.col * width}% + 3px); width: calc(${width}% - 7px); --tilt: ${this.tiltOf(item)}deg; ${this.taskPaint(task)}`,
    },
    h('span', { class: 'cal-task-head' },
      this.tickBox(task),
      h('span', { class: 'cal-event-title', style: short ? null : `-webkit-line-clamp: ${lines}` }, task.title)),
    h('span', { class: 'cal-event-time' }, short ? clock(item.start) : time),
    h('span', { class: 'cal-resize', 'aria-hidden': 'true' }));
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === el) {
        e.preventDefault();
        this.showTaskPopover(task, el);
      }
    });
    this.makeDraggable(el, item);
    this.menuOn(el, () => this.taskMenu(task, el));
    return el;
  }

  eventEl(event) {
    const width = 100 / event.cols;
    const height = Math.max(18, (event.end - event.start) * MINUTE - 2);
    const short = height < 30; // one line: title and start time side by side
    // The title gets every line that fits (ending in "…"); the time and link
    // only show if there's room left (see fitEvents).
    const lines = Math.max(1, Math.floor((height - 8) / 13));
    const el = h('div', {
      class: `cal-event${short ? ' is-short' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `${event.title}, ${clock(event.start)} to ${clock(event.end)}${event.repeating ? `, repeats ${event.rule}` : ''}`,
      style: `top: ${event.start * MINUTE}px; height: ${height}px; left: calc(${event.col * width}% + 3px); width: calc(${width}% - 7px); --tilt: ${this.tiltOf(event)}deg; ${this.paint(event)}`,
    },
    h('span', { class: 'cal-event-title', style: short ? null : `-webkit-line-clamp: ${lines}` },
      event.repeating ? h('span', { class: 'cal-repeat-mark', title: describeRule(event.rule, event.from) }, '↻ ') : null, event.title),
    h('span', { class: 'cal-event-time' }, short ? clock(event.start) : `${clock(event.start)}–${clock(event.end)}`),
    event.link && height > 60 ? h('span', { class: 'cal-event-link' }, `→ ${event.link}`) : null,
    h('span', { class: 'cal-resize', 'aria-hidden': 'true' }));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.showPopover(event, el);
      }
    });
    this.makeDraggable(el, event);
    this.menuOn(el, () => this.eventMenu(event, el));
    return el;
  }

  // Right-click or double-click → the item's menu (instead of its popover).
  menuOn(el, build) {
    const open = (e) => {
      this.closePopover();
      showMenu(e, build());
    };
    el.addEventListener('contextmenu', open);
    el.addEventListener('dblclick', open);
  }

  eventMenu(event, anchor) {
    const items = [
      { label: 'Edit…', onSelect: () => this.showPopover(event, anchor) },
      { label: 'Rename…', onSelect: () => this.rename(event) },
      event.repeating ? null : { label: 'Duplicate', onSelect: () => this.duplicateEvent(event) },
      event.link ? { label: `Open “${event.link}”`, onSelect: () => this.io.openLink(event.link) } : null,
      { label: 'Open day note', onSelect: () => this.io.openDayNote(event.day) },
      'separator',
      ...(event.repeating
        ? [
          { label: 'Delete this one', danger: true, onSelect: () => this.deleteEvent(event, 'one') },
          { label: 'Delete every repeat', danger: true, onSelect: () => this.deleteEvent(event, 'all') },
        ]
        : [{ label: 'Delete', danger: true, onSelect: () => this.deleteEvent(event) }]),
    ];
    return { title: event.title, items };
  }

  taskMenu(task, anchor) {
    return {
      title: task.title,
      items: [
        { label: 'Edit…', onSelect: () => this.showTaskPopover(task, anchor) },
        { label: task.done ? 'Mark not done' : 'Mark done', onSelect: () => this.change(() => this.io.toggleTask(task)) },
        { label: 'Open in Tasks', onSelect: () => this.io.openTasks() },
        'separator',
        { label: 'Delete task', danger: true, onSelect: () => this.change(() => this.io.deleteTask(task)) },
      ],
    };
  }

  duplicateEvent(event) {
    return this.change(async () => {
      await this.io.writeDay(event.day, insertEvent(await this.freshText(event.day), formatEvent({ ...event, day: event.day }), this.dateLabel(event.day)));
    });
  }

  // Titles come first: when an event is too small for everything, its link
  // line goes, then its time.
  fitEvents() {
    requestAnimationFrame(() => {
      if (!this.inner) return;
      for (const el of this.inner.querySelectorAll('.cal-event:not(.cal-draft)')) {
        el.classList.remove('hide-time', 'hide-link');
        const title = el.querySelector('.cal-event-title');
        if (el.classList.contains('is-short')) {
          if (title && title.scrollWidth > title.clientWidth + 1) el.classList.add('hide-time');
          continue;
        }
        // Does this line run past the bottom of the card?
        const over = (node) => node && node.offsetTop + node.offsetHeight > el.clientHeight - 2;
        if (over(el.querySelector('.cal-event-link'))) el.classList.add('hide-link');
        if (over(el.querySelector('.cal-event-time'))) el.classList.add('hide-time');
      }
    });
  }

  // A slight, steady tilt per event (the same every time it's drawn).
  tiltOf(event) {
    const seed = [...`${event.title}${event.start}`].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7);
    const tilt = [-0.6, -0.3, 0.3, 0.5][seed % 4];
    return this.mode === 'day' ? tilt * 0.15 : tilt; // wide cards barely tilt
  }

  // ---------- Month ----------

  renderMonth(keys) {
    this.inner = null;
    this.scrollEl = null;
    const today = dayKey(new Date());
    const month = this.date.getMonth();
    const head = h('div', { class: 'cal-mhead' },
      keys.slice(0, 7).map((key) => h('span', { class: 'mono-label' }, weekday(keyToDate(key), 'short'))));
    const cells = keys.map((key) => {
      const date = keyToDate(key);
      const events = (this.days[key]?.events || []).filter((e) => !e.endDay).sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
      const spans = this.multiDayEvents().filter((e) => e.day <= key && e.endDay >= key)
        .filter((e, i, all) => all.findIndex((x) => x.day === e.day && x.raw === e.raw) === i);
      const tasks = this.tasks.filter((t) => { const sp = this.taskSpan(t); return sp.first <= key && sp.last >= key; })
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const items = [
        ...spans.map((e) => this.spanChip({ kind: 'event', item: e, first: e.day, last: e.endDay }, [key])),
        ...tasks.map((t) => this.spanChip({ kind: 'task', item: t, ...this.taskSpan(t) }, [key])),
        ...events.map((e) => (e.allDay
          ? this.chipEl(e, h('span', null, `${e.repeating ? '↻ ' : ''}${e.title}`))
          : this.chipEl(e, [
            h('span', { class: 'cal-mdot', style: `background: ${this.fillOf(e)}`, 'aria-hidden': 'true' }),
            h('span', { class: 'cal-mtime' }, clock(e.start)),
            h('span', { class: 'cal-mtitle' }, `${e.repeating ? '↻ ' : ''}${e.title}`),
          ], 'is-timed'))),
      ];
      const extra = items.length - MONTH_ITEMS;
      const cell = h('div', {
        class: `cal-mcell${date.getMonth() !== month ? ' is-outside' : ''}${key === today ? ' is-today' : ''}`,
        'data-key': key,
      },
      h('button', {
        class: 'cal-mnum',
        'aria-label': `Show ${longDate(date)}`,
        onclick: () => this.go(date, 'day'),
      }, date.getDate() === 1 ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : String(date.getDate())),
      items.slice(0, extra > 0 ? MONTH_ITEMS - 1 : MONTH_ITEMS),
      extra > 0 ? h('button', { class: 'cal-mmore', onclick: () => this.go(date, 'day') }, `+${extra + 1} more`) : null);
      cell.addEventListener('click', (event) => {
        if (event.target === cell) this.createAllDay(key, cell);
      });
      return cell;
    });
    this.monthEl = h('div', { class: 'cal-mgrid', style: `grid-template-rows: repeat(${keys.length / 7}, minmax(112px, 1fr))` }, cells);
    return h('div', { class: 'cal-main cal-month' }, head, h('div', { class: 'cal-mscroll' }, this.monthEl));
  }

  // A small event button (all-day row, month cells). Click for details;
  // drag it onto another day to move it there (times stay the same).
  chipEl(event, content, extraClass = '') {
    const chip = h('button', {
      class: `cal-chip${extraClass ? ` ${extraClass}` : ''}`,
      style: extraClass === 'is-timed' ? '' : this.paint(event),
      'aria-label': `${event.title}${event.allDay ? ', all day' : `, ${clock(event.start)}`}${event.repeating ? `, repeats ${event.rule}` : ''}`,
    }, content);
    this.dragToDay(chip, (days) => this.moveEvent(event, { day: shiftKey(event.day, days), start: event.start, end: event.end }), () => this.showPopover(event, chip));
    this.menuOn(chip, () => this.eventMenu(event, chip));
    return chip;
  }

  // Drag a chip or bar onto another day. The move counts from the day it was
  // grabbed by, so a three-day bar grabbed in the middle lands where it's dropped.
  // onDrop(days moved); onClick() for a plain click.
  dragToDay(chip, onDrop, onClick) {
    let dragged = false;
    chip.addEventListener('click', (e) => {
      if (dragged) {
        dragged = false;
        return;
      }
      if (e.target.closest('.cal-task-box')) return;
      onClick(e);
    });
    const dayAt = (x, y) => document.elementsFromPoint(x, y).find((n) => n.dataset && n.dataset.key && n !== chip && !chip.contains(n));
    chip.addEventListener('pointerdown', (down) => {
      if (down.button !== 0 || down.target.closest('.cal-task-box')) return;
      chip.setPointerCapture(down.pointerId);
      const grabbed = dayAt(down.clientX, down.clientY);
      let target = null;
      const move = (e) => {
        const dx = e.clientX - down.clientX;
        const dy = e.clientY - down.clientY;
        if (!dragged && Math.hypot(dx, dy) < 5) return;
        if (!dragged) {
          dragged = true;
          this.dragging = true;
          this.closePopover();
          chip.classList.add('is-dragging');
        }
        chip.style.transform = `translate(${dx}px, ${dy}px)`;
        const under = dayAt(e.clientX, e.clientY);
        if (target && target !== under) target.classList.remove('is-drop');
        target = under || null;
        if (target) target.classList.add('is-drop');
      };
      const up = () => {
        chip.removeEventListener('pointermove', move);
        chip.removeEventListener('pointerup', up);
        chip.removeEventListener('pointercancel', up);
        if (target) target.classList.remove('is-drop');
        if (!dragged) return;
        this.dragging = false;
        chip.classList.remove('is-dragging');
        chip.style.transform = '';
        if (!target || !grabbed) return;
        const days = Math.round((keyToDate(target.dataset.key) - keyToDate(grabbed.dataset.key)) / 86400000);
        if (days) onDrop(days);
      };
      chip.addEventListener('pointermove', move);
      chip.addEventListener('pointerup', up);
      chip.addEventListener('pointercancel', up);
    });
  }

  nextOccurrence(series) {
    const today = dayKey(new Date());
    let key = series.from > today ? series.from : today;
    for (let i = 0; i < 800; i++) {
      if (series.until && key > series.until) break;
      if (occurrences([series], key).length) return key;
      key = shiftKey(key, 1);
    }
    return series.from;
  }

  // Fill colour (CSS value) and the style for an event's block.
  fillOf(event) {
    if (event.primary) return EVENT_COLORS[event.primary];
    return `var(--c${event.color || slotFor(event.title)})`;
  }

  // A soft card in the event's colour; an accent colour, if set, is a stripe
  // down the left edge.
  paint(event) {
    const base = this.fillOf(event);
    const parts = [`background: color-mix(in srgb, ${base} var(--event-strength, 34%), var(--event-mix))`];
    if (event.secondary) parts.push(`border-left: 4px solid ${EVENT_COLORS[event.secondary]}`);
    return parts.join('; ');
  }

  placeNowLine() {
    if (!this.inner) return;
    this.inner.querySelectorAll('.cal-now, .cal-now-time, .cal-now-hand').forEach((n) => n.remove());
    const now = new Date();
    const column = this.inner.querySelector(`.cal-day[data-key="${dayKey(now)}"]`);
    if (!column) return;
    const minutes = now.getHours() * 60 + now.getMinutes();
    column.append(h('span', { class: 'cal-now', style: `top: ${minutes * MINUTE}px`, 'aria-hidden': 'true' }));
    this.inner.append(h('span', { class: 'cal-now-time', style: `top: ${minutes * MINUTE}px`, 'aria-hidden': 'true' }, clock(minutes)));
    column.append(h('span', { class: 'hand cal-now-hand', style: `top: ${minutes * MINUTE}px`, 'aria-hidden': 'true' }, 'now ↓'));
  }

  defaultStart(key) {
    const now = new Date();
    if (key === dayKey(now)) return Math.min(23 * 60, snap(now.getHours() * 60 + now.getMinutes() + 30));
    return 9 * 60;
  }

  scrollToMorning(keys) {
    const starts = keys.flatMap((k) => (this.days[k]?.events || []).filter((e) => !e.allDay).map((e) => e.start));
    const earliest = starts.length ? Math.min(...starts) : 8 * 60;
    this.scrollEl.scrollTop = Math.max(0, (Math.min(earliest, 8 * 60) - 30) * MINUTE);
  }

  // ---------- Dragging ----------

  makeDraggable(el, event) {
    el.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
      down.preventDefault();
      el.setPointerCapture(down.pointerId);
      const resizing = down.target.classList.contains('cal-resize');
      const startY = down.clientY;
      let moved = false;
      let next = { day: event.day, start: event.start, end: event.end };
      this.dragging = true;
      this.closePopover();

      const move = (e) => {
        const delta = snap((e.clientY - startY) / MINUTE);
        if (!moved && Math.abs(e.clientY - startY) < 4 && Math.abs(e.clientX - down.clientX) < 4) return;
        moved = true;
        el.classList.add('is-dragging');
        if (resizing) {
          next.end = Math.max(event.start + SNAP, Math.min(24 * 60, event.end + delta));
          el.style.height = `${(next.end - event.start) * MINUTE - 2}px`;
        } else {
          const length = event.end - event.start;
          next.start = Math.max(0, Math.min(24 * 60 - length, event.start + delta));
          next.end = next.start + length;
          el.style.top = `${next.start * MINUTE}px`;
          // In week view, follow the pointer to another day. (The event is only
          // slid across here — moving it between columns mid-drag would end the drag.)
          const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList && n.classList.contains('cal-day'));
          if (under) {
            next.day = under.dataset.key;
            const home = el.parentElement.getBoundingClientRect();
            const target = under.getBoundingClientRect();
            el.style.transform = `translateX(${target.left - home.left}px)`;
          }
        }
        el.querySelector('.cal-event-time').textContent = `${clock(next.start)}–${clock(next.end)}`;
      };

      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        this.dragging = false;
        el.classList.remove('is-dragging');
        if (!moved) {
          if (event.isTask) this.showTaskPopover(event.task, el);
          else this.showPopover(event, el);
          return;
        }
        if (next.day === event.day && next.start === event.start && next.end === event.end) return;
        if (event.isTask) {
          // Keep (or set, after resizing) the task's end time along with its start.
          const spans = event.task.endTime || next.end - next.start !== TASK_LENGTH;
          this.change(() => this.io.updateTask(event.task, { due: next.day, time: clock(next.start), endTime: spans ? clock(next.end) : null }));
        }
        else this.moveEvent(event, next);
      };

      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  // ---------- Popover ----------

  showPopover(event, anchor) {
    this.closePopover();
    const picker = (label, current, onPick, allowNone) => this.colorPicker(label, current, onPick, allowNone);
    const swatches = h('div', { class: 'cal-pickers' },
      picker('Primary · fill', event.primary, (name) => this.updateEvent(event, { primary: name, color: null }), false),
      picker('Secondary · accent', event.secondary, (name) => this.updateEvent(event, { secondary: name }), true));

    // Repeat: a menu of rules, plus an optional last day for a series.
    const from = event.repeating ? event.from : event.day;
    const repeatMenu = repeatPicker({
      rule: event.repeating ? event.rule : null,
      from,
      className: 'cal-pop-select',
      onChange: (rule) => this.setRepeat(event, rule),
    });
    const remindChoices = event.allDay ? REMIND_ALL_DAY : REMIND_TIMED;
    const remindMenu = h('select', { class: 'cal-pop-select', 'aria-label': 'Reminder' },
      remindChoices.map(([value, label]) => h('option', { value: value == null ? '' : String(value) }, label)),
      event.remind != null && !remindChoices.some(([v]) => v === event.remind) ? h('option', { value: String(event.remind) }, `${event.remind} minutes before`) : null);
    remindMenu.value = event.remind == null ? '' : String(event.remind);
    remindMenu.addEventListener('change', () => this.updateEvent(event, { remind: remindMenu.value === '' ? null : Number(remindMenu.value) }));
    const until = event.repeating ? h('input', { type: 'date', class: 'cal-pop-select', value: event.until || '', min: event.from, 'aria-label': 'Repeat until' }) : null;
    if (until) until.addEventListener('change', () => this.updateEvent(event, { until: until.value || null }));

    // Until: a later last day makes it a multi-day event (not for repeats).
    const shortDay = (key) => keyToDate(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const untilIn = event.repeating ? null : h('input', { type: 'date', class: 'cal-pop-select', value: event.endDay || event.day, min: event.day, 'aria-label': 'Until' });
    if (untilIn) untilIn.addEventListener('change', () => this.updateEvent(event, { endDay: untilIn.value > event.day ? untilIn.value : null }));
    const when = event.endDay
      ? `${shortDay(event.day)}${event.allDay ? '' : ` ${clock(event.start)}`} → ${shortDay(event.endDay)}${event.allDay ? '' : ` ${clock(event.end)}`}`
      : event.allDay ? 'All day' : `${clock(event.start)} – ${clock(event.end)}`;
    const pop = h('div', { class: 'cal-pop', role: 'dialog', 'aria-label': event.title },
      h('span', { class: 'mono-label' }, when),
      h('span', { class: 'display cal-pop-title' }, event.title),
      swatches,
      h('div', { class: 'cal-pop-repeat' },
        untilIn ? h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Until'), untilIn) : null,
        h('div', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Repeat'), repeatMenu),
        h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Remind'), remindMenu),
        until ? h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Until'), until) : null,
        event.repeating ? h('span', { class: 'hand cal-pop-hint' }, 'name, colour & reminder apply to every repeat') : null),
      h('div', { class: 'cal-pop-actions' },
        event.link ? h('button', { class: 'cal-pop-btn is-primary', onclick: () => this.io.openLink(event.link) }, `Open “${event.link}”`) : null,
        h('button', { class: 'cal-pop-btn', onclick: () => this.rename(event) }, 'Rename'),
        h('button', { class: 'cal-pop-btn', onclick: () => this.io.openDayNote(event.day) }, 'Day note'),
        event.repeating
          ? [
            h('button', { class: 'cal-pop-btn is-danger', onclick: () => this.deleteEvent(event, 'one') }, 'Delete this one'),
            h('button', { class: 'cal-pop-btn is-danger', onclick: () => this.deleteEvent(event, 'all') }, 'Delete all'),
          ]
          : h('button', { class: 'cal-pop-btn is-danger', onclick: () => this.deleteEvent(event) }, 'Delete')));

    const host = this.root.querySelector('.cal-main');
    host.append(pop);
    const hostBox = host.getBoundingClientRect();
    const box = (anchor || host).getBoundingClientRect();
    const left = Math.min(Math.max(8, box.right - hostBox.left + 8), hostBox.width - 330);
    const top = Math.min(Math.max(8, box.top - hostBox.top), hostBox.height - 400);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    this.popover = pop;

    const outside = (e) => {
      if (!pop.contains(e.target) && !(anchor && anchor.contains(e.target))) this.closePopover();
    };
    const escape = (e) => {
      if (e.key === 'Escape') this.closePopover();
    };
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    document.addEventListener('keydown', escape);
    this.popoverCleanup = () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }

  // A row of the 20 event colours (plus "none" for the accent).
  colorPicker(label, current, onPick, allowNone) {
    return h('div', { class: 'cal-picker' },
      h('span', { class: 'mono-label' }, label),
      h('div', { class: 'cal-swatches', role: 'radiogroup', 'aria-label': label },
        allowNone ? h('button', {
          type: 'button',
          class: `cal-swatch is-none${!current ? ' is-on' : ''}`,
          role: 'radio',
          'aria-checked': String(!current),
          'aria-label': 'No accent',
          title: 'None',
          onclick: () => onPick(null),
        }) : null,
        Object.entries(EVENT_COLORS).map(([name, hex]) => h('button', {
          type: 'button',
          class: `cal-swatch${current === name ? ' is-on' : ''}`,
          role: 'radio',
          'aria-checked': String(current === name),
          'aria-label': name,
          title: name,
          style: `background: ${hex}`,
          onclick: () => onPick(name),
        }))));
  }

  // Shows a popover beside `anchor` (or the top of the grid) and closes it on
  // Escape or a click elsewhere; onClose runs when it goes.
  placePopover(pop, anchor, onClose) {
    const host = this.root.querySelector('.cal-main');
    host.append(pop);
    const hostBox = host.getBoundingClientRect();
    const box = (anchor || host).getBoundingClientRect();
    const width = pop.offsetWidth || 340;
    const height = pop.offsetHeight || 380;
    let left = box.right - hostBox.left + 10;
    if (left + width > hostBox.width - 8) left = box.left - hostBox.left - width - 10;
    left = Math.max(8, Math.min(left, hostBox.width - width - 8));
    const top = Math.max(8, Math.min(box.top - hostBox.top, hostBox.height - height - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    this.popover = pop;
    const outside = (e) => {
      if (!pop.contains(e.target) && !(anchor && anchor.contains(e.target))) this.closePopover();
    };
    const escape = (e) => {
      if (e.key === 'Escape') this.closePopover();
    };
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    document.addEventListener('keydown', escape);
    this.popoverCleanup = () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      if (onClose) onClose();
    };
  }

  showTaskPopover(task, anchor) {
    this.closePopover();
    const pop = h('div', { class: 'cal-pop', role: 'dialog', 'aria-label': task.title },
      h('span', { class: 'mono-label' }, `Task · ${task.list}${task.time ? ` · ${task.time}` : ''}`),
      h('span', { class: 'display cal-pop-title' }, task.title),
      task.details.length ? h('span', { class: 'serif-i' }, task.details.join(' ')) : null,
      h('div', { class: 'cal-pickers' },
        this.colorPicker('Primary · fill', task.primary, (name) => this.change(() => this.io.updateTask(task, { primary: name })), false),
        this.colorPicker('Secondary · accent', task.secondary, (name) => this.change(() => this.io.updateTask(task, { secondary: name })), true)),
      h('div', { class: 'cal-pop-actions' },
        h('button', {
          class: 'cal-pop-btn is-primary',
          onclick: () => this.change(() => this.io.toggleTask(task)),
        }, task.done ? 'Mark not done' : 'Mark done'),
        h('button', { class: 'cal-pop-btn', onclick: () => this.io.openTasks() }, 'Open Tasks')));
    const host = this.root.querySelector('.cal-main');
    host.append(pop);
    const hostBox = host.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    pop.style.left = `${Math.min(Math.max(8, box.left - hostBox.left), hostBox.width - 330)}px`;
    pop.style.top = `${box.bottom - hostBox.top + 6}px`;
    this.popover = pop;
    const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) this.closePopover(); };
    const escape = (e) => { if (e.key === 'Escape') this.closePopover(); };
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
    document.addEventListener('keydown', escape);
    this.popoverCleanup = () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }

  closePopover() {
    if (this.popover) this.popover.remove();
    if (this.popoverCleanup) this.popoverCleanup();
    this.popover = null;
    this.popoverCleanup = null;
  }

  // ---------- Changes (all written to the day notes) ----------

  change(task) {
    this.closePopover();
    this.writing = this.writing.then(task).catch((err) => alert(`The calendar couldn't save that.\n\n${err.message}`)).then(() => this.load());
    return this.writing;
  }

  async freshText(key) {
    const text = await this.io.readDay(key);
    return text || '';
  }

  dateLabel(key) {
    return longDate(keyToDate(key));
  }

  createAt(key, start, anchor) {
    return this.openCreate({ key, allDay: false, start, end: Math.min(24 * 60, start + 60) }, anchor);
  }

  createAllDay(key, anchor) {
    return this.openCreate({ key, allDay: true, start: 0, end: 24 * 60 }, anchor);
  }

  // Google Calendar-style quick create: title, event or task, times and
  // colours are all set before anything is written to the notes.
  openCreate(draft, anchor) {
    this.closePopover();
    const state = { kind: 'event', title: '', primary: null, secondary: null, ...draft };
    const preview = anchor && anchor.classList.contains('cal-draft') ? anchor : null;
    const title = h('input', { class: 'cal-new-title', placeholder: 'Add a title', 'aria-label': 'Title', spellcheck: 'true' });
    const startIn = h('input', { type: 'time', class: 'cal-pop-select cal-new-time', step: String(SNAP * 60), value: clock(state.start), 'aria-label': 'Starts' });
    const endIn = h('input', { type: 'time', class: 'cal-pop-select cal-new-time', step: String(SNAP * 60), value: clock(Math.min(state.end, 24 * 60 - 1)), 'aria-label': 'Ends' });
    const allDay = h('input', { type: 'checkbox', checked: state.allDay, 'aria-label': 'All day' });
    const toMinutes = (v) => {
      const [hh, mm] = String(v || '0:0').split(':').map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };
    const kindBtn = (kind, label) => h('button', {
      type: 'button',
      class: `cal-new-kind${state.kind === kind ? ' is-on' : ''}`,
      'aria-pressed': String(state.kind === kind),
      onclick: () => { state.kind = kind; sync(); },
    }, label);
    const kinds = h('div', { class: 'cal-new-kinds', role: 'group', 'aria-label': 'Kind' }, kindBtn('event', 'Event'), kindBtn('task', 'Task'));
    const endWrap = h('span', { class: 'cal-new-end' }, h('span', null, '–'), endIn);
    const timesWrap = h('span', { class: 'cal-new-times' }, startIn, endWrap);
    // A later "until" day makes it a multi-day event or task.
    const untilIn = h('input', { type: 'date', class: 'cal-pop-select cal-new-until', value: state.key, min: state.key, 'aria-label': 'Until' });
    const allDayWrap = h('label', { class: 'cal-new-allday' }, allDay, 'All day');
    const pickers = h('div', { class: 'cal-pickers' });
    const drawPickers = () => pickers.replaceChildren(
      this.colorPicker('Primary · fill', state.primary, (name) => { state.primary = name; sync(); }, false),
      this.colorPicker('Secondary · accent', state.secondary, (name) => { state.secondary = name; sync(); }, true));
    const sync = () => {
      kinds.querySelectorAll('.cal-new-kind').forEach((b) => {
        const on = b.textContent.toLowerCase() === state.kind;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      state.allDay = allDay.checked;
      timesWrap.hidden = state.allDay; // all day: no times at all
      allDayWrap.querySelector('input').setAttribute('aria-label', state.kind === 'task' ? 'No time' : 'All day');
      allDayWrap.lastChild.textContent = state.kind === 'task' ? 'No time' : 'All day';
      title.placeholder = state.kind === 'task' ? 'Add a task' : 'Add a title';
      drawPickers();
      if (preview) {
        preview.setAttribute('style', `${preview.getAttribute('style').replace(/background[^;]*;?|border-left[^;]*;?/g, '')}; ${this.paint({ ...state, title: state.title || 'x', color: null })}`);
        preview.querySelector('.cal-event-title').textContent = state.title || (state.kind === 'task' ? '(new task)' : '(new event)');
        preview.classList.toggle('is-task', state.kind === 'task');
      }
    };
    title.addEventListener('input', () => { state.title = title.value; sync(); });
    allDay.addEventListener('change', sync);
    const timesChanged = () => {
      state.start = Math.min(toMinutes(startIn.value), 24 * 60 - SNAP);
      state.end = Math.min(24 * 60, toMinutes(endIn.value) || 24 * 60);
      if (!(untilIn.value > state.key)) state.end = Math.max(state.start + SNAP, state.end);
      if (preview) {
        preview.style.top = `${state.start * MINUTE}px`;
        preview.style.height = `${Math.max(14, (state.end - state.start) * MINUTE - 2)}px`;
        preview.querySelector('.cal-event-time').textContent = `${clock(state.start)}–${clock(state.end)}`;
      }
    };
    startIn.addEventListener('change', timesChanged);
    endIn.addEventListener('change', timesChanged);

    const save = () => {
      const text = title.value.trim();
      if (!text) {
        title.focus();
        title.classList.add('is-empty');
        return;
      }
      const { key } = state;
      const endDay = untilIn.value && untilIn.value > key ? untilIn.value : null;
      const start = state.allDay ? 0 : state.start;
      // Same-day events end after they start; multi-day ones can end earlier in the day.
      const end = state.allDay ? 24 * 60 : (endDay ? state.end : Math.max(state.end, start + SNAP));
      if (state.kind === 'task') {
        this.change(() => this.io.addTask({
          title: text, due: endDay || key, startDate: endDay ? key : null, time: state.allDay ? null : clock(start), endTime: state.allDay ? null : clock(end), primary: state.primary, secondary: state.secondary,
        }));
      } else {
        const line = formatEvent({ allDay: state.allDay, start, end, text, color: null, primary: state.primary, secondary: state.secondary, endDay, day: key });
        this.change(async () => {
          await this.io.writeDay(key, insertEvent(await this.freshText(key), line, this.dateLabel(key)));
        });
      }
    };
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });

    const pop = h('div', { class: 'cal-pop cal-new', role: 'dialog', 'aria-label': 'New event or task' },
      title,
      kinds,
      h('div', { class: 'cal-new-when' },
        h('span', { class: 'mono-label' }, keyToDate(state.key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })),
        timesWrap),
      h('div', { class: 'cal-new-when' },
        h('span', { class: 'mono-label' }, 'Until'), untilIn, allDayWrap),
      pickers,
      h('div', { class: 'cal-pop-actions' },
        h('button', { class: 'cal-pop-btn is-primary', onclick: save }, 'Save'),
        h('button', { class: 'cal-pop-btn', onclick: () => this.closePopover() }, 'Cancel')));
    sync();
    this.placePopover(pop, anchor, () => { if (preview) preview.remove(); });
    title.focus();
  }

  // ---------- Repeating series (Calendar/Repeating.md) ----------

  async freshRepeats() {
    return (await this.io.readRepeats()) || '';
  }

  writeSeries(series, next) {
    return async () => {
      const text = await this.freshRepeats();
      await this.io.writeRepeats(replaceEvent(text, series, next ? formatSeries(next) : null));
    };
  }

  updateEvent(event, patch) {
    const updated = { ...event, ...patch };
    if (event.repeating) return this.change(this.writeSeries(event, updated));
    return this.change(async () => {
      await this.io.writeDay(event.day, replaceEvent(await this.freshText(event.day), event, formatEvent(updated)));
    });
  }

  setRepeat(event, rule) {
    if (!event.repeating && !rule) return null;
    if (event.repeating && rule) return this.updateEvent(event, { rule });
    if (!event.repeating) {
      // One-off → series starting that day. Add the series first, then take
      // the one-off out, so a failure never loses the event.
      return this.change(async () => {
        await this.io.writeRepeats(appendSeries(await this.freshRepeats(), formatSeries({ ...event, rule, from: event.day, until: null, except: [] })));
        await this.io.writeDay(event.day, replaceEvent(await this.freshText(event.day), event, null));
      });
    }
    // Series → "does not repeat": keep this day as a one-off, and keep the
    // earlier days (the series now ends the day before).
    return this.change(async () => {
      const key = event.day;
      await this.io.writeDay(key, insertEvent(await this.freshText(key), formatEvent(event), this.dateLabel(key)));
      await this.writeSeries(event, key > event.from ? { ...event, until: shiftKey(key, -1) } : null)();
    });
  }

  async rename(event) {
    this.closePopover();
    const text = await askName(`Rename · ${event.title}`, 'New name, then Enter', event.text);
    if (text) this.updateEvent(event, { text });
  }

  deleteEvent(event, scope) {
    if (event.repeating) {
      return this.change(this.writeSeries(event, scope === 'all' ? null : { ...event, except: [...event.except, event.day] }));
    }
    return this.change(async () => {
      await this.io.writeDay(event.day, replaceEvent(await this.freshText(event.day), event, null));
    });
  }

  async moveEvent(event, next) {
    const shiftDays = Math.round((keyToDate(next.day) - keyToDate(event.day)) / 86400000);
    // A multi-day event keeps its length when moved.
    const updated = { ...event, start: next.start, end: next.end, day: next.day, endDay: event.endDay ? shiftKey(event.endDay, shiftDays) : null };
    if (event.repeating) {
      const which = await askChoice(`Move “${event.title}”`, [
        { label: 'Just this one', value: 'one' },
        { label: 'Every repeat', value: 'all' },
      ]);
      if (!which) return this.load(); // put it back where it was
      if (which === 'all') {
        const days = Math.round((keyToDate(next.day) - keyToDate(event.day)) / 86400000);
        return this.change(this.writeSeries(event, {
          ...updated,
          from: shiftKey(event.from, days),
          except: event.except.map((k) => shiftKey(k, days)),
        }));
      }
      // Just this one: skip it in the series and add a one-off where it was dropped.
      return this.change(async () => {
        await this.io.writeDay(next.day, insertEvent(await this.freshText(next.day), formatEvent(updated), this.dateLabel(next.day)));
        await this.writeSeries(event, { ...event, except: [...event.except, event.day] })();
      });
    }
    return this.change(async () => {
      if (next.day === event.day) {
        await this.io.writeDay(event.day, replaceEvent(await this.freshText(event.day), event, formatEvent(updated)));
        return;
      }
      // Add to the new day first, then remove from the old one, so a failure never loses it.
      await this.io.writeDay(next.day, insertEvent(await this.freshText(next.day), formatEvent(updated), this.dateLabel(next.day)));
      await this.io.writeDay(event.day, replaceEvent(await this.freshText(event.day), event, null));
    });
  }
}
