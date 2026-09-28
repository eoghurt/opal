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
  parseEvents, formatEvent, replaceEvent, insertEvent, layoutColumns, EVENT_COLORS, isDark,
  parseSeries, formatSeries, occurrences, appendSeries,
} from '../calendar/events.js';
import { RULES, describeRule, shiftKey } from '../calendar/repeat.js';

const HOUR = 52; // pixels per hour
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
  constructor(container, { date, mode, readDay, writeDay, readRepeats, writeRepeats, noteDays, openDayNote, openLink, onChange, loadTasks, toggleTask, openTasks }) {
    this.container = container;
    this.date = date || new Date();
    this.mode = mode || 'day';
    this.io = {
      readDay, writeDay, noteDays, openDayNote, openLink, toggleTask, openTasks,
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
    this.tasks = await this.io.loadTasks();
    this.render();
  }

  reload() {
    if (this.dragging) return; // finish the drag first
    return this.load();
  }

  go(date, mode = this.mode) {
    this.date = date;
    this.mode = mode;
    this.scrolled = false;
    this.io.onChange({ date: this.date, mode: this.mode });
    this.render();
    this.load();
  }

  // ---------- Drawing ----------

  render() {
    this.closePopover();
    const scroll = this.scrollEl ? this.scrollEl.scrollTop : null;
    const keys = this.visibleKeys();
    const first = keyToDate(keys[0]);
    const last = keyToDate(keys[keys.length - 1]);

    const month = this.mode === 'month';
    const title = this.mode === 'day'
      ? `${weekday(this.date)}.`
      : month
        ? `${this.date.toLocaleDateString(undefined, { month: 'long' })}.`
        : `${first.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`;
    const subtitle = this.mode === 'day' ? longDate(this.date) : month ? String(this.date.getFullYear()) : `Week of ${longDate(first)}`;
    const shift = (steps) => (month
      ? new Date(this.date.getFullYear(), this.date.getMonth() + steps, 1)
      : addDays(this.date, steps * (this.mode === 'day' ? 1 : 7)));
    const modes = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
    const addKey = month ? (keys.includes(dayKey(new Date())) ? dayKey(new Date()) : dayKey(new Date(this.date.getFullYear(), this.date.getMonth(), 1))) : keys[0];

    const head = h('section', { class: 'home-head cal-head' },
      h('div', { class: 'home-title' },
        h('span', { class: 'mono-label' }, `Calendar · ${modes.find(([k]) => k === this.mode)[1]}`),
        h('h1', { class: 'display home-h1 cal-h1' }, title),
        h('p', { class: 'home-desc' }, subtitle)),
      h('div', { class: 'cal-controls' },
        h('div', { class: 'cal-segment', role: 'group', 'aria-label': 'View' },
          modes.map(([key, label]) => h('button', {
            class: `cal-seg${this.mode === key ? ' is-on' : ''}`,
            'aria-pressed': String(this.mode === key),
            onclick: () => this.go(this.date, key),
          }, label))),
        h('div', { class: 'cal-nav' },
          h('button', { class: 'cal-navbtn', 'aria-label': 'Previous', onclick: () => this.go(shift(-1)) }, '‹'),
          h('button', { class: 'cal-navbtn cal-today', onclick: () => this.go(new Date()) }, 'Today'),
          h('button', { class: 'cal-navbtn', 'aria-label': 'Next', onclick: () => this.go(shift(1)) }, '›')),
        h('button', { class: 'home-action is-primary cal-add', onclick: () => this.createAt(addKey, this.defaultStart(addKey)) }, '+ Event')),
    );

    const rail = this.renderRail(keys);
    const body = h('div', { class: 'cal-body' }, rail, month ? this.renderMonth(keys) : this.renderGrid(keys));
    this.root.replaceChildren(head, body);
    makePanel(rail, { id: 'cal-rail', side: 'left', label: 'Month', width: 260, min: 220, max: 420 });

    if (month) return;
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

    const allDayRow = h('div', { class: 'cal-allday' },
      h('span', { class: 'cal-gutter mono-label' }, 'All day'),
      keys.map((key) => {
        const cell = h('div', { class: 'cal-allday-cell', 'data-key': key });
        cell.addEventListener('click', (event) => {
          if (event.target === cell) this.createAllDay(key);
        });
        // Tasks due this day (from the Tasks lists).
        for (const t of this.tasks.filter((task) => task.due === key)) {
          cell.append(h('button', {
            class: `cal-chip cal-task${t.done ? ' is-done' : ''}`,
            onclick: (event) => this.showTaskPopover(t, event.currentTarget),
          }, h('span', { class: 'cal-task-box', 'aria-hidden': 'true' }, t.done ? '✓' : ''), `${t.time ? `${t.time} ` : ''}${t.title}`));
        }
        for (const e of (this.days[key]?.events || []).filter((ev) => ev.allDay)) {
          cell.append(this.chipEl(e, h('span', null, `${e.repeating ? '↻ ' : ''}${e.title}`)));
        }
        return cell;
      }));

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

  renderDayColumn(key, isToday) {
    const column = h('div', { class: `cal-day${isToday ? ' is-today' : ''}`, 'data-key': key });
    column.addEventListener('click', (event) => {
      if (event.target !== column) return;
      const minutes = snap((event.offsetY / MINUTE) - 15);
      this.createAt(key, Math.max(0, Math.min(minutes, 23 * 60)));
    });
    const events = layoutColumns((this.days[key]?.events || []).map((e) => ({ ...e })));
    for (const event of events) column.append(this.eventEl(event));
    return column;
  }

  eventEl(event) {
    const width = 100 / event.cols;
    const short = event.end - event.start <= 30;
    const el = h('div', {
      class: `cal-event${short ? ' is-short' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `${event.title}, ${clock(event.start)} to ${clock(event.end)}${event.repeating ? `, repeats ${event.rule}` : ''}`,
      style: `top: ${event.start * MINUTE}px; height: ${Math.max(18, (event.end - event.start) * MINUTE - 2)}px; left: calc(${event.col * width}% + 2px); width: calc(${width}% - 5px); ${this.paint(event)}`,
    },
    h('span', { class: 'cal-event-time' }, `${clock(event.start)}–${clock(event.end)}`),
    h('span', { class: 'cal-event-title' }, event.repeating ? h('span', { class: 'cal-repeat-mark', title: describeRule(event.rule, event.from) }, '↻ ') : null, event.title),
    event.link && !short ? h('span', { class: 'cal-event-link' }, `→ ${event.link}`) : null,
    h('span', { class: 'cal-resize', 'aria-hidden': 'true' }));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.showPopover(event, el);
      }
    });
    this.makeDraggable(el, event);
    return el;
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
      const events = (this.days[key]?.events || []).slice().sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
      const tasks = this.tasks.filter((t) => t.due === key);
      const items = [
        ...tasks.map((t) => h('button', {
          class: `cal-chip cal-task${t.done ? ' is-done' : ''}`,
          onclick: (event) => this.showTaskPopover(t, event.currentTarget),
        }, h('span', { class: 'cal-task-box', 'aria-hidden': 'true' }, t.done ? '✓' : ''), h('span', null, t.title))),
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
        if (event.target === cell) this.createAt(key, this.defaultStart(key));
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
    let dragged = false;
    chip.addEventListener('click', () => {
      if (dragged) {
        dragged = false;
        return;
      }
      this.showPopover(event, chip);
    });
    chip.addEventListener('pointerdown', (down) => {
      if (down.button !== 0) return;
      chip.setPointerCapture(down.pointerId);
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
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset && n.dataset.key && n !== chip);
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
        if (target && target.dataset.key !== event.day) this.moveEvent(event, { day: target.dataset.key, start: event.start, end: event.end });
      };
      chip.addEventListener('pointermove', move);
      chip.addEventListener('pointerup', up);
      chip.addEventListener('pointercancel', up);
    });
    return chip;
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

  paint(event) {
    const parts = [`background: ${this.fillOf(event)}`];
    if (event.primary && isDark(EVENT_COLORS[event.primary])) parts.push('color: #FBF9F4');
    if (event.secondary) parts.push(`border-left: 6px solid ${EVENT_COLORS[event.secondary]}`);
    return parts.join('; ');
  }

  placeNowLine() {
    if (!this.inner) return;
    this.inner.querySelectorAll('.cal-now').forEach((n) => n.remove());
    const now = new Date();
    const column = this.inner.querySelector(`.cal-day[data-key="${dayKey(now)}"]`);
    if (!column) return;
    const minutes = now.getHours() * 60 + now.getMinutes();
    column.append(h('span', { class: 'cal-now', style: `top: ${minutes * MINUTE}px`, 'aria-hidden': 'true' }));
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
          this.showPopover(event, el);
          return;
        }
        if (next.day === event.day && next.start === event.start && next.end === event.end) return;
        this.moveEvent(event, next);
      };

      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  // ---------- Popover ----------

  showPopover(event, anchor) {
    this.closePopover();
    // Two rows of 20: the fill (primary) and the accent stripe (secondary).
    const picker = (label, current, onPick, allowNone) => h('div', { class: 'cal-picker' },
      h('span', { class: 'mono-label' }, label),
      h('div', { class: 'cal-swatches', role: 'radiogroup', 'aria-label': label },
        allowNone ? h('button', {
          class: `cal-swatch is-none${!current ? ' is-on' : ''}`,
          role: 'radio',
          'aria-checked': String(!current),
          'aria-label': 'No accent',
          title: 'None',
          onclick: () => onPick(null),
        }) : null,
        Object.entries(EVENT_COLORS).map(([name, hex]) => h('button', {
          class: `cal-swatch${current === name ? ' is-on' : ''}`,
          role: 'radio',
          'aria-checked': String(current === name),
          'aria-label': name,
          title: name,
          style: `background: ${hex}`,
          onclick: () => onPick(name),
        }))));
    const swatches = h('div', { class: 'cal-pickers' },
      picker('Primary · fill', event.primary, (name) => this.updateEvent(event, { primary: name, color: null }), false),
      picker('Secondary · accent', event.secondary, (name) => this.updateEvent(event, { secondary: name }), true));

    // Repeat: a menu of rules, plus an optional last day for a series.
    const from = event.repeating ? event.from : event.day;
    const repeatMenu = h('select', { class: 'cal-pop-select', 'aria-label': 'Repeat' },
      h('option', { value: '' }, 'Does not repeat'),
      RULES.map((rule) => h('option', { value: rule }, describeRule(rule, from))));
    repeatMenu.value = event.repeating ? event.rule : '';
    repeatMenu.addEventListener('change', () => this.setRepeat(event, repeatMenu.value || null));
    const until = event.repeating ? h('input', { type: 'date', class: 'cal-pop-select', value: event.until || '', min: event.from, 'aria-label': 'Repeat until' }) : null;
    if (until) until.addEventListener('change', () => this.updateEvent(event, { until: until.value || null }));

    const pop = h('div', { class: 'cal-pop', role: 'dialog', 'aria-label': event.title },
      h('span', { class: 'mono-label' }, event.allDay ? 'All day' : `${clock(event.start)} – ${clock(event.end)}`),
      h('span', { class: 'display cal-pop-title' }, event.title),
      swatches,
      h('div', { class: 'cal-pop-repeat' },
        h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Repeat'), repeatMenu),
        until ? h('label', { class: 'cal-pop-row' }, h('span', { class: 'mono-label' }, 'Until'), until) : null,
        event.repeating ? h('span', { class: 'hand cal-pop-hint' }, 'name & colour changes apply to every repeat') : null),
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

  showTaskPopover(task, anchor) {
    this.closePopover();
    const pop = h('div', { class: 'cal-pop', role: 'dialog', 'aria-label': task.title },
      h('span', { class: 'mono-label' }, `Task · ${task.list}${task.time ? ` · ${task.time}` : ''}`),
      h('span', { class: 'display cal-pop-title' }, task.title),
      task.details.length ? h('span', { class: 'serif-i' }, task.details.join(' ')) : null,
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

  createAt(key, start) {
    return this.create(key, { allDay: false, start, end: Math.min(24 * 60, start + 60) });
  }

  createAllDay(key) {
    return this.create(key, { allDay: true, start: 0, end: 24 * 60 });
  }

  async create(key, when) {
    const label = when.allDay ? `New all-day event · ${weekday(keyToDate(key))}` : `New event · ${weekday(keyToDate(key))} ${clock(when.start)}`;
    const text = await askName(label, 'What’s happening? [[links]] work too');
    if (!text) return;
    const line = formatEvent({ ...when, text, color: null });
    await this.change(async () => {
      await this.io.writeDay(key, insertEvent(await this.freshText(key), line, this.dateLabel(key)));
    });
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
    const updated = { ...event, start: next.start, end: next.end };
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
