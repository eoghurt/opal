// Works out what happened in the vault over a period (week, month, year)
// from things Opal already knows: each file's created and last-changed dates,
// and the events in the calendar's day notes. Nothing extra is stored.

import { dayKey, addDays, startOfWeek, parseEvents, keyToDate } from '../calendar/events.js';
import { kindOf } from '../file-types.js';

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
export function summarise(files, eventsByDay, range) {
  const perDay = {};
  const ensure = (key) => {
    if (!perDay[key]) perDay[key] = { created: [], edited: [], added: [], events: [] };
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

  const totals = { created: 0, edited: 0, events: 0, added: 0 };
  for (const day of Object.values(perDay)) {
    totals.created += day.created.length;
    totals.edited += day.edited.length;
    totals.events += day.events.length;
    totals.added += day.added.length;
  }
  return { perDay, totals, folders };
}

export function dayScore(day) {
  return day ? day.created.length + day.edited.length + day.added.length + day.events.length : 0;
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
  return out;
}
