// Reminders: while Opal is open, looks at the next day and a half of events
// (🔔 on the event's line) and timed tasks (⏰), and shows a Mac notification
// when each one is due. Nothing is stored — it's all worked out from the notes.

import { dayKey, addDays, dayPath, parseEvents, parseSeries, occurrences, clock, REPEATS_PATH, ALL_DAY_REMIND_AT, keyToDate } from './events.js';
import { parseTasks, TASKS_FOLDER } from '../tasks/tasks.js';

const LOOK_AHEAD = 36 * 60 * 60 * 1000;
const RESCAN = 15 * 60 * 1000; // also catches midnight rolling over
const GRACE = 60 * 1000; // a reminder due in the last minute still shows

function before(minutes) {
  if (!minutes) return 'Starting now';
  if (minutes % 1440 === 0) return minutes === 1440 ? 'Tomorrow' : `In ${minutes / 1440} days`;
  if (minutes % 60 === 0) return `In ${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  return `In ${minutes} minutes`;
}

export class Reminders {
  // readFile(path) → text (throws if missing); listFiles() → file nodes; notify(payload)
  constructor({ readFile, listFiles, notify }) {
    this.io = { readFile, listFiles, notify };
    this.timers = [];
    this.fired = new Set();
    this.pending = null;
    this.interval = setInterval(() => this.refresh(), RESCAN);
  }

  stop() {
    clearInterval(this.interval);
    this.clearTimers();
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  // Called whenever notes change; bunches bursts of changes together.
  refresh() {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.scan().catch(() => {}), 400);
  }

  async read(path) {
    try {
      return await this.io.readFile(path);
    } catch {
      return '';
    }
  }

  async upcoming(now = Date.now()) {
    const files = this.io.listFiles();
    const has = (path) => files.some((f) => f.path.toLowerCase() === path.toLowerCase());
    const today = new Date(now);
    // Two days ahead too, for "1 day before" reminders.
    const keys = [0, 1, 2].map((i) => dayKey(addDays(today, i)));
    const series = has(REPEATS_PATH) ? parseSeries(await this.read(REPEATS_PATH)) : [];
    const items = [];

    for (const key of keys) {
      const own = has(dayPath(key)) ? parseEvents(await this.read(dayPath(key)), key) : [];
      for (const event of [...own, ...occurrences(series, key)]) {
        if (event.remind == null) continue;
        const startsAt = keyToDate(key).getTime() + (event.allDay ? ALL_DAY_REMIND_AT : event.start) * 60000;
        items.push({
          id: `event|${key}|${event.raw}|${event.remind}`,
          at: startsAt - event.remind * 60000,
          title: event.title,
          body: `${before(event.remind)} · ${event.allDay ? 'all day' : `${clock(event.start)}–${clock(event.end)}`}`,
          day: key,
        });
      }
    }

    const lists = files.filter((f) => new RegExp(`^${TASKS_FOLDER}/[^/]+\\.md$`, 'i').test(f.path));
    for (const file of lists) {
      const list = file.path.slice(TASKS_FOLDER.length + 1, -3);
      for (const task of parseTasks(await this.read(file.path), list)) {
        if (task.done || !task.due || !task.time || !keys.includes(task.due)) continue;
        const [hh, mm] = task.time.split(':').map(Number);
        items.push({
          id: `task|${list}|${task.title}|${task.due}|${task.time}`,
          at: keyToDate(task.due).getTime() + (hh * 60 + mm) * 60000,
          title: task.title,
          body: `Task due ${task.time} · ${list}`,
          open: 'tasks',
        });
      }
    }
    return items.filter((i) => i.at > now - GRACE && i.at < now + LOOK_AHEAD);
  }

  async scan() {
    const items = await this.upcoming();
    this.clearTimers();
    const now = Date.now();
    for (const item of items) {
      if (this.fired.has(item.id)) continue;
      this.timers.push(setTimeout(() => this.fire(item), Math.max(0, item.at - now)));
    }
  }

  fire(item) {
    if (this.fired.has(item.id)) return;
    this.fired.add(item.id);
    this.io.notify({ title: item.title, body: item.body, day: item.day, open: item.open });
  }
}
