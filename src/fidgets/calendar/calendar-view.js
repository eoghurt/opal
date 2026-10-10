// Calendar: Day, Week and Month views over the daily notes in Calendar/.
// Click empty space to add an event, drag to move, drag the bottom edge to
// change its length, click an event for colour / repeat / links / delete.
// Events are read from and written to the day notes, and repeating ones to
// Calendar/Repeating.md (see calendar/events.js).

import { h, icon, askChoice } from '../../ui.js';
import { makePanel } from '../../panel.js';
import { slotFor } from '../../palettes.js';
import {
  SNAP, dayKey, keyToDate, addDays, startOfWeek, clock,
  parseEvents, formatEvent, replaceEvent, insertEvent, layoutColumns, EVENT_COLORS, colorHex,
  parseSeries, formatSeries, occurrences, appendSeries, stackLanes,
} from './events.js';
import { describeRule, shiftKey } from './repeat.js';
import { repeatPicker } from './repeat-picker.js';
import { showMenu } from '../../context-menu.js';

// Reminder choices (minutes before the start; all-day events start at 9:00).
const REMIND_TIMED = [[null, 'No reminder'], [0, 'At the start'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [1440, '1 day before']];
const REMIND_ALL_DAY = [[null, 'No reminder'], [0, 'On the day, 9:00'], [1440, 'Day before, 9:00']];
const TASK_LENGTH = 30; // minutes a timed task takes up in the grid

const HOUR = 39; // pixels per hour
const MINUTE = HOUR / 60;
const MONTH_ITEMS = 4; // events shown in a month cell before "+N more"
// Scrolling between days, weeks and months: how many days (weeks in Month)
// are on screen, and how many more are drawn on each side, ready to slide in.
const SHOWN = { day: 1, week: 7, month: 6 };
const BUFFER = { day: 3, week: 7, month: 6 };

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
  constructor(container, { date, mode, readDay, writeDay, readRepeats, writeRepeats, noteDays, openDayNote, openLink, onChange, loadTasks, toggleTask, updateTask, addTask, deleteTask, openTasks, openReview, recordStep, undo, openMailReply }) {
    this.container = container;
    this.date = date || new Date();
    this.mode = mode || 'day';
    this.io = {
      readDay, writeDay, noteDays, openDayNote, openLink, toggleTask, updateTask, addTask, deleteTask, openTasks, openMailReply,
      readRepeats: readRepeats || (async () => ''),
      writeRepeats,
      onChange: onChange || (() => {}),
      loadTasks: loadTasks || (async () => []),
      openReview: openReview || (() => {}),
      recordStep: recordStep || (async (fn) => fn()),
      undo,
    };
    this.cardsDue = 0; // flashcards due today (a badge on today)
    // Tasks can be hidden, leaving only events (remembered on this Mac).
    try {
      this.showTasks = localStorage.getItem('opal.calendarTasks') !== 'hidden';
    } catch {
      this.showTasks = true;
    }
    this.allTasks = [];
    this.series = [];
    this.tasks = [];
    this.days = {};
    this.writing = Promise.resolve();
    this.scrolled = false;
    this.clockTimer = setInterval(() => this.placeNowLine(), 60 * 1000);
    this.first = this.anchorFor(this.date, this.mode);
    this.stripPos = 0;
    this.selected = null;
    this.root = h('div', { class: 'cal' });
    container.replaceChildren(this.root);
    // Two-finger swipe (or Shift+scroll) slides smoothly through the days,
    // weeks or months; letting go settles on the nearest day (week in Month).
    this.root.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    // A click on empty space clears the selection.
    this.root.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.cal-event, .cal-chip, .cal-pop, .cal-agenda-item')) this.selectItem(null);
    });
    // ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Y redoes; Delete or Backspace removes
    // the selected event or task.
    this.onKey = (e) => {
      if (!this.root.isConnected || e.defaultPrevented) return;
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], .ask')) return;
      if (document.querySelector('.ask, .ctx-menu')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && !e.altKey && (key === 'z' || (key === 'y' && e.ctrlKey))) {
        e.preventDefault();
        this.undo(key === 'y' || e.shiftKey);
      } else if (!mod && (e.key === 'Backspace' || e.key === 'Delete') && this.selected) {
        e.preventDefault();
        this.deleteSelected();
      }
    };
    document.addEventListener('keydown', this.onKey);
    this.render();
    this.load();
  }

  destroy() {
    clearInterval(this.clockTimer);
    clearTimeout(this.settleTimer);
    cancelAnimationFrame(this.slideFrame);
    document.removeEventListener('keydown', this.onKey);
    this.closePopover();
  }

  // The first day on screen for a date: that day (Day), its Monday (Week), or
  // the Monday of its month's first week (Month).
  anchorFor(date, mode) {
    if (mode === 'day') return dayKey(date);
    if (mode === 'week') return dayKey(startOfWeek(date));
    return dayKey(startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1)));
  }

  // Days in one step of scrolling: a day, or a week in Month.
  unitDays() {
    return this.mode === 'month' ? 7 : 1;
  }

  // The days on screen.
  shownKeys() {
    const count = SHOWN[this.mode] * this.unitDays();
    return Array.from({ length: count }, (_, i) => shiftKey(this.first, i));
  }

  // The days drawn: those on screen plus the ones waiting either side.
  visibleKeys() {
    const unit = this.unitDays();
    const count = (SHOWN[this.mode] + 2 * BUFFER[this.mode]) * unit;
    const start = shiftKey(this.first, -BUFFER[this.mode] * unit);
    return Array.from({ length: count }, (_, i) => shiftKey(start, i));
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
    this.allTasks = await this.io.loadTasks();
    this.tasks = this.showTasks ? this.allTasks : [];
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

  toggleTasks() {
    this.showTasks = !this.showTasks;
    try {
      localStorage.setItem('opal.calendarTasks', this.showTasks ? 'shown' : 'hidden');
    } catch {
      // not remembered this time
    }
    this.tasks = this.showTasks ? this.allTasks : [];
    if (this.selected && this.selected.kind === 'task') this.selectItem(null);
    this.render();
  }

  // Flashcards due today, shown on today's header.
  setCardsDue(count) {
    if (count === this.cardsDue) return;
    this.cardsDue = count;
    this.render();
  }

  cardsBadge() {
    if (!this.cardsDue) return null;
    const badge = h('span', {
      class: 'cal-cards-due',
      role: 'button',
      tabindex: '0',
      title: 'Review your flashcards',
    }, `${this.cardsDue} card${this.cardsDue === 1 ? '' : 's'} due`);
    const open = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.io.openReview();
    };
    badge.addEventListener('click', open);
    badge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    return badge;
  }

  go(date, mode = this.mode) {
    // Somewhere close by in the same view: slide there.
    const first = this.anchorFor(date, mode);
    if (mode === this.mode && this.tracks && this.tracks.length && !this.gesture) {
      const units = Math.round((keyToDate(first) - keyToDate(this.first)) / 86400000 / this.unitDays());
      if (units && Math.abs(units) <= BUFFER[mode]) {
        if (mode === 'day') this.date = date;
        this.slideTo(units);
        return;
      }
    }
    cancelAnimationFrame(this.slideFrame);
    this.slideFrame = null;
    this.stripPos = 0;
    this.date = date;
    this.mode = mode;
    this.first = first;
    this.scrolled = false;
    this.io.onChange({ date: this.date, mode: this.mode });
    this.render();
    this.load();
  }

  // ---------- Sliding between days, weeks and months ----------

  // Every drawn column (or week row) slides together.
  setStripPos(pos) {
    this.stripPos = pos;
    const total = SHOWN[this.mode] + 2 * BUFFER[this.mode];
    const pct = -((BUFFER[this.mode] + pos) / total) * 100;
    for (const track of this.tracks || []) {
      track.style.transform = this.mode === 'month' ? `translateY(${pct}%)` : `translateX(${pct}%)`;
    }
  }

  // Pixels in one day (one week row in Month).
  unitPixels() {
    if (!this.stripWin) return 100;
    const size = this.mode === 'month' ? this.stripWin.clientHeight : this.stripWin.clientWidth;
    return Math.max(20, size / SHOWN[this.mode]);
  }

  // Mondays (Week), and weeks where a month begins (Month), hold on a little.
  isSticky(units) {
    if (this.mode === 'week') return keyToDate(shiftKey(this.first, units)).getDay() === 1;
    if (this.mode === 'month') {
      const monday = shiftKey(this.first, units * 7);
      return Array.from({ length: 7 }, (_, d) => keyToDate(shiftKey(monday, d)).getDate()).includes(1);
    }
    return false;
  }

  onWheel(e) {
    if (!this.tracks || !this.tracks.length) return;
    if (!e.target.closest('.cal-main') || e.target.closest('.cal-pop, .ctx-menu')) return;
    const month = this.mode === 'month';
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
    const dy = e.shiftKey ? 0 : e.deltaY;
    // A gesture keeps one direction (up/down in Day and Week scrolls the
    // hours). The trackpad's coasting ends in tiny wobbles, which never
    // decide it; a clear push the other way always takes over.
    clearTimeout(this.axisTimer);
    this.axisTimer = setTimeout(() => { this.wheelAxis = null; this.pendingDelta = 0; }, 160);
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax >= 3 && ax > 2 * ay) this.wheelAxis = 'x';
    else if (ay >= 3 && ay > 2 * ax) this.wheelAxis = 'y';
    else if (!this.wheelAxis && Math.max(ax, ay) >= 2) this.wheelAxis = ax > ay ? 'x' : 'y';
    const axis = this.wheelAxis || (ax > ay ? 'x' : 'y');
    if (!month && axis === 'y') return;
    e.preventDefault();
    const unit = this.unitPixels();
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? unit : 1;
    const delta = (month && axis === 'y' ? dy : dx) * lines;
    // A trickle (the end of a swipe's coasting) never starts a new slide:
    // it takes a few pixels of real movement.
    if (!this.gesture) {
      // While settling, only a real new swipe (not coasting) takes over.
      if (this.slideFrame && Math.abs(delta) < 6) return;
      this.pendingDelta = (this.pendingDelta || 0) + delta;
      if (Math.abs(this.pendingDelta) < 6) return;
    }
    if (!this.gesture) {
      cancelAnimationFrame(this.slideFrame);
      this.slideFrame = null;
      const at = Math.round(this.stripPos);
      this.gesture = { start: this.stripPos, raw: 0, sticky: Math.abs(this.stripPos - at) < 0.02 && this.isSticky(at) };
      this.closePopover();
    }
    const g = this.gesture;
    const fresh = this.pendingDelta;
    this.pendingDelta = 0;
    g.raw += (fresh || delta) / unit;
    // Once the movement has died down to a trickle, come to rest now
    // rather than waiting for the coasting to stop completely.
    g.quiet = Math.abs(delta) < 2 ? (g.quiet || 0) + 1 : 0;
    // Leaving a Monday (or a month's first week) takes a little more push.
    const R = 0.5;
    const K = 0.35;
    const size = Math.abs(g.raw);
    const moved = g.sticky ? Math.sign(g.raw) * (size < R ? size * K : R * K + (size - R)) : g.raw;
    const limit = BUFFER[this.mode];
    this.setStripPos(Math.max(-limit, Math.min(limit, g.start + moved)));
    clearTimeout(this.settleTimer);
    if (g.quiet >= 4) this.settle();
    else this.settleTimer = setTimeout(() => this.settle(), 140);
  }

  // Where to come to rest: the nearest day (week), or a Monday (a month's
  // first week) when it's close.
  snapTarget(pos) {
    const limit = BUFFER[this.mode];
    for (let i = Math.floor(pos) - 1; i <= Math.ceil(pos) + 1; i++) {
      if (Math.abs(pos - i) < 0.6 && Math.abs(i) <= limit && this.isSticky(i)) return i;
    }
    return Math.max(-limit, Math.min(limit, Math.round(pos)));
  }

  settle() {
    if (!this.gesture) return;
    this.gesture = null;
    this.slideTo(this.snapTarget(this.stripPos));
  }

  // Glide to `target` (days, or weeks in Month, from where things rest now),
  // then redraw around the new first day.
  slideTo(target) {
    cancelAnimationFrame(this.slideFrame);
    this.closePopover();
    const from = this.stripPos;
    const started = performance.now();
    const length = Math.min(380, 200 + Math.abs(target - from) * 25);
    const frame = (now) => {
      const k = Math.min(1, (now - started) / length);
      const eased = 1 - (1 - k) ** 3;
      this.setStripPos(from + (target - from) * eased);
      if (k < 1) {
        this.slideFrame = requestAnimationFrame(frame);
        return;
      }
      this.slideFrame = null;
      this.rebase(target);
    };
    this.slideFrame = requestAnimationFrame(frame);
  }

  rebase(units) {
    if (!units) {
      this.setStripPos(0);
      return;
    }
    this.first = shiftKey(this.first, units * this.unitDays());
    this.stripPos = 0;
    if (this.mode === 'month') {
      // The month that fills most of the screen (today, if it's in it).
      const middle = keyToDate(shiftKey(this.first, 17));
      const today = new Date();
      this.date = today.getFullYear() === middle.getFullYear() && today.getMonth() === middle.getMonth() ? today : new Date(middle.getFullYear(), middle.getMonth(), 1);
    } else if (this.mode === 'week' || dayKey(this.date) !== this.first) {
      this.date = keyToDate(this.first);
    }
    this.scrolled = true; // keep the hours where they are
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
    const drawn = this.visibleKeys();
    const keys = this.shownKeys();
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
      h('button', {
        class: `cal-navbtn cal-tasks-toggle${this.showTasks ? ' is-on' : ''}`,
        'aria-pressed': String(this.showTasks),
        title: this.showTasks ? 'Hide tasks (show only events)' : 'Show tasks',
        onclick: () => this.toggleTasks(),
      }, this.showTasks ? '✓ Tasks' : 'Tasks hidden'),
      h('div', { class: 'cal-nav' },
        h('button', { class: 'cal-navbtn', 'aria-label': 'Previous', onclick: () => this.go(shift(-1)) }, '‹'),
        h('button', { class: 'cal-navbtn cal-today', onclick: () => this.go(new Date()) }, 'Today'),
        h('button', { class: 'cal-navbtn', 'aria-label': 'Next', onclick: () => this.go(shift(1)) }, '›'),
        h('button', { class: 'cal-add', onclick: (e) => this.createAt(addKey, this.defaultStart(addKey), e.currentTarget) }, '+ Event')),
    );

    const rail = this.renderRail(keys);
    this.tracks = [];
    const body = h('div', { class: 'cal-body' }, rail, month ? this.renderMonth(drawn) : this.renderGrid(drawn));
    this.root.replaceChildren(head, body);
    if (this.flashEl) this.root.append(this.flashEl); // a message outlasts a redraw
    makePanel(rail, { id: 'cal-rail', side: 'left', label: 'Month', width: 260, min: 220, max: 420 });
    this.setStripPos(this.stripPos);
    this.markSelected();

    if (month) {
      requestAnimationFrame(() => this.fitMonthCells());
      return;
    }
    // The headings leave room for the hour grid's scrollbar, so the columns line up.
    requestAnimationFrame(() => {
      if (!this.scrollEl) return;
      const bar = this.scrollEl.offsetWidth - this.scrollEl.clientWidth;
      this.root.querySelector('.cal-main')?.style.setProperty('--scrollbar', `${bar}px`);
    });
    this.fitEvents();
    if (scroll !== null && this.scrolled) this.scrollEl.scrollTop = scroll;
    else this.scrollToMorning(keys);
  }

  // A row of drawn days that slides as one: wider than its window by the
  // days waiting either side.
  track(className, children, style = '') {
    const total = SHOWN[this.mode] + 2 * BUFFER[this.mode];
    const size = `${(total / SHOWN[this.mode]) * 100}%`;
    const el = h('div', { class: `cal-track ${className}`, style: `${this.mode === 'month' ? 'height' : 'width'}: ${size}; ${style}` }, children);
    this.tracks.push(el);
    return el;
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
              h('span', { class: 'cal-agenda-dot', style: `background: ${this.fillOf(e)}${e.secondary ? `; border-left: 4px solid ${colorHex(e.secondary)}` : ''}` }),
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
      h('div', { class: 'cal-hwin' }, this.track('cal-coltrack', keys.map((key) => {
        const date = keyToDate(key);
        return h('button', {
          class: `cal-colday${key === today ? ' is-today' : ''}`,
          onclick: () => (this.mode === 'week' ? this.go(date, 'day') : this.io.openDayNote(key)),
          title: this.mode === 'week' ? 'Show this day' : 'Open this day’s note',
        },
        h('span', { class: 'mono-label' }, weekday(date, 'short')),
        h('span', { class: 'display cal-colnum' }, String(date.getDate())),
        key === today ? this.cardsBadge() : null);
      }))));

    const allDayRow = this.renderAllDayRow(keys);

    const hours = h('div', { class: 'cal-hours', 'aria-hidden': 'true' },
      Array.from({ length: 24 }, (_, hr) => h('span', { class: 'cal-hour', style: `top: ${hr * HOUR}px` }, hr ? `${String(hr).padStart(2, '0')}:00` : '')));

    const columns = keys.map((key) => this.renderDayColumn(key, key === today));
    this.monthEl = null;
    this.stripWin = h('div', { class: 'cal-hwin' }, this.track('cal-daytrack', columns));
    this.inner = h('div', { class: 'cal-inner', style: `height: ${24 * HOUR}px` }, hours, this.stripWin);
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
    const row = this.track('cal-alldaytrack', [], `grid-template-columns: repeat(${keys.length}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, 22px)`);
    row.dataset.lanes = String(lanes);
    keys.forEach((key, i) => {
      row.append(h('div', { class: 'cal-allday-cell', 'data-key': key, style: `grid-column: ${i + 1}; grid-row: 1 / span ${rows}` }));
    });
    this.allDayRowEl = row;
    this.allDayKeys = keys;
    this.selectDays(row, keys);
    for (const entry of items) {
      const el = this.spanChip(entry, keys);
      el.style.gridColumn = `${entry.from + 1} / ${entry.to + 2}`;
      el.style.gridRow = String(entry.lane + 1);
      row.append(el);
    }
    return h('div', { class: 'cal-allday' },
      h('span', { class: 'cal-gutter mono-label' }, 'All day'),
      h('div', { class: 'cal-hwin' }, row));
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

  // Press on an empty day (all-day row or month) and drag across others to
  // choose the days of a new all-day event; a click is just that day. A bar
  // marked "Untitled" shows the days while dragging, and stays as the
  // event's preview while it's being named.
  selectDays(container) {
    const isDay = (n) => n && n.dataset && n.dataset.key && (n.classList.contains('cal-mcell') || n.classList.contains('cal-allday-cell'));
    const dayAt = (x, y) => document.elementsFromPoint(x, y).find((n) => isDay(n) && this.root.contains(n));
    container.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
      // Only empty space: not a bar, a chip, a day number or "+ more".
      if (down.target.closest('button, .cal-chip, .cal-cards-due, a')) return;
      const startEl = dayAt(down.clientX, down.clientY);
      if (!startEl) return;
      down.preventDefault();
      this.closePopover();
      const startKey = startEl.dataset.key;
      let endKey = startKey;
      let drafts = this.draftBars(startKey, startKey);
      const move = (e) => {
        const el = dayAt(e.clientX, e.clientY);
        if (!el || el.dataset.key === endKey) return;
        endKey = el.dataset.key;
        drafts = this.draftBars(startKey < endKey ? startKey : endKey, startKey < endKey ? endKey : startKey);
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', cancel, true);
        const [first, last] = startKey <= endKey ? [startKey, endKey] : [endKey, startKey];
        this.openCreate({ key: first, endKey: last > first ? last : null, allDay: true, start: 0, end: 24 * 60, previews: drafts }, drafts[0] || startEl);
      };
      const cancel = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        window.removeEventListener('pointercancel', cancel, true);
        this.clearDrafts();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
      window.addEventListener('pointercancel', cancel, true);
    });
  }

  // "Untitled" bars over the days first…last (one piece per week row in the
  // month; one bar in the all-day row). → the bars
  draftBars(first, last) {
    this.clearDrafts();
    const out = [];
    const bar = (extra = '') => h('div', { class: `cal-chip cal-draft cal-draft-bar is-chip${extra}`, 'aria-hidden': 'true' },
      h('span', { class: 'cal-event-title' }, 'Untitled'));
    if (this.monthEl) {
      for (const row of this.monthEl.querySelectorAll('.cal-mweek')) {
        const keys = [...row.querySelectorAll('.cal-mcell')].map((c) => c.dataset.key);
        if (last < keys[0] || first > keys[6]) continue;
        const from = first < keys[0] ? 0 : keys.indexOf(first);
        const to = last > keys[6] ? 6 : keys.indexOf(last);
        const lanes = Number(getComputedStyle(row).getPropertyValue('--lanes')) || 0;
        row.dataset.lanes = String(lanes);
        row.style.setProperty('--lanes', String(lanes + 1)); // room for the new bar
        const el = bar(`${first < keys[0] ? ' is-cont-left' : ''}${last > keys[6] ? ' is-cont-right' : ''} cal-mbar`);
        el.style.left = `calc(${(from / 7) * 100}% + 3px)`;
        el.style.width = `calc(${((to - from + 1) / 7) * 100}% - 6px)`;
        el.style.top = `calc(var(--mtop) + ${lanes} * var(--lane))`;
        row.append(el);
        out.push(el);
      }
    } else if (this.allDayRowEl) {
      const keys = this.allDayKeys;
      const from = Math.max(0, keys.indexOf(first) === -1 ? 0 : keys.indexOf(first));
      const to = keys.indexOf(last) === -1 ? keys.length - 1 : keys.indexOf(last);
      const el = bar();
      el.style.gridColumn = `${from + 1} / ${to + 2}`;
      el.style.gridRow = String(Number(this.allDayRowEl.dataset.lanes) + 1);
      this.allDayRowEl.append(el);
      out.push(el);
    }
    return out;
  }

  clearDrafts() {
    this.root.querySelectorAll('.cal-draft-bar').forEach((el) => el.remove());
    if (this.monthEl) {
      for (const row of this.monthEl.querySelectorAll('.cal-mweek[data-lanes]')) {
        row.style.setProperty('--lanes', row.dataset.lanes);
        delete row.dataset.lanes;
      }
    }
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
        h('span', { class: 'cal-event-title' }, 'Untitled'),
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
    // A "to reply" task from Mail: an envelope that opens the reply instead.
    if (task.mail && !task.done && this.io.openMailReply) {
      return h('button', {
        type: 'button',
        class: 'cal-task-box cal-task-mail',
        'aria-label': `Write the reply: ${task.title}`,
        title: 'Write the reply',
        onpointerdown: (e) => e.stopPropagation(),
        onclick: (e) => {
          e.stopPropagation();
          this.io.openMailReply(task.mail);
        },
      }, icon('mail', 11));
    }
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

  // Tasks are outlined in their colour with a faint tint inside (events are
  // filled cards), so the two are easy to tell apart. An accent is a stripe.
  taskPaint(task) {
    const parts = [`--task-c: ${this.fillOf({ primary: task.primary, color: null, title: task.title })}`];
    if (colorHex(task.secondary)) parts.push(`--task-accent: ${colorHex(task.secondary)}; --task-accent-w: 4px`);
    return parts.join('; ');
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
    this.tagItem(chip, 'task', task);
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
    this.tagItem(el, 'task', task);
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
    this.tagItem(el, 'event', event);
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
      { label: 'Rename…', onSelect: () => this.showPopover(event, anchor, { focusTitle: true }) },
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
        { label: 'Rename…', onSelect: () => this.showTaskPopover(task, anchor, { focusTitle: true }) },
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

  // A day that's too full for its cell hides what doesn't fit behind
  // "+N more" (measured all at once, then changed all at once).
  fitMonthCells() {
    if (!this.monthEl) return;
    const plans = [];
    for (const cell of this.monthEl.querySelectorAll('.cal-mcell')) {
      const items = [...cell.children].filter((n) => n.classList.contains('cal-chip'));
      const more = cell.querySelector('.cal-mmore');
      if (!items.length || !more) continue;
      const limit = cell.clientHeight - 4;
      const bottoms = items.map((n) => n.offsetTop + n.offsetHeight);
      if (more.hidden && bottoms[bottoms.length - 1] <= limit) continue;
      const room = limit - 18; // the "+N more" line
      let keep = bottoms.filter((b) => b <= room).length;
      if (more.hidden && keep === items.length) continue;
      keep = Math.max(0, keep);
      plans.push({ items, more, keep, total: Number(cell.dataset.total) || items.length });
    }
    for (const { items, more, keep, total } of plans) {
      items.forEach((n, i) => { n.hidden = i >= keep; });
      more.hidden = false;
      more.textContent = `+${total - keep} more`;
    }
  }

  // Month: one row per week. Multi-day events and tasks lie across the row as
  // one bar (continuing on the next row if they run into the next week);
  // single-day ones sit in their day. Press a day and drag across others to
  // make a multi-day event.
  renderMonth(keys) {
    this.inner = null;
    this.scrollEl = null;
    const today = dayKey(new Date());
    const month = this.date.getMonth();
    const head = h('div', { class: 'cal-mhead' },
      keys.slice(0, 7).map((key) => h('span', { class: 'mono-label' }, weekday(keyToDate(key), 'short'))));
    const weeks = [];
    for (let w = 0; w < keys.length; w += 7) weeks.push(this.renderMonthWeek(keys.slice(w, w + 7), month, today));
    this.monthEl = this.track('cal-mgrid', weeks);
    this.stripWin = h('div', { class: 'cal-mscroll' }, this.monthEl);
    return h('div', { class: 'cal-main cal-month' }, head, this.stripWin);
  }

  // The bars (multi-day events and tasks) that cross a run of days, with
  // their columns (from, to) and lanes. → { bars, lanes }
  spanBars(keys) {
    const first = keys[0];
    const last = keys[keys.length - 1];
    const bars = [];
    const seen = new Set();
    for (const e of this.multiDayEvents()) {
      const id = `${e.day}|${e.raw}`;
      if (seen.has(id) || e.day > last || e.endDay < first) continue;
      seen.add(id);
      bars.push({ kind: 'event', item: e, first: e.day, last: e.endDay });
    }
    for (const t of this.tasks) {
      const span = this.taskSpan(t);
      if (!span.multi || span.last < first || span.first > last) continue;
      bars.push({ kind: 'task', item: t, first: span.first, last: span.last });
    }
    for (const bar of bars) {
      bar.from = bar.first < first ? 0 : keys.indexOf(bar.first);
      bar.to = bar.last > last ? keys.length - 1 : keys.indexOf(bar.last);
    }
    return { bars, lanes: stackLanes(bars) };
  }

  renderMonthWeek(weekKeys, month, today) {
    const { bars, lanes } = this.spanBars(weekKeys);
    const row = h('div', { class: 'cal-mweek', style: `--lanes: ${lanes}` });
    const room = Math.max(1, MONTH_ITEMS - lanes);
    weekKeys.forEach((key) => {
      const date = keyToDate(key);
      const events = (this.days[key]?.events || []).filter((e) => !e.endDay).sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
      const tasks = this.tasks.filter((t) => { const sp = this.taskSpan(t); return !sp.multi && sp.last === key; })
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const items = [
        ...tasks.map((t) => this.spanChip({ kind: 'task', item: t, ...this.taskSpan(t) }, [key])),
        ...events.map((e) => (e.allDay
          ? this.chipEl(e, h('span', null, `${e.repeating ? '↻ ' : ''}${e.title}`))
          : this.chipEl(e, [
            h('span', { class: 'cal-mdot', style: `background: ${this.fillOf(e)}`, 'aria-hidden': 'true' }),
            h('span', { class: 'cal-mtime' }, clock(e.start)),
            h('span', { class: 'cal-mtitle' }, `${e.repeating ? '↻ ' : ''}${e.title}`),
          ], 'is-timed'))),
      ];
      const extra = items.length - room;
      const cell = h('div', {
        class: `cal-mcell${date.getMonth() !== month ? ' is-outside' : ''}${key === today ? ' is-today' : ''}`,
        'data-key': key,
      },
      h('div', { class: 'cal-mtop' },
        h('button', {
          class: 'cal-mnum',
          'aria-label': `Show ${longDate(date)}`,
          onclick: () => this.go(date, 'day'),
        }, date.getDate() === 1 ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : String(date.getDate())),
        key === today ? this.cardsBadge() : null),
      // Room for the bars that cross this week.
      h('div', { class: 'cal-mlanes', 'aria-hidden': 'true' }),
      items.slice(0, extra > 0 ? room - 1 : room),
      h('button', { class: 'cal-mmore', hidden: extra > 0 ? null : true, onclick: () => this.go(date, 'day') }, `+${extra + 1} more`));
      cell.dataset.total = String(items.length);
      row.append(cell);
    });
    for (const bar of bars) {
      const el = this.spanChip(bar, weekKeys);
      el.classList.add('cal-mbar');
      el.style.left = `calc(${(bar.from / 7) * 100}% + 3px)`;
      el.style.width = `calc(${((bar.to - bar.from + 1) / 7) * 100}% - 6px)`;
      el.style.top = `calc(var(--mtop) + ${bar.lane} * var(--lane))`;
      row.append(el);
    }
    this.selectDays(row, weekKeys, (first, last) => this.draftBars(first, last));
    return row;
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
    if ((event.allDay || event.endDay) && !event.repeating && extraClass !== 'is-timed') this.addResizers(chip, event);
    this.tagItem(chip, 'event', event);
    return chip;
  }

  // Grips on both ends of an all-day or multi-day bar: drag one across days to
  // make the event start earlier / later or end earlier / later.
  addResizers(chip, event) {
    for (const side of ['start', 'end']) {
      const grip = h('span', { class: `cal-bar-grip is-${side}`, title: side === 'start' ? 'Drag to change the first day' : 'Drag to change the last day', 'aria-hidden': 'true' });
      grip.addEventListener('pointerdown', (down) => {
        if (down.button !== 0) return;
        down.stopPropagation();
        down.preventDefault();
        this.closePopover();
        const dayAt = (x, y) => document.elementsFromPoint(x, y).find((n) => n.dataset && n.dataset.key && (n.classList.contains('cal-mcell') || n.classList.contains('cal-allday-cell')) && this.root.contains(n));
        const last0 = event.endDay || event.day;
        let first = event.day;
        let last = last0;
        let moved = false;
        const move = (e) => {
          const el = dayAt(e.clientX, e.clientY);
          if (!el) return;
          const key = el.dataset.key;
          if (side === 'start') first = key > last0 ? last0 : key;
          else last = key < event.day ? event.day : key;
          if (!moved) {
            moved = true;
            chip.classList.add('is-resizing');
            this.dragging = true;
          }
          const drafts = this.draftBars(first, last);
          for (const d of drafts) {
            d.querySelector('.cal-event-title').textContent = event.title;
            d.setAttribute('style', `${d.getAttribute('style') || ''}; ${this.paint(event)}`);
          }
        };
        const up = () => {
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', up, true);
          this.clearDrafts();
          chip.classList.remove('is-resizing');
          this.dragging = false;
          if (!moved) return;
          // The click that ends the drag isn't "open the event".
          // (only a click straight after letting go, and only in the calendar).
          const swallow = (e) => { if (this.root.contains(e.target)) e.stopPropagation(); };
          window.addEventListener('click', swallow, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 250);
          if (first !== event.day || last !== last0) this.resizeEvent(event, first, last);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
      });
      chip.append(grip);
    }
  }

  // An event now covering first…last (whole days; times stay the same).
  async resizeEvent(event, first, last) {
    const endDay = last > first ? last : null;
    if (first === event.day) return this.updateEvent(event, { endDay });
    const updated = { ...event, day: first, endDay };
    return this.change(async () => {
      // Add on the new first day before removing from the old one, so a failure never loses it.
      await this.io.writeDay(first, insertEvent(await this.freshText(first), formatEvent(updated), this.dateLabel(first)));
      await this.io.writeDay(event.day, replaceEvent(await this.freshText(event.day), event, null));
    });
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
    if (colorHex(event.primary)) return colorHex(event.primary);
    return `var(--c${event.color || slotFor(event.title)})`;
  }

  // A soft card in the event's colour; an accent colour, if set, is a stripe
  // down the left edge.
  paint(event) {
    const base = this.fillOf(event);
    const parts = [`background: color-mix(in srgb, ${base} var(--event-strength, 34%), var(--event-mix))`];
    if (colorHex(event.secondary)) parts.push(`border-left: 4px solid ${colorHex(event.secondary)}`);
    // The 30 named colours are already deep enough for white writing: the
    // Minimal theme doesn't darken them further.
    if (colorHex(event.primary)) parts.push('--deepen-sat: 1; --deepen-bright: 1');
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

  // ---------- Selecting ----------

  itemId(kind, item) {
    return kind === 'task' ? `t|${item.list}|${item.raw}` : `e|${item.day}|${item.raw}`;
  }

  // Remembers which item an element shows (to find the selection again
  // after the calendar is redrawn).
  tagItem(el, kind, item) {
    el.dataset.item = this.itemId(kind, item);
    el.calItem = { kind, item };
  }

  // Select an item (null: nothing). Delete or Backspace removes it.
  selectItem(kind, item) {
    this.selected = kind ? { kind, item, id: this.itemId(kind, item) } : null;
    this.markSelected();
  }

  markSelected() {
    for (const el of this.root.querySelectorAll('.is-selected')) el.classList.remove('is-selected');
    if (!this.selected) return;
    for (const el of this.root.querySelectorAll('[data-item]')) {
      if (el.dataset.item !== this.selected.id) continue;
      el.classList.add('is-selected');
      this.selected.item = el.calItem.item; // the freshest copy
    }
  }

  async deleteSelected() {
    const sel = this.selected;
    if (!sel) return null;
    this.selectItem(null);
    if (sel.kind === 'task') return this.change(() => this.io.deleteTask(sel.item));
    const event = sel.item;
    if (!event.repeating) return this.deleteEvent(event);
    const which = await askChoice(`Delete “${event.title}”`, [
      { label: 'Just this one', value: 'one' },
      { label: 'Every repeat', value: 'all' },
    ]);
    return which ? this.deleteEvent(event, which) : null;
  }

  // Undo (or redo) the last change made in the calendar.
  undo(redo = false) {
    if (!this.io.undo) return null;
    this.closePopover();
    this.selectItem(null);
    this.writing = this.writing
      .then(() => this.io.undo(redo))
      .then((did) => this.flash(did ? (redo ? 'Redone' : 'Undone') : (redo ? 'Nothing to redo' : 'Nothing to undo')))
      .catch((err) => alert(`The calendar couldn't undo that.\n\n${err.message}`))
      .then(() => this.load());
    return this.writing;
  }

  // A short message at the bottom of the calendar.
  flash(text) {
    if (this.flashEl) this.flashEl.remove();
    const note = h('div', { class: 'cal-flash', role: 'status' }, text);
    this.flashEl = note;
    this.root.append(note);
    setTimeout(() => {
      note.remove();
      if (this.flashEl === note) this.flashEl = null;
    }, 1800);
  }

  // ---------- Popover ----------

  // The title box at the top of an item's popover: edit it in place; it's
  // saved with Enter, or when the popover closes.
  titleBox(value, onEnter) {
    const input = h('input', { class: 'cal-new-title cal-edit-title', value, placeholder: 'Untitled', 'aria-label': 'Title', spellcheck: 'true' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onEnter();
      } else if (e.key === 'Escape') {
        input.value = value;
      }
    });
    // → the new title, or null if it hasn't changed.
    const edited = () => {
      const next = input.value.trim();
      return next && next !== value.trim() ? next : null;
    };
    return { input, edited };
  }

  // Event | Task switch at the top of a popover; picking the other side
  // turns the item into it.
  kindSwitch(current, onSwitch, blocked) {
    const button = (kind, label) => h('button', {
      type: 'button',
      class: `cal-new-kind${current === kind ? ' is-on' : ''}`,
      'aria-pressed': String(current === kind),
      disabled: kind !== current && blocked ? true : null,
      title: kind !== current ? (blocked || `Make this ${kind === 'task' ? 'a task' : 'an event'}`) : null,
      onclick: () => { if (kind !== current && !blocked) onSwitch(); },
    }, label);
    return h('div', { class: 'cal-new-kinds', role: 'group', 'aria-label': 'Kind' }, button('event', 'Event'), button('task', 'Task'));
  }

  showPopover(event, anchor, { focusTitle = false } = {}) {
    this.closePopover();
    this.selectItem('event', event);
    // Every change made here carries the title being typed along with it.
    let done = false;
    const title = this.titleBox(event.text || event.title, () => act((e) => this.updateEvent(event, { text: e.text })));
    const current = () => (title.edited() ? { ...event, text: title.edited() } : event);
    const act = (fn) => {
      done = true;
      return fn(current());
    };
    const picker = (label, value, onPick, allowNone) => this.colorPicker(label, value, onPick, allowNone);
    const swatches = h('div', { class: 'cal-pickers' },
      picker('Primary · fill', event.primary, (name) => act((e) => this.updateEvent(e, { primary: name, color: null })), false),
      picker('Secondary · accent', event.secondary, (name) => act((e) => this.updateEvent(e, { secondary: name })), true));

    // Repeat: a menu of rules, plus an optional last day for a series.
    const from = event.repeating ? event.from : event.day;
    const repeatMenu = repeatPicker({
      rule: event.repeating ? event.rule : null,
      from,
      className: 'cal-pop-select',
      onChange: (rule) => act((e) => this.setRepeat(e, rule)),
    });
    const remindChoices = event.allDay ? REMIND_ALL_DAY : REMIND_TIMED;
    const remindMenu = h('select', { class: 'cal-pop-select', 'aria-label': 'Reminder' },
      remindChoices.map(([value, label]) => h('option', { value: value == null ? '' : String(value) }, label)),
      event.remind != null && !remindChoices.some(([v]) => v === event.remind) ? h('option', { value: String(event.remind) }, `${event.remind} minutes before`) : null);
    remindMenu.value = event.remind == null ? '' : String(event.remind);
    remindMenu.addEventListener('change', () => act((e) => this.updateEvent(e, { remind: remindMenu.value === '' ? null : Number(remindMenu.value) })));
    const until = event.repeating ? h('input', { type: 'date', class: 'cal-pop-select', value: event.until || '', min: event.from, 'aria-label': 'Repeat until' }) : null;
    if (until) until.addEventListener('change', () => act((e) => this.updateEvent(e, { until: until.value || null })));

    // Until: a later last day makes it a multi-day event (not for repeats).
    const shortDay = (key) => keyToDate(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const untilIn = event.repeating ? null : h('input', { type: 'date', class: 'cal-pop-select', value: event.endDay || event.day, min: event.day, 'aria-label': 'Until' });
    if (untilIn) untilIn.addEventListener('change', () => act((e) => this.updateEvent(e, { endDay: untilIn.value > event.day ? untilIn.value : null })));
    const when = event.endDay
      ? `${shortDay(event.day)}${event.allDay ? '' : ` ${clock(event.start)}`} → ${shortDay(event.endDay)}${event.allDay ? '' : ` ${clock(event.end)}`}`
      : event.allDay ? 'All day' : `${clock(event.start)} – ${clock(event.end)}`;
    const pop = h('div', { class: 'cal-pop', role: 'dialog', 'aria-label': event.title },
      title.input,
      this.kindSwitch('event', () => act((e) => this.eventToTask(e)), event.repeating ? 'A repeating event can’t become a task' : null),
      h('span', { class: 'mono-label' }, when),
      swatches,
      h('div', { class: 'cal-pop-repeat' },
        untilIn ? h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Until'), untilIn) : null,
        h('div', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Repeat'), repeatMenu),
        h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Remind'), remindMenu),
        until ? h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Until'), until) : null,
        event.repeating ? h('span', { class: 'hand cal-pop-hint' }, 'name, colour & reminder apply to every repeat') : null),
      h('div', { class: 'cal-pop-actions' },
        event.link ? h('button', { class: 'cal-pop-btn is-primary', onclick: () => this.io.openLink(event.link) }, `Open “${event.link}”`) : null,
        h('button', { class: 'cal-pop-btn', onclick: () => this.io.openDayNote(event.day) }, 'Day note'),
        event.repeating
          ? [
            h('button', { class: 'cal-pop-btn is-danger', onclick: () => act(() => this.deleteEvent(event, 'one')) }, 'Delete this one'),
            h('button', { class: 'cal-pop-btn is-danger', onclick: () => act(() => this.deleteEvent(event, 'all')) }, 'Delete all'),
          ]
          : h('button', { class: 'cal-pop-btn is-danger', onclick: () => act(() => this.deleteEvent(event)) }, 'Delete')));
    // Closing the popover keeps a title that was typed.
    this.placePopover(pop, anchor, () => {
      if (!done && title.edited()) act((e) => this.updateEvent(event, { text: e.text }));
    });
    if (focusTitle) {
      title.input.focus();
      title.input.select();
    }
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
          // An older colour name counts as the new colour it now shows as.
          class: `cal-swatch${colorHex(current) === hex ? ' is-on' : ''}`,
          role: 'radio',
          'aria-checked': String(colorHex(current) === hex),
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

  showTaskPopover(task, anchor, { focusTitle = false } = {}) {
    this.closePopover();
    this.selectItem('task', task);
    let done = false;
    const title = this.titleBox(task.title, () => act((t) => this.io.updateTask(task, { title: t.title }), true));
    const current = () => (title.edited() ? { ...task, title: title.edited() } : task);
    // Every change made here carries the title being typed along with it.
    const act = (fn, write = true) => {
      done = true;
      return write ? this.change(() => fn(current())) : fn(current());
    };
    const pop = h('div', { class: 'cal-pop', role: 'dialog', 'aria-label': task.title },
      title.input,
      this.kindSwitch('task', () => act((t) => this.taskToEvent(t), false)),
      h('span', { class: 'mono-label' }, `Task · ${task.list}${task.time ? ` · ${task.time}${task.endTime ? `–${task.endTime}` : ''}` : ''}`),
      task.details.length ? h('span', { class: 'serif-i' }, task.details.join(' ')) : null,
      h('div', { class: 'cal-pickers' },
        this.colorPicker('Primary · fill', task.primary, (name) => act((t) => this.io.updateTask(task, { title: t.title, primary: name })), false),
        this.colorPicker('Secondary · accent', task.secondary, (name) => act((t) => this.io.updateTask(task, { title: t.title, secondary: name })), true)),
      h('div', { class: 'cal-pop-actions' },
        h('button', {
          class: 'cal-pop-btn is-primary',
          onclick: () => act((t) => this.io.toggleTask(t)),
        }, task.done ? 'Mark not done' : 'Mark done'),
        h('button', { class: 'cal-pop-btn', onclick: () => this.io.openTasks() }, 'Open Tasks'),
        h('button', { class: 'cal-pop-btn is-danger', onclick: () => act(() => this.io.deleteTask(task)) }, 'Delete')));
    this.placePopover(pop, anchor, () => {
      if (!done && title.edited()) act((t) => this.io.updateTask(task, { title: t.title }));
    });
    if (focusTitle) {
      title.input.focus();
      title.input.select();
    }
  }

  // An event → a task on the same day(s) and time, in the default list.
  eventToTask(event) {
    if (event.repeating) return null;
    return this.change(async () => {
      // Add the task before removing the event, so a failure never loses it.
      await this.io.addTask({
        title: event.text || event.title,
        due: event.endDay || event.day,
        startDate: event.endDay ? event.day : null,
        time: event.allDay ? null : clock(event.start),
        endTime: event.allDay ? null : clock(Math.min(event.end, 24 * 60 - 1)),
        primary: event.primary || null,
        secondary: event.secondary || null,
      });
      await this.io.writeDay(event.day, replaceEvent(await this.freshText(event.day), event, null));
    });
  }

  // A task → an event on the same day(s) and time.
  async taskToEvent(task) {
    const loses = [task.details.length ? 'notes' : null, task.subtasks.length ? 'subtasks' : null, task.repeat ? 'repeat' : null].filter(Boolean);
    if (loses.length) {
      const ok = await askChoice(`Make “${task.title}” an event? Its ${loses.join(' and ')} won’t come along.`, [{ label: 'Make it an event', value: 'yes' }]);
      if (!ok) return null;
    }
    const span = this.taskSpan(task);
    const minutes = (v) => {
      const [hh, mm] = v.split(':').map(Number);
      return hh * 60 + mm;
    };
    const allDay = !task.time;
    const start = allDay ? 0 : minutes(task.time);
    let end = allDay ? 24 * 60 : task.endTime ? minutes(task.endTime) : start + 60;
    if (!span.multi && end <= start) end = start + 60;
    end = Math.min(24 * 60, end);
    const line = formatEvent({ allDay, start, end, text: task.title, color: null, primary: task.primary || null, secondary: task.secondary || null, endDay: span.multi ? span.last : null, day: span.first });
    return this.change(async () => {
      await this.io.writeDay(span.first, insertEvent(await this.freshText(span.first), line, this.dateLabel(span.first)));
      await this.io.deleteTask(task);
    });
  }

  closePopover() {
    const { popover, popoverCleanup } = this;
    this.popover = null;
    this.popoverCleanup = null;
    if (popover) popover.remove();
    if (popoverCleanup) popoverCleanup();
  }

  // ---------- Changes (all written to the day notes) ----------

  // Every change is one step that ⌘Z can undo.
  change(task) {
    this.closePopover();
    this.writing = this.writing.then(() => this.io.recordStep(task)).catch((err) => alert(`The calendar couldn't save that.\n\n${err.message}`)).then(() => this.load());
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
    // The new event's preview on the calendar (a block in the day, or bars
    // across days), named "Untitled" until it has a title.
    const previews = draft.previews && draft.previews.length ? draft.previews : anchor && anchor.classList.contains('cal-draft') ? [anchor] : [];
    const preview = previews.find((p) => !p.classList.contains('is-chip')) || null; // the timed block (its times can change)
    const title = h('input', { class: 'cal-new-title', placeholder: 'Untitled', 'aria-label': 'Title', spellcheck: 'true' });
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
    const untilIn = h('input', { type: 'date', class: 'cal-pop-select cal-new-until', value: state.endKey || state.key, min: state.key, 'aria-label': 'Until' });
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
      title.placeholder = 'Untitled';
      drawPickers();
      for (const p of previews) {
        p.setAttribute('style', `${(p.getAttribute('style') || '').replace(/background[^;]*;?|border-left[^;]*;?/g, '')}; ${this.paint({ ...state, title: state.title || 'x', color: null })}`);
        p.querySelector('.cal-event-title').textContent = state.title.trim() || 'Untitled';
        p.classList.toggle('is-task', state.kind === 'task');
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
      const text = title.value.trim() || 'Untitled';
      const { key } = state;
      const endDay = untilIn.value && untilIn.value > key ? untilIn.value : null;
      const start = state.allDay ? 0 : state.start;
      // Same-day events end after they start; multi-day ones can end earlier in the day.
      const end = state.allDay ? 24 * 60 : (endDay ? state.end : Math.max(state.end, start + SNAP));
      if (state.kind === 'task') {
        if (!this.showTasks) setTimeout(() => this.flash('Task saved (tasks are hidden)'), 0);
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
    this.placePopover(pop, anchor, () => {
      for (const p of previews) p.remove();
      this.clearDrafts();
    });
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
