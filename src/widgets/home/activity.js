// Works out what happened in the vault over a period (week, month, year)
// from things Opal already knows: each file's created and last-changed dates,
// the events in the calendar's day notes, and Opal's own records in
// .opal/logbook.md (words written each day, prep-timer sessions).

import { dayKey, addDays, startOfWeek, parseEvents, keyToDate, parseSeries, occurrences, REPEATS_PATH } from '../../fidgets/calendar/events.js';
import { kindOf } from '../../file-types.js';
import { parseTasks } from '../../fidgets/tasks/tasks.js';

// [start, end) of the period that contains `date`.
export function periodRange(kind, date) {
  if (kind === 'week') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 7) };
  }
  if (kind === 'month') {
    return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 1) };
  }
  return { start: new Date(date.getFullYear(), 0, 1), end: new Date(date.getFullYear() + 1, 0, 1) };
}

export function shiftPeriod(kind, date, steps) {
  if (kind === 'week') return addDays(date, 7 * steps);
  if (kind === 'month') return new Date(date.getFullYear(), date.getMonth() + steps, 1);
  return new Date(date.getFullYear() + steps, 0, 1);
}

export function daysIn(range) {
  const keys = [];
  for (let d = new Date(range.start); d < range.end; d = addDays(d, 1)) keys.push(dayKey(d));
  return keys;
}

const inRange = (ms, range) => ms >= range.start.getTime() && ms < range.end.getTime();
const topFolder = (path) => (path.includes('/') ? path.split('/')[0] : 'Vault root');

// files: every file node in the vault. eventsByDay: { 'YYYY-MM-DD': [events] }.
// tasksByDay: { 'YYYY-MM-DD': [tasks finished that day] }.
// records: { words: { 'YYYY-MM-DD': n }, sessions: [{ day, time, minutes, note }] }.
export function summarise(files, eventsByDay, range, tasksByDay = {}, records = { words: {}, sessions: [] }) {
  const perDay = {};
  const ensure = (key) => {
    if (!perDay[key]) perDay[key] = { created: [], edited: [], added: [], events: [], tasks: [], words: 0, sessions: [] };
    return perDay[key];
  };
  const folders = {};

  for (const file of files) {
    const isNote = kindOf(file.path) === 'note';
    const isDayNote = /^Calendar\/\d{4}-\d{2}-\d{2}\.md$/i.test(file.path);
    if (file.created && inRange(file.created, range)) {
      const day = ensure(dayKey(new Date(file.created)));
      if (isNote) day.created.push(file);
      else day.added.push(file);
      if (!isDayNote) folders[topFolder(file.path)] = (folders[topFolder(file.path)] || 0) + 1;
    }
    // "Edited" = last changed in the period, and not just its creation.
    if (isNote && file.modified && inRange(file.modified, range)
        && !(file.created && dayKey(new Date(file.created)) === dayKey(new Date(file.modified)))) {
      ensure(dayKey(new Date(file.modified))).edited.push(file);
      if (!isDayNote) folders[topFolder(file.path)] = (folders[topFolder(file.path)] || 0) + 1;
    }
  }
  for (const [key, events] of Object.entries(eventsByDay)) {
    if (inRange(keyToDate(key).getTime(), range) && events.length) ensure(key).events.push(...events);
  }
  for (const [key, tasks] of Object.entries(tasksByDay)) {
    if (inRange(keyToDate(key).getTime(), range) && tasks.length) ensure(key).tasks.push(...tasks);
  }

  for (const [key, words] of Object.entries(records.words || {})) {
    if (words > 0 && inRange(keyToDate(key).getTime(), range)) ensure(key).words += words;
  }
  for (const session of records.sessions || []) {
    if (inRange(keyToDate(session.day).getTime(), range)) ensure(session.day).sessions.push(session);
  }

  const totals = { created: 0, edited: 0, events: 0, added: 0, tasks: 0, words: 0, prep: 0 };
  for (const day of Object.values(perDay)) {
    totals.words += day.words;
    totals.prep += day.sessions.reduce((n, s) => n + s.minutes, 0);
    totals.created += day.created.length;
    totals.edited += day.edited.length;
    totals.events += day.events.length;
    totals.added += day.added.length;
    totals.tasks += day.tasks.length;
  }
  return { perDay, totals, folders };
}

export function dayScore(day) {
  // Writing counts too: a note's worth of activity per 250 words written.
  return day ? day.created.length + day.edited.length + day.added.length + day.events.length + day.tasks.length
    + Math.ceil((day.words || 0) / 250) + (day.sessions ? day.sessions.length : 0) : 0;
}

// Tasks (and subtasks) finished in a range, by the day they were done (✅ date).
export async function loadTasksDone(files, range, readFile) {
  const out = {};
  const lists = files.filter((f) => /^Tasks\/[^/]+\.md$/i.test(f.path));
  await Promise.all(lists.map(async (f) => {
    let text = '';
    try {
      text = await readFile(f.path);
    } catch {
      return;
    }
    const list = f.path.slice(6, -3);
    for (const task of parseTasks(text, list)) {
      for (const t of [task, ...task.subtasks.map((s) => ({ ...s, list }))]) {
        if (t.done && t.doneOn && inRange(keyToDate(t.doneOn).getTime(), range)) {
          (out[t.doneOn] = out[t.doneOn] || []).push({ title: t.title, list });
        }
      }
    }
  }));
  return out;
}

// Reads the calendar day notes that fall in a range.
export async function loadEvents(files, range, readFile) {
  const out = {};
  const dayNotes = files.filter((f) => {
    const match = /^Calendar\/(\d{4}-\d{2}-\d{2})\.md$/i.exec(f.path);
    return match && inRange(keyToDate(match[1]).getTime(), range);
  });
  await Promise.all(dayNotes.map(async (f) => {
    const key = f.path.slice(9, 19);
    try {
      out[key] = parseEvents(await readFile(f.path), key);
    } catch {
      out[key] = [];
    }
  }));
  // Repeating events count on each day they land on.
  if (files.some((f) => f.path.toLowerCase() === REPEATS_PATH.toLowerCase())) {
    let series = [];
    try {
      series = parseSeries(await readFile(REPEATS_PATH));
    } catch {
      // No repeats this time.
    }
    if (series.length) {
      for (const key of daysIn(range)) {
        const found = occurrences(series, key);
        if (found.length) out[key] = [...(out[key] || []), ...found];
      }
    }
  }
  return out;
}
