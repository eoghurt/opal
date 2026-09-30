// The vault's home page: widgets you arrange yourself — a clock, today's
// plan, flashcards, the timer, recent pages, words written, and the
// Logbook's numbers, activity, folders and busiest days.
//
// Which widgets show, in what order and size, is kept in the vault's hidden
// root .opal.md as a list property, so it travels with the vault:
//   opal-home:
//     - clock
//     - today wide
//     - numbers full
//
//   const home = new HomeWidgets(slot, { layout, editing, io })
//   io: saveLayout(items), onEditing(on), files(), openFile(path), openFolder(path),
//       openCalendarDay(key), openTasks(), openReview(), openSettings(section),
//       loadDayEvents(key), loadTasks(), toggleTask(task), listCards(),
//       readLogbook(), readFile(path), timer (the PrepTimer), bookmarks (see bookmarks.js)
//   home.destroy()

import { h, icon } from '../ui.js';
import { LogbookView } from './logbook-view.js';
import { BookmarkList } from '../bookmarks.js';
import { renderHeatmap } from '../heatmap.js';
import { showMenu } from '../context-menu.js';
import { noteName, relativeDay } from '../format.js';
import { clock, dayKey, addDays, startOfWeek } from '../calendar/events.js';
import { dueSides, todayKey } from '../flashcards/schedule.js';

export const WIDGETS = [
  { id: 'clock', name: 'Clock', icon: 'clock', size: 'small', desc: 'The time and date.' },
  { id: 'today', name: 'Today', icon: 'calendar', size: 'wide', desc: 'Today’s events, and tasks due or overdue.' },
  { id: 'flashcards', name: 'Flashcards', icon: 'review', size: 'small', desc: 'Cards due today and your decks.' },
  { id: 'timer', name: 'Timer', icon: 'timer', size: 'small', desc: 'Start a countdown or a Pomodoro.' },
  { id: 'recent', name: 'Recent pages', icon: 'note', size: 'wide', desc: 'The notes you changed last.' },
  { id: 'bookmarks', name: 'Bookmarks', icon: 'bookmark', size: 'small', desc: 'Your bookmarked notes, folders and files.' },
  { id: 'writing', name: 'Writing', icon: 'pen', size: 'small', desc: 'Words written today and this week.' },
  { id: 'heatmap', name: 'Heatmap', icon: 'grid', size: 'wide', desc: 'A heatmap from one of your notes — runs, habits, films… (a tracker block).' },
  { id: 'numbers', name: 'Numbers', icon: 'chart', size: 'full', desc: 'Notes, events, tasks, words and timer time for a week, month or year.' },
  { id: 'activity', name: 'Activity', icon: 'activity', size: 'full', desc: 'Which days you worked; click one to see what happened.' },
  { id: 'places', name: 'Where you worked', icon: 'folder', size: 'wide', desc: 'Your busiest folders.' },
  { id: 'busiest', name: 'Busiest days', icon: 'chart', size: 'wide', desc: 'Activity across the period.' },
];

const BY_ID = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
const SIZES = [['small', 'S', 'Small — a quarter of the width'], ['wide', 'M', 'Wide — half'], ['full', 'L', 'Full width']];
const LOGBOOK_PARTS = { numbers: 'tiles', activity: 'activity', places: 'places', busiest: 'busiest' };

export const DEFAULT_LAYOUT = ['clock small', 'today wide', 'flashcards small', 'timer small', 'recent small', 'bookmarks small', 'writing small', 'numbers full', 'activity full', 'places wide', 'busiest wide'];

// The saved list → [{ id, size }] (unknown or repeated widgets are skipped).
export function parseLayout(list) {
  const items = [];
  const seen = new Set();
  for (const entry of Array.isArray(list) ? list : DEFAULT_LAYOUT) {
    const [id, size] = String(entry).trim().split(/\s+/);
    if (!BY_ID[id] || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, size: SIZES.some(([s]) => s === size) ? size : BY_ID[id].size });
  }
  return items;
}

export function formatLayout(items) {
  return items.map((w) => `${w.id} ${w.size}`);
}

function greeting(date) {
  const hour = date.getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function ago(ms) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 12) return `${Math.round(minutes / 60)} h ago`;
  return relativeDay(ms);
}

function empty(text) {
  return h('p', { class: 'widget-empty' }, text);
}

export class HomeWidgets {
  constructor(slot, { layout, editing, io }) {
    this.slot = slot;
    this.items = parseLayout(layout);
    this.editing = Boolean(editing);
    this.io = io;
    this.cleanups = [];
    this.dragging = null;
    this.render();
  }

  destroy() {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    if (this.logbook) this.logbook.destroy();
    this.logbook = null;
  }

  // Other things changed (a note saved, a card reviewed, a timer session): redraw.
  reload() {
    this.render();
  }

  save() {
    this.io.saveLayout(this.items);
  }

  setEditing(on) {
    this.editing = on;
    this.io.onEditing(on);
    this.render();
  }

  render() {
    this.destroy();
    const head = h('div', { class: 'widgets-head' },
      h('span', { class: 'mono-label' }, this.editing ? 'Arrange your home page' : 'Home'),
      h('span', { class: 'grow' }),
      this.editing
        ? h('button', { class: 'widgets-btn is-primary', onclick: () => this.setEditing(false) }, icon('check', 14), 'Done')
        : h('button', { class: 'widgets-btn', title: 'Add, remove, resize and reorder widgets', onclick: () => this.setEditing(true) }, icon('grid', 14), 'Customize'));
    const grid = h('div', { class: `widgets${this.editing ? ' is-editing' : ''}` });
    const logbookSlots = {};
    for (const [index, item] of this.items.entries()) {
      const def = BY_ID[item.id];
      const body = h('div', { class: 'widget-body' });
      const tools = h('div', { class: 'widget-tools' });
      const el = h('section', { class: `widget is-${item.size} widget-${item.id}`, 'data-widget': item.id, 'aria-label': def.name },
        h('header', { class: 'widget-head' },
          this.editing ? h('span', { class: 'widget-grip', title: 'Drag to move' }, icon('drag', 14)) : null,
          icon(def.icon, 14),
          h('span', { class: 'widget-name' }, def.name),
          h('span', { class: 'grow' }),
          tools,
          this.editing ? this.editTools(item, index) : null),
        body);
      if (this.editing) this.makeDraggable(el, index);
      grid.append(el);
      if (LOGBOOK_PARTS[item.id]) {
        logbookSlots[LOGBOOK_PARTS[item.id]] = body;
        if (!logbookSlots.controls) logbookSlots.controls = tools;
      } else {
        this[`fill_${item.id}`](body, tools);
      }
    }
    const parts = [head, grid];
    if (this.editing) {
      const missing = WIDGETS.filter((w) => !this.items.some((i) => i.id === w.id));
      parts.push(h('div', { class: 'widgets-add' },
        h('span', { class: 'mono-label' }, missing.length ? 'Add a widget' : 'Every widget is on your home page'),
        h('div', { class: 'widgets-add-list' }, missing.map((w) => h('button', {
          class: 'widgets-add-btn',
          title: w.desc,
          onclick: () => {
            this.items.push({ id: w.id, size: w.size });
            this.save();
            this.render();
          },
        }, icon('plus', 13), icon(w.icon, 14), w.name)))));
    }
    if (!this.items.length && !this.editing) parts.push(empty('No widgets — press Customize to add some.'));
    this.slot.replaceChildren(...parts);
    if (Object.keys(logbookSlots).some((k) => k !== 'controls')) this.mountLogbook(logbookSlots);
  }

  // S / M / L and × on each widget while arranging.
  editTools(item, index) {
    return h('span', { class: 'widget-edit' },
      h('span', { class: 'widget-sizes', role: 'group', 'aria-label': 'Size' }, SIZES.map(([size, label, title]) => h('button', {
        class: `widget-size${item.size === size ? ' is-on' : ''}`,
        title,
        'aria-pressed': String(item.size === size),
        onclick: () => {
          item.size = size;
          this.save();
          this.render();
        },
      }, label))),
      h('button', {
        class: 'widget-remove',
        title: 'Remove from the home page',
        'aria-label': `Remove ${BY_ID[item.id].name}`,
        onclick: () => {
          this.items.splice(index, 1);
          this.save();
          this.render();
        },
      }, icon('x', 14)));
  }

  makeDraggable(el, index) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      this.dragging = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.items[index].id);
      el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => {
      this.dragging = null;
      el.classList.remove('is-dragging');
      this.slot.querySelectorAll('.drop-before, .drop-after').forEach((w) => w.classList.remove('drop-before', 'drop-after'));
    });
    el.addEventListener('dragover', (e) => {
      if (this.dragging === null || this.dragging === index) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const after = e.clientX > box.left + box.width / 2;
      el.classList.toggle('drop-after', after);
      el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      if (this.dragging === null || this.dragging === index) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const after = e.clientX > box.left + box.width / 2;
      const [moved] = this.items.splice(this.dragging, 1);
      let to = index + (after ? 1 : 0);
      if (this.dragging < to) to -= 1;
      this.items.splice(to, 0, moved);
      this.dragging = null;
      this.save();
      this.render();
    });
  }

  // ---------- The widgets ----------

  fill_clock(body) {
    const time = h('span', { class: 'display widget-clock-time' });
    const seconds = h('span', { class: 'widget-clock-sec' });
    const date = h('span', { class: 'widget-clock-date' });
    const hello = h('span', { class: 'hand widget-clock-hello' });
    const tick = () => {
      const now = new Date();
      time.textContent = clock(now.getHours() * 60 + now.getMinutes());
      seconds.textContent = String(now.getSeconds()).padStart(2, '0');
      date.textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
      hello.textContent = greeting(now);
    };
    tick();
    const timer = setInterval(tick, 1000);
    this.cleanups.push(() => clearInterval(timer));
    body.append(hello, h('span', { class: 'widget-clock-row' }, time, seconds), date);
  }

  async fill_today(body, tools) {
    const key = dayKey(new Date());
    tools.append(h('button', { class: 'widget-link', onclick: () => this.io.openCalendarDay(key) }, 'Calendar →'));
    body.append(empty('Loading…'));
    let events = [];
    let tasks = [];
    try {
      [events, tasks] = await Promise.all([this.io.loadDayEvents(key), this.io.loadTasks()]);
    } catch {
      // Show what we have.
    }
    if (!body.isConnected) return;
    const today = todayKey();
    const due = tasks.filter((t) => !t.done && t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due) || String(a.time || '').localeCompare(String(b.time || '')));
    const rows = [];
    for (const e of events.slice().sort((a, b) => (b.allDay - a.allDay) || a.start - b.start)) {
      rows.push(h('button', { class: 'widget-row', onclick: () => this.io.openCalendarDay(key) },
        h('span', { class: 'widget-row-time' }, e.allDay ? 'all day' : clock(e.start)),
        h('span', { class: 'widget-row-title' }, e.title)));
    }
    for (const t of due) {
      const box = h('input', { type: 'checkbox', class: 'widget-check', 'aria-label': `Done: ${t.title}` });
      box.addEventListener('change', async () => {
        box.disabled = true;
        try {
          await this.io.toggleTask(t);
        } finally {
          this.render();
        }
      });
      rows.push(h('label', { class: 'widget-row is-task' },
        box,
        h('span', { class: 'widget-row-title' }, t.title),
        h('span', { class: `widget-row-meta${t.due < today ? ' is-late' : ''}` }, t.due < today ? `overdue · ${relativeDay(new Date(`${t.due}T12:00`).getTime())}` : t.time || t.list)));
    }
    body.replaceChildren(...(rows.length ? rows : [empty('Nothing planned today.')]));
  }

  async fill_flashcards(body) {
    body.append(empty('Loading…'));
    let cards = [];
    try {
      cards = await this.io.listCards();
    } catch {
      // No cards then.
    }
    if (!body.isConnected) return;
    const today = todayKey();
    const due = cards.filter((c) => dueSides(c, today).length);
    const count = due.reduce((n, c) => n + dueSides(c, today).length, 0);
    const decks = new Map();
    for (const card of due) for (const deck of card.decks) decks.set(deck, (decks.get(deck) || 0) + dueSides(card, today).length);
    // Newest cards first: the ones in the notes changed most recently.
    const modified = new Map(this.io.files().map((f) => [f.path, f.modified || 0]));
    const next = due.slice().sort((a, b) => (modified.get(b.path) || 0) - (modified.get(a.path) || 0)).slice(0, 3);
    body.replaceChildren(...[
      h('div', { class: 'widget-big-row' },
        h('span', { class: 'display widget-big' }, String(count)),
        h('span', { class: 'widget-big-label' }, count === 1 ? 'card due' : 'cards due', h('br'), `${cards.length} in your notes`)),
      decks.size ? h('div', { class: 'widget-chips' }, [...decks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([deck, n]) => h('span', { class: 'widget-chip' }, `${deck.split('/').pop()} · ${n}`))) : null,
      next.length ? h('ul', { class: 'widget-cards' }, next.map((c) => h('li', null, c.question))) : null,
      count ? h('button', { class: 'widgets-btn is-primary widget-go', onclick: () => this.io.openReview() }, 'Review now') : empty(cards.length ? 'All caught up.' : 'Write Question::Answer in a note to make a card.'),
    ].filter(Boolean));
  }

  fill_timer(body) {
    const timer = this.io.timer;
    const draw = (state) => {
      if (!state) {
        body.replaceChildren(h('div', { class: 'widget-timer' }, timer.startChoices(() => {})));
        return;
      }
      const left = state.left;
      const text = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
      const label = state.mode === 'pomodoro'
        ? (state.waiting ? `${state.waiting === 'focus' ? 'Focus' : 'Break'} next` : state.phase === 'focus' ? `Focus ${state.round} of ${state.rounds}` : 'Break')
        : 'Prep timer';
      body.replaceChildren(h('div', { class: `widget-timer is-running${state.phase && state.phase !== 'focus' ? ' is-break' : ''}` },
        h('span', { class: 'widget-timer-label' }, label),
        state.waiting ? null : h('span', { class: 'display widget-timer-time' }, text),
        state.total && !state.waiting ? h('span', { class: 'widget-timer-bar' }, h('span', { style: `width: ${100 - Math.round((left / state.total) * 100)}%` })) : null,
        h('div', { class: 'widget-timer-actions' }, timer.runningChoices(() => {}))));
    };
    // Redraw the choices only when the state changes kind (not every second).
    let lastKind = '';
    const listener = (state) => {
      const kind = state ? `${state.mode}:${state.phase}:${state.waiting}` : 'idle';
      if (kind !== lastKind) {
        lastKind = kind;
        draw(state);
      } else if (state) {
        const time = body.querySelector('.widget-timer-time');
        const bar = body.querySelector('.widget-timer-bar span');
        if (time) time.textContent = `${String(Math.floor(state.left / 60)).padStart(2, '0')}:${String(state.left % 60).padStart(2, '0')}`;
        if (bar && state.total) bar.style.width = `${100 - Math.round((state.left / state.total) * 100)}%`;
      }
    };
    listener(timer.state());
    this.cleanups.push(timer.onChange(listener));
  }

  fill_recent(body) {
    const notes = this.io.files()
      .filter((f) => !f.quiet && /\.md$/i.test(f.name))
      .sort((a, b) => (b.modified || 0) - (a.modified || 0))
      .slice(0, 8);
    body.replaceChildren(...(notes.length ? notes.map((f) => h('button', { class: 'widget-row', title: f.path, onclick: () => this.io.openFile(f.path) },
      icon('note', 14),
      h('span', { class: 'widget-row-title' }, noteName(f.path)),
      h('span', { class: 'widget-row-meta' }, [f.path.includes('/') ? f.path.split('/').slice(0, -1).pop() : null, ago(f.modified)].filter(Boolean).join(' · ')))) : [empty('No notes yet.')]));
  }

  fill_bookmarks(body) {
    const list = h('div', { class: 'widget-bm-list' });
    body.append(list);
    new BookmarkList(list, { io: { ...this.io.bookmarks, save: async () => { await this.io.bookmarks.save(); } } });
  }

  async fill_heatmap(body, tools) {
    const io = this.io;
    body.append(empty('Counting…'));
    let notes = [];
    let chosen = null;
    try {
      [notes, chosen] = await Promise.all([io.trackerNotes(), io.heatmapChoice()]);
    } catch {
      // Nothing to show then.
    }
    if (!body.isConnected) return;
    if (!notes.length) {
      body.replaceChildren(
        empty('Show runs, habits, films or journaling as a year of squares. Add a heatmap to any note with its ribbon’s Heatmap button.'),
        h('button', { class: 'widgets-btn widget-go', onclick: () => io.makeHeatmapNote() }, icon('plus', 13), 'Make an example note'));
      return;
    }
    const note = notes.find((n) => n.path === chosen) || notes[0];
    tools.append(h('button', {
      class: 'widget-link',
      onclick: (e) => showMenu(e, {
        title: 'Show the heatmap from…',
        items: notes.map((n) => ({ label: n.title, hint: n.path.replace(/\.md$/i, ''), onSelect: () => io.setHeatmapChoice(n.path) })),
      }),
    }, 'Choose…'));
    let offset = 0;
    let data;
    try {
      data = await io.trackerData(note.source);
    } catch (err) {
      body.replaceChildren(empty(`Can't draw ${note.title}: ${String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`));
      return;
    }
    const draw = () => body.replaceChildren(
      renderHeatmap(data, { openFile: io.openFile, offset, onOffset: (n) => { offset = n; draw(); } }),
      h('button', { class: 'widget-link heat-source', onclick: () => io.openFile(note.path) }, `From ${note.path.replace(/\.md$/i, '')} →`));
    if (body.isConnected) draw();
  }

  async fill_writing(body) {
    let words = {};
    try {
      words = (await this.io.readLogbook()).words || {};
    } catch {
      // Nothing recorded yet.
    }
    if (!body.isConnected) return;
    const now = new Date();
    const today = words[dayKey(now)] || 0;
    let week = 0;
    for (let d = startOfWeek(now); d <= now; d = addDays(d, 1)) week += words[dayKey(d)] || 0;
    // Days in a row with some writing (today can still be empty).
    let streak = 0;
    for (let d = words[dayKey(now)] ? now : addDays(now, -1); words[dayKey(d)]; d = addDays(d, -1)) streak++;
    body.replaceChildren(
      h('div', { class: 'widget-big-row' },
        h('span', { class: 'display widget-big' }, today.toLocaleString()),
        h('span', { class: 'widget-big-label' }, today === 1 ? 'word today' : 'words today')),
      h('div', { class: 'widget-stats' },
        h('span', null, h('b', null, week.toLocaleString()), ' this week'),
        h('span', null, h('b', null, String(streak)), streak === 1 ? ' day in a row' : ' days in a row')));
  }

  // One Logbook for all its widgets (they share the week / month / year).
  mountLogbook(slots) {
    this.logbook = new LogbookView(null, {
      kind: this.logbookState ? this.logbookState.kind : 'month',
      date: this.logbookState ? this.logbookState.date : new Date(),
      slots,
      getFiles: () => this.io.files(),
      readFile: (path) => this.io.readFile(path),
      readLogbook: () => this.io.readLogbook(),
      openFile: (path) => this.io.openFile(path),
      openCalendarDay: (key) => this.io.openCalendarDay(key),
      openTasks: () => this.io.openTasks(),
      onChange: (state) => { this.logbookState = state; },
    });
  }
}
