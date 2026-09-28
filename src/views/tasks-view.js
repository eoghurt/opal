// Tasks: Google Tasks-style lists shown side by side. Tick to complete, click
// a task to edit its notes, due date, star and subtasks. Every change is
// written straight back to the list's note (see tasks/tasks.js).

import { h, askName } from '../ui.js';
import { makePanel } from '../panel.js';
import { parseTasks, replaceTask, addTask, dueLabel, isOverdue, todayKey, DEFAULT_LIST } from '../tasks/tasks.js';

const PREFS_KEY = 'opal.tasks';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered this time.
  }
}

const blankTask = (title) => ({ title, done: false, due: null, time: null, starred: false, doneOn: null, details: [], subtasks: [] });

export class TasksView {
  // io: listNames(), readList(name) → text|null, writeList(name, text),
  //     renameList(name, newName), deleteList(name)
  constructor(container, io) {
    this.io = io;
    const prefs = loadPrefs();
    this.hidden = new Set(prefs.hidden || []);
    this.sort = prefs.sort || 'mine';
    this.showStarred = Boolean(prefs.showStarred);
    this.openCompleted = new Set();
    this.lists = {}; // name → { text, tasks }
    this.editing = null; // { list, raw } of the task being edited
    this.writing = Promise.resolve();
    this.root = h('div', { class: 'tasks' });
    container.replaceChildren(this.root);
    this.load();
  }

  savePrefs() {
    savePrefs({ hidden: [...this.hidden], sort: this.sort, showStarred: this.showStarred });
  }

  async load() {
    const names = this.io.listNames();
    const loaded = await Promise.all(names.map(async (name) => [name, await this.io.readList(name)]));
    this.lists = {};
    for (const [name, text] of loaded) this.lists[name] = { text: text || '', tasks: parseTasks(text || '', name) };
    this.render();
  }

  reload() {
    if (this.root.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return; // don't interrupt typing
    return this.load();
  }

  // ---------- Writing ----------

  change(list, makeText) {
    this.writing = this.writing
      .then(async () => {
        const current = (await this.io.readList(list)) || '';
        await this.io.writeList(list, makeText(current));
      })
      .catch((err) => alert(`Couldn't save that task.\n\n${err.message}`))
      .then(() => this.load());
    return this.writing;
  }

  updateTask(task, patch, keepEditing = false) {
    const next = { ...task, ...patch };
    if (keepEditing) this.editing = { list: task.list, raw: null, title: next.title, due: next.due };
    return this.change(task.list, (text) => replaceTask(text, task, next));
  }

  toggle(task) {
    const done = !task.done;
    return this.updateTask(task, { done, doneOn: done ? todayKey() : null });
  }

  async addTo(list) {
    const title = await askName(`New task in ${list}`, 'What needs doing?');
    if (!title) return;
    await this.change(list, (text) => addTask(text, blankTask(title), list));
  }

  // ---------- Drawing ----------

  visibleLists() {
    const names = Object.keys(this.lists);
    return names.filter((n) => !this.hidden.has(n));
  }

  allTasks() {
    return Object.values(this.lists).flatMap((l) => l.tasks);
  }

  render() {
    const all = this.allTasks();
    const open = all.filter((t) => !t.done).length;
    const doneToday = all.filter((t) => t.done && t.doneOn === todayKey()).length;

    const head = h('section', { class: 'home-head' },
      h('div', { class: 'home-title' },
        h('span', { class: 'mono-label' }, `Tasks · ${Object.keys(this.lists).length} lists`),
        h('h1', { class: 'display home-h1' }, 'Tasks.'),
        h('p', { class: 'home-desc' }, `${open} to do${doneToday ? ` · ${doneToday} done today` : ''}`)),
      h('div', { class: 'cal-controls' },
        h('div', { class: 'cal-segment', role: 'group', 'aria-label': 'Order' },
          [['mine', 'My order'], ['date', 'By date']].map(([key, label]) => h('button', {
            class: `cal-seg${this.sort === key ? ' is-on' : ''}`,
            'aria-pressed': String(this.sort === key),
            onclick: () => { this.sort = key; this.savePrefs(); this.render(); },
          }, label))),
        h('button', { class: 'home-action is-primary cal-add', onclick: () => this.newList() }, '+ New list')));

    const rail = h('aside', { class: 'tasks-rail' },
      h('span', { class: 'mono-label side-label' }, h('span', null, 'Lists'), h('span', null, String(Object.keys(this.lists).length))),
      h('label', { class: 'tasks-rail-item' },
        h('input', { type: 'checkbox', checked: this.showStarred, onchange: (e) => { this.showStarred = e.target.checked; this.savePrefs(); this.render(); } }),
        h('span', null, '★ Starred'),
        h('span', { class: 'tasks-count' }, String(all.filter((t) => t.starred && !t.done).length))),
      Object.keys(this.lists).map((name) => h('label', { class: 'tasks-rail-item' },
        h('input', {
          type: 'checkbox',
          checked: !this.hidden.has(name),
          onchange: (e) => {
            if (e.target.checked) this.hidden.delete(name);
            else this.hidden.add(name);
            this.savePrefs();
            this.render();
          },
        }),
        h('span', null, name),
        h('span', { class: 'tasks-count' }, String(this.lists[name].tasks.filter((t) => !t.done).length)))),
      h('button', { class: 'dashed-button mono-label', onclick: () => this.newList() }, '+ New list'));

    const columns = [];
    if (this.showStarred) columns.push(this.column('★ Starred', all.filter((t) => t.starred), { starredView: true }));
    for (const name of this.visibleLists()) columns.push(this.column(name, this.lists[name].tasks));
    if (!Object.keys(this.lists).length) {
      columns.push(h('div', { class: 'tasks-empty' },
        h('p', { class: 'hand viewer-hand' }, 'no lists yet'),
        h('button', { class: 'home-action is-primary', onclick: () => this.addTo(DEFAULT_LIST) }, `+ Add a task to “${DEFAULT_LIST}”`)));
    }

    // Keep the cursor where it was across the redraw (e.g. in the date box).
    const active = document.activeElement;
    let refocus = null;
    if (active && this.root.contains(active) && active.closest('.task-editor')) {
      const same = [...this.root.querySelectorAll(`.task-editor .${active.classList[0]}`)];
      refocus = { cls: active.classList[0], index: same.indexOf(active), start: active.selectionStart, end: active.selectionEnd };
    }

    const board = h('div', { class: 'tasks-board' }, columns);
    const scroll = this.board ? this.board.scrollLeft : 0;
    this.root.replaceChildren(head, h('div', { class: 'tasks-body' }, rail, board));
    this.board = board;
    board.scrollLeft = scroll;
    if (refocus) {
      const target = this.root.querySelectorAll(`.task-editor .${refocus.cls}`)[refocus.index];
      if (target) {
        target.focus();
        try {
          if (refocus.start != null) target.setSelectionRange(refocus.start, refocus.end);
        } catch {
          // Date and time boxes don't have a text cursor.
        }
      }
    }
    makePanel(rail, { id: 'tasks-rail', side: 'left', label: 'Lists', width: 230, min: 180, max: 380 });
  }

  sorted(tasks) {
    if (this.sort !== 'date') return tasks;
    return tasks.slice().sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99'));
  }

  column(name, tasks, { starredView = false } = {}) {
    const open = this.sorted(tasks.filter((t) => !t.done));
    const done = tasks.filter((t) => t.done);
    const showDone = this.openCompleted.has(name);
    const menu = starredView ? null : h('div', { class: 'task-col-menu' },
      h('button', { class: 'task-col-btn', onclick: () => this.renameList(name), title: 'Rename list' }, 'Rename'),
      h('button', { class: 'task-col-btn', onclick: () => this.deleteList(name), title: 'Move this list’s note to the Trash' }, 'Delete'));

    return h('section', { class: 'task-col', 'aria-label': name },
      h('div', { class: 'task-col-head' },
        h('span', { class: 'display task-col-title' }, name),
        h('span', { class: 'mono-label' }, `${open.length}`),
        menu),
      starredView ? null : h('button', { class: 'task-add', onclick: () => this.addTo(name) }, h('span', { class: 'task-add-plus' }, '+'), 'Add a task'),
      h('div', { class: 'task-items' },
        open.length ? open.map((t) => this.taskEl(t, starredView))
          : h('p', { class: 'hand side-hint task-none' }, starredView ? 'star tasks to see them here' : 'all clear!')),
      done.length ? h('div', { class: 'task-done' },
        h('button', {
          class: 'task-done-toggle mono-label',
          'aria-expanded': String(showDone),
          onclick: () => {
            if (showDone) this.openCompleted.delete(name);
            else this.openCompleted.add(name);
            this.render();
          },
        }, `${showDone ? '▾' : '▸'} Completed (${done.length})`),
        showDone ? h('div', { class: 'task-items' }, done.map((t) => this.taskEl(t, starredView))) : null) : null);
  }

  isEditing(task) {
    const e = this.editing;
    if (!e || e.list !== task.list) return false;
    return e.raw ? e.raw === task.raw : e.title === task.title && e.due === task.due;
  }

  taskEl(task, showList) {
    const editing = this.isEditing(task);
    const subDone = task.subtasks.filter((s) => s.done).length;
    const row = h('div', { class: `task${task.done ? ' is-done' : ''}${editing ? ' is-editing' : ''}` },
      h('button', {
        class: `task-check${task.done ? ' is-done' : ''}`,
        role: 'checkbox',
        'aria-checked': String(task.done),
        'aria-label': task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`,
        onclick: () => this.toggle(task),
      }, task.done ? '✓' : ''),
      h('button', {
        class: 'task-main',
        onclick: () => {
          this.editing = editing ? null : { list: task.list, raw: task.raw };
          this.render();
          if (!editing) this.focusEditor();
        },
      },
      h('span', { class: 'task-title' }, task.title || 'Untitled'),
      task.details.length ? h('span', { class: 'task-details' }, task.details.join(' ')) : null,
      h('span', { class: 'task-meta' },
        task.due ? h('span', { class: `task-due${isOverdue(task) ? ' is-overdue' : ''}` }, isOverdue(task) ? `overdue · ${dueLabel(task.due, task.time)}` : dueLabel(task.due, task.time)) : null,
        task.subtasks.length ? h('span', { class: 'task-subcount' }, `☐ ${subDone}/${task.subtasks.length}`) : null,
        showList ? h('span', { class: 'task-list-name' }, task.list) : null)),
      h('button', {
        class: `task-star${task.starred ? ' is-on' : ''}`,
        'aria-label': task.starred ? 'Unstar' : 'Star',
        'aria-pressed': String(task.starred),
        onclick: () => this.updateTask(task, { starred: !task.starred }),
      }, task.starred ? '★' : '☆'));
    return editing ? h('div', { class: 'task-wrap' }, row, this.editor(task)) : row;
  }

  editor(task) {
    const save = (patch) => this.updateTask(task, patch, true);
    const title = h('input', { class: 'task-edit-title', value: task.title, 'aria-label': 'Title' });
    title.addEventListener('change', () => title.value.trim() && save({ title: title.value.trim() }));
    const details = h('textarea', { class: 'task-edit-details', rows: '3', placeholder: 'Details', 'aria-label': 'Details' });
    details.value = task.details.join('\n');
    details.addEventListener('change', () => save({ details: details.value.split('\n').map((l) => l.trim()).filter(Boolean) }));
    const date = h('input', { type: 'date', class: 'task-edit-date', value: task.due || '', 'aria-label': 'Due date' });
    date.addEventListener('change', () => save({ due: date.value || null, time: date.value ? task.time : null }));
    const time = h('input', { type: 'time', class: 'task-edit-date', value: task.time || '', 'aria-label': 'Time', disabled: !task.due });
    time.addEventListener('change', () => save({ time: time.value || null }));

    const subtasks = h('div', { class: 'task-subs' },
      task.subtasks.map((sub, i) => {
        const input = h('input', { class: 'task-sub-title', value: sub.title, 'aria-label': 'Subtask' });
        input.addEventListener('change', () => {
          const list = task.subtasks.map((s, j) => (j === i ? { ...s, title: input.value } : s)).filter((s) => s.title.trim());
          save({ subtasks: list });
        });
        return h('div', { class: 'task-sub' },
          h('button', {
            class: `task-check is-small${sub.done ? ' is-done' : ''}`,
            role: 'checkbox',
            'aria-checked': String(sub.done),
            'aria-label': 'Subtask done',
            onclick: () => save({ subtasks: task.subtasks.map((s, j) => (j === i ? { ...s, done: !s.done, doneOn: s.done ? null : todayKey() } : s)) }),
          }, sub.done ? '✓' : ''),
          input);
      }));
    const addSub = h('input', { class: 'task-sub-title task-sub-new', placeholder: '+ Add a subtask', 'aria-label': 'Add a subtask' });
    addSub.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && addSub.value.trim()) save({ subtasks: [...task.subtasks, { title: addSub.value.trim(), done: false }] });
    });

    return h('div', { class: 'task-editor' },
      title,
      details,
      h('div', { class: 'task-edit-row' },
        h('span', { class: 'mono-label' }, 'Due'),
        date,
        time,
        task.due ? h('button', { class: 'task-col-btn', onclick: () => save({ due: null, time: null }) }, 'Clear') : null),
      h('span', { class: 'mono-label' }, 'Subtasks'),
      subtasks,
      addSub,
      h('div', { class: 'task-edit-row' },
        h('button', { class: 'task-col-btn is-primary', onclick: () => { this.editing = null; this.render(); } }, 'Done'),
        h('span', { class: 'grow' }),
        h('button', { class: 'task-col-btn is-danger', onclick: () => { this.editing = null; this.change(task.list, (text) => replaceTask(text, task, null)); } }, 'Delete task')));
  }

  focusEditor() {
    const input = this.root.querySelector('.task-edit-title');
    if (input && !this.root.contains(document.activeElement)) input.focus();
  }

  // ---------- Lists ----------

  async newList() {
    const name = await askName('New list', 'List name');
    if (!name) return;
    await this.io.writeList(name, `# ${name}\n`);
    this.hidden.delete(name);
    this.savePrefs();
    await this.load();
  }

  async renameList(name) {
    const next = await askName(`Rename “${name}”`, 'New name', name);
    if (!next || next === name) return;
    try {
      await this.io.renameList(name, next);
    } catch (err) {
      alert(err.message);
    }
    await this.load();
  }

  async deleteList(name) {
    const count = this.lists[name].tasks.length;
    if (!window.confirm(`Delete “${name}”${count ? ` and its ${count} task${count === 1 ? '' : 's'}` : ''}?\n\nIts note goes to the Mac's Trash, so you can get it back from there.`)) return;
    await this.io.deleteList(name);
    await this.load();
  }
}
