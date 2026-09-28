// Task lists live in Tasks/<List name>.md, written the way Obsidian's Tasks
// plugin reads them:
//
//   - [ ] Buy pens 📅 2026-10-02 ⏰ 15:00 ⭐
//       Get the 0.5 mm ones            ← details (indented text)
//       - [ ] Check the drawer first   ← subtask (indented checkbox)
//   - [x] Return library books ✅ 2026-09-27
//
// 📅 due date, ⏰ time, ⭐ starred, ➕ date it was added, ✅ date it was done, 🔁 repeat (e.g.
// "🔁 every week" — ticking it off adds the next one, as Obsidian Tasks does).
// Anything else in the note (headings, text) is left alone.

import { RULE_TEXT, normaliseRule, nextDate } from '../calendar/repeat.js';

export const TASKS_FOLDER = 'Tasks';
export const DEFAULT_LIST = 'My Tasks';

const TASK_LINE = /^(\s*)[-*+]\s\[([ xX])\]\s?(.*)$/;
const DUE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/;
const TIME = /\s*⏰\s*(\d{1,2}:\d{2})(?:\s*[–-]\s*(\d{1,2}:\d{2}))?/;
const DONE_ON = /\s*✅\s*(\d{4}-\d{2}-\d{2})/;
const PRIMARY = /\s*#color\/([a-z]+)\b/;
const SECONDARY = /\s*#accent\/([a-z]+)\b/;
const CREATED = /\s*➕\s*(\d{4}-\d{2}-\d{2})/;
const STAR = /\s*⭐️?/;
const REPEAT = new RegExp(`\\s*🔁\\s*${RULE_TEXT.source}`, 'i');

const indentOf = (line) => /^\s*/.exec(line)[0].replace(/\t/g, '    ').length;

function parseLine(body) {
  const due = DUE.exec(body);
  const time = TIME.exec(body);
  const doneOn = DONE_ON.exec(body);
  const repeat = REPEAT.exec(body);
  const created = CREATED.exec(body);
  const primary = PRIMARY.exec(body);
  const secondary = SECONDARY.exec(body);
  return {
    primary: primary ? primary[1] : null, // colours, as for calendar events
    secondary: secondary ? secondary[1] : null,
    created: created ? created[1] : null,
    repeat: repeat ? normaliseRule(repeat[1]) : null,
    due: due ? due[1] : null,
    time: time ? time[1].padStart(5, '0') : null,
    endTime: time && time[2] ? time[2].padStart(5, '0') : null, // ⏰ 09:00–10:30
    doneOn: doneOn ? doneOn[1] : null,
    starred: STAR.test(body),
    title: body.replace(PRIMARY, '').replace(SECONDARY, '').replace(CREATED, '').replace(REPEAT, '').replace(DUE, '').replace(TIME, '').replace(DONE_ON, '').replace(new RegExp(STAR.source, 'g'), '').trim(),
  };
}

// All top-level tasks in one list note, each with its details and subtasks.
export function parseTasks(text, list) {
  const lines = text.split(/\r?\n/);
  const tasks = [];
  let i = 0;
  while (i < lines.length) {
    const match = TASK_LINE.exec(lines[i]);
    if (!match || indentOf(lines[i]) > 1) {
      i++;
      continue;
    }
    const start = i;
    const base = indentOf(lines[i]);
    const task = {
      list,
      line: start,
      raw: lines[i],
      done: match[2].toLowerCase() === 'x',
      ...parseLine(match[3]),
      details: [],
      subtasks: [],
    };
    i++;
    // Everything indented further belongs to this task.
    while (i < lines.length && (indentOf(lines[i]) > base || (!lines[i].trim() && i + 1 < lines.length && indentOf(lines[i + 1]) > base && lines[i + 1].trim()))) {
      const sub = TASK_LINE.exec(lines[i]);
      if (sub) task.subtasks.push({ done: sub[2].toLowerCase() === 'x', ...parseLine(sub[3]) });
      else if (lines[i].trim()) task.details.push(lines[i].trim());
      i++;
    }
    task.end = i; // one past the task's last line
    tasks.push(task);
  }
  return tasks;
}

function formatHead(task, indent = '') {
  const parts = [`${indent}- [${task.done ? 'x' : ' '}] ${task.title.trim()}`];
  if (task.primary) parts.push(`#color/${task.primary}`);
  if (task.secondary) parts.push(`#accent/${task.secondary}`);
  if (task.repeat) parts.push(`🔁 ${task.repeat}`);
  if (task.due) parts.push(`📅 ${task.due}`);
  if (task.due && task.time) parts.push(`⏰ ${task.time}${task.endTime ? `–${task.endTime}` : ''}`);
  if (task.starred) parts.push('⭐');
  if (task.created) parts.push(`➕ ${task.created}`);
  if (task.done && task.doneOn) parts.push(`✅ ${task.doneOn}`);
  return parts.join(' ');
}

export function formatTask(task) {
  return [
    formatHead(task),
    ...task.details.filter((d) => d.trim()).map((d) => `    ${d.trim()}`),
    ...task.subtasks.filter((s) => s.title.trim()).map((s) => formatHead({ ...s, due: null, starred: false, repeat: null, primary: null, secondary: null }, '    ')),
  ];
}

function split(text) {
  return { lines: text.split(/\r?\n/), nl: /\r\n/.test(text) ? '\r\n' : '\n' };
}

// Finds a task's lines again (where it was, or where its first line is now).
function locate(lines, task) {
  if (lines[task.line] === task.raw) return task.line;
  const index = lines.indexOf(task.raw);
  if (index === -1) throw new Error('That task was changed somewhere else. The list has been refreshed — try again.');
  return index;
}

function blockEnd(lines, start) {
  const base = indentOf(lines[start]);
  let i = start + 1;
  while (i < lines.length && (indentOf(lines[i]) > base || (!lines[i].trim() && i + 1 < lines.length && indentOf(lines[i + 1]) > base && lines[i + 1].trim()))) i++;
  return i;
}

// Replaces a task's lines with `next` (a task), or removes them (null).
export function replaceTask(text, task, next) {
  const { lines, nl } = split(text);
  const start = locate(lines, task);
  const end = blockEnd(lines, start);
  lines.splice(start, end - start, ...(next ? formatTask(next) : []));
  return lines.join(nl);
}

// Ticks a task off (or back on). A repeating task gets its next copy, due
// on the next date, added just above the finished one.
export function toggleTask(text, task, today = todayKey()) {
  if (task.done || !task.repeat) {
    const done = !task.done;
    return replaceTask(text, task, { ...task, done, doneOn: done ? today : null });
  }
  const { lines, nl } = split(text);
  const start = locate(lines, task);
  const end = blockEnd(lines, start);
  const next = {
    ...task,
    due: nextDate(task.repeat, task.due || today),
    subtasks: task.subtasks.map((s) => ({ ...s, done: false, doneOn: null })),
  };
  const finished = { ...task, done: true, doneOn: today, repeat: null };
  lines.splice(start, end - start, ...formatTask(next), ...formatTask(finished));
  return lines.join(nl);
}

// Takes a task out of its list: returns the list without it and its lines.
export function takeTask(text, task) {
  const { lines, nl } = split(text);
  const start = locate(lines, task);
  const end = blockEnd(lines, start);
  const block = lines.splice(start, end - start);
  return { text: lines.join(nl), block };
}

// Puts a task's lines back in a list: before (or after) another task, found
// by its first line, or at the top when there's no such task.
export function placeTask(text, block, where, listName) {
  const { lines, nl } = split(text);
  const target = where ? lines.findIndex((l) => l === where.raw && TASK_LINE.test(l) && indentOf(l) <= 1) : -1;
  if (target === -1) {
    const task = { title: '', details: [], subtasks: [] };
    // Reuse addTask's rules for where "the top" is, then swap in the real lines.
    const marker = '\u0000opal-move\u0000';
    return addTask(text, { ...task, title: marker }, listName)
      .split(/\r?\n/)
      .flatMap((l) => (l.includes(marker) ? block : [l]))
      .join(nl);
  }
  const at = where.after ? blockEnd(lines, target) : target;
  lines.splice(at, 0, ...block);
  return lines.join(nl);
}

// Moves a task within one list.
export function moveTask(text, task, where) {
  const taken = takeTask(text, task);
  return placeTask(taken.text, taken.block, where, task.list);
}

// Adds a new task at the top of the list (after the title), like Google Tasks.
export function addTask(text, task, listName) {
  const block = formatTask(task);
  if (!text.trim()) return `# ${listName}\n\n${block.join('\n')}\n`;
  const { lines, nl } = split(text);
  const firstTask = lines.findIndex((l) => TASK_LINE.test(l) && indentOf(l) <= 1);
  if (firstTask !== -1) {
    lines.splice(firstTask, 0, ...block);
  } else {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', ...block, '');
  }
  return lines.join(nl);
}

export function todayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "Today", "Tomorrow", "Yesterday", "Fri 2 Oct", "2 Oct 2027"
export function dueLabel(due, time, endTime) {
  if (!due) return '';
  const [y, m, d] = due.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const days = Math.round((date - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  let label;
  if (days === 0) label = 'Today';
  else if (days === 1) label = 'Tomorrow';
  else if (days === -1) label = 'Yesterday';
  else if (days > 1 && days < 7) label = date.toLocaleDateString(undefined, { weekday: 'short' });
  else label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(y !== today.getFullYear() ? { year: 'numeric' } : {}) });
  return time ? `${label}, ${time}${endTime ? `–${endTime}` : ''}` : label;
}

export function isOverdue(task) {
  return !task.done && task.due && task.due < todayKey();
}
