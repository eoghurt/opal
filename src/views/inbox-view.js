// Inbox: one place for everything waiting on you.
//   • Jot things down fast — they go into Inbox.md (as "- [ ] thing ➕ date").
//     Later, turn each into a task, a note of its own, or tick/delete it.
//   • Overdue tasks, today's events and tasks, the week ahead, tasks with no date.
//   • Loose "- [ ]" checklist items sitting in any note, tickable right here.
// Nothing is stored anywhere but the notes themselves.

import { h, askName } from '../ui.js';
import { parseTasks, replaceTask, addTask, toggleTask, dueLabel, todayKey } from '../tasks/tasks.js';
import { clock, colorHex } from '../calendar/events.js';
import { shiftKey } from '../calendar/repeat.js';

export const INBOX_PATH = 'Inbox.md';
const INBOX_LIST = 'Inbox';
const SHOW = { undated: 6, checklists: 12 };

function ago(key) {
  if (!key) return '';
  const days = Math.round((new Date(`${todayKey()}T12:00`) - new Date(`${key}T12:00`)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}

export class InboxView {
  // io: readInbox() → text|null, writeInbox(text), loadTasks() → every task,
  //     listNames(), toggleTask(task), addToList(list, task), openTasks(),
  //     loadEvents(key) → that day's events, openCalendarDay(key),
  //     loadChecklists(), tickChecklist(item), openAt(path, line),
  //     makeNote(title, body) → opens the new note
  constructor(container, io) {
    this.io = io;
    this.expanded = new Set();
    this.writing = Promise.resolve();
    this.root = h('div', { class: 'inbox' });
    container.replaceChildren(this.root);
    this.refocus = true; // ready to type straight away
    this.draw({ loading: true });
    this.load();
  }

  async load() {
    const today = todayKey();
    const [inboxText, tasks, events, checklists, cardsDue] = await Promise.all([
      this.io.readInbox(),
      this.io.loadTasks(),
      this.io.loadEvents(today),
      this.io.loadChecklists().catch(() => []),
      this.io.cardsDue ? this.io.cardsDue().catch(() => 0) : 0,
    ]);
    this.cardsDue = cardsDue;
    this.inboxText = inboxText || '';
    this.captured = parseTasks(this.inboxText, INBOX_LIST);
    this.tasks = tasks;
    this.events = events;
    this.checklists = checklists;
    this.draw();
  }

  reload() {
    if (this.root.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
    return this.load();
  }

  run(job) {
    this.writing = this.writing
      .then(job)
      .catch((err) => alert(`The Inbox couldn't save that.\n\n${err.message}`))
      .then(() => this.load());
    return this.writing;
  }

  changeInbox(makeText) {
    return this.run(async () => {
      const current = (await this.io.readInbox()) || '';
      await this.io.writeInbox(makeText(current));
    });
  }

  // ---------- Actions ----------

  capture(text) {
    const item = { title: text, done: false, due: null, time: null, starred: false, repeat: null, created: todayKey(), doneOn: null, details: [], subtasks: [] };
    return this.changeInbox((current) => addTask(current, item, INBOX_LIST));
  }

  toTask(item, list, due) {
    return this.run(async () => {
      // Into the list first, then out of the Inbox, so it's never lost.
      await this.io.addToList(list, { ...item, due: due || null, time: null, created: item.created, done: false });
      const current = (await this.io.readInbox()) || '';
      await this.io.writeInbox(replaceTask(current, item, null));
    });
  }

  async toNote(item) {
    const name = await askName('Turn into a note', 'Note name', item.title.slice(0, 80));
    if (!name) return;
    await this.run(async () => {
      await this.io.makeNote(name, [item.title, ...item.details].join('\n\n'));
      const current = (await this.io.readInbox()) || '';
      await this.io.writeInbox(replaceTask(current, item, null));
    });
  }

  // ---------- Drawing ----------

  draw({ loading = false } = {}) {
    // Keep the capture box's cursor (and anything half-typed) across redraws.
    const active = document.activeElement;
    const typing = active && this.root.contains(active) && active.classList.contains('inbox-capture-input') ? active.value : null;
    const today = todayKey();
    const open = (this.captured || []).filter((t) => !t.done);
    const doneToday = (this.captured || []).filter((t) => t.done && t.doneOn === today).length;
    const openTasks = (this.tasks || []).filter((t) => !t.done);
    const overdue = openTasks.filter((t) => t.due && t.due < today).sort((a, b) => a.due.localeCompare(b.due));
    const dueToday = openTasks.filter((t) => t.due === today).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    const weekEnd = shiftKey(today, 7);
    const soon = openTasks.filter((t) => t.due && t.due > today && t.due <= weekEnd).sort((a, b) => a.due.localeCompare(b.due) || (a.time || '99').localeCompare(b.time || '99'));
    const undated = openTasks.filter((t) => !t.due);
    const events = (this.events || []).slice().sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
    const checklists = this.checklists || [];
    const waiting = open.length + overdue.length + dueToday.length;

    const input = h('input', {
      class: 'inbox-capture-input',
      placeholder: 'Jot something down, then Enter…',
      'aria-label': 'Add to Inbox',
      spellcheck: 'true',
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && input.value.trim()) {
        const text = input.value.trim();
        input.value = '';
        this.refocus = true;
        this.capture(text);
      }
    });

    const head = h('section', { class: 'home-head inbox-head' },
      h('div', { class: 'home-title' },
        h('span', { class: 'mono-label' }, 'Inbox'),
        h('h1', { class: 'display home-h1' }, 'Inbox.'),
        h('p', { class: 'home-desc' }, loading ? 'looking…' : waiting ? `${waiting} thing${waiting === 1 ? '' : 's'} waiting${doneToday ? ` · ${doneToday} cleared today` : ''}` : 'all clear — nice.')),
      h('div', { class: 'inbox-capture' }, h('span', { class: 'mono-label' }, 'Capture'), input,
        h('span', { class: 'hand inbox-capture-hint' }, 'lands in Inbox.md — sort it later')));

    const sections = [];
    sections.push(this.section('Captured', open.length, open.length
      ? open.map((item) => this.capturedRow(item))
      : [h('p', { class: 'hand inbox-empty' }, 'nothing jotted down')], 'is-captured'));
    if (overdue.length) sections.push(this.section('Overdue', overdue.length, overdue.map((t) => this.taskRow(t, { overdue: true })), 'is-overdue'));
    if (this.cardsDue) {
      sections.push(this.section('Flashcards', this.cardsDue, [h('div', { class: 'inbox-row' },
        h('div', { class: 'inbox-line' },
          h('span', { class: 'inbox-dot', style: 'background: var(--c5)', 'aria-hidden': 'true' }),
          h('button', { class: 'inbox-text inbox-link', onclick: () => this.io.openReview() }, `${this.cardsDue} card${this.cardsDue === 1 ? '' : 's'} due for review`),
          h('span', { class: 'inbox-tag' }, 'Review')))]));
    }
    sections.push(this.section('Today', events.length + dueToday.length, [
      ...events.map((e) => this.eventRow(e)),
      ...dueToday.map((t) => this.taskRow(t)),
      ...(events.length + dueToday.length ? [] : [h('p', { class: 'hand inbox-empty' }, 'nothing planned today')]),
    ]));
    if (soon.length) sections.push(this.section('Next 7 days', soon.length, soon.map((t) => this.taskRow(t))));
    if (undated.length) sections.push(this.section('No date', undated.length, this.limited('undated', undated.map((t) => this.taskRow(t)))));
    if (checklists.length) sections.push(this.section('Checklists in notes', checklists.length, this.limited('checklists', checklists.map((c) => this.checklistRow(c)))));

    this.root.replaceChildren(head, h('div', { class: 'inbox-body' }, sections));
    if (this.refocus || typing !== null) {
      if (!loading) this.refocus = false;
      const box = this.root.querySelector('.inbox-capture-input');
      if (typing) box.value = typing;
      box.focus();
    }
  }

  section(title, count, rows, extra = '') {
    return h('section', { class: `inbox-section ${extra}` },
      h('div', { class: 'inbox-section-head' },
        h('h2', { class: 'display inbox-h2' }, title),
        h('span', { class: 'mono-label inbox-count' }, String(count))),
      h('div', { class: 'inbox-rows' }, rows));
  }

  // The first few rows, then "Show all N".
  limited(key, rows) {
    const limit = SHOW[key];
    if (rows.length <= limit || this.expanded.has(key)) return rows;
    return [...rows.slice(0, limit), h('button', {
      class: 'inbox-more mono-label',
      onclick: () => { this.expanded.add(key); this.draw(); },
    }, `Show all ${rows.length}`)];
  }

  check(done, label, onClick) {
    return h('button', {
      class: `task-check${done ? ' is-done' : ''}`,
      role: 'checkbox',
      'aria-checked': String(done),
      'aria-label': label,
      onclick: onClick,
    }, done ? '✓' : '');
  }

  capturedRow(item) {
    const lists = this.io.listNames();
    const listMenu = h('select', { class: 'inbox-select', 'aria-label': 'Task list' },
      (lists.length ? lists : ['My Tasks']).map((name) => h('option', { value: name }, name)));
    const date = h('input', { type: 'date', class: 'inbox-select', 'aria-label': 'Due date (optional)' });
    const moving = this.movingId === item.raw;
    return h('div', { class: `inbox-row is-captured${moving ? ' is-open' : ''}` },
      h('div', { class: 'inbox-line' },
        this.check(false, `Done: ${item.title}`, () => this.changeInbox((text) => toggleTask(text, item))),
        h('span', { class: 'inbox-text' }, item.title),
        h('span', { class: 'inbox-meta' }, ago(item.created)),
        h('div', { class: 'inbox-actions' },
          h('button', { class: 'task-col-btn', onclick: () => { this.movingId = moving ? null : item.raw; this.draw(); } }, '→ Task'),
          h('button', { class: 'task-col-btn', onclick: () => this.toNote(item) }, '→ Note'),
          h('button', { class: 'task-col-btn is-danger', 'aria-label': `Delete “${item.title}”`, onclick: () => this.changeInbox((text) => replaceTask(text, item, null)) }, '✕'))),
      moving ? h('div', { class: 'inbox-move' },
        h('span', { class: 'mono-label' }, 'Add to'), listMenu,
        h('span', { class: 'mono-label' }, 'Due'), date,
        h('button', {
          class: 'task-col-btn is-primary',
          onclick: () => { this.movingId = null; this.toTask(item, listMenu.value, date.value); },
        }, 'Add task'),
        h('button', { class: 'task-col-btn', onclick: () => { this.movingId = null; this.draw(); } }, 'Cancel')) : null);
  }

  taskRow(task, { overdue = false } = {}) {
    return h('div', { class: 'inbox-row' },
      h('div', { class: 'inbox-line' },
        this.check(false, `Done: ${task.title}`, () => this.run(() => this.io.toggleTask(task))),
        h('button', { class: 'inbox-text inbox-link', onclick: () => this.io.openTasks() }, task.starred ? `★ ${task.title}` : task.title),
        h('span', { class: `inbox-meta${overdue ? ' is-overdue' : ''}` }, task.due ? dueLabel(task.due, task.time) : ''),
        h('span', { class: 'inbox-tag' }, task.list)));
  }

  eventRow(event) {
    const color = event.primary ? colorHex(event.primary) : `var(--c${event.color || 3})`;
    return h('div', { class: 'inbox-row' },
      h('div', { class: 'inbox-line' },
        h('span', { class: 'inbox-dot', style: `background: ${color}`, 'aria-hidden': 'true' }),
        h('button', { class: 'inbox-text inbox-link', onclick: () => this.io.openCalendarDay(event.day) }, event.title),
        h('span', { class: 'inbox-meta' }, event.allDay ? 'all day' : `${clock(event.start)}–${clock(event.end)}`),
        h('span', { class: 'inbox-tag' }, 'Calendar')));
  }

  checklistRow(item) {
    const where = item.path.replace(/\.md$/i, '');
    return h('div', { class: 'inbox-row' },
      h('div', { class: 'inbox-line' },
        this.check(false, `Tick: ${item.text}`, () => this.run(() => this.io.tickChecklist(item))),
        h('button', { class: 'inbox-text inbox-link', onclick: () => this.io.openAt(item.path, item.line) }, item.text),
        h('span', { class: 'inbox-tag', title: item.path }, where.split('/').pop())));
  }
}
